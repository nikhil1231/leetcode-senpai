// Ripple Ops engine (static/sd-sim.js) and the shipped campaign (static/simulators/ripple.json).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../static/sd-sim.js');
const root=path.join(__dirname,'..');
const econ=JSON.parse(fs.readFileSync(path.join(root,'static/simulators/economics.json'),'utf8'));
const camp=JSON.parse(fs.readFileSync(path.join(root,'static/simulators/ripple.json'),'utf8'));
const builder=JSON.parse(fs.readFileSync(path.join(root,'static/simulators/builder.json'),'utf8'));
const internals=JSON.parse(fs.readFileSync(path.join(root,'static/simulators/internals.json'),'utf8'));
const G=(defs,links,cfg={},settings)=>({nodes:defs.map((d,i)=>({id:'n'+(i+1),defId:d,cfg:cfg[i+1]})),edges:links.map(([a,b],i)=>({id:'e'+i,from:'n'+a,to:'n'+b})),settings});
const base={dau:1e6,traffic:{read:{perUser:40,cacheable:0.9,workingSetGb:10},write:{perUser:2},peak:2.2},data:{gb:100},slo:{availability:99.9,p99:{read:200}}};
const scn=x=>({...JSON.parse(JSON.stringify(base)),...x});
const util=(r,id,h)=>r.ticks[h??r.summary.peakHour].nodes[id].util;

test('the daily curve stays positive, averages 1 and peaks where asked',()=>{
 for(const peak of [1.2,2,2.4,4]){
  const c=S.curve(S.normalize({traffic:{peak}}));
  assert.equal(c.length,24);assert.ok(c.every(v=>v>0));
  assert.ok(Math.abs(c.reduce((a,b)=>a+b)/24-1)<1e-9);assert.ok(Math.abs(Math.max(...c)-peak)<0.01,String(peak));
 }
});

test('every component in the builder has a price and a role, and config ignores unsupported options',()=>{
 for(const c of builder.components)assert.ok(econ.components[c.id]?.role,c.id);
 const n=S.config({defId:'load-balancer',cfg:{count:9,replicas:3,tier:'nope'}},econ);
 assert.equal(n.count,1);assert.equal(n.replicas,0);assert.equal(n.tier.id,'l7');
 assert.equal(S.config({defId:'app-server',cfg:{count:900}},econ).count,500);
 assert.equal(S.config({defId:'message-queue'},econ).tier.id,'managed');
});

test('a cache in front of the database carries the reads',()=>{
 const s=scn({});
 const bare=S.run(s,G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:4}}),econ);
 const cached=S.run(s,G(['client','load-balancer','app-server','cache','db-sql'],[[1,2],[2,3],[3,4],[3,5]],{3:{count:4}}),econ);
 assert.ok(util(cached,'n5')<util(bare,'n4')/3);
});

test('several servers without a load balancer do the work of one',()=>{
 const r=S.run(scn({}),G(['client','app-server','db-sql'],[[1,2],[2,3]],{2:{count:4,tier:'s'}}),econ);
 assert.ok(r.findings.some(f=>f.id==='nolb-n2'));
 const lb=S.run(scn({}),G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:4,tier:'s'}}),econ);
 assert.ok(util(lb,'n3')<util(r,'n2')/3);
});

test('nothing that can serve a request type means every one fails, with a finding',()=>{
 const r=S.run(scn({traffic:{...base.traffic,search:{perUser:2}}}),G(['client','app-server','cache'],[[1,2],[2,3]]),econ);
 assert.ok(r.summary.availability<10);
 assert.ok(r.findings.some(f=>f.id==='unserved-write'));
 const scan=S.run(scn({traffic:{...base.traffic,search:{perUser:2}}}),G(['client','app-server','db-sql'],[[1,2],[2,3]]),econ);
 assert.ok(scan.findings.some(f=>f.id==='scan'));
});

test('a zone outage takes down single-zone parts; spreading them across zones survives it',()=>{
 const s=scn({slo:{availability:99.9,noLoss:true},events:[{type:'az-outage',at:12,dur:2}]});
 const one=S.run(s,G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:3}}),econ);
 const three=S.run(s,G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:3,azs:3},4:{azs:2}}),econ);
 assert.equal(one.events[0].outcome,'outage');assert.ok(one.summary.lost>0);
 assert.equal(three.events[0].outcome,'handled');assert.equal(three.summary.lost,0);
 assert.ok(three.bill.total>one.bill.total);
});

test('promoting an async replica loses writes; a synchronous standby does not',()=>{
 const s=scn({events:[{type:'db-failover',at:15}]});
 const g=cfg=>G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:3},4:cfg});
 assert.ok(S.run(s,g({}),econ).summary.lost>S.run(s,g({replicas:1}),econ).summary.lost);
 assert.ok(S.run(s,g({replicas:1}),econ).summary.lost>0);
 assert.equal(S.run(s,g({azs:2}),econ).summary.lost,0);
});

test('a poison message stalls a queue without a dead-letter queue',()=>{
 const s=scn({traffic:{...base.traffic,write:{perUser:2,jobs:[{kind:'notify',per:1}]}},slo:{availability:99.9,lagMin:15},events:[{type:'poison-message',at:10}]});
 const g=dlq=>G(['client','load-balancer','app-server','db-sql','message-queue','worker','external-service',...(dlq?['dead-letter-queue']:[])],
  [[1,2],[2,3],[3,4],[3,5],[5,6],[6,7],...(dlq?[[5,8]]:[])],{3:{count:3}});
 const stuck=S.run(s,g(false),econ),ok=S.run(s,g(true),econ);
 assert.equal(stuck.events[0].outcome,'outage');assert.ok(!Number.isFinite(stuck.summary.worstLag)||stuck.summary.worstLag>60);
 assert.ok(stuck.findings.some(f=>f.id==='poison'));
 assert.equal(ok.events[0].outcome,'handled');assert.ok(ok.summary.worstLag<15);
});

test('work without a queue runs inline and slows every request',()=>{
 const s=scn({traffic:{...base.traffic,write:{perUser:2,jobs:[{kind:'process',per:1,ms:900}]}},slo:{p99:{write:300}}});
 const r=S.run(s,G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:6}}),econ);
 assert.ok(r.summary.p99.write>900);assert.ok(r.findings.some(f=>f.id==='inline:process'));
});

test('retries amplify an overload unless something sheds load',()=>{
 const s=scn({events:[{type:'surge',at:19,dur:1,params:{mult:3}}]});
 const naked=S.run(s,G(['client','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4]],{3:{count:2,tier:'s'}}),econ);
 const shed=S.run(s,G(['client','rate-limiter','load-balancer','app-server','db-sql'],[[1,2],[2,3],[3,4],[4,5]],{4:{count:2,tier:'s'}}),econ);
 assert.ok(naked.ticks[19].retryMult>shed.ticks[19].retryMult);
 assert.ok(naked.ticks[19].retryMult>1.5);
});

test('timeouts keep a slow third party from taking the callers down',()=>{
 const s=scn({traffic:{...base.traffic,payment:{perUser:6}},events:[{type:'slow-dependency',at:19,dur:1,params:{ms:9000,err:0.5}}]});
 const g=t=>G(['client','load-balancer','app-server','db-sql','payment','external-service'],[[1,2],[2,3],[3,4],[3,5],[5,6],[5,4]],{3:{count:3},5:{count:2,timeouts:t}});
 const hang=S.run(s,g(false),econ),fast=S.run(s,g(true),econ);
 assert.ok(hang.ticks[19].types.read.ok<fast.ticks[19].types.read.ok);
 assert.ok(fast.ticks[19].types.read.ok>0.99);
});

test('one hot key saturates one cache shard; an app-side local cache absorbs it',()=>{
 const s=scn({dau:1e8,traffic:{read:{perUser:40,kb:50,cacheable:0.95,workingSetGb:100},write:{perUser:0.2},peak:2},events:[{type:'hot-key',at:19,dur:1,params:{share:0.4}}]});
 const g=hot=>G(['client','load-balancer','app-server','cache','db-nosql'],[[1,2],[2,3],[3,4],[3,5]],{3:{tier:'xl',count:60},4:{tier:'52',count:8,hotKey:hot}});
 const melt=S.run(s,g(false),econ),fine=S.run(s,g(true),econ);
 assert.ok(melt.findings.some(f=>f.id==='hotkey-n4'));
 assert.ok(util(fine,'n4',19)<util(melt,'n4',19));
});

test('two regions with geo DNS fix far-away latency and cost about twice as much',()=>{
 const s=scn({far:{share:0.4,rttMs:90},slo:{p99:{read:150}}});
 const g=(regions,dns)=>G(dns?['client','dns','load-balancer','app-server','db-sql']:['client','load-balancer','app-server','db-sql'],
  dns?[[1,2],[2,3],[3,4],[4,5]]:[[1,2],[2,3],[3,4]],{[dns?4:3]:{count:3}},{regions});
 const one=S.run(s,g(1,false),econ),two=S.run(s,g(2,true),econ);
 assert.ok(one.summary.p99.read>150);assert.ok(two.summary.p99.read<150);
 assert.ok(two.bill.total>one.bill.total*1.6);
});

test('the bill separates fixed instances, per-request services and bandwidth',()=>{
 const s=scn({traffic:{...base.traffic,media:{perUser:20,kb:300}}});
 const origin=S.run(s,G(['client','load-balancer','app-server','db-sql','object-store'],[[1,2],[2,3],[3,4],[3,5]],{3:{count:4}}),econ);
 const edge=S.run(s,G(['client','cdn','load-balancer','app-server','db-sql','object-store'],[[1,2],[2,6],[1,3],[3,4],[4,5]],{4:{count:4}}),econ);
 assert.ok(origin.bill.items.some(i=>i.id==='_egress'));assert.ok(origin.findings.some(f=>f.id==='proxy'));
 assert.ok(edge.bill.total<origin.bill.total);
 const q=S.quickCost(G(['client','app-server','db-sql'],[[1,2],[2,3]],{2:{tier:'s',count:2}}),econ,{});
 assert.equal(Math.round(q.items.find(i=>i.defId==='app-server').usd),120);
});

test('estimates are graded against the scenario, within a factor of two',()=>{
 const s=scn({});const t=S.truth(s);
 assert.ok(Math.abs(t.peakReadRps-1e6*40/86400*2.2)<1);
 const g=S.grade(s,{peakReadRps:t.peakReadRps*1.5,peakWriteRps:t.peakWriteRps*3,storageGbYear:'',cacheGb:t.cacheGb*10},['peakReadRps','peakWriteRps','storageGbYear','cacheGb']);
 assert.deepEqual(g.map(x=>x.verdict),['good','close','off','off']);
});

test('the daily incident is the same all day, differs between days, and adds one twist',()=>{
 const a=S.daily(camp.levels,'2026-11-06'),b=S.daily(camp.levels,'2026-11-06');
 assert.deepEqual(a,b);
 const days=new Set(['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05'].map(d=>JSON.stringify(S.daily(camp.levels,d).events.at(-1))));
 assert.ok(days.size>1);
 assert.equal(a.events.length,(camp.levels.find(l=>l.id===a.base).events||[]).length+1);
 assert.equal(S.daily(camp.levels,'2026-11-06',['garage']).base,'garage');
 assert.equal(S.daily(camp.levels,'2026-11-06',[]),null);
});

test('every shipped level is well formed and linked to real lessons, points and simulators',()=>{
 const known=new Set(builder.components.map(c=>c.id)),ids=new Set(camp.levels.map(l=>l.id));
 const sims=new Set(internals.topics.map(t=>t.id));
 const pointsDir=s=>path.join(root,'server/knowledge_base/points',s),lessonsDir=path.join(root,'server/system_design_lessons');
 const lessonFile=(section,id)=>section==='ai'?path.join(root,'server/tracks/content/ai',id+'.md'):path.join(lessonsDir,id+'.md');
 const points=new Set(['system-design','ai'].flatMap(sec=>fs.readdirSync(pointsDir(sec)).flatMap(f=>[...fs.readFileSync(path.join(pointsDir(sec),f),'utf8').matchAll(/^- id: (\S+)/gm)].map(m=>m[1]))));
 for(const [k,c] of Object.entries(camp.concepts)){
  assert.ok(fs.existsSync(lessonFile(c.section,c.lesson)),`${k}: lesson ${c.lesson}`);
  for(const p of c.points)assert.ok(points.has(p),`${k}: point ${p}`);
  if(c.sim)assert.ok(sims.has(c.sim),`${k}: sim ${c.sim}`);
 }
 for(const l of camp.levels){
  assert.ok(l.title&&l.goal&&l.brief.length&&l.hints.length===3&&l.debrief,l.id);
  assert.ok(!l.after||ids.has(l.after),l.id);
  for(const c of l.concepts)assert.ok(camp.concepts[c],`${l.id}: concept ${c}`);
  for(const s of l.lessons)assert.ok(fs.existsSync(lessonFile(l.ai?'ai':'system-design',s)),`${l.id}: lesson ${s}`);
  for(const s of l.sims)assert.ok(sims.has(s),`${l.id}: sim ${s}`);
  for(const k of l.estimate)assert.ok(S.ESTIMATES[k],`${l.id}: estimate ${k}`);
  for(const gr of [l.start,l.solution]){
   const nodes=new Set(gr.nodes.map(n=>n.id));
   for(const n of gr.nodes)assert.ok(known.has(n.defId),`${l.id}: ${n.defId}`);
   for(const e of gr.edges)assert.ok(nodes.has(e.from)&&nodes.has(e.to),`${l.id}: ${e.from}->${e.to}`);
  }
  for(const n of l.solution.nodes)assert.ok(l.toolbox.includes(n.defId),`${l.id}: ${n.defId} not in toolbox`);
  for(const e of l.events)assert.ok(S.EVENT_LABEL[e.type]&&e.label&&e.line,`${l.id}: ${e.type}`);
 }
});

test('every shipped level fails from its starting design and is beatable with its reference design',()=>{
 for(const l of camp.levels){
  const start=S.run(l,l.start,econ),sol=S.run(l,l.solution,econ);
  assert.ok(start.summary.stars<=1,`${l.id}: start gets ${start.summary.stars} stars`);
  assert.ok(sol.summary.stars>=2,`${l.id}: reference gets ${sol.summary.stars} stars: ${sol.summary.objectives.filter(o=>!o.pass).map(o=>o.id).join(', ')}`);
 }
});
