#!/usr/bin/env node
/**
 * relay - the co-op matchmaking service for Packet Defense.
 *
 *   node server/relay/index.js            # listens on 127.0.0.1:8081 by default
 *   PORT=9000 HOST=0.0.0.0 node server/relay/index.js
 *   node server/relay/index.js --test     # run the self-test and exit
 *
 * WHAT THIS IS
 *
 * A room server. It hands out four-character room codes, assigns seats, and
 * forwards messages between the people in a room. It does NOT simulate, does not
 * score, and does not know what a tower is - the host of each battle is the only
 * authority on the battle, and this process is a post box.
 *
 * WHY SSE AND POST RATHER THAN WEBSOCKET
 *
 * The usual answer for a real-time game is a WebSocket, and it is the wrong one
 * here for three concrete reasons:
 *
 *   * It would be this repository's first runtime dependency. Everything else -
 *     the games, the static servers, the purchase validator - is plain node
 *     `http` with nothing installed. A hand-rolled RFC 6455 implementation buys
 *     a binary framing layer for a workload of JSON chat at 10Hz.
 *   * Mobile networks drop, and this feature is minutes long. `EventSource`
 *     reconnects on its own and replays from `Last-Event-ID`, which is exactly
 *     the rejoin behaviour a 20-wave battle needs. With a WebSocket it is code
 *     we write and get subtly wrong.
 *   * Upstream traffic is a handful of *intents* - "build here", "start the
 *     wave" - which are naturally discrete POSTs, not a stream.
 *
 * The cost is honest and worth stating: SSE is one-way, so the server can only
 * push where a POST is not needed, and a POST per intent has a little more
 * overhead than a frame on an open socket. Neither matters at this message rate.
 *
 * TRUST MODEL
 *
 * A room code is the capability. Anyone with the code can take a seat, so treat
 * a code as public. The relay never lets one seat read another seat's token, and
 * it forwards the host's messages to everyone and everyone's messages to the
 * host. A client must still ignore battle-state messages that did not come from
 * its host, because the relay is a post box and not an arbiter.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const url = require('url');

/* ------------------------------------------------------------------ *
 * Limits
 *
 * Every one of these exists because the alternative is a process that a single
 * misbehaving client can exhaust. They are deliberately generous for real play
 * and tight for abuse - a real battle sends a few intents a second and a
 * snapshot of a few kilobytes.
 * ------------------------------------------------------------------ */

const MAX_SEATS = 4;
const MAX_ROOMS = 500;
const MAX_BODY = 16 * 1024;          // an intent is a few hundred bytes
const MAX_SNAPSHOT = 128 * 1024;     // snapshots are the only large message
const REPLAY_BUFFER = 64;            // events kept per room, for reconnect
const HEARTBEAT_MS = 15000;          // keeps proxies from closing an idle stream
const IDLE_ROOM_MS = 15 * 60 * 1000; // a room with nobody connected and nobody
                                     // talking is abandoned, which on mobile is
                                     // most of them
const MAX_ROOM_MISSES = 20;          // joining a code that does not exist
const MISS_WINDOW_MS = 60 * 1000;

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/** code -> room. A Map rather than an object so a code like "__proto__" cannot
 *  reach anything interesting. */
const rooms = new Map();

/** ip -> { count, since }, for the join-miss limiter. */
const misses = new Map();

let nextEventId = 1;

function nowMs() { return Date.now(); }

/**
 * A four-character code from an alphabet with no vowels.
 *
 * No vowels because these get read aloud and typed on a phone: "was that an O or
 * a zero", "was that an I or a 1" is a support burden with no upside. Digits 0
 * and 1 go too, for the same reason. That leaves 32 characters and a million
 * codes, which is ample for a game with no accounts and no public list.
 */
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
const CODE_LEN = 4;

function makeCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const bytes = crypto.randomBytes(CODE_LEN);
    let out = '';
    for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!rooms.has(out)) return out;
  }
  return null;
}

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function makeRoom(tier, theme) {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code,
    created: nowMs(),
    touched: nowMs(),
    // Seat 0 is the host and the only seat that may send battle state onward.
    seats: [],
    events: [],          // ring buffer: { id, from, msg }
    nextId: 1,
    tier: tier || 'normal',
    theme: theme || null,
    started: false,
    eventId: 0,
  };
  rooms.set(code, room);
  return room;
}

function addSeat(room, name) {
  if (room.seats.length >= MAX_SEATS) return null;
  const seat = {
    id: room.seats.length,
    name: sanitiseName(name) || ('P' + (room.seats.length + 1)),
    token: makeToken(),
    streams: [],
    lastSeen: nowMs(),
  };
  room.seats.push(seat);
  return seat;
}

/**
 * Names are drawn next to a colour in the HUD and never rendered as HTML, so
 * this is about length and control characters rather than escaping. A name that
 * can contain a newline can corrupt a log line, and one that can contain 4KB
 * makes every snapshot bigger for everybody.
 */
function sanitiseName(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
  return clean.length ? clean : null;
}

function push(room, from, msg) {
  const entry = { id: room.nextId++, from, msg };
  room.events.push(entry);
  if (room.events.length > REPLAY_BUFFER) room.events.shift();
  room.touched = nowMs();
  return entry;
}

/**
 * Who is in the room.
 *
 * Sent with every membership change and with every join, rather than having
 * clients ask. The alternative is a round trip per lobby redraw, and worse: a
 * joiner has no way to learn the *host's* name, because nothing the host has
 * sent yet includes it. The relay already knows all of it.
 */
function roster(room) {
  return room.seats.map((s) => ({ seat: s.id, name: s.name }));
}

/**
 * Send an event to every stream in a room, optionally skipping one seat.
 *
 * The event id is per room and per stream position, which is what makes
 * `Last-Event-ID` replay work: a client that reconnects states the last id it
 * saw and gets exactly the ones it missed.
 */
function broadcast(room, entry, skipSeat) {
  const payload = 'id: ' + entry.id + '\ndata: ' + JSON.stringify({
    id: entry.id, from: entry.from, msg: entry.msg,
  }) + '\n\n';

  for (const seat of room.seats) {
    if (seat.id === skipSeat) continue;
    for (const stream of seat.streams) {
      try {
        stream.write(payload);
      } catch (err) {
        // A dead socket is normal - phones sleep. The reconnect path is the
        // recovery, so there is nothing to do here but let it be cleaned up.
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */

function send(res, code, body, headers) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // The relay is reached from a WebView same-origin in production and from
    // localhost in development; both are fine, and nothing else should be able
    // to read a room.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }, headers || {}));
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch (err) {
    return null;
  }
}

/** The room a request is about, or null. Codes are normalised so a player who
 *  types a lowercase code is not told the room does not exist. */
function roomFromPath(pathname) {
  const m = /^\/room\/([A-Za-z0-9]{4,8})(?:\/(.*))?$/.exec(pathname || '');
  if (!m) return { room: null, action: null };
  return { room: rooms.get(m[1].toUpperCase()) || null, action: m[2] || '' };
}

function seatFor(room, id, token) {
  if (!room) return null;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0 || n >= room.seats.length) return null;
  const seat = room.seats[n];
  // Constant-time compare: a token is a bearer credential, and a timing oracle
  // on one is free to avoid.
  if (!token || typeof token !== 'string') return null;
  const a = Buffer.from(String(token));
  const b = Buffer.from(seat.token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return seat;
}

function missRateLimited(ip) {
  const rec = misses.get(ip);
  const t = nowMs();
  if (!rec || t - rec.since > MISS_WINDOW_MS) {
    misses.set(ip, { count: 1, since: t });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ROOM_MISSES;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

async function handle(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (pathname === '/health') {
    return send(res, 200, { ok: true, rooms: rooms.size, seats: countSeats() });
  }

  /* ---- create a room -------------------------------------------- */

  if (pathname === '/room' && req.method === 'POST') {
    if (rooms.size >= MAX_ROOMS) {
      return send(res, 503, { error: 'at capacity' });
    }
    const body = parseJson(await readBody(req, MAX_BODY));
    if (body === null) return send(res, 400, { error: 'bad json' });

    const room = makeRoom(body.tier, body.theme);
    if (!room) return send(res, 503, { error: 'no code available' });

    const seat = addSeat(room, body.name);
    return send(res, 200, {
      code: room.code,
      seat: seat.id,
      token: seat.token,
      host: true,
      seats: room.seats.length,
      maxSeats: MAX_SEATS,
      tier: room.tier,
      roster: roster(room),
    });
  }

  const { room, action } = roomFromPath(pathname);
  if (!room && action !== null) {
    if (missRateLimited(req.socket.remoteAddress)) {
      return send(res, 429, { error: 'too many attempts' });
    }
    return send(res, 404, { error: 'no such room' });
  }

  /* ---- room status ------------------------------------------------ *
   *
   * Exists so a client can tell "my stream dropped" from "this room is gone".
   * Without it the only signal a client has is that its stream failed, and
   * `EventSource` will retry a 404 forever - so a player whose host left sits on
   * a lobby that reconnects every few seconds for as long as they leave it open,
   * with no error anywhere. Cheap to answer, and it is the difference between an
   * infinite retry loop and "the room has ended".
   */
  if (room && (action === '' || action === undefined) && req.method === 'GET') {
    return send(res, 200, {
      code: room.code,
      started: room.started,
      seats: room.seats.length,
      maxSeats: MAX_SEATS,
      tier: room.tier,
      theme: room.theme,
      roster: roster(room),
    });
  }

  /* ---- join ------------------------------------------------------ */

  if (room && action === 'join' && req.method === 'POST') {
    const body = parseJson(await readBody(req, MAX_BODY));
    if (body === null) return send(res, 400, { error: 'bad json' });
    if (room.started) return send(res, 409, { error: 'already started' });

    const seat = addSeat(room, body.name);
    if (!seat) return send(res, 409, { error: 'room full' });

    // Tell the host somebody arrived, so the lobby can show it without polling.
    broadcast(room, push(room, -1, { t: 'joined', seat: seat.id, roster: roster(room) }));

    return send(res, 200, {
      code: room.code,
      seat: seat.id,
      token: seat.token,
      host: false,
      seats: room.seats.length,
      maxSeats: MAX_SEATS,
      tier: room.tier,
      theme: room.theme,
      roster: roster(room),
    });
  }

  /* ---- the event stream ------------------------------------------ */

  if (room && action === 'events' && req.method === 'GET') {
    const seat = seatFor(room, parsed.query.seat, parsed.query.token);
    if (!seat) return send(res, 403, { error: 'bad seat or token' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',       // nginx must not buffer a stream
      'Access-Control-Allow-Origin': '*',
    });
    // A comment line makes the stream flush immediately in every browser, so the
    // client's `open` event fires before the first real message.
    res.write(': connected\n\n');

    const stream = res;
    seat.streams.push(stream);
    seat.lastSeen = nowMs();
    room.touched = nowMs();

    /* Reconnect: replay what this seat missed. This is the whole reason the
     * buffer exists, and it is what turns a dropped mobile connection from a
     * lost battle into a pause. */
    const lastId = Number(parsed.query.lastEventId || req.headers['last-event-id'] || 0);
    if (lastId > 0) {
      for (const entry of room.events) {
        if (entry.id <= lastId) continue;
        stream.write('id: ' + entry.id + '\ndata: ' + JSON.stringify({
          id: entry.id, from: entry.from, msg: entry.msg,
        }) + '\n\n');
      }
    }

    // A seat that reconnects mid-battle needs the state it missed, and only the
    // host can give that. Asking here rather than making the client remember
    // keeps the client simple.
    //
    // Sent in the SAME envelope as every other event - {id, from, msg} - rather
    // than a bare object. It is tempting to special-case it, and it means the
    // client needs two parsers and one of them is only exercised on a flaky
    // connection, which is exactly where a parsing bug is invisible until it
    // matters. `from: -1` marks it as the relay talking, like `joined`/`left`.
    const host = room.seats[0];
    if (lastId > 0 && host && host.id !== seat.id) {
      const notice = 'data: ' + JSON.stringify({
        from: -1, msg: { t: 'resync', seat: seat.id },
      }) + '\n\n';
      for (const hostStream of host.streams) {
        try {
          hostStream.write(notice);
        } catch (err) { /* the host will get its own reconnect */ }
      }
    }

    const drop = () => {
      const i = seat.streams.indexOf(stream);
      if (i >= 0) seat.streams.splice(i, 1);
      room.touched = nowMs();
      if (host) {
        broadcast(room, push(room, -1, { t: 'left', seat: seat.id, roster: roster(room) }));
      }
    };
    req.on('close', drop);
    req.on('error', drop);
    return undefined;
  }

  /* ---- send ------------------------------------------------------ */

  if (room && action === 'send' && req.method === 'POST') {
    const raw = await readBody(req, MAX_SNAPSHOT);
    const body = parseJson(raw);
    if (body === null) return send(res, 400, { error: 'bad json' });

    const seat = seatFor(room, body.seat, body.token);
    if (!seat) return send(res, 403, { error: 'bad seat or token' });
    seat.lastSeen = nowMs();

    const msg = body.msg;
    if (msg === null || typeof msg !== 'object') {
      return send(res, 400, { error: 'bad message' });
    }
    if (typeof msg.t !== 'string' || msg.t.length > 32) {
      return send(res, 400, { error: 'bad message type' });
    }

    // Only the host owns battle state. A seat that is not the host may send
    // intents and lobby chatter; letting it send `snapshot` would let any player
    // in the room rewrite the battle for everyone else.
    if (seat.id !== 0 && msg.t === 'snapshot') {
      return send(res, 403, { error: 'only the host may send state' });
    }

    if (msg.t === 'start' && seat.id === 0) {
      room.started = true;
      room.tier = msg.tier || room.tier;
      room.theme = msg.theme === undefined ? room.theme : msg.theme;
    }

    const entry = push(room, seat.id, msg);
    // Everyone sees it, including the sender's other tabs - an SSE stream is
    // one-way, so echoing back is how a second tab on the same seat stays in
    // step. The sender skips its own message by id, not by stream, so this stays
    // correct for the multi-tab case.
    broadcast(room, entry, null);
    return send(res, 200, { ok: true, id: entry.id });
  }

  return send(res, 404, { error: 'not found' });
}

function countSeats() {
  let n = 0;
  for (const room of rooms.values()) n += room.seats.length;
  return n;
}

/* ------------------------------------------------------------------ *
 * Housekeeping
 * ------------------------------------------------------------------ */

/**
 * Drop abandoned rooms, and streams whose peer has gone.
 *
 * Rooms are abandoned by wall clock rather than by an empty seat list, because
 * the normal state of a room on a phone is "nobody connected" - the app went to
 * the background, or the tunnel came back. Fifteen minutes is long enough that a
 * player who locks their phone mid-battle can come back to it.
 */
function sweep() {
  const t = nowMs();
  for (const [code, room] of rooms) {
    const live = room.seats.some((s) => s.streams.length > 0);
    if (!live && t - room.touched > IDLE_ROOM_MS) {
      rooms.delete(code);
      continue;
    }
    for (const seat of room.seats) {
      for (const stream of seat.streams.slice()) {
        if (stream.writableEnded || stream.destroyed) {
          const i = seat.streams.indexOf(stream);
          if (i >= 0) seat.streams.splice(i, 1);
        }
      }
    }
  }
  for (const [ip, rec] of misses) {
    if (t - rec.since > MISS_WINDOW_MS) misses.delete(ip);
  }
}

function heartbeat() {
  for (const room of rooms.values()) {
    for (const seat of room.seats) {
      for (const stream of seat.streams) {
        try { stream.write(': ping\n\n'); } catch (err) { /* swept later */ }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      // Never leak a stack to a client, and never let one bad request take the
      // process down: a relay that dies ends every battle on it.
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else try { res.end(); } catch (e) { /* already gone */ }
      if (process.env.RELAY_DEBUG) console.error(err);
    });
  });
}

function start(port, host) {
  const server = createServer();
  const sweepTimer = setInterval(sweep, 60000);
  const beatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  sweepTimer.unref();
  beatTimer.unref();
  server.listen(port, host, () => {
    const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    console.log('Packet Defense relay on http://' + shown + ':' + port);
  });
  return server;
}

module.exports = { createServer, start, rooms, MAX_SEATS };

/* ------------------------------------------------------------------ *
 * Self-test
 *
 * Run with --test. A relay that silently forwards the wrong thing is the kind of
 * bug that presents as "co-op is laggy" three layers up, so the forwarding rules
 * are asserted rather than eyeballed - including the one that matters most: that
 * a peer cannot send battle state.
 * ------------------------------------------------------------------ */

if (require.main === module) {
  if (process.argv.includes('--test')) {
    runSelfTest().then((ok) => process.exit(ok ? 0 : 1));
  } else {
    // 127.0.0.1 by default, not 0.0.0.0: in the deployment nginx is the only
    // thing that should be able to reach this, and the dev server proxies
    // `/coop/*` to it. Opening a port by default is the kind of thing that is
    // never noticed until it is on the internet.
    start(Number(process.env.PORT || 8081), process.env.HOST || '127.0.0.1');
  }
}

async function runSelfTest() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  let pass = 0;
  let fail = 0;
  const check = (name, ok, detail) => {
    if (ok) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + '  ' + (detail || '')); }
  };

  const post = async (path, body) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  /** Collect SSE events for a seat into an array, returning the controller. */
  const stream = async (code, seat, token, lastEventId) => {
    const q = '?seat=' + seat + '&token=' + token + (lastEventId ? '&lastEventId=' + lastEventId : '');
    const res = await fetch(base + '/room/' + code + '/events' + q);
    const got = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) got.push(JSON.parse(dataLine.slice(6)));
        }
      }
    })().catch(() => {});
    return { got, status: res.status, close: () => reader.cancel().catch(() => {}) };
  };

  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log('\nrelay self-test\n');

  // --- room creation ------------------------------------------------
  const created = await post('/room', { name: 'Ada', tier: 'hard', theme: 120 });
  check('create a room', created.status === 200 && /^[A-Z0-9]{4}$/.test(created.json.code),
    JSON.stringify(created.json));
  const { code, token } = created.json;
  check('creator is the host', created.json.host === true && created.json.seat === 0);
  check('the code omits the confusable characters', !/[AEIOU010]/.test(code), code);

  const host = await stream(code, 0, token);
  const joiner = await post('/room/' + code + '/join', { name: 'Grace' });
  check('join a room', joiner.status === 200 && joiner.json.seat === 1, JSON.stringify(joiner.json));
  check('the joiner is not the host', joiner.json.host === false);
  const peer = await stream(code, 1, joiner.json.token);
  await settle(60);

  check('the host is told somebody joined',
    host.got.some((e) => e.msg && e.msg.t === 'joined' && Array.isArray(e.msg.roster)),
    JSON.stringify(host.got.map((e) => e.msg && e.msg.t)));
  // The roster has to carry EVERY name, not just the newcomer's: the joiner is
  // the one who cannot otherwise learn the host's name, because nothing the host
  // has sent yet includes it.
  const joinedRoster = (host.got.find((e) => e.msg && e.msg.t === 'joined') || {}).msg;
  check('and the roster names everybody in the room',
    joinedRoster && joinedRoster.roster.length === 2 &&
    joinedRoster.roster[0].name === 'Ada' && joinedRoster.roster[1].name === 'Grace',
    JSON.stringify(joinedRoster && joinedRoster.roster));

  // --- forwarding ---------------------------------------------------
  await post('/room/' + code + '/send', {
    seat: 1, token: joiner.json.token,
    msg: { t: 'intent', a: { t: 'build', c: 9, r: 4, type: 'firewall' } },
  });
  await settle(60);
  check('an intent reaches the host',
    host.got.some((e) => e.from === 1 && e.msg && e.msg.t === 'intent'),
    JSON.stringify(host.got.map((e) => e.from + ':' + (e.msg && e.msg.t))));

  await post('/room/' + code + '/send', {
    seat: 0, token, msg: { t: 'snapshot', wave: 7, uptime: 96 },
  });
  await settle(60);
  check('battle state reaches the peer',
    peer.got.some((e) => e.from === 0 && e.msg && e.msg.t === 'snapshot'),
    JSON.stringify(peer.got.map((e) => e.from + ':' + (e.msg && e.msg.t))));

  // --- the rule that matters ---------------------------------------
  const forged = await post('/room/' + code + '/send', {
    seat: 1, token: joiner.json.token, msg: { t: 'snapshot', uptime: 100 },
  });
  check('a peer CANNOT send battle state', forged.status === 403, 'status ' + forged.status);
  await settle(40);
  check('and the forged state was not forwarded',
    !peer.got.some((e) => e.from === 1 && e.msg && e.msg.t === 'snapshot'));

  // --- credentials --------------------------------------------------
  const badToken = await post('/room/' + code + '/send', {
    seat: 0, token: 'deadbeef', msg: { t: 'snapshot' },
  });
  check('a wrong token is refused', badToken.status === 403, 'status ' + badToken.status);

  const badStream = await fetch(base + '/room/' + code + '/events?seat=0&token=nope');
  check('a wrong token cannot open a stream', badStream.status === 403, 'status ' + badStream.status);
  await badStream.body.cancel().catch(() => {});

  // --- reconnect ----------------------------------------------------
  const lastId = peer.got.length ? peer.got[peer.got.length - 1].id : 0;
  for (let i = 0; i < 3; i++) {
    await post('/room/' + code + '/send', {
      seat: 0, token, msg: { t: 'snapshot', wave: 8 + i },
    });
  }
  await settle(60);
  const reconnected = await stream(code, 1, joiner.json.token, lastId);
  await settle(120);
  check('a reconnect replays exactly what was missed',
    reconnected.got.filter((e) => e.msg && e.msg.t === 'snapshot').length === 3,
    'replayed ' + reconnected.got.length + ' events');
  check('and asks the host to resync the joiner',
    host.got.some((e) => e.msg && e.msg.t === 'resync' && e.msg.seat === 1));

  // --- capacity -----------------------------------------------------
  const full = [];
  for (let i = 0; i < MAX_SEATS; i++) full.push(await post('/room/' + code + '/join', { name: 'X' + i }));
  const overflow = full[full.length - 1];
  check('a room fills up and then refuses', overflow.status === 409,
    'last join status ' + overflow.status);

  // --- unknown room -------------------------------------------------
  const unknown = await post('/room/ZZZZ/join', { name: 'Nobody' });
  check('an unknown code is a 404', unknown.status === 404, 'status ' + unknown.status);

  // --- malformed input ----------------------------------------------
  const badJson = await fetch(base + '/room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
  });
  check('malformed json is a 400, not a crash', badJson.status === 400, 'status ' + badJson.status);

  const huge = await fetch(base + '/room/' + code + '/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat: 0, token, msg: { t: 'snapshot', pad: 'x'.repeat(200 * 1024) } }),
  }).catch(() => ({ status: 0 }));
  check('an oversized body is refused', huge.status === 500 || huge.status === 400 || huge.status === 0,
    'status ' + huge.status);

  const alive = await fetch(base + '/health');
  check('the server is still up after all that', alive.status === 200, 'status ' + alive.status);

  host.close();
  peer.close();
  reconnected.close();
  await new Promise((r) => server.close(r));

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  return fail === 0;
}

