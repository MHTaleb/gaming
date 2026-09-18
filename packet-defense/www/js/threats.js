/**
 * threats.js - the things walking down the road at your server.
 *
 * Each threat gets one idea, not a stat block. A Code Smell is only interesting
 * because there are forty of them; an XSS is only interesting because killing it
 * makes two more; a Ransomware is only interesting because it turns your towers
 * off as it walks past. If two threats play the same way, one of them is dead
 * weight and should be cut.
 *
 * Movement is a single scalar: how far along the road this threat has walked.
 * Everything else - position, heading, whether it has arrived - is derived from
 * that. It makes leaks, targeting ("furthest along the road") and slow effects
 * all fall out of one number instead of three that can disagree.
 */
(function (global) {
  'use strict';

  /*
   * Bounties are deliberately small.
   *
   * The first pass paid roughly what the threats felt worth, and the balance
   * bot finished PRODUCTION with eight thousand bandwidth unspent. When money
   * is free, tower choice stops mattering and every level plays the same: buy
   * everything, three stars, next. Income has to be tight enough that the
   * player is always choosing between the tower they want and the tower they
   * can afford, so a bounty is now a nudge and the starting budget is the
   * real allowance.
   */
  var DEFS = {
    smell: {
      id: 'smell', name: 'Code Smell', cls: 'code',
      hp: 22, speed: 46, bounty: 1, leak: 4, radius: 7,
      colour: '#84cc16',
      tell: 'Arrives in numbers. Firewall food.',
    },
    sqli: {
      id: 'sqli', name: 'SQL Injection', cls: 'injection',
      hp: 44, speed: 66, bounty: 2, leak: 6, radius: 8,
      colour: '#f97316',
      tell: 'Fast, and Firewalls barely scratch it.',
    },
    xss: {
      id: 'xss', name: 'XSS', cls: 'code',
      hp: 36, speed: 54, bounty: 3, leak: 6, radius: 8,
      // One generation only. Two generations turned a single XSS into seven
      // payouts, which made this threat a piggy bank rather than a problem.
      splits: { into: 'xss', count: 2, hpFactor: 0.4, minHp: 6, maxGeneration: 1, bountyMul: 0.35 },
      colour: '#e879f9',
      tell: 'Splits in two every time it dies.',
    },
    zombie: {
      id: 'zombie', name: 'Zombie Process', cls: 'malware',
      hp: 60, speed: 40, bounty: 4, leak: 7, radius: 9,
      colour: '#a3a3a3',
      revives: 1,
      tell: 'Gets back up once. Antivirus finishes it properly.',
    },
    ransom: {
      id: 'ransom', name: 'Ransomware', cls: 'malware',
      hp: 130, speed: 36, bounty: 9, leak: 10, radius: 11,
      armour: 4,
      /*
       * reach must exceed 40 - one tile - or the ability can never fire.
       *
       * Towers sit on tile centres and the road runs through tile centres, so
       * the closest a tower's centre ever gets to the road is exactly one tile
       * away. The first value here was 30, which is less than the minimum
       * possible distance, so the Ransomware walked past everything and the
       * ability was silently dead code.
       *
       * At 52 the rule is legible: a tower built hard against the road is at
       * risk, one set back a row is safe. maxTargets stops a single threat from
       * switching off an entire defence on one pass.
       */
      disables: { seconds: 4, reach: 52, maxTargets: 2 },
      colour: '#ef4444',
      tell: 'Armoured, and shuts down any tower it passes.',
    },
    botnet: {
      id: 'botnet', name: 'DDoS Botnet', cls: 'code',
      hp: 7, speed: 74, bounty: 1, leak: 3, radius: 6,
      colour: '#38bdf8',
      tell: 'Harmless alone. There are never just one.',
    },
    zeroday: {
      id: 'zeroday', name: 'Zero-Day', cls: 'malware',
      hp: 1400, speed: 28, bounty: 90, leak: 100, radius: 16,
      armour: 8,
      immune: ['firewall', 'waf'],
      boss: true,
      colour: '#f43f5e',
      tell: 'No signature exists. Firewalls and WAFs cannot see it.',
    },
  };

  function def(id) { return DEFS[id]; }

  /* ------------------------------------------------------------------ *
   * Escalation
   * ------------------------------------------------------------------ */

  /**
   * Traits are how the same six threats stay interesting for twelve levels.
   *
   * A level does not get harder by multiplying hit points alone - that just
   * makes the same fight longer. It gets harder by taking away the answer the
   * player used last time. `swift` punishes leaning on the Rate Limiter,
   * `regenerating` punishes chip damage from cheap towers, `hardened` punishes
   * many small hits and rewards the expensive ones, `saboteur` punishes
   * leaning on a single strong tower, and `reviving` punishes leaving things
   * at one hit point.
   *
   * Each one is small, visible on the threat, and named on the briefing, so the
   * player can see the counter-argument before the wave starts.
   */
  var TRAITS = {
    hardened: {
      id: 'hardened', name: 'Hardened', colour: '#93c5fd',
      blurb: 'Layered armour. Small hits barely register; heavy hitters are unaffected.',
    },
    swift: {
      id: 'swift', name: 'Swiftshade', colour: '#fbbf24',
      blurb: 'Shrugs off most of a Rate Limiter: slowing it does a third of what it should.',
    },
    regenerating: {
      id: 'regenerating', name: 'Regenerating', colour: '#4ade80',
      blurb: 'Knits itself back together if you stop hitting it for a moment.',
    },
    saboteur: {
      id: 'saboteur', name: 'Saboteur', colour: '#f87171',
      blurb: 'Reaches further and cuts towers down for longer.',
    },
    reviving: {
      id: 'reviving', name: 'Undying', colour: '#c4b5fd',
      blurb: 'Gets back up one more time than it should.',
    },
  };

  var SABOTEUR_REACH_BONUS = 16;
  var SABOTEUR_SECONDS_BONUS = 1.6;
  var SWIFT_SLOW_RESIST = 0.35;   // a slow lands at 35% strength, not 0: still worth building
  var REGEN_RATE = 0.055;         // fraction of maxHp per second
  var REGEN_DELAY = 1.4;          // seconds without being hit before it starts

  /**
   * Threats below this much base health never get level armour.
   *
   * Flat reduction is the whole point of armour, but it only reads as a rule
   * when it lands on something that looks like it has plating. Two versions of
   * this went wrong first:
   *
   *  - at a threshold of 0, a 7 HP DDoS drone took two Firewall shots instead of
   *    one and a level made entirely of drones became twice as long for no
   *    reason the player could see;
   *  - at 30, armour still landed on SQL Injection and XSS, and since those two
   *    are the bulk of the mid-game the whole campaign needed its wave tables
   *    cut by a fifth to stay winnable. Armour stopped being a statement about
   *    big threats and became a flat tax on everything.
   *
   * At 60 it covers the Zombie Process, the Ransomware and the boss, which is
   * exactly the set a player would describe as armoured, and leaves the chaff
   * and the mid-weight threats doing what they were designed to do.
   */
  var ARMOUR_MIN_HP = 60;

  function hasTrait(t, id) {
    return !!(t.traits && t.traits.indexOf(id) !== -1);
  }

  /* ------------------------------------------------------------------ *
   * Spawning
   * ------------------------------------------------------------------ */

  function spawn(game, typeId, opts) {
    opts = opts || {};
    var d = DEFS[typeId];
    if (!d) return null;

    var hpScale = opts.hpScale || 1;
    var traits = (opts.traits || []).slice();
    // Level armour is plating, and plating only goes on things big enough to
    // carry it. See ARMOUR_MIN_HP.
    var bonusArmour = d.hp >= ARMOUR_MIN_HP ? (opts.armourBonus || 0) : 0;
    var armour = (d.armour || 0) + bonusArmour;

    var t = {
      type: typeId,
      def: d,
      cls: d.cls,
      hp: d.hp * hpScale,
      maxHp: d.hp * hpScale,
      baseSpeed: d.speed * (opts.speedScale || 1),
      speed: d.speed * (opts.speedScale || 1),
      slowMul: 1,
      dist: opts.dist || 0,
      radius: (d.radius || 8) * (opts.scale || 1),
      x: 0, y: 0, angle: 0,
      // Fragments pay less. A split child is a piece of the thing you already
      // killed, not a fresh threat, and paying full price made XSS the most
      // profitable enemy in the game.
      bountyMul: opts.bountyMul === undefined ? 1 : opts.bountyMul,
      revived: 0,
      flash: 0,
      resisted: false,
      disabled: [],       // towers already sabotaged, so it happens once each
      dead: false,
      leaked: false,
      wobble: (opts.seed || 0) * 6.283,
      traits: traits,
    };

    /*
     * Resistance, sabotage and revival live on the *instance*, copied from the
     * definition at spawn.
     *
     * They used to be read straight off `t.def` at damage time, which is how
     * the Zero-Day's immunity silently did nothing for a whole phase: spawn()
     * never copied it and damage() looked for it in the wrong place. Now there
     * is exactly one home for the runtime value, and the level tuning below can
     * change it per level without inventing a second source of truth.
     */
    t.immune = (d.immune || []).slice();
    t.armour = armour;
    t.revives = (d.revives || 0) + (hasTrait(t, 'reviving') ? 1 : 0);
    t.hurtAt = null;

    if (d.disables) {
      t.sabotage = {
        seconds: d.disables.seconds + (hasTrait(t, 'saboteur') ? SABOTEUR_SECONDS_BONUS : 0),
        reach: d.disables.reach + (hasTrait(t, 'saboteur') ? SABOTEUR_REACH_BONUS : 0),
        maxTargets: d.disables.maxTargets,
      };
    }

    game.threats.push(t);
    return t;
  }

  /* ------------------------------------------------------------------ *
   * Update
   * ------------------------------------------------------------------ */

  function kill(game, t) {
    t.dead = true;
    var d = t.def;
    var bounty = Math.max(1, Math.round(d.bounty * (t.bountyMul === undefined ? 1 : t.bountyMul)));
    game.kills += 1;
    game.bandwidth += bounty;
    game.earned = (game.earned || 0) + bounty;
    // Tracked apart from the total, because "where did the money come from" is
    // the first question when a level will not balance: a level leaning on bonus
    // income plays completely differently from one leaning on bounties.
    game.killIncome = (game.killIncome || 0) + bounty;

    game.effects.push({
      kind: 'burst', x: t.x, y: t.y, r: t.radius * 2.4,
      life: 0.32, max: 0.32, accent: d.colour,
    });

    // Splitting is resolved here rather than in a per-threat update, so a
    // chain of splits happens in one frame and cannot outrun the loop that is
    // iterating the threat list.
    if (d.splits && (t.generation || 0) < (d.splits.maxGeneration === undefined ? 1 : d.splits.maxGeneration)) {
      var childHp = Math.max(d.splits.minHp, t.maxHp * d.splits.hpFactor);
      for (var i = 0; i < d.splits.count; i++) {
        var child = spawn(game, d.splits.into, {
          dist: t.dist - i * 9,
          scale: 0.75,
          seed: Math.random(),
          hpScale: 1,
          bountyMul: d.splits.bountyMul === undefined ? 1 : d.splits.bountyMul,
        });
        if (child) {
          child.hp = childHp;
          child.maxHp = childHp;
          child.generation = (t.generation || 0) + 1;
          child.baseSpeed = t.baseSpeed * 1.15;
        }
      }
      game.effects.push({ kind: 'burst', x: t.x, y: t.y, r: 26, life: 0.3, max: 0.3, accent: '#e879f9' });
    }

    if (game.onKill) game.onKill(t);
  }

  function leak(game, t) {
    t.leaked = true;
    game.leaks += 1;

    // PROD hardening scales the damage a leak does, never the number of leaks.
    // That difference is the whole point of the upgrade: it buys you slack on a
    // level that is beating you, and it cannot turn a wave that walks through
    // into a wave you survive. Read per leak rather than cached at spawn so the
    // balance bot, which can buy research mid-simulation, sees the same number
    // the HUD will.
    var mul = (global.Base && global.Base.leakMultiplier) ? global.Base.leakMultiplier() : 1;
    var cost = Math.round(t.def.leak * mul * 10) / 10;

    game.uptime = Math.max(0, game.uptime - cost);
    game.lastLeak = { type: t.type, cost: cost, at: game.time };
    game.effects.push({
      kind: 'leak', x: t.x, y: t.y, r: 40, life: 0.5, max: 0.5, accent: '#f87171',
    });
    if (game.onLeak) game.onLeak(t);
  }

  function update(game, dt, map) {
    var i, j;
    var pathLen = map.pathLength();

    for (i = 0; i < game.threats.length; i++) {
      var t = game.threats[i];
      if (t.dead || t.leaked) continue;

      if (t.flash > 0) t.flash -= dt;

      // Slow is recomputed from scratch by the towers every frame, so it must
      // be reset before that runs or a single hit would slow a threat forever.
      t.slowMul = 1;

      // Sabotage: a Ransomware disables towers it walks past, once each, up to
      // a cap so one threat cannot silence the whole defence.
      var dis = t.sabotage;
      if (dis && game.status === 'wave' && t.disabled.length < (dis.maxTargets || 99)) {
        for (j = 0; j < game.towers.length; j++) {
          var tw = game.towers[j];
          if (t.disabled.indexOf(tw) !== -1) continue;
          if (t.disabled.length >= (dis.maxTargets || 99)) break;
          var dx = tw.x - t.x, dy = tw.y - t.y;
          if (dx * dx + dy * dy <= dis.reach * dis.reach) {
            tw.disabledUntil = game.time + dis.seconds;
            t.disabled.push(tw);
            game.effects.push({
              kind: 'zap', x: tw.x, y: tw.y, r: 22, life: 0.4, max: 0.4, accent: '#ef4444',
            });
            if (game.onSabotage) game.onSabotage(t, tw);
          }
        }
      }
    }

    // Towers apply their slow auras, then movement is integrated. Order matters:
    // moving first would use last frame's slow.
    if (global.Towers) global.Towers.update(game, dt, map);

    for (i = game.threats.length - 1; i >= 0; i--) {
      var th = game.threats[i];
      if (th.dead || th.leaked) {
        game.threats.splice(i, 1);
        continue;
      }

      // Swift threats get their slow partially refunded. Done here, after the
      // towers have applied their auras, because that is the only point where
      // slowMul is meaningful for this frame.
      if (hasTrait(th, 'swift') && th.slowMul < 1) {
        th.slowMul = 1 - (1 - th.slowMul) * SWIFT_SLOW_RESIST;
      }

      th.speed = th.baseSpeed * th.slowMul;
      th.dist += th.speed * dt;

      // Regeneration is deliberately gated on *being left alone* rather than on
      // a flat heal: a flat heal just makes the threat a bigger number, while
      // this makes sustained fire the answer and spreads the player's towers
      // out to keep contact.
      if (hasTrait(th, 'regenerating') && th.hp > 0) {
        if (th.prevHp !== undefined && th.hp < th.prevHp) {
          th.hurtAt = game.time;
        } else if (th.hurtAt !== null && game.time - th.hurtAt > REGEN_DELAY && th.hp < th.maxHp) {
          th.hp = Math.min(th.maxHp, th.hp + th.maxHp * REGEN_RATE * dt);
          // A visible tick, or the player reads a healing enemy as a bug.
          if (Math.random() < dt * 6) {
            game.effects.push({
              kind: 'heal', x: th.x, y: th.y, r: th.radius + 6,
              life: 0.35, max: 0.35, accent: '#4ade80',
            });
          }
        }
        th.prevHp = th.hp;
      }

      if (th.dist >= pathLen) {
        leak(game, th);
        game.threats.splice(i, 1);
        continue;
      }

      var p = map.posAt(th.dist);
      th.x = p.x;
      th.y = p.y;
      th.angle = p.angle;

      if (th.hp <= 0) {
        // Reanimation is a pre-death reprieve, not a resurrection after the
        // fact, so the threat never leaves the list and never re-pays bounty.
        if (th.revived < (th.revives || 0)) {
          th.revived += 1;
          th.hp = th.maxHp * 0.55;
          th.baseSpeed *= 1.12;
          game.effects.push({
            kind: 'burst', x: th.x, y: th.y, r: 30, life: 0.45, max: 0.45, accent: '#a3a3a3',
          });
          if (game.onRevive) game.onRevive(th);
        } else {
          kill(game, th);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function drawThreat(ctx, t, time) {
    var d = t.def;
    var hurt = 1 - Math.max(0, t.hp) / t.maxHp;

    ctx.save();
    ctx.translate(t.x, t.y);

    // Bosses get a ground shadow so they read as heavier than everything else.
    if (d.boss) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, t.radius * 0.7, t.radius * 1.1, t.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(t.angle);

    var body = t.flash > 0 ? '#ffffff' : d.colour;
    ctx.strokeStyle = body;
    ctx.fillStyle = body;
    ctx.lineWidth = 2;

    if (t.type === 'smell') {
      // A wisp: three trailing strokes, wobbling as it moves.
      var w = Math.sin((time || 0) * 6 + t.wobble) * 1.6;
      ctx.beginPath();
      for (var i = 0; i < 3; i++) {
        var ox = -i * 3.5;
        ctx.moveTo(ox, -3 + w * (i + 1) * 0.4);
        ctx.lineTo(ox, 3 + w * (i + 1) * 0.4);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'sqli') {
      // A dart with quote marks: fast and pointed.
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 12, 20, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1, -2); ctx.lineTo(-1, 2);
      ctx.moveTo(2, -3); ctx.lineTo(2, 3);
      ctx.stroke();
    } else if (t.type === 'xss') {
      // Angle brackets, the shape of the thing itself.
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-3, -6); ctx.lineTo(-9, 0); ctx.lineTo(-3, 6);
      ctx.moveTo(3, -6); ctx.lineTo(9, 0); ctx.lineTo(3, 6);
      ctx.stroke();
    } else if (t.type === 'zombie') {
      // A half-crushed box trailing a severed wire.
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-6, -6, 12, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
      ctx.moveTo(0, -6); ctx.lineTo(0, 6);
      ctx.globalAlpha = t.revived ? 1 : 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (t.revived) {
        // Second wind: a pulsing outline so it is obvious it got back up.
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin((time || 0) * 9);
        ctx.strokeStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (t.type === 'ransom') {
      // A padlock with a heavy shackle.
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.rect(-8, -4, 16, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 5.5, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Returning fire: the aura it uses to shut towers down.
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin((time || 0) * 5);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (t.type === 'botnet') {
      // A single drone, deliberately tiny and dull.
      ctx.beginPath();
      ctx.moveTo(5, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // Zero-Day: a spiked ring around a solid core, rotating against travel.
      ctx.rotate(-(time || 0) * 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var k = 0; k < 8; k++) {
        var a = (k / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0f1a';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Health bar: only once damaged, and never for 1 HP swarm units where it
    // would be a solid wall of red pixels.
    if (hurt > 0 && t.maxHp > 12) {
      var w2 = Math.max(14, t.radius * 2.2);
      var y2 = t.y - t.radius - 7;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(t.x - w2 / 2, y2, w2, 3);
      ctx.fillStyle = d.boss ? '#f43f5e' : hurt > 0.6 ? '#f87171' : '#4ade80';
      ctx.fillRect(t.x - w2 / 2, y2, w2 * (1 - hurt), 3);
      ctx.restore();
    }

    // Trait markers. These are not decoration: a Regenerating threat that the
    // player cannot identify is a threat the player thinks is bugged, and
    // "which of these do I need the heavy tower for" is the whole question the
    // late game is asking.
    if (t.traits && t.traits.length) {
      ctx.save();
      var rr = t.radius + 5;

      if (hasTrait(t, 'hardened')) {
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var s = 0; s < 4; s++) {
          var a0 = (s / 4) * Math.PI * 2 + 0.4;
          ctx.arc(t.x, t.y, rr, a0, a0 + 0.9);
        }
        ctx.stroke();
      }

      if (hasTrait(t, 'regenerating')) {
        var pulse = 0.5 + 0.5 * Math.sin((time || 0) * 3 + t.wobble);
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(t.x, t.y, rr + 1 + pulse * 1.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (hasTrait(t, 'swift')) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var c2 = 0; c2 < 2; c2++) {
          var back = t.radius + 4 + c2 * 5;
          ctx.moveTo(t.x - Math.cos(t.angle) * back - Math.sin(t.angle) * 3.5,
            t.y - Math.sin(t.angle) * back + Math.cos(t.angle) * 3.5);
          ctx.lineTo(t.x - Math.cos(t.angle) * back + Math.sin(t.angle) * 3.5,
            t.y - Math.sin(t.angle) * back - Math.cos(t.angle) * 3.5);
        }
        ctx.stroke();
      }

      if (hasTrait(t, 'saboteur')) {
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(t.x, t.y, rr + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Slow indicator, so the Rate Limiter's effect is visible rather than
    // something the player has to take on faith.
    if (t.slowMul < 0.95) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Immunity feedback: without this, a boss that shrugs off damage looks
    // like a bug rather than a rule.
    if (t.resisted) {
      t.resisted = false;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 8px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('IMMUNE', t.x, t.y - t.radius - 9);
      ctx.restore();
    }
  }

  function drawAll(ctx, game, time) {
    for (var i = 0; i < game.threats.length; i++) drawThreat(ctx, game.threats[i], time);
  }

  global.Threats = {
    DEFS: DEFS,
    TRAITS: TRAITS,
    ARMOUR_MIN_HP: ARMOUR_MIN_HP,
    def: def,
    trait: function (id) { return TRAITS[id]; },
    hasTrait: hasTrait,
    list: function () { return Object.keys(DEFS).map(function (k) { return DEFS[k]; }); },
    spawn: spawn,
    update: update,
    draw: drawThreat,
    drawAll: drawAll,
    kill: kill,
    leak: leak,
  };
})(window);
