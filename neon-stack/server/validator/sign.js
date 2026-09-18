'use strict';
/**
 * sign.js - Ed25519 verdict signing.
 *
 * The private key never leaves the server. The matching public key is pasted
 * into www/js/config.js so the client can tell a real verdict from a forged one
 * (a hostile proxy cannot mint a signature it does not have the key for).
 *
 * Generate a keypair:
 *   node server/validator/sign.js --generate
 */
const crypto = require('crypto');

let keypair = null;

function loadKeypair() {
  if (keypair) return keypair;

  const raw = (process.env.SIGNING_KEY || '').trim();
  if (raw) {
    try {
      const der = raw.includes('-----BEGIN')
        ? raw
        : Buffer.from(raw, 'base64');
      const privateKey = crypto.createPrivateKey(
        typeof der === 'string' ? { key: der, format: 'pem', type: 'pkcs8' } : { key: der, format: 'der', type: 'pkcs8' }
      );
      keypair = { privateKey, publicKey: crypto.createPublicKey(privateKey) };
      return keypair;
    } catch (e) {
      throw new Error('SIGNING_KEY is set but could not be parsed: ' + e.message);
    }
  }

  // Ephemeral: fine for local testing, useless in production because the public
  // key changes on every restart.
  keypair = crypto.generateKeyPairSync('ed25519');
  return keypair;
}

/** Signs the ASCII bytes of `payload`; returns a base64url signature. */
function sign(payload) {
  const { privateKey } = loadKeypair();
  return crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64url');
}

/** The 32-byte raw public key, base64url - this is what goes in config.js. */
function publicKeyBase64Url() {
  const { publicKey } = loadKeypair();
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 32).toString('base64url');
}

/** The private key as base64 PKCS8 DER, for the SIGNING_KEY env var. */
function privateKeyBase64() {
  const { privateKey } = loadKeypair();
  return privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
}

function verify(payload, signatureBase64url, publicKeyRaw) {
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),   // Ed25519 SPKI prefix
    Buffer.from(publicKeyRaw, 'base64url'),
  ]);
  const key = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signatureBase64url, 'base64url'));
}

module.exports = { sign, verify, publicKeyBase64Url, privateKeyBase64, loadKeypair };

if (require.main === module) {
  if (process.argv.includes('--generate')) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    console.log('\nAdd to your server environment:\n');
    console.log('SIGNING_KEY=' + privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    console.log('\nPaste into www/js/config.js -> validator.publicKey:\n');
    console.log(der.subarray(der.length - 32).toString('base64url'));
    console.log('');
  } else if (process.argv.includes('--public')) {
    console.log(publicKeyBase64Url());
  } else {
    console.log('usage: node server/validator/sign.js --generate | --public');
  }
}
