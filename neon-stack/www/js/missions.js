/**
 * missions.js - three rotating daily missions.
 *
 * This is the retention engine: a reason to open the app tomorrow that is not
 * "beat your own score". Missions are chosen deterministically from the date so
 * every player gets the same set for the day and it survives app restarts.
 *
 * Progress is mutated in memory and flushed to storage at safe points, so a run
 * does not cause forty localStorage writes.
 */
(function (global) {
  'use strict';

  var POOL = [
    {
      type: 'blocks',
      tiers: [[60, 30], [100, 45], [150, 65]],
      label: function (n) { return 'Stack ' + n + ' blocks'; },
    },
    {
      type: 'perfects',
      tiers: [[8, 35], [14, 50], [20, 70]],
      label: function (n) { return 'Land ' + n + ' perfect drops'; },
    },
    {
      type: 'levels',
      tiers: [[2, 40], [3, 55], [5, 80]],
      label: function (n) { return 'Clear ' + n + ' levels'; },
    },
    {
      type: 'runs',
      tiers: [[3, 25], [5, 40], [8, 60]],
      label: function (n) { return 'Play ' + n + ' runs'; },
    },
    {
      type: 'endlessScore',
      tiers: [[25, 40], [40, 60], [60, 90]],
      mode: 'max',
      label: function (n) { return 'Score ' + n + ' in one endless run'; },
    },
    {
      type: 'coins',
      tiers: [[60, 30], [100, 45], [150, 60]],
      label: function (n) { return 'Earn ' + n + ' coins today'; },
    },
  ];

  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var list = null;
  var dirty = false;

  function build(dateKey) {
    var h = hash(dateKey);
    var used = {};
    var out = [];
    for (var i = 0; i < 3; i++) {
      var idx = (h + i * 7) % POOL.length;
      var guard = 0;
      while (used[idx] && guard++ < POOL.length) idx = (idx + 1) % POOL.length;
      used[idx] = true;
      var def = POOL[idx];
      // Unsigned shift on purpose: >> can go negative and produce a bad index.
      var tier = (h >>> (i * 3 + 1)) % def.tiers.length;
      var t = def.tiers[tier];
      out.push({
        id: dateKey + '#' + i,
        type: def.type,
        mode: def.mode || 'sum',
        target: t[0],
        reward: t[1],
        progress: 0,
        done: false,
        claimed: false,
        label: def.label(t[0]),
      });
    }
    return out;
  }

  function ensure() {
    if (list) return list;
    var today = Profile.today();
    var saved = Profile.missionsData();
    if (saved && saved.date === today && saved.list && saved.list.length === 3) {
      list = saved.list;
    } else {
      list = build(today);
      dirty = true;
      flush();
    }
    return list;
  }

  function flush() {
    if (!dirty) return;
    Profile.setMissionsData({ date: Profile.today(), list: list });
    dirty = false;
  }

  var Missions = {
    ensure: ensure,

    list: function () { return ensure().slice(); },

    flush: function () { ensure(); flush(); },

    /**
     * Records progress. Returns the missions that completed *just now*, so the
     * caller can celebrate them.
     */
    bump: function (type, amount, opts) {
      opts = opts || {};
      var l = ensure();
      var completed = [];
      for (var i = 0; i < l.length; i++) {
        var m = l[i];
        if (m.type !== type || m.done) continue;
        if (m.mode === 'max') m.progress = Math.max(m.progress, amount);
        else m.progress += amount;
        if (m.progress >= m.target) {
          m.progress = m.target;
          m.done = true;
          completed.push(m);
        }
        dirty = true;
      }
      // A completed mission is worth writing to disk immediately; the player
      // could close the app the moment they see the toast.
      if (completed.length) flush();
      else if (opts.flushNow) flush();
      return completed;
    },

    /** Number of finished-but-unclaimed missions, for the home screen badge. */
    pendingCount: function () {
      var l = ensure(), n = 0;
      for (var i = 0; i < l.length; i++) if (l[i].done && !l[i].claimed) n++;
      return n;
    },

    /** Adds the reward coins to the profile. Returns the coins, or 0. */
    claim: function (id) {
      var l = ensure();
      for (var i = 0; i < l.length; i++) {
        var m = l[i];
        if (m.id !== id || !m.done || m.claimed) continue;
        m.claimed = true;
        dirty = true;
        flush();
        Profile.addCoins(m.reward);
        return m.reward;
      }
      return 0;
    },

    claimAll: function () {
      var l = ensure(), total = 0;
      for (var i = 0; i < l.length; i++) {
        if (l[i].done && !l[i].claimed) {
          l[i].claimed = true;
          total += l[i].reward;
        }
      }
      if (total) {
        dirty = true;
        flush();
        Profile.addCoins(total);
      }
      return total;
    },
  };

  global.Missions = Missions;
})(window);
