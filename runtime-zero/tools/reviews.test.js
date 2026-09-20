'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadReviews,inspect,hash}=require('./reviews');
const {readyItems}=require('./backlog');
const ROOT=path.resolve(__dirname,'..');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rz-review-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(name,value)=>{const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const q={schema_version:1,id:'RV-001',author_role:'validator',reviewed_commit:'a'.repeat(40),report:'report.md',orders:'orders.md',findings:[{id:'V-001',severity:'high',kind:'fix',title:'Fix contract',blocks:['RZ-006'],required_actions:['Fix behavior'],acceptance_checks:['Expected behavior tested']}]};
  write('report.md','Report');write('orders.md','Orders');write('reviews/index.json',{schema_version:1,reviews:['RV-001']});write('reviews/RV-001/request.json',q);
  const qh=hash(fs.readFileSync(path.join(root,'reviews/RV-001/request.json')));
  const r={schema_version:1,review_id:'RV-001',author_role:'executor',request_sha256:qh,state:'draft',implementation_commit:null,summary:'',findings:[{id:'V-001',status:'pending',summary:'',changed_paths:[],evidence:[]}]};
  const v={schema_version:1,review_id:'RV-001',author_role:'validator',decision:'changes_requested',request_sha256:qh,response_sha256:null,implementation_commit:null,reason:'Fix required'};
  const items=[{id:'RZ-006',deps:[]},{id:'RZ-007',deps:['RZ-006']},{id:'RZ-008',deps:[]}];
  function save(){write('reviews/RV-001/response.json',r);write('reviews/RV-001/verdict.json',v);}
  function state(){save();return inspect(loadReviews(root),items,root);}
  function submit(){write('evidence.log','PASS\n');r.state='ready_for_review';r.implementation_commit='b'.repeat(40);r.summary='Corrected';r.findings[0]={id:'V-001',status:'addressed',summary:'Fixed',changed_paths:['game/core.gd'],evidence:[{command:'test',environment:'fixture',checked_at:'2026-09-20T19:00:00Z',exit_code:0,result:'passed',artifact:'evidence.log',sha256:hash('PASS\n')}]};save();}
  function accept(){submit();v.decision='accepted';v.response_sha256=hash(fs.readFileSync(path.join(root,'reviews/RV-001/response.json')));v.implementation_commit=r.implementation_commit;save();}
  save();return {root,q,r,v,items,write,save,state,submit,accept};
}
test('open review holds target and descendants, not unrelated work',(t)=>{
 const f=fixture(t),s=f.state();assert.deepEqual(s.problems,[]);assert(s.blockers['RZ-006']);assert(s.blockers['RZ-007']);assert(!s.blockers['RZ-008']);
});
test('complete executor submission waits for validator and keeps its gate',(t)=>{
 const f=fixture(t);f.submit();const s=f.state();assert.deepEqual(s.problems,[]);assert.equal(s.reviews[0].status,'awaiting_validator');assert(s.blockers['RZ-006']);
});
test('matching accepted verdict clears gate; changed response makes acceptance stale',(t)=>{
 const f=fixture(t);f.accept();assert.deepEqual(f.state().blockers,{});f.r.summary='Different submission';const s=f.state();assert(s.problems.some(p=>p.includes('acceptance is stale')));assert(s.blockers['RZ-006']);
});
test('changed implementation commit invalidates acceptance',(t)=>{
 const f=fixture(t);f.accept();f.r.implementation_commit='c'.repeat(40);assert(f.state().problems.some(p=>p.includes('acceptance is stale')));
});
test('evidence bytes must match their hash even after acceptance',(t)=>{
 const f=fixture(t);f.accept();f.write('evidence.log','CHANGED\n');const s=f.state();assert(s.problems.some(p=>p.includes('artifact hash mismatch')));assert(s.blockers['RZ-006']);
});
test('executor cannot submit accepted status or incomplete ready evidence',(t)=>{
 const f=fixture(t);f.r.state='accepted';assert(f.state().problems.some(p=>p.includes('self-acceptance')));f.r.state='ready_for_review';assert(f.state().problems.some(p=>p.includes('requires addressed')));
});
test('request edits require reconciliation; missing records fail closed',(t)=>{
 const f=fixture(t);f.q.findings[0].title='New requirement';f.write('reviews/RV-001/request.json',f.q);assert(f.state().problems.some(p=>p.includes('stale request')));fs.unlinkSync(path.join(f.root,'reviews/RV-001/request.json'));assert.throws(()=>loadReviews(f.root));
});
test('artifact path escape and nonzero passed evidence are rejected',(t)=>{
 const f=fixture(t);f.submit();f.r.findings[0].evidence[0].artifact='../outside.log';f.r.findings[0].evidence[0].exit_code=1;const s=f.state();assert(s.problems.some(p=>p.includes('nonzero')));assert(s.problems.some(p=>p.includes('outside.log')));
});
test('backlog readiness includes eligible unheld ticket and excludes held ticket',()=>{
 const items=[{id:'RZ-001',status:'done',deps:[],priority:'P0',value:5,risk:1},{id:'RZ-006',status:'next',deps:['RZ-001'],priority:'P0',value:5,risk:1},{id:'RZ-008',status:'next',deps:['RZ-001'],priority:'P1',value:5,risk:1}];
 assert.deepEqual(readyItems(items,{'RZ-006':['RV-001/V-001']}).map(i=>i.id),['RZ-008']);
});
test('registered current review is well-formed',()=>{
 const items=JSON.parse(fs.readFileSync(path.join(ROOT,'backlog/backlog.json'),'utf8')).items;
 assert.deepEqual(inspect(loadReviews(ROOT),items,ROOT).problems,[]);
});
