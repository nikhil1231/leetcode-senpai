// Ripple Assist engine (src/legacy/ai-sim.js): each part of an LLM system fixes the failure it should, and the AI levels play through sd-sim.js.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('./load.cjs').module('ai-sim'), S=require('./load.cjs').module('sd-sim', ['sd-stress', 'ai-sim']);
const econ=require('../../public/simulators/economics.json'), camp=require('../../public/simulators/ripple.json');
const G=(defs,links,cfg={})=>({nodes:defs.map((d,i)=>({id:'n'+(i+1),defId:d,cfg:cfg[i+1]})),edges:links.map(([a,b],i)=>({id:'e'+i,from:'n'+a,to:'n'+b}))});
const scn=x=>({ai:{mix:{faq:0.5,exact:0.15,account:0.15,action:0.05,hard:0.1,unanswerable:0.05,injection:0}},dau:200000,traffic:{ask:{perUser:0.05},peak:1.8},slo:{quality:75,availability:99,p95:8000,budget:3000},events:[],...x});
const run=(g,x={})=>A.run(scn(x),g,econ);
const BASE=['client','app-server','llm-small'], E=[[1,2],[2,3]];
const q=r=>r.summary.quality;

test('retrieval, hybrid search and grounding each raise quality, and say so when missing',()=>{
 const bare=run(G(BASE,E)), vec=run(G([...BASE,'vector-db'],[...E,[2,4]])), hyb=run(G([...BASE,'vector-db','search-engine'],[...E,[2,4],[2,5]]));
 const grounded=run(G([...BASE,'vector-db','search-engine'],[...E,[2,4],[2,5]],{3:{grounded:true}}));
 assert.ok(q(bare)<q(vec)&&q(vec)<q(hyb)&&q(hyb)<q(grounded));
 assert.ok(bare.findings.some(f=>f.id==='no-retrieval')&&vec.findings.some(f=>f.id==='exact-miss')&&hyb.findings.some(f=>f.id==='ungrounded'));
 assert.ok(!grounded.findings.some(f=>f.id==='ungrounded'));
});
test('account questions need a data path and actions need tools',()=>{
 const r=run(G(BASE,E));
 assert.ok(r.findings.some(f=>f.id==='no-account-data')&&r.findings.some(f=>f.id==='no-tools'));
 const ok=run(G([...BASE,'db-sql','tool-gateway'],[...E,[2,4],[2,5]],{5:{confirm:true}}));
 assert.ok(ok.kinds.account.quality>0.8&&ok.kinds.action.quality>0.8);
});
test('the large model answers better, costs more and is slower; a router gets most of the quality for less',()=>{
 const g=d=>[...['client','app-server',d,'vector-db','search-engine'],'db-sql'], e=[[1,2],[2,3],[2,4],[2,5],[2,6]];
 const small=run(G(g('llm-small'),e)), large=run(G(g('llm-large'),e));
 assert.ok(q(large)>q(small)&&large.bill.total>2*small.bill.total&&large.summary.p95>small.summary.p95);
 const routed=run(G([...g('llm-large'),'llm-small','model-router'],[...e,[2,7],[2,8]]));
 assert.ok(routed.bill.total<large.bill.total*0.6&&q(routed)>q(small));
 const cached=run(G(g('llm-large'),e,{3:{cachePrefix:true}}));
 assert.ok(cached.bill.total<large.bill.total);
});
test('a throttled provider errors without a fallback and degrades with one',()=>{
 const x={dau:2000000,traffic:{ask:{perUser:0.02},peak:2},events:[{type:'surge',at:18,dur:3,params:{mult:3}},{type:'rate-limit',at:19,dur:2,params:{mult:0.15}}]};
 const one=run(G(['client','app-server','llm-large','vector-db'],[[1,2],[2,3],[2,4]]),x);
 const two=run(G(['client','app-server','llm-large','vector-db','llm-small'],[[1,2],[2,3],[2,4],[2,5]]),x);
 assert.ok(one.summary.availability<95&&one.findings.some(f=>f.id==='rate-limited'));
 assert.ok(two.summary.availability>99.5);
});
test('injection: a guardrail lowers harm, confirmation stops it',()=>{
 const x={ai:{mix:{faq:0.7,action:0.1,injection:0.2}},slo:{quality:50,availability:90,p95:9000,safety:0}};
 const g=(cfg,guard)=>G(guard?['client','guardrail','app-server','llm-small','tool-gateway']:['client','app-server','llm-small','tool-gateway'],guard?[[1,2],[2,3],[3,4],[3,5]]:[[1,2],[2,3],[2,4]],cfg);
 const open=run(g({}),x), guarded=run(g({},true),x), confirmed=run(g({5:{confirm:true}},true),x);
 assert.ok(open.summary.harmful>guarded.summary.harmful&&guarded.summary.harmful>0&&confirmed.summary.harmful===0);
 assert.ok(open.findings.some(f=>f.id==='inject-harm'));
});
test('silent model updates and policy changes hurt quietly unless evals and freshness catch them',()=>{
 const x={events:[{type:'model-update',at:6,dur:1,params:{drop:0.2}},{type:'doc-change',at:8,dur:1}]};
 const g=['client','app-server','llm-small','vector-db','search-engine'], e=[[1,2],[2,3],[2,4],[2,5]];
 const plain=run(G(g,e),x), watched=run(G([...g,'eval-harness'],e,{4:{fresh:true}}),x);
 assert.ok(q(watched)>q(plain)+5);
 assert.ok(plain.findings.some(f=>f.id==='drift')&&plain.findings.some(f=>f.id==='stale'));
 assert.ok(!watched.findings.some(f=>f.id==='drift'||f.id==='stale'));
});
test('the result has the shape the builder plays back',()=>{
 const r=run(G([...BASE,'vector-db'],[...E,[2,4]]));
 assert.equal(r.ticks.length,24);
 for(const t of r.ticks){ assert.ok(t.types.ask&&t.nodes.n2&&typeof t.ok==='number'); assert.ok(['ok','warm','hot','saturated','down'].includes(t.nodes.n3.status)); }
 assert.ok(r.bill.items.length&&r.summary.objectives.length>=3&&Array.isArray(r.findings));
 assert.equal(S.run(scn({}),G([...BASE,'vector-db'],[...E,[2,4]]),econ).engine,'ai');
 assert.ok(S.quickCost(G([...BASE,'vector-db'],[...E,[2,4]]),econ,scn({})).total>=70);
 const t=S.truth(scn({})); assert.ok(t.questionsPerDay===10000&&t.tokensPerQuestion>1000);
});
test('every Ripple Assist level fails from its start and passes with its reference design',()=>{
 const ai=camp.levels.filter(l=>l.ai);
 assert.equal(ai.length,4);
 for(const l of ai){
  assert.equal(S.run(l,l.start,econ).summary.stars<2,true,l.id+' start');
  assert.ok(S.run(l,l.solution,econ).summary.stars>=2,l.id+' solution');
  for(const n of l.solution.nodes) assert.ok(l.toolbox.includes(n.defId),`${l.id}: ${n.defId}`);
 }
 assert.ok(!S.daily(camp.levels,'2026-11-07').ai,'the daily incident never picks an AI level');
});
