/**
 * actors.js - everything alive in Neon Stack.
 *
 * NS-7 (the drone you are getting up the tower), the things trying to stop it,
 * and the Wardens that guard each chapter's transmitter.
 *
 * The engine calls four functions:
 *   Actors.reset(g, cfg)        - new run
 *   Actors.update(g, dt)        - every frame while playing
 *   Actors.onLanding(g, block)  - a block just landed; returns true if the block
 *                                 was destroyed (the engine then refuses to stack it)
 *   Actors.draw(g, ctx)         - after the tower, before the moving block
 *
 * Design notes:
 *  - A crawler survives any block that does not land on it. It grabs the new
 *    deck and keeps coming. The only way to remove one is to crush it, which
 *    turns every drop into "extend the tower *and* cover that thing".
 *  - A turret is the opposite: landing on it destroys your block, so you want it
 *    sliced off the edge instead. Same verb, opposite decision.
 *  - Cells are the player's life bar. Perfect drops refill them, so the safe way
 *    to survive is to get good rather than to play scared.
 */
(function (global) {
  'use strict';

  var DRONE_HOVER = 46;        // world units the drone floats above the deck
  var DRONE_HIT_RANGE = 15;    // crawler reach
  var CRAWLER_MARGIN = 5;      // keeps crawlers on the top block's surface
  var TURRET_SIZE = 26;
  var BOSS_HOVER = 132;
  var CELL_STREAK = 3;         // perfects needed for a free cell

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsl(h, s, l) { return 'hsl(' + (((h % 360) + 360) % 360) + ',' + s + '%,' + l + '%)'; }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function topBlock(g) {
    return g.blocks[g.blocks.length - 1];
  }

  /* ===================== lifecycle ===================== */

  function blank() {
    return {
      cfg: null,
      crawlers: [],
      turrets: [],
      boss: null,
      phase: 'climb',      // climb | boss | won
      crawlerT: 0,
      turretT: 0,
      invulnT: 0,
      kills: 0,
      perfectStreak: 0,
      cells: 3,
      maxCells: 5,
      char: { x: 180, y: 0, t: 0, hurtT: 0, happyT: 0, deadT: 0, dead: false, lookX: 0, alert: 0, face: 1 },
    };
  }

  function reset(g, cfg) {
    var a = blank();
    a.cfg = cfg || null;
    if (cfg) {
      a.cells = cfg.batteries || 3;
      a.maxCells = Math.max(5, a.cells);
      // First crawler of a deck arrives a little early, then the cadence settles.
      a.crawlerT = cfg.crawlerEvery ? Math.min(4, cfg.crawlerEvery) : 0;
      a.turretT = cfg.turretEvery ? Math.min(8, cfg.turretEvery) : 0;
    }
    g.actors = a;
    var top = topBlock(g);
    if (top) {
      a.char.x = top.x + top.w / 2;
      a.char.y = g.topY + DRONE_HOVER;
    }
    return a;
  }

  function ensure(g) {
    if (!g.actors) reset(g, null);
    return g.actors;
  }

  /* ===================== spawning ===================== */

  function spawnCrawler(g, opts) {
    var a = ensure(g);
    var top = topBlock(g);
    var c = a.char;
    // Walk in from whichever edge is further from the drone.
    var fromLeft = c.x > top.x + top.w / 2;
    var x = fromLeft ? top.x + CRAWLER_MARGIN : top.x + top.w - CRAWLER_MARGIN;
    var crawler = {
      x: x,
      y: g.topY,
      t: Math.random() * 3,
      face: fromLeft ? 1 : -1,
      climbT: 0,
      boss: !!(opts && opts.boss),
    };
    a.crawlers.push(crawler);
    g.emit('crawlerSpawned', { count: a.crawlers.length });
    if (global.Sfx) global.Sfx.crawler();
    return crawler;
  }

  function spawnTurret(g) {
    var a = ensure(g);
    var top = topBlock(g);
    if (top.w < 70) return null;   // no room to place around it on a thin tower
    // Sit it away from the middle so both choices stay open.
    var leftSide = Math.random() < 0.5;
    var x = top.x + (leftSide ? top.w * 0.28 : top.w * 0.72);
    var turret = { x: x, y: g.topY, t: 0, threat: 0 };
    a.turrets.push(turret);
    g.emit('turretSpawned', {});
    if (global.Sfx) global.Sfx.turret();
    return turret;
  }

  function startBoss(g, hp) {
    var a = ensure(g);
    a.phase = 'boss';
    a.boss = {
      hp: hp,
      maxHp: hp,
      x: 180,
      y: g.topY + BOSS_HOVER,
      t: 0,
      spawnT: 3.5,
      hitT: 0,
      dead: false,
    };
    g.emit('bossSpawned', { hp: hp, maxHp: hp });
  }

  function bossActive(g) {
    var a = ensure(g);
    return !!(a.boss && !a.boss.dead);
  }

  function bossDefeated(g) {
    var a = ensure(g);
    return a.phase === 'won';
  }

  /* ===================== damage ===================== */

  function rewardCell(g) {
    var a = ensure(g);
    a.perfectStreak += 1;
    if (a.perfectStreak < CELL_STREAK) return false;
    a.perfectStreak = 0;
    if (a.cells >= a.maxCells) return false;
    a.cells += 1;
    var c = a.char;
    g.addText(c.x, c.y + 24, '+1 CELL', '#6ee7b7');
    g.burst(c.x, c.y, 150, 10);
    if (global.Sfx) global.Sfx.coin();
    g.emit('cells', { cells: a.cells, maxCells: a.maxCells, gained: true });
    return true;
  }

  function hitDrone(g, crawler) {
    var a = ensure(g);
    if (a.invulnT > 0) return;
    var c = a.char;
    c.hurtT = 0.7;
    a.invulnT = 1.4;
    a.cells -= 1;
    g.burst(crawler.x, crawler.y + 8, 0, 16);
    g.shakeIt(11, 0.32);
    if (global.Sfx) global.Sfx.hurt();
    g.haptic([25, 40, 25]);
    g.emit('droneHit', { cells: a.cells, maxCells: a.maxCells });

    if (a.cells <= 0) {
      c.dead = true;
      c.deadT = 0;
      g.burst(c.x, c.y, 0, 34);
      g.shakeIt(18, 0.6);
      if (global.Sfx) global.Sfx.gameOver();
      g.emit('droneDead', {});
      g.endRun('destroyed');
    }
  }

  function killCrawler(g, crawler, how) {
    var a = ensure(g);
    a.kills += 1;
    g.burst(crawler.x, crawler.y + 6, 5, 12);
    g.addText(crawler.x, crawler.y + 26, how === 'crush' ? 'CRUSHED' : 'DROPPED', '#fca5a5');
    if (global.Sfx) global.Sfx.crush();
    g.emit('crawlerKilled', { how: how, kills: a.kills });
  }

  /* ===================== landing resolution ===================== */

  /**
   * Called by the engine the moment a block lands (before it is stacked).
   * Returns true when the block was destroyed and must not join the tower.
   */
  function onLanding(g, block, perfect) {
    var a = ensure(g);
    var top = topBlock(g);
    var left = block.x;
    var right = block.x + block.w;

    // --- turrets: landing on one destroys the block -------------------------
    for (var i = a.turrets.length - 1; i >= 0; i--) {
      var t = a.turrets[i];
      if (t.x > left - TURRET_SIZE / 2 && t.x < right + TURRET_SIZE / 2) {
        a.turrets.splice(i, 1);
        g.burst(t.x, t.y + 6, 10, 26);
        g.shakeIt(14, 0.42);
        if (global.Sfx) global.Sfx.explode();
        g.haptic([15, 30, 15]);
        g.emit('turretBlast', {});
        // Everything standing on this deck loses its footing.
        for (var k2 = a.crawlers.length - 1; k2 >= 0; k2--) {
          killCrawler(g, a.crawlers[k2], 'crush');
          a.crawlers.splice(k2, 1);
        }
        return true;
      }
    }

    // --- crawlers: covered = crushed, anything else = it climbs back on ------
    for (var j = a.crawlers.length - 1; j >= 0; j--) {
      var k = a.crawlers[j];
      if (k.x >= left && k.x <= right) {
        a.crawlers.splice(j, 1);
        killCrawler(g, k, 'crush');
      } else {
        k.climbT = 0.3;   // scrambles up onto the new deck
      }
    }

    // --- turrets that were sliced off the edge fall with the debris ----------
    // Anything the blast check above already consumed is gone; every turret left
    // standing is on the strip that just got cut away.
    var blastL = left - TURRET_SIZE / 2;
    var blastR = right + TURRET_SIZE / 2;
    for (var m = a.turrets.length - 1; m >= 0; m--) {
      var tt = a.turrets[m];
      if (tt.x >= blastL && tt.x <= blastR) continue;
      a.turrets.splice(m, 1);
      g.burst(tt.x, tt.y + 4, 10, 14);
      g.addText(tt.x, tt.y + 30, 'CUT LOOSE', '#93c5fd');
      g.emit('turretCut', {});
    }

    // --- the Warden takes a hit every time you build on its floor -----------
    if (a.boss && !a.boss.dead) {
      var dmg = perfect ? 2 : 1;
      a.boss.hp -= dmg;
      a.boss.hitT = 0.35;
      g.burst(a.boss.x, g.topY + BOSS_HOVER, 275, 18);
      g.shakeIt(7, 0.22);
      if (global.Sfx) global.Sfx.bossHit();
      g.emit('bossHit', { hp: Math.max(0, a.boss.hp), maxHp: a.boss.maxHp, damage: dmg });
      if (a.boss.hp <= 0) {
        a.boss.dead = true;
        a.phase = 'won';
        g.burst(a.boss.x, g.topY + BOSS_HOVER, 275, 46);
        g.shakeIt(20, 0.7);
        if (global.Sfx) global.Sfx.explode();
        g.emit('bossDefeated', {});
      }
    }

    return false;
  }

  /* ===================== per-frame ===================== */

  function update(g, dt) {
    var a = ensure(g);
    var c = a.char;
    var top = topBlock(g);

    c.t += dt;
    if (c.hurtT > 0) c.hurtT = Math.max(0, c.hurtT - dt);
    if (c.happyT > 0) c.happyT = Math.max(0, c.happyT - dt);
    if (a.invulnT > 0) a.invulnT = Math.max(0, a.invulnT - dt);
    if (a.boss && a.boss.hitT > 0) a.boss.hitT = Math.max(0, a.boss.hitT - dt);
    for (var q = 0; q < a.crawlers.length; q++) {
      if (a.crawlers[q].climbT > 0) a.crawlers[q].climbT = Math.max(0, a.crawlers[q].climbT - dt);
    }

    if (!top) return;

    // The drone rides the deck it is standing on.
    var targetX = top.x + top.w / 2;
    c.x += (targetX - c.x) * Math.min(1, dt * 7);
    var targetY = g.topY + DRONE_HOVER;
    c.y += (targetY - c.y) * Math.min(1, dt * 13);

    // Freeze hostiles whenever the run is not live (paused, dying, celebrating).
    if (g.state !== 'playing') return;
    if (!a.cfg) return;

    // --- spawns -------------------------------------------------------------
    if (a.cfg.crawlerEvery > 0 && a.crawlers.length < a.cfg.maxCrawlers &&
        g.score >= (a.cfg.crawlerFromScore || 0)) {
      a.crawlerT -= dt;
      if (a.crawlerT <= 0) {
        spawnCrawler(g);
        a.crawlerT = a.cfg.crawlerEvery;
      }
    }
    if (a.cfg.turrets && a.turrets.length < a.cfg.maxTurrets &&
        g.score >= (a.cfg.turretFromScore || 0)) {
      a.turretT -= dt;
      if (a.turretT <= 0) {
        if (spawnTurret(g)) a.turretT = a.cfg.turretEvery;
        else a.turretT = 3;
      }
    }

    // --- the Warden ---------------------------------------------------------
    if (a.boss && !a.boss.dead) {
      a.boss.t += dt;
      a.boss.x = clamp(180 + Math.sin(a.boss.t * 0.55) * 66, 96, 264);
      a.boss.y += ((g.topY + BOSS_HOVER) - a.boss.y) * Math.min(1, dt * 3);
      a.boss.spawnT -= dt;
      if (a.boss.spawnT <= 0) {
        a.boss.spawnT = a.cfg.bossCrawlerEvery || 6;
        if (a.crawlers.length < 3) spawnCrawler(g, { boss: true });
      }
    }

    // --- crawlers -----------------------------------------------------------
    var nearest = null;
    var nearestD = 1e9;
    for (var i = a.crawlers.length - 1; i >= 0; i--) {
      var k = a.crawlers[i];
      k.t += dt;

      // Stay on top of the current deck no matter how far it has been cut back.
      k.x = clamp(k.x, top.x + CRAWLER_MARGIN, top.x + top.w - CRAWLER_MARGIN);
      k.y = g.topY;

      var dir = c.x >= k.x ? 1 : -1;
      k.face = dir;
      k.x += dir * (a.cfg.crawlerSpeed || 14) * dt;

      var d = Math.abs(k.x - c.x);
      if (d < nearestD) { nearestD = d; nearest = k; }

      if (d < DRONE_HIT_RANGE) {
        a.crawlers.splice(i, 1);
        hitDrone(g, k);
        if (c.dead) return;
      }
    }

    // --- the drone's mood ---------------------------------------------------
    var incoming = g.moving ? g.moving.x + g.moving.w / 2 : c.x;
    c.lookX = nearest ? clamp((nearest.x - c.x) / 26, -1.6, 1.6) : clamp((incoming - c.x) / 40, -1.6, 1.6);
    c.alert = nearest ? clamp(1 - nearestD / 130, 0, 1) : 0;
    c.face = (nearest ? nearest.x : incoming) >= c.x ? 1 : -1;
  }

  function cheer(g) {
    var a = ensure(g);
    a.char.happyT = 0.45;
  }

  function annoyed(g) {
    var a = ensure(g);
    a.char.hurtT = Math.max(a.char.hurtT, 0.3);
  }

  /* ===================== drawing ===================== */

  function draw(g, ctx) {
    var a = g.actors;
    if (!a) return;
    var top = topBlock(g);
    if (!top) return;

    // Enemies sit on the deck; the drone floats above it; the Warden hangs higher.
    if (a.boss) drawBoss(g, ctx, a.boss);
    for (var i = 0; i < a.turrets.length; i++) drawTurret(g, ctx, a.turrets[i], g.moving, top);
    for (var j = 0; j < a.crawlers.length; j++) drawCrawler(g, ctx, a.crawlers[j]);
    if (!a.char.dead) drawDrone(g, ctx, a.char);
  }

  function drawDrone(g, ctx, c) {
    var a = g.actors;
    var x = c.x;
    var y = g.sy(c.y) + Math.sin(c.t * 3.4) * 1.8;
    var hurtFlash = c.hurtT > 0 && Math.floor(c.hurtT * 24) % 2 === 0;
    var blink = a.invulnT > 0 && Math.floor(a.invulnT * 16) % 2 === 0;
    var happy = c.happyT > 0;
    var alert = c.alert;
    var scale = happy ? 1 + c.happyT * 0.25 : 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.face * 0.05 + alert * c.face * 0.06);
    ctx.scale(scale, scale);

    // thruster plumes
    var flick = 0.6 + Math.random() * 0.4;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = hurtFlash ? '#fca5a5' : '#67e8f9';
    ctx.beginPath();
    ctx.moveTo(-9, 8);
    ctx.lineTo(-5, 8);
    ctx.lineTo(-7, 8 + 9 * flick);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, 8);
    ctx.lineTo(9, 8);
    ctx.lineTo(7, 8 + 9 * flick);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // antenna
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(2, -15);
    ctx.stroke();
    ctx.fillStyle = Math.sin(c.t * 6) > 0.4 ? '#fde68a' : '#475569';
    ctx.beginPath();
    ctx.arc(2, -15.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // body
    var bodyFill = hurtFlash ? '#f87171' : blink ? '#e2e8f0' : '#7dd3fc';
    var grad = ctx.createLinearGradient(0, -10, 0, 9);
    grad.addColorStop(0, bodyFill);
    grad.addColorStop(1, hurtFlash ? '#991b1b' : '#2563eb');
    ctx.fillStyle = grad;
    roundRect(ctx, -15, -10, 30, 19, 7);
    ctx.fill();
    if (g.opts && g.opts.contrast) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // face plate
    ctx.fillStyle = 'rgba(8, 15, 30, 0.86)';
    roundRect(ctx, -12, -7, 24, 11, 5);
    ctx.fill();

    // eye
    var ex = clamp(c.lookX * 3.4, -6.5, 6.5);
    var eyeColor = happy ? '#a7f3d0' : alert > 0.45 ? '#fca5a5' : '#67e8f9';
    ctx.fillStyle = eyeColor;
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = happy ? 12 : 7;
    if (happy) {
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(ex, -0.5, 3.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(ex, -1.5, 2.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // grip arms
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.lineTo(-19, 6);
    ctx.moveTo(15, 2);
    ctx.lineTo(19, 6);
    ctx.stroke();

    ctx.restore();

    // aggro pip when something is closing in
    if (alert > 0.5 && !happy) {
      ctx.fillStyle = 'rgba(248, 113, 113, ' + (0.4 + 0.6 * alert).toFixed(2) + ')';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - 22);
    }
  }

  /**
   * Crawlers are the one thing that can kill you, so they get the loudest
   * silhouette in the game: dark outline, hot glow, and they visibly swell as
   * they close on the drone.
   */
  function drawCrawler(g, ctx, k) {
    var sy = g.sy(k.y);
    var step = Math.sin(k.t * 11) * 1.4;
    var climb = k.climbT > 0 ? 1 - k.climbT / 0.3 : 0;
    var dist = Math.abs(k.x - g.actors.char.x);
    var urgency = clamp(1 - dist / 110, 0, 1);
    var scale = 1 + urgency * 0.28;
    var bob = Math.sin(k.t * 11) * 0.7 - climb * 7;
    var contrast = g.opts && g.opts.contrast;

    ctx.save();
    ctx.translate(k.x, sy + bob);
    ctx.scale(k.face * scale, scale);

    ctx.shadowColor = 'rgba(239, 68, 68, ' + (0.45 + urgency * 0.5).toFixed(2) + ')';
    ctx.shadowBlur = 9 + urgency * 10;

    // legs: three per side, scuttling
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.8;
    for (var i = -1; i <= 1; i++) {
      var off = i * 5;
      ctx.beginPath();
      ctx.moveTo(off, -6);
      ctx.lineTo(off + step * (i % 2 === 0 ? 1 : -1), 0);
      ctx.stroke();
    }

    // shell
    var grad = ctx.createLinearGradient(0, -17, 0, -6);
    grad.addColorStop(0, '#fda4af');
    grad.addColorStop(0.5, '#ef4444');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    roundRect(ctx, -10, -17, 20, 11, 4.5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // dark rim keeps it readable against dark decks
    ctx.strokeStyle = contrast ? '#ffffff' : '#450a0a';
    ctx.lineWidth = contrast ? 2.2 : 1.4;
    ctx.stroke();

    // spine plates
    ctx.strokeStyle = 'rgba(69, 10, 10, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -16.5);
    ctx.lineTo(-2, -6.5);
    ctx.moveTo(3, -16.5);
    ctx.lineTo(3, -6.5);
    ctx.stroke();

    // eye
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(6.5, -11.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawTurret(g, ctx, t, moving, top) {
    var sy = g.sy(t.y);
    var pulse = 0.5 + 0.5 * Math.sin(t.t * 4);
    var armed = moving && moving.x < t.x + TURRET_SIZE / 2 && moving.x + moving.w > t.x - TURRET_SIZE / 2;

    // danger marker - this is the "do not drop here" sign
    var alpha = armed ? 0.55 + 0.35 * pulse : 0.22;
    ctx.strokeStyle = 'rgba(248, 113, 113, ' + alpha.toFixed(2) + ')';
    ctx.lineWidth = armed ? 2 : 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(t.x - TURRET_SIZE / 2, sy - 30);
    ctx.lineTo(t.x + TURRET_SIZE / 2, sy - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    if (armed) {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.14)';
      ctx.fillRect(t.x - TURRET_SIZE / 2, sy - 30, TURRET_SIZE, 30);
    }

    // base
    ctx.fillStyle = contrast ? '#cbd5e1' : '#334155';
    roundRect(ctx, t.x - TURRET_SIZE / 2, sy - 13, TURRET_SIZE, 13, 4);
    ctx.fill();
    ctx.fillStyle = contrast ? '#0f172a' : '#1e293b';
    ctx.fillRect(t.x - TURRET_SIZE / 2 + 2, sy - 4, TURRET_SIZE - 4, 3);
    if (contrast) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(t.x - TURRET_SIZE / 2 + 0.8, sy - 12.2, TURRET_SIZE - 1.6, 12.4);
    }

    // lens
    ctx.fillStyle = 'rgba(248, 113, 113, ' + (0.45 + 0.55 * pulse).toFixed(2) + ')';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = armed ? 14 : 7;
    ctx.beginPath();
    ctx.arc(t.x, sy - 13, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (contrast) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(t.x, sy - 13, 5.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBoss(g, ctx, b) {
    if (b.dead) return;
    var sy = g.sy(b.y);
    var hpFrac = clamp(b.hp / b.maxHp, 0, 1);
    var flash = b.hitT > 0;

    ctx.save();
    ctx.translate(b.x, sy);

    // shield rings
    for (var r = 0; r < 2; r++) {
      var rad = 34 + r * 9;
      ctx.strokeStyle = flash ? 'rgba(252, 165, 165, 0.9)' : 'rgba(167, 139, 250, ' + (0.5 - r * 0.18) + ')';
      ctx.lineWidth = 2.5 - r;
      ctx.beginPath();
      ctx.arc(0, 0, rad, b.t * (0.5 + r * 0.3), b.t * (0.5 + r * 0.3) + Math.PI * (1.2 + r * 0.3));
      ctx.stroke();
    }

    // body
    var grad = ctx.createLinearGradient(0, -26, 0, 26);
    grad.addColorStop(0, flash ? '#fecdd3' : '#4c1d95');
    grad.addColorStop(1, flash ? '#be123c' : '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var ang = (Math.PI / 3) * i - Math.PI / 2;
      var px = Math.cos(ang) * 28;
      var py = Math.sin(ang) * 24;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // eye, tracking the drone
    var dir = clamp((g.actors.char.x - b.x) / 60, -1, 1);
    ctx.fillStyle = flash ? '#ffffff' : '#f87171';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(dir * 5, -1, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.arc(dir * 5 + dir * 2, -1, 3, 0, Math.PI * 2);
    ctx.fill();

    // health ticks
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    roundRect(ctx, -26, -40, 52, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = hpFrac > 0.5 ? '#4ade80' : hpFrac > 0.25 ? '#fbbf24' : '#f87171';
    roundRect(ctx, -25, -39, 50 * hpFrac, 3, 1.5);
    ctx.fill();

    ctx.restore();
  }

  global.Actors = {
    reset: reset,
    ensure: ensure,
    update: update,
    onLanding: onLanding,
    draw: draw,
    startBoss: startBoss,
    bossActive: bossActive,
    bossDefeated: bossDefeated,
    rewardCell: rewardCell,
    cheer: cheer,
    annoyed: annoyed,
    spawnCrawler: spawnCrawler,
    droneXY: function (g) {
      var a = ensure(g);
      return { x: a.char.x, y: a.char.y };
    },
    cells: function (g) {
      var a = ensure(g);
      return { cells: a.cells, maxCells: a.maxCells };
    },
    kills: function (g) { return ensure(g).kills; },
    crawlerCount: function (g) { return ensure(g).crawlers.length; },
    DRONE_HOVER: DRONE_HOVER,
  };
})(window);
