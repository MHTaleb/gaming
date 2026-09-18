/**
 * music.js - the score, and the machine that plays it.
 *
 * There are no audio files in this game and there will not be: the whole app is
 * a couple of hundred KB. So the soundtrack is *generated* - the playlist in
 * tracks.js is a set of recipes, and this file is the instrument that reads them.
 *
 * Three things make that better than a folder of MP3s here:
 *
 *  1. It reacts. Note choice follows the deck, the mood shifts when something
 *     walks onto it, and every good drop you land answers with a note in the
 *     current key. A recording cannot do that.
 *  2. It never repeats. Nothing is a loop, so nothing gets stuck in your head
 *     after the twentieth run.
 *  3. It is free and unambiguous to licence: it was written here.
 *
 * Structure mirrors tracks.js:
 *   transport (ambient clock or beat grid) -> arrangement -> voices -> mix
 */
(function (global) {
  'use strict';

  var SCALES = (global.Tracks && global.Tracks.scales) || { minorPent: [0, 3, 5, 7, 10] };
  var FALLBACK_TRACK = {
    id: 'signal-drift', name: 'Signal Drift', character: 'calm', root: 110,
    scale: 'minorPent', chords: [[0, -4, 3, -2]], bpm: 0, density: 0.35,
    layers: ['pad', 'bass', 'bell'], gimmick: 'none',
  };

  /* --------------------------- state --------------------------- */

  var ctx = null;
  var master = null;
  var analyser = null;
  var reverb = null;
  var filterBus = null;         // shared low-pass, moved by intensity

  var running = false;
  var enabled = true;
  var paused = false;
  var volume = 0.7;
  var mood = 'calm';
  var intensity = 0;            // 0..1, follows your progress up the deck

  /** Bed level at volume 1.0. Tuned by measurement (Music.peak/peakSample). */
  var BED_GAIN = 2.55;

  var track = FALLBACK_TRACK;
  var trackStartedAt = 0;
  var queue = [];
  var autoAdvance = true;
  var listeners = [];

  var nextBell = 0, nextPad = 0, nextBass = 0, nextPulse = 0;
  var chordUntil = 0, chord = [0, 7, 12], progression = [[0, 7, 12]], progStep = 0;
  var step = 0, nextStepAt = 0;
  var silenceUntil = 0;
  var live = [];
  var schedTimer = null;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function scaleOf(t) { return SCALES[t.scale] || SCALES.minorPent; }
  function semisToFreq(root, semis, octave) {
    return root * Math.pow(2, semis / 12) * Math.pow(2, octave || 0);
  }
  /** Transpose as the climb progresses: subtle, up to three semitones. */
  function lift() { return Math.round(intensity * 3); }

  /* --------------------------- graph --------------------------- */

  function makeImpulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var n = 1 - i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(n, decay);
      }
    }
    return buf;
  }

  function build() {
    var Ctor = global.AudioContext || global.webkitAudioContext;
    // Reuse the sound engine's context: one context per app.
    ctx = (global.Sfx && global.Sfx.getContext && global.Sfx.getContext()) || new Ctor();

    master = ctx.createGain();
    master.gain.value = 0;

    filterBus = ctx.createBiquadFilter();
    filterBus.type = 'lowpass';
    filterBus.frequency.value = 2800;
    filterBus.Q.value = 0.4;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    var comp = ctx.createDynamicsCompressor();
    // Sits above the bed so it only catches stacked bells, not the whole mix.
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(3.6, 2.6);

    var wet = ctx.createGain();
    wet.gain.value = 0.42;
    var dry = ctx.createGain();
    dry.gain.value = 0.6;

    // Routing order matters: every voice connects to filterBus, so the master
    // gain has to sit AFTER it, in series, or it would be a sibling input with
    // nothing flowing through it and the volume/mute/pause controls would do
    // nothing at all.
    //   voices -> filterBus -> master(gain) -> dry/wet -> reverb+comp -> out
    filterBus.connect(master);
    master.connect(dry);
    master.connect(wet);
    wet.connect(reverb);
    reverb.connect(comp);
    dry.connect(comp);
    comp.connect(analyser);

    var bus = (global.Sfx && global.Sfx.masterBus && global.Sfx.masterBus()) || ctx.destination;
    analyser.connect(bus);
  }

  function ensure() {
    if (!ctx) build();
    return !!ctx;
  }

  function keep(node, stopAt) {
    live.push({ node: node, stopAt: stopAt });
    if (live.length > 96) live.shift();
  }

  function panInto(node, amount) {
    if (!ctx.createStereoPanner) {
      node.connect(filterBus);
      return;
    }
    var p = ctx.createStereoPanner();
    p.pan.value = amount;
    node.connect(p);
    p.connect(filterBus);
  }

  /* --------------------------- voices --------------------------- */

  /** Slow swell. Two detuned oscillators per note: chorus, not test tone. */
  function voicePad(semis, when, dur, gain, t) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + Math.min(6, dur * 0.35));
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    g.connect(filterBus);

    for (var d = 0; d < 2; d++) {
      var osc = ctx.createOscillator();
      osc.type = d === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(semisToFreq(t.root, semis, 0), when);
      osc.detune.setValueAtTime(d === 0 ? -4 : 5, when);
      var vg = ctx.createGain();
      vg.gain.value = 0.5;
      osc.connect(vg);
      vg.connect(g);
      osc.start(when);
      osc.stop(when + dur + 0.1);
      keep(osc, when + dur + 0.1);
    }
  }

  /** Plucked note: short, bright, optionally bending down (a boing). */
  function voiceBlip(semis, when, gain, t, opts) {
    opts = opts || {};
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.reed ? 'square' : 'triangle';
    var f0 = semisToFreq(t.root, semis, opts.octave === undefined ? 2 : opts.octave);
    var bend = opts.bend || 0;
    osc.frequency.setValueAtTime(f0, when);
    if (bend) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, f0 * Math.pow(2, bend / 12)),
        when + (opts.bendTime || 0.22)
      );
    }

    var dur = opts.dur || 0.32;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    panInto(g, rnd(-0.45, 0.45));
    osc.start(when);
    osc.stop(when + dur + 0.05);
    keep(osc, when + dur + 0.05);
  }

  /** Bell: the "nice" voice. Long tail plus an octave-up shimmer. */
  function voiceBell(semis, when, gain, t) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    var harm = ctx.createOscillator();
    var hg = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(semisToFreq(t.root, semis, 2), when);
    harm.type = 'sine';
    harm.frequency.setValueAtTime(semisToFreq(t.root, semis, 3), when);

    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
    hg.gain.setValueAtTime(0.0001, when);
    hg.gain.exponentialRampToValueAtTime(gain * 0.25, when + 0.4);
    hg.gain.exponentialRampToValueAtTime(0.0001, when + 3.4);

    osc.connect(g);
    harm.connect(hg);
    panInto(g, rnd(-0.6, 0.6));
    hg.connect(filterBus);

    osc.start(when);
    harm.start(when);
    osc.stop(when + 3.4);
    harm.stop(when + 3.4);
    keep(osc, when + 3.4);
    keep(harm, when + 3.4);
  }

  /** Sustained reed: the kazoo / trombone voice. */
  function voiceReed(semis, when, dur, gain, t, bend) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.2;
    f.frequency.value = 700;

    osc.type = 'sawtooth';
    var f0 = semisToFreq(t.root, semis, 0);
    osc.frequency.setValueAtTime(f0, when);
    if (bend) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, f0 * Math.pow(2, bend / 12)), when + dur * 0.8);
    }

    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.12);
    g.gain.setValueAtTime(gain, when + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    // A slow wobble on the filter is what makes it read as a joke instrument.
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.frequency.value = rnd(4.5, 6.5);
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);

    osc.connect(f);
    f.connect(g);
    g.connect(filterBus);
    osc.start(when);
    lfo.start(when);
    osc.stop(when + dur + 0.05);
    lfo.stop(when + dur + 0.05);
    keep(osc, when + dur + 0.05);
    keep(lfo, when + dur + 0.05);
  }

  /* One noise buffer serves the percussion and the rain ticks. */
  var noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      var len = Math.floor(ctx.sampleRate * 1.0);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function voicePerc(when, kind, gain) {
    if (kind === 'kick') {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, when);
      osc.frequency.exponentialRampToValueAtTime(46, when + 0.14);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      osc.connect(g);
      g.connect(filterBus);
      osc.start(when);
      osc.stop(when + 0.3);
      keep(osc, when + 0.3);
      return;
    }
    var src = ctx.createBufferSource();
    src.buffer = noise();
    var f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 6500 : 1800;
    var g2 = ctx.createGain();
    var dur = kind === 'hat' ? 0.05 : 0.09;
    g2.gain.setValueAtTime(gain, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f);
    f.connect(g2);
    panInto(g2, kind === 'hat' ? rnd(-0.5, 0.5) : 0);
    src.start(when);
    src.stop(when + dur + 0.02);
    keep(src, when + dur + 0.02);
  }

  /** A single high tick: rain on the hull. */
  function voiceTick(when, gain) {
    var src = ctx.createBufferSource();
    src.buffer = noise();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = rnd(3000, 9000);
    f.Q.value = 6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    src.connect(f);
    f.connect(g);
    panInto(g, rnd(-0.8, 0.8));
    src.start(when);
    src.stop(when + 0.14);
    keep(src, when + 0.14);
  }

  function voiceSub(when, semis, dur, gain, t) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(semisToFreq(t.root, semis, -1), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(filterBus);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    keep(osc, when + dur + 0.05);
  }

  /* --------------------------- arrangement --------------------------- */

  function has(layer) { return !!(track.layers && track.layers.indexOf(layer) >= 0); }
  function is(g) { return track.gimmick === g; }

  function nextChord(when) {
    var progs = (track.chords && track.chords.length) ? track.chords : FALLBACK_TRACK.chords;
    if (progStep === 0 || when >= chordUntil) {
      progression = pick(progs);
      progStep = 0;
      chordUntil = when + rnd(15, 24);
    }
    var root = progression[progStep % progression.length];
    progStep++;
    chord = [root, root + 7, root + (Math.random() < 0.5 ? 12 : 14)];
    return root;
  }

  function melodyNote() {
    var sc = scaleOf(track);
    var n = sc[Math.floor(Math.random() * sc.length)];
    if (Math.random() < 0.22) n += 12;
    return n + lift();
  }

  /** One sixteenth of a track that has a tempo. */
  function onStep() {
    var now = nextStepAt;
    var inBar = step % 16;
    var dense = track.density || 0.4;
    var glitch = is('glitch');

    // Comic pauses: the joke lands because the music stops first.
    if (is('rests') || glitch) {
      if (now >= silenceUntil && Math.random() < (glitch ? 0.02 : 0.006)) {
        silenceUntil = now + rnd(1.2, 3.4);
      }
      if (now < silenceUntil) return;
    }

    if (has('perc')) {
      var march = is('march');
      if (inBar === 0 || inBar === 8) voicePerc(now, 'kick', march ? 0.32 : 0.22);
      if (march && (inBar === 4 || inBar === 12)) voicePerc(now, 'snare', 0.13);
      if (inBar % 4 === 2) voicePerc(now, 'hat', 0.07 + dense * 0.05);
      if (is('rattle') && Math.random() < 0.25) voicePerc(now, 'snare', 0.09);
    }

    if (has('pulse') && inBar % 4 === 0) voiceSub(now, chord[0] - 12, 1.4, 0.1, track);

    if (has('bass')) {
      if (is('march')) {
        if (inBar === 0) voiceSub(now, chord[0] - 12, 0.7, 0.16, track);
        else if (inBar === 8) voiceSub(now, chord[0] - 5, 0.7, 0.13, track);
      } else if (inBar === 0 || (inBar === 8 && Math.random() < 0.6)) {
        voiceSub(now, chord[0] - 12, 1.1, 0.15, track);
      }
    }

    if (has('pad') && inBar === 0) {
      voicePad(chord[0] + lift(), now, rnd(4, 7), 0.16, track);
      voicePad(chord[1] + lift(), now, rnd(4, 7), 0.13, track);
    }

    if (has('bell') && inBar % 4 === 0 && Math.random() < 0.4 + dense * 0.3) {
      voiceBell(melodyNote(), now, 0.16, track);
    }

    if (has('blip')) {
      var every = is('arcade') ? 2 : 4;
      if (inBar % every === 0 && Math.random() < 0.3 + dense * 0.55) {
        var bend = 0;
        if (is('boing')) bend = -rnd(5, 12);
        else if (glitch) bend = pick([0, 0, -1, 1, -7]);
        voiceBlip(melodyNote(), now, 0.13, track, { bend: bend, reed: is('boing') });
      }
    }

    if (has('wobble') && inBar === 0) {
      voiceReed(chord[0] + lift(), now, rnd(2.2, 3.4), 0.12, track, is('sag') ? -rnd(4, 7) : 0);
    }

    if (is('rain') && Math.random() < 0.3) voiceTick(now, 0.03);

    // A swung off-beat, for the tracks that ask for it.
    if (track.swing && inBar % 4 === 2) {
      voicePerc(now + (60 / track.bpm / 4) * track.swing, 'hat', 0.05);
    }
  }

  /** Free-floating scheduling for the ambient tracks. */
  function scheduleAmbient(now, horizon) {
    var dense = track.density || 0.4;
    var up = lift();

    if (nextPad < now) nextPad = now + 0.3;
    while (nextPad < horizon) {
      nextChord(nextPad);
      if (has('pad')) {
        voicePad(chord[0] + up, nextPad, rnd(16, 24), 0.18, track);
        voicePad(chord[1] + up, nextPad, rnd(16, 24), 0.13, track);
      }
      // Pads are scheduled closer together than they last, so they always
      // overlap. A sparse track should be sparse in *melody*, not have holes in
      // the bed - silence reads as a bug, not as a mood.
      nextPad += rnd(11, 16);
    }

    if (nextBass < now) nextBass = now + rnd(1, 4);
    while (nextBass < horizon) {
      if (has('bass')) voiceSub(nextBass, chord[0] - 12, rnd(6, 10), 0.14, track);
      nextBass += rnd(9, 16);
    }

    if (nextBell < now) nextBell = now + rnd(0.5, 2);
    while (nextBell < horizon) {
      var gap = 5.5 - dense * 4;                 // sparse -> 5.5s, busy -> 1.5s
      if (is('rests')) gap *= 2.4;
      if (is('rests') && now >= silenceUntil && Math.random() < 0.05) {
        silenceUntil = now + rnd(2, 5);
      }
      if (has('bell') && nextBell >= silenceUntil) voiceBell(melodyNote(), nextBell, 0.2, track);
      if (has('blip') && nextBell >= silenceUntil && Math.random() < 0.4) {
        voiceBlip(melodyNote(), nextBell + 0.12, 0.1, track, {});
      }
      nextBell += rnd(gap * 0.7, gap * 1.5);
    }

    if (is('rain') && Math.random() < 0.5) voiceTick(now + rnd(0, 1), 0.025);
  }

  function scheduleBeats(now, horizon) {
    if (nextStepAt < now) nextStepAt = now + 0.05;
    var sixteenth = 60 / track.bpm / 4;
    while (nextStepAt < horizon) {
      onStep();
      nextStepAt += sixteenth;
      step++;
    }
  }

  function schedule() {
    if (!running || !ctx || ctx.state === 'suspended') return;
    var now = ctx.currentTime;
    var horizon = now + 1.2;

    if (track.bpm > 0) scheduleBeats(now, horizon);
    else scheduleAmbient(now, horizon);

    if (mood === 'tense' || mood === 'boss') {
      var every = mood === 'boss' ? 1.6 : 2.4;
      var pulseGain = mood === 'boss' ? 0.1 : 0.07;
      if (nextPulse < now) nextPulse = now;
      while (nextPulse < horizon) {
        voiceSub(nextPulse, chord[0] - 24, 1.2, pulseGain, track);
        nextPulse += every;
      }
    }
  }

  /* --------------------------- mixer --------------------------- */

  function target() { return volume * BED_GAIN; }

  function ramp(to, seconds) {
    if (!master) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(to, t + Math.max(0.05, seconds));
  }

  function clearVoices(fade) {
    var at = ctx ? ctx.currentTime + (fade || 1.2) : 0;
    for (var i = 0; i < live.length; i++) {
      try { live[i].node.stop(at); } catch (e) { /* already stopped */ }
    }
    live.length = 0;
  }

  function resetArrangement(now) {
    chordUntil = 0;
    progStep = 0;
    step = 0;
    silenceUntil = 0;
    nextPad = now + 0.2;
    nextBass = now + 2;
    nextBell = now + 1.2;
    nextPulse = now + 2;
    nextStepAt = now + 0.1;
  }

  /* --------------------------- public API --------------------------- */

  var Music = {
    init: function () {
      if (!ensure()) return false;
      return true;
    },

    /* ---- transport ---- */

    start: function () {
      if (!ensure()) return false;
      if (running) {
        if (paused) this.resume();
        return true;
      }
      running = true;
      paused = false;
      trackStartedAt = ctx.currentTime;
      resetArrangement(ctx.currentTime);
      nextChord(ctx.currentTime + 0.05);
      if (has('pad')) voicePad(chord[0], ctx.currentTime + 0.05, 20, 0.18, track);
      ramp(enabled ? target() : 0, 3.5);
      schedTimer = global.setInterval(schedule, 220);
      return true;
    },

    stop: function (fadeSeconds) {
      if (!ensure() || !running) return;
      var fade = fadeSeconds === undefined ? 1.6 : fadeSeconds;
      running = false;
      paused = false;
      ramp(0, fade);
      if (schedTimer) {
        global.clearInterval(schedTimer);
        schedTimer = null;
      }
      clearVoices(fade + 0.2);
    },

    pause: function () {
      if (!running || paused) return;
      paused = true;
      ramp(0, 0.8);
    },

    resume: function () {
      if (!running) return;
      paused = false;
      if (global.Sfx) global.Sfx.unlock();
      ramp(enabled ? target() : 0, 1.2);
    },

    isRunning: function () { return running; },
    isPaused: function () { return paused; },

    /* ---- playlist ---- */

    current: function () {
      return { id: track.id, name: track.name, character: track.character, vibe: track.vibe };
    },

    tracks: function () {
      return (global.Tracks && global.Tracks.all) || [FALLBACK_TRACK];
    },

    playTrack: function (id, opts) {
      opts = opts || {};
      var nextTrack = global.Tracks && global.Tracks.byId(id);
      if (!nextTrack) return false;
      var changed = nextTrack.id !== track.id;
      track = nextTrack;

      if (running && ctx && changed && opts.crossfade !== false) {
        // Fade the old arrangement out, swap, fade back in - so switching tracks
        // never clicks and never restarts mid-phrase at full volume.
        ramp(0, 0.7);
        clearVoices(0.75);
        var now = ctx.currentTime + 0.9;
        resetArrangement(now);
        global.setTimeout(function () {
          if (running && !paused && enabled) ramp(target(), 1.6);
        }, 900);
      } else {
        resetArrangement(ctx ? ctx.currentTime : 0);
      }

      var snapshot = this.current();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](snapshot); } catch (e) { /* ignore */ }
      }
      return true;
    },

    /** Next unplayed track; reshuffles when the queue empties. */
    next: function () {
      var all = this.tracks();
      if (!queue.length) {
        queue = all.map(function (t) { return t.id; });
        for (var i = queue.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
        }
        // Never repeat whatever is playing right now.
        if (queue.length > 1 && queue[0] === track.id) queue.push(queue.shift());
      }
      this.playTrack(queue.shift());
      return this.current();
    },

    setAutoAdvance: function (on) { autoAdvance = !!on; return autoAdvance; },
    isAutoAdvance: function () { return autoAdvance; },

    /** Called as a deck ends: keeps the score moving rather than looping one piece. */
    rotateIfDue: function (seconds) {
      if (!autoAdvance || !running || !ctx) return false;
      var limit = seconds === undefined ? 210 : seconds;
      if (ctx.currentTime - trackStartedAt < limit) return false;
      this.next();
      trackStartedAt = ctx.currentTime;
      return true;
    },

    onTrackChange: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /* ---- reaction ---- */

    /**
     * The game talking to the music. Everything here lands on the current
     * track's chord, so a flourish can never clash with what is playing.
     */
    react: function (kind) {
      if (!running || !ctx || ctx.state === 'suspended' || paused) return;
      var t = ctx.currentTime + 0.02;
      var note = chord[0] + lift();
      switch (kind) {
        case 'perfect':
          voiceBell(note + 16, t, 0.16, track);          // answers a third above
          break;
        case 'crush':
          voicePerc(t, 'snare', 0.16);
          voiceSub(t, chord[0] - 12, 0.4, 0.14, track);
          break;
        case 'hurt':
          voiceReed(note, t, 0.7, 0.14, track, -9);      // a sag, on purpose
          this.duck(0.9);
          break;
        case 'bossHit':
          voicePerc(t, 'kick', 0.3);
          voiceSub(t, chord[0] - 24, 1.2, 0.2, track);
          break;
        case 'clear':
          var sc = scaleOf(track);
          for (var i = 0; i < 5; i++) {
            voiceBlip(sc[i % sc.length] + 12, t + i * 0.09, 0.13, track, {});
          }
          break;
        case 'coin':
          voiceBlip(note + 12, t, 0.11, track, {});
          voiceBlip(note + 16, t + 0.08, 0.09, track, {});
          break;
      }
    },

    /* ---- mix ---- */

    setEnabled: function (on) {
      enabled = !!on;
      if (running) ramp(enabled && !paused ? target() : 0, enabled ? 1.2 : 0.4);
      return enabled;
    },
    isEnabled: function () { return enabled; },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (running && enabled && !paused) ramp(target(), 0.4);
      return volume;
    },
    getVolume: function () { return volume; },
    _target: target,
    /** The live master gain. Diagnostics only; the mix is what matters. */
    gain: function () { return master ? master.gain.value : -1; },

    setMood: function (m) {
      if (m !== 'calm' && m !== 'tense' && m !== 'boss' && m !== 'quiet') return mood;
      mood = m;
      return mood;
    },
    mood: function () { return mood; },

    /**
     * 0..1, how far up the deck you are. Transposes new notes and opens the
     * filter, so a long deck audibly climbs instead of standing still.
     */
    setIntensity: function (v) {
      intensity = Math.max(0, Math.min(1, v));
      if (filterBus && ctx) {
        var f = 2600 + intensity * 3200 + (mood === 'boss' ? 900 : 0);
        try { filterBus.frequency.setTargetAtTime(f, ctx.currentTime, 0.8); } catch (e) { /* ignore */ }
      }
      return intensity;
    },
    getIntensity: function () { return intensity; },

    duck: function (seconds) {
      if (!running || !enabled || paused) return;
      ramp(target() * 0.25, 0.15);
      global.setTimeout(function () {
        if (running && !paused && enabled) ramp(target(), 0.9);
      }, (seconds || 0.6) * 1000);
    },

    /* ---- measurement (also used by the tests) ---- */

    level: function () {
      if (!analyser) return 0;
      if (analyser.getFloatTimeDomainData) {
        var fbuf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(fbuf);
        var fsum = 0;
        for (var j = 0; j < fbuf.length; j++) fsum += fbuf[j] * fbuf[j];
        return Math.sqrt(fsum / fbuf.length);
      }
      var buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) {
        var v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length);
    },

    peak: function (seconds) {
      var self = this;
      var max = 0;
      var end = Date.now() + (seconds || 1) * 1000;
      return new Promise(function (resolve) {
        (function sample() {
          max = Math.max(max, self.level());
          if (Date.now() >= end) resolve(max);
          else global.requestAnimationFrame(sample);
        })();
      });
    },

    peakSample: function (seconds) {
      if (!analyser || !analyser.getFloatTimeDomainData) return Promise.resolve(0);
      var end = Date.now() + (seconds || 1) * 1000;
      var buf = new Float32Array(analyser.fftSize);
      return new Promise(function (resolve) {
        var max = 0;
        (function sample() {
          analyser.getFloatTimeDomainData(buf);
          for (var i = 0; i < buf.length; i++) {
            var v = buf[i] < 0 ? -buf[i] : buf[i];
            if (v > max) max = v;
          }
          if (Date.now() >= end) resolve(max);
          else global.requestAnimationFrame(sample);
        })();
      });
    },

    /**
     * Energy in three musically meaningful bands plus a spectral centroid.
     *
     * The bands are in Hz rather than raw bin thirds: with 512 bins over 24kHz,
     * "low" would otherwise mean 0-8kHz, which is the whole piece, and the other
     * two would read zero forever.
     */
    spectrum: function (seconds) {
      if (!analyser) return Promise.resolve({ low: 0, mid: 0, high: 0, centroid: 0 });
      var bins = new Uint8Array(analyser.frequencyBinCount);
      var end = Date.now() + (seconds || 1) * 1000;
      var binHz = (ctx.sampleRate || 44100) / analyser.fftSize;
      var b1 = Math.max(1, Math.round(500 / binHz));      // low:  < 500 Hz
      var b2 = Math.max(b1 + 1, Math.round(2000 / binHz)); // mid:  0.5 - 2 kHz
      var b3 = Math.max(b2 + 1, Math.round(8000 / binHz)); // high: 2 - 8 kHz
      var acc = { low: 0, mid: 0, high: 0, centroid: 0, n: 0 };

      return new Promise(function (resolve) {
        (function sample() {
          analyser.getByteFrequencyData(bins);
          var low = 0, mid = 0, high = 0, weighted = 0, total = 0;
          for (var i = 0; i < bins.length; i++) {
            var v = bins[i] / 255;
            total += v;
            weighted += v * i;
            if (i < b1) low += v;
            else if (i < b2) mid += v;
            else if (i < b3) high += v;
          }
          acc.low += low / b1;
          acc.mid += mid / (b2 - b1);
          acc.high += high / (b3 - b2);
          acc.centroid += total > 0 ? (weighted / total) / bins.length : 0;
          acc.n += 1;
          if (Date.now() >= end) {
            resolve({
              low: acc.low / acc.n,
              mid: acc.mid / acc.n,
              high: acc.high / acc.n,
              centroid: acc.centroid / acc.n,
            });
          } else {
            global.requestAnimationFrame(sample);
          }
        })();
      });
    },
  };

  global.Music = Music;
})(window);
