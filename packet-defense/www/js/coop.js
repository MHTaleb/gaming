/**
 * coop.js - the co-op session: who is the authority, and what goes on the wire.
 *
 * net.js moves bytes; the engine knows the rules. This is the layer between
 * them, and it is deliberately thin because it is the layer where a bug is
 * hardest to see: a session bug does not crash, it desyncs, and two people
 * watching different battles is not something either of them can report clearly.
 *
 * THE ONE RULE
 *
 * Exactly one client simulates. The host owns the world, applies everybody's
 * intents, and broadcasts state. A peer sends intents and renders what it is
 * told. Nothing in this file may give a peer a second way to change the world,
 * because two authorities is the same as none.
 *
 * See docs/COOP.md for why this is not lockstep.
 */
(function (global) {
  'use strict';

  var cfg = (global.NeonConfig && global.NeonConfig.coop) || {};
  var snapshotHz = cfg.snapshotHz || 10;
  var interval = 1 / snapshotHz;

  var session = {
    active: false,
    role: 'solo',         // solo | host | peer
    seat: 0,
    seats: 1,
    names: [],
    level: null,
    tier: 'normal',
    theme: null,
    /** Host only: seconds accumulated since the last broadcast. */
    sinceSnapshot: 0,
    snapshotsSent: 0,
    intentsIn: 0,
    intentsOut: 0,
    lastError: null,
  };

  var pending = [];        // host: intents received, applied at the top of a tick

  /**
   * Take the relay's roster as the truth about who is in the room.
   *
   * Authoritative rather than incremental: a `left` without its matching
   * `joined` - which happens whenever a stream reconnects - would otherwise
   * leave a ghost in the lobby forever.
   */
  function applyRoster(list) {
    if (!list || !list.length) return;
    var names = [];
    for (var i = 0; i < list.length; i++) names[list[i].seat] = list[i].name;
    session.names = names;
    session.seats = Math.max(session.seats, list.length);
  }

  /** Called when a peer is pulled into a battle because the host started one.
   *  A function rather than a direct screen change, because this module must not
   *  know what a screen is. */
  var onStarted = null;

  function reset() {
    session.active = false;
    session.role = 'solo';
    session.seat = 0;
    session.seats = 1;
    session.names = [];
    session.level = null;
    session.sinceSnapshot = 0;
    session.snapshotsSent = 0;
    session.intentsIn = 0;
    session.intentsOut = 0;
    session.lastError = null;
    pending.length = 0;
  }

  /* ------------------------------------------------------------------ *
   * Starting a battle
   * ------------------------------------------------------------------ */

  /**
   * The co-op level for a room.
   *
   * Both ends must build the identical level, and that is not a detail - the
   * host's simulation only means anything to a peer if the waves are the same
   * waves. It is safe to derive it independently rather than shipping it, because
   * `coopLevel` is a pure function of (theme, tier, seats) and the seed is
   * derived from the theme. The peers still never simulate; this is so the peer
   * knows the road and the wave count to draw before the first snapshot arrives.
   */
  function makeLevel(theme, tier, seats) {
    if (!global.Campaign || !global.Campaign.coopLevel) return null;
    return global.Campaign.coopLevel(theme, tier, seats);
  }

  /** Host: begin a battle and start broadcasting. */
  function host(theme, tier, seats) {
    var level = makeLevel(theme, tier, seats);
    if (!level) return { ok: false, reason: 'co-op levels unavailable' };

    global.Engine.start(level, tier, seats);
    global.Engine.hostAs(seats);
    reset();
    session.active = true;
    session.role = 'host';
    session.seat = 0;
    session.seats = seats;
    session.level = level;
    session.tier = tier;
    session.theme = theme;

    global.Net.fire({ t: 'start', tier: tier, theme: theme, seats: seats });
    return { ok: true, level: level };
  }

  /** Peer: join a battle the host has already started. */
  function follow(theme, tier, seats, seat) {
    var level = makeLevel(theme, tier, seats);
    if (!level) return { ok: false, reason: 'co-op levels unavailable' };

    global.Engine.start(level, tier, seats);
    global.Engine.joinAsPeer(seat);
    reset();
    session.active = true;
    session.role = 'peer';
    session.seat = seat;
    session.seats = seats;
    session.level = level;
    session.tier = tier;
    session.theme = theme;
    return { ok: true, level: level };
  }

  /* ------------------------------------------------------------------ *
   * The per-frame tick
   * ------------------------------------------------------------------ */

  function tick(dt) {
    if (!session.active) return;
    var st = global.Engine.state();
    if (!st) return;

    if (session.role === 'host') {
      // Intents first: they belong to the frame they arrived in, and applying
      // them after the broadcast would let one player's build show up a
      // snapshot late for everybody including themselves.
      drainIntents();
      session.sinceSnapshot += dt;
      if (session.sinceSnapshot >= interval) {
        session.sinceSnapshot = 0;
        var snap = global.Engine.snapshot();
        if (snap) {
          session.snapshotsSent++;
          global.Net.fire({ t: 'snapshot', s: snap });
        }
      }
    }
  }

  /**
   * Host: apply everything that arrived since the last frame.
   *
   * The player id is taken from the RELAY's record of who sent it, never from
   * the message. A client that says "p: 0" while holding seat 2 would otherwise
   * spend the host's money, and the relay's `from` is the one field a peer
   * cannot forge.
   */
  function drainIntents() {
    while (pending.length) {
      var item = pending.shift();
      var res = global.Engine.remoteIntent(item.from, item.action);
      // Only failures are reported back. A success needs no message: it appears
      // in the next snapshot, and a per-build acknowledgement at 10Hz would be
      // more traffic than the battle state itself.
      if (res && !res.ok) {
        global.Net.fire({ t: 'rejected', seat: item.from, reason: res.reason });
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Messages from the relay
   * ------------------------------------------------------------------ */

  function onMessage(msg, from) {
    if (!msg || typeof msg.t !== 'string') return;
    if (!session.active) {
      // Lobby messages arrive before the battle exists.
      if (msg.roster) applyRoster(msg.roster);
      if (msg.t === 'start' && session.role !== 'host') {
        // The host started. A peer in the lobby follows into the battle.
        // The seat comes from the transport, which is where the relay put us -
        // Coop's own seat is still the default until a battle exists.
        var mySeat = global.Net.session().seat || 0;
        var res = follow(msg.theme, msg.tier || 'normal', msg.seats || 2, mySeat);
        if (res.ok && onStarted) onStarted();
      }
      return;
    }

    if (session.role === 'host') {
      // A peer's intent. `from` is the relay's attribution, not the message's.
      if (msg.t === 'intent' && from !== undefined && from >= 0 && from !== 0) {
        session.intentsIn++;
        pending.push({ from: from, action: msg.a });
      }
      return;
    }

    /* ---- a peer, receiving from the host ------------------------- */

    // Only the host is authoritative. The relay is a post box and does not
    // enforce this, so every peer has to - and it is one line, because the relay
    // tells us who sent each message.
    if (from !== undefined && from !== 0 && from !== -1) return;

    if (msg.t === 'snapshot' && msg.s) {
      global.Engine.applySnapshot(msg.s);
      return;
    }
    if (msg.t === 'rejected' && msg.seat === session.seat) {
      // The host refused something this player asked for. The snapshot already
      // reflects the truth; this is only for the reason, so the player is told
      // why their tower did not appear.
      session.lastError = msg.reason || 'refused';
      if (global.Sfx) global.Sfx.ui();
      return;
    }
    if (msg.t === 'resync') {
      // The host asked us to resend current state to a player who reconnected.
      if (msg.seat !== undefined) {
        var snap = global.Engine.snapshot();
        if (snap) global.Net.fire({ t: 'snapshot', to: msg.seat, s: snap });
      }
      return;
    }
    if (msg.t === 'over') {
      session.active = false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Intents
   * ------------------------------------------------------------------ */

  /**
   * A local action that must go to the host.
   *
   * Called from the engine's input layer when this client is a peer, instead of
   * placing a tower. Nothing is applied locally - the host decides, and the
   * snapshot is the result. That is a deliberate choice over optimistic local
   * placement: an optimistic build that the host then refuses leaves a tower on
   * screen that is not on the board, and reconciling that correctly is more
   * machinery than one round trip at a 150ms render delay is worth.
   */
  function intent(action) {
    if (!session.active || session.role !== 'peer' || !action) return false;
    if (!pendingLocal(action)) return false;
    session.intentsOut++;
    global.Net.fire({ t: 'intent', a: action });
    return true;
  }

  /**
   * A cheap local sanity check, so the common refusal - not enough money, tile
   * taken - is answered now instead of 150ms later. The host is still the gate;
   * this only decides whether asking is worth the round trip.
   *
   * The rate cap is the part that matters. A held-down finger on the build row
   * fires an intent per frame, and a player cannot place sixty towers a second -
   * they can only ask sixty times a second and be refused by the host sixty times
   * a second, while every one of those costs the team a round trip.
   */
  var lastIntent = 0;
  function pendingLocal(action) {
    var st = global.Engine.state();
    if (!st) return false;
    if (st.status !== 'building' && st.status !== 'wave') return false;

    var now = st.time;
    if (action.t !== 'wave' && now - lastIntent < 0.05) return false;

    var seat = session.seat;
    var T = global.Towers;
    if (action.t === 'build') {
      // Prices against the local seat's purse, which is what the HUD shows.
      var check = T.canPlace(st, action.c, action.r, action.type, global.PDMap, seat);
      if (!check.ok) {
        if (global.Engine) global.Engine.state();
        refuse(check.reason);
        return false;
      }
    }
    lastIntent = now;
    return true;
  }

  /** The same red ring the local game draws, so a refusal looks the same in
   *  co-op as it does in solo. */
  function refuse(reason) {
    var st = global.Engine.state();
    if (!st) return;
    var w = global.PDMap.tileToWorld(st.hover ? st.hover.c : 0, st.hover ? st.hover.r : 0);
    st.effects.push({
      kind: 'nope', x: w.x, y: w.y - 8, r: 18, life: 0.5, max: 0.5,
      accent: '#f87171', text: reason || 'refused',
    });
    if (global.Sfx) global.Sfx.ui();
  }

  function leave() {
    var wasActive = session.active;
    if (wasActive && global.Net) global.Net.leave();
    reset();
    return wasActive;
  }

  global.Coop = {
    host: host,
    follow: follow,
    intent: intent,
    leave: leave,
    tick: tick,
    onMessage: onMessage,
    /** Called when a peer is pulled into a battle by the host's start. */
    onStarted: function (fn) { onStarted = fn; },
    /** Adopt the roster the relay returned with the join. */
    applyRoster: applyRoster,
    session: function () { return session; },
    active: function () { return session.active; },
    /**
     * Whether this client hosts.
     *
     * The room's answer counts, not only the battle's. The lobby exists before a
     * battle does - that is the whole point of a lobby - and a host who is told
     * "waiting for the host to start" while looking at their own room code has
     * been told something actively false.
     */
    isHost: function () {
      if (session.role === 'host') return true;
      if (session.role === 'peer') return false;
      return !!(global.Net && global.Net.session().host);
    },
    isPeer: function () { return session.role === 'peer'; },
    snapshotHz: snapshotHz,
    /** The level both ends derived, for the briefing screen. */
    level: function () { return session.level; },
  };
})(window);
