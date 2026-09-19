#!/usr/bin/env node
/**
 * verify - one command that runs every check this project has.
 *
 *   node tools/verify.js            the fast gates, a couple of minutes
 *   node tools/verify.js --full     adds the whole-campaign sweep
 *   node tools/verify.js --list     what would run, without running it
 *
 * WHY ONE ENTRY POINT
 *
 * Every check here already existed and every one of them was run by hand, by
 * whoever remembered to run it. That is the single most likely way this project
 * regresses: somebody changes one dial, the campaign's 240 measured tickets move,
 * and nothing says so. The checks are not the problem - remembering them is.
 *
 * CI calls this, and a person calls this, so there is exactly one definition of
 * "verified" and it cannot drift between the two.
 *
 * WHAT EACH GATE IS FOR
 *
 *   syntax      `node --check` on every JavaScript file in the project. Cheap,
 *               and it catches the class of mistake that otherwise fails at
 *               runtime in a way that looks like a game bug.
 *   backlog     the plan is internally consistent - no dangling dependency, no
 *               item marked done whose prerequisite is not.
 *   assets      the committed store PNGs still match the SVG they came from.
 *               Without this, editing the icon leaves a stale mark on the
 *               listing and nobody notices until review.
 *   relay       20 assertions on seat assignment, forwarding, credentials and
 *               the rule that a peer cannot forge battle state.
 *   invariants  the campaign's own promises: difficulty rises, every ticket is
 *               playable, no ticket is a wall of one threat type. Run per tier.
 *   replay      a battle still reproduces exactly from its action log. This is
 *               the property co-op rests on, so it is checked rather than
 *               believed.
 *   difficulty  tickets 1-10 still cost what they should, measured as slack
 *               rather than as "the bot survived". Slow, so it is behind --full.
 *
 * NOT HERE
 *
 * The in-page self-test needs a browser, so it is a separate CI job. It covers
 * what this cannot: the DOM, the ad and purchase flows, and the diagnostics
 * plumbing.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const LIST = args.includes('--list');

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

const C = process.stdout.isTTY
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', off: '' };

const results = [];

function run(name, why, fn) {
  if (LIST) {
    console.log('  ' + name.padEnd(14) + why);
    return;
  }
  process.stdout.write('  ' + name.padEnd(14) + C.dim + why + C.off + '  ');
  const started = Date.now();
  let outcome;
  try {
    outcome = fn();
  } catch (err) {
    outcome = { ok: false, detail: err.message };
  }
  const ms = Date.now() - started;
  if (outcome.ok) {
    console.log(C.ok + 'ok' + C.off + '  ' + C.dim + (outcome.detail || '') +
      ' (' + (ms / 1000).toFixed(1) + 's)' + C.off);
  } else {
    console.log(C.bad + 'FAIL' + C.off + '  ' + (outcome.detail || ''));
    if (outcome.output) {
      console.log(outcome.output.split('\n').slice(-25).map((l) => '      ' + l).join('\n'));
    }
  }
  results.push({ name, ...outcome, ms });
}

/** Run a node script in this project and capture its output. */
function node(script, scriptArgs) {
  const res = spawnSync(process.execPath, [script].concat(scriptArgs || []), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  return {
    ok: res.status === 0,
    detail: res.status === 0 ? '' : 'exit ' + res.status,
    output: (res.stdout || '') + (res.stderr || ''),
  };
}

/* ------------------------------------------------------------------ *
 * The gates
 * ------------------------------------------------------------------ */

/**
 * Every .js file must parse.
 *
 * This walks the project rather than listing files, because a list is a thing
 * that goes out of date - and the failure it guards against is precisely a file
 * nobody remembered to check.
 */
function checkSyntax() {
  const dirs = ['www/js', 'tools', 'server', 'backlog'];
  const files = [];
  for (const d of dirs) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.js')) files.push(path.join(d, name));
    }
  }
  // One level down, for server/relay and server/validator.
  for (const d of ['server/relay', 'server/validator']) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.js')) files.push(path.join(d, name));
    }
  }

  const bad = [];
  for (const f of files) {
    const res = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) bad.push(f + ': ' + (res.stderr || '').split('\n')[0]);
  }
  if (bad.length) {
    return { ok: false, detail: bad.length + ' file(s) do not parse', output: bad.join('\n') };
  }
  return { ok: true, detail: files.length + ' files' };
}

/**
 * The campaign's own promises, per tier.
 *
 * Every tier, not just normal: the invariants are properties of the generated
 * data, and a tier multiplies health, speed and armour - so a tier can be flat
 * where normal is rising.
 */
function checkInvariants() {
  const tiers = ['easy', 'normal', 'hard', 'hell', 'insane'];
  const bad = [];
  for (const tier of tiers) {
    const res = spawnSync(process.execPath,
      ['tools/balance.js', '--levels', '1-1', '--tier', tier],
      { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000 });
    const out = (res.stdout || '') + (res.stderr || '');
    if (res.status !== 0) { bad.push(tier + ': exit ' + res.status); continue; }
    if (!/invariants: all hold/.test(out)) {
      const line = out.split('\n').filter((l) => /does not rise|more flat|no bandwidth|unknown threat|single-threat/.test(l));
      bad.push(tier + ': ' + (line[0] || 'invariants did not hold'));
    }
  }
  if (bad.length) return { ok: false, detail: bad.length + ' tier(s)', output: bad.join('\n') };
  return { ok: true, detail: tiers.length + ' tiers' };
}

/** The whole campaign, all 240 tickets. Six minutes; worth it before a release. */
function checkFullCampaign() {
  const res = node('tools/balance.js');
  if (!res.ok) return res;
  const out = res.output;
  const cleared = /cleared (\d+)\/(\d+) tickets/.exec(out);
  if (!cleared) return { ok: false, detail: 'could not read a result', output: out };
  if (cleared[1] !== cleared[2]) {
    return { ok: false, detail: cleared[1] + '/' + cleared[2] + ' cleared', output: out };
  }
  return { ok: true, detail: cleared[1] + ' tickets cleared' };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

console.log('\npacket-defense verification' + (FULL ? '  (full)' : '') + '\n');

run('syntax', 'every .js file parses', checkSyntax);
run('backlog', 'the plan is internally consistent', () => node('tools/backlog.js'));
run('assets', 'store PNGs match the SVG they came from', () => node('tools/store-assets.js', ['--check']));
run('relay', '20 assertions on the co-op room server', () => node('server/relay/index.js', ['--test']));
run('invariants', 'the campaign rises and every ticket is playable', checkInvariants);
run('replay', 'a battle reproduces from its action log', () => node('tools/balance.js', ['--replay-check', '--levels', '1-3']));

if (FULL) {
  run('difficulty', 'tickets 1-10 still cost what they should', () => {
    const res = node('tools/balance.js', ['--minimal', '--levels', '1-10']);
    if (!res.ok) return res;
    const unwinnable = /(\d+) unwinnable/.exec(res.output);
    if (unwinnable && unwinnable[1] !== '0') {
      return { ok: false, detail: unwinnable[1] + ' unwinnable ticket(s) on normal', output: res.output };
    }
    const mean = /mean slack (\d+)%/.exec(res.output);
    return { ok: true, detail: mean ? 'mean slack ' + mean[1] + '%' : '' };
  });
  run('campaign', 'all 240 tickets clear', checkFullCampaign);
}

if (LIST) {
  console.log('');
  process.exit(0);
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.error(C.bad + failed.length + ' of ' + results.length + ' gates failed: ' +
    failed.map((f) => f.name).join(', ') + C.off + '\n');
  process.exit(1);
}
console.log(C.ok + 'all ' + results.length + ' gates passed' + C.off +
  '  ' + C.dim + '(' + (results.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1) + 's)' + C.off + '\n');
