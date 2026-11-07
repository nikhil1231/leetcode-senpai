// Night Shift: every level can be played well (three stars) and badly, and each kind of move does what it says.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../static/nightshift-engine.js');
const {levels}=require('../static/simulators/nightshift.json');

for(const L of levels){
 test(`${L.id}: the best line is three stars; doing nothing useful never stabilises`,()=>{
  const best=E.solve(L);
  assert.equal(best.result.stars,3,JSON.stringify(best.result));
  let s=E.start(L);
  for(const c of L.commands) s=E.run(s,L,c.id);
  for(const a of L.actions.filter(a=>a.effect==='none'||a.effect==='worse')) s=E.act(s,L,a.id);
  assert.equal(s.stable,null); assert.ok(s.impact>0);
  assert.equal(E.close(s,L).closed,false,'cannot close an unstable incident');
 });
 test(`${L.id}: a temporary fix relapses; wrong answers and risky moves cost stars`,()=>{
  const temp=L.actions.find(a=>a.effect==='temp');
  if(temp){
   let s=E.act(E.start(L),L,temp.id); assert.equal(s.stable,'temp');
   for(let i=0;i<temp.relapse+2;i++) s=E.run(s,L,L.commands[0].id);
   assert.equal(s.stable,null); assert.equal(s.relapsed,1);
   const early=E.close(E.answer(E.answer(E.act(E.start(L),L,temp.id),'diagnosis',L.diagnosis.answer),'fix',L.fix.answer),L);
   assert.equal(early.result.stars,1); assert.equal(early.result.lasting,false);
  }
  const fix=L.actions.find(a=>a.effect==='fix');
  const wrong=E.close(E.answer(E.answer(E.act(E.start(L),L,fix.id),'diagnosis',(L.diagnosis.answer+1)%L.diagnosis.choices.length),'fix',L.fix.answer),L);
  assert.equal(wrong.result.stars,1); assert.equal(wrong.result.diagnosis,false);
  const risky=L.actions.find(a=>a.risky&&a.effect==='outage');
  if(risky){ const r=E.close(E.answer(E.answer(E.act(E.start(L),L,risky.id),'diagnosis',L.diagnosis.answer),'fix',L.fix.answer),L); assert.equal(r.result.stars,2); assert.equal(r.result.risky,1); }
 });
 test(`${L.id}: every choice set has its answer in range, and outputs change once stable where they say so`,()=>{
  for(const q of [L.diagnosis,L.fix]) assert.ok(q.answer>=0&&q.answer<q.choices.length&&q.choices.length>=3);
  const fixed=E.act(E.start(L),L,L.actions.find(a=>a.effect==='fix').id);
  const c=L.commands.find(c=>c.after); if(c) assert.equal(E.run(fixed,L,c.id).log.at(-1).out,c.after);
 });
}
test('the timeline speaks while it burns, and hints come from Priya',()=>{
 const L=levels[0]; let s=E.start(L);
 for(let i=0;i<12;i++) s=E.run(s,L,L.commands[0].id);
 assert.ok(s.log.some(x=>x.kind==='chat'&&x.who===L.timeline[0].who));
 s=E.hint(s,L); assert.equal(s.hints,1); assert.ok(s.log.at(-1).hint);
});
