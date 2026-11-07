// AI simulator models: each shows the behaviour its lesson teaches.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../static/ai-models.js');

test('low temperature picks the top token; top-k and top-p cut the tail',()=>{
 assert.ok(M.distribution('label',0.1,0,1).probs[0].p>0.99);
 assert.ok(M.distribution('cat',1.5,0,1).entropy>M.distribution('cat',0.3,0,1).entropy);
 assert.equal(M.distribution('cat',1,3,1).kept,3);
 assert.ok(M.distribution('cat',1,0,0.4).kept<5);
 const d=M.distribution('cat',1,0,1); assert.ok(Math.abs(d.probs.reduce((a,x)=>a+x.p,0)-1)<1e-9);
 assert.equal(new Set(M.sample(M.distribution('label',0.05,0,1),20,1)).size,1);
});
test('IDs and code cost more tokens per character than prose',()=>{
 const ratio=k=>M.SAMPLES[k].length/M.roughTokens(M.SAMPLES[k]).length;
 assert.ok(ratio('prose')>3.5 && ratio('ids')<2 && ratio('code')<ratio('prose'));
});
test('output tokens dominate latency; caching cuts prefill and cost; streaming only moves the first words',()=>{
 const c=M.call({}); assert.equal(c.total,5.5); assert.ok(c.decode/c.total>0.9);
 assert.ok(M.call({cached:0.9}).ttft<c.ttft && M.call({cached:0.9}).cost<c.cost);
 assert.equal(M.call({streaming:false}).total,c.total); assert.ok(M.call({streaming:false}).firstSeen>c.firstSeen);
});
test("the serving lesson's bill: $2,700 a day, about half with caching",()=>{
 assert.equal(M.bill({}).day,2700); assert.equal(M.bill({caching:true}).day,1350);
 assert.ok(M.bill({caching:true,smallShare:0.7}).day<600);
});
test('tool calls: skipped results are an API error; empty results invite a made-up answer',()=>{
 assert.ok(M.toolTranscript('ok').at(-1).ok); assert.ok(M.toolTranscript('error').at(-1).ok);
 for(const c of ['skip','invent','inject']) assert.ok(M.toolTranscript(c).at(-1).bad,c);
});
test('constrained decoding and validated retries make structured output reliable; skipping validation lets bad records through',()=>{
 assert.ok(M.structured({mode:'schema'}).success>M.structured({mode:'prompt'}).success);
 assert.ok(M.structured({mode:'prompt',retries:2}).success>0.995);
 assert.ok(M.structured({validate:false}).silentBad>0.1);
 assert.ok(M.structured({mode:'schema',maxTokens:100}).success<0.7);
});
test('vectors miss exact codes and keywords miss paraphrase; hybrid gets all four',()=>{
 assert.notEqual(M.search('q1','vector')[0].id,'d3'); assert.equal(M.search('q1','bm25')[0].id,'d3');
 assert.notEqual(M.search('q4','bm25')[0].id,'d7'); assert.equal(M.search('q4','vector')[0].id,'d7');
 assert.equal(M.searchScore('hybrid',0.5).right,4);
});
test('HNSW: more ef gives more recall for more distance computations, far fewer than exact search',()=>{
 const g=M.buildHnsw(M.points(400,2),6,3), q=[0.42,0.58];
 const lo=M.hnswSearch(g,q,10,4), hi=M.hnswSearch(g,q,10,60);
 assert.ok(hi.recall>=lo.recall && hi.recall>=0.9 && hi.evals>lo.evals && hi.evals<400/2);
});
test('RAG: every question fails at its own stage, and the full pipeline answers all of them without leaking',()=>{
 const base=M.rag({});
 assert.equal(base.rows.find(r=>r.id==='acl').answer,'leak');
 assert.equal(base.rows.find(r=>r.id==='code').answer,'wrong');
 const best=M.rag({hybrid:true,rewrite:true,rerank:true,acl:true,syncDeletes:true,grounded:true});
 assert.equal(best.right,best.total); assert.equal(best.leaks,0);
 assert.equal(M.rag({hybrid:true,rewrite:true,acl:true,syncDeletes:true,grounded:true,topK:10,chunk:'large'}).rows.find(r=>r.id==='buried').answer,'wrong');
 assert.equal(M.rag({chunk:'small',overlap:false}).rows.find(r=>r.id==='span').answer,'partial');
});
test('a 2-point drop on 400 unpaired cases is noise; pairing and more cases make it measurable',()=>{
 assert.equal(M.evalStats({n:400,paired:false,sims:300}).real,false);
 assert.ok(M.evalStats({n:400,paired:true,sims:300}).ci<M.evalStats({n:400,paired:false,sims:300}).ci);
 assert.equal(M.evalStats({n:2000,paired:true,sims:300}).real,true);
});
test('raising the threshold trades recall for precision',()=>{
 const a=M.threshold({t:0.4}), b=M.threshold({t:0.7});
 assert.ok(b.precision>a.precision && b.recall<a.recall && b.perPr<a.perPr);
});
test('agents: errors as information and budgets matter; workflows are cheaper for fixed steps',()=>{
 assert.ok(M.agent({errorsAsInfo:false}).crashed>0.3); assert.ok(M.agent({maxSteps:5}).budget>0.2);
 assert.ok(M.agent({structure:'workflow'}).cost<M.agent({structure:'agent'}).cost);
 assert.ok(M.agent({summarise:true}).cost<M.agent({}).cost);
});
test('serving: 70B at FP16 does not fit one GPU; quantising frees KV cache for more conversations',()=>{
 assert.equal(M.serve({model:'70b'}).fits,false);
 assert.ok(M.serve({model:'70b',quant:'int4'}).maxSeqs>M.serve({model:'70b',quant:'int8'}).maxSeqs);
 assert.ok(M.serve({rps:40}).rho>1 && !isFinite(M.serve({rps:40}).ttft));
 assert.ok(M.serve({batching:'static'}).throughput<M.serve({}).throughput);
});
test('injection: with a fooled model every attack lands until capabilities are limited',()=>{
 assert.equal(M.injection({}).harms,M.ATTACKS.length);
 assert.equal(M.injection({sendTool:'allowlist',images:'trusted',confirmDelete:true,leastData:true}).harms,0);
 assert.equal(M.injection({classifier:true}).harms,M.ATTACKS.length-1);
});
test('MCP: a session starts with initialize and the initialized notification; each attack needs its own defence',()=>{
 for(const t of ['stdio','http']){ const s=M.mcpSession(t); assert.equal(s[1].msg.method,'initialize'); assert.equal(s[3].msg.method,'notifications/initialized'); assert.ok(s.some(x=>x.msg.method==='tools/call')); }
 assert.ok(M.mcpSession('http')[0].note.includes('PKCE'));
 assert.equal(M.mcpAttacks({}).harms,M.MCP_ATTACKS.length);
 assert.equal(M.mcpAttacks({registry:true,pin:true,confirmWrites:true,audience:true}).harms,0);
 assert.equal(M.mcpAttacks({registry:true,confirmWrites:true,audience:true}).rows.find(r=>r.id==='rugpull').blocked,false);
});
test('eval noise stays defined when the cheaper model is actually better, and stays fast on big sets',()=>{
 for(const paired of [true,false]){ const e=M.evalStats({n:400,a:0.8,b:0.9,paired,sims:200}); assert.ok(Number.isFinite(e.ci)&&e.ci>0&&e.diffs.every(Number.isFinite)); }
 const t=Date.now(); const big=M.evalStats({n:5000,sims:600}); assert.ok(Date.now()-t<100&&Math.abs(big.meanDiff+0.02)<0.005);
});
test('HNSW always returns k results, even with a tiny ef or M, because the graph is built connected',()=>{
 for(const Mm of [2,3,6]) for(const ef of [1,5,10]){ const g=M.buildHnsw(M.points(400,2),Mm,3); const r=M.hnswSearch(g,[0.3,0.7],10,ef); assert.equal(r.result.length,10,`M=${Mm} ef=${ef}`); assert.ok(r.recall>=0.8); }
});
