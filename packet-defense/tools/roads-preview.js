/**
 * roads-preview.js - eyeball the road library.
 *
 * The generator can only tell me that a route is *valid*. Whether it is any
 * good is a visual question, so this prints ASCII maps and the measured
 * properties. It is how the quality thresholds in roads.js were chosen, and it
 * is the fastest way to answer "wait, are all the hairpins the same?" without
 * booting a browser.
 *
 *   node tools/roads-preview.js              summary + one map per family
 *   node tools/roads-preview.js --all        every road, compact
 *   node tools/roads-preview.js --id 40      one road, full detail
 *   node tools/roads-preview.js --check      validate every road, exit non-zero on failure
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRoads() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'roads.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'roads.js' });
  return sandbox.window.Roads;
}

const Roads = loadRoads();
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};

/** Render one route. `#` road, `S` spawn edge, `B` base, `.` buildable, `+` a twin tile. */
function draw(route) {
  const road = new Set();
  const twin = new Set();

  // Mirror roads.js's own walk so the picture matches the measurement.
  const pts = route.waypoints.map((p) => ({ x: p[0] + 0.5, y: p[1] + 0.5 }));
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.abs(dx) + Math.abs(dy);
    const n = Math.max(1, Math.round(len / 0.25));
    for (let k = 0; k < n; k++) samples.push({ x: a.x + dx * (k / n), y: a.y + dy * (k / n) });
  }
  samples.push(pts[pts.length - 1]);
  samples.forEach((p) => {
    const c = Math.floor(p.x);
    const r = Math.floor(p.y);
    if (c >= 0 && c < Roads.COLS && r >= 0 && r < Roads.ROWS) road.add(`${c},${r}`);
  });

  const reach2 = Roads.REACH * Roads.REACH;
  for (let c = 0; c < Roads.COLS; c++) {
    for (let r = 0; r < Roads.ROWS; r++) {
      if (road.has(`${c},${r}`)) continue;
      const cx = c + 0.5;
      const cy = r + 0.5;
      const seen = [];
      samples.forEach((p, i) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        if (dx * dx + dy * dy <= reach2) seen.push(i);
      });
      const gap = 2.0 / 0.25;
      for (let j = 1; j < seen.length; j++) {
        if (seen[j] - seen[j - 1] > gap) { twin.add(`${c},${r}`); break; }
      }
    }
  }

  const lines = [];
  for (let r = 0; r < Roads.ROWS; r++) {
    let line = '';
    for (let c = 0; c < Roads.COLS; c++) {
      const k = `${c},${r}`;
      if (c === Roads.BASE[0] && r === Roads.BASE[1]) line += 'B';
      else if (road.has(k)) line += '#';
      else if (twin.has(k)) line += '+';
      else line += '.';
    }
    lines.push(line);
  }
  return lines;
}

function describe(route) {
  return `${route.name.padEnd(18)} len ${String(route.length).padStart(3)}  road ${String(route.roadTiles).padStart(2)} tiles  ` +
    `spots ${String(route.spots).padStart(3)}  twin ${String(route.twin).padStart(3)}  corners ${String(route.corners).padStart(2)}  ` +
    `quality ${route.quality.toFixed(1)}`;
}

if (has('--check')) {
  let bad = 0;
  const seen = new Map();
  Roads.all().forEach((route) => {
    const wp = route.waypoints;
    const problems = [];
    if (wp[0][0] !== Roads.ENTRY) problems.push('does not start off-grid');
    const last = wp[wp.length - 1];
    if (last[0] !== Roads.BASE[0] || last[1] !== Roads.BASE[1]) problems.push('does not end on the base');
    wp.forEach((p, i) => {
      if (p[1] < 0 || p[1] >= Roads.ROWS) problems.push(`row ${p[1]} out of bounds at ${i}`);
      if (p[0] < Roads.ENTRY || p[0] >= Roads.COLS) problems.push(`col ${p[0]} out of bounds at ${i}`);
      if (i === 0) return;
      const prev = wp[i - 1];
      const dc = Math.abs(p[0] - prev[0]);
      const dr = Math.abs(p[1] - prev[1]);
      if (dc + dr === 0) problems.push(`zero-length leg at ${i}`);
      else if (dc !== 0 && dr !== 0) problems.push(`diagonal leg at ${i}`);
    });
    // The base must not be crossed on the way past.
    for (let i = 0; i < wp.length - 1; i++) {
      if (wp[i][0] === Roads.BASE[0] && wp[i][1] === Roads.BASE[1]) problems.push('crosses the base early');
    }
    const sig = Roads.signature(wp);
    if (seen.has(sig)) problems.push(`duplicate of ${seen.get(sig)}`);
    else seen.set(sig, route.name);

    if (problems.length) {
      bad++;
      console.log(`${route.name}: ${problems.join('; ')}`);
    }
  });

  const fams = Roads.families();
  console.log(`${Roads.count()} roads, ${fams.length} families: ${fams.join(', ')}`);
  console.log(bad === 0 ? 'all roads valid' : `${bad} invalid road(s)`);
  process.exit(bad === 0 ? 0 : 1);
}

const idArg = valueOf('--id', null);
if (idArg !== null) {
  const route = Roads.at(Number(idArg));
  console.log(describe(route));
  console.log(draw(route).join('\n'));
  console.log(route.waypoints.map((p) => `[${p[0]},${p[1]}]`).join(' -> '));
  process.exit(0);
}

if (has('--all')) {
  Roads.all().forEach((route) => {
    console.log(`\n${describe(route)}`);
    console.log(draw(route).join('\n'));
  });
  process.exit(0);
}

// Default: statistics, then one representative map per family so the shapes can
// be compared side by side.
const byFamily = new Map();
Roads.all().forEach((route) => {
  if (!byFamily.has(route.family)) byFamily.set(route.family, []);
  byFamily.get(route.family).push(route);
});

console.log(`${Roads.count()} roads across ${byFamily.size} families\n`);
console.log('family              n   len(min/max)   spots(min)   twin(min/max)   corners(max)');
byFamily.forEach((list, family) => {
  const lens = list.map((r) => r.length);
  const spots = list.map((r) => r.spots);
  const twins = list.map((r) => r.twin);
  const corners = list.map((r) => r.corners);
  console.log(
    `${family.padEnd(18)} ${String(list.length).padStart(3)}   ` +
    `${String(Math.min(...lens)).padStart(3)} / ${String(Math.max(...lens)).padStart(3)}      ` +
    `${String(Math.min(...spots)).padStart(3)}         ` +
    `${String(Math.min(...twins)).padStart(3)} / ${String(Math.max(...twins)).padStart(3)}      ` +
    `${String(Math.max(...corners)).padStart(3)}`
  );
});

console.log('\nOne map per family (best of family). `#` road, `B` base, `+` sees two stretches:');
byFamily.forEach((list, family) => {
  const route = list[0];
  console.log(`\n${describe(route)}`);
  console.log(draw(route).join('\n'));
});
