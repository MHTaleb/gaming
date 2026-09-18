/**
 * config.js - the one file you edit before shipping.
 *
 * Everything deployment-specific lives here: ad unit IDs, in-app products and
 * the purchase validator. All of it is public information (ad unit IDs, product
 * IDs and a public verification key are all client-side by design) - no secrets
 * belong in this file, and none of them would be secret if they were here.
 */
(function (global) {
  'use strict';

  global.NeonConfig = {
    appId: 'com.yourstudio.neonstack',

    /* ------------------------------------------------------------------ *
     * Ads. These defaults are Google's PUBLIC TEST ids: they always serve
     * test ads and they earn exactly $0. Replace them with your own AdMob
     * unit ids before you publish, and keep the test ids for dev builds.
     * ------------------------------------------------------------------ */
    ads: {
      enabled: true,
      android: {
        banner: 'ca-app-pub-3940256099942544/6300978111',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        rewarded: 'ca-app-pub-3940256099942544/5224354917',
      },
      ios: {
        banner: 'ca-app-pub-3940256099942544/2934735716',
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
        rewarded: 'ca-app-pub-3940256099942544/1712485313',
      },
    },

    /* ------------------------------------------------------------------ *
     * In-app products.
     *   kind: 'nonconsumable' - bought once, restored forever
     *         'consumable'    - bought repeatedly (coin packs)
     * Create these ids in Play Console -> Monetise -> Products. The ids here
     * must match exactly or the store will return "product not found".
     * ------------------------------------------------------------------ */
    store: {
      enabled: true,
      coinPerAdRemoval: 0,
      products: [
        {
          id: 'remove_ads',
          kind: 'nonconsumable',
          title: 'Remove Ads',
          blurb: 'No interstitials, ever. Optional rewarded ads stay available in case you want the free continue.',
          coins: 0,
          accent: 'primary',
        },
        {
          id: 'coins_small',
          kind: 'consumable',
          title: 'Pouch of Coins',
          blurb: '+500 coins',
          coins: 500,
        },
        {
          id: 'coins_medium',
          kind: 'consumable',
          title: 'Crate of Coins',
          blurb: '+1,600 coins',
          coins: 1600,
        },
        {
          id: 'coins_large',
          kind: 'consumable',
          title: 'Vault of Coins',
          blurb: '+5,000 coins',
          coins: 5000,
        },
      ],
    },

    /* ------------------------------------------------------------------ *
     * Purchase validator (see server/validator/).
     *
     * Leave `url` empty and purchases are trusted from the local store
     * receipt - which is fine for development and NOT fine for money. Once
     * the service is deployed, paste its URL and its signing key here.
     * `required: true` refuses to grant anything the server has not verified.
     * ------------------------------------------------------------------ */
    validator: {
      url: '',
      publicKey: '',
      required: false,
      timeoutMs: 8000,
    },

    /* ------------------------------------------------------------------ *
     * Anti-tamper. Signed saves make casual save editing detectable. This
     * is deterrence, not security: anyone who can read this file can read
     * the key. Never let it be the only thing standing behind a purchase.
     * ------------------------------------------------------------------ */
    security: {
      signSave: true,
      /** 'ignore' = keep playing, 'reset' = wipe a tampered save */
      onTamper: 'ignore',
      /** block obvious automation of the *shop* only, never gameplay */
      requireUserGestureForPurchase: true,
    },
  };
})(window);
