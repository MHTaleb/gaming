/**
 * selftest.js - the kit verification harness, kept rather than deleted.
 *
 * This started life as main.js in Phase 0, where its only job was to answer
 * "did the modules copied from the previous project actually work here?". That
 * question gets asked again every time the kit is touched - a Capacitor bump, a
 * new device, a fresh clone - so the harness stays, behind `?selftest=1`.
 *
 * Rows are tagged with the group that produced them. Re-running a group
 * replaces only its own rows; an earlier version filtered by label substring
 * and deleted unrelated rows, which made the pass count go *down* after a
 * successful re-run and is exactly the kind of thing that teaches people to
 * ignore test output.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var results = [];
  var running = false;

  function host() { return doc.getElementById('results'); }
  function el(id) { return doc.getElementById(id); }

  function check(label, ok, detail, group) {
    results.push({
      label: label, ok: !!ok,
      detail: detail === undefined ? '' : String(detail),
      group: group || 'structural',
    });
    render();
  }

  function note(label, detail, group) {
    results.push({
      label: label, ok: null,
      detail: detail === undefined ? '' : String(detail),
      group: group || 'structural',
    });
    render();
  }

  function clearGroup(group) {
    results = results.filter(function (r) { return r.group !== group; });
  }

  function count() {
    var pass = 0, fail = 0;
    results.forEach(function (r) { if (r.ok === true) pass++; else if (r.ok === false) fail++; });
    return { pass: pass, fail: fail };
  }

  function render() {
    var h = host();
    if (!h) return;
    h.textContent = '';
    results.forEach(function (r) {
      var row = doc.createElement('div');
      row.className = 'row' + (r.ok === null ? ' info' : r.ok ? ' ok' : ' bad');

      var mark = doc.createElement('span');
      mark.className = 'mark';
      mark.textContent = r.ok === null ? '·' : r.ok ? '✓' : '✗';
      row.appendChild(mark);

      var labelEl = doc.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = r.label;
      row.appendChild(labelEl);

      var detail = doc.createElement('span');
      detail.className = 'detail';
      detail.textContent = r.detail;
      row.appendChild(detail);

      h.appendChild(row);
    });

    var summary = el('summary');
    if (summary) {
      var c = count();
      summary.textContent = c.pass + ' passed, ' + c.fail + ' failed';
      summary.classList.toggle('bad', c.fail > 0);
      summary.classList.toggle('ok', c.fail === 0 && c.pass > 0);
    }
  }

  /* ------------------------------------------------------------------ *
   * Structural: no audio output required.
   * ------------------------------------------------------------------ */
  function structuralChecks() {
    check('config.js loaded', !!global.NeonConfig, global.NeonConfig && global.NeonConfig.appId);
    check('storage.js loaded', !!global.Store);

    /*
     * The failure plumbing (PD-302).
     *
     * Asserted rather than trusted, because the failure mode of this feature is
     * that it is not there - and the symptom of it not being there is silence,
     * which is indistinguishable from everything working.
     */
    var D = global.Diag;
    check('diag.js loaded', !!D, D ? 'ring buffer of ' + D.MAX : 'missing');
    if (D) {
      check('diag installed its global handlers', D.isInstalled() === true,
        'error + unhandledrejection');
      check('diag reports a real Error', D.quiet(function () {
        var before = D.count();
        var entry = D.report(new Error('selftest probe'), 'selftest');
        // The report must carry the message through, must be recorded, and must
        // not invent a different context.
        return D.count() === before + 1 &&
          entry.message === 'selftest probe' && entry.context === 'selftest';
      }), 'captured with context');
      check('diag survives being handed rubbish', D.quiet(function () {
        // report() is on the path of something that is already failing, so it is
        // the one function in this codebase that must never throw.
        try {
          D.report(undefined, null);
          D.report('a string', 'selftest');
          D.report({}, 'selftest');
          D.report(null, undefined);
          return true;
        } catch (err) { return false; }
      }), 'no throw for undefined, string, plain object or null');
      check('diag keeps only the recent past', D.quiet(function () {
        for (var i = 0; i < D.MAX + 2; i++) D.report(new Error('flood ' + i), 'selftest');
        return D.recent().length === D.MAX;
      }), 'capped at ' + D.MAX + ' entries');
      check('quiet mode is restored even if the body throws', (function () {
        try { D.quiet(function () { throw new Error('deliberate'); }); } catch (e) { /* expected */ }
        return D.isQuiet() === false;
      })(), 'a muted reporter is worse than a noisy one');
      D.clear();
    }

    var fatalHost = doc.getElementById('fatal');
    var toastHost = doc.getElementById('toast');
    check('the fatal overlay and the toast both exist in the page',
      !!fatalHost && !!toastHost,
      (fatalHost ? 'fatal ok' : 'no #fatal') + ', ' + (toastHost ? 'toast ok' : 'no #toast'));

    check('audio.js loaded', !!global.Sfx);
    check('tracks.js loaded', !!(global.Tracks && global.Tracks.all),
      global.Tracks ? global.Tracks.count + ' tracks' : 'missing');
    check('music.js loaded', !!global.Music);
    check('ads.js loaded', !!global.Ads);
    check('purchases.js loaded', !!global.Purchases);
    check('progress.js loaded', !!global.Profile);
    check('levels.js loaded', !!global.Levels, global.Levels ? global.Levels.count() + ' tickets' : 'missing');
    check('map.js loaded', !!global.PDMap);

    if (global.Store) {
      global.Store.set('selftest', 42);
      check('settings round-trip', global.Store.get('selftest') === 42, 'value ' + global.Store.get('selftest'));
    }

    if (global.Music) {
      var built = global.Music.init();
      check('music graph builds', built, 'AudioContext ' + (built ? 'created' : 'unavailable'));
      var tracks = global.Music.tracks();
      check('playlist readable', tracks.length > 0, tracks.length + ' entries');
      check('playlist integrity',
        tracks.every(function (t) { return t.id && t.root > 0 && t.layers && t.layers.length; }),
        'every track has id, root and layers');
    }

    if (global.Sfx) {
      var ctx = global.Sfx.getContext();
      check('audio context exists', !!ctx, ctx ? ctx.constructor.name : 'none');
    }

    note('asset count', 'zero - all art and audio is generated at runtime');

    // Level content: a path that does not exist is a level that cannot load,
    // and it is much cheaper to find that here than in a playtest.
    if (global.Levels && global.PDMap) {
      var paths = global.Levels.paths();
      var missing = global.Levels.all().filter(function (l) { return !paths[l.path]; });
      check('every level has a path', missing.length === 0,
        missing.length ? missing.map(function (l) { return l.id; }).join(', ') : '12 of 12 resolve');

      var badWaves = global.Levels.all().filter(function (l) { return !l.waves.length; });
      check('every level has waves', badWaves.length === 0,
        badWaves.length ? 'missing on ' + badWaves.length : 'all populated');

      var D = global.Threats ? global.Threats.DEFS : {};
      var unknown = [];
      global.Levels.all().forEach(function (l) {
        l.waves.forEach(function (w) {
          w.forEach(function (g) { if (!D[g.t]) unknown.push(l.id + ':' + g.t); });
        });
      });
      check('every wave names a real threat', unknown.length === 0,
        unknown.length ? unknown.join(', ') : 'no typos in the wave tables');

      // The road must not run off the grid, or threats walk into the void.
      var offMap = [];
      Object.keys(paths).forEach(function (name) {
        paths[name].forEach(function (wp) {
          if (wp[1] < 0 || wp[1] >= global.PDMap.ROWS) offMap.push(name + ' row ' + wp[1]);
          if (wp[0] >= global.PDMap.COLS) offMap.push(name + ' col ' + wp[0]);
        });
      });
      check('paths stay on the grid', offMap.length === 0,
        offMap.length ? offMap.join(', ') : 'all waypoints in bounds');
    }

    if (global.Profile) {
      var before = global.Profile.credits();
      global.Profile.addCredits(1);
      var after = global.Profile.credits();
      global.Profile.addCredits(-1);
      check('progress save round-trips', after === before + 1, 'credits ' + before + ' -> ' + after);
    }
  }

  /* ------------------------------------------------------------------ *
   * Gameplay: the two bugs that made the game unplayable.
   *
   * Both were invisible to the headless simulate() tool, because neither is a
   * simulation problem: one is a DOM listener leaking across levels, the other
   * is a gesture that was specified but never wired up. So these checks drive
   * the real canvas through real PointerEvents at real coordinates, which is
   * the only way to notice either of them.
   * ------------------------------------------------------------------ */

  function gameplayChecks() {
    var G = 'gameplay';
    var Engine = global.Engine;
    var Map = global.PDMap;
    var Towers = global.Towers;

    clearGroup(G);

    if (!Engine || !Map || !Towers) {
      check('engine present', false, 'Engine, PDMap or Towers missing', G);
      return;
    }

    var canvas = el('game');
    var battle = el('screen-battle');
    if (!canvas || !battle) {
      check('battle canvas present', false, 'no #game or #screen-battle', G);
      return;
    }

    // The canvas has to be laid out to have a size, so the battle screen is
    // revealed for the duration. Only reachable behind ?selftest=1.
    var wasActive = battle.classList.contains('active');
    battle.classList.add('active');

    try {
      runGameplayChecks(Engine, Map, Towers, canvas, G);
    } catch (err) {
      check('gameplay checks completed', false, 'threw: ' + (err && err.message ? err.message : err), G);
    } finally {
      Engine.stop();
      if (!wasActive) battle.classList.remove('active');
    }
  }

  function runGameplayChecks(Engine, Map, Towers, canvas, G) {
    var rect = canvas.getBoundingClientRect();

    /** World units to client (viewport) pixels - the same transform pointers use. */
    function client(worldX, worldY) {
      var o = Map.offset();
      var s = Map.scale();
      return { x: rect.left + o.x + worldX * s, y: rect.top + o.y + worldY * s };
    }

    function send(type, worldX, worldY) {
      var p = client(worldX, worldY);
      canvas.dispatchEvent(new global.PointerEvent(type, {
        clientX: p.x, clientY: p.y,
        bubbles: true, cancelable: true,
        pointerId: 1, pointerType: 'touch', isPrimary: true,
      }));
    }

    function centre(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }

    // ---- one listener, no matter how many battles were mounted ----

    Engine.mount(canvas, {});
    check('input bound once on mount', Engine.inputBindings() === 1,
      Engine.inputBindings() + ' binding(s) after 1 mount', G);

    Engine.start(1);
    // Level 2 means mount() runs a second time. Before the guard this read 2,
    // and a tile tap then placed a tower and immediately flashed "tile
    // occupied" because two listeners each ran onTap for one finger.
    Engine.mount(canvas, {});
    Engine.start(2);
    check('input still bound once after a second battle', Engine.inputBindings() === 1,
      Engine.inputBindings() + ' binding(s) after 2 mounts', G);

    // Mount once more, because a leak compounds: the player who has played four
    // levels has four listeners, not two, and every one of them runs per tap.
    Engine.mount(canvas, {});
    check('input bound once after a third battle', Engine.inputBindings() === 1,
      Engine.inputBindings() + ' binding(s) after 3 mounts', G);

    // ---- a tap on a card arms exactly one build type ----

    Engine.start(1);
    var L = Engine.layout();
    if (!L || !L.cards || !L.cards.length) {
      check('build cards laid out', false, 'layout has no cards', G);
      return;
    }

    var firewall = L.cards[0];
    var fc = centre(firewall);
    send('pointerdown', fc.x, fc.y);
    send('pointerup', fc.x, fc.y);
    check('card tap arms a build type', Engine.state().selectedBuild === firewall.id,
      'selectedBuild = ' + Engine.state().selectedBuild, G);

    // Proof that the arm check below is not vacuous. Tapping the same card
    // again must *disarm* it, because hudTap toggles. Two listeners would
    // toggle twice and net to "nothing selected" - that was the original
    // symptom, a card that highlights and does nothing. The drag path is
    // idempotent on purpose (the second pointerup finds no drag to finish), so
    // these checks pair with the binding count above rather than replacing it.
    send('pointerdown', fc.x, fc.y);
    send('pointerup', fc.x, fc.y);
    check('tapping the same card again disarms it (so a doubled listener would net to nothing)',
      Engine.state().selectedBuild === null,
      'selectedBuild = ' + Engine.state().selectedBuild, G);

    // ---- and still does on the level after a win ----
    // This is the reported failure: win a level, and the next one cannot build.

    Engine.start(2);
    var L2 = Engine.layout();
    var fc2 = centre(L2.cards[0]);
    send('pointerdown', fc2.x, fc2.y);
    send('pointerup', fc2.x, fc2.y);
    check('card tap still arms on the level after a win',
      Engine.state().selectedBuild === L2.cards[0].id,
      'selectedBuild = ' + Engine.state().selectedBuild, G);

    // ---- tap-to-place still works, so the drag path did not replace it ----

    Engine.start(3);
    var L3 = Engine.layout();
    var tile = firstBuildable(Map, Towers, Engine.state());
    if (!tile) { check('a buildable tile exists', false, 'grid is full or unbuildable', G); return; }

    var before = Engine.state().bandwidth;
    var cc = { x: tile.x, y: tile.y };
    var card = centre(L3.cards[0]);
    send('pointerdown', card.x, card.y);
    send('pointerup', card.x, card.y);
    send('pointerdown', cc.x, cc.y);
    send('pointerup', cc.x, cc.y);

    var tapped = Towers.at(Engine.state(), tile.c, tile.r);
    // Towers.cost, not Towers.def().cost: a player with build-cost research pays
    // the discounted price, and asserting the raw price here would fail for
    // exactly the players who have played the most.
    var tapCost = Towers.cost(L3.cards[0].id);
    check('tap-to-place still builds', !!tapped && tapped.type === L3.cards[0].id,
      tapped ? tapped.type + ' at ' + tile.c + ',' + tile.r : 'nothing on the tile', G);
    check('placing charges bandwidth',
      Math.abs((before - Engine.state().bandwidth) - tapCost) < 0.001,
      before.toFixed(0) + ' -> ' + Engine.state().bandwidth.toFixed(0) + ' (cost ' + tapCost + ')', G);

    // ---- drag a card onto the field ----

    Engine.start(4);
    var L4 = Engine.layout();
    var dTile = firstBuildable(Map, Towers, Engine.state());
    if (!dTile) { check('a buildable tile exists for the drag', false, 'grid is full', G); return; }

    var dc = { x: dTile.x, y: dTile.y };
    var dCard = centre(L4.cards[1]);
    var dragBefore = Engine.state().bandwidth;

    send('pointerdown', dCard.x, dCard.y);
    // Two moves: one below the threshold, which must NOT start a drag, then a
    // real one. This is the difference between a tap and a drag.
    send('pointermove', dCard.x + 3, dCard.y + 2);
    check('a tiny movement does not start a drag', Engine.state().drag && Engine.state().drag.active === false,
      'drag.active = ' + (Engine.state().drag && Engine.state().drag.active), G);

    send('pointermove', dc.x, dc.y);
    check('dragging arms the ghost', Engine.state().drag && Engine.state().drag.active === true,
      'drag.active = ' + (Engine.state().drag && Engine.state().drag.active), G);
    check('the ghost previews the tile under the finger',
      !!Engine.state().hover && Engine.state().hover.c === dTile.c && Engine.state().hover.r === dTile.r,
      Engine.state().hover ? Engine.state().hover.c + ',' + Engine.state().hover.r : 'no hover tile', G);

    // Render once mid-drag: a ghost that throws only while dragging would be a
    // crash the player hits and the tests do not.
    var drew = true;
    var drawErr = '';
    try { Engine.draw(); } catch (err) { drew = false; drawErr = err && err.message ? err.message : String(err); }
    check('drawing mid-drag does not throw', drew, drew ? 'ghost + range ring rendered' : drawErr, G);

    send('pointerup', dc.x, dc.y);
    var dragged = Towers.at(Engine.state(), dTile.c, dTile.r);
    var dragCost = Towers.cost(L4.cards[1].id);
    check('dropping a dragged card builds', !!dragged && dragged.type === L4.cards[1].id,
      dragged ? dragged.type + ' at ' + dTile.c + ',' + dTile.r : 'nothing on the tile', G);
    check('the drop charges bandwidth',
      Math.abs((dragBefore - Engine.state().bandwidth) - dragCost) < 0.001,
      dragBefore.toFixed(0) + ' -> ' + Engine.state().bandwidth.toFixed(0) + ' (cost ' + dragCost + ')', G);
    check('the drag is released', Engine.state().drag === null,
      'drag = ' + Engine.state().drag, G);
    check('a drag is one placement, not a build mode',
      Engine.state().selectedBuild === null,
      'selectedBuild = ' + Engine.state().selectedBuild, G);

    // ---- dropping somewhere illegal is refused, not silently eaten ----

    Engine.start(5);
    var L5 = Engine.layout();
    var refusedBefore = Engine.state().bandwidth;
    var road = tileOnRoad(Map);
    if (!road) { check('a road tile exists', false, 'no road tile found', G); return; }

    var rc = { x: road.x, y: road.y };
    var rCard = centre(L5.cards[0]);
    send('pointerdown', rCard.x, rCard.y);
    send('pointermove', rc.x, rc.y);
    send('pointerup', rc.x, rc.y);

    check('dropping on the road is refused',
      !Towers.at(Engine.state(), road.c, road.r) &&
      Math.abs(refusedBefore - Engine.state().bandwidth) < 0.001,
      'bandwidth unchanged at ' + Engine.state().bandwidth.toFixed(0), G);
    check('the refusal is explained on screen',
      Engine.state().effects.some(function (e) { return e.kind === 'nope'; }),
      Engine.state().effects.length + ' effect(s) raised', G);

    // ---- releasing over the HUD is a cancel, and it says so ----
    // A gesture that silently does nothing is indistinguishable from a broken
    // game, so the cancel has to leave a mark on screen like every other
    // refusal.

    Engine.start(7);
    var L7 = Engine.layout();
    var cancelBefore = Engine.state().bandwidth;
    var cCard = centre(L7.cards[0]);
    var mid = { x: Map.VW() / 2, y: Map.hudTop() / 2 };
    var hudY = Map.hudTop() + 20;
    Engine.state().effects.length = 0;

    send('pointerdown', cCard.x, cCard.y);
    // Two moves on purpose: the first is genuinely away from the card, which is
    // what arms the drag, and only then does the finger travel down onto the
    // HUD. A single short hop would never cross the drag threshold and this
    // would quietly be testing the tap path instead.
    send('pointermove', mid.x, mid.y);
    check('the drag is armed before the release', Engine.state().drag && Engine.state().drag.active === true,
      'drag.active = ' + (Engine.state().drag && Engine.state().drag.active), G);
    send('pointermove', Map.VW() / 2, hudY);
    send('pointerup', Map.VW() / 2, hudY);

    check('releasing over the HUD cancels instead of placing',
      Math.abs(cancelBefore - Engine.state().bandwidth) < 0.001 && Engine.state().towers.length === 0,
      Engine.state().towers.length + ' tower(s), bandwidth ' + Engine.state().bandwidth.toFixed(0), G);
    check('the cancel is explained on screen',
      Engine.state().effects.some(function (e) { return e.kind === 'nope' && e.text === 'cancelled'; }),
      Engine.state().effects.map(function (e) { return e.text; }).join(', ') || 'no effect raised', G);
    check('the cancel leaves nothing armed either',
      Engine.state().selectedBuild === null,
      'selectedBuild = ' + Engine.state().selectedBuild, G);

    // ---- the preview and the drop agree ----
    // The ghost is green because canPlace said yes; the drop calls the same
    // function. If these ever diverge, the ring lies to the player.
    var t6 = firstBuildable(Map, Towers, Engine.state());
    var agree = t6 ? Towers.canPlace(Engine.state(), t6.c, t6.r, L5.cards[0].id, Map) : { ok: false };
    check('preview and drop share one decision',
      t6 ? agree.ok === true : false,
      t6 ? 'canPlace agrees the tile is legal' : 'no buildable tile', G);

    // ---- and the whole loop can be re-entered after a level ends ----

    Engine.stop();
    Engine.start(6);
    var L6 = Engine.layout();
    var lastCard = centre(L6.cards[0]);
    send('pointerdown', lastCard.x, lastCard.y);
    send('pointerup', lastCard.x, lastCard.y);
    check('a fresh level still accepts input after stop/start',
      Engine.state().selectedBuild === L6.cards[0].id,
      'selectedBuild = ' + Engine.state().selectedBuild, G);
  }

  /**
   * The first tile that is buildable and empty.
   *
   * `tileToWorld` already returns the tile's centre, not its corner, so the
   * x/y here are directly usable as a pointer target - wrapping them in another
   * centre() would aim half a tile off and land on a neighbour.
   */
  function firstBuildable(Map, Towers, state) {
    for (var c = 0; c < Map.COLS; c++) {
      for (var r = 0; r < Map.ROWS; r++) {
        if (Map.isBuildable(c, r) && !Towers.at(state, c, r)) {
          var w = Map.tileToWorld(c, r);
          return { c: c, r: r, x: w.x, y: w.y };
        }
      }
    }
    return null;
  }

  /** A tile the road actually crosses, for the refuse-the-drop check. */
  function tileOnRoad(Map) {
    for (var c = 0; c < Map.COLS; c++) {
      for (var r = 0; r < Map.ROWS; r++) {
        if (!Map.isBuildable(c, r)) {
          var w = Map.tileToWorld(c, r);
          return { c: c, r: r, x: w.x, y: w.y };
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * The BASE tree: research, tower unlocks, and PROD hardening.
   *
   * This group buys things, and then puts the save back exactly as it found it.
   * A harness that quietly drains a player's credits is worse than no harness,
   * so the restore lives in a finally block and mirrors every field.
   * ------------------------------------------------------------------ */
  function baseChecks() {
    var G = 'base';
    var Base = global.Base;
    var Towers = global.Towers;
    var Profile = global.Profile;

    clearGroup(G);

    if (!Base || !Towers || !Profile) {
      check('base.js loaded', false, 'Base, Towers or Profile missing', G);
      return;
    }

    check('base.js loaded', Object.keys(Base).length > 0,
      Object.keys(Base).length + ' exports', G);

    // The screen calls these by name inside a click handler. A missing one is
    // not a visible warning - it is a button that does nothing while the
    // exception disappears into the console. Base.unlock shipped unexported for
    // exactly that reason, so the list is asserted rather than assumed.
    var needed = ['unlock', 'research', 'harden', 'rank', 'hardening', 'statBonus',
      'leakMultiplier', 'towerUnlocked', 'unlockedTypes', 'lockedTypes',
      'invested', 'nextResearch', 'nextHardening', 'unlockInfo'];
    var missing = needed.filter(function (k) { return typeof Base[k] !== 'function'; });
    check('every Base function the screen calls exists', missing.length === 0,
      missing.length ? 'MISSING: ' + missing.join(', ') : needed.length + ' functions present', G);

    check('every tower in the palette has a definition',
      Towers.order().every(function (id) { return !!Towers.def(id); }),
      Towers.order().join(', '), G);

    check('an unresearched tower is exactly as advertised',
      Base.statBonus('firewall').costMul === 1 &&
      Base.statBonus('firewall').damageMul === 1 &&
      Base.statBonus('firewall').rangeMul === 1,
      'rank ' + Base.rank('firewall') + ' is neutral', G);

    check('unresearched leak damage is the baseline',
      Base.leakMultiplier() >= 0.7 && Base.leakMultiplier() <= 1,
      'leak multiplier ' + Base.leakMultiplier(), G);

    var snapshot = JSON.parse(JSON.stringify(Profile.load()));
    var paletteBefore = global.Engine && global.Engine.paletteIds ? global.Engine.paletteIds() : null;

    try {
      Profile.addCredits(5000);

      /* ---- research ---- */

      var priceBefore = Towers.cost('firewall');
      var r1 = Base.research('firewall');
      check('researching spends credits and takes a rank',
        r1.ok === true && Base.rank('firewall') === 1,
        JSON.stringify(r1), G);

      check('the research discount is charged at the till',
        Towers.cost('firewall') === Math.round(Towers.def('firewall').cost * Base.statBonus('firewall').costMul),
        'BUILD ' + Towers.cost('firewall') + ' = ' + Towers.def('firewall').cost + ' x ' + Base.statBonus('firewall').costMul, G);

      check('the discounted price is actually cheaper',
        Towers.cost('firewall') < priceBefore,
        priceBefore + ' -> ' + Towers.cost('firewall'), G);

      // Rank 3 is the ceiling: the next purchase must refuse, not overcharge.
      Base.research('firewall');
      Base.research('firewall');
      check('research stops at the maximum rank',
        Base.rank('firewall') === Base.MAX_RANK && Base.nextResearch('firewall') === null &&
        Base.research('firewall').ok === false,
        'rank ' + Base.rank('firewall') + '/' + Base.MAX_RANK, G);

      /* ---- tower unlocks ---- */

      var lockedIds = Base.lockedTypes();
      check('the new towers start locked', lockedIds.length > 0, lockedIds.join(', '), G);

      var u = Base.unlock('honeypot');
      check('a locked tower can be unlocked', u.ok === true && Base.towerUnlocked('honeypot') === true,
        JSON.stringify(u), G);

      check('unlocking twice is refused, not charged twice',
        Base.unlock('honeypot').ok === false,
        'second unlock refused', G);

      if (paletteBefore) {
        var after = global.Engine.paletteIds();
        check('the unlocked tower reaches the build palette',
          after.indexOf('honeypot') !== -1 && paletteBefore.indexOf('honeypot') === -1,
          paletteBefore.length + ' cards -> ' + after.length + ' cards', G);
      }

      // The gate has to be in canPlace, not only in the palette: hiding a card
      // is presentation, refusing the placement is the rule.
      var lockedCheck = Towers.canPlace(
        { bandwidth: 9999, towers: [] }, 0, 0, 'patch',
        { isBuildable: function () { return true; } }
      );
      check('a tower you have not researched cannot be placed at all',
        lockedCheck.ok === false && lockedCheck.reason === 'not researched',
        lockedCheck.ok ? 'it was allowed' : lockedCheck.reason, G);

      /* ---- PROD hardening ---- */

      var leakBefore = Base.leakMultiplier();
      var h = Base.harden();
      check('hardening reduces what a leak costs',
        h.ok === true && Base.leakMultiplier() < leakBefore,
        'leak cost ' + Math.round(leakBefore * 100) + '% -> ' + Math.round(Base.leakMultiplier() * 100) + '%', G);

      check('the base reports what was invested',
        Base.invested() > 0, Base.invested() + ' credits sunk in', G);
    } catch (err) {
      check('base purchases completed', false, 'threw: ' + (err && err.message ? err.message : err), G);
    } finally {
      // Restore every field, in place, then re-fingerprint through save() so the
      // checksum stays valid and the player is not flagged as a tamperer for
      // having run the tests.
      var live = Profile.load();
      Object.keys(live).forEach(function (k) { delete live[k]; });
      Object.assign(live, JSON.parse(JSON.stringify(snapshot)));
      Profile.save();

      check('the tests put the save back', Profile.credits() === snapshot.credits,
        Profile.credits() + ' credits, as before the run', G);
    }
  }

  /* ------------------------------------------------------------------ *
   * Commerce wiring.
   * ------------------------------------------------------------------ */
  function commerceChecks() {
    if (global.Purchases) {
      global.Purchases.init().then(function (snap) {
        check('purchases initialised', snap.ready, 'backend: ' + snap.backend);
        check('catalog readable', global.Purchases.catalog().length > 0,
          global.Purchases.catalog().map(function (p) { return p.id; }).join(', '));
        note('entitlement source', snap.native
          ? 'store (rebuilt from Google Play on every launch)'
          : 'dev mock - real billing only exists on a device');
        check('ads respect entitlements', typeof global.Purchases.isAdsRemoved() === 'boolean',
          'remove_ads owned: ' + global.Purchases.isAdsRemoved());
      }).catch(function (err) {
        check('purchases initialised', false, 'threw: ' + (err && err.message ? err.message : err), 'commerce');
      });
    }
    if (global.Ads && global.Ads.units) {
      note('ad units', 'test ids from config.js - they earn nothing until replaced');
    }
  }

  /* ------------------------------------------------------------------ *
   * Audible: needs a real gesture.
   * ------------------------------------------------------------------ */
  function audibleChecks() {
    var Music = global.Music;
    var Sfx = global.Sfx;
    var G = 'audible';
    if (!Music || !Sfx) {
      check('audio modules present', false, 'Sfx or Music missing', G);
      return;
    }
    if (running) return;
    running = true;

    clearGroup(G);
    render();

    Sfx.unlock();
    var ctx = Sfx.getContext();

    check('audio context running', ctx && ctx.state === 'running', ctx ? ctx.state : 'no context', G);

    // One context for the whole app. Two is invisible until a device suspends
    // one of them, so it gets an assertion rather than a comment.
    check('music shares the audio context', Music.context() === ctx,
      Music.isStandaloneContext() ? 'STANDALONE - music built its own context' : 'same AudioContext object', G);

    Music.setEnabled(true);
    Music.setVolume(0.7);
    Music.start();
    check('music started', Music.isRunning(), Music.current().name, G);

    var settle = function (ms) { return new Promise(function (r) { global.setTimeout(r, ms); }); };

    Music.peak(1.5).then(function (rms) {
      check('music produces signal', rms > 0.005, 'rms ' + rms.toFixed(4) + ' (silence floor is ~0.001)', G);
      Sfx.perfect ? Sfx.perfect(1) : Sfx.drop(6);
      return Music.peakSample(1.2);
    }).then(function (peak) {
      check('no clipping', peak < 0.9, 'peak sample ' + peak.toFixed(3), G);
      Music.setEnabled(false);
      return settle(900).then(function () {
        // Prove the gain node itself moves, then prove the signal stops. If the
        // master were a sibling input, this would read 0 while audio continued.
        check('master gain drops to zero', Music.gain() === 0, 'gain ' + Music.gain(), G);
        return Music.peak(0.9);
      });
    }).then(function (muted) {
      check('mute actually mutes', muted < 0.01, 'rms ' + muted.toFixed(4), G);
      Music.setEnabled(true);
      Music.setVolume(0.7);
      return settle(1200);
    }).then(function () {
      return Music.peak(1.2);
    }).then(function (back) {
      check('unmute restores signal', back > 0.005, 'rms ' + back.toFixed(4), G);
      running = false;
      render();
    }).catch(function (err) {
      check('audible checks completed', false, 'threw: ' + (err && err.message ? err.message : err), G);
      running = false;
      render();
    });
  }

  function active() {
    var q = (global.location && global.location.search) || '';
    // Accept both spellings of the query. Forwarded dev ports and a few
    // preview/proxy setups percent-encode the '=' in a query string, which
    // would otherwise make the harness silently unreachable from exactly the
    // environment most likely to need it.
    return /[?&]selftest(?:=|%3D)1/i.test(q);
  }

  function boot() {
    // Loaded on every page, but only *runs* on request. Loading it
    // unconditionally and bailing here avoids injecting a script tag at
    // runtime, which the CSP forbids anyway.
    if (!active()) return;
    doc.body.classList.add('selftest');
    structuralChecks();
    commerceChecks();
    gameplayChecks();

    var btn = el('runAudio');
    if (btn) {
      btn.addEventListener('click', function (e) {
        // Trusted-only: a synthetic click carries no user activation, so any
        // audio it "proved" would be a lie.
        if (!e.isTrusted) return;
        audibleChecks();
      });
    }

    // Keyboard route, because driving this through a pointer is fragile in
    // automated browsers where click coordinates can be rescaled by the host.
    doc.addEventListener('keydown', function (e) {
      if (!e.isTrusted) return;
      if (e.key !== 'a' && e.key !== 'A') return;
      e.preventDefault();
      audibleChecks();
    });

    global.__kit = {
      results: function () { return results.slice(); },
      summary: count,
      runAudio: audibleChecks,
      /** Every AudioContext this app has ever constructed. Should be 1. */
      contexts: function () {
        var seen = [];
        if (global.Sfx && global.Sfx.getContext()) seen.push(global.Sfx.getContext());
        var mc = global.Music && global.Music.context && global.Music.context();
        if (mc && seen.indexOf(mc) === -1) seen.push(mc);
        return seen.length;
      },
    };
  }

  if (doc.readyState === 'complete' || doc.readyState === 'interactive') global.setTimeout(boot, 0);
  else doc.addEventListener('DOMContentLoaded', boot);
})(window);
