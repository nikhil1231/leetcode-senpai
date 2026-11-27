// Fundamentals simulator models: each shows the behaviour its lesson teaches.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('./load.cjs').module('fund-models');
const run=(s,order)=>order.reduce((x,t)=>M.step(x,t),s);
const finish=s=>{ for(let i=0;i<200&&!(M.finished(s,0)&&M.finished(s,1));i++) s=M.step(s,M.finished(s,0)?1:i%2); return s; };

test('count++ loses updates; synchronized and atomics do not',()=>{
 const lost=finish(run(M.interleave('counter','plain'),[0,1,0,1,0,1]));
 assert.ok(lost.mem.count<4); assert.equal(M.verdict(lost).ok,false);
 for(const mode of ['sync','atomic']) for(let seed=1;seed<20;seed++){ const s=finish(M.randomRun(mode==='sync'?'counter':'counter',mode,seed)); assert.equal(s.mem.count,4,mode+seed); }
});
test('double-checked locking hands out a half-built object only without volatile',()=>{
 assert.equal(M.verdict(run(M.interleave('dcl','plain'),[0,0,0,0,0,1,1])).ok,false);
 for(let seed=1;seed<40;seed++) assert.notEqual(M.verdict(finish(M.randomRun('dcl','volatile',seed)))?.ok,false);
});
test('a plain stop flag can spin forever; volatile stops',()=>{
 const plain=run(M.interleave('flag','plain'),[0,0,1,1,0,0,0,0,0,0,0,0]);
 assert.equal(M.verdict(plain).ok,false);
 assert.equal(M.verdict(run(M.interleave('flag','volatile'),[0,0,1,1,0,0,0])).ok,true);
});
test('an unbounded queue keeps the pool at core size; a bounded one grows then rejects',()=>{
 const u=M.threadPool({queue:'unbounded'}), b=M.threadPool({queue:'bounded',cap:100}), c=M.threadPool({queue:'bounded',cap:50,max:8,policy:'caller'});
 assert.equal(u.maxThreads,4); assert.ok(u.maxQueue>500 && u.p99>5);
 assert.ok(b.maxThreads>4 && b.rejected>0 && b.maxQueue===100);
 assert.ok(c.callerRan>0 && c.rejected===0);
});
test('the GIL serialises CPU work; processes and free-threading do not; I/O overlaps under both',()=>{
 const g=(w,m)=>M.gil({workload:w,model:m}).makespan;
 assert.ok(g('cpu','threads')>=3000 && g('cpu','processes')<1200 && g('cpu','free')<1200);
 assert.ok(g('io','threads')<600 && g('io','asyncio')<600);
});
test('one blocking call stalls every other request on the loop; awaiting does not',()=>{
 for(const k of ['sleep','requests','cpu']) assert.ok(M.eventLoop({kind:k}).worst>=900);
 for(const k of ['asleep','thread']) assert.equal(M.eventLoop({kind:k}).slow,0);
});
test('PID 1: shell form and handler-less exec form get SIGKILLed; tini reaps orphans',()=>{
 const stop=(i,h)=>M.act(M.container(i,h),'stop').stopped.code;
 assert.equal(stop('shell',true),137); assert.equal(stop('exec',false),137); assert.equal(stop('exec',true),0); assert.equal(stop('tini',true),0);
 const orphan=i=>['spawn','worker-crash','helper-exits'].reduce(M.act,M.container(i,true)).flags.zombie;
 assert.equal(orphan('exec'),1); assert.equal(orphan('tini'),undefined);
});
test('-Xmx equal to the pod limit is OOMKilled; 75% of the limit fits',()=>{
 assert.equal(M.jvmMemory({}).oom,true); assert.equal(M.jvmMemory({heapMode:'pct',pct:75}).oom,false);
});
test('MVCC: a read-modify-write loses an update under read committed; repeatable read refuses; FOR UPDATE waits',()=>{
 const go=(level,steps)=>steps.reduce((s,[w,q])=>M.sql(s,w,q),M.mvcc(level));
 const rmw=[[0,'begin'],[1,'begin'],[0,'select'],[1,'select'],[0,'update-from-read'],[1,'update-from-read'],[0,'commit'],[1,'commit']];
 assert.equal(go('rc',rmw).flags.lostUpdate,1);
 assert.equal(go('rr',rmw.map(([w,q])=>[w,q==='update-from-read'?'update':q])).flags.serialization,1);
 const fu=go('rc',[[0,'begin'],[1,'begin'],[0,'for-update'],[1,'for-update']]); assert.ok(fu.s[1].wait);
 const done=go('rc',[[0,'begin'],[1,'begin'],[0,'for-update'],[1,'for-update'],[0,'update-from-read'],[0,'commit'],[1,'update-from-read'],[1,'commit']]);
 assert.equal(done.flags.lostUpdate,undefined); assert.equal(done.rows.at(-1).balance,120);
 const vac=M.sql(go('rc',[[0,'begin'],[0,'update'],[0,'commit']]),0,'vacuum'); assert.equal(vac.rows.length,1); assert.equal(vac.flags.vacuumed,1);
});
test('an ALTER waiting for a lock queues every query; a short lock_timeout keeps the pool alive',()=>{
 assert.ok(M.lockQueue({}).saturated && M.lockQueue({}).errors>0);
 const t=M.lockQueue({lockTimeout:1}); assert.ok(t.gaveUp && !t.saturated && t.errors===0);
});
test('a broken image stalls the rollout without losing the old pods; undo recovers',()=>{
 let c=M.kube(M.cluster({}),'deploy-bad'); for(let i=0;i<8;i++) c=M.kube(c,'tick');
 assert.ok(c.stalled && c.ready===4);
 c=M.kube(c,'undo'); for(let i=0;i<12;i++) c=M.kube(c,'tick');
 assert.ok(!c.stalled && c.flags.recovered && c.ready===4);
});
test('scheduling uses requests; BestEffort is evicted first; over a CPU limit is throttled',()=>{
 const tight=M.schedule({batch:{n:8,cpuReq:0,cpuLim:0,memReq:0,memLim:0,cpuUse:1,memUse:3}});
 assert.ok(tight.evicted>0 && tight.pods.filter(p=>p.state==='Evicted').every(p=>p.qos==='BestEffort'));
 assert.ok(M.schedule({web:{n:6,cpuReq:0.5,cpuLim:0.5,memReq:1,memLim:1,cpuUse:0.9,memUse:0.5}}).throttled===6);
 assert.ok(M.schedule({web:{n:40,cpuReq:1,cpuLim:1,memReq:1,memLim:1,cpuUse:0.5,memUse:0.5}}).pending>0);
});
test('the default VPC works and is not exposed; mistakes show where the packet stops',()=>{
 assert.equal(M.vpcScore({}).right,5);
 assert.equal(M.trace({privateRoute:'none'},'egress').ok,false);
 assert.equal(M.trace({privateRoute:'igw'},'egress').ok,false);
 assert.equal(M.trace({dbPublic:true,dbSg:'any'},'dbweb').ok,true);
});
test('IAM: explicit deny wins, otherwise allow is needed, boundaries cap identity policies',()=>{
 const id=[{effect:'Allow',action:'s3:*',resource:'*'}];
 assert.equal(M.evaluate({identity:id,resource:[{effect:'Deny',action:'s3:Delete*',resource:'*'}]},{action:'s3:DeleteObject',resource:'x'}).why,'explicit');
 assert.equal(M.evaluate({identity:[]},{action:'s3:GetObject',resource:'x'}).why,'implicit');
 assert.equal(M.evaluate({identity:id,boundary:[{effect:'Allow',action:'s3:Get*',resource:'*'}]},{action:'s3:PutObject',resource:'x'}).why,'boundary');
 assert.equal(M.glob('arn:aws:s3:::reports/*','arn:aws:s3:::reports/a/b'),true);
});
test('a canary exposes the fewest users to a bad build',()=>{
 const f=st=>M.deploy({strategy:st}).failed;
 assert.ok(f('canary')<f('rolling') && f('canary')<f('bluegreen'));
});
test('renaming in place breaks the running version; expand and contract is clean',()=>{
 assert.ok(M.migrate(['rename']).broken);
 assert.ok(M.migrate(['add-new','dual-write','backfill','read-new','drop-old']).clean);
 assert.ok(M.migrate(['add-new','read-new','backfill','drop-old']).broken);
});
test('the fixed reaper lets the box run out of memory; the adaptive one survives',()=>{
 assert.notEqual(M.reaper({rule:'fixed'}).crashed,null); assert.equal(M.reaper({rule:'adaptive'}).crashed,null);
});
test('pull deploys flap on a broken commit unless they remember it',()=>{
 assert.ok(M.pullDeploy({}).flaps>3); assert.equal(M.pullDeploy({rememberFailed:true}).flaps,1);
});
test('slow start: a warm connection is faster; HTTP/2 stalls more streams per loss than HTTP/3',()=>{
 assert.ok(M.slowStart({reused:true}).ms<M.slowStart({}).ms);
 const s=p=>M.hol({proto:p,loss:0.05});
 assert.ok(s('h2').stalled>=s('h3').stalled && s('h3').slowest<s('h2').slowest);
});
test('stack and heap: a method cannot reassign the caller; == on boxed 128s is false; unboxing null throws',()=>{
 const end=k=>M.refsRun(k).steps.at(-1);
 const swap=end('swap'); assert.equal(swap.out[0],'1000 2000'); assert.equal(swap.frames.length,1);
 const mutate=end('mutate'); assert.equal(mutate.out[0],'Ada'); assert.ok(Object.values(mutate.heap).some(o=>o.garbage));
 assert.deepEqual(end('cache').out,['true','false','true','true']);
 assert.match(end('unbox').error,/NullPointerException/);
 const s=M.refsRun('cache').steps[0]; assert.equal(Object.values(s.heap)[0].refs,2);
});
test('HashMap: resizes past 75%, treeifies only at 64 buckets, and loses mutated or hash-less keys',()=>{
 let s=M.hashMap(); for(let i=1;i<=12;i++) s=M.hmPut(s,'user-'+i); assert.equal(s.cap,16);
 s=M.hmPut(s,'user-13'); assert.equal(s.cap,32); assert.equal(s.resizes,1); assert.ok(M.hmGet(s,'user-7').last.found);
 let c=M.hashMap({hash:'constant'}); for(let i=1;i<=9;i++) c=M.hmPut(c,'k'+i); assert.equal(c.treeified,0); assert.equal(c.cap,32);
 for(let i=10;i<=11;i++) c=M.hmPut(c,'k'+i); assert.equal(c.cap,64); assert.equal(c.treeified,1);
 let id=M.hmPut(M.hashMap({hash:'identity'}),'user-1'); assert.equal(M.hmGet(id,'user-1').last.missedEqual,true);
 assert.ok(M.hmGet(M.hmPut(M.hashMap(),'user-1'),'user-1').last.found);
 const m=M.hmMutate(M.hmPut(M.hashMap(),'user-1'),'user-1','user-1x');
 for(const k of ['user-1','user-1x']){ const g=M.hmGet(m,k).last; assert.equal(g.found,false); assert.equal(g.lostKey,true); }
 assert.equal(M.strHash('hello'),99162322);
});
test('streams: nothing runs without a terminal op, findFirst short-circuits, sorted reads everything first',()=>{
 assert.equal(M.streamTrace({filter:true,map:true}).events.length,0);
 const first=M.streamTrace({filter:true,terminal:'findFirst'}); assert.equal(first.reads,2); assert.deepEqual(first.result,['b']);
 const sorted=M.streamTrace({sorted:true,limit:2,terminal:'toList'}); assert.equal(sorted.barrier,1); assert.deepEqual(sorted.result,['e','h']);
 const flow=M.streamTrace({filter:true,map:true,terminal:'toList'}).events.slice(0,5).map(e=>e.stage);
 assert.deepEqual(flow,['source','filter','source','filter','map']);
});
test('generational GC: short-lived garbage is cheap, mid-life objects fill the old gen, a leak runs out, ZGC pauses stay tiny',()=>{
 const g=o=>M.javaGc(o);
 const healthy=g({lifetime:'request'}); assert.equal(healthy.healthy,1); assert.equal(healthy.oldGcs,0);
 assert.ok(g({lifetime:'session'}).oldGcs>0);
 const leak=g({lifetime:'request',leakMbs:10}); assert.ok(leak.oom && leak.oom.t<120);
 assert.ok(g({lifetime:'request',leakMbs:10,heapMb:4096}).oom===null || g({lifetime:'request',leakMbs:10,heapMb:4096}).oom.t>leak.oom.t);
 assert.ok(g({collector:'zgc'}).maxPause<1); assert.ok(g({collector:'parallel'}).maxPause>g({collector:'g1'}).maxPause);
});
