import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const rt="#0f1419";
const Us="#1a1f2e";
const ye="#2a2f3e";
const ut="#e6e6e6";
const ve="#8a93a6";
const Ct="#4a7cff";
const $i="#f5c451";
const Ft="#f66";
const zo="#5cd894";
const tp=`
.pt-root {
  color: ${ut};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${rt};
}
.pt-panel {
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.pt-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${ye};
  flex-wrap: wrap;
}
.pt-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ut};
}
.pt-subtitle {
  font-size: 12px;
  color: ${ve};
  margin-top: 2px;
}
.pt-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.pt-label {
  color: ${ve};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.pt-label select {
  background: ${rt};
  border: 1px solid ${ye};
  color: ${ut};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.pt-toggle {
  display: inline-flex;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 5px;
  overflow: hidden;
}
.pt-toggle-opt {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: ${ve};
  font-size: 12px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-toggle-opt.active {
  background: ${Ct};
  color: white;
}
.pt-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${ye};
}
.pt-ctrl-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pt-btn {
  padding: 5px 12px;
  background: ${Ct};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.pt-btn:hover { filter: brightness(1.15); }
.pt-btn-good { background: ${zo}; color: ${rt}; }
.pt-btn-warn { background: ${$i}; color: ${rt}; }
.pt-btn-ghost {
  background: transparent;
  border: 1px solid ${ye};
  color: ${ut};
}
.pt-sep {
  width: 1px;
  height: 20px;
  background: ${ye};
}
.pt-lbl-mini {
  color: ${ve};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-mini {
  font-size: 11px;
  color: ${ve};
}
.pt-input {
  padding: 5px 8px;
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 4px;
  color: ${ut};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-input:focus {
  outline: none;
  border-color: ${Ct};
}
.pt-topo {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 12px 4px;
  border-bottom: 1px dashed ${ye};
}
.pt-topo-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
}
.pt-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: ${ve};
}
.pt-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.pt-nodes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${ye};
}
.pt-node {
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pt-node-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px dashed ${ye};
  padding-bottom: 4px;
}
.pt-node-id {
  font-weight: 700;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-node-sub {
  font-size: 10px;
  color: ${ve};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-node-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 280px;
  overflow-y: auto;
}
.pt-empty {
  color: ${ve};
  font-size: 11px;
  font-style: italic;
}
.pt-card {
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 5px;
  padding: 5px 7px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
}
.pt-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.pt-card-id {
  color: ${ut};
  font-weight: 700;
}
.pt-card-count {
  color: ${ve};
  font-size: 10px;
}
.pt-card-range {
  color: ${ve};
  font-size: 10px;
  margin-top: 1px;
  word-break: break-all;
}
.pt-qps-wrap {
  position: relative;
  height: 9px;
  background: ${ye};
  border-radius: 3px;
  margin-top: 4px;
  overflow: visible;
}
.pt-qps-bar {
  height: 100%;
  background: ${Ct};
  border-radius: 3px;
  transition: width 0.4s;
}
.pt-qps-hot {
  background: ${Ft};
}
.pt-qps-label {
  position: absolute;
  right: 2px;
  top: -1px;
  color: ${ve};
  font-size: 9px;
}
.pt-card-hot {
  border-color: ${Ft};
  animation: pt-pulse 1.3s ease-in-out infinite;
}
@keyframes pt-pulse {
  0%, 100% { box-shadow: 0 0 0 0 ${Ft}00; }
  50% { box-shadow: 0 0 0 3px ${Ft}55; }
}
.pt-card-flash {
  animation: pt-flash 0.8s ease-in-out;
  transform: translateX(0);
}
@keyframes pt-flash {
  0% { background: ${$i}; transform: scale(1.04); }
  100% { background: ${Us}; transform: scale(1); }
}
.pt-compare {
  margin-top: 12px;
  padding: 10px 12px;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 6px;
}
.pt-compare-title {
  color: ${ve};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 6px;
}
.pt-compare-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pt-compare-col {
  background: ${Us};
  padding: 8px 10px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pt-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 6px;
  font-size: 12px;
  color: ${ve};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-stats strong { color: ${ut}; font-weight: 600; margin-right: 2px; }
.pt-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.pt-teach-col {
  background: ${rt};
  border: 1px solid ${ye};
  border-left: 3px solid ${Ct};
  border-radius: 4px;
  padding: 8px 10px;
}
.pt-teach-title {
  font-size: 12px;
  font-weight: 700;
  color: ${ut};
  margin-bottom: 4px;
}
.pt-teach-body {
  font-size: 11px;
  color: ${ve};
  line-height: 1.5;
}
.pt-teach-body strong { color: ${ut}; }
.pt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  background: ${rt};
  border-left: 3px solid ${Ct};
  border-radius: 4px;
  font-size: 12px;
  color: ${ut};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Ct};
  box-shadow: 0 0 8px ${Ct};
  flex-shrink: 0;
}
`,Ni=new Set(["readCommitted","snapshot","serializable"]);
class sp{constructor({isolationLevel:t="readCommitted",initialRows:s={}}={}){if(!Ni.has(t))throw new Error(`unknown isolation level: ${t}`);this.isolationLevel=t,this.committed={};for(const[r,o]of Object.entries(s))this.committed[r]={value:o,lastCommitTxn:0,lastCommitTick:0};this._tick=0,this._snapshotSeq=0,this.txns={},this.locks={},this.keyWriters={},this.log=[]}setIsolationLevel(t){if(!Ni.has(t))throw new Error(`unknown isolation level: ${t}`);this.isolationLevel=t}begin(t){return this.txns[t]?(this._logEvent({type:"error",txn:t,msg:`txn ${t} already exists`}),{ok:!1,error:"txn already exists"}):(this._snapshotSeq+=1,this.txns[t]={id:t,status:"active",snapshotTick:this._tick,snapshotSeq:this._snapshotSeq,writes:{},reads:[],readKeys:new Set,readRanges:new Set,committedAtTick:null,abortReason:null},this._logEvent({type:"begin",txn:t,level:this.isolationLevel,snapshotTick:this._tick}),{ok:!0})}read(t,s){const r=this._requireActive(t);if(!r)return{ok:!1,error:"no active txn"};const o=typeof s=="string"?{key:s}:s||{};return o.range!==void 0?this._readRange(r,o.range):this._readKey(r,o.key)}write(t,s,r){const o=this._requireActive(t);if(!o)return{ok:!1,error:"no active txn"};const i=this.locks[s];return i!==void 0&&i!==t?(this._logEvent({type:"writeBlocked",txn:t,key:s,blockedBy:i,note:"write lock held (prevents dirty write)"}),{ok:!1,error:"blocked",blockedBy:i}):(this.locks[s]=t,o.writes[s]=r,this._logEvent({type:"write",txn:t,key:s,value:r,note:"staged uncommitted write; row lock acquired"}),{ok:!0})}commit(t){const s=this._requireActive(t);if(!s)return{ok:!1,error:"no active txn"};if(this.isolationLevel==="snapshot")for(const i of Object.keys(s.writes)){const a=this.committed[i];if(a&&a.lastCommitTick>s.snapshotTick)return this._abort(s,"lost-update",{key:i,conflictingTxn:a.lastCommitTxn})}else if(this.isolationLevel==="serializable"){const i=Object.keys(s.writes).length>0;for(const a of Object.keys(s.writes)){const l=this.committed[a];if(l&&l.lastCommitTick>s.snapshotTick)return this._abort(s,"lost-update",{key:a,conflictingTxn:l.lastCommitTxn})}if(i){for(const a of s.readKeys){const l=this.committed[a];if(l&&l.lastCommitTick>s.snapshotTick)return this._abort(s,"write-skew",{key:a,conflictingTxn:l.lastCommitTxn})}for(const a of s.readRanges)for(const[l,d]of Object.entries(this.committed))if(l.startsWith(a)&&d.lastCommitTick>s.snapshotTick)return this._abort(s,"write-skew",{key:l,range:a,conflictingTxn:d.lastCommitTxn})}}this._tick+=1;const r=this._tick,o=Object.keys(s.writes);for(const i of o)this.committed[i]={value:s.writes[i],lastCommitTxn:t,lastCommitTick:r},this.keyWriters[i]=t,this.locks[i]===t&&delete this.locks[i];return s.status="committed",s.committedAtTick=r,this._logEvent({type:"commit",txn:t,tick:r,writes:o.map(i=>({key:i,value:s.writes[i]}))}),{ok:!0,tick:r}}abort(t){const s=this.txns[t];return!s||s.status!=="active"?{ok:!1,error:"no active txn"}:this._abort(s,"user-abort",{})}snapshot(){const t={};for(const[r,o]of Object.entries(this.committed))t[r]=o.value;const s=Object.values(this.txns).map(r=>({id:r.id,status:r.status,snapshotTick:r.snapshotTick,reads:r.reads.map(o=>({...o})),writes:{...r.writes},abortReason:r.abortReason}));return{isolationLevel:this.isolationLevel,tick:this._tick,rows:t,activeTxns:s,locks:{...this.locks},log:this.log.map(r=>({...r}))}}_requireActive(t){const s=this.txns[t];return!s||s.status!=="active"?(this._logEvent({type:"error",txn:t,msg:`no active txn ${t}`}),null):s}_logEvent(t){this.log.push({seq:this.log.length,...t})}_readKey(t,s){if(Object.prototype.hasOwnProperty.call(t.writes,s)){const i=t.writes[s];return this._logEvent({type:"read",txn:t.id,key:s,value:i,source:"own-write"}),{ok:!0,value:i}}let r,o;if(this.isolationLevel==="readCommitted"){const i=this.committed[s];r=i?i.value:void 0,o="committed-latest"}else{const i=this.committed[s];i&&i.lastCommitTick<=t.snapshotTick?r=i.value:r=void 0,o="snapshot"}return t.reads.push({key:s,value:r,source:o,at:this._tick}),t.readKeys.add(s),this._logEvent({type:"read",txn:t.id,key:s,value:r,source:o}),{ok:!0,value:r}}_readRange(t,s){const r=[];if(this.isolationLevel==="readCommitted")for(const[o,i]of Object.entries(this.committed))o.startsWith(s)&&r.push({key:o,value:i.value});else for(const[o,i]of Object.entries(this.committed))o.startsWith(s)&&i.lastCommitTick<=t.snapshotTick&&r.push({key:o,value:i.value});for(const[o,i]of Object.entries(t.writes)){if(!o.startsWith(s))continue;const a=r.find(l=>l.key===o);a?a.value=i:r.push({key:o,value:i})}return r.sort((o,i)=>o.key<i.key?-1:o.key>i.key?1:0),t.reads.push({range:s,values:r.map(o=>({key:o.key,value:o.value})),at:this._tick,source:this.isolationLevel==="readCommitted"?"committed-latest":"snapshot"}),t.readRanges.add(s),this._logEvent({type:"readRange",txn:t.id,range:s,values:r.map(o=>({key:o.key,value:o.value})),source:this.isolationLevel==="readCommitted"?"committed-latest":"snapshot"}),{ok:!0,values:r}}_abort(t,s,r){t.status="aborted",t.abortReason=s;for(const o of Object.keys(t.writes))this.locks[o]===t.id&&delete this.locks[o];return this._logEvent({type:"abort",txn:t.id,reason:s,detail:r}),{ok:!1,error:"aborted",reason:s,detail:r}}}
const Po={anomalies:[{id:"dirty-read",name:"Dirty read"},{id:"dirty-write",name:"Dirty write"},{id:"non-repeatable-read",name:"Non-repeatable read"},{id:"phantom",name:"Phantom"},{id:"lost-update",name:"Lost update"},{id:"write-skew",name:"Write skew"}],levels:[{id:"readCommitted",name:"Read Committed"},{id:"snapshot",name:"Snapshot Isolation"},{id:"serializable",name:"Serializable"}],matrix:{"dirty-read":{readCommitted:!0,snapshot:!0,serializable:!0},"dirty-write":{readCommitted:!0,snapshot:!0,serializable:!0},"non-repeatable-read":{readCommitted:!1,snapshot:!0,serializable:!0},phantom:{readCommitted:!1,snapshot:!0,serializable:!0},"lost-update":{readCommitted:!1,snapshot:!0,serializable:!0},"write-skew":{readCommitted:!1,snapshot:!1,serializable:!0}}},Fr=[{id:"dirty-read",name:"Dirty read",anomaly:"dirty-read",describe:"T1 writes x but has not committed. Under a truly uncommitted read, T2 would see the dirty value. Read Committed and above prevent this.",initialRows:{x:2},steps:[{step:1,txn:"T1",op:"begin",narrate:"T1 begins"},{step:2,txn:"T2",op:"begin",narrate:"T2 begins"},{step:3,txn:"T1",op:"write",key:"x",value:3,narrate:"T1 writes x = 3 (not yet committed)"},{step:4,txn:"T2",op:"read",key:"x",narrate:"T2 reads x. Under Read Committed it still sees 2 (not T1's uncommitted 3). A dirty read would return 3."},{step:5,txn:"T1",op:"commit",narrate:"T1 commits. x = 3 is now the committed value."},{step:6,txn:"T2",op:"commit",narrate:"T2 commits."}]},{id:"non-repeatable-read",name:"Non-repeatable read",anomaly:"non-repeatable-read",describe:"T1 reads x, then T2 updates x and commits, then T1 reads x again. Under Read Committed T1 sees a different value on the second read (read skew). Snapshot isolation gives a consistent snapshot so the second read matches the first.",initialRows:{x:100},steps:[{step:1,txn:"T1",op:"begin",narrate:"T1 begins"},{step:2,txn:"T1",op:"read",key:"x",narrate:"T1 reads x -> 100"},{step:3,txn:"T2",op:"begin",narrate:"T2 begins"},{step:4,txn:"T2",op:"write",key:"x",value:200,narrate:"T2 writes x = 200"},{step:5,txn:"T2",op:"commit",narrate:"T2 commits x = 200"},{step:6,txn:"T1",op:"read",key:"x",narrate:"T1 reads x again. Read Committed -> 200 (ANOMALY: non-repeatable read). Snapshot -> 100 (consistent)."},{step:7,txn:"T1",op:"commit",narrate:"T1 commits."}]},{id:"phantom",name:"Phantom",anomaly:"phantom",describe:"T1 scans a range. T2 inserts a new row that matches the range and commits. T1 re-scans and sees a different set under Read Committed. Snapshot prevents this phantom.",initialRows:{on_call_alice:"true",on_call_bob:"true"},steps:[{step:1,txn:"T1",op:"begin",narrate:"T1 begins"},{step:2,txn:"T1",op:"readRange",range:"on_call_",narrate:"T1 scans on_call_* -> [alice, bob]"},{step:3,txn:"T2",op:"begin",narrate:"T2 begins"},{step:4,txn:"T2",op:"write",key:"on_call_carol",value:"true",narrate:"T2 inserts on_call_carol = true"},{step:5,txn:"T2",op:"commit",narrate:"T2 commits."},{step:6,txn:"T1",op:"readRange",range:"on_call_",narrate:"T1 re-scans on_call_*. Read Committed -> [alice, bob, carol] (ANOMALY: phantom). Snapshot -> [alice, bob]."},{step:7,txn:"T1",op:"commit",narrate:"T1 commits."}]},{id:"lost-update",name:"Lost update",anomaly:"lost-update",describe:"Two txns both read counter = 5, both compute 6, both write 6. Expected final value is 7. Snapshot detects this and aborts one; Read Committed allows the lost update.",initialRows:{counter:5},steps:[{step:1,txn:"T1",op:"begin",narrate:"T1 begins"},{step:2,txn:"T2",op:"begin",narrate:"T2 begins"},{step:3,txn:"T1",op:"read",key:"counter",narrate:"T1 reads counter -> 5"},{step:4,txn:"T2",op:"read",key:"counter",narrate:"T2 reads counter -> 5"},{step:5,txn:"T1",op:"write",key:"counter",value:6,narrate:"T1 writes counter = 6 (= 5 + 1)"},{step:6,txn:"T1",op:"commit",narrate:"T1 commits counter = 6"},{step:7,txn:"T2",op:"write",key:"counter",value:6,narrate:"T2 writes counter = 6 (still thinks it read 5). Snapshot: blocked by lock; Read Committed: overwrites."},{step:8,txn:"T2",op:"commit",narrate:"T2 commits. Read Committed -> counter = 6 (ANOMALY: lost update). Snapshot -> T2 aborted (first-updater-wins)."}]},{id:"write-skew-doctors",name:"Write skew (doctors)",anomaly:"write-skew",describe:"Two on-call doctors both decide they can go off-call because the other will stay. Each reads {alice: on, bob: on}, sees >=2 on call, and writes their own row to off. Both commit. Result: zero doctors on call — but the invariant is 'at least one'. Only Serializable prevents this.",initialRows:{on_call_alice:"true",on_call_bob:"true"},steps:[{step:1,txn:"T1",op:"begin",narrate:"T1 (Alice) begins"},{step:2,txn:"T2",op:"begin",narrate:"T2 (Bob) begins"},{step:3,txn:"T1",op:"readRange",range:"on_call_",narrate:"T1 reads on_call_* -> [alice: true, bob: true]. 2 on call, safe to go off."},{step:4,txn:"T2",op:"readRange",range:"on_call_",narrate:"T2 reads on_call_* -> [alice: true, bob: true]. 2 on call, safe to go off."},{step:5,txn:"T1",op:"write",key:"on_call_alice",value:"false",narrate:"T1 writes on_call_alice = false"},{step:6,txn:"T2",op:"write",key:"on_call_bob",value:"false",narrate:"T2 writes on_call_bob = false"},{step:7,txn:"T1",op:"commit",narrate:"T1 commits on_call_alice = false"},{step:8,txn:"T2",op:"commit",narrate:"T2 commits. Snapshot -> both commits succeed, 0 doctors on call (ANOMALY: write skew). Serializable -> SSI aborts T2: its read set (on_call_*) overlapped a concurrent commit."}]}],rp=[{id:"readCommitted",name:"Read Committed"},{id:"snapshot",name:"Snapshot Isolation"},{id:"serializable",name:"Serializable"}];
function np(n,t){var r;if(!n)return null;const s=(r=Po.matrix[n.anomaly])==null?void 0:r[t];return{anomalyId:n.anomaly,prevented:!!s}}
function fs(n){return n===void 0||n===null?"null":typeof n=="string"?`"${n}"`:String(n)}
function op(n){switch(n.op){case"begin":return"BEGIN";case"read":return`read(${n.key})`;case"readRange":return`scan(${n.range}*)`;case"write":return`write(${n.key}, ${fs(n.value)})`;case"commit":return"COMMIT";case"abort":return"ABORT";case"note":return"note";default:return n.op}}
function ip(n){return n?n.type==="abort"?"abort":n.type==="commit"?"commit":n.type==="writeBlocked"?"warn":n.type==="error"?"abort":n.type==="write"?"write":n.type==="read"||n.type==="readRange"?"read":"info":"info"}
function ap(n,t){if(!n)return t?t.narrate:"";switch(n.type){case"begin":return`${n.txn} begins (${n.level}, snapshot@tick=${n.snapshotTick})`;case"read":return`${n.txn} read ${n.key} -> ${fs(n.value)} [${n.source}]`;case"readRange":return`${n.txn} scan ${n.range}* -> [${n.values.map(s=>s.key).join(", ")||"∅"}] [${n.source}]`;case"write":return`${n.txn} staged ${n.key} = ${fs(n.value)} (lock acquired)`;case"writeBlocked":return`${n.txn} write ${n.key} BLOCKED by ${n.blockedBy} (row lock)`;case"commit":return`${n.txn} COMMIT @ tick=${n.tick} (${n.writes.map(s=>`${s.key}=${fs(s.value)}`).join(", ")||"no writes"})`;case"abort":return`${n.txn} ABORTED: ${n.reason}${n.detail&&n.detail.key?` on key ${n.detail.key}`:""}${n.detail&&n.detail.conflictingTxn?` (conflict with ${n.detail.conflictingTxn})`:""}`;case"error":return`${n.txn} error: ${n.msg}`;default:return JSON.stringify(n)}}
const lp=`
.iso-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 1100px;
}
.iso-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
}
.iso-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.iso-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.iso-toolbar .label {
  font-size: 11px;
  color: #8a95a3;
  margin-right: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.iso-toolbar .seg {
  display: inline-flex;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
}
.iso-toolbar .seg button {
  background: #1a1f26;
  color: #e6e6e6;
  border: none;
  border-right: 1px solid #3a4250;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.iso-toolbar .seg button:last-child { border-right: none; }
.iso-toolbar .seg button.active {
  background: #2c5aa0;
}
.iso-toolbar .seg button:hover:not(.active) { background: #232a33; }
.iso-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
.iso-toolbar button.action {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.iso-toolbar button.action:hover { background: #232a33; }
.iso-toolbar button.action.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.iso-toolbar button.action.primary:hover { background: #3467b0; }
.iso-toolbar button.action:disabled { opacity: 0.4; cursor: not-allowed; }
.iso-toolbar .spacer { flex: 1; }

.iso-scenario-desc {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #cfd6e0;
  margin-bottom: 12px;
  line-height: 1.5;
}

.iso-main {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.iso-col {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px;
  min-height: 260px;
}
.iso-col-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #2a3038;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.iso-col-title .status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}
.iso-col-title .status.active { background: #2c5aa0; color: #b6d4f0; }
.iso-col-title .status.committed { background: #1f5c3a; color: #b6f0c4; }
.iso-col-title .status.aborted { background: #6b2a2a; color: #f0b6b6; }
.iso-col-title .status.idle { background: #2a3038; color: #8a95a3; }

.iso-step {
  padding: 5px 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  border: 1px solid #2a3038;
  background: #161b22;
  color: #cfd6e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.iso-step.pending { opacity: 0.45; }
.iso-step.done { border-left: 3px solid #4a7cff; }
.iso-step.current {
  border-color: #f5c542;
  background: #2a1f0a;
  animation: iso-pulse 1.2s ease-in-out;
}
.iso-step.anomaly {
  border-color: #d94a6a;
  background: #2a0a15;
  animation: iso-flash 0.8s ease-in-out 2;
}
.iso-step .step-num {
  color: #8a95a3;
  font-size: 10px;
}
.iso-step .op {
  flex: 1;
}
.iso-step .val {
  color: #6be0a2;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

@keyframes iso-pulse {
  0% { box-shadow: 0 0 0 0 rgba(245, 197, 66, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(245, 197, 66, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 197, 66, 0); }
}
@keyframes iso-flash {
  0%, 100% { background: #2a0a15; }
  50% { background: #5a1a2a; }
}

.iso-state-rows {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.iso-state-rows th,
.iso-state-rows td {
  padding: 3px 6px;
  border-bottom: 1px solid #2a3038;
  text-align: left;
  vertical-align: top;
}
.iso-state-rows th {
  color: #8a95a3;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.iso-state-rows tr.uncommitted td { background: rgba(245, 197, 66, 0.08); }
.iso-state-rows td .v { color: #6be0a2; }
.iso-state-rows td .v.na { color: #8a95a3; font-style: italic; }
.iso-state-section {
  font-size: 11px;
  color: #8a95a3;
  margin-top: 8px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.iso-lock-row {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #f5c542;
  padding: 2px 0;
}

.iso-status {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-height: 34px;
  margin-bottom: 12px;
}
.iso-status.read { border-left: 3px solid #4a7cff; }
.iso-status.write { border-left: 3px solid #f5c542; }
.iso-status.commit { border-left: 3px solid #3a9c6a; }
.iso-status.abort { border-left: 3px solid #d94a6a; color: #f0b6b6; }
.iso-status.warn { border-left: 3px solid #f5c542; color: #ffd97a; }
.iso-anomaly-callout {
  background: #3a0a15;
  border: 1px solid #d94a6a;
  border-radius: 6px;
  padding: 8px 12px;
  color: #f0b6b6;
  font-size: 12px;
  margin-bottom: 12px;
  animation: iso-flash 0.8s ease-in-out 2;
}
.iso-anomaly-callout strong { color: #ffb3c1; }

.iso-matrix {
  margin-top: 12px;
  border: 1px solid #2a3038;
  border-radius: 6px;
  overflow: hidden;
}
.iso-matrix-title {
  padding: 6px 10px;
  background: #161b22;
  border-bottom: 1px solid #2a3038;
  font-size: 12px;
  color: #cfd6e0;
  font-weight: 600;
}
.iso-matrix table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.iso-matrix th,
.iso-matrix td {
  padding: 6px 10px;
  border-bottom: 1px solid #2a3038;
  text-align: center;
}
.iso-matrix th {
  background: #0f1419;
  color: #8a95a3;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.iso-matrix th.row-head,
.iso-matrix td.row-head {
  text-align: left;
  color: #cfd6e0;
  font-weight: 500;
}
.iso-matrix .cell-prev { color: #6be0a2; }
.iso-matrix .cell-allow { color: #ff8c9c; }
.iso-matrix td.hi,
.iso-matrix th.hi { background: rgba(245, 197, 66, 0.15); }
.iso-matrix td.hi-cell {
  background: rgba(245, 197, 66, 0.28);
  font-weight: 700;
  box-shadow: inset 0 0 0 2px #f5c542;
}
`;
function cp(n,t){return new sp({isolationLevel:t,initialRows:{...n.initialRows||{}}})}
function dp(n,t){if(!t||t.op==="note")return null;switch(n.log.length,t.op){case"begin":n.begin(t.txn);break;case"read":n.read(t.txn,t.key);break;case"readRange":n.read(t.txn,{range:t.range});break;case"write":n.write(t.txn,t.key,t.value);break;case"commit":n.commit(t.txn);break;case"abort":n.abort(t.txn);break;default:return null}return n.log[n.log.length-1]||null}
function pp(n){const t=[];for(const s of n.steps)s.txn&&!t.includes(s.txn)&&t.push(s.txn);return t}
function hp(){var x;const[n,t]=h.useState("readCommitted"),[s,r]=h.useState(Fr[0].id),[o,i]=h.useState(0),[a,l]=h.useState(!1),[d,c]=h.useState(0),p=h.useRef(null),m=h.useRef([]),g=h.useMemo(()=>Fr.find(f=>f.id===s)||Fr[0],[s]),w=h.useCallback(()=>{p.current=cp(g,n),m.current=g.steps.map(()=>null),i(0),l(!1),c(f=>f+1)},[g,n]);h.useEffect(()=>{w()},[w]);const C=h.useCallback(()=>{const f=p.current;if(!f)return;if(o>=g.steps.length){l(!1);return}const u=g.steps[o],y=dp(f,u);m.current[o]=y,i(v=>v+1),c(v=>v+1)},[g,o]);h.useEffect(()=>{if(!a)return;if(o>=g.steps.length){l(!1);return}const f=setTimeout(()=>{C()},900);return()=>clearTimeout(f)},[a,o,g,C]);const j=p.current?p.current.snapshot():null,$=m.current,O=h.useMemo(()=>pp(g),[g]);let q=null,R=null;for(let f=o-1;f>=0;f--)if($[f]){q=$[f],R=g.steps[f];break}const D=np(g,n),B=o>=g.steps.length;let V=!1;j&&B&&D&&!D.prevented&&(j.activeTxns.some(u=>u.status==="aborted")||(V=!0));const T=j&&j.activeTxns.some(f=>f.status==="aborted"),_={};if(j){for(const f of j.activeTxns)if(f.status==="active")for(const[u,y]of Object.entries(f.writes))_[u]||(_[u]=[]),_[u].push({txn:f.id,value:y})}const b=j?Array.from(new Set([...Object.keys(j.rows),...Object.keys(_)])).sort():[];return e.jsxs("div",{className:"iso-widget",children:[e.jsx("style",{children:lp}),e.jsx("h2",{children:"Isolation Levels & Anomalies — DDIA Ch 7"}),e.jsx("p",{className:"sub",children:"Weak isolation levels (Read Committed, Snapshot) leak some race conditions. Only Serializable kills them all. Pick a level and a scenario and step through."}),e.jsxs("div",{className:"iso-toolbar",children:[e.jsx("span",{className:"label",children:"level"}),e.jsx("div",{className:"seg",role:"tablist",children:rp.map(f=>e.jsx("button",{className:n===f.id?"active":"",onClick:()=>t(f.id),type:"button",children:f.name},f.id))}),e.jsx("span",{className:"label",children:"scenario"}),e.jsx("select",{value:s,onChange:f=>r(f.target.value),children:Fr.map(f=>e.jsx("option",{value:f.id,children:f.name},f.id))}),e.jsx("div",{className:"spacer"}),e.jsx("button",{className:"action primary",onClick:C,disabled:B,type:"button",children:"Step ▶"}),e.jsx("button",{className:"action",onClick:()=>l(f=>!f),disabled:B,type:"button",children:a?"Pause":"Auto-play"}),e.jsx("button",{className:"action",onClick:w,type:"button",children:"Reset"})]}),e.jsx("div",{className:"iso-scenario-desc",children:g.describe}),e.jsx("div",{className:`iso-status ${ip(q)}`,children:q?ap(q,R):"Press Step to begin. Each step runs one operation against the shared KV store."}),V&&e.jsxs("div",{className:"iso-anomaly-callout",children:[e.jsxs("strong",{children:["ANOMALY: ",(x=Po.anomalies.find(f=>f.id===g.anomaly))==null?void 0:x.name,"."]})," ",g.anomaly==="write-skew"&&"Both transactions based their writes on a read that was no longer true at commit time. Snapshot doesn't notice because each txn wrote a different key. Switch to Serializable and SSI will abort one txn on commit.",g.anomaly==="non-repeatable-read"&&"T1's second read returned a different value than its first. Snapshot Isolation pins reads to a consistent view at begin().",g.anomaly==="phantom"&&"T1's second range scan matched an extra row that was inserted by a concurrent committed txn. Snapshot pins the visible set.",g.anomaly==="lost-update"&&"Both txns read the same value and both wrote back value+1. One update was clobbered. Snapshot's first-updater-wins detection catches this automatically.",g.anomaly==="dirty-read"&&"T2 should not have seen T1's uncommitted value — but Read Uncommitted would have allowed it."]},`anom-${d}`),T&&!V&&e.jsxs("div",{className:"iso-anomaly-callout",style:{background:"#0a2a1a",borderColor:"#3a9c6a",color:"#b6f0c4"},children:[e.jsx("strong",{children:"Prevented."})," The database aborted a transaction (",j.activeTxns.filter(f=>f.status==="aborted").map(f=>`${f.id} (${f.abortReason})`).join(", "),") to stop the anomaly. The application must retry."]}),e.jsxs("div",{className:"iso-main",children:[e.jsx(Ci,{title:O[0]||"T1",txnId:O[0],scenario:g,stepIdx:o,events:$,snap:j}),e.jsxs("div",{className:"iso-col",children:[e.jsxs("div",{className:"iso-col-title",children:["Shared state ",e.jsxs("span",{className:"status idle",children:["tick ",j?j.tick:0]})]}),e.jsxs("table",{className:"iso-state-rows",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"key"}),e.jsx("th",{children:"committed"}),O.map(f=>e.jsxs("th",{children:[f," staged"]},f))]})}),e.jsxs("tbody",{children:[b.length===0&&e.jsx("tr",{children:e.jsx("td",{colSpan:2+O.length,style:{color:"#8a95a3",fontStyle:"italic"},children:"(empty)"})}),b.map(f=>{const u=!!_[f];return e.jsxs("tr",{className:u?"uncommitted":"",children:[e.jsx("td",{children:f}),e.jsx("td",{children:j&&Object.prototype.hasOwnProperty.call(j.rows,f)?e.jsx("span",{className:"v",children:fs(j.rows[f])}):e.jsx("span",{className:"v na",children:"—"})}),O.map(y=>{const v=(_[f]||[]).find(I=>I.txn===y);return e.jsx("td",{children:v?e.jsx("span",{className:"v",children:fs(v.value)}):e.jsx("span",{className:"v na",children:"—"})},y)})]},f)})]})]}),e.jsx("div",{className:"iso-state-section",children:"Row locks"}),j&&Object.keys(j.locks).length===0&&e.jsx("div",{className:"iso-lock-row",style:{color:"#8a95a3",fontStyle:"italic"},children:"(none)"}),j&&Object.entries(j.locks).map(([f,u])=>e.jsxs("div",{className:"iso-lock-row",children:["🔒 ",f," held by ",u]},f))]}),e.jsx(Ci,{title:O[1]||"T2",txnId:O[1],scenario:g,stepIdx:o,events:$,snap:j})]}),e.jsx(up,{scenario:g,level:n})]})}
function Ci({title:n,txnId:t,scenario:s,stepIdx:r,events:o,snap:i}){const a=i&&t?i.activeTxns.find(c=>c.id===t):null,l=a?a.status:"idle",d=a?a.status:"not started";return e.jsxs("div",{className:"iso-col",children:[e.jsxs("div",{className:"iso-col-title",children:[n,e.jsx("span",{className:`status ${l}`,children:d})]}),s.steps.map((c,p)=>{if(c.txn!==t)return null;const m=p<r,g=p===r-1,w=o[p],C=w&&w.type==="abort",$=["iso-step",m?"done":"pending",g?"current":"",g&&C?"anomaly":""].filter(Boolean).join(" ");let O=null;return m&&w&&(w.type==="read"?O=e.jsx("span",{className:"val",children:`-> ${fs(w.value)}`}):w.type==="readRange"?O=e.jsx("span",{className:"val",children:`-> [${w.values.map(q=>q.key).join(", ")||"∅"}]`}):w.type==="abort"?O=e.jsx("span",{className:"val",style:{color:"#ff8c9c"},children:`ABORT(${w.reason})`}):w.type==="commit"?O=e.jsx("span",{className:"val",style:{color:"#6be0a2"},children:"OK"}):w.type==="writeBlocked"&&(O=e.jsx("span",{className:"val",style:{color:"#ffd97a"},children:"BLOCKED"}))),e.jsxs("div",{className:$,children:[e.jsxs("span",{className:"step-num",children:["#",c.step]}),e.jsx("span",{className:"op",children:op(c)}),O]},p)})]})}
function up({scenario:n,level:t}){const{anomalies:s,levels:r,matrix:o}=Po;return e.jsxs("div",{className:"iso-matrix",children:[e.jsx("div",{className:"iso-matrix-title",children:"Anomaly prevention matrix — current scenario/level highlighted"}),e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{className:"row-head",children:"Anomaly"}),r.map(i=>e.jsx("th",{className:i.id===t?"hi":"",children:i.name},i.id))]})}),e.jsx("tbody",{children:s.map(i=>{const a=i.id===n.anomaly;return e.jsxs("tr",{children:[e.jsx("td",{className:`row-head ${a?"hi":""}`,children:i.name}),r.map(l=>{const d=o[i.id][l.id],c=a&&l.id===t,p=[d?"cell-prev":"cell-allow",c?"hi-cell":a||l.id===t?"hi":""].filter(Boolean).join(" ");return e.jsx("td",{className:p,children:d?"✅ prevented":"❌ allowed"},l.id)})]},i.id)})})]})]})}

export default hp;
export { hp as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(hp, {}));
  return () => root.unmount();
}
