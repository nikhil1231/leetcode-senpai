// Distributed-data simulator models: each shows the behaviour its lesson teaches.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../static/dist-models.js');

test('clocks: a skewed clock makes last-write-wins drop the causally later write; Lamport and version vectors do not',()=>{
 assert.equal(M.clockRace({strategy:'lww',skew:0,gap:50}).lostCausal,false);
 const bad=M.clockRace({strategy:'lww',skew:-80,gap:50});
 assert.equal(bad.lostCausal,true); assert.deepEqual(bad.kept,['A']); assert.equal(bad.threshold,-50);
 assert.equal(M.clockRace({strategy:'lww',skew:-50,gap:50}).lostCausal,false,'equal stamps tie to the higher node id');
 assert.equal(M.clockRace({strategy:'lww',skew:-51,gap:50}).lostCausal,true);
 for(const skew of [-500,-80,0,300]){
  assert.equal(M.clockRace({strategy:'lamport',skew,gap:50}).lostCausal,false);
  assert.equal(M.clockRace({strategy:'vector',skew,gap:50}).lostAny,false);
 }
});
test('clocks: concurrent writes lose one under LWW and Lamport, but version vectors keep both as siblings',()=>{
 assert.equal(M.clockRace({strategy:'lww',concurrent:true}).lostAny,true);
 assert.equal(M.clockRace({strategy:'lamport',concurrent:true}).lostAny,true,'Lamport cannot tell concurrent from ordered');
 const v=M.clockRace({strategy:'vector',concurrent:true});
 assert.equal(v.siblings,true); assert.equal(v.lostAny,false); assert.deepEqual(v.kept,['A','B']);
 assert.equal(M.clockRace({strategy:'nope'}).strategy,'lww');
});
test('stream replay: at-least-once duplicates, at-most-once loses, idempotent and atomic are exact',()=>{
 const base={events:20,every:5,crashAt:12};
 const after=M.streamRun({...base,mode:'after'});
 assert.deepEqual(after.batch,[11,15]); assert.equal(after.duplicated,1); assert.equal(after.lost,0);
 const before=M.streamRun({...base,mode:'before'});
 assert.equal(before.lost,4); assert.equal(before.duplicated,0);
 for(const mode of ['idempotent','atomic']){const r=M.streamRun({...base,mode}); assert.ok(r.exact,mode); assert.equal(r.effects.every(c=>c===1),true);}
 assert.equal(M.streamRun({...base,mode:'after',every:1}).duplicated,0,'one-event batches leave no window');
 assert.equal(M.streamRun({...base,mode:'after',every:20,crashAt:20}).duplicated,19);
});
test('batch joins: skew punishes sort-merge, broadcast needs the small side in memory, splitting the hot key restores balance',()=>{
 const even=M.joinCost({clicks:1e9,users:1e6,workers:100,skew:0});
 assert.equal(even.rows.find(r=>r.key==='broadcast').ok,true); assert.equal(even.best,'broadcast');
 assert.equal(even.rows.find(r=>r.key==='partitioned').ok,false,'inputs were not pre-partitioned');
 assert.equal(M.joinCost({clicks:1e9,users:1e6,prepartitioned:true}).rows.find(r=>r.key==='partitioned').shuffled,0);
 const hot=M.joinCost({clicks:1e9,users:1e6,workers:100,skew:0.6});
 const hsm=hot.rows.find(r=>r.key==='sortmerge'), sk=hot.rows.find(r=>r.key==='skewed');
 assert.ok(hsm.straggler>=0.6*hot.bigBytes-1); assert.ok(sk.straggler<hsm.straggler/5);
 const huge=M.joinCost({clicks:1e10,users:1e9,workers:100,memGB:8});
 assert.equal(huge.rows.find(r=>r.key==='broadcast').ok,false,'200 GB does not fit in 8 GB');
 assert.notEqual(huge.best,'broadcast'); assert.ok(huge.rows.every(r=>!r.ok||Number.isFinite(r.seconds)));
});
test('dual writes: only a single ordered log guarantees the derived copy matches',()=>{
 assert.equal(M.dualWrite({mode:'dual',conflict:0,crash:0}).diverged,0);
 const d=M.dualWrite({mode:'dual',conflict:0.5,crash:0.05,keys:1000});
 assert.ok(d.diverged>100,'many keys disagree'); assert.equal(d.diverged,d.race+d.lostSecond);
 assert.equal(M.dualWrite({mode:'log',conflict:1,crash:0.2,keys:1000}).diverged,0);
 assert.deepEqual(M.dualWrite({mode:'dual',seed:3}),M.dualWrite({mode:'dual',seed:3}),'seeded, so repeatable');
 assert.ok(M.dualWrite({mode:'dual',conflict:1,crash:0,keys:2000}).pct>40,'about half of racing keys diverge');
});
test('encoding: field numbers make renames safe but reuse fatal; Avro needs defaults and aliases; JSON names are identity',()=>{
 assert.ok(M.compat('proto','rename').safe); assert.ok(!M.compat('json','rename').safe);
 assert.equal(M.compat('avro','rename').backward,true); assert.equal(M.compat('avro','rename').forward,false);
 assert.ok(!M.compat('proto','reuseTag').backward && !M.compat('proto','reuseTag').forward);
 for(const f of Object.keys(M.FORMATS)){
  assert.ok(M.compat(f,'addOptional').safe,f);
  assert.equal(M.compat(f,'addRequired').backward,false,f+' cannot read old data');
  assert.equal(M.compat(f,'addRequired').forward,true,f+' old code ignores it');
  assert.equal(M.compat(f,'widen').forward,false,f+' truncates or loses precision');
  assert.equal(M.compatBoard(f).rows.length,Object.keys(M.CHANGES).length);
 }
 assert.equal(M.compat('proto','removeRequired').forward,false);
});
