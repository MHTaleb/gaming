/**
 * roads.js - the road library.
 *
 * WHY A LIBRARY AND NOT SIXTY HAND-DRAWN ROADS
 *
 * The campaign is hundreds of tickets long. Hand-authoring a road for every one
 * is not just slow, it is how you end up shipping the same switchback three
 * times in a row because you ran out of ideas at three in the morning. So the
 * roads are *generated* from parameterised families, enumerated deterministically,
 * filtered down to the ones worth defending, and handed out to levels.
 *
 * It is deliberately not random. Route 71 is the same road on every device, in
 * every build, forever. That matters for more than reproducibility: a player
 * comparing notes with a friend, or reading a guide someone wrote, is looking at
 * the same map.
 *
 * ---------------------------------------------------------------------------
 * What makes a road worth defending
 *
 * Three properties are measured rather than assumed, because a generator that
 * only guarantees "a valid path exists" happily produces forty maps that all
 * play the same way.
 *
 *   `spots`   Buildable tiles that can see road at all. A route crammed against
 *             one wall leaves the player nowhere to build, and the level stops
 *             being a puzzle and becomes a question about one tile.
 *   `twin`    Tiles that see TWO stretches of road which are far apart along the
 *             route. This is the property the whole game is built on: a tower on
 *             a switchback corner covers two runs and is worth two towers. A
 *             road with no such tile is a corridor, not a puzzle, and it is
 *             exactly the difference between a good map and a lazy one.
 *   `length`  Total route length. This sets how long a threat spends under fire
 *             and therefore how much defence the level needs. It is the input
 *             the bandwidth budget is computed from.
 *
 * ---------------------------------------------------------------------------
 * Geometry
 *
 * Everything here is in *tile* coordinates, matching map.js: col 0..13 left to
 * right, row 0..8 top to bottom, with row 0 at the top. The entry waypoint sits
 * at col -1 so threats walk in from off-screen, which map.js already supports.
 *
 * Segments are axis-aligned by construction. The road is drawn as straight lines
 * between waypoints and the whole aesthetic is PCB traces; a diagonal would look
 * wrong and would make coverage impossible to reason about.
 *
 * The metrics below are computed with the same sampling the engine uses
 * (map.js walks the polyline in quarter-tile steps to decide which tiles the
 * road occupies), so what this file measures is what the game will actually do.
 */
(function (global) {
  'use strict';

  var COLS = 14;
  var ROWS = 9;
  var ENTRY = -1;
  var BASE = [13, 4];

  /** How far a tower reaches, in tiles. Towers.cost 96 range / 40-unit tiles. */
  var REACH = 2.4;
  /** Arc distance along the road that counts as "a different stretch", in tiles. */
  var APART = 2.0;
  /** Sample spacing when walking the polyline, matching map.js. */
  var STEP = 0.25;

  /* ------------------------------------------------------------------ *
   * Polyline construction
   * ------------------------------------------------------------------ */

  /**
   * Turn a list of corner targets into a polyline.
   *
   * Consecutive targets that differ in both x and y need an intermediate corner,
   * and which corner gets inserted changes the shape substantially - a
   * horizontal-first corner makes a staircase, a vertical-first one makes a
   * comb - so the caller picks. Every segment comes out axis-aligned.
   */
  function via(points, verticalFirst) {
    var wp = [points[0].slice()];
    for (var i = 1; i < points.length; i++) {
      var a = wp[wp.length - 1];
      var b = points[i];
      if (a[0] !== b[0] && a[1] !== b[1]) {
        wp.push(verticalFirst ? [a[0], b[1]] : [b[0], a[1]]);
      }
      wp.push(b.slice());
    }
    return tidy(wp);
  }

  /**
   * Drop repeated points and collinear middles.
   *
   * Collinear middles are not just noise: two routes that differ only by an
   * extra waypoint along a straight run are the *same road*, and leaving them in
   * would let the dedupe below count one shape several times and report a
   * bigger library than actually exists.
   */
  function tidy(wp) {
    var out = [];
    for (var i = 0; i < wp.length; i++) {
      var p = wp[i];
      var prev = out[out.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      out.push(p);
    }

    var res = [];
    for (var j = 0; j < out.length; j++) {
      var a = res[res.length - 1];
      var b = out[j];
      var c = out[j + 1];
      if (a && c) {
        var abx = b[0] - a[0], aby = b[1] - a[1];
        var bcx = c[0] - b[0], bcy = c[1] - b[1];
        var straight = abx * bcy - aby * bcx === 0;
        var sameWay = abx * bcx + aby * bcy > 0;
        if (straight && sameWay) continue;
      }
      res.push(b);
    }
    return res;
  }

  /** A route is only usable if it enters off-grid, ends on the base, and stays in bounds. */
  function valid(wp) {
    if (!wp || wp.length < 3) return false;
    if (wp[0][0] !== ENTRY) return false;

    var last = wp[wp.length - 1];
    if (last[0] !== BASE[0] || last[1] !== BASE[1]) return false;

    for (var i = 0; i < wp.length; i++) {
      var c = wp[i][0], r = wp[i][1];
      if (r < 0 || r >= ROWS) return false;
      if (c < ENTRY || c >= COLS) return false;
      if (i === 0) continue;

      var p = wp[i - 1];
      var dc = Math.abs(c - p[0]);
      var dr = Math.abs(r - p[1]);
      if (dc + dr === 0) return false;              // no zero-length leg
      if (dc !== 0 && dr !== 0) return false;       // must be axis-aligned
    }

    // The road must not run over the base on the way past it. Threats would
    // reach the server mid-route and the last stretch would never be walked.
    for (var k = 0; k < wp.length - 1; k++) {
      if (wp[k][0] === BASE[0] && wp[k][1] === BASE[1]) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Measurement
   * ------------------------------------------------------------------ */

  /** Ordered sample points along the route, in tile units. Index = arc position. */
  function samples(wp) {
    var pts = wp.map(function (p) { return { x: p[0] + 0.5, y: p[1] + 0.5 }; });
    var out = [];

    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      // Axis-aligned, so the Manhattan length is the Euclidean length.
      var len = Math.abs(dx) + Math.abs(dy);
      var n = Math.max(1, Math.round(len / STEP));
      for (var k = 0; k < n; k++) {
        out.push({ x: a.x + dx * (k / n), y: a.y + dy * (k / n) });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function tileOf(p) { return Math.floor(p.y) * COLS + Math.floor(p.x); }
  function inGrid(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  /**
   * Everything the level generator and the balance tool want to know about a
   * road. Computed once at load; the library is small and static.
   */
  function measure(wp) {
    var road = samples(wp);
    var blocked = Object.create(null);
    var roadTiles = 0;

    road.forEach(function (p) {
      var c = Math.floor(p.x), r = Math.floor(p.y);
      if (!inGrid(c, r)) return;
      var k = c + ',' + r;
      if (blocked[k]) return;
      blocked[k] = true;
      roadTiles++;
    });

    // `last` is the index of the sample furthest along the route that this tile
    // can see, and `first` the earliest. A tile that sees two stretches has a
    // large span between consecutive visible samples - see below.
    var spots = 0;
    var twin = 0;
    var reach2 = REACH * REACH;

    for (var c = 0; c < COLS; c++) {
      for (var r = 0; r < ROWS; r++) {
        if (blocked[c + ',' + r]) continue;
        var cx = c + 0.5, cy = r + 0.5;
        var seen = [];
        for (var i = 0; i < road.length; i++) {
          var dx = road[i].x - cx, dy = road[i].y - cy;
          if (dx * dx + dy * dy <= reach2) seen.push(i);
        }
        if (!seen.length) continue;
        spots++;

        /*
         * Two stretches, not one. The visible samples come back in arc order, so
         * a gap between consecutive visible samples means the tower is looking at
         * road, then not-road, then road again. The gap has to be more than a
         * tower's width to count: a tile beside a straight run sees a contiguous
         * band and that band can still span several samples.
         */
        var gap = APART / STEP;
        for (var j = 1; j < seen.length; j++) {
          if (seen[j] - seen[j - 1] > gap) { twin++; break; }
        }
      }
    }

    var length = 0;
    for (var s = 0; s < wp.length - 1; s++) {
      length += Math.abs(wp[s + 1][0] - wp[s][0]) + Math.abs(wp[s + 1][1] - wp[s][1]);
    }

    var corners = 0;
    for (var t = 1; t < wp.length - 1; t++) {
      var ax = wp[t][0] - wp[t - 1][0], ay = wp[t][1] - wp[t - 1][1];
      var bx = wp[t + 1][0] - wp[t][0], by = wp[t + 1][1] - wp[t][1];
      if (ax * by - ay * bx !== 0) corners++;
    }

    return {
      length: length,
      roadTiles: roadTiles,
      spots: spots,
      twin: twin,
      corners: corners,
      buildable: COLS * ROWS - roadTiles,
    };
  }

  function signature(wp) {
    return wp.map(function (p) { return p[0] + '.' + p[1]; }).join(' ');
  }

  /* ------------------------------------------------------------------ *
   * Families
   *
   * Each family is a shape idea with integer knobs. The sweeps below are
   * deliberately modest: a few hundred candidates is plenty to yield a library
   * of distinct, high-quality roads, and enumerating tens of thousands would
   * cost load time to produce duplicates that get filtered out anyway.
   * ------------------------------------------------------------------ */

  var XPAT = [
    [3, 7, 11],
    [2, 6, 10],
    [4, 8, 12],
    [2, 7, 11],
    [4, 7, 10],
    [1, 6, 11],
    [3, 6, 12],
  ];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /**
   * A. Switchback - the classic. Long horizontal runs joined by short vertical
   * connectors, so every corner sees two runs and the player learns the core
   * skill. This is the shape the hand-authored DEV levels use.
   */
  function switchbacks() {
    var out = [];
    [0, 1, 2].forEach(function (r0) {
      [6, 7, 8].forEach(function (r1) {
        [1, 2, 3].forEach(function (r2) {
          XPAT.slice(0, 4).forEach(function (x) {
            out.push({
              family: 'switchback',
              wp: via([[-1, r0], [x[0], r1], [x[1], r2], [x[2], 4], [13, 4]], false),
            });
            out.push({
              family: 'switchback',
              wp: via([[-1, r0], [x[0], r1], [x[1], r2], [x[2], 4], [13, 4]], true),
            });
          });
        });
      });
    });
    return out;
  }

  /**
   * B. Square wave - an oscillation between two rows with the period as a knob.
   * Short periods put many corners inside one tower's reach, which is what makes
   * a two-tower opening hold a whole map.
   */
  function squareWaves() {
    var out = [];
    [1, 2].forEach(function (ra) {
      [6, 7].forEach(function (rb) {
        [1, 2, 3].forEach(function (period) {
          [0, 1].forEach(function (offset) {
            var pts = [[-1, ra]];
            var y = ra;
            for (var x = offset; x <= 12; x += period) {
              y = y === ra ? rb : ra;
              pts.push([x, y]);
            }
            pts.push([Math.min(12, pts[pts.length - 1][0]), 4]);
            pts.push([13, 4]);
            out.push({ family: 'wave', wp: via(pts, false) });
            out.push({ family: 'wave', wp: via(pts, true) });
          });
        });
      });
    });
    return out;
  }

  /**
   * C. Serpentine - tall vertical legs joined at alternating ends. Rewards
   * range rather than rate of fire, and plays nothing like a switchback.
   */
  function serpentines() {
    var out = [];
    [[0, 8], [1, 7], [0, 7], [1, 8]].forEach(function (rows) {
      [[3, 7, 11], [2, 6, 10], [4, 9, 12], [3, 7, 10]].forEach(function (cols) {
        var pts = [[-1, rows[0]]];
        var y = rows[0];
        cols.forEach(function (x) {
          y = y === rows[0] ? rows[1] : rows[0];
          pts.push([x, y]);
        });
        pts.push([pts[pts.length - 1][0], 4]);
        pts.push([13, 4]);
        out.push({ family: 'serpentine', wp: via(pts, false) });
      });
    });
    return out;
  }

  /**
   * D. Spiral - a coil that leaves the middle of the map as dead space, exactly
   * like the hand-authored PRODUCTION levels. Teaches that the shortest route
   * between two points is not where you want to build.
   */
  function spirals() {
    var out = [];
    [0, 1].forEach(function (top) {
      [7, 8].forEach(function (bot) {
        [2, 3, 4].forEach(function (xl) {
          [9, 10, 11].forEach(function (xr) {
            if (xl >= xr - 3) return;
            out.push({
              family: 'spiral',
              wp: via([[-1, 4], [xl, top], [xr, top], [xr, bot], [xl, bot], [xl, 4], [13, 4]], false),
            });
          });
        });
      });
    });
    return out;
  }

  /**
   * E. Staircase - repeated two-tile steps. The road sweeps a diagonal band, so
   * the buildable space is split into two halves and the player has to choose
   * which side the firepower goes on.
   */
  function staircases() {
    var out = [];
    [1, 2].forEach(function (sx) {
      [1, 2].forEach(function (sy) {
        [0, 1].forEach(function (r0) {
          [1, -1].forEach(function (dir) {
            var pts = [[-1, r0]];
            var x = 0;
            var y = r0;
            for (var i = 0; i < 12; i++) {
              x = Math.min(12, x + sx);
              y = clamp(y + sy * dir, 0, 8);
              pts.push([x, y]);
              if (x >= 12) break;
            }
            pts.push([pts[pts.length - 1][0], 4]);
            pts.push([13, 4]);
            out.push({ family: 'staircase', wp: via(pts, false) });
          });
        });
      });
    });
    return out;
  }

  /**
   * F. Hairpin - out to the far wall, a tight 180, and back. The two legs run
   * parallel a few tiles apart, so a single tower in the gap covers both. This
   * family produces the highest `twin` counts in the library and it is the
   * shape that teaches placement best.
   */
  function hairpins() {
    var out = [];
    [0, 1, 2].forEach(function (rt) {
      [6, 7, 8].forEach(function (rb) {
        [9, 10, 11, 12].forEach(function (xt) {
          [1, 2, 3, 4].forEach(function (xb) {
            if (xt - xb < 4) return;
            out.push({
              family: 'hairpin',
              wp: via([[-1, rt], [xt, rt], [xt, rb], [xb, rb], [xb, 4], [13, 4]], false),
            });
          });
        });
      });
    });
    return out;
  }

  /**
   * G. Double hairpin - two nested U-turns, so the road crosses the same region
   * three times. Long, and the hardest family to cover with a small budget.
   */
  function doubleHairpins() {
    var out = [];
    [[0, 3, 6], [1, 4, 7], [0, 4, 8], [1, 3, 6]].forEach(function (rows) {
      [[12, 8, 3], [11, 7, 2], [12, 6, 2], [10, 6, 3]].forEach(function (x) {
        out.push({
          family: 'double-hairpin',
          wp: via([
            [-1, rows[0]], [x[0], rows[0]], [x[0], rows[1]], [x[1], rows[1]],
            [x[1], rows[2]], [x[2], rows[2]], [x[2], 4], [13, 4],
          ], false),
        });
      });
    });
    return out;
  }

  /**
   * H. Comb - a spine along the bottom with teeth reaching to the top. The
   * teeth are close together, so splash towers get unusual value and the level
   * is a lesson about the WAF.
   */
  function combs() {
    var out = [];
    [6, 7].forEach(function (spine) {
      [0, 1].forEach(function (top) {
        [2, 3].forEach(function (spacing) {
          [1, 2, 3].forEach(function (start) {
            var pts = [[-1, spine]];
            var up = true;
            for (var x = start; x <= 12; x += spacing) {
              pts.push([x, up ? top : spine]);
              up = !up;
            }
            pts.push([pts[pts.length - 1][0], 4]);
            pts.push([13, 4]);
            out.push({ family: 'comb', wp: via(pts, false) });
          });
        });
      });
    });
    return out;
  }

  /**
   * I. Ladder - a dense zigzag with a corner every tile or two. The road is
   * short and every part of it is coverable from the same handful of tiles,
   * which makes it the natural shape for a boss you have to out-damage rather
   * than out-position. Also the honest place to put the Zero-Day.
   */
  function ladders() {
    var out = [];
    [[0, 7], [1, 8], [0, 8], [1, 6]].forEach(function (rows) {
      [1, 2].forEach(function (step) {
        var pts = [[-1, rows[0]]];
        var y = rows[0];
        for (var x = 1; x <= 12; x += step) {
          y = y === rows[0] ? rows[1] : rows[0];
          pts.push([x, y]);
        }
        pts.push([pts[pts.length - 1][0], 4]);
        pts.push([13, 4]);
        out.push({ family: 'ladder', wp: via(pts, false) });
      });
    });
    return out;
  }

  /**
   * J. Gauntlet - short, few turns, nowhere to be clever. A boss road. You
   * either have the damage or you do not, which is the only honest way to end
   * an act.
   */
  function gauntlets() {
    var raw = [
      [[-1, 2], [5, 6], [12, 4], [13, 4]],
      [[-1, 1], [12, 1], [12, 4], [13, 4]],
      [[-1, 7], [12, 7], [12, 4], [13, 4]],
      [[-1, 3], [8, 3], [8, 6], [12, 6], [12, 4], [13, 4]],
      [[-1, 0], [6, 0], [6, 8], [12, 8], [12, 4], [13, 4]],
      [[-1, 4], [9, 4], [9, 0], [12, 0], [12, 4], [13, 4]],
      [[-1, 8], [4, 8], [4, 2], [12, 2], [12, 4], [13, 4]],
      [[-1, 2], [10, 2], [10, 6], [12, 6], [12, 4], [13, 4]],
    ];
    return raw.map(function (pts) {
      return { family: 'gauntlet', wp: via(pts, false) };
    });
  }

  /* ------------------------------------------------------------------ *
   * Build the library
   * ------------------------------------------------------------------ */

  /**
   * Quality gates. Set from the measured distribution of all candidates rather
   * than from taste: a road below these numbers gives the player too few places
   * to build, or too little reason to care where they build.
   */
  var MIN_LENGTH = 17;   // tiles of road
  var MIN_SPOTS = 55;    // buildable tiles that can see road
  var MIN_TWIN = 4;      // tiles that see two separate stretches
  var MIN_CORNERS = 4;

  /**
   * How much of the grid the road may occupy.
   *
   * The square-wave family is the reason this exists. Oscillating every tile
   * between two rows draws a horizontal run on every row *and* a vertical
   * connector on every column, which fills the middle of the map with a solid
   * slab of road. It passes every other test - it is long, it has corners, much
   * of it is in range of itself - and it is unplayable, because there is nowhere
   * to put a tower. A third of the grid is the ceiling; past that a map stops
   * being a map and becomes a corridor with decorations.
   */
  var MAX_ROAD_FRACTION = 0.34;

  /** How many roads the library aims for, spread evenly across the families. */
  var TARGET = 168;

  /** Per-family funnel, for tuneRoads' sake. See the preview tool's --why. */
  var DIAG = [];

  function buildLibrary() {
    var families = [
      { name: 'switchback', make: switchbacks },
      { name: 'wave', make: squareWaves },
      { name: 'serpentine', make: serpentines },
      { name: 'spiral', make: spirals },
      { name: 'staircase', make: staircases },
      { name: 'hairpin', make: hairpins },
      { name: 'double-hairpin', make: doubleHairpins },
      { name: 'comb', make: combs },
      { name: 'ladder', make: ladders },
      { name: 'gauntlet', make: gauntlets },
    ];

    // Dedupe across the whole candidate set, not per family: two families can
    // legitimately land on the same road, and the player would see the same map
    // twice under different names.
    var seen = Object.create(null);
    var buckets = [];

    families.forEach(function (fam) {
      var kept = [];
      var funnel = {
        family: fam.name, candidates: 0, invalid: 0, duplicate: 0,
        short: 0, crowded: 0, fewSpots: 0, fewTwin: 0, fewCorners: 0, kept: 0,
      };
      DIAG.push(funnel);

      fam.make().forEach(function (cand) {
        funnel.candidates++;
        var wp = cand.wp;
        if (!valid(wp)) { funnel.invalid++; return; }
        var sig = signature(wp);
        if (seen[sig]) { funnel.duplicate++; return; }
        seen[sig] = true;

        var m = measure(wp);
        var maxRoad = Math.floor(COLS * ROWS * MAX_ROAD_FRACTION);
        if (m.length < MIN_LENGTH) { funnel.short++; return; }
        if (m.roadTiles > maxRoad) { funnel.crowded++; return; }
        if (m.spots < MIN_SPOTS) { funnel.fewSpots++; return; }
        if (m.twin < MIN_TWIN) { funnel.fewTwin++; return; }
        if (m.corners < MIN_CORNERS) { funnel.fewCorners++; return; }
        funnel.kept++;

        kept.push({
          family: fam.name,
          waypoints: wp.map(function (p) { return [p[0], p[1]]; }),
          signature: sig,
          length: m.length,
          roadTiles: m.roadTiles,
          buildable: m.buildable,
          spots: m.spots,
          twin: m.twin,
          corners: m.corners,
          // One number for "how interesting is this map", used to sort each
          // family and to bias the campaign so the best roads land on the
          // hardest tickets.
          quality: m.twin * 2 + m.corners + m.spots / 4,
        });
      });

      // Rank inside the family, then take the shape-diverse spread rather than
      // simply the top N. Taking the top N would give forty near-identical
      // variations of whichever parameter combination scored best.
      kept.sort(function (a, b) { return b.quality - a.quality; });
      buckets.push(spread(kept));
    });

    // Round-robin across families so the library does not open with ninety
    // switchbacks in a row. Variety at this level is what stops the campaign
    // feeling like one map played two hundred times.
    var out = [];
    var i = 0;
    while (out.length < TARGET) {
      var added = false;
      for (var b = 0; b < buckets.length; b++) {
        if (i < buckets[b].length) {
          out.push(buckets[b][i]);
          added = true;
          if (out.length >= TARGET) break;
        }
      }
      if (!added) break;
      i++;
    }

    out.forEach(function (r, n) {
      r.id = n;
      r.name = r.family + '-' + ('00' + (n + 1)).slice(-3);
    });
    return out;
  }

  /**
   * Thin a ranked list so consecutive picks differ.
   *
   * Two roads next to each other in the ranking are usually the same shape with
   * one parameter nudged, so taking every k-th entry keeps the top of the list
   * while removing near-duplicates. `step` shrinks when the family is small so
   * a family with eight candidates still contributes all eight.
   */
  function spread(list) {
    if (list.length <= 4) return list.slice();
    var step = Math.max(1, Math.floor(list.length / Math.max(8, list.length / 3)));
    var out = [];
    for (var i = 0; i < list.length; i += step) out.push(list[i]);
    // Always keep the best of the family, then top up from the tail if thinning
    // was aggressive.
    if (out.indexOf(list[0]) === -1) out.unshift(list[0]);
    return out;
  }

  var LIBRARY = buildLibrary();

  var BY_NAME = Object.create(null);
  LIBRARY.forEach(function (r) { BY_NAME[r.name] = r; });

  function all() { return LIBRARY.slice(); }
  function count() { return LIBRARY.length; }
  function byName(name) { return BY_NAME[name] || null; }
  /** Route object by index, wrapping - the campaign hands these out in order. */
  function at(i) { return LIBRARY[((i % LIBRARY.length) + LIBRARY.length) % LIBRARY.length]; }

  /** name -> waypoint list, the shape map.js and the self-test expect. */
  function table() {
    var out = Object.create(null);
    LIBRARY.forEach(function (r) { out[r.name] = r.waypoints; });
    return out;
  }

  /** Family names, in library order, for the briefing screen. */
  function families() {
    var out = [];
    LIBRARY.forEach(function (r) { if (out.indexOf(r.family) === -1) out.push(r.family); });
    return out;
  }

  global.Roads = {
    all: all,
    at: at,
    count: count,
    byName: byName,
    table: table,
    families: families,
    measure: measure,
    signature: signature,
    /**
     * Why each family contributed what it did.
     *
     * The thresholds above are the difference between a library of good maps and
     * a library of valid ones, and they were chosen by watching this funnel. Any
     * change to a sweep or a threshold should be made with it visible, because
     * the failure mode is silent: a family that yields nothing looks exactly like
     * a family that was never written.
     */
    diagnostics: function () { return DIAG.map(function (d) { return Object.assign({}, d); }); },
    thresholds: {
      MIN_LENGTH: MIN_LENGTH,
      MIN_SPOTS: MIN_SPOTS,
      MIN_TWIN: MIN_TWIN,
      MIN_CORNERS: MIN_CORNERS,
      MAX_ROAD_FRACTION: MAX_ROAD_FRACTION,
      TARGET: TARGET,
    },
    COLS: COLS,
    ROWS: ROWS,
    BASE: BASE.slice(),
    ENTRY: ENTRY,
    REACH: REACH,
  };
})(window);
