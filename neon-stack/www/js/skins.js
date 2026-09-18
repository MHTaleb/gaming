/**
 * skins.js - tower themes bought with coins.
 *
 * Coins give perfect drops a second payoff and give the player something to
 * spend on that is not a power-up. Cosmetics are the honest version of
 * "addictive": they reward play without punishing anyone who ignores them.
 *
 * A theme drives the block hue ramp and the background tint.
 */
(function (global) {
  'use strict';

  var SKINS = [
    {
      id: 'neon',
      name: 'Neon',
      cost: 0,
      desc: 'The original. Full spectrum.',
      hueBase: 205,
      hueStep: 9,
      spread: 360,
      bg: 200,
    },
    {
      id: 'matrix',
      name: 'Terminal',
      cost: 150,
      desc: 'Green phosphor, narrow band.',
      hueBase: 120,
      hueStep: 4,
      spread: 46,
      bg: 140,
    },
    {
      id: 'sunset',
      name: 'Sunset',
      cost: 250,
      desc: 'Amber through magenta.',
      hueBase: 330,
      hueStep: 6,
      spread: 110,
      bg: 350,
    },
    {
      id: 'ice',
      name: 'Deep Ice',
      cost: 350,
      desc: 'Cold blue, almost glass.',
      hueBase: 190,
      hueStep: 3,
      spread: 60,
      bg: 215,
    },
    {
      id: 'ember',
      name: 'Ember',
      cost: 500,
      desc: 'Rust, fire and smoke.',
      hueBase: 18,
      hueStep: 7,
      spread: 70,
      bg: 5,
    },
    {
      id: 'vapor',
      name: 'Vaporwave',
      cost: 750,
      desc: 'Mall pastel, infinite dusk.',
      hueBase: 285,
      hueStep: 14,
      spread: 150,
      bg: 265,
    },
  ];

  function byId(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return SKINS[0];
  }

  global.Skins = {
    all: SKINS,
    byId: byId,
    default: SKINS[0],
  };
})(window);
