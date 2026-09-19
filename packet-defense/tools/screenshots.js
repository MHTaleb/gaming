#!/usr/bin/env node
/**
 * Store screenshots, taken from the real build.
 *
 * WHY
 *
 * Play wants screenshots, and screenshots are the thing a browsing player
 * actually judges an install on - the first two decide it. That makes them
 * marketing, but it does not make them mock-ups. A hand-drawn board cannot go
 * stale, which sounds like a feature until the day the game's palette changes
 * and the store is advertising a game that no longer exists. So every shot here
 * is the game: the same www/, the same engine, the same renderer, driven through
 * the same screens a player uses.
 *
 * HOW
 *
 * The board is a canvas, so this needs a real browser. It drives one over the
 * DevTools protocol - see tools/cdp.js for why that is a hundred lines of plain
 * node rather than a Playwright dependency.
 *
 * The one thing it does *not* do is fake the board. A late ticket starts with
 * about seven times the cost of one of every tower, so a full tower set plus
 * upgrades is entirely affordable out of the real budget; nothing is topped up.
 * The only state it sets is the research a player that deep into the campaign
 * would have, and that goes through the real Base.unlock() so the same rule the
 * player obeys is the rule here. If a tower is placeable in a screenshot it is
 * placeable in the game, because Towers.canPlace is what says so either way.
 *
 *   node tools/screenshots.js              capture into store/screenshots/
 *   node tools/screenshots.js --only=board one shot
 *   node tools/screenshots.js --check      verify the set, without a browser
 *
 * --check exists so the cheap gate in tools/verify.js can assert the store set
 * is complete and the right shape without starting Chrome. Whether the pictures
 * are *good* is a judgement; whether they exist, are 1920x1080, and have ink on
 * them is not.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');
const serve = require('./serve');
const relay = require('../server/relay/index.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const MANIFEST = path.join(OUT, 'manifest.json');

/**
 * 960x540 CSS pixels at 2x, which is a 1920x1080 screen at double density.
 *
 * The two numbers matter for different reasons, and getting either wrong
 * produces a picture of something no player sees.
 *
 * 1920x1080 is what Play wants: inside its size range, and 16:9, which is the
 * widest ratio it accepts for a phone screenshot. The game is landscape-only
 * (manifest.webmanifest says so), so there is no portrait set to make.
 *
 * 960x540 is the *layout* size, and it is the part that is easy to get wrong.
 * The battle HUD is drawn on a canvas that scales itself to the viewport, so it
 * looks the same either way - but every other screen is ordinary DOM, laid out
 * in CSS pixels, and those do not scale. Captured at 1920x1080 CSS the co-op
 * lobby came out as a small panel floating in the top third of a mostly empty
 * rectangle, because a 1920-pixel-wide viewport is a desktop, and this is a
 * phone game. At 960x540 the same panel fills the frame, and the picture is
 * what the game actually looks like.
 */
const VIEW = { width: 960, height: 540, scale: 2 };

/** The size of the file that comes out. */
const PIXELS = { width: VIEW.width * VIEW.scale, height: VIEW.height * VIEW.scale };

/** The ticket the board and victory shots come from. */
const BOARD_LEVEL = 220;
/** The ticket the briefing shot comes from. */
const BRIEF_LEVEL = 220;

/**
 * Insane, not normal.
 *
 * On normal, a board built to the level's own budget kills act eleven threats as
 * fast as they walk on. The hero shot came out as a fully built map with an
 * empty road and "next wave ready" across the bottom, and on hell - which is
 * only armour and spacing - the road still peaked at five threats, all of them
 * bunched in the spawn corner. Insane triples the health and multiplies the
 * count, so the board is busy *and* being used, which is the picture a tower
 * defence is supposed to be selling.
 */
const DIFFICULTY = 'insane';
/** Waves cleared before the board shot tunes in to the next one. */
const BOARD_WAVES = 4;

/* ------------------------------------------------------------------ *
 * Page-side scenarios
 *
 * These run inside the page, so they may only use what the page has: the
 * modules on window and the screens behind __app.show(). Nothing here reaches
 * into a private variable, and nothing here writes a tower onto the board by
 * hand - every placement goes through Towers.place, so it is subject to the
 * same unlocked/affordable/empty-tile rules a player is.
 * ------------------------------------------------------------------ */

/**
 * Wait for n animation frames, so the renderer has caught up with the state.
 *
 * The deadline is a setTimeout rather than a clock check inside the callback,
 * because the thing being defended against is frames that never arrive. A page
 * that is not front-most gets its animation throttled or stopped outright, so a
 * callback-driven deadline is a deadline that never runs - which is exactly how
 * the second page of the co-op shot hung the whole run.
 */
function frames(n) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }
    var timer = setTimeout(function () { finish(false); }, 4000);
    var left = n;
    (function next() {
      if (left-- <= 0) return finish(true);
      requestAnimationFrame(next);
    })();
  });
}

/**
 * Set up a late ticket and build a board worth photographing.
 *
 * Returns a few facts about what it built so the tool can report them, rather
 * than writing a PNG and hoping. Split from the two things that come after it -
 * tuning in for a mid-wave frame, and playing the ticket out for the results
 * screen - so both shots start from the same board.
 */
async function setupBoard(levelId, difficulty, waves, budgetFloor) {
  var W = window;
  var E = W.Engine, T = W.Towers, M = W.PDMap;

  /*
   * The research a player at this point in the campaign would have.
   *
   * Honeypot and patch are bought on the BASE screen with credits earned by
   * clearing tickets, so they are two types a player at act eleven simply has.
   * Granted through Profile and Base - the same two calls the shop screen makes
   * - rather than by overriding Base.towerUnlocked, because an override would
   * also make the shot a picture of something the game cannot do.
   */
  W.Profile.addCredits(1000);
  W.Base.unlock('honeypot');
  W.Base.unlock('patch');

  // Set through the same key the settings screen writes, so the battle that
  // starts is the battle the player would have started.
  if (difficulty) W.Store.set('difficulty', difficulty);

  W.__app.show('battle', { levelId: levelId });
  var st = E.state();

  /*
   * Let the level banner clear before anything else happens.
   *
   * It is positioned over the road at the top of the board, which is exactly
   * where the threats walk, and it leaves two and a half seconds after the
   * battle starts on a real-time timer. Stepping the simulation does not advance
   * real time, so without this wait every board shot has "INC-1220 - Hold"
   * sitting on top of the one thing the picture is for. The briefing shot has
   * the level's name and premise in full, so nothing is lost by waiting.
   */
  var banner = document.getElementById('battle-banner');
  var until = Date.now() + 5000;
  while (banner && banner.classList.contains('show') && Date.now() < until) {
    await new Promise(function (r) { setTimeout(r, 100); });
  }

  /* ---- where the road is, so the towers can be spread along it ---- */

  // Sampled through the map's own tileToWorld, because these have to be in the
  // same coordinate space as the tower positions and it is easy not to be.
  //
  // waypoints() hands back {c, r} objects, not pairs. Reading them as p[0]/p[1]
  // gives undefined, tileToWorld returns NaN, and every distance comparison
  // against NaN is false - so the sampling quietly produced an empty road, the
  // scoring loop found no tile worth building on, and the first version of this
  // shot was a picture of an empty map labelled "one of every tower". Nothing
  // threw. That is why there is an assertion at the bottom of this function.
  var wps = M.waypoints();
  var pts = wps.map(function (p) { return M.tileToWorld(p.c, p.r); });
  var road = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1];
    var len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    var n = Math.max(2, Math.round(len / 6));
    for (var k = 0; k < n; k++) {
      road.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) });
    }
  }
  if (!road.length) throw new Error('the road sampled to nothing - the board cannot be built');

  /* ---- one of every tower, spread rather than piled up ---- */

  // Deliberately the whole roster: the point of this shot is to answer "what is
  // there to do in this game" in one glance.
  var TYPES = ['firewall', 'cdn', 'honeypot', 'limiter', 'waf', 'patch', 'av', 'quarantine'];

  // Which road is already covered. A greedy "best tile" loop with no memory
  // puts every tower on the same bend, which is a worse picture and also a worse
  // defence - real players cover the whole route.
  var covered = road.map(function () { return false; });
  var built = [];
  var standing = [];
  var base = M.baseTile();
  var baseW = M.tileToWorld(base.c, base.r);

  var legalSince = 0;

  /**
   * The best empty tile for one more of `type`, or null.
   *
   * Two rules, because there are two kinds of tower. An attacking tower is
   * placed for the road it can reach, and prefers road nothing else is already
   * watching. A support tower has no reach at all - patch repairs PROD rather
   * than shooting, so its range is 0 - and is placed for what it stands beside
   * instead. Scoring a support tower by road covered finds nothing it can ever
   * see, which is how the first version of this quietiy built seven of the
   * eight types and called it a full set.
   */
  function bestSpot(type) {
    var def = T.DEFS[type];
    var range2 = def.range * def.range;
    var support = !def.range;
    var best = null;

    for (var c = 0; c < M.COLS; c++) {
      for (var r = 0; r < M.ROWS; r++) {
        if (!T.canPlace(st, c, r, type, M).ok) continue;
        var w = M.tileToWorld(c, r);
        var score = 0;

        if (support) {
          for (var b = 0; b < standing.length; b++) {
            var bx = standing[b].x - w.x, by = standing[b].y - w.y;
            var bd = Math.sqrt(bx * bx + by * by);
            if (bd < 160) score += (160 - bd) / 160;
          }
          var gx = baseW.x - w.x, gy = baseW.y - w.y;
          score += 1 / (1 + Math.sqrt(gx * gx + gy * gy) / 100);
        } else {
          for (var s = 0; s < road.length; s++) {
            var dx = road[s].x - w.x, dy = road[s].y - w.y;
            if (dx * dx + dy * dy > range2) continue;
            // Road nobody covers yet is worth eight times road somebody does,
            // which is what spreads the towers out along the route instead of
            // piling them on the single best tile.
            score += covered[s] ? 0.12 : 1;
          }
        }

        if (!score) continue;
        if (!best || score > best.score) best = { c: c, r: r, score: score, x: w.x, y: w.y, range2: range2 };
      }
    }
    return best;
  }

  /** Put one down, and remember what it now watches. */
  function buildOne(type) {
    var spot = bestSpot(type);
    if (!spot) return null;
    var res = T.place(st, spot.c, spot.r, type, M);
    // Not `continue`: a placement the rules refuse is a bug in this tool's idea
    // of the board, and quietly skipping it is how a broken screenshot ships.
    if (!res.ok) throw new Error('placing a ' + type + ' was refused: ' + res.reason);
    built.push(type);
    standing.push(res.tower);
    legalSince = 0;
    for (var q = 0; q < road.length; q++) {
      var ax = road[q].x - spot.x, ay = road[q].y - spot.y;
      if (ax * ax + ay * ay <= spot.range2) covered[q] = true;
    }
    return spot;
  }

  // One of every tower first. The point of this shot is to answer "what is
  // there to do in this game" at a glance, and a board missing a type answers a
  // different question.
  var TYPES = ['firewall', 'cdn', 'honeypot', 'limiter', 'waf', 'patch', 'av', 'quarantine'];
  for (var ti = 0; ti < TYPES.length; ti++) {
    if (!buildOne(TYPES[ti])) {
      throw new Error('nowhere legal to stand a ' + TYPES[ti] + ' after ' + built.length + ' towers');
    }
  }

  /*
   * Then keep building, because a real board is not eight towers.
   *
   * This level opens with about seven times the cost of the roster above, and a
   * board that finishes wave seven with most of its budget in hand is not a
   * picture of how the game is played - it is a picture of a screenshot tool
   * that stopped caring. It also looks better: the hero shot is meant to show a
   * defended server, not a lawn with eight ornaments on it.
   */
  var EXTRAS = ['firewall', 'waf', 'cdn', 'limiter', 'av', 'quarantine', 'honeypot'];
  var floor = st.startingBandwidth * (budgetFloor === undefined ? 0.3 : budgetFloor);
  for (var ei = 0; st.bandwidth > floor && built.length < 30; ei++) {
    var more = EXTRAS[ei % EXTRAS.length];
    if (st.bandwidth < T.DEFS[more].cost) { more = 'firewall'; }
    if (!buildOne(more)) break;
  }

  /**
   * Improve what is standing, leaving some money in hand.
   *
   * Both halves matter for the picture: a board of level-1 towers does not look
   * like act eleven, and a board with zero bandwidth looks like a bot rather
   * than a player.
   */
  function improve(reserve) {
    var spent = 0;
    for (var round = 0; round < 5; round++) {
      for (var i2 = 0; i2 < st.towers.length; i2++) {
        var tw = st.towers[i2];
        var cost = T.upgradeCost(tw);
        if (cost === null || st.bandwidth - cost < reserve) continue;
        if (T.upgrade(st, tw).ok) spent += cost;
      }
    }
    return spent;
  }

  improve(st.startingBandwidth * 0.12);

  /* ---- play it forward, at speed ---- */

  var dt = 1 / 60;
  var cleared = 0;

  for (var wave = 0; wave < waves; wave++) {
    if (st.status !== 'building') break;
    E.startNextWave();
    var steps = 0;
    // 120 simulated seconds is well past the longest wave in the campaign, and
    // the cap is a guard against a wave that cannot end rather than a tuning.
    while (st.status === 'wave' && steps++ < 60 * 120) E.step(dt);
    if (st.status === 'won' || st.status === 'lost') break;
    cleared++;
    improve(st.startingBandwidth * 0.12);
  }

  /*
   * Refuse to hand back a picture that does not show what the shot claims.
   *
   * The failure this guards against is not hypothetical: the first version of
   * this shot wrote a PNG of an empty board and reported success, because the
   * road had sampled to NaN and "found nowhere good to build" is
   * indistinguishable from "nothing could be built". A store screenshot that
   * promises a full tower set and shows two towers is worse than a build that
   * stops.
   */
  var missing = TYPES.filter(function (t) { return built.indexOf(t) === -1; });
  if (missing.length) {
    throw new Error('the board is missing ' + missing.join(', ') + ' - it would show ' + built.length + ' towers, not a full set');
  }

  return {
    level: levelId,
    difficulty: difficulty || 'normal',
    cleared: cleared,
    waves: st.waveIndex,
    of: st.totalWaves,
    towers: st.towers.length,
    roster: TYPES.length,
    uptime: Math.round(st.uptime),
    bandwidth: Math.floor(st.bandwidth),
    status: st.status,
  };
}

/**
 * Start the next wave and stop at its busiest moment.
 *
 * A screenshot taken during the building phase is a screenshot of an empty road,
 * and the whole reason to look at a tower defence is the moment it is doing its
 * job.
 *
 * The moment is found by watching rather than by waiting a fixed number of
 * seconds, and that is the part that took the longest to get right. A fixed
 * three seconds caught one pile of threats still bunched at the spawn, halfway
 * off the top of the board. A fixed nine seconds - chosen because the first
 * version looked better later into the wave - was past the end of the wave
 * entirely: this board clears a wave of act eleven, so the road was empty and
 * the HUD said "next wave ready". What actually holds is to step until the
 * number on the road stops rising, which is the peak by definition and does not
 * care how strong the defence is. Measured on the shot this was written for:
 * seven threats on the road at six seconds, and the wave gone by twenty-five.
 */
function tuneIn(minThreats, minSeconds) {
  var W = window;
  var E = W.Engine;
  var st = E.state();
  var dt = 1 / 60;
  var steps = 0;

  if (st.status !== 'building') return { threats: st.threats.length, status: st.status, seconds: 0 };
  E.startNextWave();

  var floor = 60 * (minSeconds || 3);
  var cap = 60 * 60;
  var peak = 0;
  var peakAt = 0;
  var reached = false;

  while (st.status === 'wave' && steps++ < cap) {
    E.step(dt);
    if (st.threats.length > peak) {
      peak = st.threats.length;
      peakAt = Math.round(steps / 60);
    } else if (peak >= (minThreats || 6) && st.threats.length < peak && steps >= floor) {
      // Just past the peak: the count has started coming down, so the busiest
      // frame is the one behind us and this one is still nearly as full.
      reached = true;
      break;
    }
  }

  return {
    reached: reached,
    threats: st.threats.length,
    peak: peak,
    peakAt: peakAt,
    seconds: Math.round(steps / 60),
    wave: st.waveIndex,
    uptime: Math.round(st.uptime),
    status: st.status,
  };
}

/**
 * Play the ticket out to its result, and let the game take itself there.
 *
 * Deliberately not "call the results screen with some numbers". `finish()` is
 * what the engine does when a ticket ends, including the short pause that lets
 * the player see the board before the scoreboard, so this waits for the game to
 * end and for the game to move itself.
 */
async function finishTicket() {
  var W = window;
  var E = W.Engine;
  var T = W.Towers;
  var st = E.state();
  var dt = 1 / 60;
  var steps = 0;

  while (st.status !== 'won' && st.status !== 'lost' && steps++ < 60 * 600) {
    if (st.status === 'building' && st.waveIndex < st.totalWaves) {
      // Spend what is spare before calling the wave, which is what a player
      // does in the gap between waves.
      for (var i = 0; i < st.towers.length; i++) {
        var cost = T.upgradeCost(st.towers[i]);
        if (cost !== null && st.bandwidth > cost + 300) T.upgrade(st, st.towers[i]);
      }
      E.startNextWave();
    }
    E.step(dt);
  }

  // The engine hands off to the results screen itself, on a short delay so the
  // board is visible for a moment first.
  var until = Date.now() + 5000;
  while (W.__app.current() !== 'result' && Date.now() < until) {
    await new Promise(function (r) { setTimeout(r, 100); });
  }

  return {
    outcome: st.status,
    screen: W.__app.current(),
    uptime: Math.round(st.uptime),
    leaks: st.leaks,
    kills: st.kills,
    wave: st.waveIndex,
  };
}

/** Straight into a screen, with the game's own renderer drawing it. */
function openScreen(id, data) {
  window.__app.show(id, data || {});
  return true;
}

/**
 * Every word that is on the screen, from both the DOM and the canvas.
 *
 * "No debug text or placeholder ids visible" is a real requirement and an easy
 * one to fail quietly: one `undefined` in a corner of a HUD is invisible in a
 * thumbnail and obvious to a stranger, and a placeholder package id in a
 * settings list is the kind of thing that gets noticed in a review. It is also
 * the kind of thing nobody checks, because checking it by eye means reading a
 * 1920-pixel-wide screenshot.
 *
 * The DOM half is easy. The canvas half is not, because the battle HUD is drawn
 * as glyphs and no part of it is queryable - so this patches fillText for a
 * couple of frames and records the strings as the renderer asks for them. That
 * is the actual text on the board, not an approximation of it.
 *
 * Patched and restored inside one call, on purpose: leaving fillText wrapped
 * would mean the screenshot is of a page that is not quite the game.
 */
function harvestText() {
  var proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  var seen = [];
  var patched = [];
  if (proto) {
    ['fillText', 'strokeText'].forEach(function (name) {
      var original = proto[name];
      if (!original) return;
      patched.push([name, original]);
      proto[name] = function (text) {
        var s = String(text);
        if (s && seen.indexOf(s) === -1) seen.push(s);
        return original.apply(this, arguments);
      };
    });
  }
  return new Promise(function (resolve) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      patched.forEach(function (p) { proto[p[0]] = p[1]; });
      resolve({
        canvas: seen,
        dom: (document.body && document.body.innerText) || '',
      });
    }
    // Same trap as frames(): if animation is throttled the callback never runs,
    // so the deadline cannot live inside it.
    var timer = setTimeout(finish, 1500);
    var left = 2;
    (function next() {
      if (left-- <= 0) return finish();
      requestAnimationFrame(next);
    })();
  });
}

/**
 * Things that must never be legible in a store screenshot.
 *
 * Deliberately narrow. `null` is not on the list even though it reads like a bug
 * value, because act ten of this campaign is a level called NULL and a check
 * that fires on the game's own content gets switched off. Nothing here matches
 * anything the game says on purpose.
 */
const FORBIDDEN = [
  ['a placeholder package id', /yourstudio|com\.example|com\.packetdefense\.app/i],
  ['a debug value', /\bundefined\b|\bNaN\b|\[object |Infinity%/i],
  ['a working note', /\bTODO\b|\bFIXME\b|lorem ipsum/i],
  ['an ad test unit', /ca-app-pub-3940256099942544|test ad/i],
  ['a local address', /localhost|127\.0\.0\.1/i],
];

/** Throw if any of the words on screen should not be in a store screenshot. */
function flagForbidden(shot, words) {
  const all = words.canvas.concat(words.dom.split('\n'));
  for (const [what, re] of FORBIDDEN) {
    const hit = all.find((s) => re.test(s));
    if (hit) throw new Error(shot.name + ' shows ' + what + ': ' + JSON.stringify(hit.trim().slice(0, 80)));
  }
  // A shot with no words at all is a shot of a screen that failed to build.
  if (all.filter((s) => s.trim()).length < 3) {
    throw new Error(shot.name + ' has almost no text on it - ' + all.length + ' strings found');
  }
  return all.filter((s) => s.trim()).length;
}

/* ------------------------------------------------------------------ *
 * Shots
 * ------------------------------------------------------------------ */

const SHOTS = [
  {
    name: '01-board',
    scene: 'A late ticket, mid-wave, with one of every tower on the map.',
    async run(ctx) {
      const board = await ctx.page.eval(setupBoard, BOARD_LEVEL, DIFFICULTY, BOARD_WAVES, 0.45);
      // Twelve seconds in before the peak is even considered.
      //
      // The peak alone is not the right moment. On an insane-tier wave the count
      // rises fastest in the first two seconds, so stopping at the peak puts the
      // camera on sixteen threats all standing on the spawn tile, overlapping
      // each other and running off the edge of the board. Waiting until the wave
      // is a third of the way down the road costs nothing at the far end and is
      // the difference between "a wall of threats" and "a pile of sprites".
      const frame = await ctx.page.eval(tuneIn, 8, 12);
      await ctx.page.eval(frames, 3);
      return { level: BOARD_LEVEL, board: board, frame: frame };
    },
  },
  {
    name: '02-briefing',
    scene: "The briefing screen for the ticket in shot one, on the default difficulty. This is the one screen that explains the game, so it is the one the store copy points at.",
    async run(ctx) {
      await ctx.page.eval(openScreen, 'brief', { levelId: BRIEF_LEVEL });
      await ctx.page.eval(frames, 3);
      return { level: BRIEF_LEVEL };
    },
  },
  {
    name: '03-coop',
    scene: 'Two players in a co-op lobby, on a real relay.',
    async run(ctx) {
      const host = ctx.page;
      const peer = await ctx.browser.newPage(VIEW);

      // The second client is a second page of the same build, on the same
      // relay - which is the only way the roster has anything true to show.
      await peer.goto(ctx.url);
      await peer.waitFor('!!(window.Net && window.__app)', { timeout: 15000 });

      // A name a player would have chosen, rather than the P47 the game
      // generates for somebody who has not been to the settings screen yet.
      await host.eval(function (n) { window.Store.set('playerName', n); }, 'ada');
      await peer.eval(function (n) { window.Store.set('playerName', n); }, 'grace');

      const created = await host.eval(async function () {
        await window.Net.create({ name: window.Store.get('playerName'), tier: 'normal', theme: 220 });
        window.__app.show('coop');
        return window.Net.session().code;
      });

      await peer.eval(async function (code) {
        await window.Net.join(code, { name: window.Store.get('playerName') });
        window.__app.show('coop');
        return window.Net.session().seat;
      }, created);

      // Both ends have to be in the room before the roster is worth showing.
      await host.waitFor(function () {
        var s = window.Net.session();
        return !!(s.code && s.roster && s.roster.length >= 2);
      }, { timeout: 5000 }).catch(function () { /* the shot is still honest with one */ });

      await host.eval(frames, 3);
      await peer.close();
      return { room: created };
    },
  },
  {
    name: '04-victory',
    scene: 'The results screen for the ticket in shot one, won for real.',
    async run(ctx) {
      await ctx.page.eval(setupBoard, BOARD_LEVEL, DIFFICULTY, BOARD_WAVES, 0.45);
      const end = await ctx.page.eval(finishTicket);
      await ctx.page.eval(frames, 3);
      return { level: BOARD_LEVEL, end: end };
    },
  },
  {
    name: '05-title',
    scene: 'The menu.',
    async run(ctx) {
      await ctx.page.eval(openScreen, 'menu');
      await ctx.page.eval(frames, 3);
      return {};
    },
  },
];

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

/**
 * What is actually in the PNG.
 *
 * Measuring the finished file rather than the page is the whole point: it is the
 * only thing that proves the picture has the game in it. A page that threw
 * during setup screenshots perfectly and produces a rectangle of background, and
 * a rectangle of background passes every check except this one.
 *
 * So the file is fed back into the browser as a data URL, drawn to a canvas and
 * read back. No image decoder, and no dependency on one.
 */
async function measure(browser, png) {
  const page = await browser.newPage({ width: PIXELS.width, height: PIXELS.height, scale: 1 });
  try {
    await page.goto('about:blank');
    return await page.eval(async function (dataUrl) {
      const img = new Image();
      await new Promise(function (res, rej) {
        img.onload = res;
        img.onerror = function () { rej(new Error('not a readable image')); };
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;

      // Sampled on a stride: 8 million pixels is more than enough to tell a
      // board from a blank rectangle and slower than it needs to be.
      const counts = new Map();
      let samples = 0;
      for (let i = 0; i < d.length; i += 4 * 17) {
        // 5 bits per channel, so near-identical colours count as one.
        const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        counts.set(key, (counts.get(key) || 0) + 1);
        samples++;
      }
      let top = 0;
      for (const v of counts.values()) if (v > top) top = v;
      return {
        width: img.width,
        height: img.height,
        samples: samples,
        colours: counts.size,
        // The share of the picture that is not one flat colour. "Mostly one
        // colour" is what a failed render looks like.
        ink: Number((1 - top / samples).toFixed(4)),
      };
    }, 'data:image/png;base64,' + png.toString('base64'));
  } finally {
    await page.close();
  }
}

/** Start the relay and the static server the way the deploy wires them. */
async function startServers() {
  const relayServer = relay.start(0, '127.0.0.1');
  await new Promise((res) => relayServer.once('listening', res));
  const relayPort = relayServer.address().port;

  // The relay goes in as an option rather than through process.env, because
  // env has to be set before serve.js is loaded and this has to be decided
  // after the relay has a port.
  const web = serve.createServer({ relay: 'http://127.0.0.1:' + relayPort });
  await new Promise((res, rej) => {
    web.once('error', rej);
    web.listen(0, '127.0.0.1', res);
  });

  return { relayServer, web, url: 'http://127.0.0.1:' + web.address().port + '/' };
}

async function capture(only) {
  const wanted = only ? SHOTS.filter((s) => s.name.includes(only)) : SHOTS;
  if (!wanted.length) throw new Error('no shot matches "' + only + '"');

  fs.mkdirSync(OUT, { recursive: true });
  const servers = await startServers();
  const origin = new URL(servers.url).origin;
  const browser = await launch();
  console.log('chrome: ' + (await browser.version()));
  console.log('serving ' + servers.url + ' (relay ' + servers.relayServer.address().port + ')\n');

  const shots = [];
  try {
    for (const shot of wanted) {
      const url = servers.url + '?screenshots=1';
      const page = await browser.newPage(VIEW);
      // The long scenarios step thousands of simulated frames inside one page
      // evaluation, which is fast but not instant on a busy machine.
      page.timeout = 90000;
      const t0 = Date.now();
      try {
        /*
         * Every shot starts from a fresh save.
         *
         * The shots share one browser profile, so they share localStorage, and
         * the game keeps its save there. Without this the menu shot showed the
         * credits the victory shot had granted itself, the co-op shot inherited
         * whatever the board shot had done, and - the one that actually matters
         * - the board shot's budget depended on how many shots had run before
         * it. A screenshot you cannot reproduce is a screenshot you cannot
         * regenerate after the game changes.
         */
        await page.send('Storage.clearDataForOrigin', { origin: origin, storageTypes: 'all' });
        await page.goto(url);
        // The modules on window are the contract here; if the boot has not
        // finished there is nothing to drive.
        await page.waitFor('!!(window.__app && window.Engine && window.Towers && window.PDMap)', { timeout: 15000 });

        const meta = (await shot.run({ page, browser, url })) || {};

        // Read the screen before photographing it, and refuse to write a file
        // that could reach a store with a debug value legible on it.
        const words = await page.eval(harvestText);
        const wordCount = flagForbidden(shot, words);

        const png = await page.screenshot();
        const stat = await measure(browser, png);
        const file = shot.name + '.png';
        fs.writeFileSync(path.join(OUT, file), png);
        shots.push(Object.assign({ name: shot.name, file: file, scene: shot.scene, words: wordCount }, stat, meta));

        const note = meta.level ? 'level ' + meta.level : '';
        // The interesting numbers, not just the pixels. A board shot that came
        // out during the building phase is a bad screenshot, and "peak 0" says
        // so in the log rather than only in the picture.
        const extra = [];
        if (meta.board) extra.push('towers ' + meta.board.towers, 'uptime ' + meta.board.uptime, 'b/w ' + meta.board.bandwidth);
        if (meta.frame) extra.push('peak ' + meta.frame.peak + '@' + meta.frame.peakAt + 's', 'on road ' + meta.frame.threats, 'wave ' + meta.frame.wave, meta.frame.status);
        if (meta.end) extra.push(meta.end.outcome, 'uptime ' + meta.end.uptime, 'leaks ' + meta.end.leaks);
        console.log('  ' + shot.name.padEnd(12) + ' ' + file.padEnd(16) +
          stat.width + 'x' + stat.height +
          '  ink ' + stat.ink.toFixed(3) +
          '  ' + String(stat.colours).padStart(5) + ' colours' +
          '  ' + String(wordCount).padStart(3) + ' words' +
          '  ' + (Date.now() - t0) + 'ms  ' + note +
          (extra.length ? '\n               ' + extra.join(' · ') : ''));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    servers.web.close();
    servers.relayServer.close();
  }

  const manifest = {
    note: 'Written by tools/screenshots.js. Do not edit by hand.',
    viewport: VIEW,
    size: PIXELS,
    shots: shots,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log('\n' + shots.length + ' shot' + (shots.length === 1 ? '' : 's') + ' written to store/screenshots/');
  return shots;
}

/* ------------------------------------------------------------------ *
 * Check
 * ------------------------------------------------------------------ */

/** Read a PNG's real dimensions out of its IHDR chunk. */
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Is the set complete and the right shape?
 *
 * Deliberately does not hash the pictures. A screenshot is supposed to change
 * whenever the game does, so a check that failed on every redraw of a tower
 * would be turned off within a week, and then it would be checking nothing.
 * What is worth failing on is a missing shot, a wrong size, or a picture that
 * is a flat rectangle - all of which survive a redraw and none of which a
 * human notices in a directory listing.
 */
function check() {
  const bad = [];
  if (!fs.existsSync(MANIFEST)) {
    console.error('no store/screenshots/manifest.json - run: node tools/screenshots.js');
    return false;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const listed = new Map((manifest.shots || []).map((s) => [s.name, s]));

  for (const shot of SHOTS) {
    const entry = listed.get(shot.name);
    if (!entry) { bad.push(shot.name + ': not in the manifest'); continue; }

    const file = path.join(OUT, entry.file);
    if (!fs.existsSync(file)) { bad.push(shot.name + ': missing ' + entry.file); continue; }

    const buf = fs.readFileSync(file);
    const size = pngSize(buf);
    if (!size) { bad.push(shot.name + ': not a PNG'); continue; }
    if (size.width !== PIXELS.width || size.height !== PIXELS.height) {
      bad.push(shot.name + ': ' + size.width + 'x' + size.height + ', expected ' + PIXELS.width + 'x' + PIXELS.height);
    }
    if (!(entry.ink >= 0.05)) {
      bad.push(shot.name + ': ink ' + entry.ink + ' - looks like a blank rectangle');
    }
    if (!(entry.colours >= 8)) {
      bad.push(shot.name + ': ' + entry.colours + ' colours - looks like a blank rectangle');
    }
  }

  if (bad.length) {
    console.error('store screenshots are not usable as they stand:');
    for (const b of bad) console.error('  ' + b);
    return false;
  }
  console.log('store screenshots: ' + SHOTS.length + ' shots, ' +
    PIXELS.width + 'x' + PIXELS.height + ', all with content');
  return true;
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) process.exit(check() ? 0 : 1);

  const only = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('node tools/screenshots.js [--only=board] [--check]');
    for (const s of SHOTS) console.log('  ' + s.name.padEnd(12) + ' ' + s.scene);
    return;
  }

  await capture(only);

  /*
   * Exit explicitly.
   *
   * The relay keeps timers and the devtools socket does not always finish its
   * close handshake, so node is left with a live handle and the process sits at
   * the prompt having already said it was done. The work is finished and the
   * files are written by this point; waiting for the event loop to notice adds
   * nothing but a hang.
   */
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nscreenshots failed: ' + err.message);
    process.exit(1);
  });
}

module.exports = { SHOTS: SHOTS, check: check, VIEW: VIEW, PIXELS: PIXELS };
