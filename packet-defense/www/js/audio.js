/**
 * audio.js - procedural sound effects (no audio assets needed).
 * Everything is synthesised with the WebAudio API so the game stays tiny
 * and loads instantly, which matters a lot for hyper-casual retention.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  }

  /** Must be called from a user gesture on iOS/Android WebViews. */
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(opts) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    }
    var vol = opts.volume == null ? 0.5 : opts.volume;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  function noise(dur, volume) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    if (!noiseBuffer) {
      var len = Math.floor(c.sampleRate * 0.4);
      noiseBuffer = c.createBuffer(1, len, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    var gain = c.createGain();
    var t0 = c.currentTime;
    gain.gain.setValueAtTime(volume == null ? 0.3 : volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  var Sound = {
    unlock: unlock,
    /**
     * Shared accessors so other audio modules (music.js) reuse ONE AudioContext
     * and one master bus. Mobile browsers cap the number of contexts, and a
     * second one also means audio that plays when you muted the first.
     */
    getContext: function () {
      return ensure();
    },
    masterBus: function () {
      ensure();
      return master;
    },
    setEnabled: function (on) {
      enabled = !!on;
    },
    isEnabled: function () {
      return enabled;
    },
    /** Plain block landing. Pitch creeps up as the tower grows. */
    drop: function (height) {
      var t = Math.min(1, (height || 0) / 40);
      tone({ type: 'square', from: 180 + t * 120, to: 120 + t * 90, dur: 0.07, volume: 0.28 });
    },
    perfect: function (combo) {
      var step = Math.min(combo || 1, 8);
      var base = 520 + step * 55;
      tone({ type: 'triangle', from: base, to: base * 1.5, dur: 0.12, volume: 0.34 });
      tone({ type: 'sine', from: base * 2, to: base * 2.6, dur: 0.16, volume: 0.2, delay: 0.055 });
    },
    slice: function () {
      noise(0.12, 0.22);
    },
    gameOver: function () {
      tone({ type: 'sawtooth', from: 340, to: 90, dur: 0.5, volume: 0.3 });
      tone({ type: 'sine', from: 200, to: 70, dur: 0.6, volume: 0.22, delay: 0.08 });
    },
    revive: function () {
      tone({ type: 'triangle', from: 300, to: 900, dur: 0.28, volume: 0.3 });
    },
    /** Level cleared: a rising four-note fanfare. */
    victory: function () {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        tone({
          type: 'triangle',
          from: notes[i],
          to: notes[i] * 1.01,
          dur: 0.26,
          volume: 0.3,
          delay: i * 0.11,
        });
      }
      tone({ type: 'sine', from: 2093, to: 2093, dur: 0.5, volume: 0.12, delay: 0.44 });
    },
    coin: function () {
      tone({ type: 'square', from: 1180, to: 1760, dur: 0.09, volume: 0.22 });
      tone({ type: 'square', from: 1760, to: 2340, dur: 0.1, volume: 0.16, delay: 0.07 });
    },
    /** A crawler skittering onto the deck. */
    crawler: function () {
      noise(0.08, 0.14);
      tone({ type: 'square', from: 220, to: 150, dur: 0.09, volume: 0.12 });
      tone({ type: 'square', from: 190, to: 130, dur: 0.09, volume: 0.1, delay: 0.09 });
    },
    /** Turret arming: two rising pips. */
    turret: function () {
      tone({ type: 'square', from: 880, to: 880, dur: 0.06, volume: 0.16 });
      tone({ type: 'square', from: 1320, to: 1320, dur: 0.08, volume: 0.16, delay: 0.1 });
    },
    crush: function () {
      noise(0.14, 0.26);
      tone({ type: 'square', from: 140, to: 70, dur: 0.12, volume: 0.2 });
    },
    /** The drone taking a hit. */
    hurt: function () {
      tone({ type: 'sawtooth', from: 420, to: 180, dur: 0.22, volume: 0.26 });
      noise(0.16, 0.2);
    },
    explode: function () {
      noise(0.34, 0.4);
      tone({ type: 'sawtooth', from: 260, to: 50, dur: 0.36, volume: 0.26 });
    },
    bossHit: function () {
      tone({ type: 'sawtooth', from: 150, to: 60, dur: 0.2, volume: 0.24 });
      noise(0.12, 0.18);
    },
    ui: function () {
      tone({ type: 'sine', from: 660, to: 880, dur: 0.07, volume: 0.22 });
    },
  };

  global.Sfx = Sound;
})(window);
