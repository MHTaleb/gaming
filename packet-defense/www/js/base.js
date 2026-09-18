/**
 * base.js - the BASE screen's model: what you own, what you can research, and
 * what a rank actually does.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE UI
 *   main.js builds screens, progress.js stores numbers, towers.js owns combat
 *   stats. A permanent upgrade tree touches all three, so it gets its own
 *   module whose only job is to answer two questions cheaply and consistently:
 *
 *     Base.towerUnlocked(id)   may this tower be built at all?
 *     Base.statBonus(id)       what do my ranks do to this tower's numbers?
 *
 *   The battle HUD asks the first question on every layout, and towers.js asks
 *   the second on every shot. Both must be pure reads of an in-memory save, not
 *   localStorage hits in a render loop, so everything here reads through
 *   Profile's cache.
 *
 * THE BALANCE ARGUMENT
 *   A meta tree that adds raw power makes a tower defence game worse: levels
 *   stop being puzzles and become a function of how long you ground. So the
 *   ranks here are deliberately small and deliberately *linear* - a maxed
 *   Firewall is about a quarter stronger than a fresh one, not twice as strong
 *   - and the campaign is balanced to be clearable with no research at all.
 *   The tree is a reward for playing and a way to soften a level that is
 *   beating you, not a gate you must pay to pass.
 *
 *   The one thing the tree does gate is the two new tower *types*, and that is
 *   the point of the screen: they answer problems the starting four cannot.
 *   Neither is a stronger Firewall, which is what keeps them interesting.
 */
(function (global) {
  'use strict';

  /**
   * Per-tower research, three ranks, strictly additive.
   *
   * Every rank is a percentage of the base stat rather than a flat number, so a
   * Cheap tower and an expensive one stay in the same relationship after the
   * same investment. A flat +5 damage would be transformative on a Firewall and
   * invisible on an Antivirus.
   */
  var RANKS = [
    null,                                             // rank 0 exists, it is "unresearched"
    { cost: 60, costMul: 0.92, damageMul: 1, rangeMul: 1, label: 'Field-tested: build cost −8%' },
    { cost: 120, costMul: 0.92, damageMul: 1.08, rangeMul: 1, label: 'Tuned: build cost −8%, damage +8%' },
    { cost: 200, costMul: 0.92, damageMul: 1.08, rangeMul: 1.07, label: 'Hardened: −8% cost, +8% damage, +7% range' },
  ];

  var MAX_RANK = 3;

  /**
   * PROD hardening: "make the server endure".
   *
   * This reduces leak *damage*, not leak count, and that distinction matters.
   * Reducing the number of enemies a leak costs would make late waves trivial;
   * reducing how much each leak hurts means a hard level still punishes you and
   * still stops being survivable if you leak everything. It buys slack, not
   * immunity.
   */
  var HARDENING = [
    { cost: 0, leakMul: 1, label: 'Bare metal' },
    { cost: 90, leakMul: 0.9, label: 'Redundant PSU: leaks cost 10% less integrity' },
    { cost: 170, leakMul: 0.8, label: 'Hot spare: leaks cost 20% less integrity' },
    { cost: 270, leakMul: 0.7, label: 'Multi-region: leaks cost 30% less integrity' },
  ];

  var MAX_HARDENING = 3;

  /**
   * Tower types you do not start with.
   *
   * Priced above a research rank on purpose. Unlocking a type is the bigger,
   * more exciting purchase and it should feel like one; the ranks are the thing
   * you buy with the change while saving up.
   */
  var UNLOCKS = {
    honeypot: {
      cost: 180,
      pitch: 'A decoy that makes everything near it legible. Tagged threats take more damage and pay double.',
      reason: 'Cheap insurance for a corner you cannot cover properly yet.',
    },
    patch: {
      cost: 240,
      pitch: 'A release train that never stops. Repairs PROD integrity while a wave is running.',
      reason: 'The only way to get integrity back once you have lost it.',
    },
  };

  /**
   * Which types exist at all, in the order the palette shows them.
   *
   * The starting five are listed here rather than read from Towers so that the
   * save (unlocked or not) and the combat stats (damage, cost) stay in separate
   * files. A tower that is missing from here is treated as always available,
   * which fails open: a typo in this table cannot lock a player out of a tower
   * they can see in the shop.
   *
   * Five plus the two unlocks is exactly the seven the palette holds. Adding a
   * sixth starting type pushes that total to eight, at which point engine.js's
   * PALETTE_MAX starts trimming - so a new type needs a palette row before it
   * needs a price. See docs/TOWERS.md.
   */
  var FREE = ['firewall', 'waf', 'limiter', 'av', 'cdn'];

  function profile() { return global.Profile; }

  function rank(towerId) {
    var p = profile();
    return p && p.research ? p.research(towerId) : 0;
  }

  function unlockedTypes() {
    var out = FREE.slice();
    Object.keys(UNLOCKS).forEach(function (id) {
      if (towerUnlocked(id)) out.push(id);
    });
    return out;
  }

  /** May this tower be built? Unknown ids fail open - see FREE above. */
  function towerUnlocked(id) {
    if (FREE.indexOf(id) !== -1) return true;
    if (!UNLOCKS[id]) return true;      // not a locked type: available
    var p = profile();
    return !!(p && p.towerUnlocked && p.towerUnlocked(id));
  }

  function unlockInfo(id) { return UNLOCKS[id] || null; }

  /** Everything that is still locked, for the screen to render. */
  function lockedTypes() {
    return Object.keys(UNLOCKS).filter(function (id) { return !towerUnlocked(id); });
  }

  /**
   * Buy the unlock for a tower type. Returns {ok} or {ok:false, reason}.
   *
   * Credits go first and the flag second, both inside the one save, so the two
   * cannot end up disagreeing. The flag is what towers.js reads, so a failure
   * anywhere before it leaves the player with their credits still spent only in
   * the case that the save itself is unwritable - in which case the whole
   * purchase is unwritable and failing loudly is the honest outcome.
   */
  function unlock(id) {
    var info = UNLOCKS[id];
    if (!info) return { ok: false, reason: 'nothing to unlock' };
    if (towerUnlocked(id)) return { ok: false, reason: 'already unlocked' };

    var p = profile();
    if (!p || p.credits() < info.cost) {
      return { ok: false, reason: 'need ' + (info.cost - (p ? p.credits() : 0)) + ' more credits' };
    }

    if (!p.spendCredits(info.cost)) return { ok: false, reason: 'could not save' };
    p.setTowerUnlocked(id, true);
    return { ok: true, cost: info.cost };
  }

  /** Buy the next rank for a tower. */
  function research(id) {
    var now = rank(id);
    if (now >= MAX_RANK) return { ok: false, reason: 'fully researched' };

    var next = RANKS[now + 1];
    var p = profile();
    if (!p || p.credits() < next.cost) {
      return { ok: false, reason: 'need ' + (next.cost - (p ? p.credits() : 0)) + ' more credits' };
    }

    if (!p.spendCredits(next.cost)) return { ok: false, reason: 'could not save' };
    var applied = p.setResearch(id, now + 1);
    return { ok: true, cost: next.cost, rank: applied };
  }

  /** Buy the next PROD hardening level. */
  function harden() {
    var now = hardening();
    if (now >= MAX_HARDENING) return { ok: false, reason: 'fully hardened' };

    var next = HARDENING[now + 1];
    var p = profile();
    if (!p || p.credits() < next.cost) {
      return { ok: false, reason: 'need ' + (next.cost - (p ? p.credits() : 0)) + ' more credits' };
    }

    if (!p.spendCredits(next.cost)) return { ok: false, reason: 'could not save' };
    var applied = p.setHardening(now + 1);
    return { ok: true, cost: next.cost, rank: applied };
  }

  function hardening() {
    var p = profile();
    return p && p.hardening ? p.hardening() : 0;
  }

  /**
   * The multipliers a tower gets from its ranks.
   *
   * Returns plain numbers with 1 meaning "no change", so towers.js can apply
   * them unconditionally without branching on whether research exists. That is
   * what keeps this file optional: if it failed to load, every tower is simply
   * unresearched.
   */
  function statBonus(id) {
    var out = { costMul: 1, damageMul: 1, rangeMul: 1 };
    var r = rank(id);
    for (var i = 1; i <= r && i < RANKS.length; i++) {
      var step = RANKS[i];
      out.costMul *= step.costMul;
      out.damageMul *= step.damageMul;
      out.rangeMul *= step.rangeMul;
    }
    return out;
  }

  /** How much a leak costs, after hardening. */
  function leakMultiplier() {
    var h = hardening();
    return HARDENING[Math.max(0, Math.min(MAX_HARDENING, h))].leakMul;
  }

  /** What the next purchase would be, for the screen. null when fully bought. */
  function nextResearch(id) {
    var now = rank(id);
    if (now >= MAX_RANK) return null;
    return { cost: RANKS[now + 1].cost, label: RANKS[now + 1].label, rank: now + 1 };
  }

  function nextHardening() {
    var now = hardening();
    if (now >= MAX_HARDENING) return null;
    return { cost: HARDENING[now + 1].cost, label: HARDENING[now + 1].label, rank: now + 1 };
  }

  /** Credits sunk into the tree so far. Shown on the menu so progress is visible. */
  function invested() {
    var total = 0;
    FREE.concat(Object.keys(UNLOCKS)).forEach(function (id) {
      var r = rank(id);
      for (var i = 1; i <= r && i < RANKS.length; i++) total += RANKS[i].cost;
      if (UNLOCKS[id] && towerUnlocked(id)) total += UNLOCKS[id].cost;
    });
    var h = hardening();
    for (var j = 1; j <= h && j < HARDENING.length; j++) total += HARDENING[j].cost;
    return total;
  }

  global.Base = {
    MAX_RANK: MAX_RANK,
    MAX_HARDENING: MAX_HARDENING,
    RANKS: RANKS,
    HARDENING: HARDENING,
    UNLOCKS: UNLOCKS,
    FREE: FREE,

    rank: rank,
    towerUnlocked: towerUnlocked,
    unlockedTypes: unlockedTypes,
    lockedTypes: lockedTypes,
    unlockInfo: unlockInfo,
    unlock: unlock,
    research: research,
    harden: harden,
    hardening: hardening,
    statBonus: statBonus,
    leakMultiplier: leakMultiplier,
    nextResearch: nextResearch,
    nextHardening: nextHardening,
    invested: invested,
  };
})(window);
