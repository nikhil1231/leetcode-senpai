import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Mc(n){let t=n>>>0;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
const di=1500;
class Ac{constructor({N:t=5,W:s=3,R:r=3,replicationDelayMs:o=[80,300],seed:i=1}={}){this.N=t,this.W=Math.max(1,Math.min(s,t)),this.R=Math.max(1,Math.min(r,t)),this.replicationDelayMs=o.slice(),this.rand=Mc(i),this.simTime=0,this._msgId=0,this._opId=0,this.messages=[],this.pendingWrites=[],this.pendingReads=[],this.completedOps=[],this.lastResult=null,this._pendingEvents=[],this.nodes=[];for(let a=0;a<t;a++)this.nodes.push({id:a,alive:!0,store:new Map,hints:[]})}setParams({W:t,R:s}={}){typeof t=="number"&&(this.W=Math.max(1,Math.min(t|0,this.N))),typeof s=="number"&&(this.R=Math.max(1,Math.min(s|0,this.N)))}killNode(t){const s=this.nodes[t];!s||!s.alive||(s.alive=!1,this.messages=this.messages.filter(r=>r.from!==t&&r.to!==t),this._emit({type:"nodeKilled",nodeId:t}))}reviveNode(t){const s=this.nodes[t];!s||s.alive||(s.alive=!0,this._emit({type:"nodeRevived",nodeId:t}))}put(t,s){const r=this._coordinator();if(!r)return this.lastResult={kind:"put",ok:!1,reason:"coordinator dead",key:t,value:s},this.lastResult;let o=0;for(const p of this.nodes){const m=p.store.get(t);m&&m.version>o&&(o=m.version)}const i=o+1,a=++this._opId,l=[],d=[];for(let p=0;p<this.N;p++)this.nodes[p].alive?l.push(p):d.push(p);for(const p of l)this._send(r.id,p,"WRITE",{opId:a,key:t,value:s,version:i});const c={opId:a,kind:"put",key:t,value:s,version:i,W:this.W,acks:0,ackedFrom:new Set,targets:new Set(l),unreachable:d.slice(),startedAt:this.simTime,deadline:this.simTime+di,done:!1,committedAt:null,hintedTo:[]};return this.pendingWrites.push(c),this._emit({type:"putStarted",opId:a,key:t,value:s,version:i,targets:l.slice(),unreachable:d.slice(),W:this.W,N:this.N}),c}get(t){const s=this._coordinator();if(!s)return this.lastResult={kind:"get",ok:!1,reason:"coordinator dead",key:t},this.lastResult;const r=++this._opId,o=[],i=[];for(let l=0;l<this.N;l++)this.nodes[l].alive?o.push(l):i.push(l);for(const l of o)this._send(s.id,l,"READ",{opId:r,key:t});const a={opId:r,kind:"get",key:t,R:this.R,responses:[],respondedFrom:new Set,targets:new Set(o),unreachable:i.slice(),startedAt:this.simTime,deadline:this.simTime+di,done:!1,result:null};return this.pendingReads.push(a),this._emit({type:"getStarted",opId:r,key:t,targets:o.slice(),unreachable:i.slice(),R:this.R,N:this.N}),a}tick(t){this.simTime+=t,this._pendingEvents=[];const s=[];for(const r of this.messages)r.progress+=t/r.flightMs,r.progress>=1?this._deliver(r):s.push(r);this.messages=s;for(const r of this.pendingWrites)r.done||this.simTime>=r.deadline&&this._stallWrite(r);for(const r of this.pendingReads)r.done||this.simTime>=r.deadline&&this._stallRead(r);return this.pendingWrites=this.pendingWrites.filter(r=>!(r.done&&!this._hasInflightFor(r.opId))),this.pendingReads=this.pendingReads.filter(r=>!(r.done&&!this._hasInflightFor(r.opId))),this._pendingEvents}snapshot(){return{simTime:this.simTime,N:this.N,W:this.W,R:this.R,readAfterWrite:this.W+this.R>this.N,nodes:this.nodes.map(t=>({id:t.id,alive:t.alive,store:Object.fromEntries(Array.from(t.store.entries()).map(([s,r])=>[s,{value:r.value,version:r.version}])),hints:t.hints.slice()})),pendingWrites:this.pendingWrites.map(Ic),pendingReads:this.pendingReads.map(Ec),inFlightMessages:this.messages.map(t=>({id:t.id,from:t.from,to:t.to,type:t.type,progress:t.progress,opId:t.data.opId,key:t.data.key,value:t.data.value,version:t.data.version})),recentOps:this.completedOps.slice(-5),lastResult:this.lastResult}}_coordinator(){const t=this.nodes[0];return t&&t.alive?t:null}_randFlight(){const[t,s]=this.replicationDelayMs;return t+this.rand()*Math.max(0,s-t)}_send(t,s,r,o){!this.nodes[t]||!this.nodes[s]||!this.nodes[t].alive||!this.nodes[s].alive||this.messages.push({id:++this._msgId,from:t,to:s,type:r,data:o,progress:0,flightMs:this._randFlight()})}_deliver(t){const s=this.nodes[t.to];if(!(!s||!s.alive))switch(t.type){case"WRITE":return this._onWrite(s,t);case"WRITE_ACK":return this._onWriteAck(t);case"READ":return this._onRead(s,t);case"READ_REPLY":return this._onReadReply(t);case"HINT":return this._onHint(s,t)}}_hasInflightFor(t){for(const s of this.messages)if(s.data.opId===t)return!0;return!1}_onWrite(t,s){const{opId:r,key:o,value:i,version:a}=s.data,l=t.store.get(o);!l||a>l.version?t.store.set(o,{value:i,version:a}):a===l.version&&l.value,this._send(t.id,s.from,"WRITE_ACK",{opId:r,key:o,version:a})}_onWriteAck(t){const{opId:s}=t.data,r=this.pendingWrites.find(o=>o.opId===s);if(!(!r||r.done)&&!r.ackedFrom.has(t.from)&&(r.ackedFrom.add(t.from),r.acks+=1,r.acks>=r.W&&!r.done)){r.done=!0,r.committedAt=this.simTime;const o=r.committedAt-r.startedAt;r.latencyMs=o,this.lastResult={kind:"put",ok:!0,key:r.key,value:r.value,version:r.version,acks:r.acks,W:r.W,latencyMs:o,stalled:!1},this.completedOps.push({kind:"put",key:r.key,value:r.value,version:r.version,W:r.W,N:this.N,latencyMs:o,outcome:"committed",startedAt:r.startedAt}),this.completedOps.length>50&&this.completedOps.shift(),this._emit({type:"putCommitted",opId:s,key:r.key,value:r.value,version:r.version,acks:r.acks,W:r.W,latencyMs:o})}}_onRead(t,s){const{opId:r,key:o}=s.data,i=t.store.get(o);this._send(t.id,s.from,"READ_REPLY",{opId:r,key:o,value:i?i.value:null,version:i?i.version:0})}_onReadReply(t){const{opId:s}=t.data,r=this.pendingReads.find(o=>o.opId===s);if(!(!r||r.done)&&!r.respondedFrom.has(t.from)&&(r.respondedFrom.add(t.from),r.responses.push({from:t.from,value:t.data.value,version:t.data.version}),r.responses.length>=r.R&&!r.done)){r.done=!0,r.finishedAt=this.simTime,r.latencyMs=r.finishedAt-r.startedAt;const o=r.responses.reduce((l,d)=>d.version>l?d.version:l,0),i=r.responses.filter(l=>l.version===o),a=[...new Set(i.map(l=>l.value))];a.length<=1?r.result={value:a[0]??null,version:o,responses:r.responses.slice()}:r.result={siblings:a,version:o,responses:r.responses.slice()},this.lastResult={kind:"get",ok:!0,key:r.key,R:r.R,responses:r.responses.slice(),result:r.result,latencyMs:r.latencyMs,stalled:!1},this.completedOps.push({kind:"get",key:r.key,value:r.result.siblings?`siblings[${r.result.siblings.join("|")}]`:r.result.value,version:o,R:r.R,N:this.N,latencyMs:r.latencyMs,outcome:r.result.siblings?"siblings":"ok",startedAt:r.startedAt}),this.completedOps.length>50&&this.completedOps.shift(),this._emit({type:"getCompleted",opId:s,key:r.key,responseCount:r.responses.length,R:r.R,latencyMs:r.latencyMs,highestVersion:o,siblings:r.result.siblings||null,value:r.result.value??null})}}_onHint(t,s){t.hints.push({for:s.data.for,key:s.data.key,value:s.data.value,version:s.data.version,at:this.simTime}),this._emit({type:"hintRecorded",nodeId:t.id,for:s.data.for,key:s.data.key,version:s.data.version})}_stallWrite(t){t.done=!0,t.stalled=!0,t.finishedAt=this.simTime,t.latencyMs=t.finishedAt-t.startedAt;const s=[];for(const r of t.unreachable){const o=this._pickLiveExtra(t,s);if(o===null)break;this._send(0,o,"HINT",{opId:t.opId,for:r,key:t.key,value:t.value,version:t.version}),s.push(o),t.hintedTo.push({hintNode:o,forNode:r})}this.lastResult={kind:"put",ok:!1,stalled:!0,key:t.key,value:t.value,version:t.version,acks:t.acks,W:t.W,latencyMs:t.latencyMs,hintedTo:t.hintedTo.slice(),unreachable:t.unreachable.slice()},this.completedOps.push({kind:"put",key:t.key,value:t.value,version:t.version,W:t.W,N:this.N,latencyMs:t.latencyMs,outcome:"stalled",hintedTo:t.hintedTo.slice(),startedAt:t.startedAt}),this.completedOps.length>50&&this.completedOps.shift(),this._emit({type:"putStalled",opId:t.opId,key:t.key,value:t.value,acks:t.acks,W:t.W,hintedTo:t.hintedTo.slice()})}_stallRead(t){t.done=!0,t.stalled=!0,t.finishedAt=this.simTime,t.latencyMs=t.finishedAt-t.startedAt,t.result={stalled:!0,responses:t.responses.slice()},this.lastResult={kind:"get",ok:!1,stalled:!0,key:t.key,R:t.R,responseCount:t.responses.length,latencyMs:t.latencyMs},this.completedOps.push({kind:"get",key:t.key,value:"(stalled)",version:0,R:t.R,N:this.N,latencyMs:t.latencyMs,outcome:"stalled",startedAt:t.startedAt}),this.completedOps.length>50&&this.completedOps.shift(),this._emit({type:"getStalled",opId:t.opId,key:t.key,responseCount:t.responses.length,R:t.R})}_pickLiveExtra(t,s){for(let r=0;r<this.N;r++)if(this.nodes[r].alive&&!t.targets.has(r)&&!s.includes(r))return r;for(let r=1;r<this.N;r++)if(this.nodes[r].alive&&!s.includes(r))return r;return null}_emit(t){this._pendingEvents.push({t:this.simTime,...t})}}
function Ic(n){return{opId:n.opId,kind:"put",key:n.key,value:n.value,version:n.version,W:n.W,acks:n.acks,ackedFrom:Array.from(n.ackedFrom),targets:Array.from(n.targets),unreachable:n.unreachable.slice(),startedAt:n.startedAt,done:n.done,stalled:!!n.stalled,latencyMs:n.latencyMs??null,committedAt:n.committedAt??null,hintedTo:n.hintedTo.slice()}}
function Ec(n){return{opId:n.opId,kind:"get",key:n.key,R:n.R,responses:n.responses.slice(),respondedFrom:Array.from(n.respondedFrom),targets:Array.from(n.targets),unreachable:n.unreachable.slice(),startedAt:n.startedAt,done:n.done,stalled:!!n.stalled,latencyMs:n.latencyMs??null,result:n.result??null}}
const zc=720,gr=360,tt=60,ct=gr/2,ja=560,de=26,me={coord:"#d27c2a",alive:"#4a8fd8",dead:"#3a3a3a",writeMsg:"#d27c2a",writeAck:"#9dd8b8",readMsg:"#a15cff",readReply:"#d6b8ff",hint:"#f5c542"},Pc={WRITE:me.writeMsg,WRITE_ACK:me.writeAck,READ:me.readMsg,READ_REPLY:me.readReply,HINT:me.hint};
function Oc(n){const t=[],s=gr-60,r=n>1?s/(n-1):0,o=30;for(let i=0;i<n;i++)t.push({x:ja,y:o+i*r});return t}
function Lc(n){if(!n)return"Idle. Issue a Put or a Get to begin.";if(n.kind==="put"){if(n.ok)return`Put(${n.key}=${JSON.stringify(n.value)}): coordinator -> replicas. ${n.acks} acks received (W=${n.W}) in ${Math.round(n.latencyMs)}ms. Write committed at version ${n.version}.`;if(n.stalled){const t=n.hintedTo&&n.hintedTo.length?` (sloppy quorum hint sent to ${n.hintedTo.map(s=>`n${s.hintNode} for n${s.forNode}`).join(", ")})`:"";return`Put(${n.key}=${JSON.stringify(n.value)}) with W=${n.W} -> only ${n.acks} ack${n.acks===1?"":"s"} in ${Math.round(n.latencyMs)}ms. Write stalled${t}.`}return`Put(${n.key}): ${n.reason||"failed"}.`}if(n.kind==="get"){if(n.ok){const t=n.result;if(t.siblings)return`Get(${n.key}): coordinator -> replicas. ${n.responses.length} responses (R=${n.R}) at v=${t.version} -> SIBLINGS [${t.siblings.map(r=>JSON.stringify(r)).join(" | ")}] (conflict).`;const s=n.responses.length>0&&n.responses.every(r=>r.version===t.version);return`Get(${n.key}): coordinator -> replicas. ${n.responses.length} responses (R=${n.R})${s?" all":""} v=${t.version} -> return ${JSON.stringify(t.value)} in ${Math.round(n.latencyMs)}ms.`}return n.stalled?`Get(${n.key}) with R=${n.R} -> only ${n.responseCount} response${n.responseCount===1?"":"s"} in ${Math.round(n.latencyMs)}ms. Read stalled (not enough live replicas).`:`Get(${n.key}): ${n.reason||"failed"}.`}return""}
const pi=`
.quorum-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.quorum-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.quorum-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.quorum-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.quorum-toolbar label {
  font-size: 12px;
  color: #8a95a3;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.quorum-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 90px;
}
.quorum-toolbar input[type="range"] {
  width: 100px;
}
.quorum-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.quorum-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.quorum-toolbar button:hover { background: #232a33; }
.quorum-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.quorum-toolbar button.primary:hover { background: #3467b0; }
.quorum-toolbar button.accent {
  background: #6c3ba0;
  border-color: #7f4cb0;
}
.quorum-toolbar button.accent:hover { background: #7a4ab0; }
.quorum-raw-indicator {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.quorum-raw-indicator.ok {
  background: #163f2a;
  color: #9dd8b8;
  border: 1px solid #2f7b50;
}
.quorum-raw-indicator.bad {
  background: #4a1f1f;
  color: #ff9a9a;
  border: 1px solid #8b2a2a;
}
.quorum-main {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 12px;
}
.quorum-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.quorum-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.quorum-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.quorum-node-panels {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.quorum-node-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
}
.quorum-node-card .hdr {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  font-weight: 600;
}
.quorum-node-card .kv {
  color: #cfd6e0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.quorum-node-card .kv .empty { color: #555; }
.quorum-node-card .hints {
  color: #f5c542;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 2px;
}
.quorum-status {
  margin-top: 10px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 20px;
  color: #cfd6e0;
}
.quorum-status.error { color: #ff9a9a; }
.quorum-status.warn { color: #f5c542; }
.quorum-rbar {
  margin-top: 8px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  color: #cfd6e0;
}
.quorum-rbar .title {
  font-size: 11px;
  color: #8a95a3;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.quorum-rbar-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.quorum-rbar-cell {
  background: #1a1f26;
  border: 1px solid #2a3038;
  border-radius: 3px;
  padding: 4px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 88px;
}
.quorum-rbar-cell .lat { color: #8a95a3; }
.quorum-rbar-cell.ok { border-color: #2f7b50; }
.quorum-rbar-cell.stalled { border-color: #8b2a2a; background: #2a1a1a; }
.quorum-rbar-cell.siblings { border-color: #a57d18; background: #2a2416; }
.quorum-widget svg text { user-select: none; }
`;
function Fc(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(5),[i,a]=h.useState(3),[l,d]=h.useState(3),[c,p]=h.useState(null),[m,g]=h.useState(!1),[w,C]=h.useState("x"),[j,$]=h.useState("5"),O=h.useRef(Math.floor(Math.random()*1e9));h.useEffect(()=>{O.current=Math.floor(Math.random()*1e9);const f=new Ac({N:r,W:Math.min(i,r),R:Math.min(l,r),replicationDelayMs:[80,300],seed:O.current});n.current=f,p(f.snapshot()),i>r&&a(r),l>r&&d(r)},[r,t]),h.useEffect(()=>{const f=n.current;f&&(f.setParams({W:i,R:l}),p(f.snapshot()))},[i,l]);const q=h.useCallback(()=>{const f=n.current;f&&(f.tick(50*window.SimClock.scale()),p(f.snapshot()))},[]);h.useEffect(()=>{if(!m)return;const f=window.SimClock.every(q,60);return()=>clearInterval(f)},[m,q]);const R=h.useCallback(()=>{const f=n.current;if(!f)return;const u=w.trim();if(!u)return;let y=j;y!==""&&!isNaN(Number(y))&&(y=Number(y)),f.put(u,y),p(f.snapshot())},[w,j]),D=h.useCallback(()=>{const f=n.current;if(!f)return;const u=w.trim();u&&(f.get(u),p(f.snapshot()))},[w]),B=h.useCallback(f=>{const u=n.current;if(!u)return;u.nodes[f].alive?u.killNode(f):u.reviveNode(f),p(u.snapshot())},[]),V=h.useMemo(()=>Oc((c==null?void 0:c.N)??r),[c,r]);if(!c)return e.jsxs("div",{className:"quorum-widget",children:[e.jsx("style",{children:pi}),e.jsx("h2",{children:"Quorum Replication Visualizer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const T=c.readAfterWrite,_=Lc(c.lastResult),b=c.lastResult&&(c.lastResult.stalled||c.lastResult.ok===!1),x=c.lastResult&&c.lastResult.kind==="get"&&c.lastResult.ok&&c.lastResult.result&&c.lastResult.result.siblings;return e.jsxs("div",{className:"quorum-widget",children:[e.jsx("style",{children:pi}),e.jsxs("h2",{children:[e.jsx("span",{children:"Quorum Replication Visualizer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:()=>g(f=>!f),children:m?"Pause":"Play"}),e.jsx("button",{onClick:q,disabled:m,children:"Step"}),e.jsx("button",{onClick:()=>{g(!1);(()=>s(f=>f+1))()},children:"Reset"}),e.jsx("span",{ref:window.SimClock.control})]})]}),e.jsx("p",{className:"sub",children:"Petrov ch.11 “Tunable Consistency”. Coordinator = n0; fans out to all N replicas; W acks to commit a write, R responses to return a read. W + R > N guarantees read-after-write."}),e.jsxs("div",{className:"quorum-toolbar",children:[e.jsxs("label",{children:["N:",e.jsxs("select",{value:r,onChange:f=>o(Number(f.target.value)),children:[e.jsx("option",{value:3,children:"3"}),e.jsx("option",{value:5,children:"5"}),e.jsx("option",{value:7,children:"7"})]})]}),e.jsxs("label",{children:["W:",e.jsx("input",{type:"range",min:1,max:r,value:i,onChange:f=>a(Number(f.target.value))}),e.jsx("span",{style:{minWidth:14,color:"#cfd6e0"},children:i})]}),e.jsxs("label",{children:["R:",e.jsx("input",{type:"range",min:1,max:r,value:l,onChange:f=>d(Number(f.target.value))}),e.jsx("span",{style:{minWidth:14,color:"#cfd6e0"},children:l})]}),e.jsxs("span",{className:`quorum-raw-indicator ${T?"ok":"bad"}`,children:["W+R ",T?">":"<="," N (",i,"+",l," ",T?">":"<="," ",r,") "," ",T?"-> read-after-write guaranteed":"-> may read stale"]}),e.jsx("span",{style:{flex:1}}),e.jsxs("label",{children:["key:",e.jsx("input",{type:"text",value:w,onChange:f=>C(f.target.value),style:{width:60}})]}),e.jsxs("label",{children:["value:",e.jsx("input",{type:"text",value:j,onChange:f=>$(f.target.value),style:{width:70},onKeyDown:f=>f.key==="Enter"&&R()})]}),e.jsx("button",{className:"primary",onClick:R,children:"Put"}),e.jsx("button",{className:"accent",onClick:D,children:"Get"})]}),e.jsxs("div",{className:"quorum-main",children:[e.jsxs("div",{className:"quorum-canvas-wrap",children:[e.jsxs("svg",{width:zc,height:gr,children:[e.jsx("defs",{children:e.jsx("marker",{id:"qarrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),V.map((f,u)=>e.jsx("line",{x1:tt+de,y1:ct,x2:f.x-de,y2:f.y,stroke:"#1e252e",strokeWidth:"1"},`link-${u}`)),c.inFlightMessages.map(f=>{const u=f.from===0?{x:tt,y:ct}:V[f.from],y=f.to===0?{x:tt,y:ct}:V[f.to],v=y.x-u.x,I=y.y-u.y,S=Math.sqrt(v*v+I*I)||1,H=-I/S,M=v/S,k=f.type.endsWith("_ACK")||f.type.endsWith("_REPLY"),P=k?-6:6,N=H*P,z=M*P,E=u.x+N+v*f.progress,J=u.y+z+I*f.progress,Y=Pc[f.type]||"#777";return e.jsxs("g",{children:[e.jsx("line",{x1:u.x+N,y1:u.y+z,x2:y.x+N,y2:y.y+z,stroke:Y,strokeOpacity:"0.18",strokeWidth:"1",strokeDasharray:k?"3 3":void 0}),e.jsx("circle",{cx:E,cy:J,r:k?3.5:5,fill:Y,opacity:"0.95",children:e.jsx("title",{children:`${f.type} op=${f.opId} ${f.from}->${f.to}`+(f.version?` v=${f.version}`:"")})})]},f.id)}),(()=>{const u=c.nodes[0].alive;return e.jsxs("g",{onClick:()=>B(0),style:{cursor:"pointer"},children:[e.jsx("circle",{cx:tt,cy:ct,r:de+4,fill:"none",stroke:u?me.coord:"#555",strokeWidth:"2",strokeDasharray:"4 2"}),e.jsx("circle",{cx:tt,cy:ct,r:de,fill:u?me.coord:me.dead,stroke:"#111",strokeWidth:"2"}),e.jsx("text",{x:tt,y:ct-2,textAnchor:"middle",fill:"#111",fontSize:"12",fontWeight:"700",children:"n0"}),e.jsx("text",{x:tt,y:ct+12,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"700",children:"COORD"}),!u&&e.jsxs("g",{children:[e.jsx("line",{x1:tt-de*.6,y1:ct-de*.6,x2:tt+de*.6,y2:ct+de*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:tt+de*.6,y1:ct-de*.6,x2:tt-de*.6,y2:ct+de*.6,stroke:"#ff6b6b",strokeWidth:"3"})]})]})})(),c.nodes.map(f=>{const u=V[f.id],y=Object.keys(f.store),v=y[0]||null,I=v?f.store[v]:null;return e.jsxs("g",{onClick:()=>B(f.id),style:{cursor:"pointer"},children:[e.jsx("circle",{cx:u.x,cy:u.y,r:de,fill:f.alive?me.alive:me.dead,stroke:f.alive?"#111":"#555",strokeWidth:"2"}),e.jsxs("text",{x:u.x,y:u.y+4,textAnchor:"middle",fill:"#111",fontSize:"13",fontWeight:"700",children:["n",f.id]}),!f.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:u.x-de*.6,y1:u.y-de*.6,x2:u.x+de*.6,y2:u.y+de*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:u.x+de*.6,y1:u.y-de*.6,x2:u.x-de*.6,y2:u.y+de*.6,stroke:"#ff6b6b",strokeWidth:"3"})]}),e.jsxs("text",{x:u.x+de+8,y:u.y-4,fill:"#cfd6e0",fontSize:"11",fontFamily:"ui-monospace, Menlo, monospace",children:[y.length===0?"(empty)":y.slice(0,2).map(S=>`${S}=${JSON.stringify(f.store[S].value)}@v${f.store[S].version}`).join("  "),y.length>2?"  ...":""]}),f.hints&&f.hints.length>0&&e.jsxs("text",{x:u.x+de+8,y:u.y+10,fill:me.hint,fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:["hints:",f.hints.length]}),v&&I&&e.jsx("title",{children:`n${f.id} ${v}=${I.value} v=${I.version}`})]},`rep-${f.id}`)}),e.jsx("text",{x:tt,y:gr-8,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",children:"client -> coordinator"}),e.jsxs("text",{x:ja,y:gr-8,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",children:[c.N," replicas (W=",c.W,", R=",c.R,")"]})]}),e.jsxs("div",{className:"quorum-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.coord}})," coordinator"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.alive}})," replica"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.dead}})," dead"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.writeMsg}})," WRITE"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.writeAck}})," WRITE_ACK"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.readMsg}})," READ"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.readReply}})," READ_REPLY"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:me.hint}})," hint (sloppy)"]}),e.jsx("span",{children:"click a node to kill / revive"})]})]}),e.jsx("div",{className:"quorum-node-panels",children:c.nodes.map(f=>{const u=Object.keys(f.store);return e.jsxs("div",{className:"quorum-node-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:f.alive?f.id===0?me.coord:me.alive:"#888"},children:["n",f.id," ",f.alive?f.id===0?"coord+replica":"replica":"CRASHED"]}),e.jsxs("span",{style:{color:"#8a95a3"},children:[u.length," key",u.length===1?"":"s"]})]}),e.jsx("div",{className:"kv",children:u.length===0?e.jsx("span",{className:"empty",children:"(empty store)"}):u.map(y=>e.jsxs("div",{children:[y," = ",JSON.stringify(f.store[y].value)," ",e.jsxs("span",{style:{color:"#8a95a3"},children:["v",f.store[y].version]})]},y))}),f.hints&&f.hints.length>0&&e.jsxs("div",{className:"hints",children:["hints:"," ",f.hints.map(y=>`${y.key}=${JSON.stringify(y.value)}@v${y.version} (for n${y.for})`).join("; ")]})]},f.id)})})]}),e.jsx("div",{className:`quorum-status ${b?"error":""} ${x?"warn":""}`,children:_}),e.jsxs("div",{className:"quorum-rbar",children:[e.jsx("div",{className:"title",children:"last 5 ops (most recent on the right)"}),e.jsxs("div",{className:"quorum-rbar-row",children:[c.recentOps.length===0&&e.jsx("span",{style:{color:"#555",fontSize:11},children:"(no ops yet)"}),c.recentOps.map((f,u)=>{const y=f.outcome==="stalled"?"stalled":f.outcome==="siblings"?"siblings":"ok",v=f.kind==="put"?`PUT ${f.key}=${JSON.stringify(f.value)} v${f.version}`:`GET ${f.key} -> ${JSON.stringify(f.value)}`,I=f.kind==="put"?`W=${f.W}/${f.N}`:`R=${f.R}/${f.N}`;return e.jsxs("div",{className:`quorum-rbar-cell ${y}`,children:[e.jsx("span",{children:v}),e.jsxs("span",{className:"lat",children:[I," · ",Math.round(f.latencyMs),"ms · ",f.outcome]})]},u)})]})]})]})}

export default Fc;
export { Fc as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Fc, {}));
  return () => root.unmount();
}
