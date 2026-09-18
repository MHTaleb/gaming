/**
 * main.js - screens, wiring, and the run lifecycle.
 *
 * Every screen is built with createElement rather than innerHTML. Two reasons:
 * the CSP forbids inline script, so an injected string can never execute, and
 * anything that comes from the store (product titles, prices) is rendered with
 * textContent so it can never become markup.
 *
 * This file replaced the Phase 0 harness, which now lives in selftest.js behind
 * `?selftest=1` - the kit question it answers gets asked again on every clone.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var current = null;
  var run = { levelId: 1, timers: [] };

  /* ------------------------------------------------------------------ *
   * Tiny DOM helper. No innerHTML anywhere with dynamic content.
   * ------------------------------------------------------------------ */

  function h(tag, props, kids) {
    var e = doc.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'on') { for (var ev in v) e.addEventListener(ev, v[ev]); }
        // CSSOM only. Setting the style *attribute* is what the CSP blocks.
        else if (k === 'css') { for (var prop in v) e.style.setProperty(prop, v[prop]); }
        else e.setAttribute(k, v);
      }
    }
    (kids || []).forEach(function (kid) { if (kid) e.appendChild(kid); });
    return e;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function el(id) { return doc.getElementById(id); }

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */

  function applyAccessibility() {
    doc.body.classList.toggle('reduce-motion', !!global.Store.get('reduceMotion'));
    doc.body.classList.toggle('high-contrast', !!global.Store.get('highContrast'));
  }

  function seedReduceMotion() {
    var mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq && mq.matches && !global.Store.get('reduceMotion')) global.Store.set('reduceMotion', true);
  }

  function syncAudioSettings() {
    if (global.Sfx) {
      global.Sfx.setEnabled(!!global.Store.get('sound'));
      if (global.Sfx.setVolume) global.Sfx.setVolume(Number(global.Store.get('sfxVolume')));
    }
    if (global.Music) {
      global.Music.setEnabled(!!global.Store.get('music'));
      global.Music.setVolume(Number(global.Store.get('musicVolume')));
    }
  }

  function haptic(ms) {
    if (!global.Store.get('haptics')) return;
    if (global.navigator && global.navigator.vibrate) global.navigator.vibrate(ms || 12);
  }

  /* ------------------------------------------------------------------ *
   * Screen plumbing
   * ------------------------------------------------------------------ */

  var SCREENS = ['menu', 'map', 'brief', 'battle', 'result', 'shop', 'base', 'settings'];

  function show(id, data) {
    if (current === 'battle' && id !== 'battle') {
      global.Engine.stop();
      run.timers.forEach(global.clearTimeout);
      run.timers = [];
      clearTimeout(run.bannerTimer);
    }

    SCREENS.forEach(function (s) {
      var node = el('screen-' + s);
      if (node) node.classList.toggle('active', s === id);
    });
    current = id;

    if (id === 'menu') renderMenu();
    if (id === 'map') renderMap();
    if (id === 'brief') renderBrief(data.levelId);
    if (id === 'battle') startBattle(data.levelId);
    if (id === 'result') renderResult(data);
    if (id === 'shop') renderShop();
    if (id === 'base') renderBase();
    if (id === 'settings') renderSettings();

    if (global.Ads) {
      // Banners on menu screens only. Anything over the playfield is a
      // mis-tap waiting to happen.
      if (id === 'menu' || id === 'map') global.Ads.showBanner();
      else global.Ads.hideBanner();
    }
  }

  function topbar(title, onBack, right) {
    return h('header', { class: 'bar' }, [
      onBack ? h('button', { class: 'btn ghost', 'aria-label': 'Back', text: '‹', on: { click: onBack } }) : null,
      h('div', { class: 'brand' }, [
        h('span', { class: 'prompt', text: '$' }),
        h('span', { class: 'title', text: title }),
        h('span', { class: 'cursor', text: '_' }),
      ]),
      h('div', { class: 'bar-right' }, right || []),
    ]);
  }

  function tap(weight) {
    if (global.Sfx) global.Sfx.ui();
    haptic(weight || 10);
  }

  /* ------------------------------------------------------------------ *
   * Menu
   * ------------------------------------------------------------------ */

  function renderMenu() {
    var host = el('screen-menu');
    clear(host);

    var levels = global.Levels.count();

    host.appendChild(h('div', { class: 'menu-wrap' }, [
      h('div', { class: 'logo' }, [
        h('div', { class: 'logo-line', text: '$ packet-defense --serve prod' }),
        h('h1', { text: 'PACKET DEFENSE' }),
        h('p', { class: 'tagline', text: 'Hold the production server against everything the internet throws at it.' }),
      ]),
      h('div', { class: 'menu-stats' }, [
        h('span', { text: '★ ' + global.Profile.totalStars() + ' / ' + levels * 3 }),
        h('span', { text: '⛁ ' + global.Profile.credits() + ' credits' }),
        global.Base && global.Base.invested()
          ? h('span', { text: '⌬ ' + global.Base.invested() + ' in research' })
          : null,
      ]),
      h('div', { class: 'menu-buttons' }, [
        h('button', { class: 'btn primary big', text: 'CAMPAIGN', on: { click: function () { tap(); show('map'); } } }),
        h('button', { class: 'btn big', text: 'BASE', on: { click: function () { tap(); show('base'); } } }),
        h('button', { class: 'btn big', text: 'SHOP', on: { click: function () { tap(); show('shop'); } } }),
        h('button', { class: 'btn big', text: 'SETTINGS', on: { click: function () { tap(); show('settings'); } } }),
      ]),
      global.Profile.isTampered()
        ? h('p', { class: 'warn', text: 'Save integrity check failed. Progress kept, but it may have been edited.' })
        : null,
      h('p', { class: 'foot-note', text: 'no assets · no build step · all art and audio generated at runtime' }),
    ]));
  }

  /* ------------------------------------------------------------------ *
   * Level select
   * ------------------------------------------------------------------ */

  function starsFor(n) {
    var out = [];
    for (var i = 0; i < 3; i++) {
      out.push(h('span', { class: 'star' + (i < n ? ' on' : ''), text: i < n ? '★' : '☆' }));
    }
    return h('div', { class: 'stars' }, out);
  }

  function renderMap() {
    var host = el('screen-map');
    clear(host);

    var levels = global.Levels.all();
    var unlocked = global.Profile.load().unlocked;

    host.appendChild(topbar('campaign', function () { tap(); show('menu'); }, [
      h('span', { class: 'pill', text: '★ ' + global.Profile.totalStars() + '/' + levels.length * 3 }),
    ]));

    var body = h('div', { class: 'map-body' });
    var envs = [];
    levels.forEach(function (l) { if (envs.indexOf(l.env) === -1) envs.push(l.env); });

    envs.forEach(function (env) {
      var row = h('div', { class: 'level-row' });
      levels.filter(function (l) { return l.env === env; }).forEach(function (l) {
        var open = l.id <= unlocked;
        row.appendChild(h('button', {
          class: 'level-card' + (open ? '' : ' locked'),
          'aria-disabled': open ? 'false' : 'true',
          on: {
            click: function () {
              if (!open) { tap(2); return; }
              tap();
              show('brief', { levelId: l.id });
            },
          },
        }, [
          h('span', { class: 'level-code', text: l.code }),
          h('span', { class: 'level-name', text: l.name }),
          open ? starsFor(global.Profile.stars(l.id)) : h('span', { class: 'lock', text: 'LOCKED' }),
          h('span', { class: 'level-meta', text: l.waves.length + ' waves · ' + global.Levels.threatCount(l) + ' threats' }),
        ]));
      });
      body.appendChild(h('section', { class: 'env-group' }, [
        h('h2', { class: 'env-title', text: env }),
        row,
      ]));
    });

    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ *
   * Briefing
   * ------------------------------------------------------------------ */

  function renderBrief(levelId) {
    var host = el('screen-brief');
    clear(host);
    var l = global.Levels.byId(levelId);
    if (!l) { show('map'); return; }
    run.levelId = l.id;

    // Roster, so the player plans against information instead of memory.
    var order = [];
    var counts = {};
    l.waves.forEach(function (w) {
      w.forEach(function (g) {
        if (order.indexOf(g.t) === -1) order.push(g.t);
        counts[g.t] = (counts[g.t] || 0) + g.n;
      });
    });

    host.appendChild(topbar(l.code, function () { tap(); show('map'); }, [
      h('span', { class: 'pill', text: l.env }),
    ]));

    var chat = h('div', { class: 'chat' }, global.Story.opening(l.id).map(function (m) {
      return h('div', { class: 'chat-line' }, [
        h('span', { class: 'chat-who', text: m.name, css: { color: m.colour } }),
        h('span', { class: 'chat-text', text: m.text }),
      ]);
    }));

    var roster = h('div', { class: 'roster' }, order.map(function (typeId) {
      var d = global.Threats.def(typeId);
      return h('div', { class: 'roster-item' }, [
        h('span', { class: 'dot', css: { background: d.colour } }),
        h('span', { class: 'roster-name', text: d.name }),
        h('span', { class: 'roster-count', text: '×' + counts[typeId] }),
        h('span', { class: 'roster-tell', text: d.tell }),
      ]);
    }));

    host.appendChild(h('div', { class: 'brief-body' }, [
      h('div', { class: 'brief-left' }, [
        h('h1', { class: 'brief-name', text: l.name }),
        h('p', { class: 'brief-text', text: l.brief }),
        h('div', { class: 'tip' }, [
          h('span', { class: 'tip-label', text: 'ON CALL TIP' }),
          h('span', { class: 'tip-text', text: l.tip }),
        ]),
        chat,
      ]),
      h('div', { class: 'brief-right' }, [
        h('div', { class: 'stat-row' }, [
          stat('STARTING B/W', String(l.bandwidth)),
          stat('WAVES', String(l.waves.length)),
          stat('THREATS', String(global.Levels.threatCount(l))),
        ]),
        h('h3', { class: 'section-title', text: 'INBOUND' }),
        roster,
        h('button', {
          class: 'btn primary big wide', text: 'START SHIFT',
          on: { click: function () { tap(); show('battle', { levelId: l.id }); } },
        }),
      ]),
    ]));
  }

  function stat(label, value) {
    return h('div', { class: 'stat' }, [
      h('span', { class: 'stat-label', text: label }),
      h('span', { class: 'stat-value', text: value }),
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Battle
   * ------------------------------------------------------------------ */

  function startBattle(levelId) {
    applyAccessibility();
    var level = global.Levels.byId(levelId);
    global.Engine.start(levelId);
    global.Story.reset();

    var banner = el('battle-banner');
    clear(el('battle-chat'));
    showBanner(banner, level.code + ' · ' + level.name);

    global.Engine.mount(el('game'), {
      onLeak: function () {
        haptic(28);
        var st = global.Engine.state();
        if (st.leaks === 1) lines(global.Story.reaction('firstLeak'));
        if (st.uptime <= 50 && st.uptime > 25) lines(global.Story.reaction('heavyLeak'));
        if (st.uptime <= 25 && st.uptime > 0) lines(global.Story.reaction('nearDeath'));
      },
      onWaveClear: function (n) {
        if (n === 1) lines(global.Story.reaction('waveClear'));
      },
      onBoss: function () {
        showBanner(banner, 'ZERO-DAY');
        lines(global.Story.reaction('bossIncoming'));
      },
      onWin: function (result) {
        haptic(60);
        if (global.Sfx) global.Sfx.victory();
        lines(global.Story.reaction('win'));
        global.setTimeout(function () { finish(result, true); }, 1200);
      },
      onLose: function (result) {
        haptic(80);
        if (global.Sfx) global.Sfx.gameOver();
        lines(global.Story.reaction('lose'));
        global.setTimeout(function () { finish(result, false); }, 1200);
      },
    });

    global.Engine.run();

    if (global.Store.get('music') && global.Music) {
      if (!global.Music.isRunning()) global.Music.start();
      global.Music.setMood('calm');
      global.Music.setIntensity(0.15);
    }
  }

  function lines(messages) {
    if (!messages) return;
    var host = el('battle-chat');
    if (!host) return;
    messages.forEach(function (m, i) {
      run.timers.push(global.setTimeout(function () {
        var node = h('div', { class: 'chat-line small' }, [
          h('span', { class: 'chat-who', text: m.name, css: { color: m.colour } }),
          h('span', { class: 'chat-text', text: m.text }),
        ]);
        host.appendChild(node);
        while (host.children.length > 3) host.removeChild(host.firstChild);
        run.timers.push(global.setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 7000));
      }, i * 1400));
    });
  }

  function showBanner(node, text) {
    if (!node) return;
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(run.bannerTimer);
    run.bannerTimer = global.setTimeout(function () { node.classList.remove('show'); }, 2200);
  }

  /* ------------------------------------------------------------------ *
   * Results
   * ------------------------------------------------------------------ */

  function finish(result, won) {
    var record = global.Profile.complete(result.levelId, result, global.Levels.count());
    // Ad cadence: every third clear, never on a loss, never on a first clear,
    // and never if the player paid to remove them. A loss is the moment a
    // player is most likely to quit, so that is the worst possible time to
    // interrupt them with an ad.
    var clears = global.Profile.load().clears;
    if (won && clears > 1 && clears % 3 === 0 && global.Ads) global.Ads.showInterstitial();
    show('result', {
      result: result, won: won, record: record,
      hasNext: result.levelId < global.Levels.count(),
    });
  }

  function renderResult(data) {
    var host = el('screen-result');
    clear(host);
    var r = data.result;
    var level = global.Levels.byId(r.levelId);

    host.appendChild(h('div', { class: 'result-body' }, [
      h('h1', { class: 'result-title ' + (data.won ? 'ok' : 'bad'), text: data.won ? 'TICKET CLOSED' : 'PROD IS DOWN' }),
      h('p', { class: 'result-sub', text: level.code + ' · ' + level.name }),

      data.won ? starsFor(data.record.stars) : h('div', { class: 'stars' }),

      h('div', { class: 'result-grid' }, [
        stat('UPTIME', Math.round(r.uptime) + '%'),
        stat('LEAKS', String(r.leaks)),
        stat('KILLED', String(r.kills)),
        stat('EARNED', String(r.earned)),
        stat('TOWERS', String(r.towers)),
        stat('TIME', Math.floor(r.seconds / 60) + ':' + ('0' + (r.seconds % 60)).slice(-2)),
      ]),

      h('p', { class: 'debrief', text: global.Story.debrief(r) }),

      data.won && data.record.credits
        ? h('p', { class: 'payout', text: '+' + data.record.credits + ' credits  ·  ★' + data.record.stars })
        : null,
      data.record.unlocked
        ? h('p', { class: 'unlock', text: 'NEW TICKET UNLOCKED — ' + global.Levels.byId(data.record.unlocked).code })
        : null,

      h('div', { class: 'result-buttons' }, [
        h('button', { class: 'btn', text: 'RETRY', on: { click: function () { tap(); show('battle', { levelId: r.levelId }); } } }),
        data.won && data.hasNext
          ? h('button', {
            class: 'btn primary', text: 'NEXT TICKET',
            on: { click: function () { tap(); show('brief', { levelId: r.levelId + 1 }); } },
          })
          : null,
        h('button', { class: 'btn ghost', text: 'CAMPAIGN', on: { click: function () { tap(); show('map'); } } }),
      ]),

      !data.won
        ? h('p', { class: 'hint', text: 'The cheapest fix is usually another tower on a corner, not a better tower somewhere else.' })
        : null,
    ]));
  }

  /* ------------------------------------------------------------------ *
   * Shop
   * ------------------------------------------------------------------ */

  function renderShop() {
    var host = el('screen-shop');
    clear(host);

    host.appendChild(topbar('shop', function () { tap(); show('menu'); }, [
      h('span', { class: 'pill', text: '⛁ ' + global.Profile.credits() }),
    ]));

    var list = h('div', { class: 'shop-list' });
    var note = h('p', { class: 'shop-note', text: '' });

    function paint() {
      clear(list);
      global.Purchases.catalog().forEach(function (p) {
        list.appendChild(h('div', { class: 'shop-item' }, [
          h('div', { class: 'shop-info' }, [
            h('span', { class: 'shop-title', text: p.title }),
            h('span', { class: 'shop-blurb', text: p.blurb }),
          ]),
          p.owned
            ? h('span', { class: 'pill ok', text: 'OWNED' })
            : h('button', {
              class: 'btn primary', text: p.price,
              on: {
                click: function (e) {
                  // Trusted-only: a synthetic click must not be able to make a
                  // purchase look like it happened.
                  if (!e.isTrusted) return;
                  tap();
                  note.textContent = 'Contacting the store…';
                  global.Purchases.buy(p.id).then(function (res) {
                    note.textContent = res && res.ok
                      ? (p.coins ? 'Added ' + p.coins + ' credits.' : 'Purchase complete.')
                      : 'Purchase failed: ' + ((res && res.error) || 'unknown') + '. Nothing was charged.';
                    paint();
                  }).catch(function () {
                    note.textContent = 'Purchase failed. Nothing was charged.';
                    paint();
                  });
                },
              },
            }),
        ]));
      });
      note.textContent = global.Purchases.validatorConfigured()
        ? 'Receipts are verified against the purchase validator before anything is granted.'
        : 'Developer build: purchases are stubbed locally. Set a validator URL in config.js before shipping.';
    }

    host.appendChild(h('div', { class: 'shop-body' }, [
      list,
      h('button', {
        class: 'btn', text: 'RESTORE PURCHASES',
        on: {
          click: function (e) {
            if (!e.isTrusted) return;
            tap();
            note.textContent = 'Asking the store what this account owns…';
            global.Purchases.restore().then(function (res) {
              note.textContent = res && res.ok
                ? 'Restored. This account owns: ' + (global.Purchases.isAdsRemoved() ? 'ad removal' : 'nothing yet') + '.'
                : 'Restore failed: ' + ((res && res.error) || 'unknown') + '. Nothing was changed.';
              paint();
            });
          },
        },
      }),
      note,
    ]));
    paint();
  }

  /* ------------------------------------------------------------------ *
   * Base: the permanent research tree.
   *
   * Three sections, in the order a player asks the questions: what is wrong
   * with my run (hardening), what do I already own (towers), and what could I
   * own (unlocks).
   *
   * Everything on this screen is a *preview of a number that combat will use*,
   * not a separate set of figures. Build cost comes from Towers.cost, stats
   * from Towers.stats - the same two readers the battle uses. A shop screen
   * that computes its own totals is a shop screen that eventually lies.
   * ------------------------------------------------------------------ */

  function round1(n) { return Math.round(n * 10) / 10; }

  function pips(rank, max) {
    var out = [];
    for (var i = 0; i < max; i++) {
      out.push(h('span', { class: 'pip' + (i < rank ? ' on' : ''), text: i < rank ? '●' : '○' }));
    }
    return h('span', { class: 'pips', 'aria-label': rank + ' of ' + max }, out);
  }

  /**
   * A tower icon drawn by the real renderer on its own canvas.
   *
   * Worth the DOM nodes: the palette, the field and this screen cannot drift
   * apart, because there is one drawing routine and it is not duplicated here.
   * Rendered at 2x because a 44px icon on a 3x phone is otherwise mush.
   */
  function towerIcon(id, size, dim) {
    var cv = doc.createElement('canvas');
    cv.width = size * 2;
    cv.height = size * 2;
    cv.className = 'base-icon' + (dim ? ' dim' : '');
    var ctx = cv.getContext('2d');
    ctx.scale(size * 2 / 56, size * 2 / 56);
    try {
      global.Towers.drawTower(ctx, { type: id, level: 1, x: 28, y: 28, angle: -Math.PI / 2, disabledUntil: 0 }, 0);
    } catch (err) {
      // A missing icon must never take the screen down with it.
    }
    return cv;
  }

  /** The numbers this tower will actually have in the field, right now. */
  function statLine(id) {
    var d = global.Towers.def(id);
    var st = global.Towers.stats({ type: id, level: 1 });
    var bits = ['BUILD ' + global.Towers.cost(id)];
    if (st.damage > 0) bits.push('DMG ' + round1(st.damage));
    if (st.rate > 0) bits.push('RATE ' + d.rate + 's');
    if (st.splash) bits.push('SPLASH ' + st.splash);
    if (d.slow !== undefined) bits.push('SLOW −' + Math.round((1 - st.slow) * 100) + '%');
    if (st.heal) bits.push('REPAIR ' + round1(st.heal) + '/s');
    if (d.tag) bits.push('MARK +' + Math.round((st.tag - 1) * 100) + '%');
    if (d.tagBounty) bits.push('PAYOUT ×' + round1(st.tagBounty));
    if (st.range > 0) bits.push('RNG ' + Math.round(st.range));
    return bits.join('  ·  ');
  }

  function renderBase() {
    var host = el('screen-base');
    clear(host);
    if (!global.Base || !global.Towers) return;

    host.appendChild(topbar('base', function () { tap(); show('menu'); }, [
      h('span', { class: 'pill', text: '⛁ ' + global.Profile.credits() }),
    ]));

    var note = h('p', { class: 'shop-note', text: 'Permanent upgrades, bought with credits won in the campaign. Levels are clearable without them - this is what you build with the leftovers.' });

    function say(text, ok) {
      note.textContent = text;
      note.classList.toggle('bad', ok === false);
      note.classList.toggle('good', ok === true);
    }

    /** Run a purchase, then repaint from the store so the screen cannot cache a lie. */
    function buy(fn, label) {
      return function (e) {
        // Trusted-only, like every other spend in the game: a synthetic click
        // must not be able to move credits.
        if (!e.isTrusted) return;

        var res;
        try {
          res = fn();
        } catch (err) {
          // A purchase that throws must not look like a dead button. This is
          // not hypothetical: Base.unlock shipped without being exported, so
          // tapping UNLOCK threw a TypeError inside this handler and the only
          // evidence was a console line the player will never open.
          say('Could not complete that purchase. Nothing was spent.', false);
          tap(2);
          return;
        }

        if (res.ok) {
          tap();
          haptic(18);
          say(label + ' · ' + res.cost + ' credits spent.', true);
        } else {
          tap(2);
          say(res.reason.charAt(0).toUpperCase() + res.reason.slice(1) + '.', false);
        }
        paint();
        refreshPill();
      };
    }

    var pill = host.querySelector('.bar-right .pill');

    function refreshPill() {
      if (pill) pill.textContent = '⛁ ' + global.Profile.credits();
    }

    var list = h('div', { class: 'shop-list' });

    function towerRow(id, locked) {
      var d = global.Towers.def(id);
      var max = global.Base.MAX_RANK;
      var rank = global.Base.rank(id);
      var kids = [];

      if (locked) {
        var info = global.Base.unlockInfo(id);
        kids.push(h('div', { class: 'base-head' }, [
          towerIcon(id, 44, true),
          h('div', { class: 'shop-info' }, [
            h('span', { class: 'shop-title', text: d.name }),
            h('span', { class: 'base-locked', text: 'NOT IN YOUR RACK' }),
          ]),
          h('button', {
            class: 'btn primary', text: 'UNLOCK · ' + info.cost,
            on: { click: buy(function () { return global.Base.unlock(id); }, d.name + ' unlocked') },
          }),
        ]));
        kids.push(h('p', { class: 'shop-blurb', text: info.pitch }));
        kids.push(h('p', { class: 'base-reason', text: info.reason }));
        return h('div', { class: 'shop-item base-item locked' }, kids);
      }

      kids.push(h('div', { class: 'base-head' }, [
        towerIcon(id, 44, false),
        h('div', { class: 'shop-info' }, [
          h('span', { class: 'shop-title', text: d.name }),
          h('span', { class: 'base-rank' }, [pips(rank, max), h('span', { class: 'base-rank-text', text: rank + ' / ' + max })]),
        ]),
        global.Base.nextResearch(id)
          ? h('button', {
            class: 'btn primary',
            text: 'RESEARCH · ' + global.Base.nextResearch(id).cost,
            on: { click: buy(function () { return global.Base.research(id); }, d.name + ' researched') },
          })
          : h('span', { class: 'pill ok', text: 'MAXED' }),
      ]));
      kids.push(h('p', { class: 'shop-blurb', text: d.blurb }));
      kids.push(h('p', { class: 'base-stats', text: statLine(id) }));
      var next = global.Base.nextResearch(id);
      if (next) kids.push(h('p', { class: 'base-next', text: 'Next: ' + next.label }));
      return h('div', { class: 'shop-item base-item' }, kids);
    }

    function paint() {
      clear(list);

      /* ---- PROD hardening ---- */
      var hNow = global.Base.hardening();
      var hMax = global.Base.MAX_HARDENING;
      var hNext = global.Base.nextHardening();
      var hKids = [
        h('div', { class: 'base-head' }, [
          h('span', { class: 'base-shield', text: '⬒' }),
          h('div', { class: 'shop-info' }, [
            h('span', { class: 'shop-title', text: 'PROD integrity' }),
            h('span', { class: 'base-rank' }, [pips(hNow, hMax), h('span', { class: 'base-rank-text', text: hNow + ' / ' + hMax })]),
          ]),
          hNext
            ? h('button', {
              class: 'btn primary', text: 'HARDEN · ' + hNext.cost,
              on: { click: buy(function () { return global.Base.harden(); }, 'PROD hardened') },
            })
            : h('span', { class: 'pill ok', text: 'MAXED' }),
        ]),
        h('p', { class: 'shop-blurb', text: 'Every leak costs less integrity. It buys you slack, not immunity: a wave that walks through still ends the run.' }),
        h('p', {
          class: 'base-stats',
          text: 'LEAK COST ' + Math.round(global.Base.leakMultiplier() * 100) + '%'
            + (hNow > 0 ? '  ·  saves about ' + Math.round((1 - global.Base.leakMultiplier()) * 100) + '% per leak' : '  ·  unresearched'),
        }),
      ];
      if (hNext) hKids.push(h('p', { class: 'base-next', text: 'Next: ' + hNext.label }));

      list.appendChild(h('section', { class: 'base-group' }, [
        h('h2', { class: 'env-title', text: 'THE SERVER' }),
        h('div', { class: 'shop-item base-item' }, hKids),
      ]));

      /* ---- towers you own ---- */
      var owned = global.Base.FREE.slice();
      var locked = global.Base.lockedTypes();
      Object.keys(global.Base.UNLOCKS).forEach(function (id) {
        if (locked.indexOf(id) === -1) owned.push(id);
      });

      list.appendChild(h('section', { class: 'base-group' }, [
        h('h2', { class: 'env-title', text: 'THE RACK' }),
        h('div', { class: 'shop-list' }, owned.map(function (id) { return towerRow(id, false); })),
      ]));

      /* ---- towers you could own ---- */
      if (locked.length) {
        list.appendChild(h('section', { class: 'base-group' }, [
          h('h2', { class: 'env-title', text: 'IN THE CRATE' }),
          h('div', { class: 'shop-list' }, locked.map(function (id) { return towerRow(id, true); })),
        ]));
      }

      var invested = global.Base.invested();
      if (invested > 0) {
        list.appendChild(h('p', {
          class: 'foot-note',
          text: '⌬ ' + invested + ' credits invested in the base so far.',
        }));
      }
    }

    host.appendChild(h('div', { class: 'shop-body' }, [note, list]));
    paint();
  }

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */

  function renderSettings() {
    var host = el('screen-settings');
    clear(host);

    host.appendChild(topbar('settings', function () { tap(); show('menu'); }, []));

    var body = h('div', { class: 'settings-body' });

    function toggle(key, label) {
      var input = h('input', { type: 'checkbox' });
      input.checked = !!global.Store.get(key);
      input.addEventListener('change', function () {
        global.Store.set(key, input.checked);
        syncAudioSettings();
        applyAccessibility();
        tap();
      });
      return h('label', { class: 'setting-row' }, [
        h('span', { class: 'setting-label', text: label }),
        input,
      ]);
    }

    function slider(key, label) {
      var input = h('input', { type: 'range', min: '0', max: '1', step: '0.05' });
      input.value = String(global.Store.get(key));
      input.addEventListener('input', function () {
        global.Store.set(key, Number(input.value));
        syncAudioSettings();
      });
      return h('label', { class: 'setting-row' }, [
        h('span', { class: 'setting-label', text: label }),
        input,
      ]);
    }

    body.appendChild(h('h3', { class: 'section-title', text: 'AUDIO' }));
    body.appendChild(toggle('sound', 'Sound effects'));
    body.appendChild(slider('sfxVolume', 'Effects volume'));
    body.appendChild(toggle('music', 'Music'));
    body.appendChild(slider('musicVolume', 'Music volume'));

    body.appendChild(h('h3', { class: 'section-title', text: 'ACCESSIBILITY' }));
    body.appendChild(toggle('reduceMotion', 'Reduce motion (no screen shake)'));
    body.appendChild(toggle('highContrast', 'High contrast'));
    body.appendChild(toggle('haptics', 'Haptics'));

    body.appendChild(h('h3', { class: 'section-title', text: 'PROGRESS' }));
    var warn = h('p', { class: 'warn', text: '' });
    body.appendChild(h('button', {
      class: 'btn danger', text: 'RESET ALL PROGRESS',
      on: {
        click: function (e) {
          if (!e.isTrusted) return;
          // Two-step, because a single tap that destroys a campaign is a bug
          // report waiting to happen.
          if (e.target.dataset.confirm === '1') {
            global.Profile.reset();
            e.target.dataset.confirm = '';
            e.target.textContent = 'RESET ALL PROGRESS';
            warn.textContent = 'Progress reset.';
            tap();
            return;
          }
          e.target.dataset.confirm = '1';
          e.target.textContent = 'TAP AGAIN TO CONFIRM';
          warn.textContent = 'This deletes every star and all credits.';
        },
      },
    }));
    body.appendChild(warn);

    body.appendChild(h('h3', { class: 'section-title', text: 'ABOUT' }));
    body.appendChild(h('p', { class: 'about', text: 'Packet Defense · ' + global.NeonConfig.appId }));
    body.appendChild(h('p', { class: 'about', text: 'No network calls during play. No analytics. No accounts. Progress and settings live on this device only.' }));
    body.appendChild(h('p', { class: 'about', text: 'Music and all artwork are generated at runtime from code. Nothing is streamed or downloaded.' }));

    host.appendChild(body);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function boot() {
    seedReduceMotion();
    applyAccessibility();

    // Audio contexts cannot be created without a gesture, so the first
    // interaction anywhere is treated as "unlock and start".
    var unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      if (global.Sfx) global.Sfx.unlock();
      syncAudioSettings();
      if (global.Store.get('music') && global.Music && !global.Music.isRunning()) {
        global.Music.init();
        global.Music.start();
      }
    }
    doc.addEventListener('pointerdown', unlock, { passive: true });
    doc.addEventListener('keydown', unlock);

    if (global.Ads) global.Ads.init();
    if (global.Purchases) {
      global.Purchases.init().then(function () {
        syncAudioSettings();
        if (current === 'shop' || current === 'menu') show(current);
      });
    }

    var quit = el('battle-quit');
    if (quit) {
      quit.addEventListener('click', function (e) {
        if (!e.isTrusted) return;
        tap();
        // Abandoning is not a loss: it records nothing and unlocks nothing, so
        // a player cannot farm an easy level by quitting mid-wave.
        show('map');
      });
    }

    show('menu');
  }

  if (doc.readyState === 'complete' || doc.readyState === 'interactive') global.setTimeout(boot, 0);
  else doc.addEventListener('DOMContentLoaded', boot);

  global.__app = {
    show: show,
    screens: SCREENS,
    current: function () { return current; },
  };
})(window);
