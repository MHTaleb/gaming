#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha = (value, length = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every(nonempty);
function projectFile(root, relative) {
  if (!nonempty(relative) || path.isAbsolute(relative)) throw new Error('expected project-relative file path');
  const resolved = fs.realpathSync(path.resolve(root, relative));
  const base = fs.realpathSync(root) + path.sep;
  if (!resolved.startsWith(base) || !fs.statSync(resolved).isFile()) throw new Error('missing/outside project file: ' + relative);
  return resolved;
}
function loadReviews(root = ROOT) {
  const read = (name) => JSON.parse(fs.readFileSync(projectFile(root, name), 'utf8'));
  const index = read('reviews/index.json');
  if (index.schema_version !== 1 || !strings(index.reviews) || new Set(index.reviews).size !== index.reviews.length) throw new Error('invalid review index');
  const dirs = fs.readdirSync(path.join(root, 'reviews')).filter((name) => /^RV-\d{3}$/.test(name));
  if (dirs.some((id) => !index.reviews.includes(id))) throw new Error('unregistered review directory');
  return index.reviews.map((id) => {
    if (!/^RV-\d{3}$/.test(id)) throw new Error('invalid review id: ' + id);
    const prefix = 'reviews/' + id + '/';
    return {id, request:read(prefix+'request.json'), response:read(prefix+'response.json'), verdict:read(prefix+'verdict.json'),
      requestHash:hash(fs.readFileSync(projectFile(root,prefix+'request.json'))),
      responseHash:hash(fs.readFileSync(projectFile(root,prefix+'response.json')))};
  });
}
function inspect(records, items, root = ROOT) {
  const problems = [], reviews = [], blockers = {};
  const itemIds = new Set(items.map((i) => i.id));
  for (const record of records) {
    const {id,request:q,response:r,verdict:v,requestHash,responseHash} = record;
    const errors = [];
    const requireThat = (ok,message) => { if (!ok) errors.push(id+': '+message); };
    const file = (relative) => { try { return projectFile(root,relative); } catch (e) { errors.push(id+': '+e.message); return null; } };
    requireThat(q && q.id===id && q.schema_version===1 && q.author_role==='validator' && sha(q.reviewed_commit,40),'invalid validator request');
    requireThat(q && Array.isArray(q.findings) && q.findings.length>0,'findings required');
    if (!q || !Array.isArray(q.findings)) { problems.push(...errors); continue; }
    file(q.report); file(q.orders);
    const ids = new Set();
    for (const f of q.findings) {
      requireThat(f && /^V-\d{3}$/.test(f.id) && !ids.has(f.id),'invalid/duplicate finding id');
      if (!f) continue;
      ids.add(f.id);
      requireThat(['high','medium','low'].includes(f.severity) && ['fix','evidence','documentation'].includes(f.kind) && nonempty(f.title),'finding metadata required');
      requireThat(strings(f.required_actions) && f.required_actions.length>0 && strings(f.acceptance_checks) && f.acceptance_checks.length>0,'finding actions/checks required');
      requireThat(strings(f.blocks) && f.blocks.every((ticket)=>itemIds.has(ticket)),'unknown blocked ticket');
    }
    requireThat(r && r.schema_version===1 && r.review_id===id && r.author_role==='executor' && ['draft','ready_for_review'].includes(r.state),'invalid executor response (self-acceptance forbidden)');
    requireThat(r && r.request_sha256===requestHash,'response references stale request; reconcile request before submitting');
    requireThat(r && Array.isArray(r.findings) && r.findings.length===ids.size,'response must cover every finding');
    const responseIds = new Set();
    for (const f of (r && Array.isArray(r.findings) ? r.findings : [])) {
      requireThat(f && ids.has(f.id) && !responseIds.has(f.id),'unknown/duplicate response finding');
      if (!f) continue;
      responseIds.add(f.id);
      requireThat(['pending','in_progress','blocked','addressed'].includes(f.status) && strings(f.changed_paths) && Array.isArray(f.evidence),'invalid finding response');
      if (['blocked','addressed'].includes(f.status)) requireThat(nonempty(f.summary),'blocked/addressed finding needs explanation');
      if (r.state==='ready_for_review') requireThat(f.status==='addressed' && f.evidence?.length>0,'ready response requires addressed findings and evidence');
      for (const e of (Array.isArray(f.evidence) ? f.evidence : [])) {
        requireThat(e && nonempty(e.command) && nonempty(e.environment) && Number.isInteger(e.exit_code) && ['passed','failed','observation'].includes(e.result) && sha(e.sha256) && typeof e.checked_at==='string' && e.checked_at.endsWith('Z') && Number.isFinite(Date.parse(e.checked_at)),'evidence needs exact command/environment/exit/result/hash/UTC time');
        if (!e) continue;
        if (e.result==='passed') requireThat(e.exit_code===0,'passed evidence cannot have nonzero exit code');
        const artifact = file(e.artifact);
        if (artifact) requireThat(hash(fs.readFileSync(artifact))===e.sha256,'evidence artifact hash mismatch: '+e.artifact);
      }
    }
    if (r?.state==='ready_for_review') requireThat(sha(r.implementation_commit,40) && nonempty(r.summary),'ready response requires full implementation commit and summary');
    requireThat(v && v.schema_version===1 && v.review_id===id && v.author_role==='validator' && ['changes_requested','accepted','waived'].includes(v.decision) && nonempty(v.reason),'invalid validator verdict');
    requireThat(v && v.request_sha256===requestHash,'verdict references stale request');
    let accepted = false;
    if (v && ['accepted','waived'].includes(v.decision)) {
      requireThat(r?.state==='ready_for_review' && sha(r.implementation_commit,40),'acceptance requires submitted response');
      requireThat(v.response_sha256===responseHash && v.implementation_commit===r?.implementation_commit,'acceptance is stale for current response/implementation');
      accepted=errors.length===0;
    }
    const rejectedSubmission = v?.decision==='changes_requested' && v.response_sha256===responseHash;
    const status=accepted?v.decision:(r?.state==='ready_for_review' && !rejectedSubmission?'awaiting_validator':'executor_action');
    reviews.push({id,status,reason:v?.reason,request:'reviews/'+id+'/request.json',response:'reviews/'+id+'/response.json',rejectedSubmission,findings:q.findings.map((f)=>({...f,response_status:r?.findings?.find((entry)=>entry.id===f.id)?.status || 'pending'}))});
    if (!accepted) for (const f of q.findings) for (const ticket of (Array.isArray(f?.blocks)?f.blocks:[])) {
      blockers[ticket]=[...new Set([...(blockers[ticket]||[]),id+'/'+f.id])];
    }
    problems.push(...errors);
  }
  // A review held prerequisite also holds its dependents, regardless of stale done flags.
  let changed=true;
  while(changed) {
    changed=false;
    for(const item of items) {
      const inherited=(item.deps||[]).flatMap((dep)=>blockers[dep]||[]);
      const merged=[...new Set([...(blockers[item.id]||[]),...inherited])];
      if(merged.length>(blockers[item.id]||[]).length) {blockers[item.id]=merged;changed=true;}
    }
  }
  return {problems,reviews,blockers};
}
function snapshot(items, root = ROOT) { return inspect(loadReviews(root),items,root); }
function main() {
  const args=process.argv.slice(2);
  if(args[0]==='--hash') { console.log(hash(fs.readFileSync(projectFile(ROOT,args[1])))); return; }
  const items=JSON.parse(fs.readFileSync(path.join(ROOT,'backlog/backlog.json'),'utf8')).items;
  const state=snapshot(items);
  if(args.includes('--json')) console.log(JSON.stringify(state,null,2));
  else if(state.problems.length) console.error(state.problems.join('\n'));
  else if(args[0]==='--gate') {
    const target=args[1];
    if(target!=='all' && !items.some((i)=>i.id===target)) throw new Error('unknown gate target');
    const held=target==='all'?Object.keys(state.blockers):(state.blockers[target]?[target]:[]);
    console.log(held.length?'Review gate HELD: '+held.join(', '):'Review gate clear');
    if(held.length) process.exitCode=1;
  } else if(args.includes('--check')) console.log('Review records valid; '+state.reviews.filter((r)=>!['accepted','waived'].includes(r.status)).length+' review(s) unresolved (not independent approval).');
  else {
    const open=state.reviews.filter((r)=>!['accepted','waived'].includes(r.status)).sort((a,b)=>(a.status==='executor_action'?0:1)-(b.status==='executor_action'?0:1));
    if(!open.length) console.log('No registered review work pending. Check new submissions and remote updates.');
    for(const review of open) {
      console.log(review.id+' — '+review.status+' — '+review.request);
      if(review.status==='executor_action') {
        const pending=review.rejectedSubmission?review.findings:review.findings.filter((f)=>f.response_status!=='addressed');
        for(const f of pending) console.log('  '+f.id+' ['+f.severity+'; '+f.response_status+'] '+f.title);
        if(!pending.length) console.log('  All findings addressed in draft; validate evidence and submit ready_for_review.');
        if(review.rejectedSubmission) console.log('  Validator requested revisions: '+review.reason);
      }
      else console.log('  Response submitted; do not self-approve. Await validator.');
    }
  }
  if(state.problems.length) process.exitCode=1;
}
if(require.main===module) { try{main();}catch(e){console.error(e.message);process.exitCode=1;} }
module.exports={loadReviews,inspect,snapshot,hash,projectFile};
