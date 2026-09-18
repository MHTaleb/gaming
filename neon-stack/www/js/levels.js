/**
 * levels.js - 30 hand-tuned-by-formula levels across 5 chapters.
 *
 * Each level is a short, winnable goal ("stack 9 blocks") rather than an endless
 * grind. Short goals are what make a level-based casual game feel good: you can
 * always see the top, and "one more level" is a real decision.
 *
 * Difficulty ramps on four axes: goal height, block speed, perfect-drop
 * tolerance and the starting block width. The last level of each chapter is a
 * finale: taller, faster, and it unlocks the chapter's story log.
 */
(function (global) {
  'use strict';

  var PER_CHAPTER = 6;
  var CHAPTERS = 5;
  var TOTAL = PER_CHAPTER * CHAPTERS;

  function config(level) {
    var n = Math.max(1, Math.min(TOTAL, Math.round(level)));
    var isFinale = n % PER_CHAPTER === 0;
    var chapter = Math.floor((n - 1) / PER_CHAPTER) + 1;

    var goal = Math.round(6 + n * 1.15);
    if (isFinale) goal += 3 + Math.floor(n / 10);

    // Speed is deliberately a gentle multiplier. The engine already ramps speed
    // with progress and hard-caps it, because above ~500 units/sec a 360-unit
    // traverse takes under 0.7s and stops being fair.
    var speedMul = 1 + Math.min(0.5, (n - 1) * 0.02);
    if (isFinale) speedMul += 0.06;

    // Tightening perfect window: 5 units early, never below 3.
    var tol = Math.max(3, 5 - Math.floor((n - 1) / 9));

    // Narrower start makes every mistake cost more.
    var baseW = Math.round(168 - Math.min(48, (n - 1) * 1.7));

    var two = Math.max(1, Math.ceil(goal * 0.16));
    var three = Math.max(two + 1, Math.ceil(goal * 0.3));

    // Hostiles. Decks 1-3 are deliberately empty so the player learns the core
    // loop before anything starts walking at them.
    var crawlerEvery = n >= 4 ? Math.max(4.5, 13 - n * 0.28) : 0;
    var enemies = {
      crawlerEvery: crawlerEvery,
      crawlerSpeed: Math.min(30, 12 + n * 0.62),
      maxCrawlers: n >= 20 ? 3 : 2,
      crawlerFromScore: 0,
      // Turrets arrive in chapter 3: a hazard you must place *around*, not kill.
      turrets: n >= 13,
      turretEvery: Math.max(16, 30 - n * 0.4),
      maxTurrets: 1,
      turretFromScore: 0,
      // Every chapter finale ends with a Warden fight once you reach the goal.
      boss: isFinale ? 2 + chapter : 0,
      bossCrawlerEvery: 5.5,
      batteries: 3,
    };

    return {
      level: n,
      chapter: chapter,
      index: ((n - 1) % PER_CHAPTER) + 1,
      isFinale: isFinale,
      goal: goal,
      speedMul: speedMul,
      tol: tol,
      baseW: baseW,
      enemies: enemies,
      /** stars[1] and stars[2] are the perfect-drop counts needed */
      stars: [0, two, three],
      name: 'Deck ' + n,
    };
  }

  /** Endless mode gets the same toys, just later and gentler. */
  function endlessEnemies() {
    return {
      crawlerEvery: 9,
      crawlerSpeed: 16,
      maxCrawlers: 2,
      crawlerFromScore: 18,
      turrets: false,
      turretEvery: 0,
      maxTurrets: 0,
      turretFromScore: 45,
      boss: 0,
      bossCrawlerEvery: 0,
      batteries: 3,
    };
  }

  function all() {
    var out = [];
    for (var i = 1; i <= TOTAL; i++) out.push(config(i));
    return out;
  }

  function firstLevelOfChapter(ch) {
    return (ch - 1) * PER_CHAPTER + 1;
  }

  global.Levels = {
    perChapter: PER_CHAPTER,
    chapterCount: CHAPTERS,
    total: TOTAL,
    config: config,
    all: all,
    endlessEnemies: endlessEnemies,
    firstLevelOfChapter: firstLevelOfChapter,
    /** Shows a chapter intro card the first time the player reaches it. */
    isChapterOpener: function (level) {
      return (level - 1) % PER_CHAPTER === 0;
    },
  };
})(window);
