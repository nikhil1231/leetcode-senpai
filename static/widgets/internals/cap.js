import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Vt="#0f1419";
const $s="#1a1f2e";
const Oe="#2a2f3e";
const ht="#e6e6e6";
const Je="#8a93a6";
const ft="#4a7cff";
const uh="#f5c451";
const Zs="#f66";
const yr="#5cd894";
const vr="#e0a84a";
const Oa=650;
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
function yh(n){let t=n>>>0;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
const vh=600,Fi=800;
function Di(n,t){for(const s of Object.keys(n))if((n[s]||0)>(t[s]||0))return!1;return!0}
function wh(n,t){const s=new Set([...Object.keys(n),...Object.keys(t)]);for(const r of s)if((n[r]||0)!==(t[r]||0))return!1;return!0}
function kh(n,t){const s={},r=new Set([...Object.keys(n),...Object.keys(t)]);for(const o of r)s[o]=Math.max(n[o]||0,t[o]||0);return s}
function Gn(n,t){if(wh(n,t))return"eq";const s=Di(n,t),r=Di(t,n);return s&&!r?"lt":r&&!s?"gt":"co"}
class qi{constructor({mode:t="cp",nodeCount:s=3,seed:r=1}={}){this.mode=t,this.N=s,this.rand=yh(r),this.simTime=0,this._msgId=0,this.messages=[],this.nodes=[],this.partition=null,this.pendingHeals=[],this.lastResult=null,this.mergeCallout=null;for(let o=0;o<s;o++)this.nodes.push({id:o,role:o===0?"primary":"secondary",kv:{},lastOp:null,recovering:0})}setMode(t){if(t!=="cp"&&t!=="ap")throw new Error("bad mode");if(t!==this.mode){this.mode=t,this.messages=[],this.partition=null,this.pendingHeals=[],this.mergeCallout=null,this.lastResult={kind:"mode",text:`switched to ${t.toUpperCase()} mode (cluster reset)`};for(const s of this.nodes)s.role=s.id===0?"primary":"secondary",s.kv={},s.lastOp=null,s.recovering=0}}tick(t){this.simTime+=t;const s=[];for(const r of this.messages){const o=t/vh;if(r.progress+=o,r.rejected){r.fade=(r.fade||1)-o*1.2,r.fade>0&&s.push(r);continue}if(this._crossesPartition(r.from,r.to)&&r.progress>=.5){r.rejected=!0,r.progress=.5,r.fade=1,s.push(r);continue}r.progress>=1?this._deliver(r):s.push(r)}this.messages=s;for(const r of this.nodes)r.recovering>0&&(r.recovering=Math.max(0,r.recovering-t));this.pendingHeals=this.pendingHeals.filter(r=>r.untilMs>this.simTime)}partitionSplit(t,s){const r=new Set(t),o=new Set(s);for(let i=0;i<this.N;i++)if(r.has(i)===o.has(i))throw new Error(`node ${i} not placed cleanly into a single side`);this.partition={setA:r,setB:o},this.lastResult={kind:"partition",text:`network partition: {${[...r].map(i=>"N"+i).join(",")}} | {${[...o].map(i=>"N"+i).join(",")}}`}}partitionFn(t,s){return this.partitionSplit(t,s)}heal(){if(!this.partition)return;const{setA:t,setB:s}=this.partition;if(this.partition=null,this.mode==="cp"){const o=this.nodes[0].kv;for(const i of this.nodes)if(i.id!==0){i.kv={};for(const a of Object.keys(o))i.kv[a]={...o[a]};i.recovering=Fi,i.lastOp={ok:!0,text:"caught up from primary"}}this.mergeCallout={kind:"cp-heal",text:"primary state propagated; minority side discarded nothing (writes were rejected there)"},this.lastResult={kind:"heal",text:"partition healed (CP): primary state propagated to secondaries"}}else{const r=[],o=new Set;for(const i of this.nodes)for(const a of Object.keys(i.kv))o.add(a);for(const i of o){const a=[...t].map(C=>this.nodes[C].kv[i]).filter(Boolean),l=[...s].map(C=>this.nodes[C].kv[i]).filter(Boolean),d=C=>{if(C.length===0)return null;let j=C[0];for(let $=1;$<C.length;$++)Gn(j.vc,C[$].vc)==="lt"&&(j=C[$]);return j},c=d(a),p=d(l);let m,g,w;if(c&&!p)m=c,g=null,w="only-side-A had key";else if(p&&!c)m=p,g=null,w="only-side-B had key";else if(c&&p){const C=Gn(c.vc,p.vc);if(C==="eq")m=c,g=null,w="identical vector clocks";else if(C==="lt")m=p,g=null,w="side-B dominates side-A";else if(C==="gt")m=c,g=null,w="side-A dominates side-B";else{const j=c.ts>=p.ts?c:p;m={value:j.value,vc:kh(c.vc,p.vc),ts:Math.max(c.ts,p.ts)},g=[c,p],w=`concurrent -> siblings, LWW picked ${j.value}`}}r.push({key:i,chosen:m,siblings:g,reason:w});for(const C of this.nodes)C.kv[i]={...m,siblings:g?g.slice():null}}for(const i of this.nodes)i.recovering=Fi,i.lastOp={ok:!0,text:"merged on heal"};this.mergeCallout={kind:"ap-heal",merges:r},this.lastResult={kind:"heal",text:`partition healed (AP): ${r.length} key${r.length===1?"":"s"} merged`}}}write(t,s,r){const o=this.nodes[t];return o?this.mode==="cp"?this._cpWrite(o,s,r):this._apWrite(o,s,r):this._fail(t,"write",s,r,"no such node")}read(t,s){const r=this.nodes[t];return r?this.mode==="cp"?this._cpRead(r,s):this._apRead(r,s):this._fail(t,"read",s,null,"no such node")}_cpWrite(t,s,r){const o=this.nodes[0];if(t.id!==0){if(this._crossesPartition(t.id,0))return this._emit(t.id,0,"WriteForward",{key:s,value:r}),t.lastOp={ok:!1,text:`write(${s}=${r}) rejected: cannot reach primary (partitioned)`},this.lastResult={kind:"write",ok:!1,nodeId:t.id,key:s,value:r,text:`N${t.id} (secondary, minority) rejected write(${s}=${r}): cannot reach primary`},{ok:!1,reason:"partitioned from primary"};this._emit(t.id,0,"WriteForward",{key:s,value:r})}const i=this._reachableFrom(0),a=Math.floor(this.N/2)+1;if(i.size<a)return t.lastOp={ok:!1,text:`write(${s}=${r}) rejected: no quorum (${i.size}/${a})`},o.lastOp={ok:!1,text:`primary rejects: only ${i.size}/${a} reachable`},this.lastResult={kind:"write",ok:!1,nodeId:t.id,key:s,value:r,text:`CP write rejected at N${t.id}: primary has no quorum (${i.size}/${this.N} reachable)`},{ok:!1,reason:"primary lacks quorum"};const l=this._msgCounter();o.kv[s]={value:r,ts:l},o.lastOp={ok:!0,text:`committed ${s}=${r} @ t=${l}`};for(const d of i)d!==0&&this._emit(0,d,"Replicate",{key:s,value:r,ts:l});return t.id!==0&&(this._emit(0,t.id,"WriteAck",{key:s,value:r,ts:l}),t.lastOp={ok:!0,text:`write(${s}=${r}) accepted by primary @ t=${l}`}),this.lastResult={kind:"write",ok:!0,nodeId:t.id,key:s,value:r,text:`CP write(${s}=${r}) committed on primary with ${i.size}/${this.N} quorum`},{ok:!0,ts:l}}_cpRead(t,s){const r=this.nodes[0];if(t.id!==0&&this._crossesPartition(t.id,0))return t.lastOp={ok:!1,text:`read(${s}) rejected: cannot reach primary (partitioned)`},this.lastResult={kind:"read",ok:!1,nodeId:t.id,key:s,text:`CP read(${s}) on N${t.id} rejected: minority side cannot reach primary`},{ok:!1,reason:"partitioned from primary"};t.id!==0&&this._emit(t.id,0,"ReadForward",{key:s});const o=r.kv[s];t.id!==0&&this._emit(0,t.id,"ReadReply",{key:s,value:o?o.value:null});const i=o?o.value:null;return t.lastOp={ok:!0,text:`read(${s}) -> ${JSON.stringify(i)}`},this.lastResult={kind:"read",ok:!0,nodeId:t.id,key:s,value:i,text:`CP read(${s}) on N${t.id} -> ${JSON.stringify(i)} (via primary)`},{ok:!0,value:i}}_apWrite(t,s,r){const o=t.kv[s],a={...o?o.vc:{}};a[t.id]=(a[t.id]||0)+1;const l=this._msgCounter();t.kv[s]={value:r,vc:a,ts:l},t.lastOp={ok:!0,text:`accepted local write(${s}=${r}) vc=${Yn(a)}`};for(const d of this.nodes)d.id!==t.id&&this._emit(t.id,d.id,"Replicate",{key:s,value:r,vc:{...a},ts:l});return this.lastResult={kind:"write",ok:!0,nodeId:t.id,key:s,value:r,text:`AP write(${s}=${r}) accepted at N${t.id} vc=${Yn(a)} (replicating async)`},{ok:!0,vc:a}}_apRead(t,s){const r=t.kv[s],o=r?r.value:null;return t.lastOp={ok:!0,text:`read(${s}) -> ${JSON.stringify(o)}${r&&r.siblings?` (siblings x${r.siblings.length})`:""}`},this.lastResult={kind:"read",ok:!0,nodeId:t.id,key:s,value:o,text:`AP read(${s}) on N${t.id} -> ${JSON.stringify(o)}${r&&r.vc?` vc=${Yn(r.vc)}`:""}${r&&r.siblings?" [siblings present]":""}`},{ok:!0,value:o,siblings:r&&r.siblings}}_emit(t,s,r,o){this.messages.push({id:++this._msgId,from:t,to:s,type:r,progress:0,payload:o,rejected:!1})}_deliver(t){const s=this.nodes[t.to];if(s&&t.type==="Replicate"){const{key:r,value:o,ts:i,vc:a}=t.payload;if(this.mode==="cp"){const l=s.kv[r];(!l||l.ts<i)&&(s.kv[r]={value:o,ts:i})}else{const l=s.kv[r];if(!l)s.kv[r]={value:o,vc:{...a},ts:i};else{const d=Gn(l.vc,a);if(d==="lt"||d==="eq")s.kv[r]={value:o,vc:{...a},ts:i};else if(d==="co"){const c=l.ts>=i?l:{value:o,vc:a,ts:i},p=(l.siblings||[{...l}]).slice();p.push({value:o,vc:{...a},ts:i}),s.kv[r]={...c,siblings:p}}}}}}_crossesPartition(t,s){if(!this.partition)return!1;const{setA:r,setB:o}=this.partition,i=r.has(t),a=o.has(s),l=r.has(s),d=o.has(t);return i&&a||d&&l}_reachableFrom(t){const s=new Set([t]);if(!this.partition){for(let a=0;a<this.N;a++)s.add(a);return s}const{setA:r,setB:o}=this.partition,i=r.has(t)?r:o;for(const a of i)s.add(a);return s}_msgCounter(){return this._tsJitter=(this._tsJitter||0)+1,Math.floor(this.simTime)*1e3+this._tsJitter}_fail(t,s,r,o,i){return this.lastResult={kind:s,ok:!1,nodeId:t,key:r,value:o,text:`${s} failed on N${t}: ${i}`},{ok:!1,reason:i}}snapshot(){return{mode:this.mode,N:this.N,simTime:this.simTime,partitioned:!!this.partition,partition:this.partition?{setA:[...this.partition.setA],setB:[...this.partition.setB]}:null,nodes:this.nodes.map(t=>({id:t.id,role:t.role,kv:Object.fromEntries(Object.entries(t.kv).map(([s,r])=>[s,{...r}])),lastOp:t.lastOp,recovering:t.recovering,canServe:this._canServe(t),side:this._sideOf(t.id)})),messages:this.messages.map(t=>({...t})),lastResult:this.lastResult,mergeCallout:this.mergeCallout,pendingHeals:this.pendingHeals.slice()}}_sideOf(t){return this.partition?this.partition.setA.has(t)?"A":this.partition.setB.has(t)?"B":null:null}_canServe(t){if(this.mode==="ap"||!this.partition)return!0;const s=this._sideOf(t.id),r=this._sideOf(0);if(s!==r)return!1;const o=s==="A"?this.partition.setA:this.partition.setB,i=Math.floor(this.N/2)+1;return o.size>=i}}
function Yn(n){return"["+Object.entries(n).sort((s,r)=>Number(s[0])-Number(r[0])).map(([s,r])=>`N${s}:${r}`).join(",")+"]"}
const Xn=[{id:"cp-blocked-writes",label:"CP: minority writes are rejected",description:"CP mode. Partition N0 | N1,N2 (primary stranded alone). Try writing on both sides. The primary side has no quorum either (1/3), so every write is rejected. CP picks C over A.",steps:[{op:"mode",value:"cp"},{op:"write",node:0,key:"x",value:1},{op:"partition",a:[0],b:[1,2]},{op:"write",node:0,key:"x",value:2},{op:"write",node:1,key:"x",value:99},{op:"read",node:1,key:"x"},{op:"heal"},{op:"read",node:1,key:"x"}]},{id:"cp-majority-writes",label:"CP: majority side still writes (primary with 1 follower)",description:"CP mode. Partition N2 | N0,N1. Primary keeps quorum (2/3), writes succeed. N2 is isolated and rejects.",steps:[{op:"mode",value:"cp"},{op:"write",node:0,key:"x",value:1},{op:"partition",a:[0,1],b:[2]},{op:"write",node:0,key:"x",value:2},{op:"read",node:2,key:"x"},{op:"heal"},{op:"read",node:2,key:"x"}]},{id:"ap-divergence",label:"AP: both sides accept; heal produces siblings",description:"AP mode. Partition N0 | N1,N2. Each side writes a different value to the same key. Both reads succeed. On heal, concurrent vector clocks produce siblings; last-write-wins picks one.",steps:[{op:"mode",value:"ap"},{op:"write",node:0,key:"x",value:"apple"},{op:"partition",a:[0],b:[1,2]},{op:"write",node:0,key:"x",value:"avocado"},{op:"write",node:1,key:"x",value:"banana"},{op:"read",node:0,key:"x"},{op:"read",node:2,key:"x"},{op:"heal"},{op:"read",node:0,key:"x"}]},{id:"ap-lww",label:"AP: last-write-wins (sequential causality)",description:"AP mode. Partition N0 | N1,N2. Side B writes, then reads propagate only within B. On heal, B side dominates (causal, not concurrent) so its value wins without siblings.",steps:[{op:"mode",value:"ap"},{op:"write",node:1,key:"k",value:"one"},{op:"partition",a:[0],b:[1,2]},{op:"write",node:1,key:"k",value:"two"},{op:"write",node:2,key:"k",value:"three"},{op:"read",node:0,key:"k"},{op:"heal"},{op:"read",node:0,key:"k"}]}],La=620,Fa=360,Hr=32,pe={primary:"#d27c2a",secondary:"#4a8fd8",apAlive:"#3fbf7f",cannotServe:"#6b4a4a",recovering:"#f5c542",partition:"#ff6b6b",msgReject:"#ff6b6b",warn:"#f5c542"},jh={Replicate:"#4a8fd8",WriteForward:"#d27c2a",WriteAck:"#9dd8b8",ReadForward:"#a15cff",ReadReply:"#d6b8ff"};
function Sh(){const n=La/2,t=Fa/2+10,s=130,r=[];for(let o=0;o<3;o++){const i=-Math.PI/2+o*2*Math.PI/3;r.push({x:n+s*Math.cos(i),y:t+s*Math.sin(i)})}return r}
const Jn=[{id:"0|12",a:[0],b:[1,2],label:"[N0] | [N1,N2]"},{id:"1|02",a:[1],b:[0,2],label:"[N1] | [N0,N2]"},{id:"2|01",a:[2],b:[0,1],label:"[N2] | [N0,N1]"}];
function $h(n){const t=Object.keys(n);return t.length===0?"(empty)":t.map(s=>{const r=n[s],o=JSON.stringify(r.value);if(r.vc){const i=Object.entries(r.vc).sort().map(([a,l])=>`N${a}:${l}`).join(",");return`${s}=${o} [${i}]`}return`${s}=${o}`}).join("; ")}
const Wi=`
.cap-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.cap-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.cap-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.cap-mode-toggle {
  display: inline-flex;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
  margin-right: 8px;
}
.cap-mode-toggle button {
  background: #1a1f26;
  color: #8a95a3;
  border: none;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}
.cap-mode-toggle button.active {
  background: #2c5aa0;
  color: #fff;
  font-weight: 600;
}
.cap-mode-toggle button.active.ap {
  background: #6c3ba0;
}
.cap-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.cap-toolbar select,
.cap-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.cap-toolbar input[type="text"] { width: 70px; }
.cap-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.cap-toolbar button:hover { background: #232a33; }
.cap-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.cap-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.cap-toolbar button.primary:hover { background: #3467b0; }
.cap-toolbar button.danger {
  background: #8b2a2a;
  border-color: #a03333;
}
.cap-toolbar button.danger:hover { background: #a03434; }
.cap-toolbar button.accent {
  background: #6c3ba0;
  border-color: #7f4cb0;
}
.cap-toolbar button.accent:hover { background: #7a4ab0; }
.cap-toolbar .spacer { flex: 1; }
.cap-toolbar label {
  font-size: 12px;
  color: #8a95a3;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.cap-main {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 12px;
}
.cap-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.cap-node-panels {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.cap-node-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
}
.cap-node-card.side-A { border-left: 3px solid #d27c2a; }
.cap-node-card.side-B { border-left: 3px solid #4a8fd8; }
.cap-node-card.cannotServe { background: #1f1414; }
.cap-node-card .hdr {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  font-weight: 600;
}
.cap-node-card .kv {
  color: #cfd6e0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.cap-node-card .kv .empty { color: #555; }
.cap-node-card .lastop {
  font-size: 11px;
  color: #8a95a3;
  margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cap-node-card .lastop.ok { color: #9dd8b8; }
.cap-node-card .lastop.bad { color: #ff9a9a; }
.cap-node-card .node-ctrls {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.cap-node-card .node-ctrls button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.cap-node-card .node-ctrls button:hover { background: #232a33; }
.cap-node-card .node-ctrls input {
  width: 38px;
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
  font-family: ui-monospace, Menlo, monospace;
}
.cap-status {
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
.cap-status.error { color: #ff9a9a; }
.cap-status.warn { color: #f5c542; }
.cap-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.cap-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.cap-merge-callout {
  margin-top: 8px;
  background: #2a2416;
  border: 1px solid #a57d18;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  color: #f0d9a0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cap-merge-callout .title {
  font-weight: 700;
  color: #f5c542;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 11px;
}
.cap-merge-callout .row { margin-bottom: 2px; }
.cap-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  color: #cfd6e0;
}
.cap-footer table {
  border-collapse: collapse;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.cap-footer th, .cap-footer td {
  border: 1px solid #2a3038;
  padding: 4px 8px;
  text-align: left;
}
.cap-footer th {
  background: #1a1f26;
  color: #8a95a3;
  font-weight: 600;
}
.cap-footer .yes { color: #9dd8b8; }
.cap-footer .no { color: #ff9a9a; }
.cap-widget svg text { user-select: none; }
`;
function Nh(){var I;const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState("cp"),[i,a]=h.useState(null),[l,d]=h.useState(!0),[c,p]=h.useState(Jn[0].id),[m,g]=h.useState(""),[w,C]=h.useState("x"),[j,$]=h.useState("1"),[O,q]=h.useState("x");h.useEffect(()=>{n.current=new qi({mode:r,nodeCount:3,seed:Math.floor(Math.random()*1e9)}),a(n.current.snapshot())},[t]),h.useEffect(()=>{const S=n.current;S&&S.mode!==r&&(S.setMode(r),a(S.snapshot()))},[r]);const R=h.useCallback(()=>{const S=n.current;S&&(S.tick(50),a(S.snapshot()))},[]);h.useEffect(()=>{if(!l)return;const S=setInterval(R,60);return()=>clearInterval(S)},[l,R]);const D=h.useCallback(()=>{const S=n.current;if(!S)return;const H=Jn.find(M=>M.id===c);H&&(S.partitionSplit(H.a,H.b),a(S.snapshot()))},[c]),B=h.useCallback(()=>{const S=n.current;S&&(S.heal(),a(S.snapshot()))},[]),V=h.useCallback(S=>{const H=n.current;if(!H)return;const M=w.trim();if(!M)return;let k=j;k!==""&&!isNaN(Number(k))&&(k=Number(k)),H.write(S,M,k),a(H.snapshot())},[w,j]),T=h.useCallback(S=>{const H=n.current;if(!H)return;const M=O.trim();M&&(H.read(S,M),a(H.snapshot()))},[O]),_=h.useCallback(S=>{const H=Xn.find(N=>N.id===S);if(!H)return;const M=new qi({mode:"cp",nodeCount:3,seed:7});n.current=M,a(M.snapshot());let k=0;const P=()=>{if(k>=H.steps.length)return;const N=H.steps[k++],z=n.current;if(z){switch(N.op){case"mode":z.setMode(N.value),o(N.value);break;case"partition":z.partitionSplit(N.a,N.b);break;case"heal":z.heal();break;case"write":z.write(N.node,N.key,N.value);break;case"read":z.read(N.node,N.key);break}a(z.snapshot()),setTimeout(P,1100)}};setTimeout(P,200)},[]),b=h.useMemo(()=>Sh(),[]);if(!i)return e.jsxs("div",{className:"cap-widget",children:[e.jsx("style",{children:Wi}),e.jsx("h2",{children:"CAP under partition"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const x=i.lastResult,f=x&&x.text||"Idle. Try a write, then partition the cluster and write again.",u=x&&(x.ok===!1||x.kind==="write"&&x.ok===!1),y=i.partitioned,v=(()=>{if(!i.partition)return null;const{setA:S,setB:H}=i.partition,M=Q=>{const X=Q.map(U=>b[U]),ee=X.reduce((U,Z)=>U+Z.x,0)/X.length,F=X.reduce((U,Z)=>U+Z.y,0)/X.length;return{x:ee,y:F}},k=M(S),P=M(H),N=(k.x+P.x)/2,z=(k.y+P.y)/2,E=P.x-k.x,J=P.y-k.y,Y=Math.sqrt(E*E+J*J)||1,se=-J/Y,A=E/Y,K=160;return{x1:N+se*K,y1:z+A*K,x2:N-se*K,y2:z-A*K}})();return e.jsxs("div",{className:"cap-widget",children:[e.jsx("style",{children:Wi}),e.jsxs("h2",{children:[e.jsx("span",{children:"CAP under partition — System Design Primer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:()=>d(S=>!S),children:l?"Pause":"Auto-tick"}),e.jsx("button",{onClick:R,disabled:l,children:"Step"}),e.jsx("button",{onClick:()=>s(S=>S+1),children:"Reset"})]})]}),e.jsxs("p",{className:"sub",children:["3-node cluster. Under a network partition, you must pick"," ",e.jsx("b",{children:"C"})," (consistency) or ",e.jsx("b",{children:"A"})," (availability). CP rejects writes on any side that can't form a quorum. AP accepts writes on both sides and reconciles on heal."]}),e.jsxs("div",{className:"cap-toolbar",children:[e.jsxs("div",{className:"cap-mode-toggle",children:[e.jsx("button",{className:r==="cp"?"active":"",onClick:()=>o("cp"),children:"CP"}),e.jsx("button",{className:r==="ap"?"active ap":"",onClick:()=>o("ap"),children:"AP"})]}),e.jsxs("label",{children:["split:",e.jsx("select",{value:c,onChange:S=>p(S.target.value),disabled:y,children:Jn.map(S=>e.jsx("option",{value:S.id,children:S.label},S.id))})]}),e.jsx("button",{className:"danger",onClick:D,disabled:y,children:"Partition"}),e.jsx("button",{className:"primary",onClick:B,disabled:!y,children:"Heal"}),e.jsx("span",{className:"spacer"}),e.jsxs("label",{children:["scenario:",e.jsxs("select",{value:m,onChange:S=>{const H=S.target.value;g(H),H&&_(H)},children:[e.jsx("option",{value:"",children:"(pick a scenario...)"}),Xn.map(S=>e.jsx("option",{value:S.id,children:S.label},S.id))]})]})]}),e.jsxs("div",{className:"cap-toolbar",style:{marginTop:-4},children:[e.jsxs("label",{children:["write k:",e.jsx("input",{type:"text",value:w,onChange:S=>C(S.target.value)})]}),e.jsxs("label",{children:["v:",e.jsx("input",{type:"text",value:j,onChange:S=>$(S.target.value)})]}),e.jsxs("label",{children:["read k:",e.jsx("input",{type:"text",value:O,onChange:S=>q(S.target.value)})]}),e.jsx("span",{style:{color:"#8a95a3",fontSize:12},children:"Use per-node buttons in the right panel to issue ops."}),e.jsx("span",{className:"spacer"}),e.jsx("span",{style:{fontSize:12,color:y?pe.partition:"#8a95a3",fontFamily:"ui-monospace, Menlo, monospace"},children:y?`partitioned (${i.partition.setA.map(S=>"N"+S).join(",")} | ${i.partition.setB.map(S=>"N"+S).join(",")})`:"no partition"})]}),e.jsxs("div",{className:"cap-main",children:[e.jsxs("div",{className:"cap-canvas-wrap",children:[e.jsxs("svg",{width:La,height:Fa,children:[e.jsx("defs",{children:e.jsx("marker",{id:"caparrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),[0,1,2].map(S=>{const H=b[S],M=b[(S+1)%3];return e.jsx("line",{x1:H.x,y1:H.y,x2:M.x,y2:M.y,stroke:"#1e252e",strokeWidth:"1"},`edge-${S}`)}),v&&e.jsx("line",{x1:v.x1,y1:v.y1,x2:v.x2,y2:v.y2,stroke:pe.partition,strokeWidth:"2.5",strokeDasharray:"8 6",opacity:"0.9",children:e.jsx("title",{children:"network partition"})}),i.messages.map(S=>{const H=b[S.from],M=b[S.to],k=M.x-H.x,P=M.y-H.y,N=Math.sqrt(k*k+P*P)||1,z=-P/N,E=k/N,J=6,Y=z*J,se=E*J,A=Math.min(1,S.progress),K=H.x+Y+k*A,Q=H.y+se+P*A,X=S.type.endsWith("Ack")||S.type.endsWith("Reply"),ee=S.rejected?pe.msgReject:jh[S.type]||"#888",F=S.rejected?Math.max(0,S.fade||1):.95;return e.jsxs("g",{children:[e.jsx("line",{x1:H.x+Y,y1:H.y+se,x2:M.x+Y,y2:M.y+se,stroke:ee,strokeOpacity:S.rejected?.1:.18,strokeWidth:"1",strokeDasharray:X?"3 3":void 0}),e.jsx("circle",{cx:K,cy:Q,r:X?3.5:5,fill:ee,opacity:F,children:e.jsx("title",{children:`${S.type} ${S.from}->${S.to}`+(S.rejected?" (dropped at partition)":"")})}),S.rejected&&e.jsx("text",{x:K+8,y:Q+4,fill:pe.msgReject,fontSize:"10",opacity:F,children:"x"})]},S.id)}),i.nodes.map(S=>{const H=b[S.id],M=S.role==="primary"&&i.mode==="cp";let k;S.canServe?i.mode==="cp"?k=M?pe.primary:pe.secondary:i.partitioned&&S.side==="A"?k="#d27c2a":i.partitioned&&S.side==="B"?k="#4a8fd8":k=pe.apAlive:k=pe.cannotServe;const P=S.recovering>0;return e.jsxs("g",{children:[P&&e.jsx("circle",{cx:H.x,cy:H.y,r:Hr+8,fill:"none",stroke:pe.recovering,strokeWidth:"3",opacity:S.recovering/800}),e.jsx("circle",{cx:H.x,cy:H.y,r:Hr,fill:k,stroke:M?"#f5c542":"#111",strokeWidth:M?3:2}),e.jsxs("text",{x:H.x,y:H.y-2,textAnchor:"middle",fill:"#111",fontSize:"14",fontWeight:"700",children:["N",S.id]}),e.jsx("text",{x:H.x,y:H.y+12,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"700",children:i.mode==="cp"?M?"PRIMARY":S.canServe?"SECONDARY":"MINORITY":"PEER"}),!S.canServe&&e.jsx("text",{x:H.x,y:H.y+Hr+14,textAnchor:"middle",fill:pe.partition,fontSize:"10",fontWeight:"600",children:"rejects ops"}),S.canServe&&e.jsx("text",{x:H.x,y:H.y+Hr+14,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:$h(S.kv).slice(0,36)})]},S.id)})]}),e.jsxs("div",{className:"cap-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.primary}})," ","primary (CP)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.secondary}})," ","secondary (CP)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.apAlive}})," ","peer (AP)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.cannotServe}})," ","rejecting (minority)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.msgReject}})," ","dropped @ partition"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:pe.recovering}})," ","recovering"]})]})]}),e.jsx("div",{className:"cap-node-panels",children:i.nodes.map(S=>{const H=S.side?` side-${S.side}`:"",M=S.canServe?"":" cannotServe",k=S.lastOp?S.lastOp.ok?"ok":"bad":"";return e.jsxs("div",{className:`cap-node-card${H}${M}`,children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:i.mode==="cp"&&S.role==="primary"?pe.primary:i.mode==="ap"?pe.apAlive:pe.secondary},children:["N",S.id," ",i.mode==="cp"?S.role.toUpperCase():"PEER"]}),e.jsx("span",{style:{color:S.canServe?"#8a95a3":pe.partition},children:S.canServe?"serving":"rejects ops"})]}),e.jsx("div",{className:"kv",children:Object.keys(S.kv).length===0?e.jsx("span",{className:"empty",children:"(empty store)"}):Object.entries(S.kv).map(([P,N])=>e.jsxs("div",{children:[P," = ",JSON.stringify(N.value)," ",N.vc&&e.jsxs("span",{style:{color:"#8a95a3"},children:["vc=[",Object.entries(N.vc).sort().map(([z,E])=>`N${z}:${E}`).join(","),"]"]}),N.ts&&!N.vc&&e.jsxs("span",{style:{color:"#8a95a3"},children:["@t=",N.ts]}),N.siblings&&N.siblings.length>0&&e.jsxs("div",{style:{color:pe.warn,fontSize:10,marginLeft:8},children:["siblings:"," ",N.siblings.map(z=>JSON.stringify(z.value)).join(" | ")]})]},P))}),S.lastOp&&e.jsxs("div",{className:`lastop ${k}`,children:[S.lastOp.ok?"ok:":"rejected:"," ",S.lastOp.text]}),e.jsxs("div",{className:"node-ctrls",children:[e.jsxs("button",{onClick:()=>V(S.id),children:["write(",w,"=",j,")"]}),e.jsxs("button",{onClick:()=>T(S.id),children:["read(",O,")"]})]})]},S.id)})})]}),e.jsx("div",{className:`cap-status ${u?"error":x&&x.kind==="heal"?"warn":""}`,children:f}),i.mergeCallout&&i.mergeCallout.kind==="ap-heal"&&e.jsxs("div",{className:"cap-merge-callout",children:[e.jsx("div",{className:"title",children:"AP merge on heal"}),i.mergeCallout.merges.map((S,H)=>e.jsxs("div",{className:"row",children:["key ",e.jsx("b",{children:S.key})," -> ",JSON.stringify(S.chosen.value)," ",e.jsxs("span",{style:{color:"#8a95a3"},children:["(",S.reason,")"]}),S.siblings&&S.siblings.length>0&&e.jsxs("span",{style:{color:pe.warn},children:[" ","siblings: [",S.siblings.map(M=>JSON.stringify(M.value)).join(" | "),"]"]})]},H))]}),i.mergeCallout&&i.mergeCallout.kind==="cp-heal"&&e.jsxs("div",{className:"cap-merge-callout",style:{background:"#152a1f",borderColor:"#2f7b50",color:"#9dd8b8"},children:[e.jsx("div",{className:"title",style:{color:"#9dd8b8"},children:"CP heal"}),e.jsx("div",{children:i.mergeCallout.text})]}),e.jsxs("div",{className:"cap-footer",children:[e.jsxs("div",{style:{marginBottom:6,color:"#8a95a3"},children:["Of the three CAP properties, you can only guarantee two when the network is partitioned. Under ",e.jsx("i",{children:"no"})," partition, C and A are both available."]}),e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"mode"}),e.jsx("th",{children:"Consistency"}),e.jsx("th",{children:"Availability"}),e.jsx("th",{children:"Partition-tolerance"}),e.jsx("th",{children:"examples"})]})}),e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:"CP"}),e.jsx("td",{className:"yes",children:"yes (strong)"}),e.jsx("td",{className:"no",children:"no during partition"}),e.jsx("td",{className:"yes",children:"yes"}),e.jsx("td",{children:"Raft, Zookeeper, HBase"})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"AP"}),e.jsx("td",{className:"no",children:"eventual only"}),e.jsx("td",{className:"yes",children:"yes"}),e.jsx("td",{className:"yes",children:"yes"}),e.jsx("td",{children:"Dynamo, Cassandra, CouchDB"})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"CA (no P)"}),e.jsx("td",{className:"yes",children:"yes"}),e.jsx("td",{className:"yes",children:"yes"}),e.jsx("td",{className:"no",children:"no (single-node only)"}),e.jsx("td",{children:"a single RDBMS"})]})]})]}),m&&e.jsxs("div",{style:{marginTop:8,fontSize:11,color:"#8a95a3",fontStyle:"italic"},children:["scenario:"," ",(I=Xn.find(S=>S.id===m))==null?void 0:I.description]})]})]})}

export default Nh;
export { Nh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Nh, {}));
  return () => root.unmount();
}
