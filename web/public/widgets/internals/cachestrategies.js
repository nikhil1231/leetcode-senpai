import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Pe="#0f1419";
const Ts="#1a1f2e";
const Te="#2a2f3e";
const qe="#e6e6e6";
const Ue="#8a93a6";
const Ne="#4a7cff";
const Ea="#f5c451";
const $t="#5cd894";
const Do=360;
const hh=`
.mr-root {
  color: ${qe};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Pe};
}
.mr-panel {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1300px;
  margin: 0 auto;
}
.mr-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Te};
  flex-wrap: wrap;
}
.mr-title {
  font-size: 18px;
  font-weight: 600;
  color: ${qe};
}
.mr-subtitle {
  font-size: 12px;
  color: ${Ue};
  margin-top: 2px;
}
.mr-title-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.mr-label {
  color: ${Ue};
  font-size: 12px;
}
.mr-label select {
  background: ${Pe};
  color: ${qe};
  border: 1px solid ${Te};
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
}

/* Phase bar */
.mr-phasebar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 10px 0;
  flex-wrap: wrap;
}
.mr-phase {
  padding: 4px 10px;
  border: 1px solid ${Te};
  border-radius: 999px;
  color: ${Ue};
  font-size: 12px;
  background: ${Pe};
}
.mr-phase-done {
  color: ${$t};
  border-color: ${$t}55;
  background: ${$t}15;
}
.mr-phase-current {
  color: ${qe};
  border-color: ${Ne};
  background: ${Ne}22;
  box-shadow: 0 0 0 2px ${Ne}33;
  font-weight: 600;
}
.mr-phase-arrow {
  color: ${Ue};
  font-size: 12px;
}

/* Controls */
.mr-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  margin: 10px 0 14px 0;
  align-items: stretch;
}
.mr-input-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mr-btn-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: flex-end;
  min-width: 120px;
}
.mr-lbl-mini {
  font-size: 11px;
  color: ${Ue};
}
.mr-textarea {
  background: ${Pe};
  color: ${qe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  resize: vertical;
  min-height: 80px;
  outline: none;
}
.mr-textarea:focus {
  border-color: ${Ne};
}
.mr-btn {
  background: ${Ne};
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.mr-btn:hover {
  filter: brightness(1.1);
}
.mr-btn-ghost {
  background: transparent;
  color: ${qe};
  border: 1px solid ${Te};
  font-weight: 500;
}
.mr-btn-good {
  background: ${$t};
  color: ${Pe};
}
.mr-btn-warn {
  background: ${Ea};
  color: ${Pe};
}

/* Main 3-col layout */
.mr-main {
  display: grid;
  grid-template-columns: 1fr ${Do}px 1fr;
  gap: 12px;
  align-items: stretch;
}
.mr-col {
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 10px;
  min-width: 0;
}
.mr-col-title {
  font-size: 12px;
  color: ${Ue};
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.mr-col-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mr-shuffle-stats {
  margin-top: 6px;
  font-size: 11px;
  color: ${Ue};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Mapper cards */
.mr-mapper-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mr-mapper {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.mr-mapper-active {
  border-color: ${Ne};
  box-shadow: 0 0 0 2px ${Ne}33;
}
.mr-mapper-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}
.mr-mapper-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${Ne};
  font-weight: 700;
}
.mr-mapper-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0;
}
.mr-line {
  padding: 2px 6px;
  border-radius: 4px;
  background: ${Pe};
  border: 1px solid ${Te};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: ${qe};
  word-break: break-word;
}
.mr-line-done {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: ${Ue};
}
.mr-line-flash {
  animation: mr-flash 500ms ease-out;
  border-color: ${Ne};
  opacity: 1;
  text-decoration: none;
}
@keyframes mr-flash {
  0% { background: ${Ne}66; transform: translateX(0); }
  60% { background: ${Ne}33; transform: translateX(2px); }
  100% { background: ${Pe}; transform: translateX(0); }
}
.mr-mapper-emitted {
  border-top: 1px dashed ${Te};
  padding-top: 6px;
  margin-top: 4px;
}
.mr-sub {
  font-size: 10px;
  color: ${Ue};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.mr-pair-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.mr-pair {
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: ${$t};
}

/* Reducer cards */
.mr-reducer-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mr-reducer {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px;
  transition: box-shadow 200ms ease;
}
.mr-reducer-active {
  box-shadow: 0 0 0 2px ${Ne}33;
}
.mr-reducer-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}
.mr-reducer-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
}
.mr-reducer-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 240px;
  overflow: auto;
}
.mr-group {
  display: flex;
  gap: 6px;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${Pe};
  border: 1px solid ${Te};
  flex-wrap: wrap;
}
.mr-group-done {
  border-color: ${$t}55;
}
.mr-group-flash {
  animation: mr-pop 500ms ease-out;
}
@keyframes mr-pop {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); background: ${Ne}33; }
}
.mr-group-key {
  color: ${qe};
  font-weight: 700;
}
.mr-group-vals {
  color: ${Ue};
}
.mr-group-out {
  font-weight: 700;
  margin-left: auto;
}

/* Output */
.mr-output-panel {
  margin-top: 12px;
  background: ${Pe};
  border: 1px solid ${$t}55;
  border-radius: 8px;
  padding: 10px 12px;
}
.mr-output-title {
  font-size: 12px;
  color: ${$t};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.mr-output-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
}
.mr-output-cell {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 8px;
  background: ${Ts};
  border-radius: 4px;
  border: 1px solid ${Te};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.mr-output-k {
  color: ${qe};
}
.mr-output-v {
  color: ${$t};
  font-weight: 700;
}

/* Stats */
.mr-stats {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 12px;
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${qe};
}
.mr-stats strong {
  color: ${Ue};
  font-weight: 500;
}

/* Status */
.mr-status {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${qe};
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px 10px;
  min-height: 28px;
}
.mr-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Ne};
  box-shadow: 0 0 6px ${Ne}88;
  margin-top: 4px;
  flex-shrink: 0;
}
.mr-status-text {
  word-break: break-word;
}

.mr-footer {
  margin-top: 12px;
  font-size: 12px;
  color: ${Ue};
  line-height: 1.5;
  padding: 10px 12px;
  background: ${Pe};
  border-left: 3px solid ${Ne};
  border-radius: 4px;
}
.mr-footer strong {
  color: ${qe};
}

.mr-mini {
  font-size: 10px;
  color: ${Ue};
}
.mr-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mr-empty {
  font-size: 11px;
  color: ${Ue};
  font-style: italic;
  padding: 4px 0;
}
`,Se=["cache-aside","write-through","write-behind","refresh-ahead"],oe={cacheHit:1,cacheMiss:1,cacheWrite:1,cacheInvalidate:1,dbRead:10,dbWrite:20,queueEnqueue:1,queueFlush:20};
function Oi(){let n=0;return(t,s,r,o)=>({step:++n,actor:t,op:s,note:r,latMs:o})}
class Li{constructor({strategy:t="cache-aside",cacheTtlMs:s=5e3}={}){if(!Se.includes(t))throw new Error(`unknown strategy: ${t}`);this.strategy=t,this.cacheTtlMs=s,this.cache=new Map,this.db=new Map,this.pending=[],this.clock=0,this.alive={cache:!0,db:!0},this.counters={hits:0,misses:0,asyncFlushes:0,reads:0,writes:0,totalLatencyMs:0,dataLossEvents:0},this.lastTrace=[],this.lastOp=null}_isFresh(t){return t?t.expiresAt===null||t.expiresAt>this.clock:!1}_cacheGet(t){if(!this.alive.cache)return;const s=this.cache.get(t);if(s){if(!this._isFresh(s)){this.cache.delete(t);return}return s}}_cachePut(t,s,{dirty:r=!1}={}){if(!this.alive.cache)return;const o=this.cacheTtlMs>0?this.clock+this.cacheTtlMs:null,i=this.strategy==="refresh-ahead"&&this.cacheTtlMs>0?this.clock+Math.floor(this.cacheTtlMs*.7):null;this.cache.set(t,{value:s,expiresAt:o,refreshAt:i,dirty:r})}_dbGet(t){if(this.alive.db)return this.db.get(t)}_dbPut(t,s){this.alive.db&&this.db.set(t,s)}read(t){this.counters.reads++;const s=Oi(),r=[];let o,i=!1,a=0;switch(this.strategy){case"cache-aside":{r.push(s("app","lookup",`read(${t}) -> check cache`,0));const l=this._cacheGet(t);if(l!==void 0)r.push(s("cache","hit",`cache HIT '${Ve(l.value)}'`,oe.cacheHit)),a+=oe.cacheHit,o=l.value,i=!0,this.counters.hits++;else{r.push(s("cache","miss","cache MISS",oe.cacheMiss)),a+=oe.cacheMiss,this.counters.misses++,r.push(s("app","read-db","fall through to DB",0));const d=this._dbGet(t);r.push(s("db","read",d===void 0?"DB has no key":`DB returned '${Ve(d)}'`,oe.dbRead)),a+=oe.dbRead,d!==void 0&&(this._cachePut(t,d),r.push(s("cache","populate","populate cache",oe.cacheWrite)),a+=oe.cacheWrite),o=d}break}case"write-through":{r.push(s("app","lookup",`read(${t}) -> check cache`,0));const l=this._cacheGet(t);if(l!==void 0)r.push(s("cache","hit",`cache HIT '${Ve(l.value)}'`,oe.cacheHit)),a+=oe.cacheHit,o=l.value,i=!0,this.counters.hits++;else{r.push(s("cache","miss","cache MISS (cold/expired)",oe.cacheMiss)),a+=oe.cacheMiss,this.counters.misses++;const d=this._dbGet(t);r.push(s("db","read",d===void 0?"DB empty":`DB returned '${Ve(d)}'`,oe.dbRead)),a+=oe.dbRead,d!==void 0&&(this._cachePut(t,d),r.push(s("cache","populate","repopulate",oe.cacheWrite)),a+=oe.cacheWrite),o=d}break}case"write-behind":{r.push(s("app","lookup",`read(${t}) -> check cache`,0));const l=this._cacheGet(t);if(l!==void 0)r.push(s("cache","hit",`cache HIT '${Ve(l.value)}'${l.dirty?" (dirty)":""}`,oe.cacheHit)),a+=oe.cacheHit,o=l.value,i=!0,this.counters.hits++;else{r.push(s("cache","miss","cache MISS",oe.cacheMiss)),a+=oe.cacheMiss,this.counters.misses++;const d=this._dbGet(t);r.push(s("db","read",d===void 0?"DB has no key (maybe pending in queue)":`DB returned '${Ve(d)}'`,oe.dbRead)),a+=oe.dbRead,d!==void 0&&(this._cachePut(t,d),r.push(s("cache","populate","populate cache",oe.cacheWrite)),a+=oe.cacheWrite),o=d}break}case"refresh-ahead":{r.push(s("app","lookup",`read(${t}) -> check cache`,0));const l=this._cacheGet(t);if(l!==void 0)r.push(s("cache","hit",`cache HIT '${Ve(l.value)}'`,oe.cacheHit)),a+=oe.cacheHit,o=l.value,i=!0,this.counters.hits++,l.refreshAt!==null&&this.clock>=l.refreshAt&&r.push(s("cache","mark-refresh","near expiry -> scheduler will refresh",0));else{r.push(s("cache","miss","cache MISS (scheduler missed it)",oe.cacheMiss)),a+=oe.cacheMiss,this.counters.misses++;const d=this._dbGet(t);r.push(s("db","read",d===void 0?"DB empty":`DB returned '${Ve(d)}'`,oe.dbRead)),a+=oe.dbRead,d!==void 0&&(this._cachePut(t,d),r.push(s("cache","populate","populate cache",oe.cacheWrite)),a+=oe.cacheWrite),o=d}break}default:throw new Error(`unhandled strategy: ${this.strategy}`)}return this.counters.totalLatencyMs+=a,this.lastTrace=r,this.lastOp={kind:"read",key:t,hit:i,latencyMs:a,value:o},{value:o,trace:r,hit:i,latencyMs:a}}write(t,s){this.counters.writes++;const r=Oi(),o=[];let i=0;const a=this.clock;switch(this.strategy){case"cache-aside":{o.push(r("app","write-db",`write(${t}) -> DB`,0)),this._dbPut(t,s),o.push(r("db","write",`DB write '${Ve(s)}'`,oe.dbWrite)),i+=oe.dbWrite,this.cache.has(t)?(this.cache.delete(t),o.push(r("cache","invalidate","invalidate stale key",oe.cacheInvalidate)),i+=oe.cacheInvalidate):o.push(r("cache","skip","no entry to invalidate",0));break}case"write-through":{o.push(r("app","write-cache",`write(${t}) -> cache`,0)),this._cachePut(t,s),o.push(r("cache","write",`cache write '${Ve(s)}'`,oe.cacheWrite)),i+=oe.cacheWrite,o.push(r("cache","sync-db","synchronous pass-through",0)),this._dbPut(t,s),o.push(r("db","write",`DB write '${Ve(s)}'`,oe.dbWrite)),i+=oe.dbWrite,o.push(r("cache","ack","ack app (both durable)",0));break}case"write-behind":{o.push(r("app","write-cache",`write(${t}) -> cache`,0)),this._cachePut(t,s,{dirty:!0}),o.push(r("cache","write",`cache write '${Ve(s)}' (dirty)`,oe.cacheWrite)),i+=oe.cacheWrite,this.pending.push({key:t,value:s,enqueuedAt:this.clock}),o.push(r("queue","enqueue","queue async DB write",oe.queueEnqueue)),i+=oe.queueEnqueue,o.push(r("cache","ack","ack app IMMEDIATELY",0));break}case"refresh-ahead":{o.push(r("app","write-cache",`write(${t}) -> cache`,0)),this._cachePut(t,s),o.push(r("cache","write",`cache write '${Ve(s)}'`,oe.cacheWrite)),i+=oe.cacheWrite,this._dbPut(t,s),o.push(r("db","write",`DB write '${Ve(s)}'`,oe.dbWrite)),i+=oe.dbWrite,o.push(r("cache","schedule","refreshAt = now + 0.7 * TTL",0));break}default:throw new Error(`unhandled strategy: ${this.strategy}`)}return this.counters.totalLatencyMs+=i,this.lastTrace=o,this.lastOp={kind:"write",key:t,latencyMs:i,acknowledgedAt:a},{trace:o,latencyMs:i,acknowledgedAt:a}}tick(t){const s=[];this.clock+=t;for(const[r,o]of Array.from(this.cache.entries()))o.expiresAt!==null&&o.expiresAt<=this.clock&&(this.cache.delete(r),s.push({type:"expire",key:r,at:this.clock}));if(this.strategy==="write-behind"&&this.alive.cache){const r=[];for(;this.pending.length>0;){const o=this.pending.shift();this._dbPut(o.key,o.value);const i=this.cache.get(o.key);i&&i.value===o.value&&(i.dirty=!1),r.push(o),this.counters.asyncFlushes++,s.push({type:"async-flush",key:o.key,value:o.value,at:this.clock})}r.length>0&&(this.counters.totalLatencyMs+=oe.queueFlush)}if(this.strategy==="refresh-ahead"&&this.alive.cache){for(const[r,o]of Array.from(this.cache.entries()))if(o.refreshAt!==null&&this.clock>=o.refreshAt){const i=this._dbGet(r);i!==void 0&&(this._cachePut(r,i),s.push({type:"refresh-ahead",key:r,value:i,at:this.clock}))}}return s}kill(t){if(t!=="cache"&&t!=="db")return{lost:0};let s=0;return t==="cache"&&(s=this.pending.length,s>0&&(this.counters.dataLossEvents+=s),this.pending=[],this.cache.clear()),this.alive[t]=!1,{lost:s}}revive(t){t!=="cache"&&t!=="db"||(this.alive[t]=!0)}snapshot(){const t={};for(const[r,o]of this.cache.entries())t[r]={value:o.value,expiresAt:o.expiresAt,refreshAt:o.refreshAt,dirty:!!o.dirty};const s={};for(const[r,o]of this.db.entries())s[r]=o;return{strategy:this.strategy,clock:this.clock,cache:t,db:s,pending:this.pending.slice(),alive:{...this.alive},counters:{...this.counters},lastTrace:this.lastTrace.slice(),lastOp:this.lastOp?{...this.lastOp}:null,cacheTtlMs:this.cacheTtlMs}}}
function Ve(n){if(n==null)return"null";const t=String(n);return t.length>10?t.slice(0,10)+"...":t}
const za={"cache-aside":{title:"Cache-Aside (Lazy Loading)",oneLiner:"App reads cache, falls through to DB on miss, populates. Writes go straight to DB; cache is invalidated.",pros:["Resilient to cache failures","Only requested data cached"],cons:["Miss penalty","Stale reads possible until invalidation"]},"write-through":{title:"Write-Through",oneLiner:"App writes cache; cache synchronously writes DB before acking. Reads stay fresh at the cost of write latency.",pros:["Consistent cache + DB","No data loss"],cons:["Higher write latency","Cold cache fills only on use"]},"write-behind":{title:"Write-Behind (Write-Back)",oneLiner:"App writes cache, gets acked; cache queues async DB write. Fast writes; data at risk if cache dies.",pros:["Lowest write latency","Absorbs write bursts"],cons:["Data loss on cache failure","Complex recovery"]},"refresh-ahead":{title:"Refresh-Ahead",oneLiner:"Cache proactively refreshes near-expiry hot entries before next access. Low read latency on hot keys.",pros:["Masks DB latency for hot keys","Good for predictable access"],cons:["Wasted refreshes on cold keys","Hard to tune refresh window"]}},Vt="#0f1419",$s="#1a1f2e",Oe="#2a2f3e",ht="#e6e6e6",Je="#8a93a6",ft="#4a7cff",uh="#f5c451",Zs="#f66",yr="#5cd894",vr="#e0a84a",Pa="#a15cff",mh=200,Oa=650,fh={app:{icon:"APP",color:ft},cache:{icon:"CACHE",color:yr},db:{icon:"DB",color:vr},queue:{icon:"QUEUE",color:Pa}};
function dn(n){if(n==null)return"null";const t=String(n);return t.length>12?t.slice(0,12)+"...":t}
function _o(n){return`${Math.round(n)} ms`}
function xh({strategy:n,runner:t,snap:s,visibleStepCount:r,flash:o,counters:i}){const a=za[n],l=Object.entries(s.cache),d=Object.entries(s.db),c=s.pending,p=s.lastTrace||[];return e.jsxs("div",{className:"cs-card",children:[e.jsxs("div",{className:"cs-card-head",children:[e.jsx("div",{className:"cs-card-title",children:a.title}),e.jsx("div",{className:"cs-card-sub",children:a.oneLiner})]}),e.jsxs("div",{className:"cs-grid",children:[e.jsxs("div",{className:"cs-col",children:[e.jsx("div",{className:"cs-col-label",children:"Cache"}),e.jsxs("div",{className:"cs-box cs-box-cache"+(o.cacheKey&&o.type==="hit"?" cs-flash-hit":"")+(o.cacheKey&&o.type==="miss"?" cs-flash-miss":"")+(o.cacheKey&&o.type==="write"?" cs-flash-write":""),children:[l.length===0&&e.jsx("span",{className:"cs-empty",children:"(empty)"}),l.map(([m,g])=>{const w=g.expiresAt===null?null:Math.max(0,g.expiresAt-s.clock),C=o.cacheKey===m;return e.jsxs("div",{className:"cs-kv"+(g.dirty?" cs-kv-dirty":"")+(C?" cs-kv-pulse":""),title:`expires in ${w??"never"} ms${g.dirty?" (dirty)":""}`,children:[e.jsx("span",{className:"cs-k",children:m}),e.jsx("span",{className:"cs-arrow",children:"="}),e.jsx("span",{className:"cs-v",children:dn(g.value)}),w!==null&&e.jsx("span",{className:"cs-ttl",children:w>0?`${w}ms`:"exp"}),g.dirty&&e.jsx("span",{className:"cs-tag cs-tag-dirty",children:"dirty"})]},m)})]})]}),e.jsxs("div",{className:"cs-col",children:[e.jsx("div",{className:"cs-col-label",children:"DB"}),e.jsxs("div",{className:"cs-box cs-box-db"+(o.dbKey?" cs-flash-write":""),children:[d.length===0&&e.jsx("span",{className:"cs-empty",children:"(empty)"}),d.map(([m,g])=>e.jsxs("div",{className:"cs-kv"+(o.dbKey===m?" cs-kv-pulse":""),children:[e.jsx("span",{className:"cs-k",children:m}),e.jsx("span",{className:"cs-arrow",children:"="}),e.jsx("span",{className:"cs-v",children:dn(g)})]},m))]})]})]}),n==="write-behind"&&e.jsxs("div",{className:"cs-pending",children:[e.jsxs("div",{className:"cs-col-label",children:["Pending queue"," ",e.jsx("span",{className:"cs-hint",children:"(drains on tick; lost if cache dies)"})]}),e.jsxs("div",{className:"cs-pending-row",children:[c.length===0&&e.jsx("span",{className:"cs-empty",children:"(drained)"}),c.map((m,g)=>e.jsxs("span",{className:"cs-chip-pending",children:[m.key,"=",dn(m.value)]},g))]})]}),e.jsxs("div",{className:"cs-trace",children:[e.jsxs("div",{className:"cs-col-label",children:["Last op trace",s.lastOp&&e.jsxs("span",{className:"cs-hint",children:[" - ",s.lastOp.kind,"(",s.lastOp.key,")"," ",s.lastOp.kind==="read"&&(s.lastOp.hit?"HIT":"MISS")," @ ",_o(s.lastOp.latencyMs)]})]}),e.jsxs("ol",{className:"cs-trace-list",children:[p.length===0&&e.jsx("li",{className:"cs-empty",children:"(no op yet)"}),p.slice(0,r).map((m,g)=>{const w=fh[m.actor]||{icon:m.actor.toUpperCase(),color:Je};return e.jsxs("li",{className:"cs-trace-step",style:{animationDelay:`${g*30}ms`},children:[e.jsx("span",{className:"cs-trace-num",children:m.step}),e.jsx("span",{className:"cs-trace-actor",style:{background:w.color+"22",color:w.color,borderColor:w.color+"66"},children:w.icon}),e.jsx("span",{className:"cs-trace-op",children:m.op}),e.jsx("span",{className:"cs-trace-note",children:m.note}),m.latMs>0&&e.jsxs("span",{className:"cs-trace-lat",children:["+",m.latMs,"ms"]})]},g)})]})]}),e.jsxs("div",{className:"cs-counters",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"hits"}),"=",i.hits]}),e.jsxs("span",{children:[e.jsx("strong",{children:"misses"}),"=",i.misses]}),e.jsxs("span",{children:[e.jsx("strong",{children:"dirty"}),"=",l.filter(([,m])=>m.dirty).length]}),n==="write-behind"&&e.jsxs("span",{children:[e.jsx("strong",{children:"flushes"}),"=",i.asyncFlushes]}),e.jsxs("span",{children:[e.jsx("strong",{children:"lat"}),"=",_o(i.totalLatencyMs)]}),i.dataLossEvents>0&&e.jsxs("span",{className:"cs-lost",children:[e.jsx("strong",{children:"LOST"}),"=",i.dataLossEvents]})]})]})}
function gh(){const n=h.useRef(null);n.current===null&&(n.current=Object.fromEntries(Se.map(b=>[b,new Li({strategy:b,cacheTtlMs:5e3})])));const[t,s]=h.useState(()=>Object.fromEntries(Se.map(b=>[b,n.current[b].snapshot()]))),[r,o]=h.useState(()=>Object.fromEntries(Se.map(b=>[b,0]))),[i,a]=h.useState(()=>Object.fromEntries(Se.map(b=>[b,{cacheKey:null,dbKey:null,type:null}]))),[l,d]=h.useState("user:42"),[c,p]=h.useState("Ada"),[m,g]=h.useState("Ready. Write a key+value, then read. Watch how the 4 strategies diverge."),[w,C]=h.useState(!1),[j,$]=h.useState(()=>Object.fromEntries(Se.map(b=>[b,{lastReadLat:0,lastWriteLat:0,lastReadHit:null,wroteAt:null,readAt:null}]))),O=()=>{s(Object.fromEntries(Se.map(b=>[b,n.current[b].snapshot()])))},q=(b,x,{cacheKey:f,dbKey:u,type:y})=>{o(v=>({...v,[b]:0})),x.forEach((v,I)=>{setTimeout(()=>{o(S=>({...S,[b]:I+1}))},I*mh)}),a(v=>({...v,[b]:{cacheKey:f,dbKey:u,type:y}})),setTimeout(()=>{a(v=>({...v,[b]:{cacheKey:null,dbKey:null,type:null}}))},Oa)},R=()=>{const b=l.trim();if(!b)return;const x=c;for(const f of Se){const u=n.current[f],y=u.write(b,x);q(f,y.trace,{cacheKey:b,dbKey:f==="write-behind"?null:b,type:"write"}),$(v=>({...v,[f]:{...v[f],lastWriteLat:y.latencyMs,wroteAt:u.clock}}))}g(`write(${b}, '${dn(x)}') dispatched to all 4 runners. Compare trace lengths below.`),O()},D=()=>{const b=l.trim();if(b){for(const x of Se){const f=n.current[x],u=f.read(b);q(x,u.trace,{cacheKey:b,dbKey:u.hit?null:b,type:u.hit?"hit":"miss"}),$(y=>({...y,[x]:{...y[x],lastReadLat:u.latencyMs,lastReadHit:u.hit,readAt:f.clock}}))}g(`read(${b}) dispatched. Cache-aside will miss if this is first read; write-through is already warm.`),O()}},B=()=>{for(const b of Se)n.current[b].tick(1e3);g("Advanced 1s. Write-behind drained its queue; refresh-ahead checked refresh windows."),O()},V=()=>{if(w){for(const b of Se)n.current[b].revive("cache");C(!1),g("Cache revived. Caches are empty and must re-warm.")}else{let b=0;for(const x of Se){const f=n.current[x].kill("cache");b+=f.lost}C(!0),g(b>0?`Cache killed. write-behind LOST ${b} pending write(s) -- data-loss window in action.`:"Cache killed. No pending writes were in-flight, so no data lost this time.")}O()},T=()=>{n.current=Object.fromEntries(Se.map(b=>[b,new Li({strategy:b,cacheTtlMs:5e3})])),C(!1),$(Object.fromEntries(Se.map(b=>[b,{lastReadLat:0,lastWriteLat:0,lastReadHit:null,wroteAt:null,readAt:null}]))),o(Object.fromEntries(Se.map(b=>[b,0]))),a(Object.fromEntries(Se.map(b=>[b,{cacheKey:null,dbKey:null,type:null}]))),g("Reset. Four fresh runners."),O()},_=h.useMemo(()=>Se.map(b=>{const x=j[b],f=t[b],u=f.lastOp&&f.lastOp.kind==="read"&&f.lastOp.hit?"served from cache":f.lastOp&&f.lastOp.kind==="read"?"read fell through to DB":"-",y=x.lastReadLat||x.lastWriteLat||0;return{s:b,freshCache:u,lastLat:y,risk:b==="write-behind"?"data loss if cache dies":b==="cache-aside"?"stale reads possible":b==="refresh-ahead"?"wasted refreshes on cold keys":"write-latency penalty"}}),[t,j]);return e.jsxs("div",{className:"cs-root",children:[e.jsx("style",{children:bh}),e.jsxs("div",{className:"cs-panel",children:[e.jsxs("div",{className:"cs-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"cs-title",children:"Cache Strategies -- System Design Primer"}),e.jsxs("div",{className:"cs-subtitle",children:["Four coordination patterns between ",e.jsx("b",{children:"app"}),", ",e.jsx("b",{children:"cache"}),", and ",e.jsx("b",{children:"DB"}),". Drive the same operation on all four and watch them diverge."]})]}),e.jsx("div",{className:"cs-title-controls",children:e.jsx("button",{className:"cs-btn cs-btn-ghost",onClick:T,children:"Reset all"})})]}),e.jsxs("div",{className:"cs-controls",children:[e.jsx("input",{className:"cs-input",style:{width:120},placeholder:"key",value:l,onChange:b=>d(b.target.value)}),e.jsx("input",{className:"cs-input",style:{width:140},placeholder:"value",value:c,onChange:b=>p(b.target.value)}),e.jsx("button",{className:"cs-btn",onClick:R,children:"Write"}),e.jsx("button",{className:"cs-btn cs-btn-good",onClick:D,children:"Read"}),e.jsx("button",{className:"cs-btn cs-btn-ghost",onClick:B,children:"Advance time 1s"}),e.jsx("span",{className:"cs-sep"}),e.jsx("button",{className:"cs-btn "+(w?"cs-btn-good":"cs-btn-danger"),onClick:V,children:w?"Revive cache":"Kill cache"})]}),e.jsxs("div",{className:"cs-status",children:[e.jsx("span",{className:"cs-status-dot"}),e.jsx("span",{children:m})]}),e.jsx("div",{className:"cs-grid-cards",children:Se.map(b=>e.jsx(xh,{strategy:b,runner:n.current[b],snap:t[b],visibleStepCount:r[b],flash:i[b],counters:t[b].counters},b))}),e.jsxs("div",{className:"cs-teach",children:[e.jsx("div",{className:"cs-teach-title",children:"After the last op..."}),e.jsxs("table",{className:"cs-teach-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Strategy"}),e.jsx("th",{children:"Latest read served"}),e.jsx("th",{children:"Last op latency"}),e.jsx("th",{children:"Inherent risk"})]})}),e.jsx("tbody",{children:_.map(b=>{const x=za[b.s];return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("span",{className:"cs-strategy-pill",children:x.title})}),e.jsx("td",{children:b.freshCache}),e.jsx("td",{children:_o(b.lastLat)}),e.jsx("td",{children:b.risk})]},b.s)})})]}),e.jsxs("div",{className:"cs-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"cs-dot",style:{background:ft}})," app"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cs-dot",style:{background:yr}})," cache"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cs-dot",style:{background:vr}})," db"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cs-dot",style:{background:Pa}})," queue"]}),e.jsx("span",{className:"cs-hint",children:"TTL = 5s. Refresh-ahead refreshes at 70% of TTL on each tick."})]})]})]})]})}
const bh=`
.cs-root {
  color: ${ht};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Vt};
}
.cs-panel {
  background: ${$s};
  border: 1px solid ${Oe};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.cs-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Oe};
}
.cs-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ht};
}
.cs-subtitle {
  font-size: 12px;
  color: ${Je};
  margin-top: 2px;
  max-width: 780px;
}
.cs-title-controls { display: flex; gap: 8px; align-items: center; }
.cs-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid ${Oe};
}
.cs-input {
  padding: 6px 10px;
  background: ${Vt};
  border: 1px solid ${Oe};
  border-radius: 5px;
  color: ${ht};
  font-size: 13px;
  font-family: inherit;
}
.cs-input:focus { outline: none; border-color: ${ft}; }
.cs-btn {
  padding: 6px 14px;
  background: ${ft};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.cs-btn:hover { filter: brightness(1.15); }
.cs-btn-danger { background: ${Zs}; }
.cs-btn-good { background: ${yr}; color: ${Vt}; }
.cs-btn-ghost {
  background: transparent;
  border: 1px solid ${Oe};
  color: ${ht};
}
.cs-sep { width: 1px; height: 22px; background: ${Oe}; margin: 0 4px; }
.cs-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 14px 0;
  padding: 8px 12px;
  background: ${Vt};
  border-left: 3px solid ${ft};
  border-radius: 4px;
  font-size: 12px;
  color: ${ht};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cs-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${ft};
  box-shadow: 0 0 8px ${ft};
  flex-shrink: 0;
}
.cs-grid-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 900px) {
  .cs-grid-cards { grid-template-columns: 1fr; }
}
.cs-card {
  background: ${Vt};
  border: 1px solid ${Oe};
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cs-card-head { border-bottom: 1px dashed ${Oe}; padding-bottom: 8px; }
.cs-card-title { font-size: 14px; font-weight: 700; color: ${ht}; }
.cs-card-sub { font-size: 11px; color: ${Je}; margin-top: 2px; line-height: 1.4; }
.cs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cs-col { display: flex; flex-direction: column; gap: 4px; }
.cs-col-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${Je};
  font-weight: 600;
}
.cs-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: ${Je};
  font-size: 11px;
}
.cs-box {
  background: ${$s};
  border: 1.5px solid ${Oe};
  border-radius: 6px;
  padding: 6px 8px;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.cs-box-cache.cs-flash-hit  { border-color: ${yr};  box-shadow: 0 0 0 2px ${yr}55; }
.cs-box-cache.cs-flash-miss { border-color: ${Zs};box-shadow: 0 0 0 2px ${Zs}55; }
.cs-box-cache.cs-flash-write,
.cs-box-db.cs-flash-write   { border-color: ${ft};box-shadow: 0 0 0 2px ${ft}55; }
.cs-empty { color: ${Je}; font-size: 11px; font-style: italic; }
.cs-kv {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cs-kv-dirty { background: rgba(224,168,74,0.14); }
.cs-kv-pulse { animation: cs-pulse ${Oa}ms ease-out; }
@keyframes cs-pulse {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.08); filter: brightness(1.3); }
  100% { transform: scale(1); }
}
.cs-k { color: ${ft}; font-weight: 600; }
.cs-arrow { color: ${Je}; }
.cs-v { color: ${ht}; }
.cs-ttl {
  margin-left: auto;
  color: ${Je};
  font-size: 10px;
}
.cs-tag {
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.cs-tag-dirty { background: ${vr}; color: ${Vt}; }
.cs-pending {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cs-pending-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 8px;
  background: ${$s};
  border: 1.5px dashed ${vr};
  border-radius: 6px;
  min-height: 28px;
  align-items: center;
}
.cs-chip-pending {
  padding: 2px 8px;
  background: ${vr};
  color: ${Vt};
  border-radius: 999px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  animation: cs-fade-in 0.25s ease-out;
}
.cs-trace {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cs-trace-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 180px;
  overflow-y: auto;
}
.cs-trace-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: ${$s};
  border: 1px solid ${Oe};
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  animation: cs-fade-in 0.25s ease-out both;
}
.cs-trace-num {
  color: ${Je};
  font-size: 10px;
  min-width: 14px;
  text-align: right;
}
.cs-trace-actor {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  border: 1px solid;
  min-width: 44px;
  text-align: center;
}
.cs-trace-op { color: ${ht}; font-weight: 600; }
.cs-trace-note { color: ${Je}; flex: 1; }
.cs-trace-lat { color: ${uh}; font-size: 10px; }
@keyframes cs-fade-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cs-counters {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 10px;
  background: ${$s};
  border: 1px solid ${Oe};
  border-radius: 6px;
  font-size: 11px;
  color: ${Je};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cs-counters strong { color: ${ht}; font-weight: 600; margin-right: 2px; }
.cs-lost { color: ${Zs}; }
.cs-lost strong { color: ${Zs}; }
.cs-teach {
  margin-top: 14px;
  padding: 12px 14px;
  background: ${Vt};
  border: 1px solid ${Oe};
  border-radius: 8px;
}
.cs-teach-title {
  font-size: 12px;
  font-weight: 600;
  color: ${ht};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.cs-teach-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cs-teach-table th, .cs-teach-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid ${Oe};
}
.cs-teach-table th {
  color: ${Je};
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.cs-teach-table td { color: ${ht}; }
.cs-strategy-pill {
  display: inline-block;
  padding: 2px 8px;
  background: ${$s};
  border: 1px solid ${Oe};
  border-radius: 4px;
  font-size: 11px;
  color: ${ft};
  font-weight: 600;
}
.cs-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 10px;
  margin-top: 8px;
  border-top: 1px dashed ${Oe};
  font-size: 11px;
  color: ${Je};
  align-items: center;
}
.cs-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
`;

export default gh;
export { gh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(gh, {}));
  return () => root.unmount();
}
