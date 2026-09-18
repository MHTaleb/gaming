/**
 * map.js - the world: virtual resolution, grid, paths, and the transform
 * between world units and screen pixels.
 *
 * COORDINATE MODEL
 *   World height is fixed at 360 units so gameplay is identical on every
 *   device. World width is derived from the device aspect and clamped to
 *   620..1000. The playfield itself is always 560x360 (14 x 9 tiles of 40), and
 *   whatever width is left over becomes HUD space on the left and right. That
 *   is the whole reason for the letterbox: landscape phones are wide and short,
 *   and rather than stretch the map we spend the extra width on interface.
 *
 *   Grid coords are (col, row) with row 0 at the TOP. Waypoints may sit outside
 *   the grid (col -1) so threats can walk in from off-screen.
 *
 * Everything is drawn in world units; the canvas transform does the scaling.
 */
(function (global) {
  'use strict';

  var TILE = 40;
  var COLS = 14;
  var ROWS = 9;
  var MAP_W = COLS * TILE;   // 560
  var MAP_H = ROWS * TILE;   // 360
  /**
   * Bottom strip: stats on the left, build palette in the middle, wave and
   * playback controls on the right.
   *
   * 108 is not a taste decision, it is the height of the tallest column plus
   * its padding. The right column is three stacked rows - the wave button, the
   * wave counter and status line, then speed/pause (upgrading to upgrade/sell
   * when a tower is selected). At rows of 26 + 26 + 24 with 6-unit gaps and 10
   * units of padding top and bottom that is exactly 108. It used to be 80,
   * which is what the *left* column needs and left the right column 28 units
   * short, so its rows were drawn on top of each other.
   */
  var HUD_H = 108;
  var VH = MAP_H + HUD_H;    // 468

  var VW = 620;
  var scale = 1;
  var offsetX = 0;
  var offsetY = 0;

  var path = [];             // [{c,r}] tile waypoints
  var points = [];           // [{x,y}] world centres
  var segs = [];             // [{x,y,dx,dy,len,start,angle}]
  var totalLen = 0;
  var blocked = Object.create(null);   // "c,r" -> true (road + base tiles)
  var baseTile = { c: COLS - 1, r: 4 };
  var spawnPoint = { x: 0, y: 0, angle: 0 };

  /* ------------------------------------------------------------------ *
   * Viewport
   * ------------------------------------------------------------------ */

  /**
   * Fit the world to a canvas.
   *
   * The world is 468 units tall; width follows the device aspect and is
   * clamped, so a very wide screen gets more HUD room rather than a stretched
   * map. The scale fits BOTH axes, which matters more than it looks: on a
   * narrow viewport the clamped world width can exceed the available space, and
   * fitting only the height would silently crop the left and right of the HUD
   * - including the buttons.
   */
  function fit(cssW, cssH) {
    var aspect = cssW / cssH;
    VW = Math.round(Math.min(1000, Math.max(620, VH * aspect)));
    scale = Math.min(cssH / VH, cssW / VW);
    offsetX = (cssW - VW * scale) / 2;
    offsetY = (cssH - VH * scale) / 2;
    return { width: VW, height: VH };
  }

  /* ------------------------------------------------------------------ *
   * Grid <-> world
   * ------------------------------------------------------------------ */

  /**
   * Left edge of the playfield in world units. Zero on a narrow screen, and a
   * gutter on a wide one. Every field coordinate goes through here, so no other
   * module has to know that the map is centred rather than left-aligned.
   */
  function mapLeft() { return Math.round((VW - MAP_W) / 2); }

  function tileToWorld(c, r) {
    return { x: mapLeft() + c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
  }

  function worldToTile(x, y) {
    return { c: Math.floor((x - mapLeft()) / TILE), r: Math.floor(y / TILE) };
  }

  function inGrid(c, r) {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS;
  }

  function key(c, r) { return c + ',' + r; }

  function isBuildable(c, r) {
    if (!inGrid(c, r)) return false;
    return !blocked[key(c, r)];
  }

  /* ------------------------------------------------------------------ *
   * Path
   * ------------------------------------------------------------------ */

  /**
   * Set the road from tile waypoints. Recomputes the blocked set: the road
   * itself and the base are not buildable, everything else is.
   */
  function setPath(waypoints, base) {
    path = waypoints.map(function (w) { return { c: w[0], r: w[1] }; });
    if (base) baseTile = { c: base[0], r: base[1] };

    points = path.map(function (w) { return tileToWorld(w.c, w.r); });

    segs = [];
    totalLen = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.hypot(dx, dy);
      segs.push({
        x: a.x, y: a.y, dx: dx, dy: dy, len: len,
        start: totalLen,
        angle: Math.atan2(dy, dx),
        nx: len ? dx / len : 0,
        ny: len ? dy / len : 0,
      });
      totalLen += len;
    }

    if (points.length) {
      spawnPoint = {
        x: points[0].x - segs[0].nx * 34,
        y: points[0].y - segs[0].ny * 34,
        angle: segs[0].angle,
      };
    }

    // Block every tile the road passes through. Walking the polyline rather
    // than the waypoint list matters because long segments cross tiles that
    // are not themselves waypoints.
    blocked = Object.create(null);
    var step = TILE / 4;
    for (var d = 0; d <= totalLen; d += step) {
      var p = posAt(d);
      var t = worldToTile(p.x, p.y);
      if (inGrid(t.c, t.r)) blocked[key(t.c, t.r)] = true;
    }
    blocked[key(baseTile.c, baseTile.r)] = true;

    return { length: totalLen, tiles: Object.keys(blocked).length };
  }

  /** Position and heading at a distance along the road. */
  function posAt(distance) {
    if (!segs.length) return { x: 0, y: 0, angle: 0 };
    if (distance <= 0) {
      return { x: segs[0].x + segs[0].nx * distance, y: segs[0].y + segs[0].ny * distance, angle: segs[0].angle };
    }
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (distance <= s.start + s.len || i === segs.length - 1) {
        var t = distance - s.start;
        return { x: s.x + s.nx * t, y: s.y + s.ny * t, angle: s.angle };
      }
    }
    var last = segs[segs.length - 1];
    return { x: last.x + last.dx, y: last.y + last.dy, angle: last.angle };
  }

  function baseWorld() { return tileToWorld(baseTile.c, baseTile.r); }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function drawGrid(ctx, time) {
    ctx.save();
    ctx.translate(mapLeft(), 0);

    // Buildable field.
    ctx.fillStyle = 'rgba(12, 20, 34, 0.55)';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Tile lattice.
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 0; c <= COLS; c++) {
      ctx.moveTo(c * TILE, 0);
      ctx.lineTo(c * TILE, MAP_H);
    }
    for (var r = 0; r <= ROWS; r++) {
      ctx.moveTo(0, r * TILE);
      ctx.lineTo(MAP_W, r * TILE);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawRoad(ctx, time) {
    if (!segs.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var trace = function () {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    };

    // Roadbed, then a darker core so the road reads as recessed.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)';
    ctx.lineWidth = TILE - 2;
    trace(); ctx.stroke();

    ctx.strokeStyle = 'rgba(6, 12, 22, 0.95)';
    ctx.lineWidth = TILE - 10;
    trace(); ctx.stroke();

    ctx.globalAlpha = 1;

    // Dashed centre line, animated along the direction of travel so the road
    // shows which way the traffic flows without a single written word.
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -((time || 0) * 26) % 22;
    trace(); ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawSpawn(ctx, time) {
    var p = spawnPoint;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // An inbound port: a bracket facing the playfield.
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, -16); ctx.lineTo(6, -16);
    ctx.moveTo(-8, 16); ctx.lineTo(6, 16);
    ctx.moveTo(-8, -16); ctx.lineTo(-8, 16);
    ctx.stroke();

    var pulse = 0.5 + 0.5 * Math.sin((time || 0) * 3);
    ctx.globalAlpha = 0.25 + pulse * 0.4;
    ctx.fillStyle = 'rgba(248, 113, 113, 0.55)';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-2, -9); ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBase(ctx, time, uptime) {
    var b = baseWorld();
    var hurt = uptime === undefined ? 0 : Math.max(0, 1 - uptime / 100);

    ctx.save();
    ctx.translate(b.x, b.y);

    // Base plate.
    ctx.fillStyle = 'rgba(10, 24, 34, 0.95)';
    ctx.strokeStyle = hurt > 0.4 ? 'rgba(248, 113, 113, 0.9)' : 'rgba(74, 222, 128, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-17, -17, 34, 34);
    ctx.fill();
    ctx.stroke();

    // Rack lights: a small server drawn in three units.
    for (var i = 0; i < 3; i++) {
      var y = -11 + i * 8;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.fillRect(-11, y, 22, 5);
      var blink = 0.4 + 0.6 * Math.abs(Math.sin((time || 0) * (2 + i) + i));
      ctx.globalAlpha = blink;
      ctx.fillStyle = hurt > 0.4 ? 'rgba(248, 113, 113, 0.9)' : 'rgba(74, 222, 128, 0.9)';
      ctx.fillRect(7, y + 1, 3, 3);
      ctx.globalAlpha = 1;
    }

    ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(215, 230, 245, 0.85)';
    ctx.fillText('PROD', 0, 27);

    ctx.restore();
  }

  var Map = {
    TILE: TILE, COLS: COLS, ROWS: ROWS, MAP_W: MAP_W, MAP_H: MAP_H, HUD_H: HUD_H, VH: VH,
    fit: fit,
    VW: function () { return VW; },
    hudTop: function () { return MAP_H; },
    scale: function () { return scale; },
    offset: function () { return { x: offsetX, y: offsetY }; },
    mapLeft: mapLeft,
    tileToWorld: tileToWorld,
    worldToTile: worldToTile,
    inGrid: inGrid,
    isBuildable: isBuildable,
    setPath: setPath,
    posAt: posAt,
    pathLength: function () { return totalLen; },
    waypoints: function () { return path.slice(); },
    baseWorld: baseWorld,
    baseTile: function () { return { c: baseTile.c, r: baseTile.r }; },
    spawnPoint: function () { return { x: spawnPoint.x, y: spawnPoint.y, angle: spawnPoint.angle }; },
    drawGrid: drawGrid,
    drawRoad: drawRoad,
    drawSpawn: drawSpawn,
    drawBase: drawBase,
  };

  global.PDMap = Map;
})(window);
