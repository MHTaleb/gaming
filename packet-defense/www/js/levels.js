/**
 * levels.js - the campaign's public face.
 *
 * This used to *be* the campaign: twelve tickets written out by hand, with their
 * waves, their budgets and their roads all in one array at the bottom of the
 * file. That array now lives in campaign.js, generated from the road library and
 * measured by tools/balance.js, and this file is the adapter that keeps the rest
 * of the game from having to know that.
 *
 * WHY AN ADAPTER AND NOT A RENAME
 *   `Levels.byId`, `Levels.tuning` and `Levels.paths` are called from the engine
 *   on every battle, from the map screen, from the result screen and from the
 *   harness. Keeping the same names means the generator landing did not touch any
 *   of them - and it means the campaign can be regenerated, re-tuned or replaced
 *   entirely without the engine noticing.
 *
 *   The one thing worth understanding here is `tuning`. It returns the stat
 *   envelope for a ticket - hit point and speed multipliers, added armour, spawn
 *   spacing, and the traits the level applies to everything on the road. It is
 *   read *per wave*, because that is when the spawner needs it, so it must be
 *   cheap: it is on the hot path of every spawn.
 */
(function (global) {
  'use strict';

  function campaign() { return global.Campaign; }

  function all() {
    var c = campaign();
    return c ? c.all() : [];
  }

  function byId(id) {
    var c = campaign();
    return c ? c.byId(id) : null;
  }

  function count() {
    var c = campaign();
    return c ? c.count() : 0;
  }

  /** Every road in the library, keyed by name, in the shape map.js wants. */
  function paths() {
    var c = campaign();
    return c ? c.paths() : {};
  }

  function base() {
    return (global.Roads && global.Roads.BASE) || [13, 4];
  }

  /**
   * The stat envelope for a ticket.
   *
   * Shape matters more than the values: the spawner reads `.gap`, `.traits` and
   * `.armour`, and threats.js multiplies by `.hp` and `.speed`. Returning a fresh
   * object every call is deliberate - callers mutate `traits`, and a shared
   * object would leak one level's traits into the next.
   */
  function tuning(level) {
    var c = campaign();
    if (!c || !level) return { hp: 1, speed: 1, armour: 0, gap: 1, traits: [] };
    var t = c.curve(level.id);
    var traits = (t.traits || []).slice();
    // `hardened` is the trait the player can see, but the armour number is what
    // actually applies, and it arrives through a different field. Deriving the
    // visible trait from the number rather than listing it by hand means the
    // briefing can never advertise armour that the level does not apply.
    if (t.armour > 0 && traits.indexOf('hardened') === -1) traits.unshift('hardened');
    return { hp: t.hp, speed: t.speed, armour: t.armour, gap: t.gap, traits: traits };
  }

  /** Total threats in a level, for the briefing screen and the balance tool. */
  function threatCount(level) {
    if (!level || !level.waves) return 0;
    return level.waves.reduce(function (a, w) {
      return a + w.reduce(function (b, grp) { return b + grp.n; }, 0);
    }, 0);
  }

  /**
   * The difficulty number the level list sorts and labels by.
   *
   * Sourced from the generator rather than recomputed here, because two
   * definitions of "how hard is this" is exactly how a level list ends up
   * ordering differently from the curve it claims to describe.
   */
  function difficulty(level) {
    if (!level) return 0;
    if (typeof level.power === 'number') return level.power;
    var c = campaign();
    return c ? c.power(level) : 0;
  }

  /* ------------------------------------------------------------------ *
   * Act navigation - what the map screen needs and nothing more
   * ------------------------------------------------------------------ */

  /** The twelve acts, each with its narration and the twenty tickets inside it. */
  function acts() {
    var c = campaign();
    if (!c) return [];
    var every = all();
    return c.acts().map(function (a) {
      var from = (a.n - 1) * c.PER_ACT + 1;
      return {
        n: a.n,
        env: a.env,
        name: a.name,
        premise: a.premise,
        closing: a.closing,
        first: from,
        last: from + c.PER_ACT - 1,
        levels: every.slice(from - 1, from - 1 + c.PER_ACT),
      };
    });
  }

  /** The act a ticket belongs to, with its narration. */
  function actOf(id) {
    var c = campaign();
    if (!c) return null;
    return acts()[c.act(id).n - 1] || null;
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
    acts: acts,
    actOf: actOf,
    /** Alias, because callers ask for "power" when they mean this number. */
    power: difficulty,
    PER_ACT: (global.Campaign && global.Campaign.PER_ACT) || 20,
  };
})(window);
