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

  /**
   * The other nineteen tickets of an act.
   *
   * `OPENINGS` is one beat per act, and the opening used to be looked up by
   * *ticket number* - so tickets 13 to 240 all replayed act one's dialogue,
   * "put a Firewall on a corner and go get coffee", two hundred and twenty-eight
   * times. Keying by act fixes the mismatch; this table is what stops the fix
   * being "the same three lines, twenty times". One exchange, deliberately: a
   * ticket is ninety seconds and the channel is not the game.
   */
  var MIDDLE = {
    1: [
      ['dave', 'is it supposed to be this many'],
      ['priya', 'Corner tile. Two stretches of road. One tower. That is the trade.'],
    ],
    2: [
      ['ops', 'Retry volume unchanged.'],
      ['priya', 'Staging forgives a bad tower. Production will not. Learn it here.'],
    ],
    3: [
      ['dave', 'the status page is going orange'],
      ['priya', 'Then spend. Money in the bank is not defence.'],
    ],
    4: [
      ['priya', 'Same three tickets, same road, same time of day. That is not a coincidence.'],
      ['ops', 'Pattern detected in incident timestamps.'],
    ],
    5: [
      ['priya', 'They are probing the edge. Cheap towers, wide coverage.'],
      ['dave', 'wide is good though right'],
      ['priya', 'Wide is fine until something armoured arrives.'],
    ],
    6: [
      ['ops', 'Transaction latency climbing.'],
      ['priya', 'Data does not come back. Whatever leaks here is gone.'],
    ],
    7: [
      ['priya', 'This is the spine. Every wall you built defends the outside of it.'],
      ['dave', 'so we defend the thing we already defended'],
      ['priya', 'Welcome to infrastructure.'],
    ],
    8: [
      ['ops', 'Build artifacts are being rewritten at source.'],
      ['priya', 'You cannot out-build this. Slow it down and kill it in the last third.'],
    ],
    9: [
      ['priya', 'Nothing on the dashboard. Everything on the wire. I hate this act.'],
      ['dave', 'is that allowed'],
    ],
    10: [
      ['ops', 'Inbound message on the incident channel. From outside.'],
      ['priya', 'Do not answer it.'],
    ],
    11: [
      ['priya', 'Everything at once, on purpose. You are meant to lose something.'],
      ['dave', 'which one'],
      ['priya', 'Choose. That is the ticket.'],
    ],
    12: [
      ['ops', 'No signature. No pattern. No precedent.'],
      ['priya', 'Last one. Whatever you have learned, use all of it.'],
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

  /** Which act a ticket belongs to, with a fallback for a missing Levels. */
  function actNumber(levelId) {
    var a = actFor(levelId);
    return a && a.n ? a.n : levelId;
  }

  /** The act object for a ticket, or null if Levels is not loaded. */
  function actFor(levelId) {
    var L = global.Levels;
    if (!L || !L.actOf) return null;
    return L.actOf(levelId);
  }

  /** Turn a table of [cast, text] pairs into channel lines. */
  function say(lines) {
    return lines.map(function (l) {
      var c = CAST[l[0]] || CAST.ops;
      return { who: c.who, name: c.name, role: c.role, colour: c.colour, text: l[1] };
    });
  }

  /**
   * The channel when a ticket starts.
   *
   * The act's opening beat on its first ticket, and a shorter exchange for the
   * rest of the act - so a player hears the act introduce itself once and then
   * keep talking, instead of hearing the same three lines twenty times.
   */
  function opening(levelId) {
    var act = actNumber(levelId);
    var a = actFor(levelId);
    var isFirst = a ? levelId === a.first : true;
    var lines = isFirst
      ? (OPENINGS[act] || OPENINGS[1])
      : (MIDDLE[act] || OPENINGS[act] || OPENINGS[1]);
    return say(lines);
  }

  /**
   * The act's own narration - and the only place it is ever read.
   *
   * `premise` and `closing` have been on every act since the generator landed and
   * were rendered nowhere at all; the offline balance report was their only
   * reader. A campaign with twelve written act openings that the player never
   * sees is a campaign with no story, whatever the file says.
   */
  function narration(levelId, which) {
    var a = actFor(levelId);
    if (!a) return null;
    if (which === 'closing') return levelId === a.last ? a.closing : null;
    return levelId === a.first ? a.premise : null;
  }

  function reaction(key) {
    var lines = once(key);
    if (!lines) return null;
    return say(lines);
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
    narration: narration,
    actNumber: actNumber,
    reset: reset,
    CAST: CAST,
  };
})(window);
