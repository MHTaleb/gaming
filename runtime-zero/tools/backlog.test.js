'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {validate, load, readyItems} = require('./backlog');
const http = require('node:http');
const {handler} = require('./serve');
const fixture = () => JSON.parse(JSON.stringify(load()));
test('backlog is valid and ready rows respect dependencies', () => {
  const d = fixture();
  assert.deepEqual(validate(d).problems, []);
  // Isolated fixture: an eligible task is included and an unmet-dependency
  // task is excluded, without depending on the live backlog's progress state.
  const items = [
    {id: 'RZ-901', status: 'done', deps: [], priority: 'P1', value: 3, risk: 2},
    {id: 'RZ-902', status: 'next', deps: ['RZ-901'], priority: 'P1', value: 3, risk: 2},
    {id: 'RZ-903', status: 'next', deps: ['RZ-904'], priority: 'P1', value: 3, risk: 2},
  ];
  assert.deepEqual(readyItems(items).map((i) => i.id), ['RZ-902']);
});
test('unmet prerequisites cannot be ready or doing', () => {
  for (const status of ['next','doing']) {
    const d = fixture();
    d.items[0].status = 'later';
    d.items[1].status = status; d.items[1].owner = 'test';
    assert(validate(d).problems.some((p) => p.includes('unmet dependency')));
    assert(!readyItems(d.items).some((i) => i.id === 'RZ-002'));
  }
});
test('long and self dependency cycles fail', () => {
  const d = fixture(); d.items[0].status = 'later';
  d.items[0].deps = ['RZ-003'];
  assert(validate(d).problems.some((p) => p.includes('dependency cycle')));
  d.items[0].deps = ['RZ-001'];
  assert(validate(d).problems.some((p) => p.includes('dependency cycle')));
});
test('done needs evidence and doing needs ownership', () => {
  const d = fixture(); d.items[0].status = 'done'; d.items[0].evidence = [];
  assert(validate(d).problems.some((p) => p.includes('without evidence')));
  d.items[0].status = 'doing'; delete d.items[0].owner;
  assert(validate(d).problems.some((p) => p.includes('without owner')));
});
test('unknown dependencies and malformed instruction arrays fail', () => {
  const d = fixture(); d.items[0].deps = ['RZ-999'];
  assert(validate(d).problems.length);
  d.items[0].steps = 'pretend checklist';
  assert(validate(d).problems.some((p) => p.includes('string array steps')));
});
test('blocked reason and completion dependencies are enforced', () => {
  const d = fixture(); d.items[0].status = 'blocked';
  assert(validate(d).problems.some((p) => p.includes('does not say')));
  d.items[0].status = 'later'; d.items[1].status = 'done';
  d.items[1].evidence = [{command:'test',result:'passed',artifact:'reports/example.md',environment:'test'}];
  assert(validate(d).problems.some((p) => p.includes('done but its dependency')));
});
test('duplicate epic/research IDs and failed evidence are rejected', () => {
  const d = fixture(); d.epics.push(d.epics[0]);
  assert(validate(d).problems.some((p) => p.includes('duplicate epic')));
  d.items[0].status='done';
  d.items[0].evidence=[{command:'test',result:'failed',artifact:'reports/example.md',environment:'test'}];
  assert(validate(d).problems.some((p) => p.includes('non-passing')));
});
test('board server reads its own data and rejects writes and non-board paths', async (t) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const json = await (await fetch(base + '/backlog/backlog.json')).json();
  assert.equal(json.meta.project, 'Runtime Zero');
  for (const pathname of ['/AGENTS.md','/config/local.json','/packet-defense/backlog/backlog.json','/backlog/%2e%2e/AGENTS.md']) {
    assert.equal((await fetch(base + pathname)).status, 404);
  }
  assert.equal((await fetch(base + '/backlog/backlog.json', {method:'POST',body:'{}'})).status, 405);
  assert.equal((await fetch(base + '/backlog/board.js')).status, 200);
});
