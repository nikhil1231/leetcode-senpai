// Design builder: estimates, sanity checks, Mermaid export, and the shipped component and preset data.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../static/sd-builder-calc.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../static/simulators/builder.json'),'utf8'));
const g=(defs,links=[])=>({nodes:defs.map((d,i)=>({id:'n'+(i+1),defId:d})),edges:links.map(([a,b],i)=>({id:'e'+i,from:'n'+a,to:'n'+b}))});
const ids=(graph,scale,nfr)=>C.checks(graph,scale,nfr).map(x=>x.id);

test('estimates fall back to 10 reads and 1 write per user per day, and honour overrides',()=>{
 const e=C.estimate({dau:'8,640,000'});
 assert.equal(Math.round(e.readQps),1000);assert.equal(Math.round(e.writeQps),100);
 assert.equal(Math.round(e.peakRead),5000);assert.equal(e.cdnOffload,'~60%');
 const o=C.estimate({dau:'100',readQps:'20000',writeQps:'50'});
 assert.equal(o.readQps,20000);assert.equal(o.writeQps,50);assert.equal(o.readReplicas,10);assert.equal(o.cdnOffload,'~80%');
 const zero=C.estimate({});assert.ok(zero.readReplicas>=1&&zero.appServers>=1);
 assert.equal(C.estimate({dau:'abc',readQps:'-5'}).readQps,0);
});
test('every shipped preset is a valid graph over known components',()=>{
 assert.equal(data.components.filter(c=>!c.ai).length,35);assert.equal(data.components.filter(c=>c.ai).length,10);assert.equal(data.presets.length,4);
 const known=new Set(data.components.filter(c=>!c.ai).map(c=>c.id));assert.equal(new Set(data.components.map(c=>c.id)).size,45);   // presets use design parts only
 for(const p of data.presets){
  const nodes=new Set(p.nodes.map(n=>n.id));assert.equal(nodes.size,p.nodes.length,p.id);
  for(const n of p.nodes)assert.ok(known.has(n.defId),`${p.id}: ${n.defId}`);
  for(const e of p.edges)assert.ok(nodes.has(e.from)&&nodes.has(e.to),`${p.id}: ${e.from}->${e.to}`);
 }
 for(const c of data.components)assert.ok(c.label&&c.description&&c.whenToUse&&c.scaleNote,c.id);
});
test('shipped presets pass their own checks at the scale they are named for',()=>{
 const scale={1:{dau:'1000'},2:{dau:'10000'},3:{dau:'100000'},4:{dau:'1000000'}};
 data.presets.forEach((p,i)=>{
  const graph={nodes:p.nodes,edges:p.edges},bad=C.checks(graph,scale[i+1]).filter(x=>x.level==='warn');
  assert.deepEqual(bad,[],`${p.id}: ${JSON.stringify(bad)}`);
 });
});
test('checks catch the classic gaps',()=>{
 assert.deepEqual(ids(g([])),[]);
 assert.ok(ids(g(['app-server','db-sql'],[[1,2]])).includes('no-client'));
 assert.ok(ids(g(['client','db-sql'],[[1,2]])).includes('client-db'));
 assert.ok(ids(g(['client','app-server','app-server','db-sql'],[[1,2],[1,3],[2,4],[3,4]])).includes('no-lb'));
 assert.ok(!ids(g(['client','load-balancer','app-server','app-server'],[[1,2],[2,3],[2,4]])).includes('no-lb'));
 assert.ok(ids(g(['client','app-server','db-sql'],[[1,2],[2,3]]),{dau:'50000000'}).includes('no-cache'));
 assert.ok(!ids(g(['client','app-server','cache','db-sql'],[[1,2],[2,3],[2,4]]),{dau:'50000000'}).includes('no-cache'));
 assert.ok(ids(g(['client','app-server','db-sql'],[[1,2],[2,3]]),{writeQps:'2000'}).includes('write-heavy'));
 assert.ok(ids(g(['client','worker'],[[1,2]])).includes('worker-no-queue'));
 assert.ok(ids(g(['client','app-server','message-queue','worker'],[[1,2],[2,3],[3,4]])).includes('no-dlq'));
 assert.ok(ids(g(['client','app-server','db-sql'],[[1,2],[2,3]]),{},{availability:'99.99%'}).includes('single-point'));
 assert.ok(ids(g(['client','app-server','db-sql','cdn'],[[1,2],[2,3]])).includes('loose'));
});
test('a clean small design is told so',()=>{
 const r=C.checks(g(['client','app-server','db-sql'],[[1,2],[2,3]]),{dau:'1000'});
 assert.equal(r.at(-1).level,'good');assert.ok(r.every(x=>x.level!=='warn'));
});
test('mermaid export numbers repeated components and strips brackets',()=>{
 const graph=g(['client','app-server','app-server','db-sql'],[[1,2],[1,3],[2,4],[3,4]]);
 const m=C.toMermaid(graph,{client:'Client','app-server':'App Server','db-sql':'SQL (Primary)'});
 assert.match(m,/^graph LR\n/);assert.match(m,/n2\[App Server 1\]/);assert.match(m,/n3\[App Server 2\]/);assert.match(m,/n4\[SQL Primary\]/);
 assert.equal(m.split('\n').length,5);
 assert.match(C.toMermaid(g(['client','dns']),{client:'Client'}),/n2\[dns\]/);
});
