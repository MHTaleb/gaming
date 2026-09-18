'use strict';
/**
 * google.js - verify a purchase against the Google Play Developer API.
 *
 * Two details that bite everybody:
 *
 *  1. ACKNOWLEDGE. Play refunds any purchase that is not acknowledged within
 *     three days. Consuming a consumable acknowledges it; one-off products need
 *     an explicit acknowledge call. Skipping this silently refunds your users.
 *
 *  2. CONSUME consumables, or the buyer can never purchase that coin pack again
 *     ("you already own this item").
 *
 * Uses fetch and node:crypto only - no googleapis package, no dependencies.
 */
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let cachedToken = null;   // { token, expiresAt }

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept raw JSON, base64 JSON, or a path to the JSON file.
    if (raw.trim().startsWith('{')) return JSON.parse(raw);
    if (raw.trim().endsWith('.json')) return JSON.parse(require('fs').readFileSync(raw.trim(), 'utf8'));
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT could not be parsed: ' + e.message);
  }
}

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;

  const sa = serviceAccount();
  if (!sa) throw new Error('no-service-account');

  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  const unsigned = base64urlJson({ alg: 'RS256', typ: 'JWT' }) + '.' + base64urlJson(claims);
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const assertion = unsigned + '.' + signature;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error('oauth-' + res.status);
  }
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

async function apiCall(method, url, token) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  return res;
}

/**
 * Returns { ok, reason?, purchaseState?, acknowledged?, consumed? }
 */
async function verifyGooglePurchase({ packageName, productId, purchaseToken, consumable }) {
  const token = await accessToken();
  const base = `${API}/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await apiCall('GET', base, token);
  if (res.status === 404) return { ok: false, reason: 'not-purchased' };
  if (res.status === 401 || res.status === 403) {
    console.error('[google] service account lacks access to the Play account');
    return { ok: false, reason: 'server-not-authorised' };
  }
  if (!res.ok) return { ok: false, reason: 'upstream-' + res.status };

  const purchase = await res.json();

  if (purchase.purchaseState !== 0) {
    // 0 purchased, 1 cancelled, 2 pending
    return { ok: false, reason: purchase.purchaseState === 2 ? 'pending' : 'cancelled' };
  }

  // The product the buyer actually paid for must match what was requested.
  if (purchase.productId && purchase.productId !== productId) {
    return { ok: false, reason: 'product-mismatch' };
  }

  if (consumable) {
    if (purchase.consumptionState !== 1) {
      const consumeRes = await apiCall('POST', base + ':consume', token);
      if (!consumeRes.ok) {
        console.error('[google] consume failed:', consumeRes.status);
        // Verification succeeded; consumption is retried by Play automatically
        // for already-consumed tokens, so this is not fatal.
      }
    }
    return { ok: true, consumed: true };
  }

  if (purchase.acknowledgementState === 0) {
    const ackRes = await apiCall('POST', base + ':acknowledge', token);
    if (!ackRes.ok) {
      console.error('[google] acknowledge failed:', ackRes.status);
      return { ok: false, reason: 'acknowledge-failed' };
    }
  }

  return { ok: true, acknowledged: true };
}

module.exports = { verifyGooglePurchase, accessToken, _resetTokenCache: () => { cachedToken = null; } };
