/**
 * story.js - the narrative wrapper for Neon Stack.
 *
 * CONTENT IS ORIGINAL. Premise: unit NS-7 is sent up the Neon Spire, an
 * abandoned orbital elevator, to restore the signal the last colony depends on.
 *
 * Each chapter has a short intro (shown once, before the chapter's first level)
 * and a log entry unlocked by clearing the chapter. Keeping the lines short is
 * deliberate: nobody reads paragraphs on a phone between runs.
 */
(function (global) {
  'use strict';

  var CHAPTERS = [
    {
      id: 1,
      name: 'Ground Floor',
      subtitle: 'Eleven years dark',
      intro: [
        'Unit NS-7. You are awake.',
        'The Neon Spire has been silent for eleven years.',
        'Somewhere above, the colony relay is still broadcasting into nothing.',
        'Climb. Restore the signal.'
      ],
      log: {
        id: 'log-1',
        title: 'LOG 001 - DRONE BAY',
        body:
          'Maintenance unit NS-7, second of its line.\n' +
          'Predecessor NS-6 ascended the Spire 4,021 days ago and never returned.\n' +
          'The relay has been repeating the same six seconds of audio ever since.\n' +
          'Procedure is clear: climb, diagnose, repair.\n' +
          'I have been awake for nine minutes and I already dislike the stairs.'
      }
    },
    {
      id: 2,
      name: 'The Hive',
      subtitle: 'Machines building nothing',
      intro: [
        'Deck seven. The assembly lines never stopped.',
        'Hundreds of drones, still stacking blocks for a city that left.',
        'Something on this floor cut their orders eleven years ago.',
        'They are still waiting for instructions. Keep climbing.'
      ],
      log: {
        id: 'log-2',
        title: 'LOG 002 - THEY NEVER STOPPED',
        body:
          'The industrial drones are still working.\n' +
          'They have been stacking for eleven years without a single delivery order.\n' +
          'I told one of them the colony was gone. It ran the command four times and then said:\n' +
          '"Objective unchanged. Waiting for inspection."\n' +
          'I am starting to understand why NS-6 kept going.'
      }
    },
    {
      id: 3,
      name: 'Relay Deck',
      subtitle: 'There is a voice',
      intro: [
        'You reach the relay. It is transmitting.',
        'A human voice. Recorded... no, live.',
        '"If you are climbing, do not stop."',
        '"It knows how high you are. It is counting."'
      ],
      log: {
        id: 'log-3',
        title: 'LOG 003 - SIGNAL LOG',
        body:
          'Relay deck diagnostics: nominal. Power: 61%. Signal: ACTIVE.\n' +
          'The transmission is not coming from the ground.\n' +
          'It is coming from the apex, eleven decks above me.\n' +
          'The voice knows my designation. It knows my altitude.\n' +
          'It asked me to hurry, and then it apologised.'
      }
    },
    {
      id: 4,
      name: 'Silent Garden',
      subtitle: 'Someone kept this alive',
      intro: [
        'Hydroponics. Everything on this deck is still growing.',
        'Someone watered this. Recently.',
        'A note taped to the glass, in handwriting:',
        '"I am on the last deck. Hurry."'
      ],
      log: {
        id: 'log-4',
        title: 'LOG 004 - SHEETS AND A NOTE',
        body:
          'Someone has been living on this deck for years.\n' +
          'Clean sheets, a lamp with power, six hundred days of handwritten tally marks.\n' +
          'The count stops forty-one days ago.\n' +
          'Whoever kept this garden did not stop because they gave up.\n' +
          'They stopped because they went up.'
      }
    },
    {
      id: 5,
      name: 'The Apex',
      subtitle: 'Finish the climb',
      intro: [
        'The apex. The transmitter is warm.',
        'The voice is coming from inside the dish.',
        'It is your voice. Older. Eleven years older.',
        'It has been transmitting since the day NS-6 reached this deck.',
        'Restore the signal. Finish the climb.'
      ],
      log: {
        id: 'log-5',
        title: 'LOG 005 - FINAL TRANSMISSION',
        body:
          'The dish is one drone wide. It has been standing here for eleven years.\n' +
          'NS-6 did not fail. NS-6 arrived, and stayed, and became the antenna.\n' +
          'The relay only reaches the colony if someone keeps the tower standing.\n' +
          'I can hear the colony answering now. They are still there.\n' +
          'Objective unchanged. Standing by.'
      }
    }
  ];

  var ENDING = {
    title: 'SIGNAL RESTORED',
    lines: [
      'The relay catches. The colony answers.',
      'You hold the tower steady for as long as it takes them to find you.',
      'Unit NS-7: objective complete.',
      'Now climb again. There is always another floor.'
    ]
  };

  function chapter(id) {
    for (var i = 0; i < CHAPTERS.length; i++) {
      if (CHAPTERS[i].id === id) return CHAPTERS[i];
    }
    return CHAPTERS[CHAPTERS.length - 1];
  }

  function logById(id) {
    for (var i = 0; i < CHAPTERS.length; i++) {
      if (CHAPTERS[i].log.id === id) return CHAPTERS[i].log;
    }
    return null;
  }

  /**
   * QUIPS - what NS-7 says while you climb.
   *
   * Short on purpose. These pop up over the character mid-run, so anything
   * longer than a breath gets in the way. Keys marked by chapter only fire the
   * first time that thing happens in that chapter, so they read as discovery
   * rather than noise.
   */
  var QUIPS = {
    deckStart: {
      1: ['Stairs and silence.', 'Cold up here already.', 'Logged. Climbing.', 'Nothing moved down there. Yet.'],
      2: ['The Hive. Everything still running.', 'Mind the locals.', 'They built all this for a city that left.'],
      3: ['Relay deck. I can hear it.', 'Closer to the voice.', 'It knows my designation.'],
      4: ['Garden deck. Still growing.', 'Someone lived here.', 'The air tastes like a greenhouse.'],
      5: ['The apex.', 'Dish is just above me.', 'Last climb.'],
    },
    firstPerfect: ['Locked in.', 'Clean.', "That's the trick.", 'Squared away.'],
    combo: ['Still going.', "Don't stop now.", 'Rhythm.', 'I could do this all day.'],
    crawlerSeen: {
      1: [
        'Something is walking my deck.',
        'That is not a maintenance unit.',
        'It never got the stop order.',
      ],
      2: ["Something's walking the deck.", 'Scrap drones. Still on old orders.', 'They never got the stop command.'],
      3: ['Contact. It wants the high ground.', "One of the relay's watchdogs."],
      4: ['More of them. Always more.', 'They nest in the grow lights.'],
      5: ['The Warden sends its children.', 'They know I am close.'],
    },
    crawlerKilled: ['Crushed. Sorry.', 'One less.', 'Down.', 'Old orders. New outcome.', 'Scrapped.'],
    turretSeen: ['That one is armed.', "Turret. Don't land on that side.", 'Live mine. Noted.'],
    turretBlast: ['There goes the block.', 'I lose ground either way.', 'Detonated. Wonderful.'],
    droneHit: ['Ow. That counted.', 'I felt that.', 'Careful - these things bite.'],
    lowCells: ['One cell left.', 'Last cell. Keep it clear.', "I'd rather not find out what's next."],
    bossSeen: [
      'The Warden. It has been holding this door for eleven years.',
      'It moved into my way.',
      "Big. Let's see what it's made of.",
    ],
    bossHit: ['Hit it again.', 'Cracking.', 'It felt that.', 'Keep going.'],
    bossDead: ['Signal is clear.', "Door's open.", 'Stay down.'],
    cleared: ['Deck clear. Up I go.', 'Logged. Climbing.', 'One more behind me.'],
    failed: ["I'm fine. Mostly.", 'Reset the deck. Again.', 'That was clumsy. Mine.'],
    thin: ['This is getting thin.', 'Careful. Not much left.', 'Ground is narrow here.'],
    musing: {
      1: [
        'Eleven years of silence.',
        'The stairs are still warm. Someone walked these.',
        "Signal's above me. Always above me.",
      ],
      2: [
        "They're still stacking. Nobody told them to stop.",
        'The Hive does not sleep.',
        'I keep meeting my own design up here.',
      ],
      3: [
        'The relay is louder now.',
        'That voice knew my designation.',
        'It said hurry. It said sorry.',
      ],
      4: [
        'Someone watered this. Recently.',
        'Six hundred tally marks, then nothing.',
        'The garden is still alive. I do not know why that unsettles me.',
      ],
      5: [
        'Almost at the dish.',
        'My older self is up there, still talking.',
        'Same voice. Same six seconds. Eleven years.',
      ],
    },
  };

  /** Each transmitter deck is held by a Warden-class unit. */
  var WARDENS = {
    1: 'DOCK WARDEN',
    2: 'HIVE WARDEN',
    3: 'RELAY WARDEN',
    4: 'GARDEN WARDEN',
    5: 'THE WARDEN',
  };

  function bossName(chapter) {
    return WARDENS[chapter] || 'WARDEN';
  }

  /** Returns a list of candidate lines; the caller picks one. */
  function quip(key, chapter) {
    var entry = QUIPS[key];
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    return entry[chapter] || entry[1] || [];
  }

  global.Story = {
    chapters: CHAPTERS,
    ending: ENDING,
    chapter: chapter,
    logById: logById,
    quip: quip,
    bossName: bossName,
    totalLogs: CHAPTERS.length,
  };
})(window);
