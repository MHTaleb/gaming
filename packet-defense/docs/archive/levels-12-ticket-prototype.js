/**
 * levels.js - the campaign: three environments, twelve incident tickets.
 *
 * Difficulty comes from the *shape of the attack*, not from bigger numbers.
 * A level that is "the same but the enemies have 40% more HP" teaches nothing;
 * a level that suddenly sends forty 1-HP drones down a road your Antivirus
 * cannot cover teaches the player that rate of fire is a stat worth caring
 * about. Every level below is built around one idea it wants to introduce.
 *
 * Paths are tile waypoints. They deliberately cross back over themselves so
 * that a single well-placed tower can cover two stretches of road, which is
 * the skill the whole game is asking the player to learn.
 */
(function (global) {
  'use strict';

  var PATHS = {
    // DEV: long, gentle, lots of corners close together. Forgiving.
    switchback: [[-1, 1], [2, 1], [2, 4], [6, 4], [6, 7], [10, 7], [10, 4], [13, 4]],
    // STAGING: taller columns, fewer overlaps. Rewards range.
    zigzag: [[-1, 7], [3, 7], [3, 1], [7, 1], [7, 6], [11, 6], [11, 4], [13, 4]],
    // PRODUCTION: hugs the walls, so the middle of the map is dead space.
    spiral: [[-1, 4], [4, 4], [4, 1], [8, 1], [8, 7], [12, 7], [12, 4], [13, 4]],
    // The boss road: short, straight, no room to be clever. You either have
    // the damage or you do not.
    gauntlet: [[-1, 2], [5, 2], [5, 6], [12, 6], [12, 4], [13, 4]],
  };

  var BASE = [13, 4];

  /**
   * Escalation, by level id.
   *
   * The brief on this game is that enemies improve at every level, and the
   * honest way to do that is not a bigger health number. Health alone makes the
   * same fight last longer; what actually changes the fight is taking away the
   * answer the player used last time.
   *
   *  - `armour` is flat damage reduction, so it punishes cheap fast towers and
   *    leaves heavy hitters alone. This is the single most important dial here,
   *    because without it the optimal play in every level is "buy the cheapest
   *    tower and buy a lot of them", which is what the balance bot proved by
   *    three-starring eleven levels with nothing but Firewalls.
   *  - `hp` and `speed` are the numeric part, kept deliberately modest. Stacked
   *    on top of the per-group `hp` bumps in the wave tables, they compound.
   *  - `gap` tightens spawn spacing, which raises the *rate* of incoming damage
   *    rather than the total, and is what makes late waves feel like pressure.
   *  - `traits` add a named, visible rule. See the TRAITS table in threats.js.
   *
   * Bosses are excluded from hp scaling and traits. A boss is a hand-built
   * fight and multiplying a 1400 HP encounter by the level-12 curve turns a
   * climax into a chore.
   *
   * ---------------------------------------------------------------------------
   * Why the starting bandwidth in the level table rises faster than the threat
   * curve does, and why that is not the same thing as making levels easier:
   *
   * Armour raises the *price* of a working defence. When a Firewall at 60
   * bandwidth still does its full damage, a viable opening costs about 180.
   * Once armour lands, that 180 buys a defence that cannot hurt the armoured
   * threats at all, and the same opening costs more like 300-450 because it has
   * to be built out of WAFs and Antivirus. Held at the old numbers, tickets ten
   * to twelve were unwinnable no matter how well they were played - the bot
   * proved it, losing level 12 even with double the original budget.
   *
   * So capital climbs with armour. The level still throws strictly more at the
   * player every time; it just also hands them the means to answer it, which is
   * the difference between a hard level and an impossible one.
   */
  var TUNING = [
    null,                                                   // index 0 unused, so this reads by level id
    { hp: 1.00, speed: 1.00, armour: 0, gap: 1.00, traits: [] },
    { hp: 1.02, speed: 1.00, armour: 0, gap: 0.99, traits: [] },
    { hp: 1.05, speed: 1.02, armour: 0, gap: 0.98, traits: [] },
    { hp: 1.07, speed: 1.03, armour: 1, gap: 0.97, traits: [] },
    { hp: 1.09, speed: 1.04, armour: 1, gap: 0.96, traits: ['regenerating'] },
    { hp: 1.11, speed: 1.05, armour: 2, gap: 0.95, traits: ['regenerating'] },
    { hp: 1.12, speed: 1.06, armour: 2, gap: 0.94, traits: ['regenerating', 'swift'] },
    { hp: 1.14, speed: 1.07, armour: 2, gap: 0.93, traits: ['regenerating', 'swift'] },
    { hp: 1.16, speed: 1.08, armour: 3, gap: 0.92, traits: ['regenerating', 'swift'] },
    { hp: 1.18, speed: 1.09, armour: 3, gap: 0.91, traits: ['regenerating', 'swift', 'saboteur'] },
    { hp: 1.20, speed: 1.10, armour: 4, gap: 0.90, traits: ['regenerating', 'swift', 'saboteur'] },
    { hp: 1.22, speed: 1.11, armour: 4, gap: 0.89, traits: ['regenerating', 'swift', 'saboteur', 'reviving'] },
  ];

  /**
   * The escalation applied to a level's threats.
   *
   * `hardened` is derived from `armour` rather than listed, so the briefing can
   * never advertise armour the level does not actually apply.
   */
  function tuning(level) {
    var t = TUNING[level.id] || TUNING[1];
    var traits = (t.traits || []).slice();
    if (t.armour > 0) traits.unshift('hardened');
    return { hp: t.hp, speed: t.speed, armour: t.armour, gap: t.gap, traits: traits };
  }

  /**
   * One number for "how much is coming at you".
   *
   * This is the curve the game promises: every ticket throws more at you than
   * the last. It is not a win prediction - it is effective health multiplied by
   * pace, which is the thing the player actually feels. The harness asserts it
   * rises with every level, so "it gets harder" is a property of the data
   * rather than a hope.
   */
  function power(level) {
    var tune = tuning(level);
    var D = global.Threats ? global.Threats.DEFS : {};
    var total = 0;
    level.waves.forEach(function (w) {
      w.forEach(function (grp) {
        var d = D[grp.t];
        if (!d) return;
        var boss = !!d.boss;
        var minHp = global.Threats && global.Threats.ARMOUR_MIN_HP ? global.Threats.ARMOUR_MIN_HP : 30;
        var hp = d.hp * (grp.hp || 1) * (boss ? 1 : tune.hp);
        // Armour only lands on threats big enough to carry plating, which is the
        // same rule spawn() applies. A curve that priced armour on the chaff
        // would tell me a level was harder than it plays.
        var armoured = d.hp >= minHp;
        var armour = (d.armour || 0) + (boss || !armoured ? 0 : tune.armour);
        // Armour is priced as effective health. A 7-damage Firewall shot loses
        // 60% of its output to armour 4, so each point is worth more the later
        // it appears; the multiplier is deliberately rough, because it exists to
        // keep the curve honest, not to predict an outcome.
        var effective = hp * (1 + armour * 0.22);
        // The boss is counted at its full weight: it is the reason ticket 12
        // exists, and leaving it out made the last level score lower than the
        // eleventh, which is exactly the sort of thing this number is here to
        // catch.
        if (boss) effective *= 1.6;
        total += effective * grp.n * (d.speed * (grp.sp || 1) * tune.speed) / 46;
      });
    });
    return Math.round(total);
  }

  /** Wave group shorthand: type, count, seconds between spawns. */
  function g(t, n, gap, extra) {
    var out = { t: t, n: n, gap: gap === undefined ? 0.85 : gap, delay: 0 };
    if (extra) for (var k in extra) out[k] = extra[k];
    return out;
  }

  function at(seconds, group) { group.delay = seconds; return group; }

  var LEVELS = [
    {
      id: 1, env: 'DEV', code: 'INC-1043',
      name: 'The missing semicolon',
      brief: 'A build agent is spraying malformed requests at the DEV box. It is not clever. There are just a lot of them.',
      tip: 'A Firewall on a corner covers two stretches of road. Corners are the best real estate you have.',
      path: 'switchback', bandwidth: 140,
      waves: [
        [g('smell', 5, 1.0)],
        [g('smell', 8, 0.8)],
        [g('smell', 10, 0.7), at(6, g('botnet', 5, 0.35))],
      ],
    },
    {
      id: 2, env: 'DEV', code: 'INC-1044',
      name: 'Copy-paste incident',
      brief: 'Someone duplicated a job four times. Now four times the traffic, arriving four times as fast.',
      tip: 'Overlapping Firewall ranges are worth more than one expensive tower. Try two on the same corner.',
      path: 'switchback', bandwidth: 150,
      waves: [
        [g('smell', 8, 0.8)],
        [g('botnet', 12, 0.3)],
        [g('smell', 12, 0.6), at(4, g('botnet', 10, 0.3))],
        [g('smell', 16, 0.5, { hp: 1.2 }), at(5, g('botnet', 14, 0.25))],
      ],
    },
    {
      id: 3, env: 'DEV', code: 'INC-1045',
      name: 'String concatenation',
      brief: 'A search box is being used as a database. The requests are fast, and your Firewall can barely see them.',
      tip: 'SQL Injection takes only 55% damage from a Firewall. This is what the WAF is for.',
      path: 'switchback', bandwidth: 165,
      waves: [
        [g('smell', 10, 0.7)],
        [g('sqli', 4, 1.1)],
        [g('sqli', 6, 0.9), at(3, g('smell', 8, 0.6))],
        [g('sqli', 8, 0.8)],
        [g('sqli', 10, 0.7, { hp: 1.3 }), at(5, g('botnet', 16, 0.25))],
      ],
    },
    {
      id: 4, env: 'DEV', code: 'INC-1046',
      name: 'It works on my machine',
      brief: 'A comment field is executing whatever it is given. Every one you destroy disgorges two more.',
      tip: 'XSS splits on death. Kill it somewhere you can kill the children too.',
      path: 'switchback', bandwidth: 180,
      waves: [
        [g('xss', 4, 1.2)],
        [g('smell', 12, 0.6), at(4, g('xss', 4, 1.0))],
        [g('xss', 8, 0.9)],
        [g('sqli', 8, 0.8), at(4, g('xss', 6, 0.9))],
        [g('xss', 10, 0.8, { hp: 1.3 }), at(6, g('sqli', 8, 0.7))],
        [g('xss', 12, 0.7, { hp: 1.5 }), at(4, g('botnet', 20, 0.22))],
      ],
    },

    /* ---------------------- STAGING ---------------------- */
    {
      id: 5, env: 'STAGING', code: 'INC-1051',
      name: 'Flaky test suite',
      brief: 'A process that refuses to die is stuck in a retry loop. Killing it just makes it angry.',
      tip: 'Zombie Processes get up once at over half health. Antivirus damage is what stops the second act.',
      path: 'zigzag', bandwidth: 195,
      waves: [
        [g('zombie', 3, 1.6)],
        [g('smell', 14, 0.55), at(5, g('zombie', 3, 1.4))],
        [g('sqli', 10, 0.7), at(4, g('zombie', 4, 1.3))],
        [g('zombie', 6, 1.2)],
        [g('xss', 10, 0.8), at(5, g('zombie', 5, 1.1))],
        [g('zombie', 8, 1.0, { hp: 1.4 }), at(6, g('botnet', 22, 0.2))],
      ],
    },
    {
      id: 6, env: 'STAGING', code: 'INC-1052',
      name: "The intern's migration",
      brief: 'Something on the wire is encrypting files as it walks. It also switches off anything it passes.',
      tip: 'Ransomware shuts a tower down for 4 seconds on contact. Never let one tower be your whole defence.',
      path: 'zigzag', bandwidth: 210,
      waves: [
        [g('ransom', 1, 2)],
        [g('smell', 12, 0.6), at(4, g('ransom', 1, 2))],
        [g('ransom', 2, 2.2)],
        [g('zombie', 6, 1.1), at(6, g('ransom', 2, 2))],
        [g('ransom', 3, 1.8)],
        [g('sqli', 12, 0.65), at(5, g('ransom', 3, 1.6))],
        [g('ransom', 4, 1.6, { hp: 1.3 }), at(4, g('xss', 10, 0.75))],
      ],
    },
    {
      id: 7, env: 'STAGING', code: 'INC-1053',
      name: 'The legacy endpoint',
      brief: 'An endpoint nobody has touched since 2011 is being walked through, slowly and thoroughly.',
      tip: 'The longer road on this map doubles back on itself twice. Two towers covering both passes is worth four covering one.',
      path: 'zigzag', bandwidth: 265,
      waves: [
        [g('sqli', 10, 0.65), at(4, g('xss', 8, 0.8))],
        [g('zombie', 8, 1.0), at(5, g('smell', 16, 0.5))],
        [g('ransom', 3, 1.7), at(6, g('sqli', 10, 0.6))],
        [g('botnet', 30, 0.18), at(6, g('zombie', 6, 1.0))],
        [g('xss', 14, 0.7), at(5, g('ransom', 4, 1.5))],
        [g('sqli', 16, 0.55, { hp: 1.25 }), at(6, g('xss', 12, 0.7, { hp: 1.25 }))],
        [g('ransom', 5, 1.4, { hp: 1.3 }), at(4, g('zombie', 10, 0.9, { hp: 1.3 }))],
      ],
    },
    {
      id: 8, env: 'STAGING', code: 'INC-1054',
      name: 'Load test gone wrong',
      brief: 'A load test was pointed at STAGING instead of a sandbox. It has found friends.',
      tip: 'DDoS drones have 7 HP. A single Firewall kills them faster than they spawn - if it is in the right place.',
      path: 'zigzag', bandwidth: 295,
      waves: [
        [g('botnet', 40, 0.14)],
        [g('botnet', 50, 0.12), at(8, g('smell', 14, 0.55))],
        [g('smell', 20, 0.45), at(6, g('botnet', 40, 0.13))],
        [g('zombie', 10, 0.9), at(6, g('botnet', 45, 0.12))],
        [g('sqli', 16, 0.55), at(5, g('xss', 14, 0.65))],
        [g('botnet', 60, 0.1, { hp: 1.4 }), at(10, g('zombie', 8, 0.9))],
        [g('ransom', 5, 1.4), at(5, g('sqli', 18, 0.5))],
        [g('xss', 20, 0.55, { hp: 1.4 }), at(8, g('botnet', 50, 0.11))],
      ],
    },

    /* ---------------------- PRODUCTION ---------------------- */
    {
      id: 9, env: 'PRODUCTION', code: 'INC-1061',
      name: 'Black Friday',
      brief: 'Real traffic, real money, real attackers. The road hugs the walls here and there is nowhere to hide.',
      tip: 'PRODUCTION maps push the road to the edges. The middle of the map is dead space - do not build in it.',
      path: 'spiral', bandwidth: 330,
      waves: [
        [g('smell', 20, 0.45), at(6, g('sqli', 10, 0.6))],
        [g('botnet', 45, 0.12), at(6, g('xss', 10, 0.7))],
        [g('zombie', 10, 0.85), at(5, g('sqli', 14, 0.55))],
        [g('ransom', 4, 1.6), at(5, g('botnet', 40, 0.12))],
        [g('xss', 16, 0.6), at(6, g('zombie', 9, 0.85))],
        [g('sqli', 20, 0.5, { hp: 1.3 }), at(6, g('ransom', 4, 1.5))],
        [g('botnet', 60, 0.1), at(8, g('xss', 16, 0.6, { hp: 1.3 }))],
        [g('ransom', 6, 1.3, { hp: 1.35 }), at(6, g('zombie', 12, 0.8, { hp: 1.35 }))],
      ],
    },
    {
      id: 10, env: 'PRODUCTION', code: 'INC-1062',
      name: 'The ransom note',
      brief: 'A coordinated extortion crew. They are not trying to overwhelm you — they are trying to blind you.',
      tip: 'Antivirus does 170% damage to malware. This is the level where that stops being optional.',
      path: 'spiral', bandwidth: 375,
      waves: [
        [g('ransom', 3, 1.5)],
        [g('ransom', 4, 1.4), at(6, g('smell', 18, 0.5))],
        [g('zombie', 12, 0.8), at(6, g('ransom', 4, 1.4))],
        [g('ransom', 6, 1.3), at(6, g('sqli', 16, 0.55))],
        [g('botnet', 50, 0.11), at(8, g('ransom', 5, 1.3))],
        [g('ransom', 8, 1.1, { hp: 1.25 }), at(5, g('xss', 18, 0.6))],
        [g('zombie', 16, 0.75, { hp: 1.35 }), at(8, g('ransom', 6, 1.2))],
        [g('ransom', 10, 1.0, { hp: 1.5 })],
        [g('sqli', 24, 0.45, { hp: 1.4 }), at(8, g('ransom', 6, 1.1, { hp: 1.4 }))],
      ],
    },
    {
      id: 11, env: 'PRODUCTION', code: 'INC-1063',
      name: 'Everything at once',
      brief: 'Whoever is doing this has read your incident log and is running all of it simultaneously.',
      tip: 'You cannot cover every class equally. Pick the threat you will lose to, and make peace with it.',
      path: 'spiral', bandwidth: 430,
      waves: [
        [g('smell', 16, 0.5), at(5, g('botnet', 28, 0.15))],
        [g('xss', 14, 0.7), at(6, g('sqli', 12, 0.6))],
        [g('zombie', 14, 0.75), at(6, g('ransom', 4, 1.4))],
        [g('botnet', 60, 0.1), at(8, g('xss', 16, 0.6))],
        [g('ransom', 7, 1.2), at(6, g('sqli', 20, 0.5))],
        [g('sqli', 24, 0.45, { hp: 1.3 }), at(6, g('zombie', 14, 0.75, { hp: 1.3 }))],
        [g('xss', 24, 0.5, { hp: 1.35 }), at(8, g('botnet', 50, 0.11))],
        [g('ransom', 9, 1.1, { hp: 1.4 }), at(6, g('smell', 30, 0.35, { hp: 1.4 }))],
        [g('sqli', 28, 0.4, { hp: 1.45 }), at(6, g('xss', 22, 0.5, { hp: 1.45 })), at(12, g('ransom', 8, 1.2, { hp: 1.5 }))],
      ],
    },
    {
      id: 12, env: 'PRODUCTION', code: 'INC-1064',
      name: 'Zero-Day',
      brief: 'There is no signature for this. Your Firewalls and your WAFs can see it and cannot touch it. It is walking to PROD and it is not in a hurry.',
      tip: 'The Zero-Day is immune to Firewall and WAF damage alike. Only the Antivirus can hurt it — and it is armoured, so you will need several.',
      path: 'gauntlet', bandwidth: 500, boss: 'zeroday',
      waves: [
        [g('botnet', 24, 0.16), at(5, g('smell', 14, 0.55)), at(11, g('sqli', 8, 0.7))],
        [g('zombie', 10, 0.9), at(5, g('sqli', 14, 0.6)), at(11, g('xss', 12, 0.7))],
        [g('ransom', 6, 1.3), at(5, g('xss', 20, 0.6)), at(11, g('botnet', 30, 0.14))],
        // The approach: everything the game has, so you spend your money badly.
        [g('sqli', 24, 0.45, { hp: 1.15 }), at(5, g('ransom', 8, 1.2)), at(11, g('botnet', 50, 0.12))],
        // It arrives behind a screen of armour.
        [g('ransom', 10, 1.1, { hp: 1.2 }), at(8, g('zombie', 16, 0.75, { hp: 1.2 })), at(14, g('xss', 20, 0.6))],
        // And then it arrives.
        [at(3, g('zeroday', 1, 1))],
      ],
    },
  ];

  function all() { return LEVELS.slice(); }
  function byId(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  }
  function count() { return LEVELS.length; }
  function paths() { return PATHS; }
  function base() { return BASE.slice(); }

  /** Total threats in a level, for the briefing screen and the balance tool. */
  function threatCount(level) {
    return level.waves.reduce(function (a, w) {
      return a + w.reduce(function (b, grp) { return b + grp.n; }, 0);
    }, 0);
  }

  /** Rough difficulty score used only to order the level list. */
  function difficulty(level) {
    var hpTotal = 0;
    var D = global.Threats ? global.Threats.DEFS : {};
    level.waves.forEach(function (w) {
      w.forEach(function (grp) {
        var d = D[grp.t];
        if (d) hpTotal += d.hp * (grp.hp || 1) * grp.n;
      });
    });
    return Math.round(hpTotal);
  }

  global.Levels = {
    all: all,
    byId: byId,
    count: count,
    paths: paths,
    base: base,
    threatCount: threatCount,
    difficulty: difficulty,
    tuning: tuning,
    power: power,
    TUNING: TUNING,
    LEVELS: LEVELS,
  };
})(window);
