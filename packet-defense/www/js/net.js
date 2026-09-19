/**
 * net.js - the co-op transport.
 *
 * Talks to server/relay/ and nothing else. It knows about rooms, seats, tokens
 * and messages; it does not know what a tower is, and it never simulates. The
 * session logic that decides what to send lives in coop.js, so that this file
 * can be tested against a relay with no game running.
 *
 * WHY SSE DOWN AND POST UP
 *
 * `EventSource` reconnects on its own and replays from `Last-Event-ID`, which is
 * the reconnect behaviour a twenty-wave battle needs on a phone - and it is
 * behaviour we get rather than behaviour we write. Upstream traffic is a handful
 * of discrete intents, which are naturally POSTs. See server/relay/index.js for
 * the full reasoning and the costs.
 */
(function (global) {
  'use strict';

  var cfg = (global.NeonConfig && global.NeonConfig.coop) || {};

  /**
   * Where the relay lives.
   *
   * An empty config url means same-origin `/coop`, which is right behind the
   * deployment's nginx: no second public port, no CORS, and the relay is only
   * reachable through the same origin the game was served from.
   *
   * A `?relay=` query parameter overrides everything, because testing this
   * against a local relay from a served build otherwise means editing config,
   * rebuilding the bundle and reloading - and the parameter makes the difference
   * between "I tested co-op" and "I tested co-op once".
   */
  function base() {
    var q = (global.location && global.location.search) || '';
    var m = /[?&]relay=([^&]+)/.exec(q);
    if (m) {
      var v = decodeURIComponent(m[1]);
      return v.replace(/\/+$/, '');
    }
    if (cfg.url) return String(cfg.url).replace(/\/+$/, '');
    if (global.location && global.location.origin) return global.location.origin + '/coop';
    return '';
  }

  var session = {
    code: null,
    seat: null,
    token: null,
    host: false,
    names: [],
    tier: 'normal',
    theme: null,
    /** The last event id this client has seen, for reconnect replay. */
    lastId: 0,
    es: null,
    closed: false,
    status: 'idle',
  };

  var handlers = {
    message: null,   // function (msg, from)
    status: null,    // function (status, detail)
    error: null,     // function (message)
  };

  /** Consecutive stream failures, reset whenever a stream opens. Usually zero or
   *  one; two or more means something is genuinely wrong rather than a blip. */
  var streamFailures = 0;

  /**
   * Reopen the stream, starting a fresh EventSource.
   *
   * `openStream` alone is not enough after a failure: an EventSource that has
   * given up stays given up, and assigning to `session.es` without closing the
   * old one leaks a reconnecting stream per retry.
   */
  function restartStream() {
    closeStream();
    openStream();
  }

  function setStatus(s, detail) {
    if (session.status === s && !detail) return;
    session.status = s;
    if (handlers.status) handlers.status(s, detail);
  }

  function post(path, body) {
    return fetch(base() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.error || ('relay said ' + res.status));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  /** Create a room and take the host seat. */
  function create(opts) {
    var body = {
      name: (opts && opts.name) || '',
      tier: (opts && opts.tier) || 'normal',
      theme: opts && opts.theme !== undefined ? opts.theme : null,
    };
    setStatus('connecting');
    return post('/room', body).then(function (r) {
      adopt(r, true);
      return r;
    }).catch(function (err) {
      setStatus('error', err.message);
      if (handlers.error) handlers.error(err.message);
      throw err;
    });
  }

  /** Join an existing room by code. */
  function join(code, opts) {
    var clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4) {
      var e = new Error('a room code is four characters');
      setStatus('error', e.message);
      return Promise.reject(e);
    }
    setStatus('connecting');
    return post('/room/' + clean + '/join', { name: (opts && opts.name) || '' })
      .then(function (r) {
        adopt(r, false);
        return r;
      }).catch(function (err) {
        setStatus('error', err.message);
        if (handlers.error) handlers.error(err.message);
        throw err;
      });
  }

  function adopt(r, isHost) {
    session.code = r.code;
    session.seat = r.seat;
    session.token = r.token;
    session.host = !!r.host || isHost;
    session.tier = r.tier || 'normal';
    session.theme = r.theme === undefined ? null : r.theme;
    session.closed = false;
    session.lastId = 0;
    streamFailures = 0;
    // Who else is here, straight from the relay. A joiner cannot learn the
    // host's name from anything the host has sent, because the host has not sent
    // anything yet - so it arrives with the join or it does not arrive.
    if (r.roster && global.Coop) global.Coop.applyRoster(r.roster);
    openStream();
  }

  /**
   * Is the room still there?
   *
   * Asked after repeated stream failures, because `EventSource` cannot see a
   * response status and a 404 will otherwise be retried indefinitely - which
   * presents as a lobby that quietly reconnects forever after the host has gone.
   */
  function roomAlive() {
    if (!session.code) return Promise.resolve(false);
    return fetch(base() + '/room/' + session.code)
      .then(function (res) { return res.ok; })
      .catch(function () { return true; });   // cannot tell: assume alive, keep trying
  }

  /**
   * Open the event stream, and keep it open.
   *
   * `EventSource` retries a dropped connection by itself, and sends the last id
   * it saw, which the relay uses to replay exactly what was missed. So the only
   * thing this has to do is not give up: a phone that goes through a tunnel
   * should come back to the same battle rather than to an error screen.
   */
  function openStream() {
    if (session.closed || !session.code || !global.EventSource) return null;
    closeStream();

    var url = base() + '/room/' + session.code + '/events' +
      '?seat=' + encodeURIComponent(session.seat) +
      '&token=' + encodeURIComponent(session.token);

    var es = new global.EventSource(url);
    session.es = es;

    es.addEventListener('open', function () {
      streamFailures = 0;
      setStatus('live');
    });

    es.addEventListener('message', function (ev) {
      var payload;
      try {
        payload = JSON.parse(ev.data);
      } catch (err) {
        return;   // a malformed frame is not worth tearing the stream down for
      }
      if (typeof payload.id === 'number') session.lastId = payload.id;
      if (handlers.message) handlers.message(payload.msg, payload.from);
    });

    es.addEventListener('error', function () {
      // Not an error worth surfacing on its own: EventSource is already
      // reconnecting, and a "connection lost" banner that clears itself in a
      // second is noise. The visible state is the status, which is what the
      // lobby reads.
      if (es.readyState !== 2 || session.closed) return;
      streamFailures++;
      setStatus('reconnecting');

      // After a couple of failures, find out whether the room still exists. A
      // host who quit deletes it, and retrying that forever means the player
      // waits in a lobby for a battle that is never coming.
      if (streamFailures >= 2) {
        roomAlive().then(function (alive) {
          if (session.closed) return;
          if (!alive) {
            session.closed = true;
            setStatus('ended');
            if (handlers.error) handlers.error('The host left and that room has ended.');
            return;
          }
          if (session.es === es && es.readyState === 2) restartStream();
        });
        return;
      }

      // EventSource gives up after a while; restart it on a long timer so a
      // battle survives a genuinely long drop.
      global.setTimeout(function () {
        if (!session.closed && session.es === es && es.readyState === 2) restartStream();
      }, 5000);
    });

    return es;
  }

  function closeStream() {
    if (session.es) {
      try { session.es.close(); } catch (err) { /* already gone */ }
      session.es = null;
    }
  }

  /** Send one message. Resolves when the relay has accepted it, not when the
   *  other players have acted on it - the game's own feedback is what tells the
   *  player that, locally and immediately. */
  function send(msg) {
    if (!session.code) return Promise.reject(new Error('not in a room'));
    return post('/room/' + session.code + '/send', {
      seat: session.seat, token: session.token, msg: msg,
    });
  }

  /** Send and forget. Every caller is inside an animation frame or an input
   *  handler, and none of them can wait for a round trip - a build that is
   *  refused by the relay is a build the host refused, and the host's snapshot
   *  is what corrects the display. */
  function fire(msg) {
    return send(msg).catch(function () { return null; });
  }

  function leave() {
    session.closed = true;
    closeStream();
    session.code = null;
    session.seat = null;
    session.token = null;
    session.host = false;
    session.lastId = 0;
    setStatus('idle');
  }

  global.Net = {
    create: create,
    join: join,
    send: send,
    fire: fire,
    leave: leave,
    session: function () { return session; },
    /** The URL shareable as an invite. */
    inviteUrl: function () {
      if (!session.code) return '';
      if (!global.location) return session.code;
      var baseUrl = global.location.origin + global.location.pathname;
      return baseUrl + '?coop=' + session.code;
    },
    configured: function () {
      return cfg.enabled !== false && !!global.EventSource && typeof fetch === 'function';
    },
    on: function (kind, fn) { if (kind in handlers) handlers[kind] = fn; },
    base: base,
    /** Exposed for the self-test. */
    _session: session,
  };
})(window);
