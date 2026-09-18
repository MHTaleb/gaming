/**
 * daily.js - the daily challenge.
 *
 * One deck, seeded from the date, the same for every player, one scored attempt
 * per day. Everything about it is derived from the seed, so there is no server
 * and no data to sync: two players on the same day get the same goal, the same
 * hazards and the same track.
 *
 * That is the whole trick with a deterministic RNG and a date string. It gives
 * the game a reason to be opened tomorrow that is not "beat your own score".
 */
(function (global) {
  'use strict';

  var KEY = 'neonstack.daily.v1';

  /** mulberry32: tiny, fast, and good enough to make a fair shared deck. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dateKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function seedFor(key) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var parsed = null;
    try { parsed = JSON.parse(raw || 'null'); } catch (e) { parsed = null; }
    return parsed && typeof parsed === 'object' ? parsed : { history: {} };
  }

  function save(state) {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /**
   * Today's deck. Every field is a function of the seed, so this is identical on
   * every device on the same date.
   */
  function config(key) {
    key = key || dateKey();
    var rand = mulberry32(seedFor('neon-stack-daily-' + key));

    var goal = 16 + Math.floor(rand() * 12);              // 16..27 blocks
    var baseW = 120 + Math.floor(rand() * 34);            // 120..153
    var tol = rand() < 0.55 ? 4 : 3;
    var speedMul = +(1.05 + rand() * 0.4).toFixed(2);     // 1.05..1.45

    var crawlerEvery = +(7 + rand() * 6).toFixed(1);      // 7..13s
    var crawlerSpeed = Math.round(15 + rand() * 11);
    var turrets = rand() < 0.65;
    var maxCrawlers = rand() < 0.4 ? 3 : 2;

    var tracks = (global.Tracks && global.Tracks.all) || [];
    var track = tracks.length ? tracks[Math.floor(rand() * tracks.length)] : null;

    return {
      mode: 'daily',
      date: key,
      goal: goal,
      tol: tol,
      baseW: baseW,
      speedMul: speedMul,
      trackId: track ? track.id : null,
      enemies: {
        crawlerEvery: crawlerEvery,
        crawlerSpeed: crawlerSpeed,
        maxCrawlers: maxCrawlers,
        crawlerFromScore: 0,
        turrets: turrets,
        turretEvery: +(20 + rand() * 14).toFixed(1),
        maxTurrets: turrets ? 1 : 0,
        turretFromScore: 0,
        // No Warden: a daily should be beatable in one sitting, not a gauntlet.
        boss: 0,
        bossCrawlerEvery: 0,
        batteries: 3,
      },
    };
  }

  var Daily = {
    key: dateKey,
    config: config,

    /** Attempts are one per day, and the result is kept. */
    state: function (key) {
      key = key || dateKey();
      var s = load();
      var entry = s.history[key];
      return {
        date: key,
        attempted: !!(entry && entry.attempted),
        cleared: !!(entry && entry.cleared),
        blocks: entry ? entry.blocks || 0 : 0,
        perfects: entry ? entry.perfects || 0 : 0,
        seed: seedFor(key),
      };
    },

    /** Call once when the attempt ends. A second attempt does not overwrite it. */
    record: function (result, key) {
      key = key || dateKey();
      var s = load();
      var existing = s.history[key];
      // One attempt means one attempt: the first result is the one that counts.
      if (!existing || !existing.attempted) {
        s.history[key] = {
          attempted: true,
          cleared: !!result.cleared,
          blocks: result.blocks || 0,
          perfects: result.perfects || 0,
          at: Date.now(),
        };
        save(s);
        return true;
      }
      return false;
    },

    /** Consecutive days with a recorded attempt, counting back from today. */
    streak: function () {
      var s = load();
      var streak = 0;
      var d = new Date();
      for (var i = 0; i < 400; i++) {
        var key = dateKey(d);
        if (s.history[key] && s.history[key].attempted) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else if (i === 0) {
          // Today is not played yet: a streak up to yesterday still counts.
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    },

    history: function (limit) {
      var s = load();
      var keys = Object.keys(s.history).sort().reverse();
      return keys.slice(0, limit || 14).map(function (k) {
        return Object.assign({ date: k }, s.history[k]);
      });
    },

    /** A result you can paste anywhere. No links, no tracking, just the numbers. */
    shareText: function () {
      var st = this.state();
      var cfg = config(st.date);
      if (!st.attempted) return 'Neon Stack daily ' + st.date + ' - not attempted yet.\n';
      var bar = '';
      for (var i = 0; i < cfg.goal; i++) bar += i < st.blocks ? '█' : '░';
      return 'Neon Stack daily ' + st.date + '\n' +
        bar + '  ' + st.blocks + '/' + cfg.goal +
        (st.cleared ? ' CLEARED' : '') +
        '\n' + st.perfects + ' perfect drops\n';
    },
  };

  global.Daily = Daily;
})(window);
