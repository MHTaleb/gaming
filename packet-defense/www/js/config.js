/**
 * config.js - the one file you edit before shipping.
 *
 * Every deployment-specific value lives here: ad unit ids, in-app products and
 * the purchase validator. All of it is public information by design - no secrets
 * belong in this file, and none of them would be secret if they were here.
 */
(function (global) {
  'use strict';

  global.NeonConfig = {
    appId: 'com.yourstudio.packetdefense',
    gameTitle: 'Packet Defense',

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
     * In-app products. Ids must match Play Console exactly.
     * The persistent currency is called "credits" in the UI; the internal
     * key stays `coins` so the shared purchase module needs no changes.
     *   kind: 'nonconsumable' - bought once, restored forever
     *         'consumable'    - bought repeatedly
     * ------------------------------------------------------------------ */
    store: {
      enabled: true,
      products: [
        {
          id: 'remove_ads',
          kind: 'nonconsumable',
          title: 'Remove Ads',
          blurb: 'No interstitials, ever. Optional rewarded ads stay available for the free boost.',
          coins: 0,
          accent: 'primary',
        },
        {
          id: 'coins_small',
          kind: 'consumable',
          title: 'Pouch of Credits',
          blurb: '+500 credits',
          coins: 500,
        },
        {
          id: 'coins_medium',
          kind: 'consumable',
          title: 'Crate of Credits',
          blurb: '+1,600 credits',
          coins: 1600,
        },
        {
          id: 'coins_large',
          kind: 'consumable',
          title: 'Vault of Credits',
          blurb: '+5,000 credits',
          coins: 5000,
        },
      ],
    },

    /* ------------------------------------------------------------------ *
     * Co-op. The relay hands out room codes and forwards messages between
     * players; the host of each battle is the only authority on it (see
     * server/relay/ and docs/COOP.md).
     *
     * `url` is where the browser reaches the relay. Empty means same-origin
     * `/coop`, which is what a deployment behind the nginx in deploy/ should
     * use - the relay then needs no public port of its own and no CORS.
     *
     * Set `enabled: false` and the co-op screen is hidden entirely. That is the
     * switch to reach for if the relay is down, because a matchmaking button
     * that cannot match anything is worse than no button.
     * ------------------------------------------------------------------ */
    coop: {
      enabled: true,
      url: '',
      /** How often the host broadcasts state. 10Hz is smooth after
       *  interpolation and about 2-4KB a snapshot. */
      snapshotHz: 10,
      maxSeats: 4,
      /** A peer renders this far behind the newest snapshot, so there is always
       *  a later one to interpolate towards. Without it the world judders at
       *  exactly the packet rate. */
      interpDelayMs: 150,
    },

    /* ------------------------------------------------------------------ *
     * Purchase validator (see server/validator/).
     * Leave `url` empty and purchases are trusted from the local store
     * receipt - fine for development, NOT fine for money. Deploy the service,
     * then paste its URL and signing key here and set `required: true`.
     * ------------------------------------------------------------------ */
    validator: {
      url: '',
      publicKey: '',
      required: false,
      timeoutMs: 8000,
    },

    /* ------------------------------------------------------------------ *
     * Anti-tamper. A keyed checksum over the save makes casual save editing
     * detectable. Deterrence, not security: the key ships in the bundle.
     * ------------------------------------------------------------------ */
    security: {
      signSave: true,
      /** 'ignore' = keep playing, 'reset' = wipe a tampered save */
      onTamper: 'ignore',
      /** shop buttons only respond to a real tap, never a synthetic click */
      requireUserGestureForPurchase: true,
    },
  };
})(window);
