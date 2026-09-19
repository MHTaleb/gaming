/**
 * engine.js - the battle. Simulation, rendering, and the in-game HUD.
 *
 * The HUD is drawn in world units on the canvas rather than built from DOM.
 * That is a deliberate choice: the HUD has to line up with the playfield to the
 * pixel at every aspect ratio and every device pixel ratio, and a DOM overlay
 * would need its own layout pass kept in sync with the canvas transform. One
 * coordinate system, one place for bugs to hide.
 *
 * Simulation and rendering are separate. `step(dt)` never draws and `draw()`
 * never mutates, so the balance tool can run a level headlessly at 60x speed
 * and get the same answers the player would.
 */
(function (global) {
  'use strict';

  var Map = null;      // resolved at mount, since script order is index.html's business

  var state = null;
  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var cssW = 0, cssH = 0;
  var raf = null;
  var lastNow = 0;
  var hooks = {};
  var layout = null;
  var view = { x: 0, y: 0 };   // world-space shake offset
  var bindCount = 0;   // times the pointer listeners have been attached; must stay 1

  /**
   * Consecutive failed frames.
   *
   * Reset by any frame that completes, so a transient error never accumulates
   * towards stopping a battle that is otherwise running. Three is past any
   * plausible one-off and still stops within a twentieth of a second.
   */
  var MAX_FRAME_FAILURES = 3;
  var frameFailures = 0;
  var frameError = null;

  /** Movement in CSS px before a press on a card counts as a drag, not a tap. */
  var DRAG_THRESHOLD = 9;

  /* ------------------------------------------------------------------ *
   * Layout
   * ------------------------------------------------------------------ */

  /**
   * The HUD strip is laid out from the world width, not from fixed pixels, so
   * a narrow screen tightens it and a wide screen spreads it out. Card width is
   * clamped because a 60px card cannot hold a cost and a name, and a 120px card
   * on a tablet looks like a mistake.
   */
  function computeLayout() {
    var VW = Map.VW();
    // VH is a plain number like MAP_W/COLS/ROWS; VW is a function because it
    // depends on the device aspect. The inconsistency is deliberate and this
    // is the one place it bites.
    var VH = Map.VH;
    var pad = 10;
    var hudTop = Map.hudTop();
    var hudH = Map.HUD_H;

    var leftMin = 104, rightMin = 132;
    var leftW = Math.round(Math.min(168, Math.max(leftMin, VW * 0.2)));
    var rightW = Math.round(Math.min(196, Math.max(rightMin, VW * 0.24)));
    var gap = 10;

    // The palette gets first call on the width, because a tower you cannot see
    // is a tower you do not own. Its needs are exact - n cards of a legible
    // minimum - while the panels' are not, so the panels are what give way.
    var ids = paletteIds();
    var n = ids.length || 1;
    var cgap = 5;
    var minCard = 50;
    var wantCard = 92;

    var cardsW = function (l, r) { return VW - pad * 2 - gap * 2 - l - r; };
    var cardW = Math.floor((cardsW(leftW, rightW) - (n - 1) * cgap) / n);
    if (cardW < minCard) {
      var short = minCard * n + (n - 1) * cgap - cardsW(leftW, rightW);
      var takeLeft = Math.min(short, leftW - leftMin);
      leftW -= takeLeft;
      short -= takeLeft;
      rightW -= Math.min(short, rightW - rightMin);
      cardW = Math.floor((cardsW(leftW, rightW) - (n - 1) * cgap) / n);
    }
    // A floor at all costs: an unreadable card beats an overflowing row, and the
    // floor is where the short names in towers.js are chosen to fit.
    cardW = Math.max(44, Math.min(wantCard, cardW));

    var midX = pad + leftW + gap;
    var midW = VW - midX - rightW - gap - pad;

    var cardH = 58;
    var totalW = n * cardW + (n - 1) * cgap;
    var cardsX = midX + Math.max(0, (midW - totalW) / 2);

    var cards = ids.map(function (id, i) {
      return { id: id, x: cardsX + i * (cardW + cgap), y: hudTop + (hudH - cardH) / 2, w: cardW, h: cardH };
    });

    var rx = VW - pad - rightW;
    var halfW = Math.round((rightW - 8) / 2);

    /**
     * The right column is three stacked rows, and their heights are derived
     * from the content rather than hand-placed.
     *
     * This used to be fixed offsets (hudTop + 10 / + 42 / + hudH - pad - btnH)
     * and they collided twice, both visible on screen: the wave counter and its
     * status line were drawn *inside* the wave button's rect, and the
     * speed/pause pair landed on top of upgrade/sell. Deriving each row from the
     * one above it is what stops that returning when HUD_H changes - the whole
     * stack is 26 + 6 + 26 + 6 + 24 = 88, and HUD_H must stay >= 88 + 2 * pad.
     *
     * The stack hangs from the top, not the bottom, so a strip that is ever too
     * short overflows downward into the padding instead of pushing the wave
     * button up off the strip.
     */
    var rowNext = 26;   // the wave button
    var rowInfo = 26;   // two text lines: "WAVE n/m" over the status line
    var rowBtn = 24;    // speed/pause, and upgrade/sell when a tower is selected
    var rowGap = 6;

    var nextY = hudTop + pad;
    var infoY = nextY + rowNext + rowGap;
    var pauseY = infoY + rowInfo + rowGap;

    /**
     * The left column's content is a fixed block - BANDWIDTH label, the number,
     * then UPTIME and its bar - about 65 units tall, so it is centred in the
     * strip rather than pinned to the top. Without this it would hug the top
     * edge with dead space beneath it, next to a right column that fills the
     * strip.
     */
    var leftBodyH = 65;
    var leftY = hudTop + pad + Math.max(0, Math.round((hudH - pad * 2 - leftBodyH) / 2));

    layout = {
      pad: pad,
      hudTop: hudTop,
      hudH: hudH,
      left: { x: pad, y: hudTop + pad, w: leftW, h: hudH - pad * 2 },
      leftY: leftY,
      cards: cards,
      cardH: cardH,
      right: { x: rx, y: hudTop + pad, w: rightW, h: hudH - pad * 2 },
      infoY: infoY,
      rowNext: rowNext,
      rowInfo: rowInfo,
      rowBtn: rowBtn,
      btnY: pauseY,
      btnH: rowBtn,
      btnNext: { x: rx, y: nextY, w: rightW, h: rowNext },
      btnSpeed: { x: rx, y: pauseY, w: halfW, h: rowBtn },
      btnPause: { x: rx + halfW + 8, y: pauseY, w: halfW, h: rowBtn },
      btnUpgrade: { x: rx, y: infoY, w: halfW, h: rowBtn },
      btnSell: { x: rx + halfW + 8, y: infoY, w: halfW, h: rowBtn },
      VW: VW, VH: VH,
    };
    return layout;
  }

  function hitRect(r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Which build card is under this world point, if any. */
  function cardAt(x, y) {
    if (!layout) return null;
    for (var i = 0; i < layout.cards.length; i++) {
      if (hitRect(layout.cards[i], x, y)) return layout.cards[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Setup
   * ------------------------------------------------------------------ */

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = Math.min(2.5, global.devicePixelRatio || 1);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    Map.fit(cssW, cssH);
    computeLayout();
  }

  function mount(el, opts) {
    Map = global.PDMap;
    canvas = el;
    hooks = opts || {};
    ctx = canvas.getContext('2d', { alpha: false });
    resize();
    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { global.setTimeout(resize, 120); });
    attachInput();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Determinism, the action log, and replay
   *
   * A run is a pure function of (ticket, tier, actions). That is the basis of
   * replay, ghost racing, daily seeds and any future co-op, and it very nearly
   * held already: the campaign is a pure function of the ticket number and the
   * spawner is seeded, but two Math.random() calls had crept into threats.js.
   * Both were cosmetic - a wobble phase and a healing spark - so outcomes were
   * stable, but a replay would not draw the same frames, and the next person to
   * add a random call would have had no way to notice they had just broken the
   * property the whole feature depends on.
   * ------------------------------------------------------------------ */

  /** A seeded stream, so the simulation has no unseeded randomness left. */
  function makeRand(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Stable seed for a ticket at a tier: same battle, same stream, always. */
  function seedFor(levelId, tierId) {
    var s = String(levelId) + ':' + String(tierId || 'normal');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /**
   * Log a player action, if this run is being recorded.
   *
   * Every entry carries the simulation time it happened at, because a replay
   * must apply it at the same instant, not merely in the same order: placing a
   * tower one tick after a wave spawns is a different outcome from placing it
   * one tick before. Nothing is recorded while replaying, or a replay would
   * append to the very log it is reading.
   */
  function record(entry) {
    if (!state || state.replay) return;
    entry.at = state.time;
    state.actions.push(entry);
  }

  /** Pay every seat an equal share. Used by the shared early-call bonus. */
  function payAll(amount) {
    if (!state.seats || state.seats.length <= 1) {
      state.bandwidth += amount;
      state.earned += amount;
      return;
    }
    var share = amount / state.seats.length;
    for (var i = 0; i < state.seats.length; i++) state.credit(i, share);
    state.earned += amount;
  }

  /**
   * Apply a recorded action.
   *
   * Towers are addressed by tile, not by object identity: a replay rebuilds the
   * board from scratch, so the only stable handle on a tower is where it stands.
   * A build carries the player who paid for it; an upgrade or a sell acts on the
   * tower that is standing there, and therefore on whatever purse owns it.
   */
  function applyAction(a) {
    if (a.t === 'build') {
      global.Towers.place(state, a.c, a.r, a.type, Map, a.p);
    } else if (a.t === 'upgrade') {
      var up = global.Towers.at(state, a.c, a.r);
      if (up) global.Towers.upgrade(state, up);
    } else if (a.t === 'sell') {
      var tw = global.Towers.at(state, a.c, a.r);
      if (tw) global.Towers.sell(state, tw);
    } else if (a.t === 'wave') {
      startNextWave();
    }
  }

  /** Drain the actions that are due, at the top of the tick that is due them. */
  function applyDueActions() {
    if (!state || !state.replay) return;
    while (state.replayIndex < state.replay.length &&
           state.replay[state.replayIndex].at <= state.time) {
      applyAction(state.replay[state.replayIndex++]);
    }
  }

  /* ------------------------------------------------------------------ *
   * Network state: snapshots out, snapshots in
   *
   * The host is the only authority. A peer never simulates - it receives state
   * and draws it. That split is what makes a 20-wave battle survivable over a
   * phone connection, and it is why this section is a codec and an interpolator
   * rather than anything that touches the rules.
   *
   * Wire format is arrays of numbers, not objects of named fields, because the
   * same state is sent ten times a second to every player and a field name is
   * paid for on every threat in every frame. Roughly: a named-field snapshot of
   * a busy wave is about 40KB, and the same state here is under 4KB.
   * ------------------------------------------------------------------ */

  var PROTOCOL = 1;

  /**
   * Threat types are sent as indices into a table both ends derive from
   * `Threats.DEFS`, sorted so the order cannot depend on insertion order.
   *
   * The hash is the important part. An index is meaningless if the two ends
   * disagree about the table, and two clients running different builds would
   * otherwise render a Drone as a Zero-Day and - worse - never say so. A
   * mismatch is refused at the handshake instead of being discovered as a
   * "weird bug" mid-battle.
   */
  var TYPE_TABLE = null;
  function threatTypes() {
    if (TYPE_TABLE) return TYPE_TABLE;
    var D = (global.Threats && global.Threats.DEFS) || {};
    TYPE_TABLE = Object.keys(D).sort();
    return TYPE_TABLE;
  }

  function typeHash() {
    var s = threatTypes().join(',');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  var r1 = function (v) { return Math.round(v * 10) / 10; };
  var r2 = function (v) { return Math.round(v * 100) / 100; };

  /** The whole render-relevant world, small enough to send at 10Hz. */
  function snapshot() {
    if (!state) return null;
    var types = threatTypes();
    // Read once, not per tower: order() returns a copy, and a busy board is
    // seventy-odd towers ten times a second.
    var order = global.Towers.order();

    var threats = [];
    for (var i = 0; i < state.threats.length; i++) {
      var t = state.threats[i];
      if (t.dead) continue;
      var ti = types.indexOf(t.type);
      if (ti < 0) continue;
      var flags = 0;
      if (t.immune && t.immune.length) flags |= 1;
      if (t.revived) flags |= 2;
      if (t.leaked) flags |= 4;
      threats.push([
        ti, r1(t.x), r1(t.y), r2(t.angle),
        Math.max(0, Math.round(t.hp)), Math.round(t.maxHp),
        r1(t.radius), r2(t.flash || 0), r2(t.wobble || 0), r2(t.slowMul || 1),
        flags,
      ]);
    }

    var towers = [];
    for (i = 0; i < state.towers.length; i++) {
      var w = state.towers[i];
      var wi = order.indexOf(w.type);
      if (wi < 0) continue;
      towers.push([w.c, w.r, wi, w.level, w.owner || 0, r2(w.angle)]);
    }

    var purses = [];
    for (i = 0; i < state.seats.length; i++) purses.push(Math.floor(state.seats[i].bandwidth));

    return {
      v: PROTOCOL,
      th: typeHash(),
      t: r2(state.time),
      w: state.waveIndex,
      tw: state.totalWaves,
      st: state.status,
      up: Math.round(state.uptime),
      k: state.kills,
      l: state.leaks,
      e: Math.round(state.earned),
      b: purses,
      s: towers,
      m: threats,
    };
  }

  /** Send a peer on its way: same shape as snapshot(), built from nothing. */
  function emptySnapshot() {
    return {
      v: PROTOCOL, th: typeHash(), t: 0, w: 0, tw: 0, st: 'building',
      up: 100, k: 0, l: 0, e: 0, b: [], s: [], m: [],
    };
  }

  /**
   * Put the local player in a seat and stop this client from simulating.
   *
   * Called on a peer, never on the host. `seat` decides which purse the HUD and
   * the build cards read, because `state.bandwidth` is the ACTIVE seat - a peer
   * that leaves activeSeat at 0 would show the host's money and let its palette
   * price every tower against somebody else's account.
   */
  function joinAsPeer(seat) {
    if (!state) return false;
    state.net = { mode: 'peer', seat: seat || 0, buf: [], renderTime: 0, delay: 0.15 };
    state.activeSeat = seat || 0;
    return true;
  }

  function hostAs(seats) {
    if (!state) return false;
    state.net = { mode: 'host', seat: 0, buf: [], renderTime: 0, delay: 0 };
    return true;
  }

  function netMode() {
    return state && state.net ? state.net.mode : 'solo';
  }

  /** Receive a snapshot from the host. */
  function applySnapshot(snap) {
    if (!state || !snap) return false;
    if (!state.net || state.net.mode !== 'peer') return false;
    if (snap.v !== PROTOCOL || snap.th !== typeHash()) {
      // Refused loudly rather than rendered wrongly: a protocol or content
      // mismatch means the two clients disagree about what the numbers mean.
      state.net.mismatch = true;
      return false;
    }
    state.net.mismatch = false;
    // Arrival time, not the host's clock. Interpolation is between two moments
    // this client actually observed, so a host running ahead does not make the
    // peer extrapolate into the future.
    state.net.buf.push({ at: state.net.renderTime, snap: snap });
    if (state.net.buf.length > 10) state.net.buf.shift();
    return true;
  }

  /**
   * Rebuild `state.threats` and `state.towers` for drawing, interpolated.
   *
   * Rendered `delay` behind the newest snapshot so there is always a snapshot
   * ahead to interpolate *towards*. Without a deliberate delay the newest
   * snapshot is the only one with a future, so every arriving packet would snap
   * the world forward and the game would judder at exactly the packet rate.
   */
  function interpolate() {
    var net = state.net;
    if (!net || !net.buf.length) return;
    var target = net.renderTime - net.delay;

    var a = net.buf[0];
    var b = net.buf[net.buf.length - 1];
    for (var i = 0; i < net.buf.length; i++) {
      if (net.buf[i].at <= target) a = net.buf[i];
      if (net.buf[i].at >= target) { b = net.buf[i]; break; }
    }
    // The target is past every snapshot we hold: render the newest and stop.
    //
    // This was wrong and the symptom was nasty. `b` defaulted to the OLDEST
    // snapshot, so once the render clock ran ahead of arrivals - which is normal
    // after any hitch, and always in the first moments of a battle - the peer
    // interpolated between the newest state and the oldest one. The world
    // rendered as a stale frame, and because it looked *plausible* the bug read
    // as "towers not syncing" rather than as an index error.
    //
    // Note for whoever reads this next: the fix is the default ABOVE, `b` = the
    // last entry. The `if (b.at < a.at)` guard below is belt-and-braces and
    // cannot currently fire, because `at` only ever increases, so `a` - the last
    // entry at or before the target - is never later than `b`. Both are load
    // bearing in different ways: removing the default, on the assumption that
    // the guard covers it, puts the original bug straight back.
    if (b.at < a.at) b = a;
    var span = b.at - a.at;
    var f = span > 0.0001 ? Math.min(1, Math.max(0, (target - a.at) / span)) : 0;

    var latest = net.buf[net.buf.length - 1].snap;
    state.time = latest.t;
    state.waveIndex = latest.w;
    state.totalWaves = latest.tw;
    state.status = latest.st;
    state.uptime = latest.up;
    state.kills = latest.k;
    state.leaks = latest.l;
    state.totalEarned = latest.e;
    for (i = 0; i < state.seats.length && i < latest.b.length; i++) {
      state.seats[i].bandwidth = latest.b[i];
    }

    var types = threatTypes();
    var D = global.Threats.DEFS;

    // Match by index only when the two ends agree on order, which they do for
    // anything the host did not reorder - and the host does not reorder, because
    // the composer appends. When they do not line up, the newcomer is spawned at
    // its own position rather than teleported from someone else's.
    var prev = a.snap.m;
    var next = b.snap.m;
    var out = [];
    for (i = 0; i < next.length; i++) {
      var n = next[i];
      var typeId = types[n[0]];
      var def = D[typeId];
      if (!def) continue;
      var p = null;
      if (a !== b && i < prev.length && prev[i][0] === n[0]) p = prev[i];
      var x = n[1], y = n[2], ang = n[3];
      if (p) {
        x = p[1] + (n[1] - p[1]) * f;
        y = p[2] + (n[2] - p[2]) * f;
        // Angles are interpolated the short way round; going the long way makes
        // a threat spin on the spot every time it crosses the seam at PI.
        var d = n[3] - p[3];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ang = p[3] + d * f;
      }
      out.push({
        type: typeId,
        def: def,
        cls: def.cls,
        x: x, y: y, angle: ang,
        hp: n[4], maxHp: n[5] || 1,
        radius: n[6],
        flash: n[7], wobble: n[8], slowMul: n[9],
        immune: (n[10] & 1) ? ['*'] : [],
        revived: (n[10] & 2) ? 1 : 0,
        leaked: !!(n[10] & 4),
        dead: false,
        traits: [],
      });
    }
    state.threats = out;

    var towerOrder = global.Towers.order();
    state.towers = b.snap.s.map(function (w) {
      var tp = towerOrder[w[2]];
      var pos = Map.tileToWorld(w[0], w[1]);
      return {
        type: tp, c: w[0], r: w[1], x: pos.x, y: pos.y,
        level: w[3], owner: w[4], angle: w[5],
        cooldown: 0, shots: 0, invested: 0, disabledUntil: 0,
      };
    });
  }

  /** The local player's seat, which is whose money the HUD shows. */
  function localSeat() {
    return state && state.net && state.net.mode === 'peer' ? state.net.seat : 0;
  }

  /**
   * Apply an action that arrived over the network.
   *
   * Deliberately NOT the same path as `applyAction` above, and the difference is
   * the point. A replay is a recording of input this client already accepted, so
   * it is trusted and re-applied verbatim. This is a stranger's message, so every
   * field is validated and the player id comes from the relay's attribution
   * rather than from the message body.
   *
   * The ownership rule is the one that needs saying out loud: you may only
   * upgrade or sell a tower you paid for. Selling is the obvious exploit - a
   * player could strip a team-mate's defence to fund their own - and upgrading
   * somebody else's tower is worse than it looks, because the refund on a later
   * sale goes to the OWNER, so funding a team-mate by upgrading their tower gives
   * the money away with no way to get it back. Both are refused rather than
   * negotiated; a "fund a team-mate" feature would need its own design, not a
   * loophole in this check.
   */
  function remoteIntent(playerId, a) {
    if (!state || !a || typeof a !== 'object') return { ok: false, reason: 'bad intent' };
    var seat = Number(playerId);
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.seats.length) {
      return { ok: false, reason: 'no such player' };
    }

    if (a.t === 'build') {
      if (!Number.isInteger(a.c) || !Number.isInteger(a.r)) return { ok: false, reason: 'bad tile' };
      if (!Map.inGrid(a.c, a.r)) return { ok: false, reason: 'bad tile' };
      return global.Towers.place(state, a.c, a.r, a.type, Map, seat);
    }

    if (a.t === 'upgrade' || a.t === 'sell') {
      if (!Number.isInteger(a.c) || !Number.isInteger(a.r)) return { ok: false, reason: 'bad tile' };
      var tw = global.Towers.at(state, a.c, a.r);
      if (!tw) return { ok: false, reason: 'no tower there' };
      if ((tw.owner || 0) !== seat) return { ok: false, reason: 'not your tower' };
      return a.t === 'upgrade'
        ? global.Towers.upgrade(state, tw)
        : global.Towers.sell(state, tw);
    }

    if (a.t === 'wave') {
      if (state.waveIndex >= state.totalWaves) return { ok: false, reason: 'no waves left' };
      if (state.status !== 'building') return { ok: false, reason: 'wave already running' };
      startNextWave();
      return { ok: true };
    }

    return { ok: false, reason: 'unknown action' };
  }

  /* ------------------------------------------------------------------ *
   * Seats: co-op's shared map, individual purses
   *
   * Co-op is one battlefield and one integrity bar, with every player free to
   * build anywhere on the road - but each player spends only their own money.
   * That split is why seats exist: the map and the waves are shared, the purse
   * is not.
   *
   * `state.bandwidth` is deliberately kept as an accessor onto the ACTIVE seat
   * rather than being ripped out and replaced. There are only eleven call sites
   * that touch money, but they are spread across the engine, the towers and the
   * input layer, and rewriting them all to be seat-aware would have put the
   * single-player game - which is released and verified - through a refactor for
   * no behaviour change. With one seat, `state.bandwidth` IS the player's money
   * exactly as before; with several, it is the local player's money and the
   * co-op code addresses seats explicitly.
   * ------------------------------------------------------------------ */

  var SEAT_COLOURS = ['#22d3ee', '#f59e0b', '#4ade80', '#a78bfa', '#f472b6', '#38bdf8'];

  function makeSeats(count, bandwidth, names) {
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({
        id: i,
        name: (names && names[i]) || ('P' + (i + 1)),
        colour: SEAT_COLOURS[i % SEAT_COLOURS.length],
        bandwidth: bandwidth,
        startingBandwidth: bandwidth,
        earned: 0,
        spent: 0,
        kills: 0,
      });
    }
    return out;
  }

  /** The seat a player id refers to, defaulting to the local player. */
  function seatOf(game, playerId) {
    if (!game || !game.seats || !game.seats.length) return null;
    var id = playerId === undefined || playerId === null ? game.activeSeat : playerId;
    return game.seats[id] || game.seats[game.activeSeat] || game.seats[0];
  }

  /* ------------------------------------------------------------------ *
   * Level lifecycle
   * ------------------------------------------------------------------ */

  function start(levelId, tierId, seats) {
    Map = global.PDMap;
    // at() is the only way to get a level object that carries a tier, and
    // tuning() reads the tier back off the level - so this single line is the
    // whole plumbing between the difficulty a player picked and the stats the
    // spawner applies to every wave.
    //
    // A level object may also be handed in directly, which is how a co-op battle
    // starts: it is generated rather than sitting in the campaign list, so there
    // is no id to look up. `seedFor` hashes the id as a string, so a generated
    // level needs only a stable id of its own.
    var level = (levelId && typeof levelId === 'object' && levelId.waves)
      ? levelId
      : (global.Levels.at(levelId, tierId) || global.Levels.all()[0]);

    var paths = global.Levels.paths();
    var waypoints = paths[level.path] || paths.switchback;
    var pathInfo = Map.setPath(waypoints, global.Levels.base());

    state = {
      level: level,
      levelId: level.id,
      tier: level.tier || 'normal',
      // Determinism plumbing. `rand` replaces the last unseeded randomness in
      // the simulation; `actions` is the replay log; `replay` is a log being
      // played back, which is also what switches recording off.
      rand: makeRand(seedFor(level.seedId || level.id, level.tier || tierId)),
      actions: [],
      replay: null,
      replayIndex: 0,
      record: record,
      seats: makeSeats(seats || 1, level.bandwidth),
      activeSeat: 0,
      uptime: 100,
      leaks: 0,
      kills: 0,
      earned: 0,
      killIncome: 0,        // earned from kills alone; the rest is wave bonuses
      time: 0,
      waveIndex: 0,          // waves *started*
      totalWaves: level.waves.length,
      // 'building' is the between-waves state: the player is spending, and the
      // next wave is theirs to call early for a bonus. A level never sits in
      // 'building' with threats on the field.
      status: 'building',    // building | wave | won | lost
      speed: Math.max(1, Math.min(2, Number(global.Store && global.Store.get('gameSpeed')) || 1)),
      paused: false,
      pending: [],           // queued spawns: {type, at, hpScale, speedScale, seed}
      threats: [],
      towers: [],
      shots: [],
      effects: [],
      selectedBuild: null,
      selectedTower: null,
      hover: null,
      drag: null,            // {type, active, startX, startY, x, y, x0, y0, world}
      shake: 0,
      flash: 0,
      waveClearedAt: 0,
      earlyBonuses: 0,
      pathLength: pathInfo.length,
      roadTiles: pathInfo.tiles,
      bossSpawned: false,
    };

    // Money lives on the seats. Every existing `state.bandwidth` read or write
    // now means "the active player's purse" without changing a single call site,
    // and with one seat that is the same value it always was.
    Object.defineProperty(state, 'bandwidth', {
      get: function () { return seatOf(state).bandwidth; },
      set: function (v) { seatOf(state).bandwidth = v; },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(state, 'startingBandwidth', {
      get: function () { return seatOf(state).startingBandwidth; },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(state, 'earned', {
      get: function () { return state.totalEarned || 0; },
      set: function (v) { state.totalEarned = v; },
      enumerable: true,
      configurable: true,
    });
    // Spend is derived from the seats rather than counted separately. It used to
    // be a plain field incremented by the input layer, which meant the balance
    // harness - which drives the tower layer directly and never touches the input
    // layer - reported every run as having spent nothing. One ledger, on the
    // seats, so the UI and the harness cannot disagree.
    Object.defineProperty(state, 'spent', {
      get: function () {
        var total = 0;
        for (var i = 0; i < state.seats.length; i++) total += state.seats[i].spent;
        return total;
      },
      enumerable: true,
      configurable: true,
    });
    state.totalEarned = 0;

    // The money API the towers use, so seat arithmetic lives in one place.
    // A player id of undefined always means the local player, which is what
    // keeps single-player call sites reading as they always did.
    state.purse = function (playerId) { return seatOf(state, playerId).bandwidth; };
    state.seatId = function (playerId) {
      return playerId === undefined || playerId === null ? state.activeSeat : playerId;
    };
    state.debit = function (playerId, amount) {
      var s = seatOf(state, playerId);
      s.bandwidth -= amount;
      s.spent += amount;
    };
    // Income: adds to the purse AND counts as earned, so "what did this battle
    // pay me" stays answerable.
    state.credit = function (playerId, amount) {
      var s = seatOf(state, playerId);
      s.bandwidth += amount;
      s.earned += amount;
    };
    // A sell refund is not income. It is the player's own money coming back, and
    // folding it into `earned` would make a ticket look more generous than it is
    // - the balance report reads income to judge an economy, so a refund counted
    // as income is a measurement error, not a cosmetic one.
    state.refund = function (playerId, amount) {
      seatOf(state, playerId).bandwidth += amount;
    };

    /*
     * Event feedback. Two rules here that took a playtest to learn:
     *  - kills are throttled, because a DDoS wave dies 60 times a second and
     *    one click per kill is a buzzing insect, not a reward;
     *  - a leak shakes the screen and ducks the music, because losing uptime is
     *    the one thing the player must not be able to miss.
     */
    var lastKillSound = 0;
    state.onKill = function (t) {
      if (t.def.boss) {
        if (global.Sfx) global.Sfx.bossHit();
        if (global.Music) global.Music.react('bossHit');
        return;
      }
      if (state.time - lastKillSound < 0.07) return;
      lastKillSound = state.time;
      if (global.Sfx) global.Sfx.crush();
      if (global.Music) global.Music.react('crush');
    };
    state.onLeak = function (t) {
      state.shake = 1;
      if (global.Sfx) global.Sfx.hurt();
      if (global.Music) global.Music.react('hurt');
      if (hooks.onLeak) hooks.onLeak(t);
    };
    state.onSabotage = function (threat, tower) {
      state.shake = Math.max(state.shake, 0.6);
      if (global.Sfx) global.Sfx.explode();
    };
    state.onRevive = function () {
      if (global.Sfx) global.Sfx.revive();
    };

    if (global.Music) {
      global.Music.setMood('calm');
      global.Music.setIntensity(0.1);
    }
    return state;
  }

  function result() {
    return {
      levelId: state.levelId,
      tier: state.tier,
      uptime: Math.round(state.uptime),
      leaks: state.leaks,
      kills: state.kills,
      earned: state.earned,
      spent: state.spent,
      seconds: Math.round(state.time),
      stars: state.leaks === 0 ? 3 : state.uptime >= 90 ? 2 : 1,
      towers: state.towers.length,
    };
  }

  /* ------------------------------------------------------------------ *
   * Waves
   * ------------------------------------------------------------------ */

  function startNextWave() {
    if (!state || state.status === 'won' || state.status === 'lost') return null;
    if (state.waveIndex >= state.totalWaves) return null;

    // Recorded after the guards, so a refused wave is not logged as an action.
    record({ t: 'wave' });

    var wave = state.level.waves[state.waveIndex];

    // Calling a wave while the previous one is still on the field pays a
    // bonus. This is the entire risk/reward dial of the genre: it is the only
    // way to get ahead economically, and the only way to lose on purpose.
    var busy = state.pending.length > 0 || state.threats.length > 0;
    var bonus = 0;
    if (busy && state.waveIndex > 0) {
      bonus = 25 + state.waveIndex * 12;
      payAll(bonus);
      state.earlyBonuses += 1;
      state.effects.push({ kind: 'bonus', x: Map.VW() / 2, y: 60, r: 40, life: 1.1, max: 1.1, accent: '#4ade80', text: '+' + bonus });
      if (global.Music) global.Music.react('coin');
    }

    var t0 = state.time;
    var tune = global.Levels.tuning(state.level);
    wave.forEach(function (grp) {
      for (var i = 0; i < grp.n; i++) {
        state.pending.push({
          type: grp.t,
          // The tuning compresses spawn spacing, which raises the *rate* of
          // incoming damage instead of the total. That is what makes a late
          // wave feel like pressure rather than a longer queue.
          at: t0 + (grp.delay || 0) + i * grp.gap * tune.gap,
          hpScale: grp.hp || 1,
          speedScale: grp.sp || 1,
          armourBonus: tune.armour,
          traits: tune.traits,
          seed: (i * 37 % 100) / 100,
          boss: grp.t === state.level.boss,
        });
      }
    });
    state.pending.sort(function (a, b) { return a.at - b.at; });

    state.waveIndex += 1;
    state.status = 'wave';
    state.flash = 0.35;

    if (global.Music) {
      global.Music.setMood(state.level.boss && state.waveIndex === state.totalWaves ? 'boss' : 'tense');
      global.Music.setIntensity(Math.min(1, 0.25 + state.waveIndex / state.totalWaves * 0.7));
    }
    if (hooks.onWaveStart) hooks.onWaveStart(state.waveIndex, state.totalWaves, bonus);
    return { wave: state.waveIndex, bonus: bonus };
  }

  function spawnDue() {
    while (state.pending.length && state.pending[0].at <= state.time) {
      var p = state.pending.shift();
      var tune = global.Levels.tuning(state.level);

      /*
       * A boss opts out of the escalation curve entirely: no health multiplier,
       * no traits. It is a hand-built fight, and multiplying a 1400 HP encounter
       * by the level-12 curve turns the climax into a chore. The road gets the
       * curve; the boss gets a designer.
       */
      var t = global.Threats.spawn(state, p.type, {
        hpScale: p.hpScale * (p.boss ? 1 : tune.hp),
        speedScale: p.speedScale * (p.boss ? 1 : tune.speed),
        armourBonus: p.boss ? 0 : p.armourBonus,
        traits: p.boss ? [] : p.traits,
        seed: p.seed,
      });
      if (t && p.boss) {
        state.bossSpawned = true;
        if (hooks.onBoss) hooks.onBoss(t);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Simulation
   * ------------------------------------------------------------------ */

  function step(dt) {
    if (!state || state.paused) return;

    // A peer does not simulate. The host is the clock, and two clocks that both
    // advance the world is a desync in seconds - which is the whole reason the
    // authority model is host-authoritative rather than lockstep. All a peer
    // does is move its render clock forward and rebuild the world from the last
    // two snapshots.
    if (state.net && state.net.mode === 'peer') {
      state.net.renderTime += dt;
      interpolate();
      return;
    }

    if (state.status === 'won' || state.status === 'lost') return;

    state.time += dt;

    // Replayed input lands at the same instant it originally did, before the
    // world moves, so a replay cannot be a tick out.
    applyDueActions();

    if (state.flash > 0) state.flash -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

    // There is deliberately no passive income.
    //
    // Bandwidth was creeping up by 0.7/s, which sounds like a harmless safety
    // net and is actually the worst thing you can do to a tower defence
    // economy: it means time itself pays you, so the correct play becomes
    // "spend nothing and wait" and every purchasing decision is softened by
    // the knowledge that the money is coming back anyway. With it gone, the
    // only two ways bandwidth ever increases are the ones the player chose:
    // killing something, and asking for the next wave before this one is
    // finished. Every number on the HUD is now a consequence of a decision.
    spawnDue();
    global.Threats.update(state, dt, Map);

    /*
     * The channel gets one line the first time the Zero-Day is visibly wounded.
     *
     * story.js has carried a `bossHurt` reaction since it was written and nothing
     * ever called it, so the channel stayed silent for the entire boss fight -
     * the one moment in a ticket where a player wants reassurance that the thing
     * is actually taking damage. Threshold rather than first hit because "it is
     * taking damage" is only news once it is a third of the way down.
     */
    if (!state.bossHurted && hooks.onBossHurt) {
      for (var bi = 0; bi < state.threats.length; bi++) {
        var bt = state.threats[bi];
        if (bt.def && bt.def.boss && bt.hp < bt.maxHp * 0.6) {
          state.bossHurted = true;
          hooks.onBossHurt(bt);
          break;
        }
      }
    }

    if (global.Towers) global.Towers.update(state, dt, Map);

    // Wave complete: nothing queued, nothing alive, and a wave was running.
    if (state.status === 'wave' && state.pending.length === 0 && state.threats.length === 0) {
      if (state.waveIndex >= state.totalWaves) {
        state.status = 'won';
        if (global.Music) global.Music.react('clear');
        if (hooks.onWin) hooks.onWin(result());
      } else {
        state.waveClearedAt = state.time;
        state.status = 'building';
        state.effects.push({
          kind: 'bonus', x: Map.VW() / 2, y: 70, r: 44, life: 1.3, max: 1.3,
          accent: '#22d3ee', text: 'WAVE ' + state.waveIndex + ' CLEAR',
        });
        if (global.Music) global.Music.react('clear');
        // Back to building: drop the music to calm so the player can think.
        if (global.Music) global.Music.setMood('calm');
        if (hooks.onWaveClear) hooks.onWaveClear(state.waveIndex, 0);
      }
    }

    if (state.uptime <= 0) {
      state.uptime = 0;
      state.status = 'lost';
      if (hooks.onLose) hooks.onLose(result());
    }
  }

  function tick(now) {
    raf = global.requestAnimationFrame(tick);
    if (!state) { draw(); return; }

    var raw = (now - lastNow) / 1000;
    lastNow = now;

    // Clamp: a backgrounded tab resumes with a multi-second delta, and
    // integrating that would teleport every threat to the base at once.
    var dt = Math.max(0, Math.min(0.05, raw));
    if (state.paused) dt = 0;

    // Fixed sub-steps at high speed so 2x is genuinely 2x and not 2x-per-frame
    // with different collision outcomes.
    var total = dt * state.speed;
    var steps = Math.min(4, Math.ceil(total / 0.025)) || 1;

    /*
     * The frame is guarded, and the guard has a circuit breaker.
     *
     * An uncaught throw in here used to escape the animation callback, which
     * cancels nothing and reports nothing: requestAnimationFrame was already
     * scheduled for the next frame, so the game re-threw sixty times a second
     * with a frozen picture behind it. Silence was the worst part - the screen
     * simply stopped changing.
     *
     * A single bad frame is survivable, and killing the battle over one transient
     * null would be its own bug. A frame that throws every time is a spin, and a
     * spin has to stop and say so.
     */
    try {
      for (var i = 0; i < steps; i++) step(total / steps);
      draw();
      frameFailures = 0;
    } catch (err) {
      frameFailures++;
      frameError = global.Diag ? global.Diag.report(err, 'frame') : { message: String(err) };
      if (frameFailures >= MAX_FRAME_FAILURES) {
        stop();
        if (hooks.onFatal) hooks.onFatal(frameError);
      }
      return;
    }

    // After draw, so anything a hook does is in the next frame rather than this
    // one - and with the real frame delta, because the host's broadcast rate has
    // to be independent of the frame rate. A phone at 30fps and one at 120fps
    // must send state at the same 10Hz, and that is only possible if the sender
    // accumulates time rather than counting frames.
    //
    // Also guarded: onTick is user code, and a co-op session that throws must not
    // take the render loop down with it.
    try {
      if (hooks.onTick) hooks.onTick(dt, state);
    } catch (err) {
      if (global.Diag) global.Diag.report(err, 'onTick');
    }
  }

  function run() {
    if (raf) return;
    frameFailures = 0;
    lastNow = global.performance ? global.performance.now() : Date.now();
    raf = global.requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) global.cancelAnimationFrame(raf);
    raf = null;
  }
  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */

  function toWorld(cssX, cssY) {
    var o = Map.offset();
    var s = Map.scale();
    return { x: (cssX - o.x) / s - view.x, y: (cssY - o.y) / s - view.y };
  }

  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function attachInput() {
    // Bind once.
    //
    // mount() runs for every battle, so an unguarded attach stacks another set
    // of listeners per level, and the module-level `state` means the duplicates
    // all stay live. That was the bug that made the game unplayable from level 2
    // onward: hudTap *toggles* selectedBuild, so a single tap ran it once per
    // listener, two toggles cancelled out, and no build type was ever armed.
    // The deferred-drag design below happens to be idempotent on a duplicated
    // pointerup, which masks the symptom rather than fixing it - so the guard is
    // the fix, and `bindCount` is asserted by the harness to keep it that way.
    if (bindCount > 0) return;
    bindCount += 1;

    canvas.addEventListener('pointerdown', function (e) {
      if (!state) return;
      var p = pointerPos(e);
      var w = toWorld(p.x, p.y);

      // A press on a build card might become a drag. Defer the decision to
      // pointerup: movement means drag-to-place, no movement means the original
      // tap-to-select, so both gestures work off the same press.
      var card = cardAt(w.x, w.y);
      if (card) {
        state.drag = {
          type: card.id,
          active: false,
          startX: p.x, startY: p.y,
          x: p.x, y: p.y,
          x0: w.x, y0: w.y,
          world: w,
        };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
        return;
      }

      onTap(w.x, w.y);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!state) return;
      var p = pointerPos(e);
      var w = toWorld(p.x, p.y);

      if (state.drag) {
        var d = state.drag;
        d.x = p.x;
        d.y = p.y;
        d.world = w;
        if (!d.active) {
          var dx = p.x - d.startX;
          var dy = p.y - d.startY;
          if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) d.active = true;
        }
        // While dragging over the field, the hover ring follows the finger.
        if (d.active && w.y < Map.hudTop()) {
          var dt = Map.worldToTile(w.x, w.y);
          state.hover = Map.inGrid(dt.c, dt.r) ? dt : null;
        } else {
          state.hover = null;
        }
        return;
      }

      if (w.y < Map.hudTop()) {
        var t = Map.worldToTile(w.x, w.y);
        state.hover = Map.inGrid(t.c, t.r) ? t : null;
      } else {
        state.hover = null;
      }
    });

    canvas.addEventListener('pointerup', function (e) {
      if (!state) return;
      var d = state.drag;
      if (!d) return;
      state.drag = null;
      state.hover = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      if (!d.active) {
        // It was a tap, not a drag: hand it to the HUD exactly as before.
        hudTap(d.x0, d.y0);
        return;
      }

      // Active drag: dropTower owns the outcome, including every way a drop can
      // be refused, so there is one place that decides and one place that
      // explains. Re-reading the pointer here (rather than reusing the last
      // move) matters because a release without a preceding move is legal.
      var p = pointerPos(e);
      var w = toWorld(p.x, p.y);
      dropTower(d.type, w.x, w.y);
    });

    canvas.addEventListener('pointercancel', function () {
      if (!state) return;
      state.drag = null;
      state.hover = null;
    });

    canvas.addEventListener('pointerleave', function () {
      if (state && !state.drag) state.hover = null;
    });

    // Long-press on a tile with nothing selected inspects; a second tap sells
    // nothing by accident, because selling is only ever a labelled button.
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (!state) return;
      var p = pointerPos(e);
      var w = toWorld(p.x, p.y);
      var t = Map.worldToTile(w.x, w.y);
      var tower = global.Towers.at(state, t.c, t.r);
      if (tower) {
        state.selectedTower = tower;
        state.selectedBuild = null;
      }
    });
  }

  function onTap(x, y) {
    if (y >= Map.hudTop()) { hudTap(x, y); return; }

    var t = Map.worldToTile(x, y);
    if (!Map.inGrid(t.c, t.r)) return;

    if (state.selectedBuild) {
      tryPlace(state.selectedBuild, t.c, t.r);
      return;
    }

    var picked = global.Towers.at(state, t.c, t.r);
    state.selectedTower = picked || null;
    if (picked) state.selectedBuild = null;
  }

  /**
   * Place a tower and report why not if it cannot. Shared by tap-to-place and
   * by dropping a dragged card, so the two paths can never disagree.
   *
   * opts.fromDrag clears the selected build type afterwards: a drag is one
   * deliberate placement, whereas tapping a card is a build *mode* you may want
   * to keep for the next tile.
   */
  function tryPlace(type, c, r, opts) {
    // Co-op: only the host owns the world. A peer does not place anything - it
    // asks, and the host's snapshot is what puts the tower on the board. See
    // Coop.intent for why this is not done optimistically.
    if (state.net && state.net.mode === 'peer') {
      var asked = global.Coop && global.Coop.intent({ t: 'build', c: c, r: r, type: type });
      if (asked) {
        if (global.Sfx) global.Sfx.drop(4);
        if (!opts || !opts.fromDrag) state.selectedBuild = type;
      }
      return !!asked;
    }

    var res = global.Towers.place(state, c, r, type, Map);
    var w = Map.tileToWorld(c, r);

    if (!res.ok) {
      state.effects.push({
        kind: 'nope', x: w.x, y: w.y - 8, r: 20, life: 0.5, max: 0.5,
        accent: '#f87171', text: res.reason,
      });
      if (global.Sfx) global.Sfx.ui();
      return false;
    }

    state.selectedTower = res.tower;
    // No spend accounting here: Towers.place debits the owner's purse through
    // state.debit, which is the single place money leaves a player's account.
    if (global.Sfx) global.Sfx.drop(4);
    if (global.Music) global.Music.react('coin');

    if (opts && opts.fromDrag) {
      state.selectedBuild = null;
    } else if (state.bandwidth >= global.Towers.cost(res.tower.type)) {
      // Keep the type armed so a second tap places another one.
      state.selectedBuild = res.tower.type;
    } else {
      state.selectedBuild = null;
    }
    return true;
  }

  /**
   * A red ring with a reason on it.
   *
   * Every refusal in this game goes through here, because the alternative is
   * worse than it sounds: a gesture that fails silently is indistinguishable
   * from a game that is broken, and "I dropped the tower and nothing happened"
   * is the report you get instead of "that tile is not buildable".
   */
  function nope(x, y, text) {
    state.effects.push({
      kind: 'nope', x: x, y: y - 8, r: 18, life: 0.5, max: 0.5,
      accent: '#f87171', text: text,
    });
    if (global.Sfx) global.Sfx.ui();
  }

  /** Resolve a dragged card onto the field. Returns whether it landed. */
  function dropTower(type, x, y) {
    // Released over the HUD strip or out in the letterbox: a cancel, and it
    // says so. Treating this as "nothing happened" made the gesture feel dead.
    if (y >= Map.hudTop()) {
      nope(x, y, 'cancelled');
      return false;
    }

    var t = Map.worldToTile(x, y);
    if (!Map.inGrid(t.c, t.r)) {
      nope(x, y, 'off the field');
      return false;
    }

    return tryPlace(type, t.c, t.r, { fromDrag: true });
  }

  function hudTap(x, y) {
    var i;
    for (i = 0; i < layout.cards.length; i++) {
      var card = layout.cards[i];
      if (hitRect(card, x, y)) {
        var price = global.Towers.cost(card.id);
        if (state.bandwidth < price) {
          state.effects.push({ kind: 'nope', x: card.x + card.w / 2, y: card.y - 6, r: 16, life: 0.5, max: 0.5, accent: '#f87171', text: 'need ' + Math.ceil(price - state.bandwidth) + ' more' });
          if (global.Sfx) global.Sfx.ui();
          return;
        }
        state.selectedBuild = state.selectedBuild === card.id ? null : card.id;
        state.selectedTower = null;
        if (global.Sfx) global.Sfx.ui();
        return;
      }
    }

    if (hitRect(layout.btnNext, x, y)) {
      if (state.waveIndex >= state.totalWaves) return;
      // A peer cannot start a wave; the host's clock decides when the next one
      // begins, and the snapshot is how a peer finds out.
      if (state.net && state.net.mode === 'peer') {
        if (global.Coop) global.Coop.intent({ t: 'wave' });
        return;
      }
      startNextWave();
      return;
    }
    if (hitRect(layout.btnSpeed, x, y)) {
      // Speed is the host's clock in co-op. Letting a peer raise it would either
      // do nothing (the sim is not here) or make it interpolate faster than the
      // snapshots arrive, which reads as a stutter, not as 2x.
      if (state.net && state.net.mode === 'peer') {
        nope(x, y, 'host sets the speed');
        return;
      }
      state.speed = state.speed === 1 ? 2 : 1;
      if (global.Store) global.Store.set('gameSpeed', state.speed);
      return;
    }
    if (hitRect(layout.btnPause, x, y)) {
      state.paused = !state.paused;
      if (global.Music) state.paused ? global.Music.pause() : global.Music.resume();
      return;
    }

    if (state.selectedTower) {
      // Your towers are yours. This is the same rule remoteIntent enforces on a
      // peer, applied to the host's own pointer - otherwise the host could do
      // something no other player can, and the rule would only be true for
      // people who are not the host.
      var mine = (state.selectedTower.owner || 0) === localSeat();
      if (!mine) return;

      if (hitRect(layout.btnUpgrade, x, y)) {
        if (state.net && state.net.mode === 'peer') {
          if (global.Coop) {
            global.Coop.intent({ t: 'upgrade', c: state.selectedTower.c, r: state.selectedTower.r });
          }
          return;
        }
        var u = global.Towers.upgrade(state, state.selectedTower);
        if (u.ok) {
          if (global.Sfx) global.Sfx.perfect(1);
          if (global.Music) global.Music.react('perfect');
        } else {
          state.effects.push({ kind: 'nope', x: x, y: y - 10, r: 16, life: 0.5, max: 0.5, accent: '#f87171', text: u.reason });
        }
        return;
      }
      if (hitRect(layout.btnSell, x, y)) {
        if (state.net && state.net.mode === 'peer') {
          if (global.Coop) {
            global.Coop.intent({ t: 'sell', c: state.selectedTower.c, r: state.selectedTower.r });
          }
          state.selectedTower = null;
          return;
        }
        var s = global.Towers.sell(state, state.selectedTower);
        if (s.ok) {
          state.selectedTower = null;
          if (global.Sfx) global.Sfx.coin();
        }
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function draw() {
    if (!ctx) return;
    var VW = Map.VW();
    var reduceMotion = !!(global.Store && global.Store.get('reduceMotion'));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, cssW, cssH);

    // Screen shake. Kept out of the simulation so it can never affect aim.
    if (state && state.shake > 0 && !reduceMotion) {
      var m = state.shake * 4;
      view.x = (Math.random() * 2 - 1) * m;
      view.y = (Math.random() * 2 - 1) * m;
    } else {
      view.x = 0; view.y = 0;
    }

    var o = Map.offset();
    var s = Map.scale();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    ctx.translate(view.x, view.y);

    var t = state ? state.time : 0;

    Map.drawGrid(ctx, t);

    // Buildable-tile hints and the range preview, drawn under everything so
    // they never obscure a threat.
    if (state && state.selectedBuild) {
      var def = global.Towers.def(state.selectedBuild);
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (var c = 0; c < Map.COLS; c++) {
        for (var r = 0; r < Map.ROWS; r++) {
          if (!Map.isBuildable(c, r)) continue;
          var w = Map.tileToWorld(c, r);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(w.x - 19, w.y - 19, 38, 38);
        }
      }
      ctx.restore();
      if (state.hover) {
        var hw = Map.tileToWorld(state.hover.c, state.hover.r);
        var ok = Map.isBuildable(state.hover.c, state.hover.r) &&
          !global.Towers.at(state, state.hover.c, state.hover.r) &&
          state.bandwidth >= def.cost;
        global.Towers.drawRange(ctx, { x: hw.x, y: hw.y, type: state.selectedBuild, level: 1 }, ok);
      }
    }

    Map.drawRoad(ctx, t);
    Map.drawSpawn(ctx, t);
    Map.drawBase(ctx, t, state ? state.uptime : 100);

    if (state) {
      // Selected tower keeps its range ring visible while the panel is open.
      if (state.selectedTower) {
        global.Towers.drawRange(ctx, state.selectedTower, true);
      }

      for (var i = 0; i < state.towers.length; i++) {
        // In co-op the board is shared, so a tower says who paid for it. In solo
        // every tower is the player's own and the ring would be noise.
        var colour = state.seats.length > 1
          ? SEAT_COLOURS[(state.towers[i].owner || 0) % SEAT_COLOURS.length]
          : null;
        global.Towers.drawTower(ctx, state.towers[i], t, colour);
      }

      global.Towers.drawShots(ctx, state);

      // Threats last. Anything the player has to react to is drawn on top of
      // the things they do not, or it gets hidden behind a tower.
      global.Threats.drawAll(ctx, state, t);

      drawEffects(ctx, state);
    }

    if (state) drawHUD(ctx, state);

    // Drawn last, over the HUD, because while you are dragging the card the
    // thing under your finger is the only thing you are looking at.
    if (state) drawDragGhost(ctx, state);

    ctx.restore();

    // Wave-start flash, drawn in screen space so it covers the letterbox too.
    if (state && state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.4, state.flash);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.restore();
    }
  }

  /**
   * The card you are dragging.
   *
   * Two states matter. Over the field it snaps to the tile it would actually
   * land on and shows that tower's real range ring, so the question "how far
   * will this reach down the road" is answered before you commit. Anywhere else
   * it floats under the finger, translucent, reading as "not placed yet".
   *
   * The green/red ring comes from the same Towers.canPlace the drop itself
   * calls, so the preview cannot promise something the placement refuses.
   * A green ring also confirms the tile is buildable and affordable, which is
   * the whole reason the ghost is worth drawing.
   */
  function drawDragGhost(ctx, st) {
    var d = st.drag;
    if (!d || !d.active || !d.world) return;
    var def = global.Towers.def(d.type);
    if (!def) return;

    var hov = st.hover;
    if (hov) {
      var snap = Map.tileToWorld(hov.c, hov.r);
      var check = global.Towers.canPlace(st, hov.c, hov.r, d.type, Map);
      global.Towers.drawRange(ctx, { x: snap.x, y: snap.y, type: d.type, level: 1 }, check.ok);
      ctx.save();
      ctx.globalAlpha = check.ok ? 0.95 : 0.4;
      global.Towers.drawTower(ctx, { x: snap.x, y: snap.y, type: d.type, level: 1 }, st.time);
      ctx.restore();
      if (!check.ok) {
        label(ctx, check.reason, snap.x, snap.y - 24, '#f87171', 9, 'center');
      }
      return;
    }

    // Floating: parked above the finger so the fingertip does not cover it.
    var fy = d.world.y - 30;
    ctx.save();
    ctx.globalAlpha = 0.55;
    global.Towers.drawTower(ctx, { x: d.world.x, y: fy, type: d.type, level: 1 }, st.time);
    ctx.restore();
    label(ctx, def.name, d.world.x, fy - 24, 'rgba(215, 230, 245, 0.85)', 9, 'center');
  }

  function drawEffects(ctx, st) {
    for (var i = 0; i < st.effects.length; i++) {
      var e = st.effects[i];
      var k = 1 - e.life / e.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.3 + k), 0, Math.PI * 2);
      ctx.stroke();
      if (e.text) {
        ctx.fillStyle = e.accent;
        ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x, e.y - k * 18);
      }
      ctx.restore();
    }
  }

  function label(c, text, x, y, colour, size, align) {
    c.fillStyle = colour;
    c.font = (size >= 12 ? 'bold ' : '') + size + 'px ui-monospace, Menlo, monospace';
    c.textAlign = align || 'left';
    c.fillText(text, x, y);
  }

  function drawHUD(c, st) {
    var L = layout;
    var top = L.hudTop;
    var accent = '#22d3ee';

    // Strip background.
    c.save();
    c.fillStyle = 'rgba(8, 14, 24, 0.96)';
    c.fillRect(0, top, L.VW, L.hudH);
    c.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, top + 0.5);
    c.lineTo(L.VW, top + 0.5);
    c.stroke();

    /* ---- left: bandwidth + uptime ---- */

    var lx = L.left.x;
    // y is the top of the left block, not the top of the strip: the block is
    // centred in the strip by computeLayout.
    var loy = L.leftY;
    var mine = st.seats.length > 1 ? st.seats[localSeat()] : null;

    // In co-op the number the player spends is their own, so the label says
    // whose it is. A shared "BANDWIDTH" over one player's purse is worse than no
    // label: it invites the reading that the team has this much between them.
    label(c, mine ? (mine.name + ' · BANDWIDTH') : 'BANDWIDTH', lx, loy + 18,
      mine ? mine.colour : 'rgba(111, 137, 168, 0.9)', 9);
    label(c, String(Math.floor(st.bandwidth)), lx, loy + 42, accent, 20);
    label(c, 'B/W', lx + (String(Math.floor(st.bandwidth)).length * 12) + 4, loy + 42, 'rgba(111, 137, 168, 0.9)', 10);

    // What everybody else has, right-aligned in the same block. Small and dim:
    // a team-mate's balance is context, not something to act on, and the player
    // can only spend their own.
    //
    // Drawn only while it fits inside the left column. The column's width is
    // derived from the palette's needs (see computeLayout), so at three or four
    // seats the labels would otherwise run under the build cards - and a number
    // that overlaps a tap target is worse than a number that is missing.
    if (st.seats.length > 1) {
      var ox = L.left.x + L.left.w;
      for (var si = st.seats.length - 1; si >= 0; si--) {
        if (si === localSeat()) continue;
        var seat = st.seats[si];
        var text = Math.floor(seat.bandwidth) + ' ' + seat.name;
        var w = c.measureText(text).width;
        if (ox - w < L.left.x) break;
        label(c, text, ox - w, loy + 42, seat.colour, 10);
        ox -= w + 8;
      }
    }

    var barY = loy + 52;
    var barW = L.left.w;
    var dead = st.uptime <= 0;
    label(c, 'UPTIME ' + Math.round(st.uptime) + '%', lx, barY + 10, dead ? '#f87171' : 'rgba(111, 137, 168, 0.9)', 9);
    c.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(c, lx, barY + 14, barW, 8, 4);
    c.fill();
    var upW = Math.max(0, barW * (st.uptime / 100));
    if (upW > 0) {
      c.fillStyle = st.uptime > 60 ? '#4ade80' : st.uptime > 25 ? '#f59e0b' : '#f87171';
      roundRect(c, lx, barY + 14, upW, 8, 4);
      c.fill();
    }

    /* ---- middle: build palette ---- */

    for (var i = 0; i < L.cards.length; i++) {
      var card = L.cards[i];
      var def = global.Towers.def(card.id);
      var price = global.Towers.cost(card.id);
      var afford = st.bandwidth >= price;
      var selected = st.selectedBuild === card.id;

      c.save();
      if (selected) {
        c.fillStyle = 'rgba(34, 211, 238, 0.16)';
        c.strokeStyle = accent;
        c.lineWidth = 1.6;
      } else {
        c.fillStyle = afford ? 'rgba(20, 32, 50, 0.9)' : 'rgba(20, 24, 34, 0.75)';
        c.strokeStyle = afford ? 'rgba(56, 189, 248, 0.3)' : 'rgba(120, 120, 140, 0.25)';
        c.lineWidth = 1;
      }
      roundRect(c, card.x, card.y, card.w, card.h, 6);
      c.fill();
      c.stroke();

      // Icon: reuse the tower renderer at a small scale so the palette can
      // never drift out of step with what actually gets built.
      c.save();
      c.globalAlpha = afford ? 1 : 0.45;
      c.translate(card.x + card.w / 2, card.y + 20);
      c.scale(0.62, 0.62);
      global.Towers.drawTower(c, { type: card.id, level: 1, x: 0, y: 0, angle: -Math.PI / 2, disabledUntil: 0 }, st.time);
      c.restore();

      // Short name, because the palette card is as narrow as 44 units once the
      // last two towers are researched and "Rate Limiter" does not fit in that.
      label(c, def.short || def.name, card.x + card.w / 2, card.y + card.h - 16, afford ? '#d7e6f5' : 'rgba(150, 160, 180, 0.8)', 9, 'center');
      label(c, String(price), card.x + card.w / 2, card.y + card.h - 5, afford ? '#4ade80' : '#f87171', 10, 'center');
      c.restore();
    }

    /* ---- right: wave + controls ---- */

    var R = L.right;

    if (st.selectedTower) {
      var tw = st.selectedTower;
      var tdef = global.Towers.def(tw.type);
      var tst = global.Towers.stats(tw);
      label(c, tdef.name.toUpperCase() + '  L' + tw.level, R.x, top + 16, '#d7e6f5', 11);
      var line = (tst.damage > 0 ? Math.round(tst.damage) + ' dmg' : 'no dmg') +
        '  ' + Math.round(tst.range) + ' rng';
      label(c, line, R.x, top + 30, 'rgba(111, 137, 168, 0.9)', 9);

      var uc = global.Towers.upgradeCost(tw);
      var upAfford = uc !== null && st.bandwidth >= uc;
      c.save();
      c.fillStyle = upAfford ? 'rgba(74, 222, 128, 0.16)' : 'rgba(30, 36, 50, 0.8)';
      c.strokeStyle = upAfford ? '#4ade80' : 'rgba(120, 140, 160, 0.3)';
      roundRect(c, L.btnUpgrade.x, L.btnUpgrade.y, L.btnUpgrade.w, L.btnUpgrade.h, 5);
      c.fill(); c.stroke();
      c.restore();
      label(c, uc === null ? 'MAXED' : 'UPGRADE ' + uc, L.btnUpgrade.x + L.btnUpgrade.w / 2, L.btnUpgrade.y + 16,
        upAfford ? '#4ade80' : 'rgba(150, 160, 180, 0.8)', 9, 'center');

      c.save();
      c.fillStyle = 'rgba(248, 113, 113, 0.14)';
      c.strokeStyle = 'rgba(248, 113, 113, 0.6)';
      roundRect(c, L.btnSell.x, L.btnSell.y, L.btnSell.w, L.btnSell.h, 5);
      c.fill(); c.stroke();
      c.restore();
      label(c, 'SELL ' + global.Towers.sellValue(tw), L.btnSell.x + L.btnSell.w / 2, L.btnSell.y + 16, '#f87171', 9, 'center');
    } else {
      // Its own row between the wave button and the playback pair - it used to
      // be drawn at the same y as the wave button and collided with its label.
      label(c, 'WAVE ' + Math.min(st.waveIndex + (st.status === 'building' ? 0 : 1), st.totalWaves) + '/' + st.totalWaves,
        R.x, L.infoY + 13, '#d7e6f5', 12);
      var sub = st.status === 'building'
        ? (st.waveIndex === 0 ? st.level.env + ' · build first' : st.level.env + ' · next wave ready')
        : st.pending.length > 0 ? (st.pending.length + ' inbound')
          : st.threats.length + ' on the road';
      label(c, sub, R.x, L.infoY + 24, 'rgba(111, 137, 168, 0.9)', 9);
    }

    var canStart = st.waveIndex < st.totalWaves && st.status !== 'won' && st.status !== 'lost';

    c.save();
    var nextLabel = st.status === 'building'
      ? (st.waveIndex === 0 ? 'START WAVE' : 'CALL NEXT WAVE')
      : canStart ? 'CALL EARLY  +BONUS' : 'FINAL WAVE';
    c.fillStyle = canStart ? 'rgba(34, 211, 238, 0.18)' : 'rgba(30, 36, 50, 0.6)';
    c.strokeStyle = canStart ? accent : 'rgba(120, 140, 160, 0.3)';
    c.lineWidth = 1.2;
    roundRect(c, L.btnNext.x, L.btnNext.y, L.btnNext.w, L.btnNext.h, 5);
    c.fill(); c.stroke();
    c.restore();
    label(c, nextLabel, L.btnNext.x + L.btnNext.w / 2, L.btnNext.y + 17,
      canStart ? accent : 'rgba(150, 160, 180, 0.7)', 10, 'center');

    // Speed + pause.
    [['btnSpeed', st.speed + '×'], ['btnPause', st.paused ? 'RESUME' : 'PAUSE']].forEach(function (pair) {
      var b = L[pair[0]];
      c.save();
      c.fillStyle = 'rgba(20, 32, 50, 0.9)';
      c.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      roundRect(c, b.x, b.y, b.w, b.h, 5);
      c.fill(); c.stroke();
      c.restore();
      label(c, pair[1], b.x + b.w / 2, b.y + 16, '#d7e6f5', 10, 'center');
    });

    c.restore();
  }

  /* ------------------------------------------------------------------ *
   * Balance tool: run a level headlessly.
   * ------------------------------------------------------------------ */

  /** May this tower type be built at all, given what has been researched? */
  function towerAvailable(id) {
    if (global.Base && global.Base.towerUnlocked) return global.Base.towerUnlocked(id);
    return true;
  }

  /**
   * The build cards, in palette order.
   *
   * Locked types are left out entirely rather than shown greyed. A card you
   * cannot press is a card that teaches nothing; the BASE screen is where a
   * tower you do not own is advertised, and it can afford the space to say why.
   */
  function paletteIds() {
    if (!global.Towers) return [];
    return global.Towers.order().filter(towerAvailable).slice(0, PALETTE_MAX);
  }

  /**
   * How many build cards the HUD strip can hold at once.
   *
   * Seven, and the arithmetic is the reason: at the narrowest world width (620)
   * seven cards at the 44-unit floor plus six 5-unit gaps is 338, the two side
   * panels cannot go below 104 + 132, and the padding and gaps take 40 more.
   * That is 614 of 620. An eighth card overflows the strip and pushes the
   * wave/pause column off the right-hand edge, which is how a tower you cannot
   * reach becomes a tower you can never build.
   *
   * Eight would need the palette to wrap onto a second row, which is a layout
   * change rather than a data change - tools/../docs/TOWERS.md lists the types
   * waiting on it.
   */
  var PALETTE_MAX = 7;

  /**
   * How much a splash shell is worth relative to its damage number.
   *
   * Threats march in single file at roughly 8-25 units apart and splash reaches
   * 42, so a shell into a dense wave reliably catches two or three. Sixty per
   * cent is the conservative end of that, and it is what stops the bot from
   * concluding that a Firewall out-damages a WAF against a swarm.
   */
  var SPLASH_WORTH = 1.6;

  /**
   * How much of a damage tower a slow field is worth.
   *
   * A Rate Limiter at 0.45 multiplies the time everything spends in range by
   * 2.2, which is a multiplier on every other tower's output rather than damage
   * of its own. Half of the best available damage buy is a deliberately modest
   * reading of that, because slow does not stack and coverage is not total.
   */
  var SLOW_SHARE = 0.5;

  /**
   * What is coming, as a list of threat groups with their real resistances.
   *
   * With `fromWave` this looks at the wave that is actually next, which is how
   * the game is played: you buy against what is about to arrive, not against the
   * average of the next ten minutes. Averaging made the bot open ticket 7 with
   * Firewalls against ten SQL Injections, because the chaff in the following
   * wave pulled the average towards "mostly harmless" and the Firewall is very
   * good at harmless.
   *
   * Each entry carries its own armour and immunity list rather than being folded
   * into a class total. That matters for the Zero-Day: it is immune to Firewalls
   * and WAFs outright, and a value function that averaged it in as just another
   * point of malware health would cheerfully recommend the two towers that
   * cannot touch it.
   *
   * The boss is included from the first wave, weighted by how soon it lands.
   * That is not the bot cheating: the ticket names the Zero-Day, prints its
   * immunity on the briefing screen, and the tip tells you to buy several
   * Antivirus towers. A player who reads that spends the whole level preparing.
   * A bot that plans purely wave-to-wave spends everything on Firewalls against
   * chaff and then watches the boss walk in untouched - which is precisely what
   * it did, and it reported the final level as impossible when the real problem
   * was that it had not been told what the briefing tells a human.
   */
  function waveProfile(level, fromWave) {
    var tune = global.Levels.tuning(level);
    var minHp = global.Threats.ARMOUR_MIN_HP || 60;
    var entries = [];
    var total = 0;

    function entryFor(d, count, hpMul, weightScale) {
      var weight = d.hp * (hpMul || 1) * count * (weightScale === undefined ? 1 : weightScale);
      entries.push({
        cls: d.cls,
        immune: d.immune || [],
        boss: !!d.boss,
        // Same rule spawn() applies: level armour only lands on threats big
        // enough to carry plating.
        armour: (d.armour || 0) + (!d.boss && d.hp >= minHp ? tune.armour : 0),
        weight: weight,
      });
      total += weight;
    }

    var waves = level.waves;
    if (fromWave !== undefined && fromWave !== null) {
      var slice = waves.slice(fromWave, fromWave + 1);
      if (slice.length) waves = slice;
    }
    waves.forEach(function (w) {
      w.forEach(function (grp) {
        var d = global.Threats.def(grp.t);
        if (d) entryFor(d, grp.n, grp.hp);
      });
    });

    if (level.boss) {
      var last = level.waves[level.waves.length - 1];
      last.forEach(function (grp) {
        if (grp.t !== level.boss) return;
        var d = global.Threats.def(level.boss);
        if (!d) return;
        var remaining = Math.max(1, level.waves.length - (fromWave || 0));
        entryFor(d, grp.n, grp.hp, BOSS_ANTICIPATION / remaining);
      });
    }

    entries.forEach(function (e) { e.share = total > 0 ? e.weight / total : 0; });
    return entries;
  }

  /**
   * How heavily the bot plans for the boss relative to the wave in front of it.
   *
   * One means "I am aware of it"; two means "I am over-preparing", which is what
   * people actually do with a boss. Tuned by watching ticket 12: at one the bot
   * still arrived at the Zero-Day with nothing that could hurt it.
   */
  var BOSS_ANTICIPATION = 2.5;

  /**
   * Pick the tower that buys the most damage per bandwidth against this roster.
   *
   * Three things are modelled explicitly, because a plain damage-per-second
   * number is wrong about all of them:
   *
   *  - **Armour.** Flat reduction costs a 7-damage shot 60% of its output and a
   *    26-damage shot 15%, so a value function that ignored it would keep buying
   *    the cheapest fast tower into level 12 and lose.
   *  - **Splash.** A shell that hits three drones is worth three times its
   *    damage number, and the number does not say so.
   *  - **Slow.** A field that halves speed doubles the time everything spends in
   *    range, which is a damage multiplier for *every other tower*. It is priced
   *    as a fraction of the best damage tower available, because that is what it
   *    actually multiplies. Without this the policy never builds the Rate
   *    Limiter, and then reports the swarm levels as unwinnable.
   */
  function bestValueTower(s, level) {
    var profile = waveProfile(level, s.waveIndex);
    var hasDamage = false;
    var typeCount = {};

    s.towers.forEach(function (tw) {
      typeCount[tw.type] = (typeCount[tw.type] || 0) + 1;
      var d = global.Towers.def(tw.type);
      if (d && d.damage > 0) hasDamage = true;
    });

    /**
     * Expected damage per second against this wave, with armour and immunity
     * applied per group rather than averaged. A tower the wave is immune to
     * scores exactly zero, which is the answer that matters most here.
     */
    function expectedDps(def) {
      if (profile.length === 0) return def.damage / Math.max(0.2, def.rate);
      var total = 0;
      profile.forEach(function (e) {
        if (e.immune.indexOf(def.id) !== -1) return;
        var clsMul = (def.bonus && def.bonus[e.cls]) || 1;
        var perShot = Math.max(def.damage > 0 ? 1 : 0, def.damage * clsMul - e.armour);
        total += e.share * (def.rate > 0 ? perShot / def.rate : 0);
      });
      return total;
    }

    var affordable = global.Towers.list().filter(function (def) {
      if (!towerAvailable(def.id)) return false;
      return s.bandwidth >= def.cost;
    });

    var bestDamageValue = 0;
    affordable.forEach(function (def) {
      if (def.damage <= 0) return;
      var score = expectedDps(def);
      if (def.splash) score *= SPLASH_WORTH;
      var value = score / def.cost;
      if (value > bestDamageValue) bestDamageValue = value;
    });

    var best = null;
    affordable.forEach(function (def) {
      var value;

      if (def.damage <= 0) {
        // Support. A slow field is a multiplier on somebody else's damage, so it
        // is worth a share of the best damage buy available and nothing at all
        // if there is no damage on the field yet.
        if (!hasDamage || bestDamageValue <= 0) return;
        value = bestDamageValue * SLOW_SHARE;
        var owned = typeCount[def.id] || 0;
        if (owned >= 1) value *= 0.45;                 // diminishing, not useless
        if (owned >= 2) value *= 0.45;
      } else {
        value = expectedDps(def) / def.cost;
        if (def.splash) value *= SPLASH_WORTH;
      }

      if (!best || value > best.value) best = { id: def.id, value: value, cost: def.cost };
    });

    return best;
  }

  /**
   * The empty buildable tile that covers the most road for this tower, and how
   * much of that road is *not already covered* by something else.
   *
   * The `fresh` figure is what stops the auto-player from building one perfect
   * tower and then spending the rest of the level polishing it. A human spreads
   * out until the road is covered and only then deepens, and a bot that does
   * not will report levels as unwinnable when they are merely misplayed.
   */
  function bestSpot(s, type, map) {
    var def = global.Towers.def(type);
    if (!def) return null;

    var road = [];
    var covered = [];
    for (var c = 0; c < map.COLS; c++) {
      for (var r = 0; r < map.ROWS; r++) {
        if (map.isBuildable(c, r)) continue;
        road.push(map.tileToWorld(c, r));
        covered.push(false);
      }
    }

    // Mark the road that existing towers already cover. Range is used rather
    // than damage, because the question here is about ground, not firepower.
    for (var ti = 0; ti < s.towers.length; ti++) {
      var tw = s.towers[ti];
      var td = global.Towers.def(tw.type);
      if (!td) continue;
      var tr2 = td.range * td.range;
      for (var ri = 0; ri < road.length; ri++) {
        var ddx = road[ri].x - tw.x;
        var ddy = road[ri].y - tw.y;
        if (ddx * ddx + ddy * ddy <= tr2) covered[ri] = true;
      }
    }

    var range2 = def.range * def.range;
    var best = null;
    for (var bc = 0; bc < map.COLS; bc++) {
      for (var br = 0; br < map.ROWS; br++) {
        if (!map.isBuildable(bc, br)) continue;
        if (global.Towers.at(s, bc, br)) continue;
        var w = map.tileToWorld(bc, br);
        var reachable = 0;
        var fresh = 0;
        for (var i = 0; i < road.length; i++) {
          var dx = road[i].x - w.x;
          var dy = road[i].y - w.y;
          if (dx * dx + dy * dy > range2) continue;
          reachable++;
          if (!covered[i]) fresh++;
        }
        // Rank on fresh ground first, total coverage as the tie-break.
        //
        // The tie-break reads `best.covered`, which is where `reachable` is
        // stored - not `best.reachable`, which never existed. Comparing against
        // an undefined property is always false, so once every road tile was
        // already covered (fresh 0 everywhere) the search froze on the first
        // buildable tile in scan order, which on most maps is a dead corner with
        // no road in range. The policy then declined to build, hoarded bandwidth
        // and reported seven levels as unwinnable. A balance tool that is wrong
        // about the game is worse than no balance tool.
        var better = !best || fresh > best.fresh || (fresh === best.fresh && reachable > best.covered);
        if (better) best = { c: bc, r: br, covered: reachable, fresh: fresh };
      }
    }
    return best;
  }

  /**
   * One decision from the auto-player: build, upgrade, or wait.
   *
   * Two reasons to build rather than deepen, and both are needed:
   *
   *  - there is uncovered road worth taking, which is the normal case; or
   *  - the army is smaller than this wave deserves, which is the case on the
   *    short maps. Ticket 12's road is twenty tiles long, so four towers cover
   *    every tile of it and the "fresh ground" test alone concluded that there
   *    was nothing left to build and spent the whole budget polishing those
   *    four. It lost with sixty bandwidth unspent and half the map empty.
   */
  function autoAction(s, level, map, ground, freshTarget) {
    var pick = bestValueTower(s, level);
    var spot = pick ? bestSpot(s, pick.id, map) : null;
    // The army should grow with the incident. Wave five of a nine-wave ticket
    // wants twice what wave one did.
    var quota = ground + s.waveIndex * 2;

    if (pick && spot && spot.covered > 0 && (s.towers.length < quota || spot.fresh >= freshTarget)) {
      return { type: pick.id, c: spot.c, r: spot.r };
    }

    for (var i = 0; i < s.towers.length; i++) {
      var tw = s.towers[i];
      var cost = global.Towers.upgradeCost(tw);
      if (cost === null || s.bandwidth < cost) continue;
      return { upgrade: tw };
    }

    if (pick && spot && spot.covered > 0) return { type: pick.id, c: spot.c, r: spot.r };
    return null;
  }

  /**
   * Simulate a level headlessly.
   *
   * This is the balance tool. It answers "is ticket 7 winnable by somebody
   * playing sensibly" without a human playing it twelve times. Three rules make
   * it behave like a player rather than like a script:
   *
   *  - a placement that fails because bandwidth is short is *retried*, not
   *    dropped, so the sim waits for income instead of skipping the tower;
   *  - with opts.auto the build plan is *chosen* by the policy above rather
   *    than supplied, so the test is "can this level be beaten" and not "does
   *    the designer's own answer still work";
   *  - decisions are rate-limited to one every 0.4s, because a bot that acts
   *    every frame out-plays any human and would flatter the difficulty curve.
   *
   * plan entries: {c, r, type, wave} to build, or {c, r, upgrade, wave} to
   * upgrade whatever is standing there. `wave` is the wave index at which the
   * entry becomes available. Ignored when opts.auto is set.
   */
  function simulate(levelId, plan, opts) {
    opts = opts || {};
    var savedMap = Map;
    Map = global.PDMap;
    start(levelId);
    var s = state;
    var level = s.level;
    var dt = 1 / 60;
    var queue = (plan || []).map(function (p) { return Object.assign({}, p); });
    var simTime = 0;
    var maxSeconds = opts.maxSeconds || 900;
    var blocked = 0;
    var placed = 0;
    var upgraded = 0;
    var actionEvery = opts.actionEvery || 0.4;
    var nextAction = 0;
    var buildingSince = -1;
    // Build new towers until this many exist, and after that keep building as
    // long as a tile adds at least this much uncovered road. The bar is low on
    // purpose: a tower that covers two stretches nobody else can see is still
    // worth buying, and setting this too high made the bot hoard bandwidth and
    // lose levels a human walks through.
    var ground = opts.ground === undefined ? 3 : opts.ground;
    var freshTarget = opts.freshTarget === undefined ? 2 : opts.freshTarget;

    function due(wave) {
      for (var i = 0; i < queue.length; i++) if ((queue[i].wave || 0) <= wave) return true;
      return false;
    }

    while (s.status !== 'won' && s.status !== 'lost' && simTime < maxSeconds) {
      simTime += dt;

      if (opts.auto) {
        if (s.status === 'building') {
          if (buildingSince < 0) buildingSince = simTime;
        } else {
          buildingSince = -1;
        }

        if (simTime >= nextAction) {
          nextAction = simTime + actionEvery;
          var act = autoAction(s, level, Map, ground, freshTarget);
          if (act && act.upgrade) {
            var up = global.Towers.upgrade(s, act.upgrade);
            if (up.ok) upgraded++;
          } else if (act) {
            var ar = global.Towers.place(s, act.c, act.r, act.type, Map);
            if (ar.ok) placed++;
          }
        }

        /*
         * Pacing. Two policies, because "winnable" and "winnable if you play the
         * one line I had in mind" are different claims and only the first one
         * matters to a player.
         *
         *  - early: call the next wave as soon as only stragglers are left. This
         *    is the greedy line, and it is the only way to earn the early bonus.
         *  - patient: never call until the road is completely clear. A cautious
         *    player plays this way, and since the early bonus is the only income
         *    that is not a kill, this policy is what proves the bounties alone
         *    can carry a level. If only the greedy line wins, the level is not
         *    winnable, it is winnable-if-you-guess-right.
         *
         * Neither extreme is a good model on its own: calling a wave every 1.5
         * seconds unconditionally earns every bonus in the game, and calling
         * nothing ever starves the economy.
         */
        var patient = opts.policy === 'patient';
        var stragglers = s.pending.length === 0 && (patient ? s.threats.length === 0 : s.threats.length <= 4);
        var canAct = !!autoAction(s, level, Map, ground, freshTarget);
        if (s.status === 'building' && buildingSince >= 0) {
          if (stragglers || (!canAct && simTime - buildingSince > 4)) {
            startNextWave();
            buildingSince = -1;
          }
        }
      } else {
        for (var i = queue.length - 1; i >= 0; i--) {
          var b = queue[i];
          if ((b.wave || 0) > s.waveIndex) continue;

          if (b.upgrade) {
            var tw = global.Towers.at(s, b.c, b.r);
            if (!tw) continue;
            var uc = global.Towers.upgradeCost(tw);
            if (uc === null) { queue.splice(i, 1); continue; }
            if (s.bandwidth < uc) continue;             // wait for income
            global.Towers.upgrade(s, tw);
            queue.splice(i, 1);
            continue;
          }

          var res = global.Towers.place(s, b.c, b.r, b.type, Map);
          if (res.ok) { placed++; queue.splice(i, 1); continue; }
          if (res.reason === 'not enough bandwidth') continue;   // wait for income
          // Blocked or occupied: the plan is wrong, not the bank balance.
          queue.splice(i, 1);
          blocked++;
        }

        /*
         * A supplied plan is played strictly: each entry waits for the bandwidth
         * it needs. That wait used to be free, because the passive trickle meant
         * money arrived on its own. With income tied to kills, waiting can now
         * mean waiting forever, so a plan that cannot afford its next tower has
         * to release the wave rather than hang the simulation until maxSeconds.
         */
        if (s.status === 'building') {
          if (buildingSince < 0) buildingSince = simTime;
          if (!due(s.waveIndex) || simTime - buildingSince > 6) startNextWave();
        } else {
          buildingSince = -1;
        }
      }

      for (var k = 0; k < 3; k++) step(dt);
    }

    Map = savedMap;
    var out = result();
    out.won = s.status === 'won';
    out.placed = placed;
    out.upgraded = upgraded;
    out.blockedPlacements = blocked;
    out.unplaced = queue.length;
    out.simSeconds = Math.round(simTime);
    // Economy, for the balance pass: income vs what it actually bought.
    out.earned = Math.round(s.earned);
    out.spent = Math.round(s.spent);
    out.leftover = Math.floor(s.bandwidth);
    out.starting = s.startingBandwidth;
    out.leaks = s.leaks;
    out.policy = opts.policy || 'early';
    out.killIncome = Math.round(s.killIncome || 0);
    out.bonusIncome = Math.round(s.earned - (s.killIncome || 0));
    out.composition = s.towers.reduce(function (acc, t) {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {});
    return out;
  }

  global.Engine = {
    mount: mount,
    resize: resize,
    start: start,
    run: run,
    /** The log of what the player did this run, ready to be replayed. */
    actions: function () { return state ? state.actions.slice() : []; },
    /**
     * Re-run a recorded battle.
     *
     * start() + this + run() reproduces the original exactly, which is what
     * tools/balance.js --replay-check asserts, so the property is tested rather
     * than assumed.
     */
    replayOf: function (levelId, tierId, log) {
      start(levelId, tierId);
      state.replay = (log || []).slice().sort(function (a, b) { return a.at - b.at; });
      state.replayIndex = 0;
      state.actions = [];
      return true;
    },
    stop: stop,
    step: step,
    draw: draw,
    state: function () { return state; },
    result: result,
    startNextWave: startNextWave,
    onTap: onTap,
    layout: function () { return layout; },
    simulate: simulate,
    /** The build cards the HUD will show, after unlocks. */
    paletteIds: paletteIds,
    /**
     * How many times the pointer listeners have been bound. Must stay at 1.
     *
     * This exists because the alternative is invisible: mount() runs on every
     * battle, so an unguarded attachInput() stacks a listener per level, and a
     * single tap on a build card then toggles the selection once per listener.
     * Two listeners net to "nothing selected" and level 2 onwards is unplayable
     * with no error anywhere. The harness asserts this instead of trusting it.
     */
    inputBindings: function () { return bindCount; },
    setSpeed: function (n) { if (state) state.speed = Math.max(1, Math.min(2, n)); },
    setPaused: function (p) { if (state) state.paused = !!p; },

    /* --- co-op ---------------------------------------------------- */
    /** The render-relevant world, small enough to send at 10Hz. */
    snapshot: snapshot,
    emptySnapshot: emptySnapshot,
    /** Receive state from the host. Refuses a mismatched protocol or build. */
    applySnapshot: applySnapshot,
    /** Apply an action that arrived over the network, validated. */
    remoteIntent: remoteIntent,
    /** Stop simulating and follow the host on this seat. */
    joinAsPeer: joinAsPeer,
    hostAs: hostAs,
    netMode: netMode,
    localSeat: localSeat,
    /** Whose money the HUD and the build cards should be priced against. */
    seatColours: function () { return SEAT_COLOURS.slice(); },
    seatOf: function (playerId) { return seatOf(state, playerId); },
    protocol: PROTOCOL,
    typeHash: typeHash,

    /* --- diagnostics (PD-302) ------------------------------------- */
    /**
     * The last frame failure, or null.
     *
     * Exposed so a bug report can quote the actual exception rather than "the
     * game froze", which is the report you get when the only evidence is a
     * screen that stopped changing.
     */
    lastFrameError: function () { return frameError; },
    frameFailures: function () { return frameFailures; },
  };
})(window);
