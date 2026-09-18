/**
 * tracks.js - the playlist.
 *
 * Twenty pieces, every one of them written as data rather than shipped as audio.
 * That is not a stunt: it means the entire soundtrack costs zero bytes, has no
 * licensing question attached to it, and can change key, tempo or mood while it
 * plays because it is not a recording.
 *
 * A track is a recipe:
 *   root       - base frequency (lower = heavier)
 *   scale      - which notes are allowed. Pick a pentatonic and it cannot sound
 *                wrong; pick chromatic and it is supposed to sound wrong.
 *   chords     - progressions, as semitone offsets from the root
 *   bpm        - 0 for free-floating ambience, otherwise a real grid
 *   density    - 0..1, how busy the melody layer is
 *   layers     - which instruments are in the arrangement
 *   gimmick    - one behaviour that gives the track a personality
 *
 * The engine (music.js) reads all of it. Nothing here executes.
 */
(function (global) {
  'use strict';

  /** Interval sets. Pentatonics are the safe ones; the others are on purpose. */
  var SCALES = {
    minorPent: [0, 3, 5, 7, 10],
    majorPent: [0, 2, 4, 7, 9],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    wholeTone: [0, 2, 4, 6, 8, 10],
    japanese: [0, 1, 5, 7, 8],
    blues: [0, 3, 5, 6, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    airy: [0, 5, 7, 12],           // open fifths only: no third, no mood
  };

  /**
   * character is shown in the playlist UI, so the player knows what they picked:
   *   calm     - background, nothing urgent
   *   playful  - bouncy, slightly ridiculous
   *   driving  - a pulse to climb to
   *   odd      - deliberately strange
   *   silly    - comedy
   *   tense    - for decks with company on them
   */
  var TRACKS = [
    /* ---------------------------- CALM ---------------------------- */
    {
      id: 'signal-drift',
      name: 'Signal Drift',
      vibe: 'Wide pads, sparse bells. Nothing is urgent.',
      character: 'calm',
      root: 110, scale: 'minorPent',
      chords: [[0, -4, 3, -2], [0, -7, -4, -2], [0, 3, -2, -4]],
      bpm: 0, density: 0.35,
      layers: ['pad', 'bass', 'bell'],
      gimmick: 'none',
    },
    {
      id: 'elevator-hum',
      name: 'Elevator Hum',
      vibe: 'One deep drone. The cable, and you.',
      character: 'calm',
      root: 82, scale: 'airy',
      chords: [[0, 7, 12], [0, 5, 12], [-2, 5, 12]],
      bpm: 0, density: 0.15,
      layers: ['pad', 'bass'],
      gimmick: 'none',
    },
    {
      id: 'hydroponics',
      name: 'Hydroponics',
      vibe: 'Bright, watery, still growing after eleven years.',
      character: 'calm',
      root: 147, scale: 'majorPent',
      chords: [[0, 4, 7, 11], [0, 5, 9, 12], [-3, 4, 9, 14]],
      bpm: 0, density: 0.5,
      layers: ['pad', 'bell', 'blip'],
      gimmick: 'rain',
    },
    {
      id: 'long-night',
      name: 'Long Night',
      vibe: 'Very slow. Most of it is silence.',
      character: 'calm',
      root: 73, scale: 'aeolian',
      chords: [[0, 3, 7], [0, -4, 3], [-2, 3, 7]],
      bpm: 0, density: 0.12,
      layers: ['pad', 'bass'],
      gimmick: 'rests',
    },
    {
      id: 'quiet-deck',
      name: 'Quiet Deck',
      vibe: 'Almost nothing. Listen for the relays.',
      character: 'calm',
      root: 98, scale: 'airy',
      chords: [[0, 7], [0, 5], [-2, 7]],
      bpm: 0, density: 0.1,
      layers: ['pad'],
      gimmick: 'rests',
    },
    {
      id: 'starfield',
      name: 'Starfield',
      vibe: 'High shimmer over a low bed.',
      character: 'calm',
      root: 131, scale: 'lydian',
      chords: [[0, 4, 7, 11], [2, 6, 9, 13], [0, 5, 9, 12]],
      bpm: 0, density: 0.45,
      layers: ['pad', 'bell'],
      gimmick: 'rain',
    },
    {
      id: 'slow-ascent',
      name: 'Slow Ascent',
      vibe: 'It lifts a little with every deck.',
      character: 'calm',
      root: 110, scale: 'majorPent',
      chords: [[0, 4, 7], [0, 5, 9], [0, 2, 7]],
      bpm: 0, density: 0.4,
      layers: ['pad', 'bass', 'blip'],
      gimmick: 'lift',
    },

    /* --------------------------- PLAYFUL --------------------------- */
    {
      id: 'maintenance-shuffle',
      name: 'Maintenance Shuffle',
      vibe: 'Swung, bouncy, mildly smug.',
      character: 'playful',
      root: 123, scale: 'blues',
      chords: [[0, 3, 7], [0, 5, 7], [-2, 3, 7]],
      bpm: 92, density: 0.6, swing: 0.35,
      layers: ['pad', 'bass', 'blip', 'perc'],
      gimmick: 'swing',
    },
    {
      id: 'loose-bolt',
      name: 'Loose Bolt',
      vibe: 'Something in here is rattling.',
      character: 'playful',
      root: 116, scale: 'minorPent',
      chords: [[0, 3, 7, 10], [0, 5, 7], [-4, 3, 7]],
      bpm: 104, density: 0.7,
      layers: ['bass', 'blip', 'perc'],
      gimmick: 'rattle',
    },
    {
      id: 'cartwheel',
      name: 'Cartwheel',
      vibe: 'Fast little runs, pleased with itself.',
      character: 'playful',
      root: 138, scale: 'majorPent',
      chords: [[0, 4, 7], [0, 5, 9], [0, 2, 4]],
      bpm: 112, density: 0.85,
      layers: ['bass', 'blip', 'perc'],
      gimmick: 'arcade',
    },
    {
      id: 'sneaky-servo',
      name: 'Sneaky Servo',
      vibe: 'Tip-toeing. It knows it is not allowed up here.',
      character: 'playful',
      root: 103, scale: 'japanese',
      chords: [[0, 5, 8], [0, 1, 5], [-2, 5, 8]],
      bpm: 88, density: 0.5,
      layers: ['bass', 'blip'],
      gimmick: 'rests',
    },
    {
      id: 'bubble-lift',
      name: 'Bubble Lift',
      vibe: 'Pop, pop, pop. Going up.',
      character: 'playful',
      root: 156, scale: 'majorPent',
      chords: [[0, 4, 9], [0, 7, 12], [-3, 4, 9]],
      bpm: 96, density: 0.75,
      layers: ['bell', 'blip', 'bass'],
      gimmick: 'boing',
    },

    /* --------------------------- DRIVING --------------------------- */
    {
      id: 'ascent-protocol',
      name: 'Ascent Protocol',
      vibe: 'A pulse to climb to.',
      character: 'driving',
      root: 98, scale: 'aeolian',
      chords: [[0, 3, 7], [-2, 3, 7], [-4, 0, 3]],
      bpm: 100, density: 0.5,
      layers: ['pad', 'bass', 'pulse', 'perc'],
      gimmick: 'march',
    },
    {
      id: 'relay-sprint',
      name: 'Relay Sprint',
      vibe: 'Fast, and it wants you to hurry.',
      character: 'driving',
      root: 123, scale: 'minorPent',
      chords: [[0, 3, 7, 10], [0, 7, 10], [-2, 3, 10]],
      bpm: 124, density: 0.9,
      layers: ['bass', 'blip', 'pulse', 'perc'],
      gimmick: 'arcade',
    },
    {
      id: 'iron-staircase',
      name: 'Iron Staircase',
      vibe: 'Heavy, industrial, honest work.',
      character: 'driving',
      root: 82, scale: 'aeolian',
      chords: [[0, 3, 7], [0, 5, 8], [-5, 0, 3]],
      bpm: 84, density: 0.45,
      layers: ['pad', 'bass', 'pulse', 'perc'],
      gimmick: 'march',
    },
    {
      id: 'static-climb',
      name: 'Static Climb',
      vibe: 'Interference you can climb to.',
      character: 'driving',
      root: 110, scale: 'wholeTone',
      chords: [[0, 4, 8], [0, 6, 10], [-2, 4, 8]],
      bpm: 108, density: 0.6,
      layers: ['pad', 'pulse', 'blip'],
      gimmick: 'glitch',
    },

    /* ----------------------------- ODD ----------------------------- */
    {
      id: 'error-404',
      name: 'Error 404',
      vibe: 'Stutters, gives up, starts again.',
      character: 'odd',
      root: 104, scale: 'chromatic',
      chords: [[0, 1, 6], [0, 6, 7], [0, 1, 2]],
      bpm: 116, density: 0.65,
      layers: ['bass', 'blip', 'perc'],
      gimmick: 'glitch',
    },
    {
      id: 'wrong-deck',
      name: 'Wrong Deck',
      vibe: 'This is not the floor you asked for.',
      character: 'odd',
      root: 92, scale: 'japanese',
      chords: [[0, 1, 5], [0, 5, 6], [-1, 4, 8]],
      bpm: 76, density: 0.4,
      layers: ['pad', 'blip', 'bass'],
      gimmick: 'boing',
    },
    {
      id: 'garden-of-wires',
      name: 'Garden of Wires',
      vibe: 'Overgrown, humming, faintly wrong.',
      character: 'odd',
      root: 117, scale: 'dorian',
      chords: [[0, 3, 7, 10], [0, 5, 10], [-2, 3, 9]],
      bpm: 0, density: 0.55,
      layers: ['pad', 'bell', 'blip'],
      gimmick: 'rain',
    },

    /* ---------------------------- SILLY ---------------------------- */
    {
      id: 'sad-trombone-drone',
      name: 'Sad Trombone Drone',
      vibe: 'It keeps almost making it.',
      character: 'silly',
      root: 87, scale: 'blues',
      chords: [[0, 3, 7], [0, 3, 6], [0, 2, 5]],
      bpm: 72, density: 0.35,
      layers: ['bass', 'wobble'],
      gimmick: 'sag',
    },
    {
      id: 'kazoo-protocol',
      name: 'Kazoo Protocol',
      vibe: 'A marching band of one drone with no shame.',
      character: 'silly',
      root: 131, scale: 'majorPent',
      chords: [[0, 4, 7], [0, 2, 7], [-3, 4, 9]],
      bpm: 120, density: 0.8,
      layers: ['bass', 'wobble', 'perc', 'blip'],
      gimmick: 'march',
    },
  ];

  function byId(id) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i];
    return null;
  }

  global.Tracks = {
    all: TRACKS,
    scales: SCALES,
    byId: byId,
    count: TRACKS.length,
    /** Everything with a given character, for the UI's filter chips. */
    withCharacter: function (c) {
      return TRACKS.filter(function (t) { return t.character === c; });
    },
    characters: ['calm', 'playful', 'driving', 'odd', 'silly'],
  };
})(window);
