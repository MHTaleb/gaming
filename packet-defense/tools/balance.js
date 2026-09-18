/**
 * balance.js - play the whole campaign, in about twenty seconds, without a screen.
 *
 * WHY THIS EXISTS
 *
 * Two hundred and forty tickets is far past the point where "I played a few and
 * they felt fine" is a real answer. A generated campaign has three failure modes
 * that are invisible from the outside and obvious from the numbers:
 *
 *   - an act that is quietly impossible, because one dial moved and the budget
 *     did not move with it;
 *   - an act that is quietly trivial, for the same reason in reverse;
 *   - a curve that is monotonic in the data and flat in the hand, because the
 *     thing being scaled is not the thing the player feels.
 *
 * So this runs the real engine - the same engine.js the phone runs, loaded into a
 * VM with no canvas - with a bot on the towers. The bot plays the way a careful
 * player does and nothing cleverer:
 *
 *   - it reads the next wave (a player reads the briefing) and buys the tower
 *     that answers it;
 *   - it builds on the tile that covers the most road, preferring tiles that see
 *     two separate stretches, because that is the skill the game teaches;
 *   - it never calls a wave early, which means it forgoes the early bonus and
 *     the extra income that comes with it. That is on purpose: the bot is a
 *     *lower bound*. If the bot clears a ticket, a player who spends better can.
 *
 * WHAT IT REPORTS
 *
 * Per act: clears, average uptime, average leftover bandwidth, and the hardest
 * ticket. Plus the two invariants that must hold for the campaign to be a
 * campaign - difficulty rising with every ticket, and no ticket unwinnable.
 *
 *   node tools/balance.js                summary + per-act table
 *   node tools/balance.js --levels 55-70 one act, ticket by ticket
 *   node tools/balance.js --level 240    one ticket, wave by wave
 *   node tools/balance.js --json         machine-readable, for diffing a change
 *   node tools/balance.js --check        exit non-zero if an invariant fails
 *   node tools/balance.js --tier insane  play a difficulty tier (default normal)
 *   node tools/balance.js --minimal --levels 1-40 --tier insane
 *                                        smallest winning tower count per ticket,
 *                                        and what that set cost against the budget
 *
 * Every tier must clear with the bot, or it is not a difficulty, it is a wall.
 * Run each of the five before shipping a change to the curve.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'www', 'js');

/**
 * Boot the game's modules in a VM with no DOM.
 *
 * The list is deliberately the *whole* real load order rather than a
 * hand-picked subset, because the failure this guards against is a module that
 * works in the browser and throws headlessly - a hand-picked subset would hide
 * exactly that.
 *
 * `document` and `addEventListener` are absent on purpose. Anything in the game
 * that reaches for them outside of mount() is a bug in the game, and it should
 * break here rather than be papered over with a stub.
 */
function loadGame() {
  const sandbox = {
    window: {},
    console,
    // progress.js catches this being missing and keeps its save in memory.
    localStorage: undefined,
  };
  sandbox.window.localStorage = undefined;
  vm.createContext(sandbox);

  const order = [
    'config.js', 'storage.js', 'audio.js', 'tracks.js', 'music.js', 'ads.js',
    'purchases.js', 'progress.js', 'base.js', 'map.js', 'threats.js', 'towers.js',
    'roads.js', 'campaign.js', 'levels.js', 'engine.js',
  ];

  for (const file of order) {
    const src = fs.readFileSync(path.join(JS, file), 'utf8');
    try {
      vm.runInContext(src, sandbox, { filename: file });
    } catch (err) {
      throw new Error('failed to load ' + file + ': ' + err.message);
    }
  }
  return sandbox.window;
}

/* ------------------------------------------------------------------ *
 * Road geometry, for the bot's placement decisions
 * ------------------------------------------------------------------ */

/**
 * Sample the road as a polyline with an arc length on every sample.
 *
 * The arc length is the important part. "Two stretches of road" means two
 * stretches *far apart along the route*, not two points that happen to be near
 * each other in space - a road that crosses itself is exactly the case the whole
 * game is built on, and a distance-only measure cannot tell a crossing from a
 * doubling back.
 *
 * EVERYTHING HERE IS IN WORLD UNITS, converted through the map's own
 * `tileToWorld`. That is not a detail: an earlier version sampled in *tile*
 * space (0..14) and compared against tower positions in world space (0..560),
 * so with a range of 96 world units every tower appeared to cover the entire
 * road if it stood near the origin and nothing at all if it did not. The bot
 * then built exactly two towers, in the top-left corner, on every ticket in the
 * campaign - which is why this file reported a campaign that was 68% unwinnable.
 * The measurement was broken, not the campaign. Never compare two coordinate
 * spaces; convert, and convert through the same function the game uses.
 */
function roadSamples(waypoints, Map, step = 10) {
  const pts = waypoints.map((p) => Map.tileToWorld(p[0], p[1]));
  const out = [];
  let arc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      out.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n), arc });
      arc += len / n;
    }
  }
  out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, arc });
  return out;
}

/**
 * How good a build spot is: road length in range, boosted by how many separate
 * stretches it covers.
 *
 * The boost is the point. A tower that covers 30 tiles of one long straight run
 * is a worse buy than one that covers 20 tiles spread over three separate passes,
 * because the second one is working for three times as long per threat - which is
 * the single most valuable thing a tower defence player learns.
 *
 * Distances are world units. `apart` is therefore 80, i.e. two tiles: two samples
 * closer together than that along the route are the same stretch of road, and
 * anything further apart is the tower covering the road twice.
 */
function coverage(cx, cy, range, samples, apart = 80) {
  let length = 0;
  const arcs = [];
  for (const s of samples) {
    const dx = s.x - cx;
    const dy = s.y - cy;
    if (dx * dx + dy * dy > range * range) continue;
    length++;
    arcs.push(s.arc);
  }
  if (!length) return 0;

  arcs.sort((a, b) => a - b);
  let groups = 1;
  for (let i = 1; i < arcs.length; i++) if (arcs[i] - arcs[i - 1] > apart) groups++;
  return length * (1 + 0.5 * (groups - 1));
}

/* ------------------------------------------------------------------ *
 * The bot
 * ------------------------------------------------------------------ */

/**
 * Pick the tower that answers what is coming.
 *
 * Two things make this more than a lookup. The first is that it is scored rather
 * than chosen - value per bandwidth, against the class mix of the next couple of
 * waves - because that is the arithmetic a player does on the briefing screen,
 * and a bot that picks a different tower than a thoughtful human is measuring the
 * bot.
 *
 * The second is the boss, and it is the reason this function takes the whole
 * level rather than one wave. Firewalls and WAFs *cannot damage* the Zero-Day -
 * not reduced damage, none - and it costs the entire integrity bar if it lands.
 * So a ticket with a boss on it is not a ticket about the trash waves in front of
 * it; it is an Antivirus bill, and the bot has to start paying it early enough to
 * have the towers standing when the thing walks in.
 */
function chooseTower(W, level, waveIndex, affordable) {
  const D = W.Threats.DEFS;
  const T = W.Towers.DEFS;

  // The boss is announced on the briefing, so a player who reads it starts
  // paying the Antivirus bill on wave one.
  //
  // This used to wait until the last four waves, on the theory that three waves
  // is enough warning to afford two more towers. It is not, because by then the
  // budget has already gone on Firewalls for the trash waves: the report showed
  // every one of the twelve finales lost with 108 of 109 kills, the whole
  // integrity bar gone to a single Zero-Day, and ten to forty bandwidth left
  // unspent. The bot now buys its answer first and fills in the cheap towers
  // afterwards, which is what the briefing screen tells the player to do.
  if (level.boss) {
    const avCount = W.Engine.state().towers.filter((t) => t.type === 'av').length;
    if (avCount < 4) return 'av';
  }

  const upcoming = level.waves.slice(waveIndex, waveIndex + 2).flat();
  let needAntivirus = false;
  const mass = { code: 0, injection: 0, malware: 0 };

  for (const grp of upcoming) {
    const d = D[grp.t];
    if (!d) continue;
    if (d.immune && d.immune.indexOf('firewall') !== -1) needAntivirus = true;
    const cls = d.cls || 'code';
    mass[cls] = (mass[cls] || 0) + d.hp * (grp.hp || 1) * grp.n;
  }
  if (needAntivirus) return 'av';

  let total = 0;
  for (const k of Object.keys(mass)) total += mass[k];
  if (total <= 0) return 'firewall';

  let best = null;
  let bestScore = -1;
  for (const id of W.Base.unlockedTypes()) {
    const t = T[id];
    if (!t || t.damage === 0) continue;
    if (affordable && t.cost > affordable) continue;
    const bonus = t.bonus || {};
    // Value per bandwidth: damage per second, scaled by how much of the incoming
    // mix it is good against, over what it costs to put on the map.
    const dps = t.damage / Math.max(0.05, t.rate || 1);
    let fit = 0;
    for (const k of Object.keys(mass)) fit += (mass[k] / total) * (bonus[k] === undefined ? 1 : bonus[k]);
    const score = (dps * fit) / t.cost;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best || 'firewall';
}

/**
 * Play one ticket.
 *
 * The loop is the engine's own: build during the building phase, call the wave,
 * then step at a fixed 1/60 until the ticket resolves. Nothing here is allowed to
 * shortcut the simulation - a bot that teleports threats would report a
 * difficulty the player never meets.
 */
function playTicket(W, id, opts = {}) {
  const Engine = W.Engine;
  const Towers = W.Towers;
  const Map = W.PDMap;
  const tier = opts.tier || 'normal';
  // at() rather than byId(): that is what attaches the difficulty to the level
  // object, which is what the engine's per-wave tuning reads.
  const level = W.Levels.at(id, tier);
  if (!level) return { id, error: 'no such ticket' };

  Engine.start(id, tier);
  const state = Engine.state();
  const samples = roadSamples(level.waypoints || W.Levels.paths()[level.path], Map);
  const REACH = W.Towers.DEFS.firewall.range;

  const dt = 1 / 60;
  const maxSeconds = opts.maxSeconds || 1200;
  // Caps how many towers may stand at once. Upgrades stay allowed: the question
  // a minimal run answers is "how many towers does this ticket need", and a
  // tower you are forbidden to upgrade is a different, easier question.
  const maxTowers = opts.maxTowers || Infinity;
  const atTowerCap = () => state.towers.length >= maxTowers;
  let placed = 0;
  let upgraded = 0;
  const trace = [];

  /** Best (score, tile) that is still empty and legal right now. */
  function bestSpot(type) {
    let best = null;
    for (let c = 0; c < Map.COLS; c++) {
      for (let r = 0; r < Map.ROWS; r++) {
        if (!W.Towers.canPlace(state, c, r, type, Map).ok) continue;
        const w = Map.tileToWorld(c, r);
        const score = coverage(w.x, w.y, REACH, samples);
        if (score <= 0) continue;
        if (!best || score > best.score) best = { c, r, score };
      }
    }
    return best;
  }

  function spend() {
    const upcoming = level.waves.slice(state.waveIndex, state.waveIndex + 2).flat();
    const type = chooseTower(W, level, state.waveIndex, null);
    const def = Towers.DEFS[type];

    // Build while there is road worth covering, then improve what is standing.
    // One action per call, not twelve: this runs every frame now, and a player
    // trickles towers onto the map while a wave is walking rather than emptying
    // their pockets in the first sixtieth of a second.
    const spot = atTowerCap() ? null : bestSpot(type);
    if (spot && W.Towers.canPlace(state, spot.c, spot.r, type, Map).ok) {
      const r = Towers.place(state, spot.c, spot.r, type, Map);
      if (r.ok) { placed++; trace.push('build ' + type + ' ' + spot.c + ',' + spot.r); return 'build'; }
    }

    // Nothing worth building: upgrade the tower that covers the most road.
    let bestTower = null;
    let bestScore = -1;
    for (const tw of state.towers) {
      const cost = Towers.upgradeCost(tw);
      if (cost === null || state.bandwidth < cost) continue;
      const score = coverage(tw.x, tw.y, REACH, samples);
      if (score > bestScore) { bestScore = score; bestTower = tw; }
    }
    if (bestTower) {
      const u = Towers.upgrade(state, bestTower);
      if (u.ok) { upgraded++; trace.push('upgrade ' + bestTower.type + ' ' + bestTower.c + ',' + bestTower.r); return 'upgrade'; }
    }
    return null;
  }

  /** Is there anything left this bot would actually spend money on? */
  function canSpendMore() {
    // With a tower cap in force the only purchase left is an upgrade, so a free
    // tile does not mean there is anything worth doing.
    if (atTowerCap()) {
      for (const tw of state.towers) {
        const cost = Towers.upgradeCost(tw);
        if (cost !== null && state.bandwidth >= cost) return true;
      }
      return false;
    }
    const type = chooseTower(W, level, state.waveIndex, null);
    if (state.bandwidth < Towers.DEFS[type].cost) {
      // Even a discounted upgrade may be affordable when a new tower is not.
      for (const tw of state.towers) {
        const cost = Towers.upgradeCost(tw);
        if (cost !== null && state.bandwidth >= cost) return true;
      }
      return false;
    }
    if (bestSpot(type)) return true;
    for (const tw of state.towers) {
      const cost = Towers.upgradeCost(tw);
      if (cost !== null && state.bandwidth >= cost) return true;
    }
    return false;
  }

  let simSeconds = 0;
  let buildWait = 0;

  while (state.status !== 'won' && state.status !== 'lost' && simSeconds < maxSeconds) {
    // Spend every frame, building phase or not. A player does not stop placing
    // towers because threats are on the road, and - this was a real bug - the
    // earlier version only called spend() during the building phase and then
    // called the next wave on the *same* frame, so it built for one frame per
    // wave and then complained the levels were unwinnable. It finished every
    // ticket with four towers and five hundred unspent.
    spend();

    if (state.status === 'building' && state.waveIndex < state.totalWaves) {
      buildWait += dt;
      // Only call the next wave once there is nothing left worth buying, or
      // after a few seconds of saving up. Waiting forever would deadlock: the
      // building phase has no income because nothing is dying.
      if (!canSpendMore() || buildWait > 5) {
        Engine.startNextWave();
        buildWait = 0;
      }
    } else {
      buildWait = 0;
    }

    Engine.step(dt);
    simSeconds += dt;
  }

  const r = Engine.result();
  return {
    id,
    act: level.act,
    won: state.status === 'won',
    uptime: Math.round(r.uptime),
    leaks: r.leaks,
    kills: r.kills,
    spent: Math.round(r.spent),
    earned: Math.round(r.earned),
    leftover: Math.floor(state.bandwidth),
    starting: state.startingBandwidth,
    towers: r.towers,
    placed,
    upgraded,
    seconds: Math.round(simSeconds),
    waves: level.waves.length,
    power: level.power,
    traits: level.traits,
    boss: !!level.boss,
    road: level.path,
    // What the standing defence actually cost, including upgrades. This is the
    // number the economy has to be calibrated against: money the player cannot
    // usefully spend is not difficulty, it is decoration.
    cost: Math.round(state.towers.reduce((s, t) => s + (t.invested || 0), 0)),
    timeout: simSeconds >= maxSeconds,
    trace: opts.trace ? trace : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * The real difficulty question
 * ------------------------------------------------------------------ */

/**
 * The smallest number of towers that clears a ticket, and what that set cost.
 *
 * This exists because "the bot cleared it with a full board" is not a measure of
 * difficulty. A ticket one tower can hold is trivial however large its threat
 * numbers are, and the first version of this harness could not tell the
 * difference: it spent the whole budget, filled the board, and reported 100%
 * uptime on tickets a player walks through with a single Firewall. Multiplying
 * threat health and counts does not show up in that metric at all, which is
 * exactly why it looked like the tuning was not working while it was.
 *
 * The win condition is monotonic in the tower count - if n towers win, n + 1 win
 * - so the minimum is a binary search rather than a walk. About seven cached
 * simulations per ticket.
 *
 * `budget` is everything the ticket hands you (starting bandwidth plus what the
 * kills pay) and `cost` is what the winning set actually cost. The gap between
 * them is the slack, and slack is what makes a level feel easy: if the answer
 * costs a third of the money, the player never has to choose.
 */
function minimalTowers(W, id, tier, ceiling) {
  const cache = new Map();
  const probe = (n) => {
    if (!cache.has(n)) cache.set(n, playTicket(W, id, { tier, maxTowers: n, maxSeconds: 1500 }));
    return cache.get(n);
  };

  const top = probe(ceiling);
  if (!top.won) {
    return {
      id, n: null, unwinnable: true, ceiling, probes: cache.size,
      uptime: top.uptime, leftover: top.leftover,
      starting: top.starting, earned: top.earned,
      budget: top.starting + top.earned, cost: 0, leaks: top.leaks,
    };
  }

  let lo = 1;
  let hi = ceiling;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (probe(mid).won) hi = mid;
    else lo = mid + 1;
  }
  const win = probe(lo);
  return {
    id, n: lo, unwinnable: false, ceiling, probes: cache.size,
    cost: win.cost, uptime: win.uptime, leaks: win.leaks,
    starting: win.starting, earned: win.earned, leftover: win.leftover,
    budget: win.starting + win.earned,
  };
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };

  const W = loadGame();
  const total = W.Levels.count();
  const all = W.Levels.all();

  const TIER = val('--tier') || 'normal';

  /* --- invariants ------------------------------------------------- */

  const problems = [];

  /*
   * Which reading of the campaign to assert the curve against. Invariants 2 and
   * 3 are properties of the generated data and are tier-independent; the curve
   * (1) is not, because a tier multiplies health, speed and armour, and power()
   * is not linear in those - so a tier can be flat where normal is rising.
   */
  const read = TIER === 'normal' ? all : all.map((l) => W.Levels.at(l.id, TIER));

  // 1. Difficulty must rise. A campaign where ticket 200 is easier than ticket
  //    150 is not a curve, and it is the single easiest thing to break by
  //    changing one dial.
  let flat = 0;
  for (let i = 1; i < read.length; i++) {
    if (read[i].power <= read[i - 1].power) {
      flat++;
      if (flat <= 6) problems.push(`power does not rise: ${read[i - 1].id} -> ${read[i].id} (${read[i - 1].power} -> ${read[i].power})`);
    }
  }
  if (flat > 6) problems.push(`...and ${flat - 6} more flat or falling steps`);

  // 2. Every ticket must be playable: a road that does not exist, waves that
  //    reference a threat that does not exist, or a budget of zero.
  const paths = W.Levels.paths();
  const D = W.Threats.DEFS;
  for (const lv of read) {
    if (!lv.waves.length) problems.push(`ticket ${lv.id} has no waves`);
    if (!lv.waypoints && !paths[lv.path]) problems.push(`ticket ${lv.id} road "${lv.path}" is missing`);
    if (!(lv.bandwidth > 0)) problems.push(`ticket ${lv.id} has no bandwidth`);
    for (const w of lv.waves) {
      for (const g of w) if (!D[g.t]) problems.push(`ticket ${lv.id} waves reference unknown threat "${g.t}"`);
    }
  }

  // 3. No ticket may be a wall of one threat type only in the late game - the
  //    campaign is supposed to be about answering several problems at once.
  for (const lv of all) {
    if (lv.id < 40) continue;
    const kinds = new Set();
    lv.waves.forEach((w) => w.forEach((g) => kinds.add(g.t)));
    if (kinds.size < 2) problems.push(`ticket ${lv.id} is a single-threat level (${[...kinds].join(',')})`);
  }

  /* --- which tickets to play -------------------------------------- */

  let ids = all.map((l) => l.id);
  const range = val('--levels');
  if (range) {
    const [a, b] = range.split('-').map(Number);
    ids = ids.filter((i) => i >= a && i <= b);
  }
  const single = val('--level');
  if (single) ids = [Number(single)];

  /* --- minimal towers --------------------------------------------- *
   *
   * The measurement that actually answers "is this level hard". Defaults to the
   * selected tickets; a full 240-ticket sweep costs about half an hour, so it is
   * usually worth narrowing with --levels 1-40 first.
   */
  if (has('--minimal')) {
    const ceiling = Number(val('--ceiling') || 48);
    console.log(`\nminimum towers needed   tier ${TIER}   ceiling ${ceiling}\n`);
    console.log('ticket  act  towers    cost  budget  slack  uptime  verdict');
    console.log('-'.repeat(78));

    const rows = [];
    for (const id of ids) {
      const m = minimalTowers(W, id, TIER, ceiling);
      const lv = W.Levels.at(id, TIER);
      rows.push(m);
      const slack = m.cost > 0 ? (m.budget - m.cost) / m.cost : 0;
      const verdict = m.unwinnable
        ? 'UNWINNABLE at ' + ceiling
        : m.n <= 2 ? 'TRIVIAL' : m.n <= 6 ? 'fine' : m.n <= 14 ? 'demanding' : 'brutal';
      console.log(
        String(id).padStart(5) + '  ' + String(lv.act).padStart(3) + '  ' +
        (m.unwinnable ? '   --' : String(m.n).padStart(6)) + '  ' +
        String(m.cost).padStart(6) + '  ' + String(m.budget).padStart(6) + '  ' +
        (m.unwinnable ? '    -' : (Math.round(slack * 100) + '%').padStart(5)) + '  ' +
        (m.uptime + '%').padStart(6) + '  ' + verdict
      );
    }

    const winnable = rows.filter((r) => !r.unwinnable);
    const trivialCount = winnable.filter((r) => r.n <= 2).length;
    const mean = winnable.length ? winnable.reduce((s, r) => s + r.n, 0) / winnable.length : 0;
    const meanSlack = winnable.length
      ? winnable.reduce((s, r) => s + (r.budget - r.cost) / Math.max(1, r.cost), 0) / winnable.length
      : 0;
    console.log('-'.repeat(78));
    console.log(
      `${winnable.length}/${rows.length} winnable   ${trivialCount} trivial (<=2 towers)   ` +
      `${rows.length - winnable.length} unwinnable   mean towers ${mean.toFixed(1)}   ` +
      `mean slack ${Math.round(meanSlack * 100)}%\n`
    );
    return finish(problems, has('--check'));
  }

  const results = [];
  const t0 = Date.now();
  for (const id of ids) {
    results.push(playTicket(W, id, { trace: !!single, maxSeconds: 1500, tier: TIER }));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  /* --- single ticket detail --------------------------------------- */

  if (single) {
    const r = results[0];
    const lv = W.Levels.at(r.id, TIER);
    console.log(`\nTicket ${r.id}  ${lv.code}  ${lv.name}   [act ${lv.act} ${lv.actName}]`);
    console.log(`road ${lv.path} (${lv.roadFamily}, ${lv.roadLength} tiles, ${lv.roadTwin} twin, ${lv.roadSpots} spots)`);
    console.log(`bandwidth ${lv.bandwidth}  waves ${lv.waves.length}  power ${lv.power}`);
    console.log(`traits ${lv.traits.join(', ') || 'none'}${lv.boss ? '  BOSS' : ''}${lv.miniBoss ? '  mini-boss' : ''}`);
    console.log('\n' + lv.brief + '\n');
    console.log('tip: ' + lv.tip + '\n');
    lv.waves.forEach((w, i) => {
      const parts = w.map((g) => `${g.n}x ${g.t} (gap ${g.gap.toFixed(2)}, delay ${g.delay})`);
      const mass = w.reduce((s, g) => s + g.n * (D[g.t] ? D[g.t].hp : 0), 0);
      console.log(`  wave ${i + 1}: ${mass.toString().padStart(6)} hp  ${parts.join('  +  ')}`);
    });
    console.log(`\nresult: ${r.won ? 'CLEARED' : 'LOST'}  uptime ${r.uptime}%  leaks ${r.leaks}  ` +
      `kills ${r.kills}/${r.kills + r.leaks}  ${r.seconds}s`);
    console.log(`economy: start ${r.starting}  earned ${r.earned}  spent ${r.spent}  leftover ${r.leftover}`);
    console.log(`build: ${r.placed} placed, ${r.upgraded} upgraded, ${r.towers} standing`);
    if (r.trace) {
      console.log('\nbot actions:');
      r.trace.forEach((t) => console.log('  ' + t));
    }
    console.log('');
    return finish(problems, has('--check'));
  }

  /* --- per-act table ---------------------------------------------- */

  const acts = W.Levels.acts();
  const tierTag = TIER === 'normal' ? '' : `   [tier ${TIER}]`;
  console.log(`\npacket defense - campaign balance   ${results.length} tickets in ${elapsed}s${tierTag}\n`);
  console.log('act  name                 tickets  clear   avg uptime  avg leftover  med power  hardest');
  console.log('-'.repeat(94));

  const byAct = new Map();
  for (const r of results) {
    if (!byAct.has(r.act)) byAct.set(r.act, []);
    byAct.get(r.act).push(r);
  }

  let totalClears = 0;
  let totalPlayed = 0;
  for (const a of acts) {
    const rs = byAct.get(a.n);
    if (!rs || !rs.length) continue;
    const clears = rs.filter((r) => r.won).length;
    totalClears += clears;
    totalPlayed += rs.length;
    const avgUptime = Math.round(rs.reduce((s, r) => s + r.uptime, 0) / rs.length);
    const avgLeft = Math.round(rs.reduce((s, r) => s + r.leftover, 0) / rs.length);
    const powers = rs.map((r) => r.power).sort((x, y) => x - y);
    const median = powers[Math.floor(powers.length / 2)];
    const hardest = rs.slice().sort((x, y) => (x.uptime - y.uptime))[0];
    const flag = clears === rs.length ? '' : clears === 0 ? '  <-- ALL LOST' : '';
    console.log(
      `${String(a.n).padStart(3)}  ${a.name.padEnd(20)} ${String(rs.length).padStart(7)}` +
      `  ${(clears + '/' + rs.length).padStart(5)}  ${String(avgUptime + '%').padStart(10)}` +
      `  ${String(avgLeft).padStart(12)}  ${String(median).padStart(9)}` +
      `  ${('#' + hardest.id + ' ' + hardest.uptime + '%').padEnd(12)}${flag}`
    );
  }
  console.log('-'.repeat(94));
  console.log(`cleared ${totalClears}/${totalPlayed} tickets with a bot that never calls a wave early\n`);

  const losses = results.filter((r) => !r.won);
  if (losses.length) {
    console.log('tickets the bot could not clear:');
    losses.forEach((r) => console.log(`  #${r.id} act ${r.act}  uptime ${r.uptime}%  ` +
      `${r.towers} towers, ${r.leftover} unspent  ${r.timeout ? 'TIMEOUT' : ''}`));
    console.log('');
  }

  const star3 = results.filter((r) => r.won && r.leaks === 0).length;
  const star2 = results.filter((r) => r.won && r.leaks > 0 && r.uptime >= 90).length;
  console.log(`if the bot were a player: ${star3} three-star, ${star2} two-star, ` +
    `${totalClears - star3 - star2} one-star, ${losses.length} failed\n`);

  if (has('--json')) {
    console.log(JSON.stringify({ results, problems, elapsed: Number(elapsed) }, null, 1));
  }

  return finish(problems, has('--check'));
}

function finish(problems, check) {
  if (!problems.length) {
    console.log('invariants: all hold\n');
    return 0;
  }
  console.log('INVARIANT PROBLEMS:');
  problems.forEach((p) => console.log('  - ' + p));
  console.log('');
  return check ? 1 : 0;
}

process.exit(main());
