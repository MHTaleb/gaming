/**
 * progress.js - the player's save file.
 *
 * Everything persistent lives in one JSON blob: level stars, coins, unlocked
 * logs, equipped skin, lifetime stats, the daily streak and the daily missions.
 * One blob means one write per change, which matters on a phone.
 */
(function (global) {
  'use strict';

  var KEY = 'neonstack.profile.v1';
  var LEGACY_KEY = 'neonstack.v1';
  var SIG_VERSION = 1;

  function secCfg() {
    return (global.NeonConfig && global.NeonConfig.security) || {};
  }

  function integrityOn() {
    return secCfg().signSave !== false;
  }

  /**
   * A keyed checksum over the save payload.
   *
   * Be clear about what this is: a TAMPER CHECKSUM, not cryptography. The key
   * is in the bundle, so anyone who reads the source can reproduce it. It
   * reliably catches the "open devtools and set coins to 999999" case, and it
   * tells you whether a save you are looking at in a support ticket was edited.
   * It is not a security boundary, and nothing that matters (purchases) may ever
   * depend on it.
   */
  function keyedHash(text) {
    var appId = (global.NeonConfig && global.NeonConfig.appId) || 'neonstack';
    var h = 0x811c9dc5;
    var salt = 'neonstack.save/' + appId;
    var i;
    for (i = 0; i < salt.length; i++) {
      h ^= salt.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    for (i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function blank() {
    return {
      levels: {},
      unlocked: 1,
      coins: 0,
      logs: [],
      seenChapters: [],
      skin: 'neon',
      ownedSkins: ['neon'],
      endlessBest: 0,
      stats: { blocks: 0, perfects: 0, runs: 0, levelsDone: 0, coinsEarned: 0 },
      missions: null,
      streak: { days: 0, last: '', best: 0 },
      chapterOpened: false,
      /** Best-run silhouettes to race: key -> [[x,w],...] */
      ghosts: {},
      /** Consumables bought with coins. The coin sink. */
      items: { spare_cell: 0, repair_kit: 0 },
      zenBest: 0,
      zenBlocks: 0,
    };
  }

  var state = null;
  var tampered = false;

  function merge(parsed) {
    var merged = Object.assign(blank(), parsed && typeof parsed === 'object' ? parsed : {});
    merged.stats = Object.assign(blank().stats, merged.stats || {});
    return merged;
  }

  function load() {
    if (state) return state;
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }

    if (parsed && parsed.v === SIG_VERSION && typeof parsed.d === 'string') {
      var payloadOk = false;
      try { payloadOk = keyedHash(parsed.d) === parsed.c; } catch (e) { payloadOk = false; }
      if (!payloadOk) {
        tampered = true;
        // Never punish a possibly-false positive by deleting progress. Default
        // behaviour is to keep playing and remember that it happened.
        if (secCfg().onTamper === 'reset') {
          state = blank();
          return state;
        }
      }
      try {
        state = merge(JSON.parse(parsed.d));
      } catch (e) {
        state = blank();
      }
    } else {
      // Plain (older) blob: accept it and re-save in the signed format.
      state = merge(parsed);
    }

    // One-time migration from the pre-progression save.
    if (!parsed) {
      try {
        var old = JSON.parse(global.localStorage.getItem(LEGACY_KEY) || 'null');
        if (old && typeof old === 'object' && old.best) state.endlessBest = old.best;
      } catch (e) { /* ignore */ }
    }
    return state;
  }

  function save() {
    try {
      var payload = JSON.stringify(load());
      var out = integrityOn()
        ? JSON.stringify({ v: SIG_VERSION, c: keyedHash(payload), d: payload })
        : payload;
      global.localStorage.setItem(KEY, out);
    } catch (e) { /* quota / private mode */ }
  }

  function dateStr(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  var Profile = {
    data: load,
    save: save,
    today: function () { return dateStr(Date.now()); },

    /* ---------------- coins ---------------- */

    coins: function () { return load().coins; },

    addCoins: function (n) {
      var s = load();
      s.coins = Math.max(0, Math.round(s.coins + n));
      if (n > 0) s.stats.coinsEarned += n;
      save();
      return s.coins;
    },

    spend: function (n) {
      var s = load();
      if (s.coins < n) return false;
      s.coins -= n;
      save();
      return true;
    },

    /* ---------------- levels ---------------- */

    unlocked: function () { return load().unlocked; },

    isUnlocked: function (level) { return level <= load().unlocked; },

    starsFor: function (level) { return load().levels[level] || 0; },

    totalStars: function () {
      var l = load().levels, sum = 0;
      for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) sum += l[k];
      return sum;
    },

    maxStars: function () { return global.Levels ? global.Levels.total * 3 : 90; },

    /** Returns what changed, so the UI can react (log unlocked, next level...). */
    completeLevel: function (level, stars, coins) {
      var s = load();
      var prev = s.levels[level] || 0;
      var improved = stars > prev;
      if (improved) s.levels[level] = stars;
      s.stats.levelsDone += 1;
      s.coins += Math.max(0, Math.round(coins));
      s.stats.coinsEarned += Math.max(0, Math.round(coins));

      var unlockedNext = false;
      if (level + 1 <= global.Levels.total && s.unlocked < level + 1) {
        s.unlocked = level + 1;
        unlockedNext = true;
      }

      // Clearing a chapter finale unlocks that chapter's story log.
      var logUnlocked = null;
      if (global.Levels && level % global.Levels.perChapter === 0) {
        var ch = Math.floor((level - 1) / global.Levels.perChapter) + 1;
        var log = global.Story.chapter(ch).log;
        if (log && s.logs.indexOf(log.id) < 0) {
          s.logs.push(log.id);
          logUnlocked = log;
        }
      }

      save();
      return {
        improved: improved,
        isNewBest: improved,
        unlockedNext: unlockedNext,
        logUnlocked: logUnlocked,
        totalStars: Profile.totalStars(),
      };
    },

    /* ---------------- story ---------------- */

    logs: function () { return load().logs.slice(); },
    hasLog: function (id) { return load().logs.indexOf(id) >= 0; },

    chapterSeen: function (ch) { return load().seenChapters.indexOf(ch) >= 0; },
    markChapterSeen: function (ch) {
      var s = load();
      if (s.seenChapters.indexOf(ch) < 0) {
        s.seenChapters.push(ch);
        save();
      }
    },

    /* ---------------- endless ---------------- */

    endlessBest: function () { return load().endlessBest; },

    submitEndless: function (score) {
      var s = load();
      var isBest = score > s.endlessBest;
      if (isBest) s.endlessBest = score;
      s.stats.runs += 1;
      save();
      return isBest;
    },

    /* ---------------- skins ---------------- */

    skin: function () { return load().skin; },
    ownsSkin: function (id) { return load().ownedSkins.indexOf(id) >= 0; },

    buySkin: function (id) {
      var s = load();
      var skin = global.Skins.byId(id);
      if (!skin || Profile.ownsSkin(id)) return false;
      if (!Profile.spend(skin.cost)) return false;
      s.ownedSkins.push(id);
      s.skin = id;
      save();
      return true;
    },

    equipSkin: function (id) {
      var s = load();
      if (!Profile.ownsSkin(id)) return false;
      s.skin = id;
      save();
      return true;
    },

    /* ---------------- stats ---------------- */

    bump: function (name, amount) {
      var s = load();
      s.stats[name] = (s.stats[name] || 0) + (amount || 1);
    },

    stats: function () { return load().stats; },

    /* ---------------- daily streak ---------------- */

    streak: function () { return load().streak; },

    /** Call once on boot. Returns { days, bonus } - bonus is 0 if already claimed today. */
    touchStreak: function () {
      var s = load();
      var today = dateStr(Date.now());
      var yesterday = dateStr(Date.now() - 86400000);
      if (s.streak.last === today) return { days: s.streak.days, bonus: 0, isNew: false };

      var days = s.streak.last === yesterday ? s.streak.days + 1 : 1;
      var bonus = Math.min(60, 10 * days);
      if (days % 7 === 0) bonus *= 2;

      s.streak.days = days;
      s.streak.last = today;
      s.streak.best = Math.max(s.streak.best, days);
      s.coins += bonus;
      save();
      return { days: days, bonus: bonus, isNew: true };
    },

    /* ---------------- missions slots (owned by missions.js) ---------------- */

    missionsData: function () { return load().missions; },
    setMissionsData: function (data) {
      load().missions = data;
      save();
    },

    /** True when the on-disk save failed its checksum. Detection, not proof. */
    wasTampered: function () {
      load();
      return tampered;
    },

    /* ---------------- ghost of your best run ---------------- */

    ghost: function (key) {
      var g = load().ghosts || {};
      return g[key] || null;
    },

    /**
     * Keeps the best silhouette only. "Best" is by blocks stacked, so the ghost
     * you race is always your furthest run, not your highest scoring one.
     */
    saveGhost: function (key, pairs, blocks) {
      var s = load();
      s.ghosts = s.ghosts || {};
      var prev = s.ghosts[key];
      if (!prev || !prev.blocks || blocks > prev.blocks) {
        s.ghosts[key] = { blocks: blocks, pairs: pairs.slice(0, 80) };
        save();
        return true;
      }
      return false;
    },

    ghostPairs: function (key) {
      var entry = (load().ghosts || {})[key];
      return entry ? entry.pairs : null;
    },

    /* ---------------- consumables (the coin sink) ---------------- */

    items: function () {
      var s = load();
      s.items = Object.assign({ spare_cell: 0, repair_kit: 0 }, s.items || {});
      return s.items;
    },

    itemCount: function (id) {
      return Profile.items()[id] || 0;
    },

    addItem: function (id, n) {
      var s = load();
      s.items = Object.assign({ spare_cell: 0, repair_kit: 0 }, s.items || {});
      s.items[id] = (s.items[id] || 0) + (n || 1);
      save();
      return s.items[id];
    },

    useItem: function (id) {
      var s = load();
      s.items = Object.assign({ spare_cell: 0, repair_kit: 0 }, s.items || {});
      if (!s.items[id]) return false;
      s.items[id] -= 1;
      save();
      return true;
    },

    /* ---------------- zen ---------------- */

    zenBest: function () { return load().zenBest || 0; },

    submitZen: function (score, blocks) {
      var s = load();
      var isBest = score > (s.zenBest || 0);
      if (isBest) s.zenBest = score;
      s.zenBlocks = Math.max(s.zenBlocks || 0, blocks || 0);
      save();
      return isBest;
    },

    reset: function () {
      state = blank();
      save();
    },
  };

  global.Profile = Profile;
})(window);
