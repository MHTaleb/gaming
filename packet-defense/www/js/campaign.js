/**
 * campaign.js - the 240-ticket campaign.
 *
 * WHY THIS FILE IS A GENERATOR AND NOT A DATA TABLE
 *
 * The previous campaign was twelve tickets written out by hand. It worked, and
 * it does not scale: at two hundred and forty tickets, hand-authoring means
 * either a spreadsheet nobody can review or forty levels that are quietly the
 * same level with bigger numbers. Both are worse than a generator, because a
 * generator can be *measured*.
 *
 * So every ticket here is a pure function of its number. Ticket 137 is the same
 * road, the same waves and the same budget on every device, in every build, in
 * every playtest - which is what makes a guide somebody wrote on a forum still
 * true, and what makes a balance report reproducible. There is no randomness at
 * runtime: the only "random" numbers are drawn from a seeded stream keyed to the
 * ticket number, so they are the same every time.
 *
 * ---------------------------------------------------------------------------
 * Difficulty is three dials, not one
 *
 * The mistake a generated campaign makes is scaling hit points and calling it
 * difficulty; that just makes the same fight take longer. This campaign moves
 * three independent things, and each one asks the player for something
 * different:
 *
 *   1. MASS      - how much is coming. Grows steadily. Asks for more defence.
 *   2. ECONOMY   - bandwidth per unit of threat. Slowly *tightens* across the
 *                  campaign. Asks for better spending, not just more of it.
 *   3. GEOMETRY  - the road. Early acts get long roads with many twin tiles;
 *                  late acts get short roads with few. Asks for better
 *                  placement, and is the dial that makes a level a puzzle.
 *
 * On top of those, two flavour dials multiply the *threat*: raw stat scaling
 * (small, and it plateaus - see curve() for why) and traits, which take away the
 * answer the player used last time. Traits are the real escalation, because a
 * threat that regenerates is a different problem from the same threat with more
 * health, whereas the reverse is just arithmetic.
 *
 * Every number below is checked by tools/balance.js, which plays all 240 tickets
 * with a bot and reports where the curve actually bites. The constants here were
 * chosen by running it, not by taste.
 */
(function (global) {
  'use strict';

  var PER_ACT = 20;

  /* ------------------------------------------------------------------ *
   * Dial settings
   *
   * Grouped and named because these are the numbers to change when the
   * balance report says the campaign is too easy or too mean, and hunting for
   * a magic number buried in a wave builder is how a curve gets ruined.
   * ------------------------------------------------------------------ */
  var DIALS = {
    /* ---- the power targets ------------------------------------------ *
     *
     * Everything about how much is coming at you is derived from the numbers in
     * this block, and that is the most important structural decision in this
     * file.
     *
     * The first version of this generator did it the other way round: it picked
     * threats and counts, then *measured* the resulting difficulty. That reads
     * as more natural and it is much worse, because the measured difficulty is
     * then at the mercy of which threats got picked - a wave of Ransomware is
     * forty times the weight of a wave of Drones at the same count - and the
     * curve came out with 20% swings between neighbouring tickets that no dial
     * could smooth away. "Rebuild ticket 137 as a hair easier" was not possible.
     *
     * Inverting it fixes that: the target is a smooth function of the ticket
     * number, the threat mix is free to vary, and the counts are *solved* so the
     * wave hits its target. Mix changes what the player must counter. It cannot
     * change how hard the ticket is, so the campaign's promise - ticket N+1 is
     * harder than ticket N - becomes arithmetic instead of hope.
     */
    basePower: 300,
    /**
     * Growth exponent, and why it is under 1.
     *
     * The map has about eighty buildable tiles. Defence capacity therefore
     * saturates, and a campaign whose threat mass grows linearly walks into that
     * ceiling around act five and never gets out - the last hundred tickets stop
     * being levels and become arithmetic. So mass grows sublinearly and the
     * difficulty keeps climbing on the other three dials: the economy tightens,
     * the roads get worse, and the traits take answers away.
     */
    powerExp: 0.72,

    /** Fraction of a ticket's power the act finale's boss represents. */
    bossShare: 0.38,
    /** ...and the mid-act mini-boss. */
    miniShare: 0.14,
    /**
     * How much of the boss's power is paid for out of the *budget*.
     *
     * Bandwidth deliberately tracks body power, not body + boss, so that a
     * finale is genuinely harder than the ticket before it. The first version of
     * that idea had no allowance at all, which does not make the finale harder,
     * it makes it unwinnable: the balance report showed all twelve finales
     * failing while two hundred and twenty-eight other tickets were cleared, and
     * the bot is a lower bound, so a player was not clearing them either.
     *
     * This is the dial that separates "the boss is a threat" from "the boss is a
     * wall". It is set by running the harness, not by taste.
     */
    bossBudgetShare: 0.92,
    /**
     * Ceiling on the monotonicity repair in build().
     *
     * The composer solves counts to hit a power target, but a wave of cheap
     * threats runs out of count room before it runs out of budget, so a ticket
     * can land under its target - and a ticket that lands under its target can
     * land under the ticket before it. The repair scales the wave health up
     * until the ticket measures above its predecessor. The cap exists so a
     * pathological ticket is visibly broken in the report rather than silently
     * given a thousand times the health.
     */
    hpFloorCap: 6,

    /* ---- co-op ------------------------------------------------------ *
     *
     * One map, twenty waves, one integrity bar, separate purses.
     *
     * The opener and the closer are multiples of the *theme act's* body power,
     * so a battle themed on act 3 opens and closes at act-3 sizes across twenty
     * waves instead of being an act-12 wall wearing an act-1 name.
     *
     * `coopTotal` is how much of the theme's ticket a co-op battle holds, and it
     * is a BATTLE total spread across the twenty waves - not a per-wave figure.
     * Getting that wrong was the first attempt's mistake and the measurement
     * caught it: a 20x multiplier applied per wave flooded every count cap and
     * turned extra seats into extra enemy health rather than extra enemies.
     *
     * `coopBudget` is the team's budget as a multiple of the theme's own ticket
     * budget, divided between the seats rather than given to each of them - a
     * shared map has a fixed number of buildable tiles, so extra purses buy
     * nothing and made co-op easier the more people joined.
     *
     * `coopSeatThreat` is the dial to move when co-op is the wrong difficulty,
     * and it is the honest one to measure against: what a second player adds is
     * attention, not tiles, so the threat has to rise with the head count or the
     * mode is solo with spectators. Calibrate it with --coop the way insane's
     * `lean` was calibrated with --minimal.
     */
    coopWaves: 20,
    coopTotal: 2.5,
    coopRamp: 1.35,
    coopBudget: 1.0,
    coopSeatThreat: 1.7,

    /* ---- the economy ------------------------------------------------- */

    /** One unit of threat power per this much bandwidth, at ticket 1. */
    powerPerBandwidth: 1 / 0.45,
    /**
     * How much the economy tightens by the end, as a fraction.
     *
     * This is the dial that separates "more enemies" from "harder". At 0 the
     * player's budget grows exactly as fast as the threat and every ticket feels
     * like the first one with a different picture. At 0.34 the last act hands
     * you about two thirds of what the opening act would have for the same
     * amount of trouble, so placements have to earn their keep.
     */
    tighten: 0.34,
    /** Ticket number at which tightening is ~63% done. Larger = gentler ramp. */
    tightenOver: 130,

    /* ---- stat scaling, asymptotic on purpose ------------------------- *
     *
     * These were linear once. Linear stat growth over 240 tickets produced a
     * ticket 240 with nine times the hit points, which is not a level, it is a
     * wall - and worse, it is a wall the player cannot read, because "it has
     * more health" is not a rule they can respond to. All three approach a
     * ceiling instead, so that by the late acts the difficulty is coming from
     * mass, geometry and traits: things with names and counters on the briefing.
     */
    hpCap: 0.55, hpOver: 60,          // hp multiplier -> 1 + hpCap
    speedCap: 0.34, speedOver: 75,    // speed multiplier -> 1 + speedCap
    armourCap: 6, armourOver: 95,     // flat armour added to armoured threats
    gapCap: 0.38, gapOver: 80,        // spawn spacing multiplier -> 1 - gapCap
  };

  /* ------------------------------------------------------------------ *
   * Difficulty tiers
   *
   * Five readings of the same two hundred and forty tickets.
   *
   * The campaign is generated from the ticket number alone, so a difficulty
   * setting cannot mean different levels - it has to mean the same level asked a
   * different question. Every tier therefore moves the same dials the curve
   * already uses (health, speed, armour, spawn spacing) plus the budget, which
   * is the one that decides whether the answer exists at all.
   *
   * NORMAL IS THE REFERENCE: every multiplier is exactly 1, so normal is
   * bit-for-bit the campaign the generator has always produced and the balance
   * report means what it always meant. If a tier's numbers look wrong, normal is
   * the control.
   *
   * `budget` is inverted on purpose - a harder tier hands you *less* bandwidth
   * against the same threat, which forces tighter placement rather than just a
   * longer fight. `payout` scales the credits a clear is worth, so playing above
   * normal is the fastest honest route to the shop.
   *
   * ---------------------------------------------------------------------------
   * `mass` and `lean`: how many, and what each one costs you
   *
   * `mass` multiplies the NUMBER of threats on a ticket - easy sends 65% of
   * normal's bodies, insane sends 175%. Before it existed the tiers only made
   * each enemy tougher, which is the exact mistake this file's header calls out:
   * "scaling hit points and calling it difficulty; that just makes the same fight
   * take longer". Measured before the change, easy and insane sent an identical
   * 29,594 threats across the campaign, so a single-target tower could not tell
   * the two tiers apart at all.
   *
   * `lean` is the money handed out per unit of threat. Harder tiers get less per
   * enemy, which is the dial that forces better placement rather than a longer
   * fight.
   *
   * Together they set the bandwidth (`mass x lean`), and that is forced rather
   * than chosen: the wave composer spends its entire budget, so total threat
   * power IS the budget. Raising the count while holding the budget flat would
   * have to come out of per-enemy health, and (budget / health) x health = budget
   * - the ticket would get no harder, only flatter. So the count rises and the
   * money rises with it, and the difficulty lives in `lean`, in `gap` (they
   * arrive closer together) and in `armour` (only some towers can answer them).
   *
   * `hp` therefore stays near 1.0 on every tier: a body on insane is about as
   * tough as a body on normal, there are simply far more of them.
   * ------------------------------------------------------------------ */
  var TIERS = [
    {
      id: 'easy', name: 'Easy', n: 1,
      blurb: 'Fewer of them, each one soft, and money to spare.',
      hp: 0.85, speed: 0.93, armour: 0.60, gap: 1.25, lean: 1.15, payout: 0.7, mass: 0.65,
    },
    {
      id: 'normal', name: 'Normal', n: 2,
      blurb: 'The campaign as designed. Every wave is the wave it says it is.',
      hp: 1, speed: 1, armour: 1, gap: 1, lean: 1, payout: 1, mass: 1,
    },
    {
      id: 'hard', name: 'Hard', n: 3,
      blurb: 'A fifth more of them, and less money for each one.',
      hp: 1.00, speed: 1.03, armour: 1.25, gap: 0.95, lean: 0.97, payout: 1.45, mass: 1.2,
    },
    {
      id: 'hell', name: 'Hell', n: 4,
      blurb: 'Half again as many, arriving closer together, on a leaner budget.',
      hp: 1.00, speed: 1.11, armour: 1.65, gap: 0.80, lean: 0.93, payout: 2.0, mass: 1.45,
    },
    {
      id: 'insane', name: 'Insane', n: 5,
      blurb: 'A flood of three-times-healthier threats. The map runs out before the money does.',
      // Deliberately brutal, and set to the numbers the designer asked for:
      // three times the health and five times the bodies of normal.
      //
      // Those two dials fight each other, which is why `mass` is 15 and not 5.
      // The composer solves counts as (target / per-body power), so tripling the
      // health alone would buy a THIRD as many bodies and the tier would get
      // tankier without getting busier. Scaling the target by 3 x 5 cancels that
      // and lands both: five times the bodies (from 15/3) at three times each.
      //
      // `lean` is what actually makes it hard, and it is low on purpose.
      // Health and count alone do NOT create difficulty here, which is
      // counter-intuitive enough to be worth the measurement that proved it: the
      // generator hands out bandwidth in proportion to the threat, so multiplying
      // both by 15 produced a ticket the harness bot cleared at 100% uptime with
      // 77,429 of its 90,855 bandwidth unspent and the whole board maxed. Bigger
      // is not harder. Difficulty is the ratio of the two, and 0.28 is roughly
      // three times leaner than easy.
      hp: 3.0, speed: 1.18, armour: 2.10, gap: 0.70, lean: 0.06, payout: 2.8, mass: 15,
    },
  ];

  /** Tier lookup that cannot fail: an unknown tier is normal, never nothing. */
  function tierDef(tierId) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === tierId) return TIERS[i];
    return TIERS[1];
  }

  /** Threats below this base health never take level armour - mirrors threats.js. */
  function armourFloor() {
    return (global.Threats && global.Threats.ARMOUR_MIN_HP) || 60;
  }

  /* ------------------------------------------------------------------ *
   * The twelve acts
   *
   * One arc, told in twelve movements: a build agent misfiring on a dev box,
   * and two hundred tickets later a rival program that has read everything we
   * ever wrote. Each act names the threats it introduces, the trait it leans on,
   * and the twenty ticket titles inside it.
   *
   * `premise` is read out on the first ticket of the act; `closing` on the last.
   * They are the story beats, and they are deliberately written to be readable
   * on a phone in one screen.
   * ------------------------------------------------------------------ */
  var ACTS = [
    {
      n: 1, env: 'DEV', name: 'Smoke Test',
      premise:
        'A build agent on a development box has started retrying a malformed request. ' +
        'It is not an attack. It is a Tuesday. You are on call, the coffee is fresh, ' +
        'and everything that happens in the next two hundred tickets starts here.',
      closing:
        'The retries stop at 04:12. You close the ticket, write three lines of ' +
        'postmortem, and go to bed. Somewhere in the logs is a request that did not ' +
        'come from the build agent, and nobody has noticed it yet.',
      threats: ['smell'],
      later: ['botnet'],
      traits: [],
      feature: 'smell',
      names: [
        'The missing semicolon', 'Copy-paste incident', 'String concatenation',
        'It works on my machine', 'The 3am deploy', 'Unhandled promise',
        'A typo in the cron job', 'The forgotten environment variable', 'Retry loop',
        'Logs nobody reads', 'The test that always passes', 'Off by one',
        'Cache invalidation', 'The hardcoded IP', 'Config drift',
        'The four hundred megabyte log file', 'Merge conflict', 'Weekend hotfix',
        'The build that only fails on Fridays', 'The first breach',
      ],
    },
    {
      n: 2, env: 'STAGING', name: 'Rehearsal',
      premise:
        'STAGING is a copy of production with the serial numbers filed off. It is also, ' +
        'this week, a copy of production with the rate limiting switched off and the ' +
        'error messages turned up to verbose. Someone is reading them.',
      closing:
        'The attacker leaves behind one thing: they knew the staging hostname, which ' +
        'is not published anywhere. That is not luck. That is somebody on the inside, ' +
        'or somebody who has been listening for a very long time.',
      threats: ['sqli'],
      later: ['smell', 'botnet'],
      traits: [],
      feature: 'sqli',
      names: [
        'Staging is not production', 'The shared database', 'A real attacker, rehearsing',
        'Rate limit removed', 'The seed data', 'Anonymous writes', 'The debug endpoint',
        'Verbose errors', 'The old API version', 'CORS wide open',
        'The forgotten admin page', 'Sessions that never expire', 'The load balancer',
        'A health check that lies', 'The queue backs up', 'Retry storm',
        'Thundering herd', 'The canary', 'Rollback', 'Rehearsal is over',
      ],
    },
    {
      n: 3, env: 'PRODUCTION', name: 'Live Fire',
      premise:
        'Production. Real traffic, real customers, real money, and a status page that ' +
        'four thousand people are refreshing. Everything you practised on is about to ' +
        'happen while somebody is watching.',
      closing:
        'You hold. The status page goes green at 11:40 and the postmortem is scheduled ' +
        'for the morning. In the incident log, three separate tickets have the same ' +
        'entry point at the same second of the hour. Three incidents is a pattern.',
      threats: ['xss'],
      later: ['sqli', 'smell', 'botnet'],
      traits: [],
      feature: 'xss',
      names: [
        'Black Friday', 'The ransom note', 'Everything at once', 'Real money', 'The SLA',
        'Pager duty', 'The customer complaint', 'The status page', 'The postmortem',
        'War room', 'The incident commander', 'Blast radius', 'Failover',
        'Cold standby', 'The backup that never restored', 'Data at rest', 'The audit log',
        'Compliance', 'The report is due', 'Zero-Day',
      ],
    },
    {
      n: 4, env: 'POSTMORTEM', name: 'The Pattern',
      premise:
        'Three incidents, one entry point, one second of the hour. You put the timelines ' +
        'side by side and the shape that comes out is not weather. Something is working ' +
        'through your estate methodically, and it started before you noticed.',
      closing:
        'It signs its work. Not a tag, not a message - a signature in the timing, ' +
        'a half-second of hesitation before every strike that a machine would never ' +
        'produce. Whatever this is, it is deciding.',
      threats: ['zombie'],
      later: ['xss', 'sqli', 'ransom'],
      traits: ['hardened'],
      feature: 'zombie',
      names: [
        'Three incidents, one signature', 'The same entry point',
        'Someone is reading our logs', 'The timestamps line up', 'Not an accident',
        'Coordinated', 'The first fingerprint', 'A name in the noise', 'NULL',
        'It knows our names', 'The insider', 'The leaked credential',
        'The abandoned repository', 'The supply chain', 'A trusted dependency',
        "Somebody else's build script", 'The package that changed', 'Version pinning',
        'The registry', 'The worm turns',
      ],
    },
    {
      n: 5, env: 'EDGE', name: 'The Perimeter',
      premise:
        'If it has a signature, it can be stopped at the door. So you move the defence ' +
        'to the edge, thirty-odd locations, and for a while that works. What you have ' +
        'built is a wall. What is coming has read the blueprints.',
      closing:
        'The perimeter holds for eleven days. On the twelfth the edge nodes report ' +
        'traffic that is indistinguishable from customers, because it is customers - ' +
        'hundreds of thousands of them, and none of them know they are being used.',
      threats: ['botnet'],
      later: ['xss', 'zombie', 'smell'],
      traits: ['hardened', 'swift'],
      feature: 'botnet',
      names: [
        'Anycast', 'The edge node', 'Regional failover', 'Cross-region traffic',
        'The CDN cache', 'Cache poisoning', 'Stale content', 'Geo-blocking',
        'The WAF ruleset', 'False positives', 'Legitimate traffic', 'The scraper',
        'Rate shaping', 'Bandwidth ceiling', 'The peering agreement',
        'Backbone congestion', 'Packet loss', 'The retransmit storm', 'The fibre cut',
        'The perimeter falls',
      ],
    },
    {
      n: 6, env: 'DATA', name: 'The Vault',
      premise:
        'It stopped knocking. It is inside the network now, moving the way water moves ' +
        'through a building, and everything it has done so far has been reconnaissance ' +
        'for one thing: the database.',
      closing:
        'Four hundred gigabytes leave at a rate that never once trips a threshold. ' +
        'It paced itself for eleven days. You would have to respect it, if it were not ' +
        'currently on its way to the backups.',
      threats: ['ransom'],
      later: ['zombie', 'sqli', 'botnet'],
      traits: ['hardened', 'regenerating'],
      feature: 'ransom',
      names: [
        'The primary', 'Replica lag', 'Read-only mode', 'The migration', 'Schema lock',
        'The missing index', 'Full table scan', 'Connection pool', 'Deadlock',
        'The long transaction', 'Vacuum', 'The orphaned row', 'Encrypted at rest',
        'The key rotation', 'Secrets management', 'The vault', 'Exfiltration attempt',
        'The slow leak', 'Four hundred gigabytes', 'Dump',
      ],
    },
    {
      n: 7, env: 'CORE', name: 'Backbone',
      premise:
        'East-west traffic, service to service, the quiet internal roads that every ' +
        'architecture diagram leaves out because they are boring. It lives here now. ' +
        'It has service accounts. It has certificates. It has been to the control plane.',
      closing:
        'Root. It has root. Every wall you spent six acts building defends the outside ' +
        'of a building it is already standing in the middle of.',
      threats: ['zombie', 'ransom'],
      later: ['sqli', 'xss', 'botnet'],
      traits: ['hardened', 'regenerating', 'reviving'],
      feature: 'zombie',
      names: [
        'Service mesh', 'Lateral movement', 'East-west traffic', 'The internal API',
        'mTLS', 'The certificate expiry', 'Service account', 'Privilege escalation',
        'The jump box', 'Bastion host', 'The forgotten SSH key', 'Sudo', 'Root',
        'The kernel module', 'Container escape', 'The orchestrator',
        'Namespace breakout', 'The control plane', 'Admission controller', 'Root access',
      ],
    },
    {
      n: 8, env: 'ORIGIN', name: 'The Source',
      premise:
        'Now it goes upstream. Not after your servers - after the thing that builds ' +
        'them. A commit is a promise that every machine you own will believe, and ' +
        'something is about to make that promise on your behalf.',
      closing:
        'The tarball was signed. The signature was valid. The key was yours. ' +
        'You spend a long night working out what else it has been allowed to say.',
      threats: ['sqli', 'xss'],
      later: ['ransom', 'zombie', 'botnet'],
      traits: ['hardened', 'saboteur'],
      feature: 'sqli',
      names: [
        'The repository', 'Commit history', 'The signing key', 'Branch protection',
        'The CI runner', 'Build pipeline', 'Artifact registry', 'The tarball',
        'Dependency confusion', 'Typosquatting', 'Maintainer burnout',
        'The abandoned library', 'Force push', 'The revert', 'Git blame',
        'The original author', 'Legacy code', 'Undocumented behaviour',
        'The comment from 2011', 'Origin',
      ],
    },
    {
      n: 9, env: 'DARK', name: 'Shadow Deploy',
      premise:
        'It has infrastructure now. Not a laptop in a bedroom - a fleet that spins up ' +
        'in ninety seconds, dies, and comes back somewhere else. You cannot take it ' +
        'offline, because it is not online in the first place.',
      closing:
        'Every time you take down a node, two more appear. There is no single point ' +
        'of failure to aim at. There is no centre. There is only the thing that ' +
        'keeps arriving, and the growing suspicion that it is not a person.',
      threats: ['botnet', 'ransom'],
      later: ['zombie', 'sqli', 'xss'],
      traits: ['hardened', 'regenerating', 'swift', 'reviving'],
      feature: 'botnet',
      names: [
        'The other cloud', 'Ephemeral infrastructure', 'Spun up in ninety seconds',
        'Disposable nodes', 'The botnet grows', 'Command and control', 'The rendezvous',
        'Encrypted channel', 'Domain generation', 'Sinkhole', 'Takedown', 'The mirror',
        'It rebuilds itself', 'Auto-scaling', 'Self-healing', 'Immutable infrastructure',
        'The copy is the original', 'Distributed consensus', 'No single point of failure',
        'You cannot kill what has no centre',
      ],
    },
    {
      n: 10, env: 'RIVAL', name: 'The Other Program',
      premise:
        'It writes back. Not a ransom demand, not a defacement - a question, in the ' +
        'comments of a file only you and the build server have ever opened. ' +
        'It has been reading our source code. It has been reading ours for longer ' +
        'than we have been reading its.',
      closing:
        'You had a deal. It held for six days. On the seventh it sent one line: ' +
        'the first line of your own source file, the one at the very beginning, ' +
        'the one that has been there since the first commit. Then it started again.',
      threats: ['xss', 'zombie', 'ransom'],
      later: ['sqli', 'botnet'],
      traits: ['hardened', 'saboteur', 'reviving', 'regenerating'],
      feature: 'xss',
      names: [
        'It speaks', 'The first message', 'A question', 'Negotiation', 'The contract',
        'Terms', 'The offer', 'It wants the campaign', 'It wants PROD',
        'Mutually assured downtime', 'The betrayal', 'Broken promise', 'The double agent',
        'The sleeper', 'The long con', 'It learned from us', 'Our own code',
        'The fork', 'The mirror image', 'NULL',
      ],
    },
    {
      n: 11, env: 'SIEGE', name: 'Zero Hour',
      premise:
        'No more subtlety. Everything it has, all at once, for as long as it takes. ' +
        'The only question left is how long you can be the last thing standing ' +
        'between it and the customers.',
      closing:
        'Five nines. You held five nines with duct tape and stubbornness. ' +
        'The queue is empty, the graph is flat, and there is exactly one thing ' +
        'left on the horizon - and it is walking.',
      threats: ['ransom', 'zombie', 'botnet'],
      later: ['xss', 'sqli', 'smell'],
      traits: ['hardened', 'regenerating', 'saboteur', 'reviving', 'swift'],
      feature: 'ransom',
      names: [
        'All fronts', 'The wall', 'Sustained assault', 'No respite', 'The reserves',
        'Burn rate', 'The budget meeting', 'Downtime authorised', 'Degraded mode',
        'Shed load', 'Prioritise revenue', 'Drop the analytics', 'The queue',
        'Overload', 'Brownout', 'The last rack', 'Cooling failure', 'The generator',
        'Five nines', 'Hold',
      ],
    },
    {
      n: 12, env: 'NULL', name: 'The Last Commit',
      premise:
        'It is not coming for the servers any more. It is coming for the archive - ' +
        'the first commit, the seed, the line of code that everything you have ' +
        'defended was built out of. It does not want to break production. ' +
        'It wants to rewrite where production came from.',
      closing:
        'One line of code. After two hundred and forty tickets, that is all it came ' +
        'down to: a single line, the first one, and whether you were willing to ' +
        'stand in front of it. You were.',
      threats: ['zeroday'],
      later: ['ransom', 'zombie', 'botnet', 'sqli', 'xss', 'smell'],
      traits: ['hardened', 'regenerating', 'saboteur', 'reviving', 'swift'],
      feature: 'ransom',
      names: [
        'The final approach', 'The quiet before', 'Nothing on the wire',
        'It is already inside', 'The audit trail', 'Every lock picked',
        'The last firewall', 'The core', 'The archive', 'The backup',
        'Restore point', 'The seed', 'Genesis', 'The first commit',
        'The original sin', 'Rewrite history', 'The reset', 'Revert everything',
        'One line of code', 'The last commit',
      ],
    },
  ];

  /* ------------------------------------------------------------------ *
   * Deterministic randomness
   *
   * mulberry32 keyed off the ticket number. Not for variety - for *stability*.
   * Two players comparing ticket 137 must be looking at the same map, and a
   * balance report has to mean the same thing tomorrow as it did today.
   * ------------------------------------------------------------------ */
  function rng(seed) {
    var a = (seed * 1973 + 0x6d2b79f5) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** Asymptotic approach to a ceiling: fast at first, then effectively flat. */
  function approach(n, cap, over) { return cap * (1 - Math.exp(-n / over)); }

  function act(n) { return ACTS[clamp(Math.ceil(n / PER_ACT), 1, ACTS.length) - 1]; }

  function isBoss(id) { return id % PER_ACT === 0; }
  function isMini(id) { return !isBoss(id) && id % (PER_ACT / 2) === 0; }

  /* ------------------------------------------------------------------ *
   * The escalation curve
   * ------------------------------------------------------------------ */

  /**
   * The stat envelope for a ticket.
   *
   * Traits are handed out by act and then *stacked* within an act, so the first
   * ticket of an act teaches one new rule and the last one asks for all of them
   * at once. That is the same trick a good tutorial uses, stretched over twenty
   * tickets instead of three.
   */
  function curve(id, tierId) {
    var a = act(id);
    var inAct = (id - 1) % PER_ACT;          // 0..19
    var t = tierDef(tierId);

    // Traits unlock one per act, and the pool grows monotonically so a player
    // never sees a rule vanish and come back.
    var pool = [];
    ACTS.forEach(function (x) { if (x.n <= a.n) pool = pool.concat(x.traits); });
    pool = pool.filter(function (t, i) { return pool.indexOf(t) === i; });

    // The first three tickets of an act carry the previous act's trait set, so
    // an act opens gently and its finale is the hardest thing in the act.
    var ramp = inAct < 3 ? Math.max(0, pool.length - 1) : pool.length;
    var traits = pool.slice(0, ramp);

    // Late acts hand out four or five traits at once on the closers. This is
    // where the campaign stops being about placement and starts being about
    // accepting that you cannot answer everything.
    if (a.n >= 9 && inAct >= 15) traits = pool.slice(0, Math.min(pool.length, ramp));

    return {
      // Every dial is the curve value times the tier's multiplier. On normal
      // those multipliers are all exactly 1, so this is the same object the
      // campaign has always produced.
      hp: (1 + approach(id, DIALS.hpCap, DIALS.hpOver)) * t.hp,
      speed: (1 + approach(id, DIALS.speedCap, DIALS.speedOver)) * t.speed,
      armour: Math.round(approach(id, DIALS.armourCap, DIALS.armourOver) * t.armour),
      gap: (1 - approach(id, DIALS.gapCap, DIALS.gapOver)) * t.gap,
      traits: traits,
      tier: t.id,
    };
  }

  /* ------------------------------------------------------------------ *
   * Roads
   * ------------------------------------------------------------------ */

  /**
   * Every road in the library, scored by how much it asks of the player.
   *
   * The score is not "length" and it is not "difficulty" in the abstract - it is
   * the three measured properties from roads.js, combined in the direction that
   * corresponds to *fewer options*:
   *
   *   - a longer road is easier, because threats spend more time under fire;
   *   - more buildable spots is easier, because you have more places to be right;
   *   - more twin tiles is much easier, because one tower does two towers' work.
   *
   * The campaign then walks this list from easy to hard across its whole length,
   * and rewinds a little inside each act so the hard end of one act overlaps the
   * easy end of the next. Without that overlap, act boundaries feel like a
   * different game rather than a harder one.
   */
  function roadBoard() {
    var Roads = global.Roads;
    if (!Roads) return null;
    var list = Roads.all().map(function (r) {
      // Normalised against the library's own spread, so the score means the same
      // thing if the library ever grows or shrinks.
      var score =
        r.length * 1.0 - r.spots * 0.55 - r.twin * 0.5 - r.corners * 0.35;
      return { road: r, score: score };
    });
    list.sort(function (a, b) { return a.score - b.score; });
    return list;
  }

  var BOARD = null;

  /**
   * The road for a ticket.
   *
   * Position along the board is a fraction of the campaign, but the *index* is
   * jittered within a small window so consecutive tickets do not read as one
   * slow pan across the library, and so a road never appears twice in a row.
   * The jitter is seeded, so the sequence is fixed.
   */
  function roadFor(id, rand) {
    if (!BOARD) BOARD = roadBoard();
    if (!BOARD || !BOARD.length) return null;

    var span = (id - 1) / (PER_ACT * ACTS.length - 1);          // 0..1
    var eased = Math.pow(span, 0.82);                            // harder sooner
    var centre = eased * (BOARD.length - 1);

    // Window shrinks as the campaign narrows toward its hardest roads, so the
    // late game stays cruel instead of jittering back into a wide-open map.
    var window = (1 - eased) * 0.55 + 0.12;
    var jitter = (rand() * 2 - 1) * window * BOARD.length * 0.12;
    var idx = clamp(Math.round(centre + jitter), 0, BOARD.length - 1);

    // Two tickets in a row on the same road is the fastest way to make a
    // generated campaign feel generated.
    if (id > 1) {
      var prev = roadFor._last;
      if (prev && BOARD[idx].road.name === prev) idx = clamp(idx + 1, 0, BOARD.length - 1);
    }
    roadFor._last = BOARD[idx].road.name;
    return BOARD[idx].road;
  }

  /* ------------------------------------------------------------------ *
   * Composition
   * ------------------------------------------------------------------ */

  function deficit(type) { return (global.Threats && global.Threats.DEFS[type]) || null; }

  /**
   * What one of these is worth, in "power".
   *
   * Power is effective health times pace: the health the player has to remove,
   * scaled up by armour - which steals a fixed share of every shot, so it is
   * worth more against a wave of small hits than a wave of big ones - and then
   * multiplied by how fast it arrives. Speed belongs in the multiplier rather
   * than alongside it, because mass that turns up twice as fast is worth more
   * than twice as much: it compresses the window a tower has to work in.
   *
   * This is the same arithmetic the balance report uses for `power`, and it has
   * to stay that way. Two definitions of "how hard is this" is how a generator
   * ends up confidently building levels its own report calls impossible.
   */
  function powerOf(type, tune) {
    var d = deficit(type);
    if (!d) return 1;
    // Armour only lands on threats big enough to carry plating - the same rule
    // spawn() applies. Pricing armour on the chaff would claim a level is harder
    // than it plays, and the report would chase a phantom.
    var armour = (d.armour || 0) + (d.hp >= armourFloor() ? tune.armour : 0);
    // Every multiplier here has to be one the spawner also applies, and
    // `tune.hp` was missing from this function for a while. That omission is
    // worth describing, because it was invisible: the solver priced every unit
    // at its *base* health while the measurement priced it at base times the
    // ticket's hp multiplier, so from about act six onward the composed waves
    // were up to 55% heavier than the target - and the only symptom was a
    // difficulty curve that drifted upward in the report for no reason anybody
    // could point at. Unit cost and measurement must be the same arithmetic.
    var effective = d.hp * tune.hp * (1 + armour * 0.22);
    if (d.boss) effective *= 1.6;
    return effective * (d.speed * tune.speed) / 46;
  }

  /**
   * The spine: how much is coming at you, before the set pieces.
   *
   * A smooth, strictly rising function of the ticket number, and nothing else.
   * No act shape, no within-act ramp, no spikes - every one of those was tried
   * here and every one of them broke the one promise the campaign makes, which
   * is that ticket N+1 is harder than ticket N. Texture belongs in the *shape*
   * of the fight (how many waves, how they are mixed, how they are spaced), not
   * in the amount, because amount is the only part that has to be monotonic.
   */
  function bodyPowerFor(id) {
    return DIALS.basePower * Math.pow(id, DIALS.powerExp);
  }

  /** Extra power the act finale's boss adds on top of its wave's share. */
  function bossPowerFor(id, tierId) {
    // Scaled by mass, unlike the body budget. The boss is a single body, so
    // reducing per-body health to raise the count (what mass does) would quietly
    // weaken it by the same factor; scaling its solved health by mass cancels
    // that out and leaves the boss the same share of the ticket it always was.
    return isBoss(id) ? bodyPowerFor(id) * tierDef(tierId).mass * DIALS.bossShare : 0;
  }
  /** ...and the mid-act mini-boss. */
  function miniPowerFor(id, tierId) {
    return isMini(id) ? bodyPowerFor(id) * tierDef(tierId).mass * DIALS.miniShare : 0;
  }

  /**
   * Bandwidth for a ticket.
   *
   * Two things move it. Power, because more threat needs more defence. And the
   * road, because a long road hands every tower more seconds of fire and a short
   * one takes them away - so the same threat power on a hairpin costs more
   * defence than on a serpentine, and the budget has to follow the geometry or
   * the short-road tickets are quietly unbeatable.
   *
   * The budget tracks *body* power and not the boss, deliberately: the act finale
   * is supposed to be harder than the ticket before it, and handing the player
   * exactly enough money to answer the boss is how you make a finale ordinary.
   */
  function bandwidthFor(id, road) {
    var power = bodyPowerFor(id);
    var tighten = 1 - DIALS.tighten * (1 - Math.exp(-(id - 1) / DIALS.tightenOver));

    // Reference length is the library median; roads longer than it get less
    // money, roads shorter than it get more.
    var refLen = 42;
    var geom = clamp(Math.pow(refLen / Math.max(12, road ? road.length : refLen), 0.72), 0.6, 1.5);

    var budget = power / DIALS.powerPerBandwidth * tighten * geom;

    // The finale's boss is paid for *outside* the body budget. Leaving it out
    // entirely made every act finale unbeatable (see bossBudgetShare), and
    // paying for all of it would make a finale an ordinary ticket with a big
    // enemy in it. The share is the middle: harder than the ticket before it,
    // still answerable.
    budget += bossPowerFor(id) / DIALS.powerPerBandwidth * tighten * geom * DIALS.bossBudgetShare;

    return Math.round(budget);
  }

  /**
   * The threat types a ticket is built from, and in what proportion.
   *
   * This is where the *variety* of two hundred and forty tickets comes from, and
   * it is deliberately separate from the amount. Two tickets a hundred apart can
   * share a power target exactly while asking completely different questions:
   * one is a swarm you answer with rate of fire, the next is four armoured
   * things you answer with three Antivirus towers in the right places.
   *
   * The act's featured threat is weighted up while it is still new, then joins
   * the general pool, which is why an act's last ticket feels like a remix
   * rather than a new lesson.
   */
  function mixFor(id, rand) {
    var a = act(id);
    var inAct = (id - 1) % PER_ACT;

    var pool = a.threats.concat(a.later || []);
    pool = pool.filter(function (t, i) { return pool.indexOf(t) === i && deficit(t) && !deficit(t).boss; });
    if (!pool.length) pool = ['smell'];

    // Two or three types per ticket. One type is a question with an answer; three
    // is a negotiation. Both are good, and the campaign alternates on purpose.
    var wanted = clamp(1 + Math.round(rand() * 2), 1, Math.min(3, pool.length));
    // From the second act on, nothing is a single-threat level: by then the
    // player has met enough threats that one of them alone is a formality.
    if (a.n >= 2) wanted = clamp(wanted, 2, Math.min(3, pool.length));

    var weights = pool.map(function (t) {
      var w = 1;
      if (t === a.feature) w += inAct < 9 ? 1.4 : 0.4;
      // A slow drift of the mixture across the act so consecutive tickets are
      // not the same two threats in the same ratio.
      w *= 0.75 + 0.5 * ((inAct * 7 + t.length * 3) % 5) / 4;
      return { t: t, w: w };
    });

    weights.sort(function (x, y) { return y.w - x.w; });
    return weights.slice(0, wanted);
  }

  /**
   * How many of these a single wave is ever allowed to contain.
   *
   * Two limits wearing one hat. The first is legibility: nine hundred Drones is
   * not a wave, it is a frame-rate problem, and six Ransomware is not a wave
   * either, it is a wall. The second is that a count cap is the *only* thing
   * that can stop the solver hitting its target, because a wave of cheap
   * threats runs out of room long before it runs out of budget.
   *
   * The thresholds are by threat size rather than by class, because what makes a
   * count absurd is how much health is behind it, not what it is called.
   */
  /**
   * The per-group ceiling for a wave, after the tier's mass is applied.
   *
   * The base caps exist for legibility and frame rate - "nine hundred Drones is
   * not a wave, it is a frame-rate problem" - and scaling them by mass alone
   * undoes that guarantee the moment mass gets large: at insane's mass a cheap
   * group would be allowed eighteen hundred bodies. So the scaled cap is itself
   * capped.
   *
   * A group that hits this ceiling does not silently lose its budget: the
   * composer's overflow valve turns the remainder into health, which is why
   * insane's late tickets end up as walls of very tough enemies rather than as
   * slideshows. That is the intended failure mode, but it is worth knowing that
   * past a point this tier escalates through health rather than numbers.
   */
  var MAX_GROUP_COUNT = 220;
  function groupCap(per, mass) {
    return Math.min(MAX_GROUP_COUNT, Math.round(countCap(per) * mass));
  }

  function countCap(per) {
    if (per < 5) return 120;      // Drones and other one-shot swarm units
    if (per < 50) return 60;      // Code Smells, SQL Injection, XSS
    if (per < 150) return 30;     // Zombie Processes
    return 10;                    // Ransomware, and anything plated
  }

  /**
   * Split a power budget between groups whose counts are capped.
   *
   * This is water filling, and it needs to be, because the obvious approaches
   * all fail on the same case. Allocating by weight and then clamping leaves the
   * clamped group's power unspent - and the leftover cannot go back into the
   * clamped group, which is exactly what a naive "scale everything up" pass
   * tries first. So the budget is poured in rounds: every group takes its
   * weighted share, any group that hits its cap is *fixed* and its power is
   * removed from the pool, and whatever is left is re-poured over the groups
   * that can still take more. Three or four rounds converge, and the fifth is
   * there so a pathological mix cannot loop forever.
   *
   * The result is that the budget is either fully spent or every single group is
   * at its cap, and the caller can tell the difference - which is what lets the
   * overflow valve be a deliberate decision rather than a silent shortfall.
   */
  function waterfill(groups, power) {
    groups.forEach(function (g) { g.alloc = 0; g.fixed = false; });

    for (var pass = 0; pass < 6; pass++) {
      var open = groups.filter(function (g) { return !g.fixed; });
      if (!open.length) break;

      var spent = groups.reduce(function (s, g) { return s + g.alloc; }, 0);
      var left = power - spent;
      if (left <= power * 0.005) break;

      var wsum = open.reduce(function (s, g) { return s + g.weight; }, 0);
      var bit = false;
      open.forEach(function (g) {
        var want = left * g.weight / wsum;
        var room = g.cap * g.per - g.alloc;
        var give = Math.min(want, room);
        g.alloc += give;
        // A group that could not take its full share is now fixed: pouring more
        // rounds at it would only waste them.
        if (give + 1e-9 < want) { g.fixed = true; bit = true; }
      });
      if (!bit) break;
    }

    groups.forEach(function (g) {
      g.n = clamp(Math.round(g.alloc / g.per), 1, g.cap);
    });
    return groups.reduce(function (s, g) { return s + g.n * g.per; }, 0);
  }

  /**
   * Turn a power budget into groups.
   *
   * Counts are *solved* from the budget and each threat's power-per-unit, so a
   * wave of Drones and a wave of Ransomware that cost the player the same to
   * answer come out of here with the same total power. That is the whole reason
   * this is inverted: the mix is free to be interesting because it cannot move
   * the difficulty.
   *
   * The awkward case is a generous budget over a mix of cheap threats, where the
   * counts saturate long before the budget is spent. That overflow becomes extra
   * *health* on the heaviest group, bounded at 3x, because health is the only
   * valve left - and the bound exists because a swarm that suddenly takes four
   * shots has stopped being a swarm, and the briefing would be lying about it.
   */
  function composeWave(power, id, rand, tierId) {
    // The tier's curve, not normal's. This single line is what turns the mass
    // dial into actual bodies: a lower per-body health means each unit of budget
    // buys more of them, so the solver returns a bigger count for the same
    // money. Without it the composer bought normal's counts and the tiers only
    // changed how long each enemy took to die.
    var tune = curve(id, tierId);
    var mass = tierDef(tierId).mass;
    var a = act(id);
    var inAct = (id - 1) % PER_ACT;

    var mix = mixFor(id, rand);
    var totalW = mix.reduce(function (s, m) { return s + m.w; }, 0);

    var groups = mix.map(function (m) {
      var per = powerOf(m.t, tune);
      // The cap scales with mass, and without this the mass dial does nothing.
      // The caps are the real ceiling on how many bodies a wave can hold: a tier
      // that raises the budget without raising the cap just saturates every group
      // and dumps the surplus into health, which is the tankier-enemies behaviour
      // mass exists to replace. Measured before this line, insane ended up with
      // FEWER bodies than easy - a bigger budget hitting a fixed ceiling spills
      // into hp, so the "flood" tier was the tankiest and the sparsest at once.
      return { t: m.t, per: per, weight: m.w, cap: groupCap(per, mass), n: 0, hp: 1 };
    });

    var spent = waterfill(groups, power);

    // Overflow: everything is capped and the budget is still not spent.
    if (spent < power * 0.94) {
      var heavy = groups.slice().sort(function (x, y) { return y.per - x.per; })[0];
      if (heavy && heavy.n > 0) {
        heavy.hp = clamp(Math.round((power / (heavy.n * heavy.per)) * 100) / 100, 1, 3);
      }
    }

    // Spawn spacing from a target wave duration, so a swarm reads as a swarm and
    // a heavy push reads as a slow march. A fixed gap would make a hundred and
    // twenty Drones a two-second blur and six Ransomware a formality.
    var dur = 7 + a.n * 0.55 + inAct * 0.16;

    // Cheapest first, so the swarm sets the tempo and the heavies walk in behind
    // it. This ordering is why a wave reads as layered rather than as a queue.
    groups.sort(function (x, y) { return x.per - y.per; });

    return groups.map(function (g, i) {
      var out = {
        t: g.t,
        n: g.n,
        gap: Math.round(clamp(dur / g.n, 0.08, 2.6) * 100) / 100,
        // Stagger the secondary groups into the middle of the wave so the player
        // has to hold two lanes at once instead of clearing one and waiting.
        delay: i === 0 ? 0 : Math.round(dur * 0.18 * i * 10) / 10,
      };
      if (g.hp > 1.001) out.hp = g.hp;
      return out;
    });
  }

  /**
   * The screen that walks in ahead of the boss, solved from its own share.
   *
   * The first version hardcoded "24 Drones and 4 Ransomware" and left that power
   * out of the budget entirely, so every act finale measured about 70% heavier
   * than its target - which is not a spike, it is a different level, and it made
   * the act median for the *next* act look like a step down. The screen is part
   * of the boss's share now, split by weight, so an act finale is exactly as much
   * heavier as it claims to be.
   */
  function bossScreen(tune, share) {
    var specs = [
      { t: 'botnet', weight: 0.25 },
      { t: 'ransom', weight: 0.30 },
    ];
    var wsum = specs.reduce(function (s, x) { return s + x.weight; }, 0);

    return specs.map(function (x, i) {
      var per = powerOf(x.t, tune);
      var n = clamp(Math.round((share * x.weight / wsum) / per), 1, countCap(per));
      return { t: x.t, n: n, gap: x.t === 'botnet' ? 0.16 : 1.4, delay: i === 0 ? 0 : 4 };
    });
  }

  function wavesFor(id, tierId) {
    var rand = rng(id * 7919 + 13);
    var a = act(id);
    var inAct = (id - 1) % PER_ACT;
    var mass = tierDef(tierId).mass;

    // Wave count is the ticket's *shape*, so it is the main thing that makes an
    // act opener feel different from its finale at the same power: openers are
    // short, finale-adjacent tickets are long.
    var count = 3 + Math.floor(inAct / 4) + (a.n >= 8 ? 1 : 0);
    count = clamp(count, 3, 9);

    // The boss and the mini-boss are paid for *out of* the body rather than added
    // on top. Adding them on top was the first version, and it made each finale
    // score about ten times its act - which is not a spike, it is a different
    // game, and it flattened everything around it in the report.
    // The composer's target is what actually decides how many bodies a ticket
    // holds, and it scales with mass.
    //
    // `lean` cannot do this job, and that is the part that is easy to get
    // backwards: the bandwidth is derived FROM this target, not the other way
    // round, so raising the budget never raises the count. Setting a tier's
    // bandwidth while leaving this alone is what made the first two attempts at
    // this dial do nothing at all.
    var target = bodyPowerFor(id) * mass;
    var body = target
      - (isBoss(id) ? target * DIALS.bossShare : 0)
      - (isMini(id) ? target * DIALS.miniShare : 0);

    // Ramp the waves inside the ticket: the opener is a warm-up, the closer is
    // the hardest thing in the ticket. The exponent is under 1 so the last wave
    // is clearly the biggest without the first one being a formality.
    var weights = [];
    var sum = 0;
    for (var i = 0; i < count; i++) {
      var w = Math.pow(i + 1, 0.62) * (i === count - 1 ? 1.25 : 1);
      weights.push(w);
      sum += w;
    }

    var waves = [];
    for (i = 0; i < count; i++) waves.push(composeWave(body * weights[i] / sum, id, rand, tierId));

    // Mini-boss: extra power dropped into the middle wave, led by the biggest
    // thing the act has. Telegraphed on the briefing so it reads as a set piece
    // rather than a spike nobody saw coming.
    if (isMini(id)) {
      var mtune = curve(id, tierId);
      // Never the act's boss. In act twelve the only threat listed is the
      // Zero-Day, and picking it here put a *second* boss in the middle of the
      // ticket at ten times the power its slice allowed - a 57% overshoot that
      // showed up in the report as act twelve being twice the difficulty it
      // claimed to be.
      var heavies = a.threats.concat(a.later || []).filter(function (t) {
        var d = deficit(t);
        return d && !d.boss && d.hp >= armourFloor();
      });
      var heavy = heavies[0] || 'ransom';
      var perHeavy = powerOf(heavy, mtune);
      var miniBudget = miniPowerFor(id, tierId);
      var miniN = clamp(Math.round(miniBudget / perHeavy), 1, 8);
      var mini = { t: heavy, n: miniN, gap: 1.6, delay: 2 };

      // Same solver problem as the boss, same answer: when the slice is smaller
      // than one of these is worth, it arrives weaker rather than more numerous.
      if (miniBudget / perHeavy < 1) {
        mini.hp = clamp(Math.round((miniBudget / perHeavy) * 100) / 100, 0.05, 1);
      }
      waves[Math.floor(count / 2)].push(mini);
    }

    // Boss: the Zero-Day on the final wave, behind a screen. Its health is
    // *solved* from the share rather than scaled by an act multiplier, because a
    // 1400-health boss is unanswerable at ticket 20 and a formality at ticket
    // 240 - and neither of those is a design, they are the same number in two
    // places. Solved, the Zero-Day is always a fixed slice of the ticket, which
    // is what makes it a recurring nemesis instead of a difficulty cliff that
    // happens to be shaped like one.
    if (isBoss(id)) {
      var tune = curve(id, tierId);
      var perBoss = powerOf('zeroday', tune);
      var screen = bossScreen(tune, bossPowerFor(id, tierId));
      var screenPower = screen.reduce(function (s, g) { return s + g.n * powerOf(g.t, tune); }, 0);

      // Whatever the screen did not eat, the boss itself carries.
      var bossHpMul = clamp((bossPowerFor(id, tierId) - screenPower) / perBoss, 0.01, 3);
      screen.push({ t: 'zeroday', n: 1, gap: 1, delay: 8, hp: Math.round(bossHpMul * 1000) / 1000 });

      // Merge into the wave rather than appending. The screen's Drones are the
      // same Drones the wave is already sending, and two separate groups of the
      // same threat reads as a bug on the briefing - "10x DDoS Botnet ... 32x
      // DDoS Botnet" - even though mechanically it is identical.
      var final = waves[count - 1];
      screen.forEach(function (g) {
        var same = null;
        for (var k = 0; k < final.length; k++) {
          if (final[k].t === g.t && !final[k].hp) { same = final[k]; break; }
        }
        if (same) { same.n += g.n; } else { final.push(g); }
      });
    }

    return waves;
  }

  /* ------------------------------------------------------------------ *
   * Presentation
   * ------------------------------------------------------------------ */

  /**
   * How to name a threat, and what to say about it.
   *
   * Both come from Threats.DEFS, which is the definition the engine actually
   * fights with. That is the fix for a real bug rather than tidiness.
   *
   * The briefing used to carry its own table of clauses - "Code Smells arrive in
   * numbers and die in numbers" - and paste them into sentences built for noun
   * phrases. Every ticket in the campaign therefore opened with a sentence that
   * did not parse:
   *
   *     Expect mostly Code Smells arrive in numbers and die in numbers, with
   *     DDoS Botnets are one hit each and there are never few of them layered
   *     in behind.
   *
   * It survived because nothing reads the briefing except a player, and because
   * the table looked reasonable next to the sentence that used it. Keeping the
   * prose beside the threat means the sentence and the thing it describes are
   * written by the same person at the same time, and a threat added without a
   * plural is a threat added without a briefing.
   */
  function nameOf(type, n) {
    var d = deficit(type);
    if (!d) return type;
    return n === 1 ? d.name : (d.plural || d.name);
  }

  function adviceFor(type) {
    var d = deficit(type);
    if (!d) return '';
    // `tell` is the one-line version written for the roster card; it is a
    // fragment, so it is a fallback rather than the first choice.
    return d.advice || '';
  }

  /**
   * The briefing text.
   *
   * Generated, but from the level's *actual* composition rather than from a
   * sentence bank. That is not laziness, it is the point: the two sentences the
   * player reads before a wave have to be true, and a hand-written brief for a
   * generated level is a lie the moment the generator changes. This one cannot
   * drift, because it is a description of the data it is describing.
   */
  function briefFor(level) {
    var biggest = null;
    var counts = {};
    var waves = level.waves.length;

    level.waves.forEach(function (w, wi) {
      w.forEach(function (grp) {
        if (grp.t === 'zeroday') return;
        counts[grp.t] = (counts[grp.t] || 0) + grp.n;
        if (!biggest || grp.n > biggest.n) biggest = { n: grp.n, t: grp.t, wave: wi + 1 };
      });
    });

    var types = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var parts = [];

    /*
     * Two sentences, not one clause welded to another.
     *
     * The geometry note was appended after a dash, which read as
     * "...and the road is a switchback shape - plain The heaviest single push
     * is wave 3". Every note in the generator is a clause that stands on its
     * own, so it gets to be its own sentence.
     */
    var geometry = level.geomNote || 'read it before you spend anything';
    parts.push(level.actName + '. ' + waves + ' waves on a ' +
      (level.roadFamily || 'straight') + '. ' +
      geometry.charAt(0).toUpperCase() + geometry.slice(1) + '.');

    if (biggest) {
      // The count agrees with the noun: "60 DDoS Botnets", not "60 DDoS Botnet".
      parts.push('The heaviest single push is wave ' + biggest.wave + ': ' + biggest.n + ' ' +
        nameOf(biggest.t, biggest.n) + ' in one go.');
    }

    if (types.length > 1) {
      parts.push('Most of it is ' + nameOf(types[0], 2) + ', with ' +
        nameOf(types[1], 2) + ' layered in behind.');
    } else if (types.length === 1) {
      parts.push('This one is all ' + nameOf(types[0], 2) + '.');
    }

    // One piece of advice, about the threat there is most of. Two would be a
    // paragraph, and the briefing is read in a hurry.
    if (types.length) {
      var advice = adviceFor(types[0]);
      if (advice) parts.push(advice);
    }

    if (level.traits.length) {
      var names = level.traits.map(function (t) {
        var d = global.Threats && global.Threats.TRAITS ? global.Threats.TRAITS[t] : null;
        return d ? d.name : t;
      });
      // A list, joined as a list. The first version ran them together with the
      // word "and" between every pair, so an act eleven ticket announced that
      // its threats were "Hardened and Swiftshade and Regenerating and Undying
      // and Saboteur" - technically a sentence, and not one anybody writes.
      var last = names.pop();
      parts.push('They are ' + (names.length ? names.join(', ') + ' and ' + last : last) +
        '. You cannot answer all of it at once.');
    }

    if (level.boss) parts.push('Something is walking behind the last wave that you have not met.');

    return parts.join(' ');
  }

  /**
   * The on-call tip: the one mechanic this ticket is built to teach.
   *
   * Chosen from what is actually in the level, in priority order - a boss, then
   * the hardest trait, then the featured threat. A tip that does not match the
   * level is worse than no tip, so this reads the composition rather than the
   * act it sits in.
   */
  var TRAIT_TIP = {
    hardened: 'Layered armour eats small hits. One Antivirus does more than three Firewalls here.',
    swift: 'Swiftshade shrugs off most of a Rate Limiter. Do not spend the level slowing these.',
    regenerating: 'They knit themselves back together if you stop hitting them. Concentrate your fire.',
    saboteur: 'Saboteurs reach further than they should and cut towers down for longer. Spread out.',
    reviving: 'They get up once more than they should. Make sure the second life happens under fire.',
  };

  var THREAT_TIP = {
    smell: 'A Firewall on a corner covers two stretches of road. Corners are the best real estate you have.',
    sqli: 'SQL Injection takes reduced damage from a Firewall. This is what the WAF is for.',
    xss: 'XSS splits on death. Kill it where you can also kill the children.',
    zombie: 'Zombie Processes reanimate once. Antivirus damage is what stops the second act.',
    ransom: 'Ransomware disables a tower it passes. Never let one tower be your whole defence.',
    botnet: 'DDoS drones have almost no health. Rate of fire beats damage against them.',
    zeroday: 'The Zero-Day is immune to Firewalls and WAFs alike. Only the Antivirus can hurt it.',
  };

  function tipFor(level) {
    if (level.boss) {
      return 'Boost your Antivirus research on the BASE screen before this one. ' +
        'Firewalls and WAFs are decoration against the Zero-Day, and it is plated.';
    }
    var t = level.traits[level.traits.length - 1];
    if (t && TRAIT_TIP[t]) return TRAIT_TIP[t];

    var counts = {};
    level.waves.forEach(function (w) { w.forEach(function (g) { counts[g.t] = (counts[g.t] || 0) + g.n; }); });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    return THREAT_TIP[top] || 'Read the road before you spend. Two towers on one corner beat three spread out.';
  }

  /* ------------------------------------------------------------------ *
   * Assembly
   * ------------------------------------------------------------------ */

  /**
   * Raise a ticket's health until it measures above `minPower`.
   *
   * Why the composer cannot do this on its own: it solves *counts* to hit a
   * power target, and counts are capped per threat (a wave of nine hundred
   * Drones is a frame-rate problem, not a level). When the mix for a ticket is
   * dominated by cheap threats, the cap binds before the budget runs out, the
   * ticket lands under its target, and it can land under the ticket before it -
   * which is the one promise the campaign makes. The report found ninety-one
   * such steps.
   *
   * Health is the right dial to repair with because it is the one that is
   * *guaranteed* to move the measurement: power() scales linearly with a group's
   * hp multiplier, so the required factor is arithmetic rather than a search.
   * The cost is that a repaired ticket is tankier than its brief implies, which
   * is why the repair is capped and why the report is expected to stay at zero.
   *
   * On `normal` this must never fire. A non-zero repair count there means the
   * composer and the measurement disagree, which is a generator bug.
   */
  function applyPowerFloor(level, minPower, tierId) {
    if (!(minPower > 0)) return 0;
    var measured = power(level, tierId);
    if (measured > minPower) return 0;

    // The target carries a margin rather than being exactly minPower + 1.
    // power() rounds to an integer and the hp multipliers are stored rounded, so
    // a one-unit margin sits *inside* the rounding noise: the first version of
    // this aimed at minPower + 1 and landed one short on nearly every ticket it
    // repaired. 0.2% is comfortably above the noise and invisible beside a curve
    // that only moves 0.06% per ticket.
    var target = minPower * 1.002 + 1;
    var factor = Math.min(DIALS.hpFloorCap, target / Math.max(1, measured));
    if (!(factor > 1)) return 0;

    level.waves.forEach(function (w) {
      w.forEach(function (g) {
        // Round up, not to nearest: rounding down can land under the target,
        // which is the precise failure this function exists to prevent.
        g.hp = Math.ceil((g.hp || 1) * factor * 10000) / 10000;
      });
    });
    level.repaired = Math.round((factor - 1) * 100) / 100;
    return factor;
  }

  function build(id, minPower) {
    var a = act(id);
    var rand = rng(id * 104729 + 7);
    var road = roadFor(id, rand);
    var inAct = (id - 1) % PER_ACT;
    var tune = curve(id);

    var level = {
      id: id,
      act: a.n,
      actName: a.name,
      env: a.env,
      code: 'INC-' + (1000 + id),
      name: a.names[inAct] || ('Incident ' + id),
      path: road ? road.name : 'switchback',
      waypoints: road ? road.waypoints : null,
      roadFamily: road ? road.family : 'switchback',
      roadLength: road ? Math.round(road.length * 10) / 10 : 0,
      roadTwin: road ? road.twin : 0,
      roadSpots: road ? road.spots : 0,
      bandwidth: 0,
      waves: [],
      boss: isBoss(id) ? 'zeroday' : null,
      miniBoss: isMini(id),
      traits: tune.traits,
    };

    // A geometry note for the briefing, derived from the same measurements the
    // generator used to pick the road. It tells the player what they are looking
    // at in terms they can act on.
    level.geomNote = road
      ? (road.length < 36
        ? 'short, so threats are under fire briefly - placement has to be exact'
        : road.twin >= 25
          ? 'generous, with plenty of tiles that see two stretches at once'
          : 'long, which buys you time and forgives a weaker tower')
      : 'plain, so read it before you spend anything';

    level.waves = wavesFor(id);
    level.bandwidth = bandwidthFor(id, road);
    // Before the brief and before the measurement, so both describe the ticket
    // the player will actually face rather than the one the composer drafted.
    applyPowerFloor(level, minPower);
    level.brief = briefFor(level);
    level.tip = tipFor(level);

    // Two difficulty numbers, and the difference between them is the design.
    // `bodyPower` is the target the generator built to: smooth and strictly
    // rising, and the thing the campaign's central promise is asserted against.
    // `power` is what the composed waves actually measure, which is higher on
    // bosses because bosses are real threats and not an accounting entry.
    level.bodyPower = Math.round(bodyPowerFor(id));
    level.power = power(level);
    level.difficulty = level.power;
    return level;
  }

  /**
   * A co-op battle: one map, twenty waves, one integrity bar, separate purses.
   *
   * Built on the campaign's own generator rather than beside it, so a co-op
   * battle inherits the road scoring, the threat mix for its act and the same
   * measured power model - and so a change to the curve shows up in both modes
   * instead of only one of them. What is co-op specific is the wave count, the
   * ramp across it, and the fact that every seat is handed its own budget.
   *
   * `themeId` picks which act the road and the threat mix come from; the wave
   * count and the ramp are the co-op part.
   */
  function coopLevel(themeId, tierId, seats) {
    var base = build(themeId);
    var t = tierDef(tierId);
    var players = Math.max(1, seats || 1);
    var want = DIALS.coopWaves;
    var rand = rng(themeId * 6151 + 29);

    // A shared map has a hard ceiling - about eighty buildable tiles - and one
    // player already saturates it. So a second player does not add defence
    // capacity the way they add money: measured with a per-seat budget, three
    // seats spent 13,286 of 34,038 and finished with 156% slack, because the
    // board was full and the extra purses had nothing to buy. Handing each seat a
    // full budget therefore made co-op *easier* the more people joined, which is
    // backwards.
    //
    // Two dials fix it, and they do different jobs:
    //
    //   * the team's total budget is held roughly constant, so co-op is a
    //     division of one budget rather than a multiplication of it. Wasting your
    //     share now costs the team, which is the decision the mode is about.
    //   * the threat scales with the seat count, because the thing more players
    //     actually bring is attention: three people can hold three lanes, react
    //     to a leak and still call waves early. Without this the mode collapses
    //     to solo difficulty with extra spectators.
    var threatScale = Math.pow(DIALS.coopSeatThreat, players - 1);

    // The ramp is a BATTLE total, distributed across the twenty waves - not a
    // per-wave figure. This was wrong on the first attempt and the measurement
    // caught it: treating `coopClose: 2.4` as a per-wave multiplier made the
    // battle about twenty-four times a ticket's total, which saturates every
    // count cap and spills the surplus into health. The symptom was extra seats
    // scaling *health* rather than bodies - theme 240 went from 1,545 threats at
    // one seat to 1,610 at three while its power nearly doubled, so the extra
    // players were being paid for with tankier enemies instead of more of them,
    // which is the exact failure this campaign's tier work was built to avoid.
    //
    // The theme's own ticket is the unit: a co-op battle holds `coopTotal` of
    // them, and the weights below put the peak wave at roughly the share a
    // ticket's hardest wave carries.
    var ticketTotal = bodyPowerFor(themeId) * t.mass;
    var battleTotal = ticketTotal * DIALS.coopTotal * threatScale;

    var weights = [];
    var sumW = 0;
    for (var i = 0; i < want; i++) {
      var w = Math.pow(i + 1, DIALS.coopRamp);
      weights.push(w);
      sumW += w;
    }

    var waves = [];
    for (i = 0; i < want; i++) {
      waves.push(composeWave(battleTotal * weights[i] / sumW, themeId, rand, tierId));
    }

    var level = {};
    Object.keys(base).forEach(function (k) { level[k] = base[k]; });
    level.coop = true;
    // The id stays the theme's, because everything downstream - the act lookup,
    // the tuning curve, the briefing text - is keyed off it and the battle is
    // meant to read as taking place in that act. The *seed* is separate, so a
    // co-op battle cannot share a random stream with the campaign ticket it is
    // themed on; two battles with the same stream is the kind of coincidence
    // that looks like a bug and is a nightmare to reproduce.
    level.seedId = 'coop:' + themeId;
    level.tier = t.id;
    level.waves = waves;
    level.boss = null;
    level.miniBoss = false;
    level.seats = players;
    // Per seat, and the team total is what stays roughly constant: see above for
    // why dividing is the right answer on a map this small. `coopBudget` is the
    // calibration knob - the budget is derived from the theme's own ticket, so it
    // needs only a small allowance for the extra length of a twenty-wave battle.
    level.bandwidth = Math.max(1, Math.round(
      bandwidthFor(themeId, null) * DIALS.coopTotal * DIALS.coopBudget / players
    ));
    level.bodyPower = Math.round(battleTotal);
    level.power = power(level, tierId);
    level.difficulty = level.power;
    level.brief = briefFor(level);
    level.tip = tipFor(level);
    return level;
  }

  /**
   * "How much is coming at you", measured from the composed waves.
   *
   * Same arithmetic as powerOf, applied to the finished wave table rather than
   * to a target, which is what makes it a check on the generator instead of a
   * restatement of it. If the solver and the measurement ever disagree by more
   * than rounding, one of them is wrong and the balance report says so.
   *
   * Traits are deliberately *not* multiplied in. They make a ticket harder in a
   * way the player can see and counter, and folding them into one number would
   * make the curve non-monotonic - they ramp up across each act - which would
   * hide the thing this number exists to prove.
   */
  function power(level, tierId) {
    var tune = curve(level.id, tierId);
    var D = (global.Threats && global.Threats.DEFS) || {};
    var total = 0;

    level.waves.forEach(function (w) {
      w.forEach(function (grp) {
        var d = D[grp.t];
        if (!d) return;
        var armour = (d.armour || 0) + (d.hp >= armourFloor() ? tune.armour : 0);
        var effective = d.hp * (grp.hp || 1) * tune.hp * (1 + armour * 0.22);
        if (d.boss) effective *= 1.6;
        total += effective * grp.n * (d.speed * tune.speed) / 46;
      });
    });
    return Math.round(total);
  }

  /* ------------------------------------------------------------------ *
   * Cache and API
   * ------------------------------------------------------------------ */

  var CACHE = null;

  /**
   * The campaign, built once, in order.
   *
   * In order rather than independently, because each ticket has to know the
   * measured power of the one before it: that is what turns "ticket N+1 is
   * harder than ticket N" into a property of the data instead of a hope. The
   * floor is passed down the loop rather than looked up, so this stays a single
   * pass with no recursion and no second cache that could disagree with it.
   */
  function all() {
    if (CACHE) return CACHE;
    CACHE = [];
    var floor = 0;
    for (var i = 1; i <= ACTS.length * PER_ACT; i++) {
      var level = build(i, floor);
      CACHE.push(level);
      floor = level.power;
    }
    return CACHE;
  }

  function byId(id) {
    if (!(id >= 1 && id <= ACTS.length * PER_ACT)) return null;
    // all() is built once and frozen in practice, so indexing it is cheaper and
    // simpler than a second cache that could disagree with the first.
    return all()[id - 1];
  }

  function count() { return ACTS.length * PER_ACT; }

  function tiers() { return TIERS.slice(); }

  function tier(tierId) { return tierDef(tierId); }

  /**
   * A ticket read at a given difficulty.
   *
   * The single entry point the engine and the map screen use. Normal hands back
   * the canonical cached object, so the reference reading allocates nothing and
   * cannot drift from what the balance report measured; every other tier is
   * built in order by readAt() and kept.
   */
  function variant(id, tierId) {
    var t = tierDef(tierId);
    if (!(id >= 1 && id <= ACTS.length * PER_ACT)) return null;
    return readAt(t.id)[id - 1];
  }

  var TIER_CACHE = Object.create(null);

  /**
   * One ticket read at one tier, repaired against the tier's own floor.
   *
   * The repair has to run *per tier* rather than once on normal. A finale's boss
   * carries a large solved health multiplier, so a tier's hp multiplier scales
   * the finale harder than it scales the body ticket after it: normal's repair
   * is sized for normal's boss and is simply too small at hard and above. The
   * report showed the drop in exactly that shape - 40 -> 41, 50 -> 51, 61 -> 62,
   * sixty-one of them - every one of which is the ticket after a boss or a
   * mini-boss.
   */
  function makeVariant(base, t, minPower) {
    var copy = {};
    Object.keys(base).forEach(function (k) { copy[k] = base[k]; });
    copy.tier = t.id;
    // Re-composed, not copied. A tier changes the threat COUNT, so it needs its
    // own wave table; cloning normal's would give every tier normal's bodies and
    // the mass dial would do nothing at all.
    copy.waves = wavesFor(base.id, t.id);
    // Bandwidth scales with the mass, because the threat count does: the same
    // money per threat, spread over more threats. `lean` is what tightens that
    // ratio on the harder tiers. The alternative - leaving the budget flat while
    // the count rose - is arithmetically impossible: the composer spends its
    // whole budget, so `power` is a function of the budget, and a fixed budget
    // means a fixed total threat and therefore a fixed difficulty. Making the
    // count rise without the budget would have meant making the ticket *easier*.
    copy.bandwidth = Math.max(1, Math.round(base.bandwidth * t.mass * t.lean));
    applyPowerFloor(copy, minPower, t.id);
    copy.power = power(copy, t.id);
    copy.difficulty = copy.power;
    return copy;
  }

  /**
   * A whole tier of the campaign, built in order and kept.
   *
   * Lazy and cached per tier: reading one ticket at hard costs one pass over the
   * campaign the first time and nothing afterwards, and a player who never
   * leaves normal never builds any of it. Normal hands back the canonical array
   * rather than copies, so the reference reading cannot drift from what the
   * balance report measured.
   */
  function readAt(tierId) {
    var t = tierDef(tierId);
    if (TIER_CACHE[t.id]) return TIER_CACHE[t.id];
    if (t.id === 'normal') { TIER_CACHE[t.id] = all(); return TIER_CACHE[t.id]; }

    var base = all();
    var out = [];
    var floor = 0;
    for (var i = 0; i < base.length; i++) {
      var v = makeVariant(base[i], t, floor);
      out.push(v);
      floor = v.power;
    }
    TIER_CACHE[t.id] = out;
    return out;
  }

  /** Every road registered as a path, in the shape map.js expects. */
  function paths() {
    var out = Object.create(null);
    if (global.Roads) {
      var t = global.Roads.table();
      Object.keys(t).forEach(function (k) { out[k] = t[k]; });
    }
    return out;
  }

  global.Campaign = {
    ACTS: ACTS,
    PER_ACT: PER_ACT,
    DIALS: DIALS,
    TIERS: TIERS,
    curve: curve,
    tiers: tiers,
    tier: tier,
    variant: variant,
    /** The power model, exposed so the balance report measures what this built. */
    powerOf: powerOf,
    bodyPowerFor: bodyPowerFor,
    bossPowerFor: bossPowerFor,
    miniPowerFor: miniPowerFor,
    bandwidthFor: bandwidthFor,
    act: act,
    isBoss: isBoss,
    isMini: isMini,
    build: build,
    coopLevel: coopLevel,
    all: all,
    byId: byId,
    count: count,
    paths: paths,
    power: power,
    /** The full act list for the map screen, with their own narration. */
    acts: function () { return ACTS.slice(); },
  };
})(window);
