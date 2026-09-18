#!/usr/bin/env node
/**
 * Packet Defense purchase validator.
 *
 * Why this exists
 * ---------------
 * Everything that runs on a phone can be read and modified by whoever owns the
 * phone. So the client must never be the thing that decides whether a purchase
 * was real. It asks this service, and this service asks Google.
 *
 *   client --(productId + purchaseToken + nonce)--> this service
 *   this service --(OAuth, service account)--> Google Play Developer API
 *   this service --(Ed25519-signed verdict)--> client
 *
 * The client verifies that signature against a public key, so a hostile DNS or
 * proxy cannot simply answer "yes".
 *
 * Zero dependencies on purpose: fewer packages, no supply chain, no npm audit.
 *
 * Run:   node server/validator/index.js
 * Env:   see .env.example
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { verifyGooglePurchase } = require('./google');
const { sign } = require('./sign');

const PORT = Number(process.env.PORT || 8787);
const APP_ID = process.env.APP_ID || 'com.yourstudio.packetdefense';
const PACKAGE_NAME = process.env.PACKAGE_NAME || APP_ID;
const PRODUCTS = (process.env.PRODUCTS || 'remove_ads,coins_small,coins_medium,coins_large')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CONSUMABLE = new Set(
  (process.env.CONSUMABLE_PRODUCTS || 'coins_small,coins_medium,coins_large')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
const MAX_BODY = 8 * 1024;          // bytes; a real request is ~300
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 30);   // per window, per IP
const RATE_WINDOW_MS = 60 * 1000;

/* ------------------------------------------------------------------ *
 * Replay protection
 *
 * A purchase token can only be redeemed once for a consumable, and Google
 * itself refuses resubmits for one-off products, but we also keep an in-memory
 * ledger so a replay of the *same verification request* cannot be used to farm
 * coins by replaying responses.
 * ------------------------------------------------------------------ */
const seenTokens = new Map();      // tokenHash -> timestamp
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 7;

function tokenKey(body) {
  return crypto
    .createHash('sha256')
    .update(`${body.productId}|${body.purchaseToken || body.transactionId || ''}`)
    .digest('hex');
}

function rememberToken(body) {
  const now = Date.now();
  for (const [k, t] of seenTokens) if (now - t > TOKEN_TTL) seenTokens.delete(k);
  const key = tokenKey(body);
  if (seenTokens.has(key)) return false;
  seenTokens.set(key, now);
  return true;
}

/* ------------------------------------------------------------------ *
 * Rate limiting: a simple fixed window per IP. It is here to stop someone
 * brute-forcing tokens, not to be a DDoS shield (put it behind Cloudflare or
 * API Gateway for that).
 * ------------------------------------------------------------------ */
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // The game runs from a WebView, not a page, but do not allow embedding.
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('payload-too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isPlainString(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= (max || 512);
}

/* ------------------------------------------------------------------ *
 * Verdicts are signed so the client can tell a real answer from a forged one.
 * ------------------------------------------------------------------ */
function signedVerdict(body) {
  const payload = Buffer.from(
    JSON.stringify({
      appId: APP_ID,
      nonce: body.nonce,
      productId: body.productId,
      kind: CONSUMABLE.has(body.productId) ? 'consumable' : 'nonconsumable',
      ok: true,
      issuedAt: Date.now(),
    })
  ).toString('base64url');

  return { payload, signature: sign(payload) };
}

/* ------------------------------------------------------------------ *
 * GET /health - used by CI and by uptime checks.
 * ------------------------------------------------------------------ */
function handleHealth(res) {
  send(res, 200, { ok: true, service: 'packet-defense-validator', products: PRODUCTS.length });
}

/* ------------------------------------------------------------------ *
 * POST /verify
 * ------------------------------------------------------------------ */
async function handleVerify(req, res) {
  const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  if (rateLimited(ip)) {
    send(res, 429, { ok: false, reason: 'rate-limited' });
    return;
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    send(res, 413, { ok: false, reason: 'payload-too-large' });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    send(res, 400, { ok: false, reason: 'bad-json' });
    return;
  }

  // --- validate the shape of the request before doing anything expensive ---
  if (!body || typeof body !== 'object') {
    send(res, 400, { ok: false, reason: 'bad-request' });
    return;
  }
  if (body.appId !== APP_ID) {
    send(res, 403, { ok: false, reason: 'app-mismatch' });
    return;
  }
  if (!isPlainString(body.productId, 64) || PRODUCTS.indexOf(body.productId) < 0) {
    send(res, 400, { ok: false, reason: 'unknown-product' });
    return;
  }
  if (!isPlainString(body.nonce, 64)) {
    send(res, 400, { ok: false, reason: 'missing-nonce' });
    return;
  }
  const token = body.purchaseToken || body.transactionId;
  if (!isPlainString(token, 1024)) {
    send(res, 400, { ok: false, reason: 'missing-token' });
    return;
  }
  if (body.platform !== 'android' && body.platform !== 'ios') {
    send(res, 400, { ok: false, reason: 'bad-platform' });
    return;
  }

  if (!rememberToken(body)) {
    send(res, 409, { ok: false, reason: 'already-verified' });
    return;
  }

  // --- the part that actually matters: ask Google ---
  let verdict;
  try {
    verdict = await verifyGooglePurchase({
      packageName: PACKAGE_NAME,
      productId: body.productId,
      purchaseToken: token,
      consumable: CONSUMABLE.has(body.productId),
    });
  } catch (e) {
    // Never leak upstream error detail to a client.
    console.error('[validator] upstream error:', e && e.message);
    send(res, 502, { ok: false, reason: 'upstream-error' });
    return;
  }

  if (!verdict.ok) {
    send(res, 200, { ok: false, reason: verdict.reason || 'not-purchased' });
    return;
  }

  send(res, 200, signedVerdict(body));
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return handleHealth(res);
  if (req.method === 'POST' && req.url === '/verify') return handleVerify(req, res);
  send(res, 404, { ok: false, reason: 'not-found' });
});

server.headersTimeout = 15000;
server.requestTimeout = 20000;

if (require.main === module) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.warn(
      '[validator] GOOGLE_SERVICE_ACCOUNT is not set - every purchase will be rejected.\n' +
      '            See server/validator/README.md to create a service account.'
    );
  }
  if (!process.env.SIGNING_KEY) {
    console.warn(
      '[validator] SIGNING_KEY is not set - generating an ephemeral key.\n' +
      '            The public key will change on restart, which will break the client.'
    );
  }
  server.listen(PORT, () => console.log(`[validator] listening on :${PORT}`));
}

module.exports = { server };
