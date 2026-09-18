/**
 * ads.js - one ad API, two backends.
 *
 *   Native (Capacitor + @capacitor-community/admob) -> real AdMob ads
 *   Web / dev                                      -> a faithful mock so the whole
 *                                                     flow is testable in a browser
 *
 * Public API (all Promises):
 *   Ads.init()
 *   Ads.showBanner() / Ads.hideBanner()
 *   Ads.showInterstitial()      -> Promise<void>
 *   Ads.showRewarded()          -> Promise<boolean>  (true = user earned the reward)
 *   Ads.isNative
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Ad unit IDs come from config.js. The built-in fallbacks are Google's
   *  PUBLIC TEST ids - they always serve test ads and earn exactly $0.
   *  Replace them in config.js before you publish.
   * ------------------------------------------------------------------ */
  var TEST_UNITS = {
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
  };

  function configuredUnits() {
    var ads = (global.NeonConfig && global.NeonConfig.ads) || {};
    var os = platform() === 'ios' ? 'ios' : 'android';
    var chosen = ads[os] || {};
    var fallback = TEST_UNITS[os];
    return {
      banner: chosen.banner || fallback.banner,
      interstitial: chosen.interstitial || fallback.interstitial,
      rewarded: chosen.rewarded || fallback.rewarded,
    };
  }

  /**
   * Entitlement check. Purchases owns the answer; the Store flag is only a
   * legacy mirror so an old save does not start showing ads again.
   */
  function adsRemoved() {
    if (global.Purchases && typeof global.Purchases.isAdsRemoved === 'function') {
      return global.Purchases.isAdsRemoved();
    }
    return !!(global.Store && global.Store.get('removedAds'));
  }

  function platform() {
    var cap = global.Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      var p = cap.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
    return 'web';
  }

  function isNative() {
    var cap = global.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    return platform() !== 'web';
  }

  function admobPlugin() {
    var cap = global.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.AdMob) || null;
  }

  var state = {
    ready: false,
    bannerVisible: false,
    units: configuredUnits(),
    busy: false,
  };

  /* ================= native backend ================= */

  var native = {
    init: function () {
      var AdMob = admobPlugin();
      if (!AdMob) return Promise.resolve(false);
      return AdMob.initialize({ initializeForTesting: false }).then(function () {
        return true;
      });
    },

    showBanner: function () {
      var AdMob = admobPlugin();
      if (!AdMob) return Promise.resolve();
      return AdMob.showBanner({
        adId: state.units.banner,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: false,
      }).then(function () {
        state.bannerVisible = true;
      });
    },

    hideBanner: function () {
      var AdMob = admobPlugin();
      if (!AdMob) return Promise.resolve();
      state.bannerVisible = false;
      return AdMob.hideBanner().catch(function () {});
    },

    showInterstitial: function () {
      var AdMob = admobPlugin();
      if (!AdMob) return Promise.resolve();
      return AdMob.prepareInterstitial({ adId: state.units.interstitial, isTesting: false })
        .then(function () {
          return AdMob.showInterstitial();
        })
        .catch(function () {});
    },

    showRewarded: function () {
      var AdMob = admobPlugin();
      if (!AdMob) return Promise.resolve(false);
      return new Promise(function (resolve) {
        var done = false;
        function finish(value) {
          if (done) return;
          done = true;
          resolve(value);
        }
        var earnedHandle = null;
        var dismissHandle = null;

        function cleanup() {
          try {
            if (earnedHandle) earnedHandle.remove();
            if (dismissHandle) dismissHandle.remove();
          } catch (e) {
            /* ignore */
          }
        }

        AdMob.addListener('onRewarded', function () {
          finish(true);
        }).then(function (h) {
          earnedHandle = h;
        });

        AdMob.addListener('onRewardVideoAdDismissed', function () {
          cleanup();
          finish(false);
        }).then(function (h) {
          dismissHandle = h;
        });

        AdMob.prepareRewardVideoAd({ adId: state.units.rewarded, isTesting: false })
          .then(function () {
            return AdMob.showRewardVideoAd();
          })
          .catch(function () {
            cleanup();
            finish(false);
          });

        // Safety net so a stuck ad can never soft-lock the game.
        setTimeout(function () {
          cleanup();
          finish(false);
        }, 90000);
      });
    },
  };

  /* ================= web/dev mock backend ================= */

  var mock = {
    layer: function () {
      return global.document.getElementById('ad-layer');
    },

    init: function () {
      return Promise.resolve(true);
    },

    showBanner: function () {
      return Promise.resolve();
    },

    hideBanner: function () {
      return Promise.resolve();
    },

    showInterstitial: function () {
      return mock.overlay({
        title: 'Your game could go here',
        body: 'This is a placeholder interstitial. On device this is a real AdMob ad shown every few runs.',
        closeAfter: 3,
        autoCloseAfter: 7,
        reward: false,
      });
    },

    showRewarded: function () {
      return mock.overlay({
        title: 'Watch to continue',
        body: 'Placeholder rewarded video. On device this pays out only when the user finishes the ad.',
        closeAfter: 5,
        autoCloseAfter: 0,
        reward: true,
      });
    },

    /**
     * Renders a full-screen mock ad.
     * Resolves true only if the reward condition was met.
     */
    overlay: function (opts) {
      var layer = mock.layer();
      if (!layer) return Promise.resolve(!opts.reward);

      return new Promise(function (resolve) {
        var settled = false;
        var remaining = opts.closeAfter;
        var canClose = false;

        function settle(value) {
          if (settled) return;
          settled = true;
          clearInterval(timer);
          clearTimeout(autoClose);
          layer.innerHTML = '';
          layer.classList.add('hidden');
          resolve(value);
        }

        layer.classList.remove('hidden');
        layer.innerHTML =
          '<div class="ad-label">AD</div>' +
          '<button class="ad-close" disabled aria-label="Close ad">✕</button>' +
          '<div class="ad-creative">' +
          '<div class="ad-pill">SPONSORED</div>' +
          '<div class="ad-title"></div>' +
          '<div class="ad-body"></div>' +
          '<button class="ad-cta" type="button">LEARN MORE</button>' +
          '</div>' +
          '<div class="ad-timer"></div>';

        var closeBtn = layer.querySelector('.ad-close');
        var timerEl = layer.querySelector('.ad-timer');
        layer.querySelector('.ad-title').textContent = opts.title;
        layer.querySelector('.ad-body').textContent = opts.body;
        layer.querySelector('.ad-cta').addEventListener('click', function () {
          toast('Placeholder ad - nothing to open in dev mode.');
        });

        function paint() {
          if (canClose) {
            closeBtn.disabled = false;
            timerEl.textContent = opts.reward ? 'REWARD READY' : 'CLOSE';
          } else {
            timerEl.textContent = 'REWARD IN ' + remaining + 's';
            if (!opts.reward) timerEl.textContent = 'CLOSE IN ' + remaining + 's';
          }
        }

        closeBtn.addEventListener('click', function () {
          if (!canClose) return;
          // For a rewarded ad, closing without watching to the end = no reward.
          settle(false);
        });

        var timer = setInterval(function () {
          remaining -= 1;
          if (remaining <= 0) {
            remaining = 0;
            canClose = true;
            clearInterval(timer);
            if (opts.reward) {
              // Auto-payout once the reward is earned.
              paint();
              settle(true);
              return;
            }
          }
          paint();
        }, 1000);

        var autoClose = 0;
        if (opts.autoCloseAfter) {
          autoClose = setTimeout(function () {
            settle(true);
          }, opts.autoCloseAfter * 1000);
        }

        paint();
      });
    },
  };

  function toast(msg) {
    var el = global.document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.add('hidden');
    }, 2200);
  }

  /* ================= public API ================= */

  var backend = isNative() && admobPlugin() ? native : mock;

  global.Ads = {
    isNative: isNative(),
    toast: toast,
    init: function () {
      return backend.init().then(function (ok) {
        state.ready = ok;
        return ok;
      });
    },
    showBanner: function () {
      if (adsRemoved()) return Promise.resolve();
      return backend.showBanner();
    },
    hideBanner: function () {
      return backend.hideBanner();
    },
    showInterstitial: function () {
      if (adsRemoved()) return Promise.resolve();
      if (state.busy) return Promise.resolve();
      state.busy = true;
      return backend.showInterstitial().then(
        function () {
          state.busy = false;
        },
        function () {
          state.busy = false;
        }
      );
    },
    showRewarded: function () {
      if (state.busy) return Promise.resolve(false);
      state.busy = true;
      return backend.showRewarded().then(
        function (ok) {
          state.busy = false;
          return !!ok;
        },
        function () {
          state.busy = false;
          return false;
        }
      );
    },
    units: TEST_UNITS,
    adsRemoved: adsRemoved,
    refreshUnits: function () {
      state.units = configuredUnits();
      return state.units;
    },
  };
})(window);
