/**
 * towers.js - the four defences, their projectiles, and the damage model.
 *
 * DAMAGE CLASSES
 *   Every threat belongs to one of `code | injection | malware`, and every
 *   damage-dealing tower is better against one class than the others. This is
 *   the whole strategic layer: a wall of Firewalls is the correct answer to a
 *   Code Smell swarm and the wrong answer to a Ransomware, and the player can
 *   see that in the numbers rather than having to memorise a wiki.
 *
 *   The multipliers are deliberately lopsided (1.6 / 1.0 / 0.6) rather than
 *   subtle. A 10% edge is not a decision, it is a rounding error.
 */
(function (global) {
  'use strict';

  var TILE = 40;

  /* ------------------------------------------------------------------ *
   * Definitions
   * ------------------------------------------------------------------ */

  var DEFS = {
    firewall: {
      id: 'firewall',
      name: 'Firewall',
      short: 'Firewall',
      blurb: 'Cheap, fast, single target. Shreds swarms. Injection walks through it.',
      cost: 60,
      range: 96,
      damage: 7,
      rate: 0.5,          // seconds between shots
      shot: 'tracer',
      accent: '#22d3ee',
      bonus: { code: 1.5, injection: 0.55, malware: 1.0 },
      upgrade: { cost: 45, damage: 1.45, range: 1.06 },
    },
    waf: {
      id: 'waf',
      name: 'WAF',
      blurb: 'Splash damage. Built to catch injection attacks before they land.',
      cost: 110,
      range: 88,
      damage: 14,
      rate: 1.2,
      splash: 42,
      shot: 'shell',
      accent: '#a78bfa',
      bonus: { code: 1.0, injection: 1.6, malware: 0.7 },
      upgrade: { cost: 80, damage: 1.4, range: 1.08 },
    },
    limiter: {
      id: 'limiter',
      name: 'Rate Limiter',
      short: 'Limiter',
      blurb: 'No damage. Slows everything in range to a crawl. Best value in the game.',
      cost: 85,
      range: 96,
      damage: 0,
      rate: 0,
      slow: 0.45,          // multiplier: 0.45 means 55% slower
      shot: null,
      accent: '#4ade80',
      bonus: {},
      upgrade: { cost: 60, damage: 1, range: 1.12, slow: 0.86 },
    },
    av: {
      id: 'av',
      name: 'Antivirus',
      short: 'Antivirus',
      blurb: 'Long range, heavy hitter. Malware only gets this far once.',
      cost: 150,
      range: 134,
      damage: 26,
      rate: 1.35,
      shot: 'beam',
      accent: '#f59e0b',
      bonus: { code: 0.8, injection: 1.0, malware: 1.7 },
      upgrade: { cost: 110, damage: 1.5, range: 1.07 },
    },

    /*
     * The two researched types.
     *
     * Both are deliberately *not* damage dealers, because a new tower that just
     * out-damages the old ones is not new content - it is a reason the old ones
     * were a waste of credits. These answer two problems the starting four
     * cannot touch: identifying what is coming, and getting integrity back.
     */
    honeypot: {
      id: 'honeypot',
      name: 'Honeypot',
      short: 'Honeypot',
      blurb: 'Deals no damage. Marks everything nearby: marked threats take more and pay double.',
      cost: 70,
      range: 104,
      damage: 0,
      rate: 0,
      shot: null,
      tag: 1.25,            // damage multiplier applied to tagged threats
      tagBounty: 2,         // and what their bounty is multiplied by
      accent: '#f472b6',
      bonus: {},
      // Range grows fastest, because the whole job is covering more road.
      upgrade: { cost: 55, damage: 1, range: 1.12, tagMul: 1.08 },
    },
    patch: {
      id: 'patch',
      name: 'Patch Queue',
      short: 'Patch',
      blurb: 'Deals no damage. Repairs PROD integrity while it stands, up to full.',
      cost: 130,
      range: 0,
      damage: 0,
      rate: 0,
      shot: null,
      heal: 0.55,           // integrity points per second
      accent: '#34d399',
      bonus: {},
      upgrade: { cost: 90, damage: 1, range: 1, healMul: 1.35 },
    },
  };

  /**
   * Palette order. The researched types are last on purpose: a locked slot at
   * the end of the row advertises the BASE screen without pushing the four
   * towers a new player actually has off toward the middle.
   */
  var ORDER = ['firewall', 'waf', 'limiter', 'av', 'honeypot', 'patch'];
  var MAX_LEVEL = 3;

  function def(id) { return DEFS[id]; }
  function list() { return ORDER.map(function (id) { return DEFS[id]; }); }
  function order() { return ORDER.slice(); }

  /**
   * Permanent research, read through Base if it is loaded.
   *
   * Returns neutral values rather than throwing when Base is absent, so a page
   * that failed to load base.js still plays the game - just without research.
   */
  function research(type) {
    if (!global.Base) return { costMul: 1, damageMul: 1, rangeMul: 1 };
    return global.Base.statBonus(type);
  }

  /**
   * What this tower type costs to build, after research.
   *
   * This is the single reader for a build price. DEFS[type].cost stays the
   * unscaled number so the BASE screen can show a base price and a discount
   * side by side, and so the discount cannot be applied twice on the way
   * through the UI.
   */
  function cost(type) {
    var d = DEFS[type];
    if (!d) return 0;
    return Math.round(d.cost * research(type).costMul);
  }

  /** Effective stats for a tower at its current level, including research. */
  function stats(tower) {
    var d = DEFS[tower.type];
    var lv = tower.level || 1;
    var out = {
      range: d.range,
      damage: d.damage,
      rate: d.rate,
      splash: d.splash || 0,
      slow: d.slow === undefined ? 1 : d.slow,
      tag: d.tag || 1,
      tagBounty: d.tagBounty || 1,
      heal: d.heal || 0,
      bonus: d.bonus,
    };
    for (var i = 1; i < lv; i++) {
      out.range *= d.upgrade.range;
      out.damage *= d.upgrade.damage;
      if (d.slow !== undefined && d.upgrade.slow) out.slow *= d.upgrade.slow;
      if (d.upgrade.tagMul) out.tag *= d.upgrade.tagMul;
      if (d.upgrade.healMul) out.heal *= d.upgrade.healMul;
    }

    // Research applies after the in-battle levels, so a rank always means the
    // same relative improvement whatever the tower's level happens to be.
    var r = research(tower.type);
    out.range *= r.rangeMul;
    out.damage *= r.damageMul;
    return out;
  }

  /** Cost to take a tower to its next level, or null if maxed. */
  function upgradeCost(tower) {
    if (tower.level >= MAX_LEVEL) return null;
    var d = DEFS[tower.type];
    return Math.round(d.upgrade.cost * Math.pow(1.7, tower.level - 1));
  }

  /**
   * Refund on sale: 60% of everything invested.
   *
   * Reads `tower.invested` rather than recomputing, because place() and
   * upgrade() already accumulate it. Recomputing from the definition table
   * would double-count the upgrade costs - and it would also lose the research
   * discount, paying the player back a percentage of a price they never paid.
   */
  function sellValue(tower) {
    var invested = tower.invested;
    if (!invested) {
      var d = DEFS[tower.type];
      invested = cost(tower.type);
      for (var i = 1; i < tower.level; i++) {
        invested += Math.round(d.upgrade.cost * Math.pow(1.7, i - 1));
      }
    }
    return Math.floor(invested * 0.6);
  }

  /* ------------------------------------------------------------------ *
   * Placement
   * ------------------------------------------------------------------ */

  function at(game, c, r) {
    for (var i = 0; i < game.towers.length; i++) {
      var t = game.towers[i];
      if (t.c === c && t.r === r) return t;
    }
    return null;
  }

  /**
   * Can this type go on this tile right now? Returns the same reasons place()
   * reports, so the drag preview and the actual drop can never disagree about
   * whether a spot is legal.
   */
  function canPlace(game, c, r, type, map) {
    if (!DEFS[type]) return { ok: false, reason: 'unknown tower' };
    // The gate lives here, in the one function both the preview and the drop
    // call, rather than in the palette that hides the card. Hiding a card is a
    // presentation decision; this is the rule.
    if (!available(type)) return { ok: false, reason: 'not researched' };
    if (!map.isBuildable(c, r)) return { ok: false, reason: 'blocked tile' };
    if (at(game, c, r)) return { ok: false, reason: 'tile occupied' };
    if (game.bandwidth < cost(type)) return { ok: false, reason: 'not enough bandwidth' };
    return { ok: true };
  }

  /**
   * Has this type been unlocked on the BASE screen?
   *
   * Fails open when base.js is absent, so the four starting towers keep working
   * on a page where the research module failed to load.
   */
  function available(type) {
    if (!global.Base || !global.Base.towerUnlocked) return true;
    return global.Base.towerUnlocked(type);
  }

  function place(game, c, r, type, map) {
    var check = canPlace(game, c, r, type, map);
    if (!check.ok) return check;

    var price = cost(type);
    game.bandwidth -= price;
    var p = map.tileToWorld(c, r);
    var tower = {
      type: type, c: c, r: r, x: p.x, y: p.y,
      level: 1, cooldown: 0, angle: -Math.PI / 2,
      // `invested` is what this tower actually cost, research discount
      // included. sellValue() refunds a share of it, so a discounted tower must
      // not refund the undiscounted price.
      disabledUntil: 0, shots: 0, damageDone: 0, invested: price,
    };
    game.towers.push(tower);
    return { ok: true, tower: tower };
  }

  function upgrade(game, tower) {
    var price = upgradeCost(tower);
    if (price === null) return { ok: false, reason: 'fully upgraded' };
    if (game.bandwidth < price) return { ok: false, reason: 'not enough bandwidth' };
    game.bandwidth -= price;
    tower.level += 1;
    tower.invested += price;
    return { ok: true, cost: price };
  }

  function sell(game, tower) {
    var refund = sellValue(tower);
    game.bandwidth += refund;
    var i = game.towers.indexOf(tower);
    if (i >= 0) game.towers.splice(i, 1);
    return { ok: true, refund: refund };
  }

  /* ------------------------------------------------------------------ *
   * Targeting
   * ------------------------------------------------------------------ */

  function inRange(tower, threat, range) {
    var dx = threat.x - tower.x, dy = threat.y - tower.y;
    return dx * dx + dy * dy <= range * range;
  }

  /**
   * Pick a target. Default is "furthest along the road", which is the only
   * rule that keeps a tower from shooting things that will never reach the
   * base while the actual threat walks past it.
   */
  function pickTarget(tower, game, range) {
    var best = null;
    for (var i = 0; i < game.threats.length; i++) {
      var t = game.threats[i];
      if (t.dead || t.leaked) continue;
      if (!inRange(tower, t, range)) continue;
      if (!best) { best = t; continue; }

      if (tower.mode === 'strongest') {
        if (t.hp > best.hp) best = t;
      } else if (tower.mode === 'closest') {
        var dt = (t.x - tower.x) * (t.x - tower.x) + (t.y - tower.y) * (t.y - tower.y);
        var db = (best.x - tower.x) * (best.x - tower.x) + (best.y - tower.y) * (best.y - tower.y);
        if (dt < db) best = t;
      } else {
        if (t.dist > best.dist) best = t;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Combat
   * ------------------------------------------------------------------ */

  function multiplier(def, cls) {
    var m = def.bonus && def.bonus[cls];
    return m === undefined ? 1 : m;
  }

  /** Apply damage; returns the damage actually dealt (0 if immune). */
  function damage(game, threat, raw, type) {
    var d = DEFS[type];
    if (!d) return 0;

    /*
     * Resistances are read from the threat *instance*, which spawn() fills in
     * from the definition and the level's escalation tuning.
     *
     * The history here is worth keeping. The values were once read from
     * `threat.def` at damage time, and spawn() never copied them onto the
     * threat, so the Zero-Day took full Firewall damage while its briefing
     * promised immunity. Reading the instance rather than the definition is
     * what lets a level add armour to every threat without inventing a second
     * place for the number to live.
     */
    var immune = threat.immune;
    if (immune && immune.indexOf(type) !== -1) {
      threat.resisted = true;
      return 0;
    }

    var amount = raw * multiplier(d, threat.cls);

    // Flat armour, not a percentage: that is the whole point of it. It costs a
    // 7-damage Firewall shot 60% of its damage and a 26-damage Antivirus shot
    // 15%, which is what turns "more Firewalls" into a losing plan late on.
    var armour = threat.armour || 0;
    if (armour) amount = Math.max(1, amount - armour);

    threat.hp -= amount;
    threat.flash = 0.12;
    return amount;
  }

  function fire(game, tower, st, target) {
    var d = DEFS[tower.type];
    var angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    tower.angle = angle;
    tower.shots += 1;

    if (d.shot === 'tracer') {
      // Hitscan: resolve immediately, then show the line briefly.
      var dealt = damage(game, target, st.damage, tower.type);
      tower.damageDone += dealt;
      game.shots.push({
        kind: 'tracer', x: tower.x, y: tower.y,
        tx: target.x, ty: target.y, life: 0.09, max: 0.09, accent: d.accent, dealt: dealt,
      });
    } else if (d.shot === 'beam') {
      var dealt2 = damage(game, target, st.damage, tower.type);
      tower.damageDone += dealt2;
      game.shots.push({
        kind: 'beam', x: tower.x, y: tower.y,
        tx: target.x, ty: target.y, life: 0.22, max: 0.22, accent: d.accent, dealt: dealt2,
      });
    } else if (d.shot === 'shell') {
      // Travel time, so leading a fast target is possible to get wrong.
      var dist = Math.hypot(target.x - tower.x, target.y - tower.y);
      game.shots.push({
        kind: 'shell', x: tower.x, y: tower.y,
        tx: target.x, ty: target.y, target: target,
        speed: 260, life: dist / 260 + 0.5, max: dist / 260 + 0.5,
        splash: st.splash, damage: st.damage, accent: d.accent, type: tower.type,
        travelled: 0, total: dist,
      });
    }
  }

  function update(game, dt, map) {
    var i, j;

    // Towers: cooldowns, firing, and the Rate Limiter's aura.
    for (i = 0; i < game.towers.length; i++) {
      var tower = game.towers[i];
      var st = stats(tower);
      tower.range = st.range;

      var offline = tower.disabledUntil > game.time;
      if (offline) continue;

      var d = DEFS[tower.type];
      if (d.shot === null) {
        // Rate Limiter: pure aura, applied every frame so it stops instantly
        // when the threat leaves range.
        for (j = 0; j < game.threats.length; j++) {
          var th = game.threats[j];
          if (th.dead || th.leaked) continue;
          if (inRange(tower, th, st.range)) th.slowMul = Math.min(th.slowMul, st.slow);
        }
        continue;
      }

      tower.cooldown -= dt;
      var target = pickTarget(tower, game, st.range);
      if (!target) continue;
      if (tower.cooldown <= 0) {
        tower.cooldown = st.rate;
        fire(game, tower, st, target);
      } else {
        // Track the target while waiting, so turrets aim like turrets.
        var want = Math.atan2(target.y - tower.y, target.x - tower.x);
        var diff = Math.atan2(Math.sin(want - tower.angle), Math.cos(want - tower.angle));
        tower.angle += diff * Math.min(1, dt * 10);
      }
    }

    // Projectiles.
    for (i = game.shots.length - 1; i >= 0; i--) {
      var s = game.shots[i];
      s.life -= dt;

      if (s.kind === 'shell') {
        // Home in on the target's current position; if it died, keep flying to
        // where it was so the shot still lands and splashes.
        if (s.target && !s.target.dead && !s.target.leaked) {
          s.tx = s.target.x;
          s.ty = s.target.y;
        }
        var dx = s.tx - s.x, dy = s.ty - s.y;
        var dist = Math.hypot(dx, dy);
        var stepLen = s.speed * dt;
        if (dist <= stepLen) {
          // Impact: splash everything in radius.
          for (j = 0; j < game.threats.length; j++) {
            var t2 = game.threats[j];
            if (t2.dead || t2.leaked) continue;
            var ddx = t2.x - s.tx, ddy = t2.y - s.ty;
            if (ddx * ddx + ddy * ddy <= s.splash * s.splash) {
              // Full damage at the centre, half at the rim.
              var falloff = 1 - 0.5 * (Math.hypot(ddx, ddy) / s.splash);
              damage(game, t2, s.damage * falloff, s.type);
            }
          }
          game.effects.push({ kind: 'blast', x: s.tx, y: s.ty, r: s.splash, life: 0.28, max: 0.28, accent: s.accent });
          game.shots.splice(i, 1);
          continue;
        }
        s.x += (dx / dist) * stepLen;
        s.y += (dy / dist) * stepLen;
        s.travelled += stepLen;
      }

      if (s.life <= 0) game.shots.splice(i, 1);
    }

    // Effects.
    for (i = game.effects.length - 1; i >= 0; i--) {
      game.effects[i].life -= dt;
      if (game.effects[i].life <= 0) game.effects.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function drawRange(ctx, tower, ok) {
    var st = stats(tower);
    ctx.save();
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, st.range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(34, 211, 238, 0.07)' : 'rgba(248, 113, 113, 0.08)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(34, 211, 238, 0.45)' : 'rgba(248, 113, 113, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.restore();
  }

  function drawTower(ctx, tower, time) {
    var d = DEFS[tower.type];
    var offline = tower.disabledUntil > time;
    var lv = tower.level;

    ctx.save();
    ctx.translate(tower.x, tower.y);

    // Pad.
    ctx.fillStyle = 'rgba(8, 16, 28, 0.95)';
    ctx.strokeStyle = offline ? 'rgba(248, 113, 113, 0.9)' : d.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = offline ? 0.4 : 1;

    // Each tower type gets a silhouette that reads at 40 units without a label.
    if (tower.type === 'firewall') {
      // A wall: staggered bricks.
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 1.6;
      for (var row = 0; row < 2; row++) {
        var y = -4 + row * 5;
        var off = row % 2 ? 3 : 0;
        ctx.beginPath();
        ctx.moveTo(-7 + off, y); ctx.lineTo(-1 + off, y);
        ctx.moveTo(1 + off, y); ctx.lineTo(7, y);
        ctx.stroke();
      }
    } else if (tower.type === 'waf') {
      // A filter: funnel with three gates.
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, -7); ctx.lineTo(8, -7);
      ctx.lineTo(2, 2); ctx.lineTo(2, 8);
      ctx.lineTo(-2, 8); ctx.lineTo(-2, 2);
      ctx.closePath();
      ctx.stroke();
    } else if (tower.type === 'limiter') {
      // A valve wheel, turning slowly.
      ctx.save();
      ctx.rotate((time || 0) * 0.9);
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.stroke();
      for (var k = 0; k < 3; k++) {
        var a = (k / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Antivirus: a scanning wedge aimed at the last target.
      ctx.save();
      ctx.rotate(tower.angle);
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -7); ctx.lineTo(9, 0); ctx.lineTo(-4, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, -5); ctx.lineTo(2, 5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = 1;

    // Level pips, drawn as barrel notches on the pad.
    for (var p = 0; p < lv; p++) {
      var ang = -Math.PI / 2 + (p - (lv - 1) / 2) * 0.42;
      ctx.fillStyle = d.accent;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 17.5, Math.sin(ang) * 17.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (offline) {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.95)';
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, 4);
    }

    ctx.restore();
  }

  function drawShots(ctx, game) {
    var i;
    for (i = 0; i < game.shots.length; i++) {
      var s = game.shots[i];
      var t = Math.max(0, s.life / s.max);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = s.accent || '#22d3ee';
      ctx.fillStyle = s.accent || '#22d3ee';

      if (s.kind === 'tracer') {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.tx, s.ty);
        ctx.stroke();
      } else if (s.kind === 'beam') {
        ctx.lineWidth = 3.5;
        ctx.globalAlpha = t * 0.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.tx, s.ty);
        ctx.stroke();
        ctx.globalAlpha = t;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.tx, s.ty);
        ctx.stroke();
      } else if (s.kind === 'shell') {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    for (i = 0; i < game.effects.length; i++) {
      var e = game.effects[i];
      var k = 1 - e.life / e.max;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = e.accent || '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.35 + k * 0.65), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  global.Towers = {
    DEFS: DEFS,
    def: def,
    list: list,
    order: order,
    // The only reader for a build price. Exported because the BASE screen and
    // the palette both have to quote the same number the placement charges.
    cost: cost,
    stats: stats,
    upgradeCost: upgradeCost,
    sellValue: sellValue,
    MAX_LEVEL: MAX_LEVEL,
    at: at,
    canPlace: canPlace,
    place: place,
    upgrade: upgrade,
    sell: sell,
    pickTarget: pickTarget,
    multiplier: multiplier,
    damage: damage,
    update: update,
    drawRange: drawRange,
    drawTower: drawTower,
    drawShots: drawShots,
  };
})(window);
