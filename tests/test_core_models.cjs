// CS-core simulator models: each shows the behaviour its lesson teaches.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../static/core-models.js');

test('JWT: each missing check lets exactly its attack through; all four checks are safe',()=>{
 const acc=(c)=>Object.keys(M.JWT_ATTACKS).filter(a=>M.jwtVerify(a,c).accepted);
 assert.deepEqual(acc({}),['valid']); assert.ok(M.jwtSafe({}));
 assert.deepEqual(acc({sig:false}).sort(),['confusion','none','tamper','valid']);
 assert.deepEqual(acc({alg:false}).sort(),['confusion','none','valid']);
 assert.deepEqual(acc({exp:false}),['valid','expired']); assert.deepEqual(acc({aud:false}),['valid','audience']);
 assert.equal(M.jwtVerify('tamper',{alg:false}).accepted,false,'a pinned alg is not what stops tampering');
});
test('web attacks: every attack lands undefended; five defences block all six',()=>{
 assert.equal(M.webBoard({}).breaches,6);
 const five=M.webBoard({encode:1,samesite:1,params:1,egress:1,authz:1});
 assert.equal(five.breaches+five.limited,0); assert.equal(five.used,5);
 const weak=M.webBoard({httponly:1,uuid:1,imds:1});
 assert.equal(weak.limited,3,'HttpOnly, UUIDs and IMDSv2 only limit damage');
 assert.equal(M.webAttack('sqli',{encode:1}).outcome,'breach','HTML escaping does not stop SQL injection');
});
test('OAuth: PKCE stops interception and CSRF but not a loose redirect check; implicit leaks',()=>{
 assert.equal(M.oauth('pkce','intercept').outcome,'blocked'); assert.equal(M.oauth('code','intercept').outcome,'breach');
 assert.equal(M.oauth('pkce','csrf').outcome,'blocked'); assert.equal(M.oauth('code','csrf').outcome,'breach'); assert.equal(M.oauth('code','csrf',{state:1}).outcome,'blocked');
 assert.equal(M.oauth('pkce','redirect').outcome,'breach'); assert.equal(M.oauth('pkce','redirect',{exact:1}).outcome,'blocked');
 assert.ok(M.oauthSafe('pkce',{exact:1})); assert.ok(!M.oauthSafe('implicit',{state:1,exact:1})); assert.ok(!M.oauthSafe('code',{state:1,exact:1}));
});
test('joins: LEFT keeps every user; a WHERE on the right table turns it back into an inner join',()=>{
 assert.equal(M.sqlJoin({join:'inner'}).n,4); assert.equal(M.sqlJoin({join:'left'}).allUsers,1);
 assert.ok(M.sameRows(M.sqlJoin({join:'left',filter:'where'}),M.sqlJoin({join:'inner',filter:'where'})));
 assert.equal(M.sqlJoin({join:'left',filter:'on'}).allUsers,1,'a filter in ON keeps the outer rows');
 assert.equal(M.sqlJoin({join:'anti',filter:'on'}).noPaid,1); assert.equal(M.sqlJoin({join:'anti'}).neverOrdered,1); assert.deepEqual(M.sqlJoin({join:'anti'}).rows,[[4,'Dee']]);
 assert.equal(M.sqlJoin({join:'full'}).n,6); assert.equal(M.sqlJoin({join:'cross'}).n,20);
 const star=M.sqlJoin({join:'left',agg:'star'}).rows, col=M.sqlJoin({join:'left',agg:'col'}).rows;
 assert.deepEqual(star.find(r=>r[0]==='Dee'),['Dee',1]); assert.deepEqual(col.find(r=>r[0]==='Dee'),['Dee',0]);
});
test('window functions: rank gaps, RANGE peers share a running total, top-N per group',()=>{
 assert.deepEqual(M.sqlWindow({fn:'rank'}).rows.slice(0,4).map(r=>r[4]),[1,1,3,4]);
 assert.deepEqual(M.sqlWindow({fn:'dense_rank'}).rows.slice(0,4).map(r=>r[4]),[1,1,2,3]);
 assert.equal(M.sqlWindow({fn:'rank'}).gap,1); assert.equal(M.sqlWindow({fn:'sum'}).peerShared,1); assert.equal(M.sqlWindow({fn:'sum',frame:'rows'}).peerShared,0);
 assert.equal(M.sqlWindow({fn:'row_number',top:true}).n,4); assert.equal(M.sqlWindow({fn:'row_number',top:true}).topOk,1);
 assert.equal(M.sqlWindow({fn:'groupby'}).n,2);
});
test('scheduling: FCFS convoys, SRTF minimises waiting, tiny RR quanta burn the CPU on switches',()=>{
 const s=(algo,o={})=>M.schedule({load:'convoy',algo,...o});
 assert.ok(s('fcfs').avgWait>15); assert.ok(s('srtf').avgWait<4);
 for(const a of ['fcfs','sjf','rr','mlfq']) assert.ok(s('srtf').avgWait<=s(a).avgWait,a);
 assert.ok(s('rr').avgResp<s('fcfs').avgResp);
 assert.ok(M.schedule({load:'equal',algo:'rr',q:1,cs:1}).overhead>0.2);
 const r=s('rr',{cs:1}); assert.equal(r.rows.reduce((t,x)=>t+x.burst,0)+r.switchTicks,r.cpu.filter(Boolean).length);
});
test('paging: FIFO shows Belady\'s anomaly, LRU never does, and OPT is the floor',()=>{
 const f=M.faultCurve('belady','fifo'); assert.ok(f[3]>f[2]);
 for(const s of Object.keys(M.REF_STRINGS)){
  const lru=M.faultCurve(s,'lru'), opt=M.faultCurve(s,'opt');
  for(let i=1;i<7;i++) assert.ok(lru[i]<=lru[i-1],s);
  for(const a of ['fifo','lru','clock']) M.faultCurve(s,a).forEach((x,i)=>assert.ok(x>=opt[i],s+a));
 }
 assert.equal(M.paging({string:'loop',algo:'lru',frames:4}).faults,15);
 assert.deepEqual(['fifo','lru','opt'].map(a=>M.paging({string:'locality',algo:a,frames:3}).faults),[15,12,9]);
});
test('dining philosophers: naive deadlocks; ordering and a waiter never do',()=>{
 assert.ok(M.philosopherTrials({strategy:'naive',think:1}).rate>0.5);
 for(const st of ['ordered','waiter','trylock']) assert.equal(M.philosopherTrials({strategy:st,think:1}).deadlocks,0,st);
 assert.ok(M.philosopherTrials({strategy:'trylock',think:1}).retries>0);
});
test('test shapes: each flaw shows up only under the shape that exercises it',()=>{
 const f=(shape,o={})=>M.loadTest({shape,...o}).found;
 assert.deepEqual(f('load'),[]); assert.ok(M.loadTest({shape:'load'}).pass);
 assert.deepEqual(f('soak'),['leak']); assert.deepEqual(f('spike'),['cold']); assert.deepEqual(f('stress'),['pool']);
 assert.deepEqual(f('stress',{pool:false}),['ceiling']);
 for(const s of ['load','spike','soak']) assert.ok(M.loadTest({shape:s,leak:false,pool:false,coldScale:false}).pass,s);
});
