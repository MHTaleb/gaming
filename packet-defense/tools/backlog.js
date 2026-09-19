#!/usr/bin/env node
/**
 * backlog - validate the backlog data, or report on it.
 *
 *   node tools/backlog.js              validate; exit non-zero on any problem
 *   node tools/backlog.js --summary    validate, then print a progress summary
 *   node tools/backlog.js --json       machine-readable export (for CI, or a diff)
 *   node tools/backlog.js --ready      the next items to pick up, in score order
 *
 * WHY THIS EXISTS
 *
 * The backlog is the only artefact in this project that describes the *whole*
 * project, and it is the one most likely to rot: it is edited by hand, it is not
 * executed, and nothing breaks when it goes wrong. A dependency on an item that
 * was deleted, or an item marked done while its dependency is not, is the kind of
 * error that quietly makes a plan worthless.
 *
 * So it is data, and data gets checked. Zero dependencies, like everything else
 * in this repository.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'backlog', 'backlog.json');

function load() {
  const raw = fs.readFileSync(FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('backlog.json is not valid JSON: ' + err.message);
  }
}

/**
 * Everything that must be true for the backlog to be trustworthy.
 *
 * Deliberately strict about the things a human cannot check by reading - that an
 * id is unique, that a dependency exists, that an enum value is real - and silent
 * about the things only a human can judge, like whether a summary is any good.
 */
function validate(data) {
  const problems = [];
  const warn = [];

  const enums = (data.meta && data.meta.enums) || {};
  const items = data.items || [];
  const epics = data.epics || [];
  const research = data.research || [];

  if (!items.length) problems.push('no items');
  if (!epics.length) problems.push('no epics');

  const statuses = Object.keys(enums.status || {});
  const priorities = Object.keys(enums.priority || {});
  const sizes = Object.keys(enums.size || {});
  const types = Object.keys(enums.type || {});
  const areas = enums.areas || [];

  const ids = new Set();
  const epicIds = new Set(epics.map((e) => e.id));

  for (const e of epics) {
    if (!e.id) problems.push('an epic has no id');
    if (!e.title) problems.push('epic ' + e.id + ' has no title');
  }

  for (const it of items) {
    const where = it.id || '(an item with no id)';
    if (!it.id) { problems.push('an item has no id'); continue; }

    if (ids.has(it.id)) problems.push('duplicate id ' + it.id);
    ids.add(it.id);

    if (!it.title) problems.push(where + ' has no title');
    if (!it.summary) problems.push(where + ' has no summary');
    if (!statuses.includes(it.status)) problems.push(where + ' has unknown status "' + it.status + '"');
    if (!priorities.includes(it.priority)) problems.push(where + ' has unknown priority "' + it.priority + '"');
    if (!sizes.includes(it.size)) problems.push(where + ' has unknown size "' + it.size + '"');
    if (!types.includes(it.type)) problems.push(where + ' has unknown type "' + it.type + '"');
    if (!areas.includes(it.area)) problems.push(where + ' has unknown area "' + it.area + '"');
    if (it.epic && !epicIds.has(it.epic)) problems.push(where + ' references unknown epic "' + it.epic + '"');

    for (const key of ['value', 'risk']) {
      const v = it[key];
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        problems.push(where + ' has ' + key + ' ' + JSON.stringify(v) + ', expected an integer 1-5');
      }
    }

    // A blocked item must say what is blocking it, or the column is a shrug.
    if (it.status === 'blocked' && !it.blockedBy) {
      problems.push(where + ' is blocked but does not say by what');
    }
    // A dropped item must say why, or it will be re-proposed.
    if (it.status === 'dropped' && !it.why) {
      warn.push(where + ' is dropped without a reason recorded');
    }
  }

  // Dependencies, in a second pass so order in the file cannot matter.
  for (const it of items) {
    for (const dep of it.deps || []) {
      if (!ids.has(dep)) {
        problems.push(it.id + ' depends on ' + dep + ', which does not exist');
        continue;
      }
      const target = items.find((x) => x.id === dep);
      // Done means done: an item cannot be finished while what it depends on is not.
      if (it.status === 'done' && target.status !== 'done') {
        problems.push(it.id + ' is done but its dependency ' + dep + ' is "' + target.status + '"');
      }
      // A cycle of two is the only shape worth catching mechanically; longer
      // cycles are rare enough that a human will see them.
      if ((target.deps || []).includes(it.id)) {
        problems.push(it.id + ' and ' + dep + ' depend on each other');
      }
    }
  }

  // Research must cite what it produced, and every citation must resolve.
  for (const r of research) {
    if (!r.id) problems.push('a research entry has no id');
    if (!r.source) problems.push(r.id + ' has no source');
    if (!r.finding) problems.push(r.id + ' has no finding');
    for (const id of r.items || []) {
      if (!ids.has(id)) problems.push(r.id + ' references unknown item ' + id);
    }
  }

  const researchIds = new Set(research.map((r) => r.id));
  for (const it of items) {
    for (const s of it.sources || []) {
      if (!researchIds.has(s)) problems.push(it.id + ' cites unknown research ' + s);
    }
  }

  return { problems, warn, ids, items, epics, research };
}

/**
 * The ordering the board uses within a column.
 *
 * Value counts double because the point of the backlog is to build the thing
 * worth playing; risk is subtracted because an item that is likely to go wrong
 * costs more than its size suggests. The priority bonus is large enough to
 * outrank almost any value difference, because a P0 blocker is not a preference.
 */
function score(it) {
  const bonus = { P0: 9, P1: 5, P2: 2, P3: 0 }[it.priority] || 0;
  return (it.value * 2) - (it.risk * 1.5) + bonus;
}

function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);

  let data;
  try {
    data = load();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const { problems, warn, items } = validate(data);

  if (has('--json')) {
    console.log(JSON.stringify({
      meta: data.meta,
      ok: problems.length === 0,
      problems,
      warnings: warn,
      counts: countBy(items, 'status'),
      byPriority: countBy(items, 'priority'),
      byArea: countBy(items, 'area'),
    }, null, 2));
    process.exit(problems.length ? 1 : 0);
  }

  if (has('--ready')) {
    if (problems.length) {
      console.error('fix the backlog before asking what is ready:');
      for (const p of problems) console.error('  ! ' + p);
      process.exit(1);
    }
    const ready = items.filter((i) => i.status === 'next')
      .sort((a, b) => score(b) - score(a));
    console.log('\nready to pick up, best first\n');
    console.log('id        pri  score  size  area              title');
    console.log('-'.repeat(100));
    for (const i of ready) {
      console.log(
        i.id.padEnd(9) + i.priority.padEnd(5) +
        String(Math.round(score(i))).padStart(5) + '  ' +
        i.size.padEnd(5) + ' ' + (i.area || '').padEnd(18) + ' ' + i.title
      );
    }
    console.log('');
    process.exit(0);
  }

  if (has('--summary')) {
    const by = countBy(items, 'status');
    const order = ['done', 'doing', 'next', 'blocked', 'later', 'dropped'];
    const total = items.length;
    console.log('\n' + (data.meta.project || 'backlog') + '  ' + items.length + ' items\n');
    let width = 0;
    for (const s of order) width = Math.max(width, String(by[s] || 0).length);
    for (const s of order) {
      const n = by[s] || 0;
      const pct = Math.round((n / total) * 100);
      const bar = '#'.repeat(Math.round(pct / 2.5));
      console.log('  ' + s.padEnd(9) + String(n).padStart(width + 1) + '  ' +
        String(pct + '%').padStart(4) + '  ' + bar);
    }
    const done = by.done || 0;
    console.log('\n  ' + done + ' of ' + total + ' complete (' +
      Math.round((done / total) * 100) + '%)\n');
  }

  for (const w of warn) console.log('warn  ' + w);

  if (problems.length) {
    console.error('\n' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ':\n');
    for (const p of problems) console.error('  ! ' + p);
    console.error('');
    process.exit(1);
  }

  console.log('backlog ok: ' + items.length + ' items, all ids unique, all dependencies resolve, ' +
    (warn.length ? warn.length + ' warning(s)' : 'no warnings'));
}

function countBy(list, key) {
  const out = {};
  for (const it of list) out[it[key]] = (out[it[key]] || 0) + 1;
  return out;
}

if (require.main === module) main();

module.exports = { validate, score, load };
