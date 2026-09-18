/**
 * purchases.js - in-app purchases and entitlements.
 *
 * THE ONE RULE: an entitlement is never trusted from local storage alone.
 *
 *   - The store (Google Play / App Store) is the source of truth. On every
 *     launch we re-query it and rebuild entitlements from what it reports.
 *   - Local storage is only a *cache*, so the game keeps working offline.
 *   - When `validator.url` is set, nothing is granted until the receipt has
 *     been verified against the store's server API (see server/validator/).
 *   - If the native billing plugin is missing on a device, we grant nothing
 *     and surface an error. There is no "assume it worked" path on native.
 *
 * The web/dev backend exists so the whole flow can be exercised in a browser.
 * It is compiled out of the native path on purpose: `isNative()` decides.
 */
(function (global) {
  'use strict';

  var CFG = (global.NeonConfig && global.NeonConfig.store) || {};
  var VCFG = (global.NeonConfig && global.NeonConfig.validator) || {};
  var APP_ID = (global.NeonConfig && global.NeonConfig.appId) || 'com.yourstudio.packetdefense';

  var CACHE_KEY = 'packetdefense.entitlements.v1';
  var PENDING_KEY = 'packetdefense.pending.v1';

  var PRODUCTS = (CFG.products || []).slice();

  var state = {
    ready: false,
    native: false,
    backend: 'none',
    entitlements: {},     // id -> { grantedAt, source, expiresAt }
    prices: {},           // id -> display price
    owned: {},            // id -> true
    error: null,
    lastSync: 0,
  };

  var listeners = [];

  /* ===================== platform detection ===================== */

  function cap() { return global.Capacitor; }

  function isNative() {
    var c = cap();
    if (!c) return false;
    if (typeof c.isNativePlatform === 'function') return c.isNativePlatform();
    return typeof c.getPlatform === 'function' && c.getPlatform() !== 'web';
  }

  function platform() {
    var c = cap();
    if (c && typeof c.getPlatform === 'function') {
      var p = c.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
    return 'web';
  }

  function cdvStore() {
    return (global.CdvPurchase && global.CdvPurchase.store) || null;
  }

  /* ===================== helpers ===================== */

  function now() { return Date.now(); }

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function b64urlToBytes(s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = global.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64urlToString(s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return global.atob(b64);
  }

  function randomNonce() {
    var bytes = new Uint8Array(18);
    var c = global.crypto;
    if (c && c.getRandomValues) c.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = '';
    for (var j = 0; j < bytes.length; j++) out += ('0' + bytes[j].toString(16)).slice(-2);
    return out;
  }

  function productById(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return null;
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snapshot()); } catch (e) { /* listener errors must not break the shop */ }
    }
  }

  /* ===================== entitlement cache ===================== */

  function loadCache() {
    var cached = readJSON(CACHE_KEY, null);
    if (!cached || typeof cached !== 'object') return;
    state.entitlements = cached.entitlements || {};
    state.lastSync = cached.lastSync || 0;
    state.owned = {};
    for (var id in state.entitlements) {
      if (Object.prototype.hasOwnProperty.call(state.entitlements, id)) state.owned[id] = true;
    }
  }

  function saveCache() {
    writeJSON(CACHE_KEY, {
      entitlements: state.entitlements,
      lastSync: state.lastSync,
      // No purchase tokens or order data are cached here - only the fact that
      // an entitlement exists. Nothing sensitive sits in storage.
    });
  }

  function grant(productId, source) {
    var p = productById(productId);
    if (!p) return false;
    state.entitlements[productId] = {
      grantedAt: now(),
      source: source,               // 'store' | 'validator' | 'mock'
      kind: p.kind,
    };
    state.owned[productId] = true;
    saveCache();
    emit();
    return true;
  }

  function revoke(productId) {
    if (!state.entitlements[productId]) return false;
    delete state.entitlements[productId];
    delete state.owned[productId];
    saveCache();
    emit();
    return true;
  }

  function has(productId) {
    return !!state.owned[productId];
  }

  /** The one function ads.js and main.js should ask. */
  function isAdsRemoved() {
    if (!CFG.enabled) return false;
    return has('remove_ads');
  }

  /* ===================== server validation ===================== */

  function validateEndpoint() {
    return (VCFG.url || '').trim();
  }

  function validatorConfigured() {
    return validateEndpoint().length > 0;
  }

  /**
   * Verifies an Ed25519-signed payload from the validator.
   * Falls back to nonce-only when the runtime has no Ed25519 support, and says
   * so in the result rather than pretending it was cryptographically checked.
   */
  async function verifySignedPayload(signed, nonce) {
    if (!signed || !signed.payload || !signed.signature) {
      return { ok: false, reason: 'malformed' };
    }
    var subtle = global.crypto && global.crypto.subtle;
    var pub = (VCFG.publicKey || '').trim();

    var raw;
    try {
      raw = b64urlToString(signed.payload);
    } catch (e) {
      return { ok: false, reason: 'undecodable' };
    }

    var body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return { ok: false, reason: 'unparsable' };
    }

    // Replay protection: the server must echo the nonce we sent.
    if (!body.nonce || body.nonce !== nonce) return { ok: false, reason: 'nonce' };
    if (body.appId && body.appId !== APP_ID) return { ok: false, reason: 'app-mismatch' };

    if (!subtle || !pub) {
      return { ok: false, reason: 'unsigned-transport', body: body };
    }

    try {
      var key = await subtle.importKey('raw', b64urlToBytes(pub), { name: 'Ed25519' }, false, ['verify']);
      var good = await subtle.verify(
        { name: 'Ed25519' },
        key,
        b64urlToBytes(signed.signature),
        new TextEncoder().encode(signed.payload)
      );
      if (!good) return { ok: false, reason: 'bad-signature' };
      return { ok: true, body: body };
    } catch (e) {
      // Ed25519 not available in this WebView.
      return { ok: false, reason: 'unsupported-algorithm', body: body };
    }
  }

  function postJSON(url, body, timeoutMs) {
    return new Promise(function (resolve) {
      var xhr = new global.XMLHttpRequest();
      var done = false;
      var timer = global.setTimeout(function () {
        if (done) return;
        done = true;
        try { xhr.abort(); } catch (e) { /* ignore */ }
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs || 8000);

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || done) return;
        done = true;
        global.clearTimeout(timer);
        if (xhr.status !== 200) {
          resolve({ ok: false, reason: 'http-' + xhr.status });
          return;
        }
        var parsed = null;
        try { parsed = JSON.parse(xhr.responseText); } catch (e) { parsed = null; }
        resolve({ ok: true, body: parsed });
      };
      xhr.onerror = function () {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        resolve({ ok: false, reason: 'network' });
      };
      try {
        xhr.send(JSON.stringify(body));
      } catch (e) {
        if (!done) { done = true; global.clearTimeout(timer); resolve({ ok: false, reason: 'send' }); }
      }
    });
  }

  /**
   * Asks the validator to confirm a purchase against the store's server API.
   * Returns { ok, entitlement } - ok is false unless the response is signed by
   * the key in config.js and carries the nonce we generated.
   */
  async function validateWithServer(receipt) {
    var url = validateEndpoint();
    if (!url) {
      // Not configured. Honest answer: whatever the local store said is all we
      // have, which is why `required` exists.
      return { ok: !VCFG.required, source: 'store', unverified: true };
    }

    var nonce = randomNonce();
    var res = await postJSON(url, {
      appId: APP_ID,
      platform: platform(),
      productId: receipt.productId,
      purchaseToken: receipt.purchaseToken || receipt.transactionId || '',
      transactionId: receipt.transactionId || '',
      nonce: nonce,
    }, VCFG.timeoutMs);

    if (!res.ok) return { ok: false, reason: res.reason };

    // A plain "no" from the validator is not an attack, it just is not a
    // purchase. Report it as a rejection rather than a malformed reply.
    if (res.body && res.body.ok === false && !res.body.payload) {
      return { ok: false, reason: res.body.reason || 'rejected' };
    }

    var verified = await verifySignedPayload(res.body, nonce);
    if (!verified.ok) {
      // A signed-but-unverifiable response is only acceptable in the specific
      // case of a WebView without Ed25519. Anything else is treated as hostile.
      if (verified.reason === 'unsupported-algorithm' && verified.body && verified.body.ok === true) {
        return { ok: !VCFG.required, source: 'server-nonce-only', unverified: true };
      }
      return { ok: false, reason: verified.reason };
    }

    if (verified.body.ok !== true) {
      return { ok: false, reason: verified.body.reason || 'rejected' };
    }
    if (verified.body.productId && verified.body.productId !== receipt.productId) {
      return { ok: false, reason: 'product-mismatch' };
    }

    return { ok: true, source: 'server-verified' };
  }

  /* ===================== pending (offline) transactions ===================== */

  function queuePending(receipt) {
    var list = readJSON(PENDING_KEY, []) || [];
    // Keep only what is needed to re-verify later; never the whole order blob.
    list.push({
      productId: receipt.productId,
      purchaseToken: receipt.purchaseToken || '',
      transactionId: receipt.transactionId || '',
      at: now(),
    });
    writeJSON(PENDING_KEY, list.slice(-20));
  }

  function drainPending() {
    var list = readJSON(PENDING_KEY, []) || [];
    if (!list.length) return Promise.resolve(0);
    var kept = [];
    var granted = 0;
    var chain = Promise.resolve();
    list.forEach(function (item) {
      chain = chain.then(async function () {
        var result = await validateWithServer(item);
        if (result.ok) {
          if (deliver(item.productId, result.source)) granted++;
        } else {
          kept.push(item);
        }
      });
    });
    return chain.then(function () {
      writeJSON(PENDING_KEY, kept);
      return granted;
    });
  }

  /** Applies a validated purchase to the local entitlement state. */
  function deliver(productId, source) {
    var p = productById(productId);
    if (!p) return false;
    if (p.kind === 'nonconsumable') return grant(productId, source);
    // Consumables give coins every time; they are never "owned".
    if (p.coins) {
      if (global.Profile) global.Profile.addCoins(p.coins);
      emit();
      return true;
    }
    return false;
  }

  /* ===================== native backend (Capacitor + Billing) ===================== */

  /**
   * Best-effort hunt for the platform purchase token of an owned product.
   * CdvPurchase normalises receipts per platform, and the token's home differs
   * between them, so this checks the shapes it can and gives up quietly.
   */
  function tokenFor(store, productId) {
    try {
      var receipts = store.localReceipts || [];
      for (var i = 0; i < receipts.length; i++) {
        var r = receipts[i];
        var nat = r.nativePurchase || {};
        var txs = r.transactions || [];
        for (var j = 0; j < txs.length; j++) {
          var t = txs[j];
          var prods = t.products || [];
          for (var k = 0; k < prods.length; k++) {
            if (prods[k].id !== productId) continue;
            return t.purchaseToken
              || nat.purchaseToken
              || nat.token
              || t.transactionId
              || '';
          }
        }
      }
    } catch (e) { /* shape changed: no token is better than a wrong one */ }
    return '';
  }

  function nativeBackend() {
    var store = cdvStore();
    if (!store) return null;
    var Cdv = global.CdvPurchase;

    function priceOf(product) {
      try {
        var p = store.get(product.id);
        if (!p) return null;
        var offer = p.getOffer && p.getOffer();
        if (!offer) return null;
        if (typeof offer.pricingPrice === 'string') return offer.pricingPrice;
        if (offer.pricingPrice != null) return String(offer.pricingPrice);
        return null;
      } catch (e) {
        return null;
      }
    }

    return {
      id: 'capacitor',
      init: async function () {
        var types = {};
        PRODUCTS.forEach(function (p) {
          types[p.id] = p.kind === 'consumable'
            ? (Cdv.ProductType && Cdv.ProductType.CONSUMABLE)
            : (Cdv.ProductType && Cdv.ProductType.NON_CONSUMABLE);
        });

        // One platform value for both registration and initialisation.
        //
        // The registration used to be hardcoded to GOOGLE_PLAY while
        // store.initialize() picked APPLE_APPSTORE on iOS, so on an iPhone the
        // products were registered against a store that would never be queried
        // and the shop could not resolve a single price. Deriving both from the
        // same value is what stops the two drifting apart again.
        var storePlatform = Cdv.Platform
          ? (platform() === 'ios' ? Cdv.Platform.APPLE_APPSTORE : Cdv.Platform.GOOGLE_PLAY)
          : undefined;

        store.register(PRODUCTS.map(function (p) {
          return {
            id: p.id,
            type: types[p.id] || 'non consumable',
            platform: storePlatform,
          };
        }));

        // Every approved transaction goes through validation before it is
        // finished. An unfinished transaction is retried by the store, so a
        // network blip can never lose a real purchase.
        store.when().approved(async function (tx) {
          var productId = tx && tx.products && tx.products[0] ? tx.products[0].id : (tx.productId || '');
          var receipt = {
            productId: productId,
            purchaseToken: (tx && (tx.purchaseToken || tx.transactionId)) || '',
            transactionId: (tx && tx.transactionId) || '',
          };
          var result = await validateWithServer(receipt);
          if (result.ok) {
            deliver(productId, result.source);
            try { tx.finish(); } catch (e) { /* ignore */ }
          } else {
            queuePending(receipt);
          }
        });

        var platforms = storePlatform ? [storePlatform] : undefined;
        await store.initialize(platforms);

        PRODUCTS.forEach(function (p) {
          var price = priceOf(p);
          if (price) state.prices[p.id] = price;
        });
        return true;
      },
      buy: function (productId) {
        return new Promise(async function (resolve) {
          try {
            var product = store.get(productId);
            if (!product) {
              resolve({ ok: false, error: 'product-unavailable' });
              return;
            }
            var offer = product.getOffer && product.getOffer();
            var err = offer ? await store.order(offer) : await store.order(product);
            if (err && err.isError) {
              resolve({ ok: false, error: err.code || 'order-failed', message: err.message });
              return;
            }
            // The approved() handler above does the granting, asynchronously.
            resolve({ ok: true, pending: true });
          } catch (e) {
            resolve({ ok: false, error: 'exception', message: String(e && e.message) });
          }
        });
      },
      restore: async function () {
        var err = null;
        try {
          // CdvPurchase resolves to an IError when the restore fails. Ignoring
          // that return value is how "restore did nothing" gets reported as
          // success, which is exactly what the player complains about.
          err = await store.restorePurchases();
        } catch (e) {
          err = e;
        }
        if (err && err.isError) {
          return { ok: false, error: 'restore-failed', message: err.message };
        }

        var restored = [];
        var pendingVerification = [];

        for (var i = 0; i < PRODUCTS.length; i++) {
          var p = PRODUCTS[i];
          if (p.kind !== 'nonconsumable') continue;

          // store.owned() is the documented check and it keeps working offline
          // from the plugin's own persisted cache. product.owned is only set for
          // products the store happened to load, which is why restore used to
          // come back empty on a fresh install.
          var isOwned = false;
          try { isOwned = store.owned({ id: p.id }) === true; } catch (e) { isOwned = false; }
          if (!isOwned) continue;

          var token = tokenFor(store, p.id);
          if (token) {
            // A restored entitlement is still a purchase: it goes through the
            // same verification as a fresh one, or `required: true` would be a
            // promise the restore path quietly breaks.
            var verdict = await validateWithServer({
              productId: p.id,
              purchaseToken: token,
              transactionId: token,
            });
            if (verdict.ok) {
              if (grant(p.id, verdict.source)) restored.push(p.id);
            } else {
              queuePending({ productId: p.id, purchaseToken: token });
              pendingVerification.push(p.id);
            }
          } else if (!VCFG.required) {
            // Nothing to check it against and verification is not required:
            // the store's own record is the authority.
            if (grant(p.id, 'store')) restored.push(p.id);
          } else {
            pendingVerification.push(p.id);
          }
        }

        state.lastSync = now();
        saveCache();
        emit();
        return { ok: true, restored: restored, pendingVerification: pendingVerification };
      },
      ownedFromStore: function () {
        var out = {};
        PRODUCTS.forEach(function (p) {
          if (p.kind !== 'nonconsumable') return;
          try {
            var sp = store.get(p.id);
            if (sp && sp.owned === true) out[p.id] = true;
          } catch (e) { /* ignore */ }
        });
        return out;
      },
    };
  }

  /* ===================== dev backend (browser only) ===================== */

  function mockBackend() {
    return {
      id: 'mock',
      init: function () {
        PRODUCTS.forEach(function (p) {
          if (!state.prices[p.id]) {
            state.prices[p.id] = p.kind === 'nonconsumable' ? '$2.99' : priceForCoins(p.coins);
          }
        });
        return Promise.resolve(true);
      },
      buy: function (productId) {
        return new Promise(function (resolve) {
          // Same validation path as the real thing, so the wiring is exercised.
          var receipt = {
            productId: productId,
            purchaseToken: 'mock-' + randomNonce(),
            transactionId: 'mock-tx-' + now(),
          };
          validateWithServer(receipt).then(function (result) {
            if (result.ok) {
              // Record *how* it was verified, not just that it was: an
              // entitlement marked 'unverified' should be visible as such.
              deliver(productId, result.source || 'mock');
              resolve({ ok: true, mock: true, source: result.source });
            } else {
              resolve({ ok: false, error: result.reason || 'validation-failed' });
            }
          });
        });
      },
      restore: function () {
        // No store to talk to in a browser. Re-apply anything this profile has
        // already been granted so the flow is exercisable, and say plainly that
        // it was simulated.
        var restored = [];
        Object.keys(state.entitlements).forEach(function (id) {
          if (state.entitlements[id] && !state.owned[id]) {
            state.owned[id] = true;
            restored.push(id);
          }
        });
        state.lastSync = now();
        saveCache();
        return Promise.resolve({ ok: true, restored: restored, simulated: true });
      },
      ownedFromStore: function () { return {}; },
    };
  }

  function priceForCoins(coins) {
    if (coins >= 5000) return '$9.99';
    if (coins >= 1600) return '$4.99';
    if (coins >= 500) return '$1.99';
    return '$0.99';
  }

  /* ===================== public API ===================== */

  var backend = null;

  function snapshot() {
    return {
      ready: state.ready,
      native: state.native,
      backend: state.backend,
      error: state.error,
      owned: Object.assign({}, state.owned),
      prices: Object.assign({}, state.prices),
      adsRemoved: isAdsRemoved(),
      validator: validatorConfigured(),
      validatorRequired: !!VCFG.required,
    };
  }

  var Purchases = {
    init: async function () {
      if (!CFG.enabled) {
        state.ready = true;
        state.backend = 'disabled';
        return snapshot();
      }

      loadCache();
      state.native = isNative();

      if (state.native) {
        var native = nativeBackend();
        if (!native) {
          // Native device, no billing plugin. Grant nothing.
          state.error = 'billing-unavailable';
          state.backend = 'none';
          state.ready = true;
          return snapshot();
        }
        backend = native;
      } else {
        backend = mockBackend();
      }

      state.backend = backend.id;
      try {
        await backend.init();
        state.ready = true;
      } catch (e) {
        state.error = 'init-failed';
        state.ready = true;
        return snapshot();
      }

      // Rebuild entitlements from the store, then retry anything that could not
      // be verified last time. The cache is a fallback, never the source.
      try { await backend.restore(); } catch (e) { /* offline is survivable */ }
      try { await drainPending(); } catch (e) { /* retried next launch */ }

      emit();
      return snapshot();
    },

    /** Live catalog: config data + store prices + ownership. */
    catalog: function () {
      return PRODUCTS.map(function (p) {
        return {
          id: p.id,
          title: p.title,
          blurb: p.blurb,
          kind: p.kind,
          coins: p.coins || 0,
          accent: p.accent || '',
          price: state.prices[p.id] || (p.kind === 'nonconsumable' ? '$2.99' : priceForCoins(p.coins)),
          owned: !!state.owned[p.id],
        };
      });
    },

    buy: async function (productId) {
      if (!CFG.enabled) return { ok: false, error: 'store-disabled' };
      if (!backend) return { ok: false, error: 'store-not-ready' };
      if (!productById(productId)) return { ok: false, error: 'unknown-product' };
      state.error = null;
      try {
        return await backend.buy(productId);
      } catch (e) {
        return { ok: false, error: 'exception' };
      }
    },

    restore: async function () {
      if (!backend) return { ok: false, error: 'store-not-ready' };
      try {
        var res = await backend.restore();
        emit();
        return res;
      } catch (e) {
        return { ok: false, error: 'restore-failed' };
      }
    },

    has: has,
    isAdsRemoved: isAdsRemoved,
    validatorConfigured: validatorConfigured,
    snapshot: snapshot,
    /** Exposed for tests and for a settings screen. */
    grantLocal: function (id) {
      // Only ever used by the dev backend and by tests. Native grants flow
      // through approved() -> validateWithServer() and nowhere else.
      if (state.native) return false;
      return grant(id, 'mock');
    },
    revoke: revoke,
    onChange: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };

  global.Purchases = Purchases;
})(window);
