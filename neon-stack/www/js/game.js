/**
 * game.js - "Neon Stack" game engine.
 *
 * A hyper-casual one-tap block stacker rendered with the 2D canvas API.
 * No dependencies, no image assets, no physics engine: everything is drawn
 * procedurally so the build stays tiny and runs on low-end phones.
 *
 * Two modes:
 *   endless - stack forever, score is the point
 *   level   - reach a goal height; clearing it triggers a zoom-out celebration
 *
 * World space: x grows right, y grows UP, the ground is y = 0.
 * Block i occupies y in [i * BLOCK_H, (i + 1) * BLOCK_H].
 */
(function (global) {
  'use strict';

  /* --------------------------- tuning --------------------------- */
  var VW = 360;              // logical world width (everything scales from this)
  var BLOCK_H = 26;          // block height
  var DEPTH_X = 13;          // fake-3D depth offset (x)
  var DEPTH_Y = 7;           // fake-3D depth offset (y)
  var DEFAULT_WIDTH = 168;   // width of the first block (endless mode)
  var DEFAULT_TOL = 5;       // |offset| that still counts as a perfect drop
  var MIN_PLAYABLE_WIDTH = 6;
  var MIN_SPEED = 150;       // px/s at score 0
  var SPEED_STEP = 7.5;      // px/s gained per point (endless)
  var LEVEL_SPEED_STEP = 3;  // px/s gained per block placed (levels)
  var MAX_SPEED = 430;       // soft cap before the per-level multiplier
  var HARD_MAX_SPEED = 520;  // absolute ceiling: ~0.7s to cross the screen
  var GRAVITY = 1900;
  var CAM_LERP = 7.5;
  var COMPLETE_HOLD = 1.5;   // seconds of celebration before reporting back

  var DEFAULT_PALETTE = {
    id: 'neon',
    hueBase: 205,
    hueStep: 9,
    spread: 360,
    bg: 200,
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsl(h, s, l) {
    return 'hsl(' + (((h % 360) + 360) % 360) + ',' + s + '%,' + l + '%)';
  }

  function NeonStack(canvas, hooks) {
    hooks = hooks || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.onScore = hooks.onScore || function () {};
    this.onPerfect = hooks.onPerfect || function () {};
    this.onProgress = hooks.onProgress || function () {};
    this.onGameOver = hooks.onGameOver || function () {};
    this.onLevelComplete = hooks.onLevelComplete || function () {};
    this.onStateChange = hooks.onStateChange || function () {};
    this.onEvent = hooks.onEvent || function () {};
    this.haptic = hooks.haptic || function () {};

    this.state = 'idle';        // idle | playing | paused | dying | over | complete
    this.blocks = [];
    this.pieces = [];
    this.particles = [];
    this.texts = [];
    this.stars = [];
    this.moving = null;

    // config
    this.mode = 'endless';
    this.palette = DEFAULT_PALETTE;
    this.goal = 0;
    this.perfectTol = DEFAULT_TOL;
    this.baseWidth = DEFAULT_WIDTH;
    this.speedMul = 1;
    this.enemyCfg = null;
    this.actors = null;
    this.bossStarted = false;
    this.runReason = 'miss';
    this.zen = false;

    // Presentation options (settings screen). Motion off kills shake, flash and
    // most particles for players who need that, or for weak hardware.
    this.opts = { motion: true, contrast: false };
    this.ghost = null;            // [[x, w], ...] of the best run, drawn behind
    this.timeScale = 1;           // dips for near-miss slow motion
    this.slowT = 0;
    this.wobble = 0;              // landing ripple through the top of the tower

    // run state
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.stacked = 0;
    this.perfects = 0;
    this.topY = 0;
    this.hueIndex = 0;
    this.hue = 205;
    this.revived = false;
    this.completeT = 0;
    this.victory = false;
    this.victoryDone = false;

    // view
    this.camY = 0;
    this.camX = 0;
    this.zoom = 1;
    this.fitZoom = 1;
    this.shake = 0;
    this.shakeMag = 0;
    this.flash = 0;
    this.dyingT = 0;

    this.viewH = 640;
    this.scale = 1;
    this.dpr = 1;
    this.lastT = 0;
    this.raf = 0;
    this.running = false;

    this.makeStars();
    this.resize();
  }

  /* --------------------------- config --------------------------- */

  /**
   * opts: { mode, goal, tol, baseW, speedMul, palette }
   * Always call this before start().
   */
  NeonStack.prototype.configure = function (opts) {
    opts = opts || {};
    this.mode = opts.mode || 'endless';
    this.goal = this.mode === 'level' ? Math.max(1, opts.goal || 1) : 0;
    this.perfectTol = opts.tol || DEFAULT_TOL;
    this.baseWidth = opts.baseW || DEFAULT_WIDTH;
    this.speedMul = opts.speedMul || 1;
    this.palette = opts.palette || DEFAULT_PALETTE;
    this.enemyCfg = opts.enemies || null;
    /** Zen never fails: a missed block just falls and you carry on. */
    this.zen = !!opts.zen;
  };

  NeonStack.prototype.setOptions = function (o) {
    o = o || {};
    if (o.motion !== undefined) this.opts.motion = !!o.motion;
    if (o.contrast !== undefined) this.opts.contrast = !!o.contrast;
  };

  /** The best run's silhouette, so you can race it. Pairs of [x, width]. */
  NeonStack.prototype.setGhost = function (pairs) {
    this.ghost = (pairs && pairs.length) ? pairs : null;
  };

  NeonStack.prototype.emit = function (name, data) {
    this.onEvent(name, data || {});
  };

  /** World -> CSS pixels, for anchoring DOM (the drone's speech bubble). */
  NeonStack.prototype.project = function (wx, wy) {
    return { x: (wx - this.camX) * this.scale, y: this.sy(wy) * this.scale };
  };

  /* --------------------------- layout --------------------------- */

  NeonStack.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 3);
    var cssW = this.canvas.clientWidth || global.innerWidth;
    var cssH = this.canvas.clientHeight || global.innerHeight;
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.baseScale = cssW / VW;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.applyZoom();
    this.camY = this.cameraTarget();
    if (!this.running) this.render(0);
  };

  /** Zoom changes how much world fits on screen; it never touches canvas size. */
  NeonStack.prototype.applyZoom = function () {
    this.scale = this.baseScale * this.zoom;
    this.viewH = this.cssH / this.scale;
  };

  NeonStack.prototype.sy = function (worldY) {
    return this.viewH - (worldY - this.camY);
  };

  NeonStack.prototype.cameraTarget = function () {
    if (this.victory) {
      // Frame the whole tower.
      return Math.max(-40, (this.topY + BLOCK_H) / 2 - this.viewH / 2);
    }
    return Math.max(0, this.topY - this.viewH * 0.62);
  };

  /**
   * Zooming out widens the visible world, which would leave x = 0 pinned to the
   * left edge and shove the tower off centre. So the victory shot tracks x too.
   */
  NeonStack.prototype.cameraXTarget = function () {
    if (!this.victory) return 0;
    return (VW - VW / this.zoom) / 2;
  };

  NeonStack.prototype.visibleW = function () {
    return VW / this.zoom;
  };

  NeonStack.prototype.makeStars = function () {
    this.stars.length = 0;
    // Spread wider than the screen: the victory camera pulls back past x = 0.
    var pad = 440;
    for (var i = 0; i < 64; i++) {
      this.stars.push({
        x: -pad + Math.random() * (VW + pad * 2),
        y: Math.random() * 1400,
        r: 0.6 + Math.random() * 1.6,
        a: 0.18 + Math.random() * 0.5,
      });
    }
  };

  /* --------------------------- lifecycle --------------------------- */

  NeonStack.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange(s);
  };

  NeonStack.prototype.nextHue = function () {
    var p = this.palette;
    var h = p.hueBase + ((this.hueIndex * p.hueStep) % p.spread);
    this.hueIndex += 1;
    this.hue = h;
    return h;
  };

  NeonStack.prototype.start = function () {
    this.blocks.length = 0;
    this.pieces.length = 0;
    this.particles.length = 0;
    this.texts.length = 0;
    this.record = [];             // [x, w] per block, for the ghost of the best run
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.stacked = 0;
    this.perfects = 0;
    this.hueIndex = 0;
    this.revived = false;
    this.shake = 0;
    this.flash = 0;
    this.dyingT = 0;
    this.completeT = 0;
    this.victory = false;
    this.victoryDone = false;
    this.bossStarted = false;
    this.runReason = 'miss';
    this.timeScale = 1;
    this.slowT = 0;
    this.wobble = 0;
    this.zoom = 1;
    this.camX = 0;
    this.applyZoom();

    var firstHue = this.nextHue();
    this.blocks.push({
      x: (VW - this.baseWidth) / 2,
      y: 0,
      w: this.baseWidth,
      hue: firstHue,
      landT: 1,
    });
    this.topY = BLOCK_H;
    this.camY = 0;
    if (global.Actors) global.Actors.reset(this, this.enemyCfg);
    this.onScore(0);
    this.reportProgress();
    this.emit('cells', { cells: this.actors ? this.actors.cells : 0, maxCells: this.actors ? this.actors.maxCells : 0 });
    this.spawnMoving();
    this.setState('playing');
    if (!this.running) this.loop(0);
  };

  /** Gives the player a fresh, playable block after a rewarded ad or coins. */
  NeonStack.prototype.revive = function () {
    if ((this.state !== 'over' && this.state !== 'dying') || this.revived) return false;
    this.revived = true;
    this.combo = 0;
    var w = 92;
    this.blocks.push({
      x: (VW - w) / 2,
      y: this.topY,
      w: w,
      hue: this.nextHue(),
      landT: 1,
    });
    this.topY += BLOCK_H;
    this.stacked += 1;
    // A fresh start also clears the hostiles that killed it.
    if (global.Actors) {
      var a = global.Actors.reset(this, this.enemyCfg);
      a.cells = Math.min(2, a.maxCells);
      this.emit('cells', { cells: a.cells, maxCells: a.maxCells });
      if (this.bossStarted && this.enemyCfg && this.enemyCfg.boss > 0) {
        // Do not make the player re-earn the whole boss fight.
        global.Actors.startBoss(this, Math.max(2, Math.round(this.enemyCfg.boss / 2)));
      }
    }
    this.spawnMoving();
    this.setState('playing');
    this.reportProgress();
    if (!this.running) this.loop(0);
    return true;
  };

  NeonStack.prototype.pause = function () {
    if (this.state === 'playing') this.setState('paused');
  };

  NeonStack.prototype.resume = function () {
    if (this.state === 'paused') this.setState('playing');
  };

  NeonStack.prototype.stop = function () {
    this.running = false;
    if (this.raf) global.cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  NeonStack.prototype.reportProgress = function () {
    this.onProgress({
      stacked: this.stacked,
      goal: this.goal,
      perfects: this.perfects,
      remaining: this.mode === 'level' ? Math.max(0, this.goal - this.stacked) : 0,
    });
  };

  NeonStack.prototype.stats = function () {
    var a = this.actors;
    return {
      mode: this.mode,
      score: this.score,
      stacked: this.stacked,
      perfects: this.perfects,
      bestCombo: this.bestCombo,
      goal: this.goal,
      reachedGoal: this.mode === 'level' && this.stacked >= this.goal,
      kills: a ? a.kills : 0,
      cells: a ? a.cells : 0,
      bossFought: this.bossStarted,
      bossDefeated: a ? a.phase === 'won' : false,
      reason: this.runReason,
      zen: this.zen,
      record: this.record,
    };
  };

  /* --------------------------- gameplay --------------------------- */

  NeonStack.prototype.spawnMoving = function () {
    var top = this.blocks[this.blocks.length - 1];
    var w = top.w;
    var dir = this.blocks.length % 2 === 1 ? 1 : -1;
    var xMin = -w * 0.22;
    var xMax = VW - w * 0.78;
    this.moving = {
      x: dir > 0 ? xMin : xMax,
      w: w,
      y: this.topY,
      dir: dir,
      hue: this.hue,
      t: 0,
    };
  };

  NeonStack.prototype.speed = function () {
    // Endless scales with score (perfects accelerate the game), levels scale
    // with blocks placed so a long level does not outrun the player's hands.
    var base = this.mode === 'level'
      ? MIN_SPEED + this.stacked * LEVEL_SPEED_STEP
      : MIN_SPEED + this.score * SPEED_STEP;
    return Math.min(HARD_MAX_SPEED, Math.min(MAX_SPEED, base) * this.speedMul);
  };

  NeonStack.prototype.tap = function () {
    if (this.state === 'playing' && this.moving) this.drop();
  };

  NeonStack.prototype.drop = function () {
    var m = this.moving;
    var prev = this.blocks[this.blocks.length - 1];

    var overlapL = Math.max(prev.x, m.x);
    var overlapR = Math.min(prev.x + prev.w, m.x + m.w);
    var overlap = overlapR - overlapL;

    if (overlap <= 1 || overlap < MIN_PLAYABLE_WIDTH) {
      this.pieces.push({
        x: m.x, y: m.y, w: m.w, hue: m.hue, landT: 1,
        vx: m.dir * 90, vy: -40, rot: 0, vr: m.dir * 3.2,
      });
      this.moving = null;
      if (this.zen) {
        // Zen: the block is simply lost. No fail, no cells, no drama.
        this.combo = 0;
        this.addText(VW / 2, this.topY + 40, 'MISSED', '#94a3b8');
        this.spawnMoving();
        return;
      }
      this.endRun('miss');
      return;
    }

    var perfect = Math.abs(m.x - prev.x) <= this.perfectTol;
    var hue = this.nextHue();
    var block;

    if (perfect) {
      this.combo += 1;
      this.perfects += 1;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      block = { x: prev.x, y: this.topY, w: m.w, hue: m.hue, landT: 0 };
      var gain = 1 + this.combo;
      this.score += gain;
      this.flash = 1;
      this.burst(prev.x + prev.w / 2, this.topY + BLOCK_H, m.hue, 14);
      this.addText(prev.x + prev.w / 2, this.topY + BLOCK_H + 6, '+' + gain, '#fde68a');
      this.shakeIt(3.5, 0.14);
      this.onPerfect(this.combo, this.perfects);
      if (global.Sfx) global.Sfx.perfect(this.combo);
      this.haptic(12);
      // Every few perfects tops the drone's cells back up: playing well is the
      // real defence, not playing safe.
      if (global.Actors) {
        global.Actors.cheer(this);
        global.Actors.rewardCell(this);
      }
    } else {
      this.combo = 0;
      if (m.x < prev.x) {
        this.pieces.push({
          x: m.x, y: this.topY, w: prev.x - m.x, hue: m.hue, landT: 1,
          vx: -70, vy: -30, rot: 0, vr: -2.6,
        });
      } else {
        this.pieces.push({
          x: prev.x + prev.w, y: this.topY, w: m.x + m.w - (prev.x + prev.w),
          hue: m.hue, landT: 1, vx: 70, vy: -30, rot: 0, vr: 2.6,
        });
      }
      block = { x: overlapL, y: this.topY, w: overlap, hue: hue, landT: 0 };
      this.score += 1;
      this.burst(overlapL + overlap / 2, this.topY, m.hue, 7);
      this.shakeIt(5, 0.16);
      if (global.Sfx) global.Sfx.slice();
      this.haptic(8);
    }

    // Hostiles resolve the moment the block touches down: a crawler under it is
    // crushed, a turret under it destroys the block instead.
    if (global.Actors && this.actors) {
      var destroyed = global.Actors.onLanding(this, block, perfect);
      if (destroyed) {
        this.moving = null;
        this.onScore(this.score);
        this.reportProgress();
        this.spawnMoving();
        return;
      }
    }

    this.blocks.push(block);
    this.record.push([block.x, block.w]);
    this.topY += BLOCK_H;
    this.stacked += 1;
    this.wobble = 1;
    // A hairline landing is the most exciting thing that can happen in this
    // game, so the game briefly holds its breath for it.
    if (!perfect && overlap < 9 && this.opts.motion) {
      this.slowT = 0.45;
    }
    this.moving = null;
    this.onScore(this.score);
    this.reportProgress();
    if (global.Sfx) global.Sfx.drop(this.blocks.length);

    if (block.w < 16) {
      this.addText(block.x + block.w / 2, this.topY + 10, 'THIN!', '#fca5a5');
    }

    // Level flow: a finale hands over to its Warden before the deck can clear.
    if (this.mode === 'level' && this.stacked >= this.goal) {
      var hasBoss = !!(this.enemyCfg && this.enemyCfg.boss > 0);
      if (hasBoss && !this.bossStarted) {
        this.bossStarted = true;
        global.Actors.startBoss(this, this.enemyCfg.boss);
        this.addText(VW / 2, this.topY + 96, 'WARDEN', '#c4b5fd');
        this.shakeIt(9, 0.45);
        if (global.Sfx) global.Sfx.turret();
      } else if (!hasBoss) {
        this.celebrate();
        return;
      }
    }

    if (this.bossStarted && global.Actors.bossDefeated(this)) {
      this.celebrate();
      return;
    }

    this.spawnMoving();
  };

  NeonStack.prototype.celebrate = function () {
    this.victory = true;
    this.setState('complete');
    if (global.Actors) global.Actors.cheer(this);
    this.timeScale = 1;
    this.slowT = 0;
    this.completeT = 0;
    this.moving = null;
    this.flash = 1;
    this.shakeIt(6, 0.3);

    // Fit the whole tower on screen for the payoff shot.
    var need = this.topY + BLOCK_H + 70;
    var fit = this.cssH / (this.baseScale * need);
    this.fitZoom = clamp(fit, 0.35, 1);

    // Fireworks up the tower.
    for (var i = 0; i < this.blocks.length; i += 2) {
      this.burst(this.blocks[i].x + this.blocks[i].w / 2, this.blocks[i].y + BLOCK_H, this.blocks[i].hue, 5);
    }
    if (global.Sfx) global.Sfx.victory();
    this.haptic([15, 40, 15, 40, 30]);
  };

  NeonStack.prototype.endRun = function (reason) {
    if (reason) this.runReason = reason;
    this.setState('dying');
    this.dyingT = 0;
    this.burst(VW / 2, this.topY, this.hue, Math.min(28, 10 + this.score));
    this.shakeIt(14, 0.5);
    if (global.Sfx) global.Sfx.gameOver();
    this.haptic([20, 60, 30]);
  };

  NeonStack.prototype.shakeIt = function (mag, dur) {
    if (!this.opts.motion) return;      // reduce-motion: no camera shake at all
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shake = Math.max(this.shake, dur);
  };

  NeonStack.prototype.burst = function (x, y, hue, count) {
    // Motion off still shows some feedback, just far less of it.
    if (!this.opts.motion) count = Math.min(count, 4);
    if (this.particles.length > 200) return;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 190;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a)) * sp + 40,
        life: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 3.5,
        hue: hue + (Math.random() * 40 - 20),
      });
    }
  };

  NeonStack.prototype.addText = function (x, y, text, color) {
    this.texts.push({ x: x, y: y, text: text, color: color, life: 0.9 });
  };

  /* --------------------------- loop --------------------------- */

  NeonStack.prototype.loop = function (t) {
    var self = this;
    if (!this.running) {
      this.running = true;
      this.lastT = t || 0;
    }
    this.raf = global.requestAnimationFrame(function (now) {
      self.loop(now);
    });
    var dt = Math.min((t - this.lastT) / 1000, 0.05) * this.timeScale;
    this.lastT = t;
    if (dt < 0) dt = 0;
    this.update(dt);
    this.render(dt);
  };

  NeonStack.prototype.update = function (dt) {
    var i, p;

    if (this.state === 'playing' && this.moving) {
      var m = this.moving;
      var sp = this.speed();
      m.x += m.dir * sp * dt;
      m.t += dt;
      var xMin = -m.w * 0.22;
      var xMax = VW - m.w * 0.78;
      if (m.x <= xMin) { m.x = xMin; m.dir = 1; }
      else if (m.x >= xMax) { m.x = xMax; m.dir = -1; }
    }

    // Crawlers, turrets and the Warden live their own lives in actors.js.
    if (global.Actors) global.Actors.update(this, dt);

    for (i = this.pieces.length - 1; i >= 0; i--) {
      p = this.pieces[i];
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (this.sy(p.y) > this.viewH + 260) this.pieces.splice(i, 1);
    }

    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.vy -= 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (i = this.texts.length - 1; i >= 0; i--) {
      p = this.texts[i];
      p.y += 46 * dt;
      p.life -= dt;
      if (p.life <= 0) this.texts.splice(i, 1);
    }

    for (i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.landT < 1) b.landT = Math.min(1, b.landT + dt / 0.13);
    }

    // Victory camera: pull back until the whole tower fits, then sit still.
    if (this.victory && !this.victoryDone) {
      this.completeT += dt;
      if (this.zoom > this.fitZoom) {
        this.zoom += (this.fitZoom - this.zoom) * Math.min(1, dt * 3.2);
        if (this.zoom < this.fitZoom) this.zoom = this.fitZoom;
        this.applyZoom();
      }
      if (this.completeT > COMPLETE_HOLD) {
        this.victoryDone = true;
        this.setState('over');
        this.onLevelComplete(this.stats());
      }
    }

    var target = this.cameraTarget();
    this.camY += (target - this.camY) * Math.min(1, dt * CAM_LERP);
    var targetX = this.cameraXTarget();
    this.camX += (targetX - this.camX) * Math.min(1, dt * CAM_LERP);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.shake === 0) this.shakeMag = 0;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.4);

    // Feel timers. Both are skipped entirely under reduce-motion.
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt / Math.max(this.timeScale, 0.05));
      this.timeScale = 0.42;
      if (this.slowT === 0) this.timeScale = 1;
    } else if (this.timeScale !== 1) {
      this.timeScale = Math.min(1, this.timeScale + dt * 3);
    }
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt * 4.2);

    if (this.state === 'dying') {
      this.dyingT += dt;
      if (this.dyingT > 0.55) {
        this.setState('over');
        this.onGameOver(this.score, this.stats());
      }
    }
  };

  /* --------------------------- rendering --------------------------- */

  NeonStack.prototype.render = function () {
    var ctx = this.ctx;
    var i, b;

    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);

    var shx = 0, shy = 0;
    if (this.shake > 0) {
      var k = this.shakeMag * this.shake;
      shx = (Math.random() * 2 - 1) * k;
      shy = (Math.random() * 2 - 1) * k;
    }
    ctx.translate(shx, shy);
    // camX is 0 except during the victory pull-back.
    ctx.translate(-this.camX, 0);

    this.drawBackground(ctx);
    if (this.ghost) this.drawGhost(ctx);

    var top = this.blocks.length - 1;
    for (i = 0; i <= top; i++) {
      b = this.blocks[i];
      var sTop = this.sy(b.y + BLOCK_H);
      var sBot = this.sy(b.y);
      if (sBot < -40) continue;
      if (sTop > this.viewH + 60 && i !== top) continue;
      // Landing ripple: the top few blocks sway, so a drop has some weight.
      var wob = 0;
      if (this.wobble > 0) {
        var fromTop = top - i;
        if (fromTop < 6) {
          wob = Math.sin(this.wobble * 13 - fromTop * 0.9) * this.wobble * 2.4 * (1 - fromTop / 6);
        }
      }
      this.drawBlock(ctx, b, sTop, sBot, i === top && this.victory, wob);
    }

    for (i = 0; i < this.pieces.length; i++) this.drawPiece(ctx, this.pieces[i]);
    this.drawParticles(ctx);

    if (this.moving) {
      var m = this.moving;
      var bob = Math.sin(m.t * 5.2) * 1.6;
      ctx.save();
      ctx.shadowColor = hsl(m.hue, 95, 60);
      ctx.shadowBlur = 18;
      this.drawBlock(
        ctx,
        { x: m.x, y: m.y + bob, w: m.w, hue: m.hue, landT: 1 },
        this.sy(m.y + bob + BLOCK_H),
        this.sy(m.y + bob),
        true
      );
      ctx.restore();

      var prev = this.blocks[top];
      if (prev && Math.abs(m.x - prev.x) <= this.perfectTol) {
        ctx.save();
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(prev.x - 3, this.sy(this.topY + BLOCK_H) - 4);
        ctx.lineTo(prev.x + prev.w + 3, this.sy(this.topY + BLOCK_H) - 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Actors last: the incoming block must never hide a turret or a crawler.
    if (global.Actors) global.Actors.draw(this, ctx);

    this.drawTexts(ctx);

    if (this.flash > 0 && this.opts.motion) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.28 * this.flash).toFixed(3) + ')';
      ctx.fillRect(this.camX - 20, -20, this.visibleW() + 40, this.viewH + 40);
    }
  };

  NeonStack.prototype.drawBackground = function (ctx) {
    var pal = this.palette;
    var hue = pal.bg + (this.hueIndex * 0.6) % 40;
    var left = this.camX - 20;
    var width = this.visibleW() + 40;
    if (this.opts.contrast) {
      // Flat and dark: a busy background fights the thing you are reading.
      ctx.fillStyle = hsl(hue, 40, 7);
      ctx.fillRect(left, -20, width, this.viewH + 40);
      return;
    }
    var grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, hsl(hue, 45, 8));
    grad.addColorStop(0.55, hsl(hue + 25, 55, 12));
    grad.addColorStop(1, hsl(hue + 45, 60, 17));
    ctx.fillStyle = grad;
    ctx.fillRect(left, -20, width, this.viewH + 40);

    var off = (this.camY * 0.22) % 1400;
    var right = this.camX + this.visibleW() + 10;
    var vleft = this.camX - 10;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      if (s.x < vleft || s.x > right) continue;
      var y = s.y - off;
      if (y < -10) y += 1400;
      if (y > this.viewH + 10) continue;
      ctx.globalAlpha = s.a * (0.5 + 0.5 * Math.sin((y + this.camY) * 0.01));
      ctx.fillRect(s.x, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    var baseY = this.sy(0);
    if (baseY < this.viewH + 40) {
      var g2 = ctx.createRadialGradient(VW / 2, baseY, 4, VW / 2, baseY, 150);
      g2.addColorStop(0, 'rgba(120, 200, 255, 0.22)');
      g2.addColorStop(1, 'rgba(120, 200, 255, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, baseY - 150, VW, 300);
    }
  };

  NeonStack.prototype.drawBlock = function (ctx, b, sTop, sBot, highlight, wobble) {
    var x = b.x;
    var w = b.w;
    var squash = b.landT < 1 ? (1 - b.landT) * 6 : 0;
    sTop += squash + (wobble || 0);
    sBot += wobble || 0;
    var h = sBot - sTop;
    var ww = Math.max(w, 0.5);
    var contrast = this.opts.contrast;

    ctx.fillStyle = hsl(b.hue, 55, 30);
    ctx.beginPath();
    ctx.moveTo(x + w, sTop);
    ctx.lineTo(x + w + DEPTH_X, sTop - DEPTH_Y);
    ctx.lineTo(x + w + DEPTH_X, sBot - DEPTH_Y);
    ctx.lineTo(x + w, sBot);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hsl(b.hue, 80, 68);
    ctx.beginPath();
    ctx.moveTo(x, sTop);
    ctx.lineTo(x + DEPTH_X, sTop - DEPTH_Y);
    ctx.lineTo(x + w + DEPTH_X, sTop - DEPTH_Y);
    ctx.lineTo(x + w, sTop);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hsl(b.hue, 78, contrast ? (highlight ? 68 : 60) : highlight ? 60 : 50);
    ctx.fillRect(x, sTop, ww, h);

    if (contrast) {
      // A crisp edge round every block, so the tower's silhouette is unambiguous.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.6, sTop + 0.6, ww - 1.2, h - 1.2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, sTop, ww, Math.min(2.5, h * 0.2));
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(x, sBot - Math.min(4, h * 0.3), ww, Math.min(4, h * 0.3));
  };

  /** The best run, as a faint silhouette to race against. */
  NeonStack.prototype.drawGhost = function (ctx) {
    var g = this.ghost;
    ctx.save();
    ctx.fillStyle = this.opts.contrast ? 'rgba(203, 213, 225, 0.26)' : 'rgba(148, 163, 184, 0.15)';
    for (var i = 0; i < g.length; i++) {
      var sTop = this.sy((i + 1) * BLOCK_H);
      if (sTop > this.viewH + 40) continue;
      ctx.fillRect(g[i][0], sTop, g[i][1], BLOCK_H - 1.5);
    }
    ctx.restore();
  };

  NeonStack.prototype.drawPiece = function (ctx, p) {
    var sTop = this.sy(p.y + BLOCK_H);
    var sBot = this.sy(p.y);
    ctx.save();
    ctx.translate(p.x + p.w / 2, (sTop + sBot) / 2);
    ctx.rotate(p.rot);
    ctx.fillStyle = hsl(p.hue, 70, 52);
    ctx.fillRect(-p.w / 2, -BLOCK_H / 2, p.w, BLOCK_H);
    ctx.fillStyle = hsl(p.hue, 80, 72);
    ctx.fillRect(-p.w / 2, -BLOCK_H / 2, p.w, 3);
    ctx.restore();
  };

  NeonStack.prototype.drawParticles = function (ctx) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var a = clamp(p.life / 0.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = hsl(p.hue, 90, 65);
      var s = p.size * (0.4 + a * 0.6);
      ctx.fillRect(p.x - s / 2, this.sy(p.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };

  NeonStack.prototype.drawTexts = function (ctx) {
    if (!this.texts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      ctx.globalAlpha = clamp(t.life / 0.9, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, this.sy(t.y));
    }
    ctx.restore();
  };

  global.NeonStack = NeonStack;
  global.NeonStack.VW = VW;
})(window);
