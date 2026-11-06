import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Kt="#0f1419";
const js="#1a1f2e";
const xe="#2a2f3e";
const ge="#e6e6e6";
const gt="#8a93a6";
const Be="#4a7cff";
const Qt="#f5c451";
const hr="#f66";
const Fo="#5cd894";
function Wn({name:n,color:t,costLabel:s,result:r,touchedCount:o}){var l;const i=r==null?void 0:r.error,a=((l=r==null?void 0:r.result)==null?void 0:l.length)??0;return e.jsxs("div",{className:"dm-rb",style:{borderLeftColor:t},children:[e.jsxs("div",{className:"dm-rb-head",children:[e.jsx("span",{className:"dm-mono",style:{color:t},children:n}),e.jsxs("span",{className:"dm-mini",children:[s," · ",o," touched"]})]}),e.jsx("div",{className:"dm-rb-body",children:i?e.jsxs("span",{style:{color:hr},children:["⚠ ",i]}):r?e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"dm-rb-count",children:[a," result",a===1?"":"s"]}),a>0&&e.jsxs("span",{className:"dm-rb-values",children:[r.result.slice(0,6).map((d,c)=>e.jsx("span",{className:"dm-pill",children:typeof d=="object"?JSON.stringify(d):String(d)},c)),a>6&&e.jsx("span",{className:"dm-mini",children:"…"})]})]}):e.jsx("span",{className:"dm-mini",children:"—"})})]})}
const Hp=`
.dm-root {
  color: ${ge};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Kt};
}
.dm-panel {
  background: ${js};
  border: 1px solid ${xe};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1600px;
  margin: 0 auto;
}
.dm-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${xe};
  flex-wrap: wrap;
}
.dm-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ge};
}
.dm-subtitle {
  font-size: 12px;
  color: ${gt};
  margin-top: 2px;
}
.dm-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.dm-qpanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid ${xe};
}
.dm-qpresets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dm-qinputs {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dm-qrow {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dm-lbl-mini {
  color: ${gt};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-width: 64px;
}
.dm-input {
  flex: 1;
  padding: 5px 8px;
  background: ${Kt};
  border: 1px solid ${xe};
  border-radius: 4px;
  color: ${ge};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-input:focus { outline: none; border-color: ${Be}; }
.dm-btn {
  padding: 5px 12px;
  background: ${Be};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.dm-btn:hover { filter: brightness(1.15); }
.dm-btn-good { background: ${Fo}; color: ${Kt}; }
.dm-btn-ghost {
  background: transparent;
  border: 1px solid ${xe};
  color: ${ge};
}
.dm-btn-ghost.active {
  border-color: ${Be};
  background: ${Be}22;
  color: ${ge};
}
.dm-sep {
  width: 1px;
  height: 20px;
  background: ${xe};
  margin: 0 4px;
}
.dm-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
}
.dm-mini {
  font-size: 11px;
  color: ${gt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dm-result-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${xe};
}
.dm-rb {
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Be};
  border-radius: 5px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dm-rb-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}
.dm-rb-body {
  font-size: 12px;
  color: ${ge};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dm-rb-count { color: ${ge}; font-weight: 600; }
.dm-rb-values { display: flex; gap: 4px; flex-wrap: wrap; }
.dm-pill {
  background: ${js};
  border: 1px solid ${xe};
  padding: 1px 6px;
  border-radius: 9px;
  font-size: 11px;
  color: ${ge};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dm-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${xe};
  min-height: 440px;
}
.dm-col {
  background: ${Kt};
  border: 1px solid ${xe};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.dm-col-head {
  padding: 8px 10px;
  border-bottom: 1px solid ${xe};
  background: ${js};
}
.dm-col-title { font-weight: 700; font-size: 13px; color: ${ge}; }
.dm-col-sub { font-size: 11px; color: ${gt}; margin-top: 1px; }
.dm-col-body {
  padding: 8px 10px;
  overflow: auto;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Relational */
.dm-rel-table { display: flex; flex-direction: column; gap: 3px; }
.dm-rel-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 2px;
}
.dm-rel-scroll {
  overflow-x: auto;
  border: 1px solid ${xe};
  border-radius: 4px;
}
.dm-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-tbl th, .dm-tbl td {
  padding: 3px 6px;
  text-align: left;
  border-bottom: 1px solid ${xe};
  white-space: nowrap;
}
.dm-tbl th {
  color: ${gt};
  background: ${js};
  font-weight: 600;
}
.dm-tbl td { color: ${ge}; }
.dm-tbl tr.dm-tr-hot td {
  background: ${Qt}22;
  border-bottom-color: ${Qt}66;
  color: ${ge};
}

/* Document */
.dm-doc {
  border: 1px solid ${xe};
  border-radius: 4px;
  padding: 6px 8px;
  background: ${js};
  transition: border-color 0.2s, box-shadow 0.2s;
}
.dm-doc-hot {
  border-color: ${Qt};
  box-shadow: 0 0 0 1px ${Qt}44;
}
.dm-doc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
  padding-bottom: 3px;
  border-bottom: 1px dashed ${xe};
}
.dm-json {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: ${ge};
  line-height: 1.5;
}
.dm-json-row { padding-left: 8px; }
.dm-json-toggle {
  cursor: pointer;
  color: ${gt};
  user-select: none;
}
.dm-json-toggle:hover { color: ${ge}; }

/* Graph */
.dm-graph-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
}
.dm-graph-hover {
  margin-top: 4px;
  padding: 5px 8px;
  background: ${js};
  border: 1px solid ${xe};
  border-radius: 4px;
  font-size: 11px;
  color: ${ge};
  min-height: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Tradeoff + teaching + status */
.dm-tradeoff {
  margin-top: 12px;
  padding: 10px 14px;
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Qt};
  border-radius: 5px;
}
.dm-tradeoff-title {
  font-size: 11px;
  color: ${Qt};
  font-weight: 700;
  margin-bottom: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.dm-tradeoff-body {
  font-size: 12px;
  color: ${ge};
  line-height: 1.55;
}
.dm-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.dm-teach-col {
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Be};
  border-radius: 4px;
  padding: 8px 10px;
}
.dm-teach-title {
  font-size: 12px;
  font-weight: 700;
  color: ${ge};
  margin-bottom: 4px;
}
.dm-teach-body {
  font-size: 11px;
  color: ${gt};
  line-height: 1.5;
}
.dm-teach-body strong { color: ${ge}; }
.dm-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  background: ${Kt};
  border-left: 3px solid ${Be};
  border-radius: 4px;
  font-size: 11px;
  color: ${ge};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.55;
  word-break: break-word;
}
.dm-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Be};
  box-shadow: 0 0 8px ${Be};
  flex-shrink: 0;
}
`;
function Sr(n){if(n===null||typeof n!="object")return n;if(Array.isArray(n))return n.map(Sr);const t={};for(const s of Object.keys(n))t[s]=Sr(n[s]);return t}
function $o(n,t){const s={},r=new Set([...Object.keys(n),...Object.keys(t)]);for(const o of r){const i=n[o]||0,a=t[o]||0;s[o]=i>a?i:a}return s}
function No(n){let t=0;for(const s of Object.keys(n))t+=n[s];return t}
class bn{constructor({replicaId:t}={}){if(!t)throw new Error("GCounter requires replicaId");this.replicaId=t,this.counts={[t]:0}}increment(t=1){if(!Number.isFinite(t)||t<0)throw new Error("GCounter.increment: n must be a non-negative number");return this.counts[this.replicaId]=(this.counts[this.replicaId]||0)+t,this.value()}value(){return No(this.counts)}merge(t){if(!(t instanceof bn))throw new Error("GCounter.merge: other must be a GCounter");return this.counts=$o(this.counts,t.counts),this}state(){return{type:"gcounter",counts:Sr(this.counts)}}}
class Rr{constructor({replicaId:t}={}){if(!t)throw new Error("PnCounter requires replicaId");this.replicaId=t,this.P={[t]:0},this.N={[t]:0}}increment(t=1){if(!Number.isFinite(t)||t<0)throw new Error("PnCounter.increment: n must be a non-negative number");return this.P[this.replicaId]=(this.P[this.replicaId]||0)+t,this.value()}decrement(t=1){if(!Number.isFinite(t)||t<0)throw new Error("PnCounter.decrement: n must be a non-negative number");return this.N[this.replicaId]=(this.N[this.replicaId]||0)+t,this.value()}value(){return No(this.P)-No(this.N)}merge(t){if(!(t instanceof Rr))throw new Error("PnCounter.merge: other must be a PnCounter");return this.P=$o(this.P,t.P),this.N=$o(this.N,t.N),this}state(){return{type:"pncounter",P:Sr(this.P),N:Sr(this.N)}}}
class yn{constructor({replicaId:t}={}){if(!t)throw new Error("OrSet requires replicaId");this.replicaId=t,this._seq=0,this.adds=new Map,this.removes=new Set}_nextTag(){return this._seq+=1,{id:`${this.replicaId}:${this._seq}`,replica:this.replicaId,ts:this._seq}}add(t){const s=String(t),r=this._nextTag(),o=this.adds.get(s)||[];return o.push(r),this.adds.set(s,o),r}remove(t){const s=String(t),r=this.adds.get(s)||[],o=[];for(const i of r)this.removes.has(i.id)||(this.removes.add(i.id),o.push(i));return o}has(t){const s=String(t),r=this.adds.get(s)||[];for(const o of r)if(!this.removes.has(o.id))return!0;return!1}values(){const t=[];for(const[s,r]of this.adds.entries())for(const o of r)if(!this.removes.has(o.id)){t.push(s);break}return t.sort()}tagsFor(t){const s=String(t);return(this.adds.get(s)||[]).map(o=>({...o,tombstoned:this.removes.has(o.id)}))}merge(t){if(!(t instanceof yn))throw new Error("OrSet.merge: other must be an OrSet");for(const[s,r]of t.adds.entries()){const o=this.adds.get(s)||[],i=new Map(o.map(l=>[l.id,l]));for(const l of r)i.has(l.id)||i.set(l.id,{...l});const a=[...i.values()];a.sort((l,d)=>l.id<d.id?-1:l.id>d.id?1:0),this.adds.set(s,a)}for(const s of t.removes)this.removes.add(s);return this}state(){const t={};for(const[s,r]of this.adds.entries())t[s]=r.map(o=>({...o,tombstoned:this.removes.has(o.id)}));return{type:"orset",adds:t,removes:[...this.removes].sort()}}}
const Kp={gcounter:bn,pncounter:Rr,orset:yn};
class zi{constructor({replicaCount:t=3,type:s="gcounter"}={}){const r=Kp[s];if(!r)throw new Error(`unknown CRDT type: ${s}`);this.type=s,this.replicaCount=t,this.replicas=[];for(let o=0;o<t;o++){const i=`R${o+1}`;this.replicas.push({id:i,crdt:new r({replicaId:i})})}this.partitioned=null,this.history=[]}_log(t){this.history.push({t:this.history.length+1,...t}),this.history.length>200&&this.history.shift()}_find(t){const s=this.replicas.find(r=>r.id===t);if(!s)throw new Error(`unknown replica ${t}`);return s}_canSync(t,s){if(!this.partitioned)return!0;const{groupA:r,groupB:o}=this.partitioned,i=r.has(t)&&r.has(s),a=o.has(t)&&o.has(s);return i||a}op(t,s,...r){const i=this._find(t).crdt;let a=null;switch(s){case"increment":{i.increment(r[0]??1),a={op:s,replicaId:t,n:r[0]??1};break}case"decrement":{if(!(i instanceof Rr))throw new Error("decrement only available on PnCounter");i.decrement(r[0]??1),a={op:s,replicaId:t,n:r[0]??1};break}case"add":{const l=i.add(r[0]);a={op:s,replicaId:t,element:r[0],tag:l};break}case"remove":{const l=i.remove(r[0]);a={op:s,replicaId:t,element:r[0],killed:l};break}default:throw new Error(`unknown op ${s}`)}return this._log({kind:"op",...a,value:Bn(i)}),a}partition(t,s){const r=new Set(t),o=new Set(s);for(const i of r)if(o.has(i))throw new Error(`replica ${i} in both partitions`);return this.partitioned={groupA:r,groupB:o},this._log({kind:"partition",groupA:[...r],groupB:[...o]}),this.partitioned}heal(){const t=this.partitioned;this.partitioned=null,this._log({kind:"heal",was:t&&{groupA:[...t.groupA],groupB:[...t.groupB]}})}sync(t,s){if(t===s)return{blocked:!1,merged:!1,reason:"self"};const r=this._find(t),o=this._find(s);return this._canSync(t,s)?(o.crdt.merge(r.crdt),this._log({kind:"sync",fromId:t,toId:s,value:Bn(o.crdt)}),{blocked:!1,merged:!0}):(this._log({kind:"sync-blocked",fromId:t,toId:s}),{blocked:!0,merged:!1})}syncAll(){const t=[],s=this.replicas.map(r=>r.id);for(let r=0;r<s.length;r++)for(let o=0;o<s.length;o++)r!==o&&this._canSync(s[r],s[o])&&t.push([s[r],s[o]]);for(let r=0;r<2;r++)for(const[o,i]of t){const a=this._find(o);this._find(i).crdt.merge(a.crdt)}return this._log({kind:"sync-all",pairs:t}),{pairs:t}}snapshot(){return{type:this.type,replicas:this.replicas.map(t=>({id:t.id,state:t.crdt.state(),value:Bn(t.crdt)})),partitioned:this.partitioned?{groupA:[...this.partitioned.groupA],groupB:[...this.partitioned.groupB]}:null,history:this.history.slice(-40)}}}
function Bn(n){return n instanceof bn||n instanceof Rr?n.value():n instanceof yn?n.values():null}
const Up="#0f1419",Vp="#1a1f2e",pt="#2a3038",Ut="#e6e6e6",Rt="#8a95a3",Rs="#4a7cff",Hn="#5cd894",qr="#f5c451",cn="#f66",Gp={R1:"#4a8fd8",R2:"#f5a451",R3:"#a15cff"},Yp=`
.crdt-widget {
  background: ${Up};
  color: ${Ut};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid ${pt};
  border-radius: 8px;
  padding: 16px;
  max-width: 1040px;
}
.crdt-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.crdt-widget .sub {
  font-size: 12px;
  color: ${Rt};
  margin: 0 0 12px 0;
}
.crdt-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid ${pt};
  border-bottom: 1px solid ${pt};
  margin-bottom: 12px;
}
.crdt-toolbar label { font-size: 12px; color: ${Rt}; }
.crdt-toolbar .spacer { flex: 1; }
.crdt-toolbar button,
.crdt-widget button.btn {
  background: #1a1f26;
  color: ${Ut};
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.crdt-widget button.btn:hover,
.crdt-toolbar button:hover { background: #232a33; }
.crdt-widget button.btn.primary,
.crdt-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.crdt-widget button.btn.primary:hover,
.crdt-toolbar button.primary:hover { background: #3467b0; }
.crdt-widget button.btn.danger,
.crdt-toolbar button.danger {
  background: #8a2c2c;
  border-color: #a03c3c;
}
.crdt-widget button.btn.danger:hover,
.crdt-toolbar button.danger:hover { background: #a03333; }
.crdt-widget button.btn.warn,
.crdt-toolbar button.warn {
  background: #8a6b1c;
  border-color: #a3842a;
  color: #fdf1cf;
}
.crdt-widget button.btn:disabled,
.crdt-toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.crdt-widget input[type="text"] {
  background: #1a1f26;
  color: ${Ut};
  border: 1px solid ${pt};
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 12px;
  width: 70px;
}
.crdt-typepicker {
  display: inline-flex;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
}
.crdt-typepicker button {
  background: #1a1f26;
  color: ${Ut};
  border: none;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  border-right: 1px solid #3a4250;
}
.crdt-typepicker button:last-child { border-right: none; }
.crdt-typepicker button.active {
  background: ${Rs};
  color: #fff;
}
.crdt-scene {
  position: relative;
  background: #0a0e13;
  border: 1px solid ${pt};
  border-radius: 6px;
  padding: 16px 16px 12px;
}
.crdt-replicas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  position: relative;
  z-index: 2;
}
.crdt-replica {
  background: ${Vp};
  border: 1px solid ${pt};
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 220px;
}
.crdt-replica .rhdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
}
.crdt-replica .rhdr .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}
.crdt-replica .value {
  font-size: 24px;
  font-weight: 700;
  color: ${Hn};
  font-variant-numeric: tabular-nums;
}
.crdt-replica .value.tiny { font-size: 14px; color: ${Ut}; }
.crdt-replica .label {
  font-size: 11px;
  color: ${Rt};
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.crdt-replica .slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  font-size: 11px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.crdt-replica .slots .slot {
  background: #12161f;
  border: 1px solid ${pt};
  border-radius: 3px;
  padding: 3px 5px;
  text-align: center;
}
.crdt-replica .slots .slot.bumped {
  background: #1a2a1a;
  border-color: ${Hn};
}
.crdt-replica .pn-row { display: flex; gap: 6px; align-items: center; }
.crdt-replica .pn-row .pn-label {
  font-size: 10px;
  color: ${Rt};
  width: 14px;
}
.crdt-replica .pn-row .slots { flex: 1; }
.crdt-replica .btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; }
.crdt-replica .orset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}
.crdt-replica .orset-row .el {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: ${Ut};
  background: #12161f;
  border: 1px solid ${pt};
  border-radius: 3px;
  padding: 1px 6px;
  min-width: 28px;
  text-align: center;
}
.crdt-replica .orset-row .el.dead {
  color: ${Rt};
  text-decoration: line-through;
}
.crdt-tag {
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
}
.crdt-tag.tomb {
  text-decoration: line-through;
  opacity: 0.45;
}
.crdt-orset-empty {
  color: ${Rt};
  font-size: 11px;
  font-style: italic;
}
.crdt-midcontrols {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 8px;
  background: #0a0e13;
  border: 1px solid ${pt};
  border-radius: 6px;
}
.crdt-scenarios {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.crdt-status {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  background: #0a0e13;
  border: 1px solid ${pt};
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 10px;
  color: ${Ut};
  min-height: 32px;
  white-space: pre-wrap;
}
.crdt-status .muted { color: ${Rt}; }
.crdt-status .good  { color: ${Hn}; }
.crdt-status .warn  { color: ${qr}; }
.crdt-status .bad   { color: ${cn}; }
.crdt-teach {
  margin-top: 12px;
  background: #10151f;
  border: 1px solid ${pt};
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: ${Ut};
  line-height: 1.45;
}
.crdt-teach .title {
  font-weight: 600;
  margin-bottom: 4px;
  color: ${Rs};
}
.crdt-part-banner {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 11px;
  color: ${qr};
  background: rgba(245,196,81,0.08);
  border: 1px solid ${qr};
  border-radius: 4px;
  padding: 2px 8px;
  z-index: 3;
}
.crdt-merge-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
.crdt-merge-overlay .arrow path {
  fill: none;
  stroke: ${Rs};
  stroke-width: 2.5;
  stroke-dasharray: 6 4;
  opacity: 0;
  animation: crdt-merge-anim 620ms ease-in-out forwards;
}
.crdt-merge-overlay .arrow.blocked path {
  stroke: ${cn};
}
.crdt-merge-overlay .arrow circle {
  fill: ${Rs};
  opacity: 0;
  animation: crdt-merge-dot 620ms ease-in-out forwards;
}
.crdt-merge-overlay .arrow.blocked circle { fill: ${cn}; }
@keyframes crdt-merge-anim {
  0%   { opacity: 0; stroke-dashoffset: 40; }
  20%  { opacity: 1; }
  80%  { opacity: 1; stroke-dashoffset: 0; }
  100% { opacity: 0; stroke-dashoffset: 0; }
}
@keyframes crdt-merge-dot {
  0%   { opacity: 0; }
  30%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
.crdt-partbar {
  position: absolute;
  top: 40px;
  bottom: 40px;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    ${qr} 0 6px,
    transparent 6px 12px
  );
  z-index: 1;
}
`;
function Ss(n){return"{"+Object.keys(n).sort().map(s=>`${s}:${n[s]}`).join(", ")+"}"}
function $r(n){return Gp[n]||Rs}
function Xp({replica:n,bumpedSlot:t,onInc:s}){const r=n.state.counts,o=["R1","R2","R3"];return e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"label",children:"per-replica slots"}),e.jsx("div",{className:"slots",children:o.map(i=>e.jsxs("div",{className:"slot"+(t===i?" bumped":""),children:[e.jsx("div",{style:{color:$r(i),fontWeight:600},children:i}),e.jsx("div",{children:r[i]??0})]},i))}),e.jsx("div",{className:"label",children:"value = sum"}),e.jsx("div",{className:"value",children:n.value}),e.jsxs("div",{className:"btns",children:[e.jsx("button",{className:"btn primary",onClick:()=>s(1),children:"+1"}),e.jsx("button",{className:"btn primary",onClick:()=>s(5),children:"+5"})]})]})}
function Jp({replica:n,bumpedSlot:t,onInc:s,onDec:r}){const o=n.state.P,i=n.state.N,a=["R1","R2","R3"];return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"pn-row",children:[e.jsx("div",{className:"pn-label",children:"P"}),e.jsx("div",{className:"slots",children:a.map(l=>e.jsxs("div",{className:"slot"+(t==="P:"+l?" bumped":""),children:[e.jsx("div",{style:{color:$r(l),fontWeight:600},children:l}),e.jsx("div",{children:o[l]??0})]},l))})]}),e.jsxs("div",{className:"pn-row",children:[e.jsx("div",{className:"pn-label",children:"N"}),e.jsx("div",{className:"slots",children:a.map(l=>e.jsxs("div",{className:"slot"+(t==="N:"+l?" bumped":""),children:[e.jsx("div",{style:{color:$r(l),fontWeight:600},children:l}),e.jsx("div",{children:i[l]??0})]},l))})]}),e.jsx("div",{className:"label",children:"value = sum(P) − sum(N)"}),e.jsx("div",{className:"value",children:n.value}),e.jsxs("div",{className:"btns",children:[e.jsx("button",{className:"btn primary",onClick:()=>s(1),children:"+1"}),e.jsx("button",{className:"btn primary",onClick:()=>s(3),children:"+3"}),e.jsx("button",{className:"btn warn",onClick:()=>r(1),children:"−1"}),e.jsx("button",{className:"btn warn",onClick:()=>r(3),children:"−3"})]})]})}
function Qp({replica:n,inputValue:t,onInputChange:s,onAdd:r,onRemove:o}){const i=n.state.adds,a=Object.keys(i).sort();return e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"label",children:"elements and tags"}),a.length===0?e.jsx("div",{className:"crdt-orset-empty",children:"(empty)"}):a.map(l=>{const d=i[l],c=d.some(p=>!p.tombstoned);return e.jsxs("div",{className:"orset-row",children:[e.jsx("span",{className:"el"+(c?"":" dead"),children:l}),d.map(p=>e.jsx("span",{className:"crdt-tag"+(p.tombstoned?" tomb":""),style:{background:$r(p.replica)},title:(p.tombstoned?"tombstoned ":"live ")+p.id,children:p.id},p.id))]},l)}),e.jsx("div",{className:"label",children:"values"}),e.jsx("div",{className:"value tiny",children:n.value&&n.value.length?"{ "+n.value.join(", ")+" }":"∅"}),e.jsxs("div",{className:"btns",style:{alignItems:"center"},children:[e.jsx("input",{type:"text",value:t,onChange:l=>s(l.target.value),placeholder:"x"}),e.jsx("button",{className:"btn primary",onClick:r,children:"add"}),e.jsx("button",{className:"btn warn",onClick:o,children:"remove"})]})]})}
function Zp({arrows:n}){if(!n||n.length===0)return null;const t={R1:16.67,R2:50,R3:83.33},s=40;return e.jsxs("svg",{className:"crdt-merge-overlay",children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"crdt-arrow-head",markerWidth:"10",markerHeight:"10",refX:"7",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L0,6 L8,3 z",fill:Rs})}),e.jsx("marker",{id:"crdt-arrow-head-bad",markerWidth:"10",markerHeight:"10",refX:"7",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L0,6 L8,3 z",fill:cn})})]}),n.map(r=>{const o=t[r.from],i=t[r.to];if(o==null||i==null)return null;const a=i>o?1:-1,l=(o+i)/2,d=s-12*Math.abs(i-o)/66,c=`M ${o}% ${s}% Q ${l}% ${d}% ${i}% ${s}%`;return e.jsxs("g",{className:"arrow"+(r.blocked?" blocked":""),children:[e.jsx("path",{d:c,markerEnd:r.blocked?"url(#crdt-arrow-head-bad)":"url(#crdt-arrow-head)"}),e.jsx("circle",{r:"3",cx:`${o+a*4}%`,cy:`${s}%`})]},r.key)})]})}
// Local fix: after switching type, the first render saw the previous engine's state and crashed.
function eh(){const[n,t]=h.useState("gcounter"),[s,r]=h.useState(0),o=h.useRef(null),[i,a]=h.useState({text:"Ready. Pick a CRDT type and start mutating replicas.",tone:"muted"}),[l,d]=h.useState({R1:"x",R2:"x",R3:"x"}),[c,p]=h.useState({}),[m,g]=h.useState([]);h.useEffect(()=>{o.current=new zi({replicaCount:3,type:n}),r(y=>y+1),a({text:`Switched to ${Qs(n)}. 3 fresh replicas.`,tone:"muted"}),p({}),g([])},[n]);const w=o.current,C=h.useMemo(()=>w&&w.type===n?w.snapshot():null,[w,s,n]),j=h.useCallback((y,v=y)=>{p(I=>({...I,[y]:v})),setTimeout(()=>{p(I=>{const S={...I};return delete S[y],S})},450)},[]),$=h.useCallback(y=>{const v=y.map((I,S)=>({...I,key:`${I.from}-${I.to}-${Date.now()}-${S}`}));g(v),setTimeout(()=>g([]),700)},[]),O=()=>r(y=>y+1),q=(y,v)=>{w.op(y,"increment",v),j(y,n==="pncounter"?"P:"+y:y);const I=w.replicas.find(M=>M.id===y),S=I.crdt.state();let H;n==="gcounter"?H=Ss(S.counts):H=`P=${Ss(S.P)} N=${Ss(S.N)}`,a({text:`${y} inc(${v})  →  ${Qs(n)}: ${y}=${H}, value=${I.crdt.value()}`,tone:"good"}),O()},R=(y,v)=>{w.op(y,"decrement",v),j(y,"N:"+y);const I=w.replicas.find(H=>H.id===y),S=I.crdt.state();a({text:`${y} dec(${v})  →  PN-Counter: ${y} P=${Ss(S.P)} N=${Ss(S.N)}, value=${I.crdt.value()}`,tone:"warn"}),O()},D=y=>{const v=(l[y]||"").trim();if(!v)return;const I=w.op(y,"add",v);j(y),a({text:`OR-Set add('${v}') on ${y} [tag=${I.tag.id}]. Tag is globally unique so concurrent adds never collide.`,tone:"good"}),O()},B=y=>{const v=(l[y]||"").trim();if(!v)return;const I=w.op(y,"remove",v);j(y);const S=I.killed.length===0?"no local tags observed → nothing to tombstone":`tombstoned ${I.killed.length} tag(s): ${I.killed.map(H=>H.id).join(", ")}`;a({text:`OR-Set remove('${v}') on ${y} [${S}].`,tone:"warn"}),O()},V=(y,v)=>{const I=w.sync(y,v),S=w.sync(v,y),H=I.blocked||S.blocked;if($([{from:y,to:v,blocked:I.blocked},{from:v,to:y,blocked:S.blocked}]),H)a({text:`Sync ${y} ↔ ${v} BLOCKED by partition. Ops won't propagate until heal.`,tone:"bad"});else{const M=w.replicas.find(N=>N.id===v),k=M.crdt.state();let P;n==="gcounter"?P=`Sync ${y} ↔ ${v}: merge(max). ${v} became ${Ss(k.counts)}, value=${M.crdt.value()}.`:n==="pncounter"?P=`Sync ${y} ↔ ${v}: merge(max) on both P and N. ${v} value=${M.crdt.value()}.`:P=`Sync ${y} ↔ ${v}: merge = union(adds) − union(tombstones). ${v} values={${M.crdt.values().join(", ")}}.`,a({text:P,tone:"good"})}O()},T=()=>{if(!w)return;const{pairs:y}=w.syncAll(),v=y.map(([H,M])=>({from:H,to:M,blocked:!1}));$(v);const I=w.snapshot().replicas.map(H=>H.value),S=n==="orset"?JSON.stringify(I[0])===JSON.stringify(I[1])&&JSON.stringify(I[1])===JSON.stringify(I[2]):I[0]===I[1]&&I[1]===I[2];a({text:w.partitioned?"Sync all (within partitions). Cross-partition pairs skipped; replicas will reconverge after heal.":`Sync all (pairwise anti-entropy). ${S?"Replicas converged.":"Not yet converged."}  values=${JSON.stringify(I)}`,tone:S&&!w.partitioned?"good":"warn"}),O()},_=()=>{w.partition(["R1"],["R2","R3"]),a({text:"Partition [R1] | [R2, R3]. Incs on R1 won't reach R2/R3 until heal.",tone:"warn"}),O()},b=()=>{w.heal(),a({text:"Partition healed. Run 'Sync all' to let replicas exchange state and converge.",tone:"good"}),O()},x=()=>{o.current=new zi({replicaCount:3,type:n}),p({}),g([]),a({text:`Reset. 3 fresh ${Qs(n)} replicas.`,tone:"muted"}),O()},f=async y=>{const v=I=>new Promise(S=>setTimeout(S,I));if(y==="gconv"&&n==="gcounter"){x(),await v(300),q("R1",2),await v(320),q("R2",3),await v(320),q("R3",1),await v(320),_(),await v(320),q("R1",5),await v(320),q("R2",4),await v(320),b(),await v(320),T();return}if(y==="pnconc"&&n==="pncounter"){x(),await v(300),q("R1",10),await v(320),R("R2",4),await v(320),q("R3",2),await v(320),_(),await v(320),q("R1",3),await v(320),R("R3",1),await v(320),b(),await v(320),T(),a({text:"PN-Counter: concurrent incs and decs merge cleanly. value = 10 − 4 + 2 + 3 − 1 = 10. Ops don't cancel out; P and N each grow monotonically.",tone:"good"});return}if(y==="oradd"&&n==="orset"){x(),await v(300),d({R1:"x",R2:"x",R3:"x"}),D("R1"),await v(320),T(),await v(320),_(),await v(320),B("R1"),await v(320),D("R2"),await v(320),b(),await v(320),T(),await v(320),a({text:"OR-Set add-wins: R1 observed R1's old tag and tombstoned it, but R2's concurrent add created a brand-new tag R2:_ that R1 had never seen. After merge, R2's tag is live → 'x' is present. A naive set would have lost this add.",tone:"good"});return}a({text:`Scenario "${y}" is only meaningful for its matching CRDT type. Switch type first.`,tone:"warn"})};if(!w||!C)return null;const u=C.partitioned;return e.jsxs("div",{className:"crdt-widget",children:[e.jsx("style",{children:Yp}),e.jsxs("h2",{children:[e.jsx("span",{children:"CRDTs — Conflict-Free Replicated Data Types"}),e.jsx("span",{style:{fontSize:11,color:Rt,fontWeight:400},children:"DDIA Ch 9 + Shapiro et al."})]}),e.jsx("p",{className:"sub",children:"State-based CRDTs: every merge is commutative, associative and idempotent, so replicas converge no matter what order syncs arrive in. Unlike last-write-wins, no update is silently discarded; unlike consensus, no replica blocks on a partition."}),e.jsxs("div",{className:"crdt-toolbar",children:[e.jsx("label",{children:"Type:"}),e.jsx("div",{className:"crdt-typepicker",children:["gcounter","pncounter","orset"].map(y=>e.jsx("button",{className:n===y?"active":"",onClick:()=>t(y),children:Qs(y)},y))}),e.jsx("div",{className:"spacer"}),e.jsx("button",{className:"btn",onClick:x,children:"Reset"})]}),e.jsxs("div",{className:"crdt-scene",children:[u&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"crdt-part-banner",children:["PARTITION  [",u.groupA.join(","),"]  |  [",u.groupB.join(","),"]"]}),e.jsx("div",{className:"crdt-partbar",style:{left:"33.33%"}})]}),e.jsx("div",{className:"crdt-replicas",children:C.replicas.map(y=>e.jsxs("div",{className:"crdt-replica",children:[e.jsxs("div",{className:"rhdr",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:$r(y.id)}}),y.id]}),e.jsx("span",{style:{fontSize:10,color:Rt,fontWeight:400},children:"replica"})]}),n==="gcounter"&&e.jsx(Xp,{replica:y,bumpedSlot:c[y.id],onInc:v=>q(y.id,v)}),n==="pncounter"&&e.jsx(Jp,{replica:y,bumpedSlot:c[y.id],onInc:v=>q(y.id,v),onDec:v=>R(y.id,v)}),n==="orset"&&e.jsx(Qp,{replica:y,inputValue:l[y.id]||"",onInputChange:v=>d(I=>({...I,[y.id]:v})),onAdd:()=>D(y.id),onRemove:()=>B(y.id)})]},y.id))}),e.jsx(Zp,{arrows:m})]}),e.jsxs("div",{className:"crdt-midcontrols",children:[e.jsx("button",{className:"btn",onClick:()=>V("R1","R2"),children:"Sync R1 ↔ R2"}),e.jsx("button",{className:"btn",onClick:()=>V("R2","R3"),children:"Sync R2 ↔ R3"}),e.jsx("button",{className:"btn",onClick:()=>V("R1","R3"),children:"Sync R1 ↔ R3"}),e.jsx("button",{className:"btn primary",onClick:T,children:"Sync all"}),e.jsx("div",{className:"spacer",style:{flex:1}}),e.jsx("button",{className:"btn warn",onClick:_,disabled:!!u,children:"Partition R1 | R2,R3"}),e.jsx("button",{className:"btn",onClick:b,disabled:!u,children:"Heal partition"})]}),e.jsxs("div",{className:"crdt-scenarios",children:[e.jsx("span",{style:{fontSize:11,color:Rt,alignSelf:"center",marginRight:4},children:"Scenarios:"}),e.jsx("button",{className:"btn",onClick:()=>f("gconv"),disabled:n!=="gcounter",children:"G-Counter convergence"}),e.jsx("button",{className:"btn",onClick:()=>f("pnconc"),disabled:n!=="pncounter",children:"PN-Counter concurrent inc/dec"}),e.jsx("button",{className:"btn",onClick:()=>f("oradd"),disabled:n!=="orset",children:"OR-Set add-wins-over-remove"})]}),e.jsx("div",{className:"crdt-status",children:e.jsx("span",{className:i.tone==="good"?"good":i.tone==="warn"?"warn":i.tone==="bad"?"bad":"muted",children:i.text})}),e.jsxs("div",{className:"crdt-teach",children:[e.jsxs("div",{className:"title",children:[Qs(n)," — invariants"]}),n==="gcounter"&&e.jsxs(e.Fragment,{children:["Per-replica counter slots; only the owning replica increments its slot.",e.jsx("b",{children:" merge = element-wise max "})," of the two maps. Value is the sum. Merge is commutative, associative, and idempotent → replicas converge under any sync order. Works only for increments — to support decrement, use a PN-Counter."]}),n==="pncounter"&&e.jsxs(e.Fragment,{children:["A pair of G-Counters: ",e.jsx("b",{children:"P"})," accumulates increments, ",e.jsx("b",{children:"N"})," accumulates decrements. Value = sum(P) − sum(N). Merge is element-wise max on both P and N independently. Because each G-Counter slot is monotone, an increment on one replica and a decrement on another ",e.jsx("i",{children:"cannot"})," cancel each other out during sync."]}),n==="orset"&&e.jsxs(e.Fragment,{children:["Each ",e.jsx("b",{children:"add"})," produces a globally-unique tag ",e.jsx("code",{children:"{replica, seq}"}),". Each ",e.jsx("b",{children:"remove"})," tombstones only the add-tags currently observed locally. Merge = union(add-tags) − union(tombstones). An element is present iff it has ≥ 1 live tag. Consequence: a concurrent add on another replica carries an unseen tag and ",e.jsx("b",{children:"wins"}),' against a concurrent remove — "add-wins". That is different from a naive set-union, which would lose the remove, and from LWW, which may lose the add.']})]})]})}
function Qs(n){return n==="gcounter"?"G-Counter":n==="pncounter"?"PN-Counter":n==="orset"?"OR-Set":n}

export default eh;
export { eh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(eh, {}));
  return () => root.unmount();
}
