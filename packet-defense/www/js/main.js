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

  var SCREENS = ['menu', 'map', 'brief', 'battle', 'result', 'shop', 'base', 'settings', 'coop'];

  /*
   * Music.
   *
   * packet-defense shipped with twenty-one generated tracks in tracks.js and
   * played exactly one of them, for the whole game, forever: nothing ever called
   * Music.playTrack, so the running piece was the hardcoded FALLBACK_TRACK object
   * in music.js - a copy of 'signal-drift' that had silently drifted from the
   * real one, carrying a single chord progression instead of three. Twenty tracks
   * and the entire track registry were unreachable from the UI.
   *
   * The bed is keyed by act, not by ticket: a piece needs longer than ninety
   * seconds to establish itself, and switching every ticket would make the
   * campaign sound like a playlist on shuffle.
   *
   * Acts three and up deliberately use tracks with a tempo. The boss mood adds a
   * sub-bass pulse on the beat grid (music.js schedule()), and over the ambient
   * fallback that pulse landed arrhythmically - which is a large part of why the
   * boss fights never sounded like boss fights.
   */
  var HUB_TRACK = 'signal-drift';

  var ACT_MUSIC = [
    'slow-ascent',          //  1  DEV         calm, with the lift gimmick
    'maintenance-shuffle',  //  2  STAGING     playful, 92
    'ascent-protocol',      //  3  PRODUCTION  driving, 100, march
    'iron-staircase',       //  4  POSTMORTEM  driving, 84, march
    'relay-sprint',         //  5  EDGE        driving, 124, arcade
    'static-climb',         //  6  DATA        driving, 108, glitch
    'wrong-deck',           //  7  CORE        odd, 76
    'loose-bolt',           //  8  ORIGIN      playful, 104
    'sneaky-servo',         //  9  DARK        playful, 88
    'error-404',            // 10  RIVAL       odd, 116, glitch
    'cartwheel',            // 11  SIEGE       playful, 112
    'ascent-protocol',      // 12  NULL        the finale, back where it started
  ];

  /** Which piece an act plays. */
  function trackForLevel(levelId) {
    var L = global.Levels;
    var a = L && L.actOf ? L.actOf(levelId) : null;
    var n = a && a.n ? a.n : 1;
    return ACT_MUSIC[n - 1] || HUB_TRACK;
  }

  /** The bed the player chose in settings, or the default hub piece. */
  function hubTrack() {
    return global.Store.get('musicTrack') || HUB_TRACK;
  }

  /**
   * Switch the bed.
   *
   * Best-effort and self-healing: playTrack returns false for an id the registry
   * does not know, and an unknown id must never leave the game silent, so it
   * falls back to the hub piece rather than doing nothing.
   */
  function playMusic(id, crossfade) {
    if (!global.Music || !global.Store.get('music')) return;
    if (!global.Music.isRunning()) global.Music.start();
    if (global.Music.playTrack(id, { crossfade: crossfade !== false })) return;
    if (id !== HUB_TRACK) global.Music.playTrack(HUB_TRACK, { crossfade: false });
  }

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
    if (id === 'battle') guarded('startBattle', function () { startBattle(data.levelId, data); });
    if (id === 'result') renderResult(data);
    if (id === 'shop') renderShop();
    if (id === 'base') renderBase();
    if (id === 'settings') renderSettings();
    if (id === 'coop') renderCoop();

    if (global.Ads) {
      // Banners on menu screens only. Anything over the playfield is a
      // mis-tap waiting to happen.
      if (id === 'menu' || id === 'map') global.Ads.showBanner();
      else global.Ads.hideBanner();
    }

    // Everything outside a ticket shares the hub bed. Called on every screen
    // change, but playTrack is a no-op when the piece is already playing, so
    // walking the menus does not restart it.
    if (id !== 'battle') playMusic(hubTrack(), id !== 'result');
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
   * Failures the player can see (PD-302)
   *
   * Two different failures, two different responses, and conflating them is
   * worse than doing nothing:
   *
   *   * something threw and the game is still running. The player needs to know
   *     it happened, quietly, and then get on with it. A modal here would
   *     interrupt a battle over a cosmetic bug.
   *   * something threw and the screen is broken - a battle that will not start,
   *     a frame loop that has stopped. The player cannot play, and the honest
   *     thing is to say so and offer the one action that helps.
   *
   * Both quote a message a human can act on. "Something went wrong" is not a
   * bug report, and neither is a stack trace.
   * ------------------------------------------------------------------ */

  var fatalShown = false;
  var expectFatal = false;
  var toastShown = 0;

  function prettyMessage(text) {
    // Exception messages are written for the person who wrote the throw. This
    // does a small amount of tidying so the visible line is not a raw TypeError.
    var m = String(text || 'unknown error');
    m = m.replace(/^Uncaught\s+/, '');
    m = m.replace(/^TypeError:\s*/, '');
    m = m.replace(/^ReferenceError:\s*/, '');
    if (m.length > 140) m = m.slice(0, 137) + '…';
    return m;
  }

  /**
   * The screen is broken. Say so, offer a reload, and offer the details.
   *
   * Shown at most once: a broken loop can report repeatedly and a wall of
   * identical overlays is its own kind of unhelpful.
   */
  function showFatal(entry) {
    if (fatalShown) return;
    fatalShown = true;

    var node = el('fatal');
    if (!node) return;
    clear(node);

    node.appendChild(h('div', { class: 'fatal-card' }, [
      h('h2', { text: 'The game stopped.' }),
      h('p', { class: 'fatal-msg', text: prettyMessage(entry && entry.message) }),
      h('p', { class: 'fatal-note', text:
        'Reloading fixes most of these. If it keeps happening, the details below ' +
        'are what a bug report needs.' }),

      h('div', { class: 'fatal-actions' }, [
        h('button', {
          class: 'btn primary',
          text: 'RELOAD',
          on: { click: function () { global.location.reload(); } },
        }),
        h('button', {
          class: 'btn',
          text: 'DETAILS',
          on: {
            click: function () {
              var box = el('fatal-detail');
              if (!box) return;
              box.classList.toggle('open');
            },
          },
        }),
      ]),

      h('pre', { class: 'fatal-detail', id: 'fatal-detail', text: details() }),
    ]));

    node.classList.add('open');
  }

  /** Everything a bug report needs, in the order it is useful. */
  function details() {
    var lines = [];
    var d = global.Diag;
    if (d) {
      var recent = d.recent();
      for (var i = recent.length - 1; i >= 0; i--) {
        var e = recent[i];
        lines.push(new Date(e.at).toISOString() + '  [' + e.context + ']  ' + e.message);
        if (e.stack) {
          lines.push(e.stack.split('\n').slice(1, 4).join('\n'));
        }
        lines.push('');
      }
    }
    lines.push('');
    if (global.Engine) {
      var st = global.Engine.state();
      if (st) {
        lines.push('battle: ' + (st.status || '?') + '  wave ' + st.waveIndex + '/' + st.totalWaves +
          '  uptime ' + Math.round(st.uptime) + '%  towers ' + st.towers.length +
          '  threats ' + st.threats.length + '  t=' + st.time.toFixed(1));
      }
      lines.push('engine: protocol ' + global.Engine.protocol + ' types ' + global.Engine.typeHash() +
        '  net ' + global.Engine.netMode());
    }
    if (global.Coop && global.Coop.active()) {
      var cs = global.Coop.session();
      lines.push('co-op: role=' + cs.role + ' seat=' + cs.seat + ' seats=' + cs.seats +
        ' sent=' + cs.snapshotsSent + ' in=' + cs.intentsIn);
    }
    if (global.Net && global.Net.session().code) {
      lines.push('room: ' + global.Net.session().code + '  relay ' + global.Net.base() +
        '  status ' + global.Net.session().status);
    }
    lines.push('ua: ' + (global.navigator && global.navigator.userAgent ? global.navigator.userAgent : 'n/a'));
    return lines.join('\n');
  }

  /**
   * Something threw and the game survived.
   *
   * Rate-limited by a cooldown rather than a count, because the failure mode
   * this guards against is a bug firing every frame - and a toast per frame is a
   * second bug on top of the first.
   */
  function showWarnToast(entry) {
    var now = Date.now();
    if (now - toastShown < 15000) return;
    toastShown = now;

    var node = el('toast');
    if (!node) return;
    clear(node);
    node.appendChild(h('span', { class: 'toast-msg', text: 'A problem was caught: ' + prettyMessage(entry.message) }));
    node.appendChild(h('button', {
      class: 'toast-x',
      text: '×',
      'aria-label': 'Dismiss',
      on: { click: function () { node.classList.remove('open'); } },
    }));
    node.classList.add('open');
    global.setTimeout(function () { node.classList.remove('open'); }, 6000);
  }

  /**
   * Run something that must not fail silently.
   *
   * Wraps the boot-time steps and the screen entry points. Anything that throws
   * here has broken a screen, so it reports and then says so on the screen rather
   * than leaving a half-built one.
   */
  function guarded(what, fn) {
    try {
      return fn();
    } catch (err) {
      // Marked BEFORE reporting. report() notifies the listeners synchronously,
      // so a listener that only checked fatalShown would still fire a toast for
      // the very failure the overlay is about to explain - which is how the
      // first version managed to show both at once.
      expectFatal = true;
      var entry = global.Diag ? global.Diag.report(err, what) : { message: String(err) };
      showFatal(entry);
      expectFatal = false;
      return undefined;
    }
  }

  /* ------------------------------------------------------------------ *
   * Co-op
   *
   * Room codes rather than public matchmaking. The reasoning is in
   * docs/COOP.md and it is not only cost: an account-free code needs no lobby
   * service, no moderation and no region selection, and "share this code with
   * the person you are already talking to" is what playing with a friend on a
   * phone actually looks like. Public matchmaking with strangers is a different
   * product and would need all three of those.
   * ------------------------------------------------------------------ */

  var coopState = { status: 'idle', error: null, names: [], seats: 2, theme: 60, tier: 'normal', busy: false };

  /** Sensible defaults for a two-player battle, derived rather than hardcoded so
   *  a theme that cannot host three seats is not offered for three. */
  function coopThemes() {
    var out = [];
    [1, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240].forEach(function (id) {
      var lv = global.Levels.byId(id);
      if (!lv) return;
      // The ticket id is in the label because two tickets in the same act share
      // an act number and can share a name; "3 · Zero-Day" appearing twice would
      // be a choice between two identical-looking options.
      out.push({ id: id, label: '#' + id + ' · ' + lv.act + ' · ' + lv.name });
    });
    return out;
  }

  function renderCoop() {
    var host = el('screen-coop');
    if (!host) return;
    clear(host);

    var session = global.Net.session();
    var cs = global.Coop.session();
    var inRoom = !!session.code;

    var body = [];

    if (!inRoom) {
      body.push(h('p', { class: 'foot-note', text: 'One map, twenty waves, one integrity bar, and everyone pays for their own towers.' }));

      /* ---- host a room ---- */
      var seatBtns = [];
      [2, 3, 4].forEach(function (n) {
        seatBtns.push(h('button', {
          class: 'btn' + (coopState.seats === n ? ' primary' : ''),
          text: n + 'P',
          on: {
            click: function () {
              tap();
              coopState.seats = n;
              renderCoop();
            },
          },
        }));
      });

      var themeSel = h('select', {
        class: 'input',
        on: {
          change: function (e) { coopState.theme = Number(e.target.value); },
        },
      });
      coopThemes().forEach(function (t) {
        themeSel.appendChild(h('option', { value: t.id, text: t.label, selected: t.id === coopState.theme ? 'selected' : null }));
      });

      var tierSel = h('select', {
        class: 'input',
        on: { change: function (e) { coopState.tier = e.target.value; } },
      });
      global.Levels.tiers().forEach(function (t) {
        tierSel.appendChild(h('option', { value: t.id, text: t.name, selected: t.id === coopState.tier ? 'selected' : null }));
      });

      body.push(h('div', { class: 'coop-panel' }, [
        h('h3', { text: 'Host a battle' }),
        h('div', { class: 'row' }, [h('span', { class: 'label', text: 'Players' })].concat(seatBtns)),
        h('div', { class: 'row' }, [h('span', { class: 'label', text: 'Map' }), themeSel]),
        h('div', { class: 'row' }, [h('span', { class: 'label', text: 'Difficulty' }), tierSel]),
        h('button', {
          class: 'btn primary big',
          text: cs.active ? 'IN A BATTLE' : (coopState.busy ? 'CREATING…' : 'CREATE ROOM'),
          on: {
            click: function () {
              if (coopState.busy || cs.active) return;
              tap();
              coopState.busy = true;
              coopState.error = null;
              renderCoop();
              global.Net.create({ name: playerName(), tier: coopState.tier, theme: coopState.theme })
                .then(function () {
                  coopState.busy = false;
                  coopState.status = 'lobby';
                  renderCoop();
                })
                .catch(function (err) {
                  coopState.busy = false;
                  coopState.error = err.message;
                  renderCoop();
                });
            },
          },
        }),
      ]));

      /* ---- join a room ---- */
      var codeInput = h('input', {
        class: 'input code',
        type: 'text',
        inputmode: 'latin',
        autocapitalize: 'characters',
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: '4',
        placeholder: 'CODE',
        on: {
          input: function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); },
        },
      });

      body.push(h('div', { class: 'coop-panel' }, [
        h('h3', { text: 'Join a battle' }),
        h('div', { class: 'row' }, [codeInput, h('button', {
          class: 'btn primary',
          text: coopState.busy ? 'JOINING…' : 'JOIN',
          on: {
            click: function () {
              if (coopState.busy) return;
              var code = (codeInput.value || '').trim();
              if (code.length !== 4) { coopState.error = 'A room code is four characters.'; renderCoop(); return; }
              tap();
              coopState.busy = true;
              coopState.error = null;
              renderCoop();
              joinRoom(code);
            },
          },
        })]),
      ]));
    } else {
      /* ---- the lobby ---- */
      var names = cs.names.slice();
      var seatRows = [];
      for (var i = 0; i < coopState.seats; i++) {
        var isMe = i === session.seat;
        seatRows.push(h('div', { class: 'coop-seat' + (isMe ? ' me' : '') }, [
          h('span', { class: 'seat-num', text: 'P' + (i + 1) }),
          h('span', { class: 'seat-name', text: (names[i] || (i === session.seat ? playerName() : null)) || (i === 0 ? 'Host' : 'waiting…') }),
          isMe ? h('span', { class: 'seat-tag', text: 'you' }) : null,
          i === 0 ? h('span', { class: 'seat-tag host', text: 'host' }) : null,
        ]));
      }

      body.push(h('div', { class: 'coop-panel' }, [
        h('h3', { text: 'Room' }),
        h('div', { class: 'coop-code', text: session.code }),
        h('p', { class: 'foot-note', text: 'Share this code — the other player taps JOIN and types it.' }),
        h('button', {
          class: 'btn',
          text: 'COPY INVITE LINK',
          on: {
            click: function () {
              tap();
              var url = global.Net.inviteUrl();
              if (global.navigator && global.navigator.clipboard) {
                global.navigator.clipboard.writeText(url).catch(function () { /* nothing to do */ });
              }
            },
          },
        }),
        h('div', { class: 'coop-seats' }, seatRows),
        h('p', {
          class: 'foot-note',
          text: global.Coop.isHost()
            ? 'You host. Start the battle whenever everybody is in.'
            : 'Waiting for the host to start.',
        }),
        global.Coop.isHost()
          ? h('button', {
            class: 'btn primary big',
            text: 'START 20 WAVES',
            on: {
              click: function () {
                tap();
                var tier = coopState.tier;
                var theme = coopState.theme;
                var res = global.Coop.host(theme, tier, coopState.seats);
                if (!res.ok) { coopState.error = res.reason; renderCoop(); return; }
                show('battle', { coopoLevel: true });
              },
            },
          })
          : null,
        h('button', {
          class: 'btn',
          text: 'LEAVE ROOM',
          on: { click: function () { tap(); global.Coop.leave(); coopState.status = 'idle'; renderCoop(); } },
        }),
      ]));
    }

    if (coopState.error) body.push(h('p', { class: 'warn', text: coopState.error }));

    host.appendChild(topbar('coop', function () { tap(); show('menu'); }, []));
    host.appendChild(h('div', { class: 'coop-body' }, body));
  }

  /**
   * The player's display name.
   *
   * Generated once and kept. The first version rolled a new name on every call,
   * so the lobby drew one name and the relay was sent a different one - the
   * player saw "P36" and their team-mate saw "P71", which reads as a bug in the
   * relay rather than in the label.
   */
  function playerName() {
    var stored = global.Store && global.Store.get('playerName');
    if (stored) return String(stored).slice(0, 14);
    var name = 'P' + Math.floor(10 + Math.random() * 89);
    if (global.Store) global.Store.set('playerName', name);
    return name;
  }

  function joinRoom(code) {
    global.Net.join(code, { name: playerName() })
      .then(function () {
        coopState.busy = false;
        coopState.status = 'lobby';
        renderCoop();
      })
      .catch(function (err) {
        coopState.busy = false;
        coopState.error = err.message;
        renderCoop();
      });
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
        // Hidden entirely when co-op is switched off in config, because a
        // matchmaking button that cannot match anything is worse than no button.
        global.Net && global.Net.configured()
          ? h('button', { class: 'btn big', text: 'CO-OP', on: { click: function () { tap(); show('coop'); } } })
          : null,
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

  /** The difficulty the player is currently playing at, defaulting to normal. */
  function currentTier() {
    var want = global.Store.get('difficulty');
    var ok = global.Levels.tiers().some(function (t) { return t.id === want; });
    return ok ? want : 'normal';
  }

  function setTier(id) {
    global.Store.set('difficulty', id);
  }

  function tierName(id) {
    var t = global.Levels.tier(id);
    return t ? t.name : 'Normal';
  }

  /**
   * The difficulty picker.
   *
   * It lives on the briefing rather than the map because this is the screen where
   * the numbers a tier changes are already on display: starting bandwidth is a
   * tier dial, so switching tiers visibly moves the budget the player is about to
   * spend. Choosing a difficulty on a screen that shows nothing about it would be
   * asking the player to take the label's word for it.
   */
  function tierBar(current, onPick) {
    var tiers = global.Levels.tiers();
    var now = null;
    tiers.forEach(function (t) { if (t.id === current) now = t; });

    return h('div', { class: 'tier-bar' }, [
      h('span', { class: 'tier-label', text: 'DIFFICULTY' }),
      h('div', { class: 'tier-row' }, tiers.map(function (t) {
        return h('button', {
          class: 'tier-btn' + (t.id === current ? ' on' : ''),
          text: t.name,
          on: {
            click: function () {
              if (t.id === current) return;
              tap();
              setTier(t.id);
              onPick(t.id);
            },
          },
        });
      })),
      h('span', { class: 'tier-blurb', text: now ? now.blurb : '' }),
    ]);
  }

  function renderBrief(levelId) {
    var host = el('screen-brief');
    clear(host);
    var tierId = currentTier();
    // at() rather than byId(): starting bandwidth is a tier dial, so a briefing
    // that quoted normal's budget on an insane run would be lying to the player
    // about the only number they can plan against.
    var l = global.Levels.at(levelId, tierId);
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
      h('span', { class: 'pill tier-pill', text: tierName(tierId) }),
    ]));

    host.appendChild(tierBar(tierId, function (id) {
      setTier(id);
      renderBrief(levelId);
    }));

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

    // The act narrates itself on the ticket that opens it. All twelve act
    // openings were written when the generator landed and rendered nowhere at
    // all, so the campaign read as a list of incidents with no arc.
    var premise = global.Story.narration ? global.Story.narration(l.id, 'premise') : null;
    var left = [h('h1', { class: 'brief-name', text: l.name })];
    if (premise) left.push(h('p', { class: 'brief-narration', text: premise }));
    left.push(h('p', { class: 'brief-text', text: l.brief }));
    left.push(h('div', { class: 'tip' }, [
      h('span', { class: 'tip-label', text: 'ON CALL TIP' }),
      h('span', { class: 'tip-text', text: l.tip }),
    ]));
    left.push(chat);

    host.appendChild(h('div', { class: 'brief-body' }, [
      h('div', { class: 'brief-left' }, left),
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

  function startBattle(levelId, data) {
    applyAccessibility();
    var tierId = currentTier();
    // A co-op battle is generated, not a ticket, and both ends derive it from
    // (theme, tier, seats) rather than receiving it - see Coop.makeLevel. The
    // battle's own state was already started by Coop.host/follow, so this only
    // has to mount and drive it.
    var coop = global.Coop && global.Coop.active();
    var level = coop ? global.Coop.level() : global.Levels.at(levelId, tierId);
    if (coop) tierId = global.Coop.session().tier;
    else global.Engine.start(levelId, tierId);
    global.Story.reset();

    var banner = el('battle-banner');
    clear(el('battle-chat'));
    showBanner(banner, coop ? ('CO-OP · ' + (global.Coop.session().seats) + ' PLAYERS') : (level.code + ' · ' + level.name));

    global.Engine.mount(el('game'), {
      // The host broadcasts from here, and a peer rebuilds the world from
      // snapshots. Wired through the engine's own tick so the send rate is
      // independent of the frame rate: a 30fps phone and a 120fps phone must
      // send state at the same 10Hz.
      onTick: function (dt) {
        if (global.Coop) global.Coop.tick(dt);
      },
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
      onBossHurt: function () {
        lines(global.Story.reaction('bossHurt'));
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
      // The frame loop gave up. Without this the battle would simply stop and
      // the player would be left looking at a frozen board with no explanation.
      onFatal: showFatal,
    });

    global.Engine.run();

    // The act's own piece, then hand the mood machine its starting values. Order
    // matters: playTrack resets the arrangement, so setting the mood first would
    // have it overwritten by the next scheduled bar.
    //
    // A co-op battle has no ticket id - it is generated - but it is themed on
    // one, and that theme is exactly what the music keying wants: a battle on an
    // act-6 map should sound like act 6. Passing the undefined levelId here threw
    // inside trackForLevel and aborted the rest of startBattle, which meant
    // Engine.run() never ran and the host sent no snapshots at all.
    playMusic(trackForLevel(coop ? global.Coop.session().theme : levelId), false);
    if (global.Music) {
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
    // A co-op battle is not a ticket. It is themed on one, and `Engine.result()`
    // reports that theme as the level id - so without this, clearing a co-op
    // battle would award stars and credits for a campaign ticket the player may
    // never have played, and could unlock a map they had not reached. Co-op is
    // recorded as a co-op battle or not at all.
    var coop = global.Coop && global.Coop.active();
    var record = coop ? null : global.Profile.complete(result.levelId, result, global.Levels.count());
    // Ad cadence: every third clear, never on a loss, never on a first clear,
    // and never if the player paid to remove them. A loss is the moment a
    // player is most likely to quit, so that is the worst possible time to
    // interrupt them with an ad.
    var clears = global.Profile.load().clears;

    var reveal = function () {
      show('result', {
        result: result, won: won, record: record,
        hasNext: result.levelId < global.Levels.count(),
      });
    };

    // The interstitial is awaited before the results are revealed. Showing both
    // at once put the payout screen underneath an ad the player had not
    // dismissed, so the stat line, the doubled-payout offer and the next-ticket
    // button were all being tapped blind. A failure to show still reveals the
    // result - an ad must never be able to strand a player on the battle screen.
    if (won && clears > 1 && clears % 3 === 0 && global.Ads) {
      global.Ads.showInterstitial().then(reveal, reveal);
      return;
    }
    reveal();
  }

  /**
   * Pay the player a second time for a win, in exchange for a rewarded ad.
   *
   * Granted through the same Profile.addCoins path as the first payout, so the
   * doubled credits live inside the signed save and survive a reload. An ad
   * payout a player can lose by closing the app is worse than no payout.
   */
  function doublePayout(data) {
    if (!global.Ads || typeof global.Ads.showRewarded !== 'function') return;
    tap();
    global.Ads.showRewarded().then(function (ok) {
      // Dismissed, no fill, or no ad available: nothing is granted and the
      // offer stays on screen so the player can try again later.
      if (!ok) return;
      global.Profile.addCoins(data.record.credits);
      data.record.doubled = true;
      renderResult(data);
    });
  }

  function renderResult(data) {
    var host = el('screen-result');
    clear(host);
    var r = data.result;
    // `levelId` is a theme for a co-op battle and a ticket otherwise, and
    // `record` is null for co-op, so every progress-derived line below is
    // guarded rather than assumed.
    var coop = !data.record;
    var level = global.Levels.byId(r.levelId);

    host.appendChild(h('div', { class: 'result-body' }, [
      h('h1', { class: 'result-title ' + (data.won ? 'ok' : 'bad'), text: data.won ? 'TICKET CLOSED' : 'PROD IS DOWN' }),
      h('p', { class: 'result-sub', text: coop
        ? ('CO-OP · ' + (global.Coop.session().theme) + '  ·  ' + (r.tier && r.tier !== 'normal' ? tierName(r.tier) : 'normal'))
        : (level.code + ' · ' + level.name + (r.tier && r.tier !== 'normal' ? '  ·  ' + tierName(r.tier) : '')) }),

      data.won && data.record ? starsFor(data.record.stars) : h('div', { class: 'stars' }),

      h('div', { class: 'result-grid' }, [
        stat('UPTIME', Math.round(r.uptime) + '%'),
        stat('LEAKS', String(r.leaks)),
        stat('KILLED', String(r.kills)),
        stat('EARNED', String(r.earned)),
        stat('TOWERS', String(r.towers)),
        stat('TIME', Math.floor(r.seconds / 60) + ':' + ('0' + (r.seconds % 60)).slice(-2)),
      ]),

      h('p', { class: 'debrief', text: global.Story.debrief(r) }),

      // The act's closing beat, on the ticket that ends it. Twelve of these were
      // written and never shown anywhere; a win that closes an act should say so.
      data.won && global.Story.narration && global.Story.narration(r.levelId, 'closing')
        ? h('p', { class: 'act-closing', text: global.Story.narration(r.levelId, 'closing') })
        : null,

      data.won && data.record && data.record.credits
        ? h('p', { class: 'payout', text: '+' + data.record.credits + ' credits  ·  ★' + data.record.stars })
        : null,

      // The one rewarded placement in the game.
      //
      // Watching an ad to double a payout is voluntary, it lands at the moment a
      // player is happiest, and it is the only place a rewarded ad makes sense in
      // a tower defence game - there is no revive to sell and interrupting a wave
      // would be worse than the revenue. Owners of 'remove ads' never see it, and
      // neither does anyone when the kill switch is off.
      data.won && data.record && data.record.credits && !data.record.doubled &&
      global.Ads && !global.Ads.adsRemoved() && global.Ads.adsEnabled()
        ? h('button', {
            class: 'btn rewarded',
            text: '▶ WATCH TO DOUBLE  +' + data.record.credits,
            on: { click: function () { doublePayout(data); } },
          })
        : null,

      data.record && data.record.doubled
        ? h('p', { class: 'payout doubled', text: 'payout doubled — thanks for watching' })
        : null,
      data.record && data.record.unlocked
        ? h('p', { class: 'unlock', text: 'NEW TICKET UNLOCKED — ' + global.Levels.byId(data.record.unlocked).code })
        : null,

      h('div', { class: 'result-buttons' }, [
        // RETRY and NEXT TICKET are campaign controls: they address a ticket by
        // id, and a co-op battle has a theme instead. Offering them here would
        // either restart a campaign ticket the player was not playing, or do
        // nothing at all.
        coop
          ? h('button', { class: 'btn primary', text: 'BACK TO CO-OP', on: { click: function () { tap(); show('coop'); } } })
          : h('button', { class: 'btn', text: 'RETRY', on: { click: function () { tap(); show('battle', { levelId: r.levelId }); } } }),
        !coop && data.won && data.hasNext
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

    // The track registry. Without this the twenty-one generated pieces in
    // tracks.js are unreachable: the game picks an act's bed for you and there is
    // otherwise no way to hear the rest. Each button auditions immediately,
    // because a track name tells you nothing about what it sounds like.
    body.appendChild(h('section', { class: 'track-group' }, [
      h('h2', { class: 'env-title', text: 'TRACK' }),
      h('div', { class: 'track-list' }, global.Music.tracks().map(function (t) {
        var on = hubTrack() === t.id;
        return h('button', {
          class: 'track-btn' + (on ? ' on' : ''),
          on: {
            click: function () {
              tap();
              global.Store.set('musicTrack', t.id);
              playMusic(t.id, false);
              renderSettings();
            },
          },
        }, [
          h('span', { class: 'track-name', text: t.name }),
          h('span', { class: 'track-vibe', text: t.vibe || '' }),
        ]);
      })),
    ]));

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
    /*
     * Two paths, said separately.
     *
     * This used to read "No network calls during play", which was true and
     * stopped being true when co-op shipped: a co-op room is a connection to a
     * relay. The old sentence was not vague, it was wrong, and an app whose
     * settings screen contradicts its Data safety form is a review failure
     * waiting to happen. Single player still makes no network calls at all, so
     * that is what it says now - and the co-op path says what it does.
     */
    body.appendChild(h('p', { class: 'about', text: 'Playing solo makes no network calls at all. No analytics, no accounts. Progress and settings live on this device only.' }));
    body.appendChild(h('p', { class: 'about', text: 'Co-op connects to our relay. It carries your chosen display name and the state of the room, keeps them in memory for the life of the room, and forgets them fifteen minutes after the last player leaves.' }));
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

    /* ---- co-op wiring ------------------------------------------- *
     *
     * The two callbacks that make the session work. Every relay message goes
     * through Coop.onMessage, which decides whether it is authoritative - the
     * relay is a post box and does not enforce that, so a peer has to.
     */
    // Any failure the game survived is worth saying out loud, quietly. The frame
    // loop reports its own and stops after three; everything else lands here.
    if (global.Diag) {
      global.Diag.onError(function (entry) {
        // A fatal already has a screen of its own; a toast over it is noise.
        // `expectFatal` covers the window between the report and the overlay.
        if (fatalShown || expectFatal) return;
        if (entry.context === 'frame') return;   // the loop owns this one
        showWarnToast(entry);
      });
    }

    if (global.Net && global.Coop) {
      global.Net.on('message', function (msg, from) {
        global.Coop.onMessage(msg, from);
        // The lobby redraws on membership changes, so a seat appearing is
        // visible without polling.
        if (current === 'coop' && msg && (msg.t === 'joined' || msg.t === 'left')) renderCoop();
      });
      global.Net.on('status', function (status) {
        coopState.status = status;
        if (current === 'coop' && (status === 'error' || status === 'idle')) renderCoop();
      });
      global.Net.on('error', function (message) {
        coopState.busy = false;
        coopState.error = message;
        if (current === 'coop') renderCoop();
      });

      // A peer is pulled into the battle the moment the host starts it, without
      // having to press anything: being told "the host started" and then having
      // to find a button is the kind of friction that reads as a broken game.
      global.Coop.onStarted(function () {
        if (global.Coop.session().seats) coopState.seats = global.Coop.session().seats;
        show('battle', { coopoLevel: true });
      });

      // An invite link: `?coop=AB12` drops the player straight into the join
      // path. On a phone this is the whole acquisition funnel - the share sheet
      // is the only reliable way to get a code from one person to another.
      var m = /[?&]coop=([A-Za-z0-9]{4})/.exec(global.location.search || '');
      if (m) {
        coopState.busy = true;
        show('coop');
        joinRoom(m[1]);
      }
    }

    var quit = el('battle-quit');
    if (quit) {
      quit.addEventListener('click', function (e) {
        if (!e.isTrusted) return;
        tap();
        // Abandoning is not a loss: it records nothing and unlocks nothing, so
        // a player cannot farm an easy level by quitting mid-wave.
        if (global.Coop && global.Coop.active()) {
          global.Coop.leave();
          show('menu');
          return;
        }
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
