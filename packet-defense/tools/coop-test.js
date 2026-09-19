#!/usr/bin/env node
/**
 * coop-test.js - two clients, one relay, no pixels.
 *
 * WHY THIS EXISTS
 *
 * Co-op was verified by driving two browser pages through a real relay, by hand.
 * That found three bugs nothing else could have found - a stale-snapshot
 * interpolation error, a silent startup failure, and an infinite reconnect loop
 * on a dead room - and then it was never run again, because running it meant
 * opening two windows and remembering a sequence.
 *
 * The bugs that matter in this feature are exactly the ones only a second client
 * can see. A single-client test cannot notice that two people are watching
 * different battles, and neither can a player: a desync does not crash, it just
 * shows something plausible. So the second client goes in the test suite.
 *
 * HOW, AND WHY NOT A BROWSER
 *
 * The engine runs headless - tools/balance.js has been doing it for the whole
 * campaign - so a client is the real game modules in a VM. The only thing a
 * browser actually provides that matters here is `EventSource`, and the relay
 * speaks plain `text/event-stream` over an ordinary socket, so this file carries
 * fifty lines of it rather than a browser automation dependency. Two VMs are two
 * clients over one real TCP connection to the real relay: the transport, the
 * seats, the attribution and the reconnect buffer are all the shipping code.
 *
 * What is NOT covered here is pixels, and the in-page self-test covers the DOM.
 *
 *   node tools/coop-test.js
 *   node tools/coop-test.js --verbose
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const relay = require('../server/relay/index.js');

const JS = path.join(__dirname, '..', 'www', 'js');
const VERBOSE = process.argv.includes('--verbose');

/**
 * The page's own load order, up to coop.js.
 *
 * main.js and selftest.js are left out because they are the screen: this test is
 * deliberately about the layers underneath it, and anything that needs a
 * document to load is something this test should not be reaching for.
 */
const ORDER = [
  'config.js', 'storage.js', 'diag.js', 'audio.js', 'tracks.js', 'music.js', 'ads.js',
  'purchases.js', 'progress.js', 'base.js', 'map.js', 'threats.js', 'towers.js',
  'roads.js', 'campaign.js', 'levels.js', 'story.js', 'engine.js', 'net.js', 'coop.js',
];

/* ------------------------------------------------------------------ *
 * The one piece of a browser this needs
 * ------------------------------------------------------------------ */

/**
 * A minimal EventSource over fetch.
 *
 * Node 22 has fetch and a streaming body but no EventSource, so this reads
 * `text/event-stream` the way the spec's simple case works: split on a blank
 * line, join the `data:` fields, ignore everything else - which includes the
 * relay's `: connected` comment and its heartbeats, exactly as a browser does.
 *
 * It does not implement Last-Event-ID. Reconnect replay is real and the relay's
 * own self-test covers it; duplicating it here would be testing this file rather
 * than the game.
 */
function eventSourceFor() {
  return class EventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;                 // 0 connecting, 1 open, 2 closed
      this.onerror = null;
      this._listeners = { open: [], message: [], error: [] };
      this._abort = new AbortController();
      this._loop();
    }

    addEventListener(kind, fn) {
      (this._listeners[kind] = this._listeners[kind] || []).push(fn);
    }

    _emit(kind, ev) {
      const list = (this._listeners[kind] || []).slice();
      for (const fn of list) {
        try { fn(ev); } catch (err) { /* a listener's failure is not the stream's */ }
      }
      if (kind === 'error' && typeof this.onerror === 'function') this.onerror(ev);
    }

    async _loop() {
      try {
        const res = await fetch(this.url, { signal: this._abort.signal });
        if (!res.ok || !res.body) {
          this.readyState = 2;
          return this._emit('error', {});
        }
        this.readyState = 1;
        this._emit('open', {});

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let cut;
          while ((cut = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            this._frame(frame);
          }
        }
        this.readyState = 2;
        this._emit('error', {});
      } catch (err) {
        if (this.readyState === 2) return;   // closed on purpose
        this.readyState = 2;
        this._emit('error', {});
      }
    }

    _frame(frame) {
      const data = frame.split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) return;                     // a comment or a heartbeat
      this._emit('message', { data });
    }

    close() {
      this.readyState = 2;
      try { this._abort.abort(); } catch (err) { /* already gone */ }
    }
  };
}

/* ------------------------------------------------------------------ *
 * A client
 * ------------------------------------------------------------------ */

/**
 * Load the real game into its own context and point it at a relay.
 *
 * Every client gets its own module instances, because two clients sharing one
 * `window` would share one engine and the test would prove nothing at all. That
 * is also why this cannot be a unit test of a function: the thing under test is
 * two whole games agreeing.
 */
function loadClient(relayUrl, name) {
  const win = {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    setImmediate: setImmediate,
    fetch: (url, opts) => fetch(url, opts),
    EventSource: eventSourceFor(),
    AbortController: AbortController,
    TextDecoder: TextDecoder,
    console: console,
    navigator: { userAgent: 'coop-test' },
    // No localStorage present means progress.js keeps its save in memory, which
    // is what a client under test wants: no state carried between runs.
    localStorage: undefined,
    location: { origin: 'http://127.0.0.1', search: '' },
    devicePixelRatio: 1,
  };
  win.window = win;

  const sandbox = {
    window: win,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    setImmediate: setImmediate,
    fetch: win.fetch,
    AbortController: AbortController,
    TextDecoder: TextDecoder,
  };
  vm.createContext(sandbox);

  for (const file of ORDER) {
    const src = fs.readFileSync(path.join(JS, file), 'utf8');
    try {
      vm.runInContext(src, sandbox, { filename: file });
    } catch (err) {
      throw new Error('client ' + name + ' failed to load ' + file + ': ' + err.message);
    }
  }

  // Point the transport straight at the relay. The page reaches it through the
  // dev server's /coop proxy; here there is no origin to proxy through, so the
  // config url overrides it - the same override a served build uses via ?relay=.
  win.NeonConfig.coop.url = relayUrl;

  // The wiring main.js does, and the only line of it this test needs.
  win.Net.on('message', win.Coop.onMessage);

  win.name = name;
  return win;
}

/* ------------------------------------------------------------------ *
 * Driving
 * ------------------------------------------------------------------ */

/**
 * Advance every client, letting the network breathe.
 *
 * The engine is stepped directly rather than waited on in real time, so twenty
 * seconds of battle takes a fraction of a second. The yield matters: without it
 * the event loop never runs, the streams never deliver, and the peer would sit
 * on the starting line while the host finished the level.
 */
async function pump(clients, seconds, dt) {
  const step = dt || 1 / 60;
  const total = Math.round(seconds / step);
  for (let i = 0; i < total; i++) {
    for (const c of clients) {
      c.Engine.step(step);
      c.Coop.tick(step);
    }
    // Every few frames, hand the loop back. Frequent enough that a 10Hz
    // snapshot is never more than a few frames late.
    if (i % 4 === 3) await new Promise((r) => setImmediate(r));
  }
}

/** Wait for something to become true, in real time. */
async function until(what, fn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  for (;;) {
    let value;
    try { value = fn(); } catch (err) { value = false; }
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/**
 * Advance until a condition holds, and report how much battle time that took.
 *
 * Returns null if it never happened. Yields to the event loop on every frame,
 * so the network gets a turn per frame and the answer is a latency rather than a
 * race - which is the point. Everything in co-op eventually arrives; what makes
 * it right or wrong is how long it took.
 */
async function pumpUntil(clients, predicate, maxSeconds, dt) {
  const step = dt || 1 / 60;
  const total = Math.round((maxSeconds || 3) / step);
  for (let i = 0; i < total; i++) {
    for (const c of clients) {
      c.Engine.step(step);
      c.Coop.tick(step);
    }
    await new Promise((r) => setImmediate(r));
    if (predicate()) return (i + 1) * step;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  ok   ' + name + (VERBOSE && detail ? '  (' + detail + ')' : ''));
  } else {
    failed++;
    console.log('  FAIL ' + name + (detail ? '  ' + detail : ''));
  }
}

function near(name, a, b, tolerance, extra) {
  const d = Math.abs(a - b);
  check(name, d <= tolerance, 'got ' + a + ' vs ' + b + (extra ? ', ' + extra : ''));
}

/* ------------------------------------------------------------------ *
 * The scenario
 * ------------------------------------------------------------------ */

const THEME = 220;      // act eleven, the ticket the store screenshots use
const TIER = 'normal';
const SEATS = 2;

async function run() {
  const server = relay.start(0, '127.0.0.1');
  await new Promise((res) => server.once('listening', res));
  const relayUrl = 'http://127.0.0.1:' + server.address().port;
  console.log('\nco-op test\n\n  relay on ' + relayUrl);

  const host = loadClient(relayUrl, 'host');
  const peer = loadClient(relayUrl, 'peer');

  try {
    /* ---- the lobby ------------------------------------------------ */

    const room = await host.Net.create({ name: 'ada', tier: TIER, theme: THEME });
    check('the host creates a room', !!room.code, 'code ' + room.code);
    check('the host takes seat 0', host.Net.session().seat === 0);

    await peer.Net.join(room.code, { name: 'grace' });
    check('the peer takes seat 1', peer.Net.session().seat === 1,
      'seat ' + peer.Net.session().seat);

    // The roster arrives on the join response and on every membership change.
    // A joiner cannot learn the host's name from the host, because the host has
    // not sent anything yet.
    await until('the host to see two seats', () => host.Coop.session().seats >= SEATS);
    check('both ends agree there are two players',
      host.Coop.session().seats === SEATS && peer.Coop.session().seats === SEATS);

    /* ---- the battle starts ---------------------------------------- */

    const started = host.Coop.host(THEME, TIER, SEATS);
    check('the host starts a battle', started.ok === true, started.reason || '');
    check('the host is simulating', host.Engine.netMode() === 'host');

    // The peer must start on its own, from the message, or it is not a peer.
    await until('the peer to follow the host into the battle',
      () => peer.Coop.session().active === true);
    check('the peer follows without being told anything else',
      peer.Coop.session().role === 'peer');
    check('the peer knows which seat it is following on',
      peer.Coop.session().seat === 1, 'seat ' + peer.Coop.session().seat);
    check('the peer is not simulating', peer.Engine.netMode() === 'peer');

    const hostLevel = host.Engine.state().level;
    const peerLevel = peer.Engine.state().level;
    check('both ends derived the same level, without it being sent',
      hostLevel.id === peerLevel.id && hostLevel.waves.length === peerLevel.waves.length,
      '#' + hostLevel.id + ' and #' + peerLevel.id);

    /* ---- run a few waves ------------------------------------------ */

    host.Engine.startNextWave();
    await pump([host, peer], 12);

    const hs = host.Engine.state();
    const ps = peer.Engine.state();

    check('the peer received snapshots', peer.Coop.session().active && ps.net.buf.length > 0,
      ps.net.buf.length + ' buffered');
    check('both ends agree about the protocol and the content',
      ps.net.mismatch !== true, ps.net.mismatch ? 'the peer refused the host\'s numbers' : '');
    check('both ends agree on the ticked wave', hs.waveIndex === ps.waveIndex,
      hs.waveIndex + ' vs ' + ps.waveIndex);
    near('both ends agree on uptime', hs.uptime, ps.uptime, 1);
    near('both ends agree on kills', hs.kills, ps.kills, 3);
    check('both ends agree there is one battle', hs.status === ps.status,
      hs.status + ' vs ' + ps.status);

    /* ---- each player pays for their own towers -------------------- */

    /*
     * The claim the whole feature rests on: everyone has their own money.
     *
     * `spent` rather than `bandwidth`, because a seat's bandwidth also moves
     * when it earns - a share of every kill - so a purse that fell by 60 tells
     * you nothing about who paid 60. `spent` only ever goes up when that seat
     * buys something.
     */
    const hostSpentBefore = hs.seats[0].spent;
    const peerSpentBefore = hs.seats[1].spent;
    const hostTile = firstLegalTile(host, 0, 'firewall');
    check('the host has somewhere legal to build', !!hostTile, JSON.stringify(hostTile));
    const hostBuild = host.Towers.place(hs, hostTile.c, hostTile.r, 'firewall', host.PDMap, 0);
    check('the host builds a tower', hostBuild.ok === true, hostBuild.reason || '');

    await pump([host, peer], 2);

    const peerTile = firstLegalTile(peer, 1, 'firewall');
    check('the peer has somewhere legal to build', !!peerTile, JSON.stringify(peerTile));

    // Through the real intent path, not by calling place() on the host. The
    // point is that the request travels: intent -> relay -> host -> snapshot.
    const asked = peer.Coop.intent({ t: 'build', c: peerTile.c, r: peerTile.r, type: 'firewall' });
    check('the peer asks the host to build', asked === true);

    /*
     * How long the peer takes to SEE it, not whether it eventually does.
     *
     * This check exists because mutation testing said so. Making the peer render
     * the OLDEST buffered snapshot instead of the newest - the historical
     * "towers not syncing" bug, reproduced exactly - left all 31 other checks
     * green. Everything arrives either way. A peer that is a second behind
     * still eventually agrees about everything, and a second behind is precisely
     * what a player reports as towers not appearing.
     *
     * The intended lag is the interpolation delay (0.15s) plus one snapshot
     * interval, so anything at or under 0.6s is right and the stale-render bug
     * lands at about a second, which is the depth of the buffer.
     */
    const latency = await pumpUntil([host, peer],
      () => peer.Engine.state().towers.some((t) => t.c === peerTile.c && t.r === peerTile.r),
      3);
    check('the peer sees its own tower within a snapshot of the host accepting it',
      latency !== null && latency <= 0.6,
      latency === null ? 'it never appeared' : 'took ' + latency.toFixed(2) + 's');

    await pump([host, peer], 2);

    const hs2 = host.Engine.state();
    const ps2 = peer.Engine.state();

    const hostSpentAfter = hs2.seats[0].spent;
    const peerSpentAfter = hs2.seats[1].spent;
    const peerTower = hs2.towers.find((t) => t.c === peerTile.c && t.r === peerTile.r);

    check('the peer\'s tower is on the host\'s board', !!peerTower);
    check('it belongs to the peer\'s seat', !!peerTower && peerTower.owner === 1,
      peerTower ? 'owner ' + peerTower.owner : 'no tower');
    check('the peer paid for it',
      !!peerTower && peerSpentAfter - peerSpentBefore === peerTower.invested,
      'seat 1 spent ' + (peerSpentAfter - peerSpentBefore) +
      (peerTower ? ', the tower cost ' + peerTower.invested : ''));

    /*
     * The assertion the original hand-run test was written for, and the reason
     * it is written as an exact equality: a peer that could spend the host's
     * money would still look correct on every screen either player sees.
     */
    check('the host did not pay for the peer\'s tower',
      hostSpentAfter - hostSpentBefore === hostBuild.tower.invested,
      'seat 0 spent ' + (hostSpentAfter - hostSpentBefore) + ' over the whole window, ' +
      'its own tower cost ' + hostBuild.tower.invested);

    check('the peer sees its own tower arrive', !!ps2.towers.find(
      (t) => t.c === peerTile.c && t.r === peerTile.r && t.owner === 1));
    check('both ends agree on the tower count', hs2.towers.length === ps2.towers.length,
      hs2.towers.length + ' vs ' + ps2.towers.length);

    /* ---- and a peer cannot reach into somebody else's towers ------ */

    /*
     * A forged upgrade, applied directly, because this is about the rule and not
     * about the wire - the relay's own self-test already proves a peer cannot
     * lie about who it is. What this proves is that the host refuses the action
     * even when the attribution is right and the tower is real.
     *
     * Refused rather than negotiated: the refund on a later sale goes to the
     * tower's owner, so funding a team-mate by upgrading their tower gives the
     * money away with no way to get it back.
     */
    const hostTower = hs2.towers.find((t) => t.owner === 0);
    const levelBefore = hostTower.level;
    const stolen = hs2 ? host.Engine.remoteIntent(1, { t: 'upgrade', c: hostTower.c, r: hostTower.r }) : null;
    check('the host refuses a peer upgrading the host\'s tower',
      stolen && stolen.ok === false, stolen ? stolen.reason : 'no result');
    check('the host\'s tower is untouched', hostTower.level === levelBefore);

    const sold = host.Engine.remoteIntent(1, { t: 'sell', c: hostTower.c, r: hostTower.r });
    check('the host refuses a peer selling the host\'s tower', sold.ok === false, sold.reason || '');

    const forgedSeat = host.Engine.remoteIntent(9, { t: 'build', c: 0, r: 0, type: 'firewall' });
    check('the host refuses an intent from a seat that does not exist',
      forgedSeat.ok === false, forgedSeat.reason || '');

    /* ---- a bad intent is refused with a reason -------------------- */

    const poor = host.Engine.remoteIntent(1, { t: 'build', c: 0, r: 0, type: 'quarantine' });
    check('an unaffordable or illegal build is refused, not silently ignored',
      poor.ok === false, poor.reason || '');

    /* ---- a peer renders the newest snapshot it holds ---------------- */

    /*
     * The other half of the historical bug, and the reason this check is
     * deterministic rather than end-to-end.
     *
     * A peer's state arrives down two channels: towers and threats come from the
     * interpolated pair of snapshots, and the scalars - wave, uptime, kills, the
     * purses - come from the NEWEST one. Mutation testing found the gap: making
     * the newest snapshot the oldest left every end-to-end check green, because
     * the tower checks were watching the other channel. So this drives one peer
     * with two known snapshots and reads the scalars back.
     *
     * Stepping the render clock well past both arrivals is not artificial: it is
     * the state after any hitch, and the state every peer is in for the first
     * moments of a battle.
     */
    const probe = loadClient(relayUrl, 'probe');
    probe.Engine.start(hostLevel, TIER, SEATS);
    probe.Engine.joinAsPeer(1);

    // A tower type index, because that is how a tower travels on the wire.
    const ti = probe.Towers.order().indexOf('firewall');

    const stale = probe.Engine.emptySnapshot();
    stale.w = 3; stale.up = 50; stale.k = 10;
    stale.s = [[0, 0, ti, 1, 0, 0]];

    const fresh = probe.Engine.emptySnapshot();
    fresh.w = 7; fresh.up = 90; fresh.k = 40;
    // The peer's own tower, one upgrade level in, and the tile is the tell.
    fresh.s = [[0, 0, ti, 1, 0, 0], [1, 1, ti, 2, 1, 0]];

    probe.Engine.applySnapshot(stale);
    await pump([probe], 0.5);              // half a second later, as a real pair arrives
    probe.Engine.applySnapshot(fresh);

    /*
     * First, with the render clock INSIDE the window between the two arrivals,
     * which is where a peer spends most of its life and the only moment where
     * "the older of the pair" is a different snapshot at all.
     *
     * Outside that window the two halves are the same snapshot and the question
     * does not arise - which is how a mutation that drew towers from the older
     * half passed every check here on the first attempt.
     */
    await pump([probe], 0.1);
    const mid = probe.Engine.state();
    check('mid-window, the peer already draws the newest tower set',
      mid.towers.length === 2,
      mid.towers.length + ' towers rendered, the newest snapshot has 2');

    await pump([probe], 4);                // and then the clock runs past both

    const pst = probe.Engine.state();
    check('a peer holding two snapshots renders the newest one, not the oldest',
      pst.waveIndex === 7 && pst.kills === 40 && pst.uptime === 90,
      'wave ' + pst.waveIndex + ', kills ' + pst.kills + ', uptime ' + pst.uptime +
      ' - the newest snapshot says 7 / 40 / 90');

    /*
     * The same question for the other channel.
     *
     * Towers and threats come from the interpolated pair rather than from the
     * newest snapshot, so the check above cannot see them - and drawing them
     * from the older half of the pair is a real, if smaller, lag. Checked
     * deterministically rather than by timing, because the difference is one
     * interpolation window and no end-to-end threshold that tight would survive
     * a busy machine.
     */
    const arrival = pst.towers.find((t) => t.c === 1 && t.r === 1);
    check('and draws its towers from the newest snapshot too',
      pst.towers.length === 2 && !!arrival && arrival.level === 2 && arrival.owner === 1,
      pst.towers.length + ' towers rendered, ' +
      (arrival ? 'the new one is level ' + arrival.level + ' owner ' + arrival.owner : 'it is missing'));
  } finally {
    server.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  return failed === 0;
}

/** The first tile this seat may legally build on. */
function firstLegalTile(client, seat, type) {
  const st = client.Engine.state();
  for (let c = 0; c < client.PDMap.COLS; c++) {
    for (let r = 0; r < client.PDMap.ROWS; r++) {
      if (client.Towers.canPlace(st, c, r, type, client.PDMap, seat).ok) return { c, r };
    }
  }
  return null;
}

if (require.main === module) {
  run().then((ok) => process.exit(ok ? 0 : 1)).catch((err) => {
    console.error('\nco-op test failed to run: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { run: run };
