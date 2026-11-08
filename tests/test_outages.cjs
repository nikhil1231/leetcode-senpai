// Outage cases: every case is well formed, breaks from its starting design, passes with its fix,
// and the part named as the culprit is in trouble when it breaks. Lessons that own a case open with it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const S=require('../static/sd-sim.js');
const root=path.join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const econ=read('static/simulators/economics.json'),builder=read('static/simulators/builder.json'),{cases}=read('static/simulators/outages.json');
const known=new Set(builder.components.map(c=>c.id));
const lessonFile=c=>c.section==='ai'?path.join(root,'server/tracks/content/ai',c.lesson+'.md'):path.join(root,'server/system_design_lessons',c.lesson+'.md');
const AI_EVENTS=new Set(['model-update','rate-limit','provider-outage','injection-campaign','doc-change','surge']);

test('every case is well formed: story, sources, graphs over known parts, incidents the engines know',()=>{
 assert.ok(cases.length>=20);
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 for(const c of cases){
  assert.ok(['real','what-if','composite'].includes(c.kind),c.id);
  for(const k of ['title','when','kicker','setup','happened','takeaway'])assert.ok(c[k]&&String(c[k]).trim(),`${c.id}: ${k}`);
  if(c.kind!=='composite'){assert.ok(c.company,c.id);assert.ok(c.sources?.length,`${c.id}: a real or what-if case cites its source`);}
  for(const [t,u] of c.sources||[])assert.ok(t&&/^https:\/\//.test(u),`${c.id}: ${u}`);
  if(c.lesson)assert.ok(fs.existsSync(lessonFile(c)),`${c.id}: lesson ${c.lesson}`);
  for(const g of [c.start,c.fix?.solution].filter(Boolean)){
   const ids=new Set(g.nodes.map(n=>n.id));
   assert.equal(ids.size,g.nodes.length,c.id);
   for(const n of g.nodes)assert.ok(known.has(n.defId),`${c.id}: ${n.defId}`);
   for(const e of g.edges)assert.ok(ids.has(e.from)&&ids.has(e.to),`${c.id}: ${e.from}->${e.to}`);
   for(const id of Object.keys(g.labels||{}))assert.ok(ids.has(id),`${c.id}: label for ${id}`);
  }
  if(c.culprit)assert.ok(c.start.nodes.some(n=>n.id===c.culprit&&n.defId!=='client'),`${c.id}: culprit ${c.culprit}`);
  assert.ok(c.scenario.events.length,c.id);
  for(const e of c.scenario.events){
   assert.ok(c.scenario.ai?AI_EVENTS.has(e.type):S.EVENT_LABEL[e.type],`${c.id}: ${e.type}`);
   assert.ok(e.label&&e.at>=0&&e.at<=23,`${c.id}: ${e.id}`);
   if(e.type==='node-down')for(const id of [].concat(e.params.node||[]))assert.ok(c.start.nodes.some(n=>n.id===id),`${c.id}: node-down ${id}`);
  }
  for(const b of c.beats||[])assert.ok(b.text&&b.at>=0&&b.at<=23,c.id);
  if(c.fix){assert.ok(c.fix.prompt&&c.fix.hints.length===3,c.id);}
 }
});

test('every case breaks from its starting design, and its fix gets through the same day',()=>{
 for(const c of cases){
  const start=S.run(c.scenario,c.start,econ);
  assert.ok(start.summary.stars<=1,`${c.id}: the starting design gets ${start.summary.stars} stars`);
  assert.ok(start.summary.objectives.some(o=>!o.pass),c.id);
  if(!c.fix)continue;
  const fixed=S.run(c.scenario,c.fix.solution,econ);
  assert.ok(fixed.summary.stars>=2,`${c.id}: the fix gets ${fixed.summary.stars} stars: ${fixed.summary.objectives.filter(o=>!o.pass).map(o=>o.id+' '+o.actual).join(', ')}`);
 }
});

test('the culprit is in trouble while the incident lasts',()=>{
 for(const c of cases.filter(x=>x.culprit&&!x.scenario.ai)){
  const res=S.run(c.scenario,c.start,econ),e=c.scenario.events[0];
  const hours=res.ticks.filter(t=>t.h>=e.at&&t.h<(e.type==='poison-message'?24:e.at+Math.max(1,e.dur||1)));
  const trouble=hours.some(t=>{const st=t.nodes[c.culprit];return st.status==='saturated'||st.status==='down'||st.err>=0.05||!!st.note&&st.note!=='unbalanced'
   ||Object.entries(t.queues).some(([id,q])=>id===c.culprit&&(q.stalled||q.lagMin>(c.scenario.slo.lagMin??1e9)));});
  assert.ok(trouble,`${c.id}: ${c.culprit} looks healthy during ${e.id}`);
 }
});

test('a dead DNS provider or CDN is skipped when the client has another way in',()=>{
 const dyn=cases.find(c=>c.id==='dyn-2016');
 const one=S.run(dyn.scenario,dyn.start,econ),two=S.run(dyn.scenario,dyn.fix.solution,econ);
 assert.ok(one.ticks[11].ok<0.01&&two.ticks[11].ok>0.99);
 assert.equal(one.ticks[11].nodes.n2.status,'down');
 // a down component nobody depends on changes nothing
 const g={nodes:[{id:'c',defId:'client'},{id:'a',defId:'app-server'},{id:'d',defId:'db-sql'},{id:'x',defId:'monitoring'}],edges:[{id:'e',from:'c',to:'a'},{id:'f',from:'a',to:'d'}]};
 const r=S.run({dau:1000,events:[{id:'d',type:'node-down',at:5,params:{node:'x'}}]},g,econ);
 assert.equal(r.ticks[5].ok,1);
});

test('lessons that own a case open with it, keyed out of the way of positional keys',()=>{
 for(const c of cases.filter(x=>x.lesson)){
  const text=fs.readFileSync(lessonFile(c),'utf8');
  assert.match(text,new RegExp('```outage\\nkey: b9\\d\\d\\ncase: '+c.id+'\\n```'),c.id);
 }
});

test('an outage block renders its watch half in place and its fix half after the lesson',()=>{
 const context={window:{},CSS:{escape:s=>s}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'static/sd-blocks.js'),'utf8'),context);
 const B=context.window.SDBlocks,c=cases.find(x=>x.id==='facebook-2010');
 const blocks=[{type:'outage',key:'b950',...c,title:'<b>x</b>'},{type:'md',text:'## Body'},{type:'predict',key:'b1',prompt:'p',choices:['a','b'],answer:0,reveal:'r'}];
 const html=B.render({blocks});
 assert.ok(html.indexOf('data-block="b950"')<html.indexOf('data-block="b1"'));
 assert.ok(html.indexOf('data-fix-for="b950"')>html.indexOf('data-block="b1"'));
 assert.doesNotMatch(html,/<b>x<\/b>/);
 assert.match(B.renderBlock(blocks[0]),/data-fix-for="b950"/);
 assert.doesNotMatch(B.renderBlock({...blocks[0],fix:undefined}),/data-fix-for/);
});
