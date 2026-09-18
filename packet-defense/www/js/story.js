/**
 * story.js - the incident channel.
 *
 * The framing is a war room: you are on call, and Priya from security and Dave
 * the intern are in the channel with you. Lines are short on purpose. A tower
 * defence wave lasts ninety seconds and nobody reads a paragraph while a
 * Ransomware is walking at their server.
 *
 * Reactions are keyed by event, not by level, so the channel stays alive on a
 * replay without needing new writing for every ticket.
 */
(function (global) {
  'use strict';

  var CAST = {
    priya: { who: 'priya', name: 'Priya', role: 'security', colour: '#22d3ee' },
    dave: { who: 'dave', name: 'Dave', role: 'intern', colour: '#f59e0b' },
    ops: { who: 'ops', name: 'pagerduty', role: 'bot', colour: '#6f89a8' },
  };

  var OPENINGS = {
    1: [
      ['ops', 'INC-1043 opened in DEV. Build agent is retrying a bad request.'],
      ['priya', 'It is not a real attack. It is just a lot of them. Put a Firewall on a corner and go get coffee.'],
      ['dave', 'what is a corner'],
      ['priya', 'Dave.'],
    ],
    2: [
      ['dave', 'i duplicated the job to make it faster'],
      ['priya', 'You made it four times faster at being wrong.'],
      ['priya', 'Two cheap towers beat one expensive one. Try it.'],
    ],
    3: [
      ['ops', 'INC-1045. Search endpoint is being used as a database.'],
      ['priya', 'These are moving fast and your Firewall barely sees them. WAF does 160% to injection.'],
      ['dave', 'so i should build only wafs'],
      ['priya', 'You should build what the wave is made of. That is the whole game.'],
    ],
    4: [
      ['ops', 'INC-1046. Comment field is executing.'],
      ['priya', 'Every one you kill becomes two. Kill them where you can kill the children as well.'],
      ['dave', 'thats like my last relationship'],
    ],
    5: [
      ['ops', 'Promoting to STAGING. Retry loop is not terminating.'],
      ['priya', 'Zombie process. It gets up once. Antivirus is what stops the second act.'],
    ],
    6: [
      ['ops', 'STAGING. Files are being encrypted as they are written.'],
      ['priya', 'Ransomware shuts down a tower for four seconds on contact. Do not let one tower be your whole defence.'],
      ['dave', 'it walked past my antivirus and turned it off'],
      ['priya', 'Yes. That is what I just said.'],
    ],
    7: [
      ['ops', 'INC-1053. Legacy endpoint being walked carefully.'],
      ['priya', 'Someone has read our docs. This is patient, not loud.'],
    ],
    8: [
      ['dave', 'i pointed the load test at staging instead of the sandbox'],
      ['ops', 'Staging is now under 3000 requests per second.'],
      ['priya', 'DDoS drones have 7 HP. One Firewall in the right place kills them faster than they spawn.'],
      ['dave', 'sorry'],
      ['priya', 'Bill it to the internship budget.'],
    ],
    9: [
      ['ops', 'THIS IS PRODUCTION. Black Friday traffic is live.'],
      ['priya', 'The road hugs the walls on this map. The middle is dead space. Do not build in the middle.'],
    ],
    10: [
      ['ops', 'PRODUCTION. Coordinated extortion. They are targeting defences, not the server.'],
      ['priya', 'Antivirus does 170% to malware. This is the ticket where that stops being optional.'],
    ],
    11: [
      ['priya', 'They have read our incident log. This is everything, at once.'],
      ['dave', 'what do we do'],
      ['priya', 'You cannot cover every class equally. Pick the one you are willing to lose to.'],
    ],
    12: [
      ['ops', 'PRODUCTION. No signature matches.'],
      ['priya', 'Firewalls and WAFs can see it and cannot touch it. Only the Antivirus can hurt this.'],
      ['dave', 'only antivirus?? thats one tower type'],
      ['priya', 'Build several. It is armoured. I am sorry.'],
    ],
  };

  var REACTIONS = {
    firstLeak: [
      ['ops', 'Uptime is falling.'],
      ['priya', 'That one is through. Each leak is a slice of uptime and you do not get it back.'],
    ],
    heavyLeak: [
      ['priya', 'Below 50%. Whatever you are doing is not working.'],
      ['dave', 'should we roll back'],
    ],
    nearDeath: [
      ['ops', 'UPTIME CRITICAL.'],
      ['priya', 'One more and we are offline.'],
    ],
    waveClear: [
      ['dave', 'did we win'],
      ['priya', 'We survived that wave. Different words.'],
    ],
    bossIncoming: [
      ['ops', 'Unidentified process on the road.'],
      ['priya', 'That is the Zero-Day. No signature. Antivirus only. Everything else is a light show.'],
    ],
    bossHurt: [
      ['dave', 'ITS TAKING DAMAGE'],
      ['priya', 'Keep going.'],
    ],
    win: [
      ['priya', 'Ticket closed. Nice work.'],
      ['dave', 'i helped'],
    ],
    lose: [
      ['ops', 'PROD IS DOWN.'],
      ['priya', 'Post-mortem at ten. Bring the replay.'],
    ],
  };

  var seen = {};

  function once(key) {
    if (seen[key]) return null;
    seen[key] = true;
    return REACTIONS[key] || null;
  }

  function opening(levelId) {
    var lines = OPENINGS[levelId] || OPENINGS[1];
    return lines.map(function (l) {
      var c = CAST[l[0]] || CAST.ops;
      return { who: c.who, name: c.name, role: c.role, colour: c.colour, text: l[1] };
    });
  }

  function reaction(key) {
    var lines = once(key);
    if (!lines) return null;
    return lines.map(function (l) {
      var c = CAST[l[0]] || CAST.ops;
      return { who: c.who, name: c.name, role: c.role, colour: c.colour, text: l[1] };
    });
  }

  /** A post-mortem note for the results screen. */
  function debrief(result) {
    if (result.leaks === 0) return 'Nothing got through. Zero leaks - that is a clean run.';
    if (result.uptime >= 90) return 'Held above 90%. One or two through the gate is normal.';
    if (result.uptime >= 50) return 'Rough. The road was leaky in the middle third.';
    return 'That was nearly an outage. Watch where the leaks came from.';
  }

  function reset() { seen = {}; }

  global.Story = {
    opening: opening,
    reaction: reaction,
    debrief: debrief,
    reset: reset,
    CAST: CAST,
  };
})(window);
