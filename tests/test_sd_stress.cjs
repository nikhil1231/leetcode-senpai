// Design walkthrough logic: Mermaid parsing, layout, flow paths and the queueing model.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../static/sd-stress.js');
const WT=path.join(__dirname,'../static/walkthrough');
const designs=()=>fs.readdirSync(WT).filter(f=>f.endsWith('.json')&&f!=='index.json').map(f=>JSON.parse(fs.readFileSync(path.join(WT,f),'utf8')));

test('parses nodes, shapes, labels and edges',()=>{
 const g=S.parseMermaid('graph LR a[Client] --> b[(Cache)] a --> c[[Queue]] c -->|retry| a d{Pick}');
 assert.deepEqual(g.nodes.map(n=>[n.id,n.label,n.shape]),[['a','Client','box'],['b','Cache','db'],['c','Queue','queue'],['d','Pick','decision']]);
 assert.deepEqual(g.edges.map(e=>[e.from,e.to,e.label]),[['a','b',''],['a','c',''],['c','a','retry']]);
});
test('every shipped design: graph matches components, flows stay on the graph, layout is finite',()=>{
 const all=designs();
 assert.equal(all.length,27);
 for(const d of all){
  const comps=d.architecture.components,g=S.parseMermaid(d.architecture.mermaid);
  assert.ok(g.edges.length>0,d.id);
  for(const n of g.nodes)assert.ok(comps[n.id],`${d.id}: ${n.id} is not a component`);
  const onGraph=new Set(g.nodes.map(n=>n.id));
  for(const op of d.operations){
   assert.ok(op.steps.length>0,`${d.id}/${op.id}`);
   for(const id of S.flowPath(op.steps))assert.ok(onGraph.has(id),`${d.id}: flow uses ${id} which is not drawn`);
  }
  const L=S.layout(g);
  assert.ok(L.width>0&&L.height>0);
  for(const n of L.nodes)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y),`${d.id}/${n.id}`);
  const seen=new Set(L.nodes.map(n=>`${n.x},${n.y}`));assert.equal(seen.size,L.nodes.length,`${d.id}: nodes overlap`);
  for(const c of Object.values(comps)){assert.ok(c.sim&&Array.isArray(c.sim.serviceTimeMs),d.id);}
 }
});
test('layout puts a node after everything that feeds it',()=>{
 const L=S.layout(S.parseMermaid('graph LR a[A] --> b[B] b --> c[C] a --> c'));
 const x=Object.fromEntries(L.nodes.map(n=>[n.id,n.x]));
 assert.ok(x.a<x.b&&x.b<x.c);
 const cyc=S.layout(S.parseMermaid('graph LR a[A] --> b[B] b --> a'));assert.equal(cyc.nodes.length,2);
});
test('flowPath keeps first-visit order and drops repeats',()=>{
 assert.deepEqual(S.flowPath([{componentId:'c'},{componentId:'lb'},{componentId:'api'},{componentId:'lb'},{componentId:'c'}]),['c','lb','api']);
});
test('diffKeys flags only what changed',()=>{
 const d=S.diffKeys({a:1,b:[1],c:'x'},{a:1,b:[1,2],d:true});
 assert.deepEqual(d.map(r=>[r.key,r.changed]),[['a',false],['b',true],['c',true],['d',true]]);
 assert.deepEqual(S.diffKeys(null,undefined),[]);
});
const comps={api:{sim:{serviceTimeMs:[4,6],concurrency:100,failureRate:0}},db:{sim:{serviceTimeMs:[8,12],concurrency:20,failureRate:0.01}},client:{sim:{serviceTimeMs:[1,1],concurrency:null,failureRate:0}}};
test('a lightly loaded stage costs about its service time; load grows latency',()=>{
 const idle=S.stage(comps.api.sim,100),busy=S.stage(comps.api.sim,19000),hot=S.stage(comps.api.sim,19800);
 assert.ok(idle.util<0.01&&Math.abs(idle.p50-5)<0.5&&idle.status==='ok');
 assert.ok(busy.status==='hot'&&busy.p99>idle.p99);
 assert.ok(hot.p99>busy.p99,'latency should keep rising toward saturation');
});
test('past capacity a stage saturates and sheds load',()=>{
 const r=S.stage(comps.db.sim,5000);
 assert.equal(r.status,'saturated');assert.equal(r.p99,S.TIMEOUT_MS);
 assert.ok(Math.abs(r.capacity-2000)<1e-6&&r.out<=r.capacity);
});
test('unlimited stages never limit; the first saturated stage is the bottleneck',()=>{
 assert.equal(S.stage(comps.client.sim,1e9).status,'ok');
 const r=S.simulate({path:['client','api','db'],components:comps,qps:3000});
 assert.equal(r.bottleneck,'db');assert.ok(r.successRate<1&&r.throughput<3000);
 assert.equal(r.stages[0].unlimited,true);
 const fine=S.simulate({path:['client','api','db'],components:comps,qps:300});
 assert.equal(fine.bottleneck,null);assert.ok(fine.successRate>0.98);
});
test('swapping a component through overrides changes the outcome without touching the original',()=>{
 const before=S.simulate({path:['api','db'],components:comps,qps:3000});
 const after=S.simulate({path:['api','db'],components:comps,qps:3000,overrides:{db:{serviceTimeMs:[2,3],concurrency:200,failureRate:0}}});
 assert.equal(before.bottleneck,'db');assert.notEqual(after.bottleneck,'db');
 assert.ok(after.p99<before.p99&&after.successRate>before.successRate);
 assert.equal(comps.db.sim.concurrency,20);
});
test('every design simulates to finite numbers at any load',()=>{
 for(const d of designs())for(const op of d.operations)for(const qps of [1,1000,1e6]){
  const r=S.simulate({path:S.flowPath(op.steps),components:d.architecture.components,qps});
  assert.ok(Number.isFinite(r.p50)&&Number.isFinite(r.p99)&&r.successRate>=0&&r.successRate<=1,`${d.id}/${op.id}@${qps}`);
 }
});
test('saturationQps finds the first component to fall over, and a swap moves it',()=>{
 const base=S.saturationQps({path:['client','api','db'],components:comps});
 assert.equal(base.id,'db');assert.ok(Math.abs(base.qps-2000)/2000<0.01,String(base.qps));
 const swapped=S.saturationQps({path:['client','api','db'],components:comps,overrides:{db:{serviceTimeMs:[2,3],concurrency:200,failureRate:0}}});
 assert.equal(swapped.id,'api');assert.ok(swapped.qps>base.qps);
 assert.equal(S.saturationQps({path:['client'],components:comps}).qps,Infinity);
});
