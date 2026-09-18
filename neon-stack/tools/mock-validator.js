#!/usr/bin/env node
'use strict';
/**
 * mock-validator.js - DEV/TEST ONLY. Never deploy this.
 *
 * A stand-in for server/validator that skips the Google call and signs whatever
 * it is asked to sign. It exists so the *client* half of the purchase chain can
 * be tested end to end (request -> signature -> entitlement) without a service
 * account and without spending money.
 *
 * Usage:
 *   node tools/mock-validator.js [--port 8790] [--approve true|false]
 *
 * It prints the public key to paste into www/js/config.js.
 */
const http = require('http');
const { sign, publicKeyBase64Url } = require('../server/validator/sign');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const PORT = Number(arg('port', 8790));
const APPROVE = arg('approve', 'true') !== 'false';
const APP_ID = arg('appId', 'com.yourstudio.neonstack');
// --unsigned simulates a hostile proxy that simply claims success without a
// signature. The client must refuse it.
const UNSIGNED = args.includes('--unsigned');
// --bad-nonce simulates a replayed response from an earlier request.
const BAD_NONCE = args.includes('--bad-nonce');

const server = http.createServer((req, res) => {
  // CORS so the game can be tested from a normal browser tab as well as a WebView.
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, headers));
    res.end(JSON.stringify({ ok: true, mock: true, approve: APPROVE, publicKey: publicKeyBase64Url() }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/verify') {
    res.writeHead(404, headers).end('{}');
    return;
  }

  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw); } catch (e) { body = {}; }

    // Honour the same rules the real service does, so the client sees realistic
    // failures when the nonce is missing or the app id is wrong.
    if (!body.nonce) {
      res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, headers));
      res.end(JSON.stringify({ ok: false, reason: 'missing-nonce' }));
      return;
    }
    if (body.appId !== APP_ID) {
      res.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, headers));
      res.end(JSON.stringify({ ok: false, reason: 'app-mismatch' }));
      return;
    }
    if (!APPROVE) {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, headers));
      res.end(JSON.stringify({ ok: false, reason: 'mock-rejected' }));
      return;
    }

    const payload = Buffer.from(JSON.stringify({
      appId: APP_ID,
      nonce: BAD_NONCE ? 'replayed-nonce' : body.nonce,
      productId: body.productId,
      kind: (body.productId || '').startsWith('coins_') ? 'consumable' : 'nonconsumable',
      ok: true,
      issuedAt: Date.now(),
      mock: true,
    })).toString('base64url');

    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, headers));
    if (UNSIGNED) {
      // No payload, no signature: exactly what a naive attacker would return.
      res.end(JSON.stringify({ ok: true, productId: body.productId }));
      return;
    }
    res.end(JSON.stringify({ payload, signature: sign(payload) }));
  });
});

server.listen(PORT, () => {
  console.log(`[mock-validator] http://localhost:${PORT}/verify  (approve=${APPROVE})`);
  console.log('[mock-validator] paste this into www/js/config.js -> validator.publicKey:');
  console.log('\n' + publicKeyBase64Url() + '\n');
});
