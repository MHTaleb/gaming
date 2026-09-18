/**
 * progress.js - the player's campaign save: stars, unlocks, and credits.
 *
 * This is the file worth cheating, so it is the one file that gets a checksum
 * (see Store/getKeyFingerprint below). The checksum is a *detector*, not a
 * boundary: everything here runs on the player's own device, so a determined
 * attacker can rewrite it. Its job is to make casual editing fail loudly, and
 * to give support a way to tell "corrupt save" from "player says the game
 * ate my stars".
 *
 * Critically, a failed check NEVER destroys data. We keep the player's values,
 * flag the save as suspicious, and carry on. Deleting someone's campaign
 * because our hash function had a bad day is a far worse outcome than letting
 * them keep stars they edited in.
 */
(function (global) {
  'use strict';

  var KEY = 'packetdefense.progress.v1';

  /**
   * Bump this whenever a field is added or removed.
   *
   * The checksum is taken over the whole object, so adding a field changes the
   * hash of every save already on a device. Without a schema number to explain
   * that, every existing player would be told their save had been edited. The
   * number is what lets load() tell "written by an older build" apart from
   * "somebody changed the numbers".
   */
  var SCHEMA = 2;

  var cache = null;
  var tampered = false;
  var migrated = 0;      // schema we upgraded from, or 0

  function blank() {
    return {
      schema: SCHEMA,
      credits: 0,
      stars: {},        // levelId -> 0..3
      uptime: {},       // levelId -> best uptime %
      tickets: {},      // levelId -> times cleared
      unlocked: 1,      // highest unlocked level id
      research: {},     // towerId -> 0..3, permanent upgrades bought with credits
      unlocks: {},      // towerId -> 1, tower types bought on the BASE screen
      hardening: 0,     // 0..3, permanent PROD leak reduction
      clears: 0,
      leaks: 0,
      playtime: 0,
      created: Date.now(),
    };
  }

  /**
   * FNV-1a with a mixed-in key. Not cryptography and not pretending to be:
   * it stops "open devtools, set stars to 3", nothing more.
   */
  function fingerprint(obj) {
    var s = JSON.stringify(obj);
    var h = 0x811c9dc5;
    var salt = 'packet-defense/v1';
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    for (var j = 0; j < salt.length; j++) {
      h ^= salt.charCodeAt(j);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function readRaw() {
    try {
      return global.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(text) {
    try {
      global.localStorage.setItem(KEY, text);
      return true;
    } catch (e) {
      // Private mode or quota. The game must keep working in memory.
      return false;
    }
  }

  function load() {
    if (cache) return cache;
    var raw = readRaw();
    if (!raw) { cache = blank(); return cache; }

    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

    if (!parsed || typeof parsed !== 'object') { cache = blank(); return cache; }

    var stored = parsed.check;
    var data = parsed.data;
    if (!data || typeof data !== 'object') { cache = blank(); return cache; }

    // A save from an older build cannot be verified with the current schema's
    // hash, because the hash covers fields that did not exist yet. So the check
    // is skipped for it and the save is re-hashed the next time anything is
    // written. The cost of that is an attacker being able to disable the check
    // by claiming an old schema - which they could already do by editing the
    // check field directly. This was never a boundary, only a smoke alarm, and
    // a false accusation against a real player is the worse failure.
    var from = typeof data.schema === 'number' ? data.schema : 0;
    if (from < SCHEMA) {
      migrated = from;
    } else if (stored !== fingerprint(data)) {
      tampered = true;
    }

    var base = blank();
    cache = Object.assign(base, data);
    // Object.assign copied the *old* schema number in, so put the current one
    // back. Without this the save would stay at the old schema forever and the
    // tamper check would never be re-armed.
    cache.schema = SCHEMA;
    cache.stars = Object.assign({}, data.stars || {});
    cache.uptime = Object.assign({}, data.uptime || {});
    cache.tickets = Object.assign({}, data.tickets || {});
    cache.research = Object.assign({}, data.research || {});
    // Fields added after a schema was already in the wild default here rather
    // than forcing a schema bump. A save that predates tower unlocks simply has
    // none, which is exactly right, and bumping would have skipped the tamper
    // check for every existing player to achieve the same thing.
    cache.unlocks = Object.assign({}, data.unlocks || {});
    cache.hardening = Math.max(0, Math.min(3, Math.round(data.hardening || 0)));
    return cache;
  }

  function save() {
    var o = load();
    writeRaw(JSON.stringify({ check: fingerprint(o), data: o }));
    return o;
  }

  /* ------------------------------------------------------------------ *
   * Credits
   * ------------------------------------------------------------------ */

  function credits() { return load().credits; }

  function addCredits(n) {
    var o = load();
    o.credits = Math.max(0, Math.round(o.credits + n));
    save();
    return o.credits;
  }

  function spendCredits(n) {
    var o = load();
    if (o.credits < n) return false;
    o.credits -= n;
    save();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Campaign
   * ------------------------------------------------------------------ */

  function stars(id) { return load().stars[id] || 0; }
  function bestUptime(id) { return load().uptime[id] || 0; }
  function isUnlocked(id) { return id <= load().unlocked; }

  function totalStars() {
    var s = load().stars;
    return Object.keys(s).reduce(function (a, k) { return a + (s[k] || 0); }, 0);
  }

  /**
   * Record a completed ticket.
   *
   * Stars are only ever raised. Replaying a level you three-starred with a
   * worse run must not take anything away, or players learn to avoid replaying
   * levels they have already mastered.
   */
  function complete(id, result, levelCount) {
    var o = load();
    var uptime = Math.max(0, Math.min(100, result.uptime));

    var earned = 1;                       // clearing at all is one star
    if (uptime >= 90) earned = 2;
    if (result.leaks === 0) earned = 3;   // own goal: no leaks is the real win

    var previous = o.stars[id] || 0;
    var improved = earned > previous;

    o.stars[id] = Math.max(previous, earned);
    o.uptime[id] = Math.max(o.uptime[id] || 0, Math.round(uptime));
    o.tickets[id] = (o.tickets[id] || 0) + 1;
    o.clears += 1;
    o.leaks += result.leaks || 0;
    o.playtime += result.seconds || 0;

    var unlockedNew = null;
    if (id >= o.unlocked && id < levelCount) {
      o.unlocked = id + 1;
      unlockedNew = o.unlocked;
    }

    // Payout scales with the stars actually earned plus a first-clear bonus,
    // so grinding an easy level is worse than pushing forward.
    var payout = 15 + earned * 10 + (previous === 0 ? 40 : 0);
    o.credits += payout;

    save();
    return {
      stars: o.stars[id],
      earned: earned,
      improved: improved,
      credits: payout,
      unlocked: unlockedNew,
    };
  }

  /* ------------------------------------------------------------------ *
   * Research: the permanent tree bought with credits.
   *
   * This file only stores the ranks. What a rank *means* is base.js's
   * business, so a balance change to the tree never touches the save format.
   * ------------------------------------------------------------------ */

  function research(towerId) {
    var r = load().research;
    return Math.max(0, Math.min(3, r[towerId] || 0));
  }

  function setResearch(towerId, rank) {
    var o = load();
    o.research[towerId] = Math.max(0, Math.min(3, rank));
    save();
    return o.research[towerId];
  }

  function hardening() { return load().hardening; }

  function setHardening(rank) {
    var o = load();
    o.hardening = Math.max(0, Math.min(3, rank));
    save();
    return o.hardening;
  }

  /**
   * Tower types bought on the BASE screen.
   *
   * These live in the save rather than in Store alongside settings, because
   * they are progression: reset has to clear them, and a player who buys a
   * tower and then cannot find it after a reset has found a bug.
   */
  function towerUnlocked(id) { return !!load().unlocks[id]; }

  function setTowerUnlocked(id, on) {
    var o = load();
    if (on) o.unlocks[id] = 1;
    else delete o.unlocks[id];
    save();
    return !!o.unlocks[id];
  }

  function unlockedTypes() { return Object.keys(load().unlocks); }

  function reset() {
    cache = blank();
    tampered = false;
    migrated = 0;
    save();
    return load();
  }

  global.Profile = {
    load: load,
    save: save,
    credits: credits,
    addCoins: addCredits,      // name the purchased module already calls
    addCredits: addCredits,
    spend: spendCredits,
    spendCredits: spendCredits,
    stars: stars,
    bestUptime: bestUptime,
    isUnlocked: isUnlocked,
    totalStars: totalStars,
    complete: complete,
    research: research,
    setResearch: setResearch,
    hardening: hardening,
    setHardening: setHardening,
    towerUnlocked: towerUnlocked,
    setTowerUnlocked: setTowerUnlocked,
    unlockedTypes: unlockedTypes,
    /** Which schema this save was upgraded from, or 0. For the self-test. */
    migratedFrom: function () { return migrated; },
    reset: reset,
    isTampered: function () { return tampered; },
    _fingerprint: fingerprint,
    _key: KEY,
  };
})(window);
