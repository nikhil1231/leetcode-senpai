import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let Ml=0;
const Al=()=>{const n=Ml++;let t="",s=n;do t=String.fromCharCode(97+s%26)+t,s=Math.floor(s/26)-1;while(s>=0);return"SST-"+t};
function jn(n){const t=n.map(i=>i.key),s=n.map(i=>i.value),r=new Set(n.filter(i=>i.tombstone).map(i=>i.key)),o=new Set(t);return{id:Al(),keys:t,values:s,tombstones:r,bloomFilter:o,minKey:t.length?t[0]:null,maxKey:t.length?t[t.length-1]:null}}
function ga(n,t){const s=Number(n),r=Number(t);return!Number.isNaN(s)&&!Number.isNaN(r)&&n!==""&&t!==""&&s!==r?s-r:n<t?-1:n>t?1:0}
function Jo(n,{dropTombstones:t=!1}={}){const s=new Map;for(const o of n)for(const i of o)s.set(i.key,i);let r=Array.from(s.values());return t&&(r=r.filter(o=>!o.tombstone)),r.sort((o,i)=>ga(o.key,i.key)),r}
function Tr(n){return n.keys.map((t,s)=>({key:t,value:n.values[s],tombstone:n.tombstones.has(t)}))}
class Qo{constructor({memtableMax:t=4,l0Max:s=3,levelSizeMultiplier:r=3}={}){this.memtableMax=t,this.l0Max=s,this.levelSizeMultiplier=r,this.memtable=[],this.levels=[[],[],[]],this.userWrites=0,this.internalWrites=0,this.readAmpWindow=[],this.onEvent=null}_emit(t,s){typeof this.onEvent=="function"&&this.onEvent({type:t,...s})}_insertIntoMemtable(t){const s=this.memtable;for(let r=0;r<s.length;r++){const o=ga(s[r].key,t.key);if(o===0){s[r]=t;return}if(o>0){s.splice(r,0,t);return}}s.push(t)}put(t,s){this.userWrites++,this._insertIntoMemtable({key:String(t),value:s,tombstone:!1}),this._emit("put",{key:String(t),value:s,size:this.memtable.length}),this.memtable.length>=this.memtableMax&&this.flush()}delete(t){this.userWrites++,this._insertIntoMemtable({key:String(t),value:null,tombstone:!0}),this._emit("delete",{key:String(t),size:this.memtable.length}),this.memtable.length>=this.memtableMax&&this.flush()}flush(){if(this.memtable.length===0)return null;const t=this.memtable.slice(),s=jn(t);for(this.internalWrites+=t.length,this.memtable=[],this.levels[0].push(s),this._emit("flush",{sstable:s});this._needsCompaction();)this.compact();return s.id}_needsCompaction(){if(this.levels[0].length>=this.l0Max)return!0;const t=this.levels[1].reduce((r,o)=>r+o.keys.length,0),s=this.memtableMax*this.l0Max*this.levelSizeMultiplier;return t>s}compact(){if(this.levels[0].length>=this.l0Max){const r=this.levels[0],o=this.levels[1],i=[...o.map(Tr),...r.map(Tr)],a=Jo(i,{dropTombstones:!1}),l=[...r.map(c=>c.id),...o.map(c=>c.id)],d=jn(a);return this.internalWrites+=a.length,this.levels[0]=[],this.levels[1]=[d],this._emit("compact",{fromLevel:0,toLevel:1,fromIds:l,toSstable:d}),{from:{level:0,ids:l},to:{level:1,id:d.id},merged:a}}const t=this.levels[1].reduce((r,o)=>r+o.keys.length,0),s=this.memtableMax*this.l0Max*this.levelSizeMultiplier;if(t>s){const r=this.levels[1],o=this.levels[2],i=[...o.map(Tr),...r.map(Tr)],a=Jo(i,{dropTombstones:!0}),l=[...r.map(c=>c.id),...o.map(c=>c.id)],d=jn(a);return this.internalWrites+=a.length,this.levels[1]=[],this.levels[2]=[d],this._emit("compact",{fromLevel:1,toLevel:2,fromIds:l,toSstable:d}),{from:{level:1,ids:l},to:{level:2,id:d.id},merged:a}}return null}get(t){t=String(t);const s=[];let r={value:void 0,tombstone:!1,path:s};for(const i of this.memtable)if(i.key===t)return s.push({source:"memtable",outcome:"hit"}),i.tombstone?r={value:null,tombstone:!0,path:s}:r={value:i.value,tombstone:!1,path:s},this._recordReadAmp(s),this._emit("get",{key:t,path:s,result:r}),r;s.push({source:"memtable",outcome:"miss"});const o=[{name:"L0",tables:[...this.levels[0]].reverse()},{name:"L1",tables:this.levels[1]},{name:"L2",tables:this.levels[2]}];for(const{name:i,tables:a}of o)for(const l of a){if(!l.bloomFilter.has(t)){s.push({source:i,id:l.id,outcome:"bloom-miss"});continue}s.push({source:i,id:l.id,outcome:"bloom-hit"});const d=l.keys.indexOf(t);if(d>=0)return l.tombstones.has(t)?r={value:null,tombstone:!0,path:s}:r={value:l.values[d],tombstone:!1,path:s},this._recordReadAmp(s),this._emit("get",{key:t,path:s,result:r}),r}return r={value:void 0,tombstone:!1,path:s},this._recordReadAmp(s),this._emit("get",{key:t,path:s,result:r}),r}_recordReadAmp(t){const s=t.filter(r=>r.outcome==="bloom-hit"||r.source==="memtable"&&r.outcome==="hit").length;this.readAmpWindow.push(s),this.readAmpWindow.length>10&&this.readAmpWindow.shift()}snapshot(){return{memtable:this.memtable.map(t=>({...t})),levels:this.levels.map(t=>t.map(s=>({id:s.id,keys:[...s.keys],values:[...s.values],tombstones:new Set(s.tombstones),bloomFilter:new Set(s.bloomFilter),minKey:s.minKey,maxKey:s.maxKey})))}}stats(){let t=this.memtable.filter(i=>i.tombstone).length,s=this.memtable.length;for(const i of this.levels)for(const a of i)t+=a.tombstones.size,s+=a.keys.length;const r=this.readAmpWindow.length===0?0:this.readAmpWindow.reduce((i,a)=>i+a,0)/this.readAmpWindow.length;return{writeAmp:this.userWrites===0?0:(this.userWrites+this.internalWrites)/this.userWrites,readAmp:r,tombstones:t,totalKeys:s,userWrites:this.userWrites}}}
const Jt="#0f1419",Il="#1a1f2e",at="#2a2f3e",wt="#e6e6e6",_e="#8a93a6",qt="#4a7cff",Sn="#f5c451",Mr="#f66",Ot="#5cd894",El="#14363d",zl="#2aa1b3",Pl="#2a1f47",Ol="#8a6cff",Ll="#3d2f10",Fl="#e0a84a",Dl="#14253d",ql="#4a7cff",Zo=[{label:"L0",bg:El,border:zl},{label:"L1",bg:Pl,border:Ol},{label:"L2",bg:Ll,border:Fl}],bo=400,dr=300,ei=200,Wl=[{k:"1",v:"alpha"},{k:"5",v:"bravo"},{k:"9",v:"charlie"},{k:"12",v:"delta"},{k:"17",v:"echo"},{k:"23",v:"foxtrot"},{k:"34",v:"golf"},{k:"42",v:"hotel"}];
function pr(n){if(n==null)return"∅";const t=String(n);return t.length>6?t.slice(0,6)+"…":t}
function Bl(n,t,s){const r=[];for(const i of t)i.source==="memtable"?r.push(i.outcome==="hit"?"memtable HIT":"memtable miss"):i.outcome==="bloom-miss"?r.push(`${i.source} ${i.id} bloom SKIP`):i.outcome==="bloom-hit"&&r.push(`${i.source} ${i.id} bloom HIT`);let o;return s.tombstone?o="tombstone → deleted":s.value===void 0?o="not found":o=`found '${pr(s.value)}'`,`Get(${n}): ${r.join(" → ")} → ${o}`}
function Hl(){const[n,t]=h.useState(4),s=h.useRef(null),[r,o]=h.useState({memtable:[],levels:[[],[],[]]}),[i,a]=h.useState({writeAmp:0,readAmp:0,tombstones:0,totalKeys:0,userWrites:0}),[l,d]=h.useState('Ready. Try Put(5, "v") or use the quick-put buttons below.'),[c,p]=h.useState(null),[m,g]=h.useState(!1),[w,C]=h.useState(new Set),[j,$]=h.useState(null),[O,q]=h.useState([]),[R,D]=h.useState("5"),[B,V]=h.useState("v"),T=(N=n)=>{const z=new Qo({memtableMax:N,l0Max:3,levelSizeMultiplier:3});z.onEvent=E=>b(E),s.current=z,o(z.snapshot()),a(z.stats()),q([]),C(new Set),$(null),p(null),g(!1)};h.useEffect(()=>{T(n)},[]);const _=()=>{const N=s.current;N&&(o(N.snapshot()),a(N.stats()))},b=N=>{if(N.type==="flush")g(!0),p(N.sstable.id),d(`Memtable full → flushed to L0 as ${N.sstable.id}`),setTimeout(()=>g(!1),dr),setTimeout(()=>p(z=>z===N.sstable.id?null:z),dr+200);else if(N.type==="compact"){const z=new Set(N.fromIds);C(z),$(N.toSstable.id);const E=N.fromLevel===0?"L0":"L1",J=N.toLevel===1?"L1":"L2";d(`${E} full → compacted ${N.fromIds.join("+")} → ${J} as ${N.toSstable.id}`),setTimeout(()=>{C(new Set)},bo+dr),setTimeout(()=>{$(Y=>Y===N.toSstable.id?null:Y)},bo+dr+200)}},x=()=>{if(!R)return;const N=s.current;N.put(R,B),d(`Put(${R}, '${pr(B)}'): memtable ${N.memtable.length}/${N.memtableMax}`),_()},f=()=>{if(!R)return;const N=s.current;N.delete(R),d(`Delete(${R}): tombstone written to memtable ${N.memtable.length}/${N.memtableMax}`),_()},u=()=>{if(!R)return;const z=s.current.get(R),{path:E}=z,J=E.map((Y,se)=>({key:Y.source==="memtable"?"memtable":Y.id,outcome:Y.outcome,index:se}));q([]),J.forEach((Y,se)=>{setTimeout(()=>{q(A=>[...A,Y])},se*ei)}),setTimeout(()=>{q([])},J.length*ei+600),d(Bl(R,E,z)),_()},y=()=>{const N=s.current;if(N.memtable.length===0){d("Memtable is empty - nothing to flush.");return}N.flush(),_()},v=()=>{const N=s.current;if(N.levels[0].length===0&&N.levels[1].length===0){d("Nothing to compact.");return}const z=N.l0Max;if(N.levels[0].length>0)N.l0Max=1,N.compact(),N.l0Max=z;else{const E=N.levels[1].reduce((Y,se)=>Y+se.keys.length,0);if(N.memtableMax*N.l0Max*N.levelSizeMultiplier,E===0){d("L1 empty - nothing to compact.");return}const J=N.memtableMax;N.memtableMax=0,N.compact(),N.memtableMax=J}_()},I=()=>{T(n),d("Reset. Fresh LSM tree.")},S=(N,z)=>{const E=s.current;E.put(N,z),d(`Put(${N}, '${pr(z)}'): memtable ${E.memtable.length}/${E.memtableMax}`),_()},H=N=>{t(N);const z=new Qo({memtableMax:N,l0Max:3,levelSizeMultiplier:3});z.onEvent=E=>b(E),s.current=z,o(z.snapshot()),a(z.stats()),d(`Memtable max set to ${N}. Tree rebuilt.`),q([])},M=h.useMemo(()=>{const N=new Map;for(const z of O)N.set(z.key,z.outcome);return N},[O]),k=(N,z)=>{const E=Zo[z],J=w.has(N.id),Y=j===N.id,se=c===N.id,A=M.get(N.id),K=N.keys.slice(0,5),Q=N.keys.length-K.length;let X=E.border,ee="none",F=1;return J&&(X=Sn,ee=`0 0 0 2px ${Sn}55, 0 0 14px ${Sn}55`),(Y||se)&&(X=Ot,ee=`0 0 0 2px ${Ot}55, 0 0 14px ${Ot}55`,F=0),A==="bloom-hit"?(X=Ot,ee=`0 0 0 2px ${Ot}77`):A==="bloom-miss"&&(X=_e,ee=`0 0 0 1px ${_e}77`),e.jsxs("div",{className:"lsm-sst"+(se?" lsm-fade-in":"")+(Y?" lsm-fade-in":"")+(J?" lsm-pulse":""),style:{background:E.bg,border:`1.5px solid ${X}`,boxShadow:ee,opacity:F===0?void 0:1},children:[e.jsxs("div",{className:"lsm-sst-header",children:[e.jsx("span",{className:"lsm-sst-id",children:N.id}),e.jsx("span",{className:"lsm-sst-range",children:N.minKey!==null?`[${N.minKey}..${N.maxKey}]`:"∅"})]}),e.jsxs("div",{className:"lsm-sst-keys",children:[K.length===0&&e.jsx("span",{style:{color:_e},children:"empty"}),K.map((U,Z)=>{const W=N.tombstones.has(U);return e.jsxs("span",{className:"lsm-kv",children:[e.jsx("span",{className:"lsm-k",children:U}),e.jsx("span",{className:"lsm-arrow",children:"→"}),W?e.jsx("span",{className:"lsm-tomb",children:e.jsx("span",{className:"lsm-x",children:"×"})}):e.jsx("span",{className:"lsm-v",children:pr(N.values[Z])})]},U)}),Q>0&&e.jsxs("span",{style:{color:_e,fontSize:11},children:["+",Q," more"]})]}),A&&e.jsx("div",{className:"lsm-badge",style:{background:A==="bloom-hit"?Ot:_e,color:Jt},children:A==="bloom-hit"?"bloom HIT":A==="bloom-miss"?"bloom SKIP":A})]},N.id)},P=M.get("memtable");return e.jsxs("div",{className:"lsm-root",children:[e.jsx("style",{children:Kl}),e.jsxs("div",{className:"lsm-panel",children:[e.jsxs("div",{className:"lsm-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"lsm-title",children:"LSM-Tree Visualizer"}),e.jsx("div",{className:"lsm-subtitle",children:'Chapter 7, Petrov: "Database Internals"'})]}),e.jsxs("div",{className:"lsm-title-controls",children:[e.jsxs("label",{className:"lsm-label",children:["Memtable max: ",e.jsxs("select",{value:n,onChange:N=>H(Number(N.target.value)),children:[e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:4,children:"4"}),e.jsx("option",{value:8,children:"8"})]})]}),e.jsx("button",{className:"lsm-btn lsm-btn-ghost",onClick:I,children:"Reset"})]})]}),e.jsxs("div",{className:"lsm-controls",children:[e.jsx("input",{className:"lsm-input",style:{width:70},placeholder:"key",value:R,onChange:N=>D(N.target.value)}),e.jsx("input",{className:"lsm-input",style:{width:90},placeholder:"value",value:B,onChange:N=>V(N.target.value)}),e.jsx("button",{className:"lsm-btn",onClick:x,children:"Put"}),e.jsx("button",{className:"lsm-btn lsm-btn-danger",onClick:f,children:"Delete"}),e.jsx("button",{className:"lsm-btn lsm-btn-good",onClick:u,children:"Get"}),e.jsx("span",{className:"lsm-sep"}),e.jsx("button",{className:"lsm-btn lsm-btn-ghost",onClick:y,children:"Flush memtable"}),e.jsx("button",{className:"lsm-btn lsm-btn-ghost",onClick:v,children:"Force compact"})]}),e.jsxs("div",{className:"lsm-quick",children:[e.jsx("span",{className:"lsm-quick-label",children:"Quick put:"}),Wl.map(N=>e.jsxs("button",{className:"lsm-chip",onClick:()=>S(N.k,N.v),children:[N.k,"→",N.v]},N.k))]}),e.jsxs("div",{className:"lsm-section",children:[e.jsx("div",{className:"lsm-section-label",children:"Memtable"}),e.jsxs("div",{className:"lsm-memtable"+(m?" lsm-collapse":"")+(P==="hit"?" lsm-mt-hit":"")+(P==="miss"?" lsm-mt-miss":""),children:[r.memtable.length===0&&e.jsx("span",{style:{color:_e},children:"(empty)"}),r.memtable.map(N=>e.jsxs("span",{className:"lsm-kv lsm-kv-mt",children:[e.jsx("span",{className:"lsm-k",children:N.key}),e.jsx("span",{className:"lsm-arrow",children:"→"}),N.tombstone?e.jsx("span",{className:"lsm-tomb",children:e.jsx("span",{className:"lsm-x",children:"×"})}):e.jsx("span",{className:"lsm-v",children:pr(N.value)})]},N.key)),e.jsxs("span",{className:"lsm-fill",children:[r.memtable.length,"/",n]})]})]}),r.levels.map((N,z)=>{const E=Zo[z];return e.jsxs("div",{className:"lsm-section",children:[e.jsxs("div",{className:"lsm-section-label",style:{color:E.border},children:[E.label,e.jsx("span",{className:"lsm-section-hint",children:z===0?" - overlapping key ranges (from flushes)":z===1?" - disjoint, size-limited":" - bottommost; tombstones dropped here"})]}),e.jsx("div",{className:"lsm-level",children:N.length===0?e.jsx("span",{style:{color:_e,paddingLeft:8},children:"(empty)"}):N.map(J=>k(J,z))})]},z)}),e.jsxs("div",{className:"lsm-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"writes"}),"=",i.userWrites]}),e.jsxs("span",{children:[e.jsx("strong",{children:"write-amp"}),"=",i.writeAmp.toFixed(2),"×"]}),e.jsxs("span",{children:[e.jsx("strong",{children:"read-amp"}),"=",i.readAmp.toFixed(2)," ssts/get"]}),e.jsxs("span",{children:[e.jsx("strong",{children:"tombstones"}),"=",i.tombstones]}),e.jsxs("span",{children:[e.jsx("strong",{children:"total-keys"}),"=",i.totalKeys]})]}),e.jsxs("div",{className:"lsm-status",children:[e.jsx("span",{className:"lsm-status-dot"}),e.jsx("span",{className:"lsm-status-text",children:l})]})]})]})}
const Kl=`
.lsm-root {
  color: ${wt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Jt};
}
.lsm-panel {
  background: ${Il};
  border: 1px solid ${at};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1100px;
  margin: 0 auto;
}
.lsm-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${at};
}
.lsm-title {
  font-size: 18px;
  font-weight: 600;
  color: ${wt};
}
.lsm-subtitle {
  font-size: 12px;
  color: ${_e};
  margin-top: 2px;
}
.lsm-title-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.lsm-label {
  color: ${_e};
  font-size: 13px;
}
.lsm-label select {
  background: ${Jt};
  border: 1px solid ${at};
  color: ${wt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.lsm-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid ${at};
}
.lsm-input {
  padding: 6px 10px;
  background: ${Jt};
  border: 1px solid ${at};
  border-radius: 5px;
  color: ${wt};
  font-size: 13px;
  font-family: inherit;
}
.lsm-input:focus {
  outline: none;
  border-color: ${qt};
}
.lsm-btn {
  padding: 6px 14px;
  background: ${qt};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.lsm-btn:hover { filter: brightness(1.15); }
.lsm-btn-danger { background: ${Mr}; }
.lsm-btn-good { background: ${Ot}; color: ${Jt}; }
.lsm-btn-ghost {
  background: transparent;
  border: 1px solid ${at};
  color: ${wt};
}
.lsm-sep {
  width: 1px;
  height: 22px;
  background: ${at};
  margin: 0 4px;
}
.lsm-quick {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid ${at};
}
.lsm-quick-label {
  color: ${_e};
  font-size: 12px;
  margin-right: 4px;
}
.lsm-chip {
  padding: 3px 10px;
  background: ${Jt};
  border: 1px solid ${at};
  color: ${wt};
  border-radius: 999px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.lsm-chip:hover {
  border-color: ${qt};
  color: ${qt};
}
.lsm-section {
  padding: 12px 0;
  border-bottom: 1px dashed ${at};
}
.lsm-section:last-of-type {
  border-bottom: none;
}
.lsm-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${_e};
  margin-bottom: 6px;
  font-weight: 600;
}
.lsm-section-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: ${_e};
  margin-left: 8px;
}
.lsm-memtable {
  background: ${Dl};
  border: 1.5px solid ${ql};
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  transition: all 0.3s ease;
  position: relative;
}
.lsm-memtable.lsm-collapse {
  transform: translateY(18px) scale(0.96);
  opacity: 0.4;
}
.lsm-memtable.lsm-mt-hit {
  border-color: ${Ot};
  box-shadow: 0 0 0 2px ${Ot}77;
}
.lsm-memtable.lsm-mt-miss {
  border-color: ${_e};
  box-shadow: 0 0 0 1px ${_e}55;
}
.lsm-fill {
  margin-left: auto;
  font-size: 11px;
  color: ${_e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-level {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 56px;
  align-items: stretch;
}
.lsm-sst {
  border-radius: 6px;
  padding: 8px 10px;
  min-width: 140px;
  max-width: 240px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: box-shadow 0.2s, border-color 0.2s, opacity 0.3s, transform 0.3s;
  position: relative;
}
.lsm-sst-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
  gap: 6px;
}
.lsm-sst-id {
  font-weight: 700;
  color: ${wt};
  font-size: 11px;
}
.lsm-sst-range {
  color: ${_e};
  font-size: 10px;
}
.lsm-sst-keys {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lsm-kv {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  font-size: 11px;
}
.lsm-kv-mt {
  background: rgba(74,124,255,0.16);
}
.lsm-k {
  color: ${qt};
  font-weight: 600;
}
.lsm-arrow { color: ${_e}; }
.lsm-v { color: ${wt}; }
.lsm-tomb {
  color: ${Mr};
  text-decoration: line-through;
  text-decoration-color: ${Mr};
}
.lsm-x {
  color: ${Mr};
  font-weight: 700;
  margin-left: 2px;
}
.lsm-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  animation: lsm-badge-pop 0.25s ease-out;
}
@keyframes lsm-badge-pop {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.lsm-fade-in {
  animation: lsm-fade-in ${dr}ms ease-out both;
}
@keyframes lsm-fade-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.lsm-pulse {
  animation: lsm-pulse ${bo}ms ease-in-out;
}
@keyframes lsm-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.04); }
  100% { transform: scale(1); opacity: 0.2; }
}
.lsm-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${Jt};
  border: 1px solid ${at};
  border-radius: 6px;
  font-size: 12px;
  color: ${_e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-stats strong { color: ${wt}; font-weight: 600; margin-right: 2px; }
.lsm-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${Jt};
  border-left: 3px solid ${qt};
  border-radius: 4px;
  font-size: 12px;
  color: ${wt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${qt};
  box-shadow: 0 0 8px ${qt};
  flex-shrink: 0;
}
`;

export default Hl;
export { Hl as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Hl, {}));
  return () => root.unmount();
}
