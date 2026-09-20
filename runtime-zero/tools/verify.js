#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {load,validate} = require('./backlog');
const ROOT = path.resolve(__dirname,'..');
let failed = false;
function run(command,args) {
  const result = spawnSync(command,args,{cwd:ROOT,encoding:'utf8'});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) { failed = true; console.error(result.error || `FAILED: ${command} ${args.join(' ')}`); }
}
const data=load();
const checked=validate(data);
for (const problem of checked.problems) { console.error(problem); failed=true; }
for (const item of data.items) {
  for (const file of item.refs.concat(item.evidence.map((e)=>e.artifact))) {
    const target=path.resolve(ROOT,file);
    if (!target.startsWith(ROOT+path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      failed=true; console.error(item.id+' missing/outside reference '+file);
    }
  }
}
for (const folder of ['tools','backlog']) {
  for (const file of fs.readdirSync(path.join(ROOT,folder)).filter((f)=>f.endsWith('.js'))) run(process.execPath,['--check',folder+'/'+file]);
}
run(process.execPath,['--test','tools/backlog.test.js','tools/reviews.test.js']);
run(process.execPath,['tools/reviews.js','--check']);
try {
  const review = require('./reviews').snapshot(data.items);
  for (const item of data.items) {
    if (review.blockers[item.id] && ['next','doing','done'].includes(item.status)) {
      failed=true; console.error(item.id+' is held by review; keep it blocked/later until accepted.');
    }
  }
} catch (err) { failed=true; console.error(err.message); }
// Compile in memory: no pycache or machine probing during specification checks.
run('python3',['-c',"from pathlib import Path; compile(Path('tools/doctor.py').read_text(), 'tools/doctor.py', 'exec'); print('doctor Python syntax: passed')"]);
console.log(failed ? 'Specification verification FAILED' : `Specification verification passed (${data.items.length} implementation tickets; game/GPU checks not run).`);
process.exitCode=failed?1:0;
