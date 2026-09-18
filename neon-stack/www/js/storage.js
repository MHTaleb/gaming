/**
 * storage.js - tiny safe localStorage wrapper + game settings.
 *
 * Settings only. Player progress lives in progress.js and is checksummed; this
 * file deliberately holds nothing worth cheating for.
 */
(function (global) {
  'use strict';

  var KEY = 'neonstack.v1';

  function safeParse(raw, fallback) {
    try {
      var v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  var defaults = {
    best: 0,
    sound: true,
    music: true,
    musicVolume: 0.7,
    musicAuto: true,
    musicTrack: '',
    haptics: true,
    /** Accessibility. reduceMotion is seeded from the OS on first boot. */
    reduceMotion: false,
    highContrast: false,
    showGhost: true,
    removedAds: false,
    lastRunAt: 0,
  };

  var cache = null;

  function load() {
    if (cache) return cache;
    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (e) {
      raw = null;
    }
    cache = Object.assign({}, defaults, safeParse(raw, {}));
    return cache;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (e) {
      /* private mode / quota - ignore */
    }
  }

  global.Store = {
    get: function (name) {
      return load()[name];
    },
    set: function (name, value) {
      load()[name] = value;
      save();
      return value;
    },
    all: function () {
      return Object.assign({}, load());
    },
    defaults: defaults,
  };
})(window);
