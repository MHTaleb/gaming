/**
 * analytics.js - a local funnel, with no third party involved.
 *
 * The point of this file is to answer one question: *where do players quit?*
 * Without it, tuning decks is guesswork. It answers it on-device, so it works
 * before you have an account anywhere, and it costs nothing to run.
 *
 * Deliberately constrained:
 *  - It stores counts and small numbers. No identifiers, no device ids, no
 *    free-text, nothing that could identify a person. That keeps it on the right
 *    side of the Play data-safety form.
 *  - It keeps a bounded ring buffer, so it cannot grow without limit.
 *  - `export()` gives you JSON to paste into a ticket.
 *
 * If you later add a real service (Firebase, GameAnalytics), forward `track()`
 * from one place - see the README - and keep this local copy for offline play.
 */
(function (global) {
  'use strict';

  var KEY = 'neonstack.analytics.v1';
  var MAX_EVENTS = 400;

  var flushTimer = 0;
  var sessionStart = Date.now();

  function blank() {
    return {
      version: 1,
      events: [],                       // bounded ring buffer
      decks: {},                        // level -> { tries, cleared, deaths, bestBlocks, bossDeaths }
      daily: {},                        // date -> { played, cleared, blocks }
      totals: {
        sessions: 0,
        runs: 0,
        cleared: 0,
        zenRuns: 0,
        dailyRuns: 0,
        deaths: 0,
        bossDeaths: 0,
        purchases: 0,
        rewardedAds: 0,
        continues: 0,
        blocksStacked: 0,
        perfects: 0,
      },
      days: [],                         // distinct days played, newest last
      firstSeen: Date.now(),
    };
  }

  var data = null;

  function load() {
    if (data) return data;
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    data = Object.assign(blank(), parsed && typeof parsed === 'object' ? parsed : {});
    data.totals = Object.assign(blank().totals, data.totals || {});
    data.decks = data.decks || {};
    data.daily = data.daily || {};
    data.days = data.days || [];
    return data;
  }

  function save() {
    // Batched: writing on every event would be a write per block stacked.
    if (flushTimer) return;
    flushTimer = global.setTimeout(function () {
      flushTimer = 0;
      try {
        global.localStorage.setItem(KEY, JSON.stringify(load()));
      } catch (e) { /* quota: analytics is never worth breaking the game over */ }
    }, 900);
  }

  function today() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function deckBucket(level) {
    var d = load();
    var key = String(level);
    if (!d.decks[key]) d.decks[key] = { tries: 0, cleared: 0, deaths: 0, bestBlocks: 0, bossDeaths: 0 };
    return d.decks[key];
  }

  function push(name, props) {
    var d = load();
    d.events.push({ t: Date.now(), n: name, p: props || null });
    while (d.events.length > MAX_EVENTS) d.events.shift();
  }

  var Analytics = {
    init: function () {
      var d = load();
      d.totals.sessions += 1;
      var t = today();
      if (d.days.indexOf(t) < 0) {
        d.days.push(t);
        if (d.days.length > 180) d.days.shift();
      }
      push('session_start', null);
      save();
      return d.totals.sessions;
    },

    /** Generic event. Keep names short and stable; they end up in aggregates. */
    track: function (name, props) {
      push(name, props);
      save();
    },

    runStart: function (mode, level) {
      var d = load();
      d.totals.runs += 1;
      if (mode === 'zen') d.totals.zenRuns += 1;
      if (mode === 'daily') d.totals.dailyRuns += 1;
      if (mode === 'level') deckBucket(level).tries += 1;
      push('run_start', { mode: mode, level: level });
      save();
    },

    /**
     * The important one. A "death" on deck 12 with 9/24 blocks is the single
     * most useful signal in this game: it says the difficulty curve has a wall.
     */
    runEnd: function (info) {
      var d = load();
      d.totals.blocksStacked += info.stacked || 0;
      d.totals.perfects += info.perfects || 0;

      if (info.mode === 'level') {
        var b = deckBucket(info.level);
        b.bestBlocks = Math.max(b.bestBlocks, info.stacked || 0);
        if (info.cleared) {
          b.cleared += 1;
          d.totals.cleared += 1;
        } else {
          b.deaths += 1;
          d.totals.deaths += 1;
          if (info.bossFought) {
            b.bossDeaths += 1;
            d.totals.bossDeaths += 1;
          }
        }
      } else if (info.mode === 'daily') {
        var key = info.date || today();
        d.daily[key] = { played: true, cleared: !!info.cleared, blocks: info.stacked || 0 };
      }

      push('run_end', {
        mode: info.mode,
        level: info.level || 0,
        stacked: info.stacked || 0,
        perfects: info.perfects || 0,
        cleared: !!info.cleared,
        reason: info.reason || '',
        boss: !!info.bossFought,
      });
      save();
    },

    purchase: function (productId, source) {
      load().totals.purchases += 1;
      push('purchase', { id: productId, src: source });
      save();
    },

    rewardedAd: function (where) {
      load().totals.rewardedAds += 1;
      push('rewarded_ad', { where: where });
      save();
    },

    continue: function (how) {
      load().totals.continues += 1;
      push('continue', { how: how });
      save();
    },

    /** Per-deck breakdown, sorted by how badly it is going. */
    funnel: function () {
      var d = load();
      var rows = [];
      for (var key in d.decks) {
        if (!Object.prototype.hasOwnProperty.call(d.decks, key)) continue;
        var b = d.decks[key];
        rows.push({
          level: Number(key),
          tries: b.tries,
          cleared: b.cleared,
          deaths: b.deaths,
          bossDeaths: b.bossDeaths,
          bestBlocks: b.bestBlocks,
          clearRate: b.tries ? b.cleared / b.tries : 0,
        });
      }
      rows.sort(function (a, b) { return a.level - b.level; });
      return rows;
    },

    /** Decks people die on most: the difficulty spikes, worst first. */
    walls: function (limit) {
      return this.funnel()
        .filter(function (r) { return r.deaths > 0; })
        .sort(function (a, b) { return b.deaths - a.deaths; })
        .slice(0, limit || 5);
    },

    summary: function () {
      var d = load();
      var t = d.totals;
      return {
        sessions: t.sessions,
        daysPlayed: d.days.length,
        runs: t.runs,
        cleared: t.cleared,
        deaths: t.deaths,
        clearRate: t.runs ? +(t.cleared / t.runs).toFixed(3) : 0,
        avgBlocks: t.runs ? +(t.blocksStacked / t.runs).toFixed(1) : 0,
        perfectRate: t.blocksStacked ? +(t.perfects / t.blocksStacked).toFixed(3) : 0,
        purchases: t.purchases,
        rewardedAds: t.rewardedAds,
        continues: t.continues,
        bossDeaths: t.bossDeaths,
        firstSeen: d.firstSeen,
      };
    },

    export: function () {
      var d = load();
      return JSON.stringify({ summary: this.summary(), funnel: this.funnel(), days: d.days.length }, null, 1);
    },

    reset: function () {
      data = blank();
      save();
    },

    _flush: function () {
      if (flushTimer) {
        global.clearTimeout(flushTimer);
        flushTimer = 0;
      }
      try {
        global.localStorage.setItem(KEY, JSON.stringify(load()));
      } catch (e) { /* ignore */ }
    },

    sessionSeconds: function () {
      return Math.round((Date.now() - sessionStart) / 1000);
    },
  };

  global.Analytics = Analytics;
})(window);
