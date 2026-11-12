import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Qe(a,t){let s=0;const o=String(a);for(let n=0;n<o.length;n++)s=s*31+o.charCodeAt(n)>>>0;return s%t}
class $t{constructor({capacity:t=8,strategy:s="chain",loadThreshold:o=.75}={}){this.capacity=t,this.strategy=s,this.loadThreshold=o,this.size=0,this.buckets=this._empty(t),this._uid=1}_empty(t){const s=new Array(t);for(let o=0;o<t;o++)s[o]=[];return s}hash(t){return Qe(t,this.capacity)}insert(t,s){const o={op:"insert",key:t,value:s,path:[],landed:-1,replaced:!1};if(this.strategy==="chain"){const c=this.hash(t);o.path.push(c);const r=this.buckets[c],l=r.find(i=>i.key===t);l?(l.value=s,o.replaced=!0,o.landed=c):(r.push({key:t,value:s,id:this._uid++}),this.size++,o.landed=c)}else{const c=this.hash(t);let r=c;for(let l=0;l<this.capacity;l++){r=(c+l)%this.capacity,o.path.push(r);const i=this.buckets[r];if(i.length===0){i.push({key:t,value:s,id:this._uid++}),this.size++,o.landed=r;break}if(i[0].key===t){i[0].value=s,o.replaced=!0,o.landed=r;break}}if(o.landed===-1)return this._resize(this.capacity*2,o),{...o,...this.insert(t,s),resized:!0}}return this.size/this.capacity>this.loadThreshold&&this._resize(this.capacity*2,o),o.sizeAfter=this.size,o.capacityAfter=this.capacity,o.loadAfter=this.size/this.capacity,o}lookup(t){const s={op:"lookup",key:t,path:[],found:!1,value:void 0};if(this.strategy==="chain"){const o=this.hash(t);s.path.push(o);const n=this.buckets[o].find(c=>c.key===t);n&&(s.found=!0,s.value=n.value)}else{const o=this.hash(t);for(let n=0;n<this.capacity;n++){const c=(o+n)%this.capacity;s.path.push(c);const r=this.buckets[c];if(r.length===0)break;if(r[0].key===t){s.found=!0,s.value=r[0].value;break}}}return s}_resize(t,s){const o=this.buckets,n=this.capacity,c=[];for(const r of o)for(const l of r)c.push(l);this.capacity=t,this.buckets=this._empty(t),this.size=0;for(const r of c)if(this.strategy==="chain"){const l=Qe(r.key,this.capacity);this.buckets[l].push(r),this.size++}else{const l=Qe(r.key,this.capacity);for(let i=0;i<this.capacity;i++){const d=(l+i)%this.capacity;if(this.buckets[d].length===0){this.buckets[d].push(r),this.size++;break}}}s&&(s.resized=!0,s.oldCapacity=n,s.newCapacity=t,s.rehashedCount=c.length)}snapshot(){return{capacity:this.capacity,strategy:this.strategy,size:this.size,load:this.capacity?this.size/this.capacity:0,buckets:this.buckets.map(t=>t.map(s=>({...s})))}}clear(){this.size=0,this.buckets=this._empty(this.capacity)}}
const Ea=`
.htw-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.htw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.htw-title { font-weight: 600; font-size: 15px; }
.htw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.htw-head-right { display: flex; gap: 8px; align-items: center; }
.htw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.htw-input, .htw-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.htw-input { width: 110px; }
.htw-input:focus, .htw-select:focus {
  outline: none; border-color: #4a7cff;
}
.htw-btn {
  padding: 6px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.htw-btn:hover { background: #3b6ae8; }
.htw-btn.htw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.htw-btn.htw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.htw-btn.htw-danger { background: #c13c3c; }
.htw-btn.htw-danger:hover { background: #a73232; }
.htw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }

.htw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.htw-formula {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #8a93a8;
  background: #141925;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 16px;
  white-space: pre-wrap;
}
.htw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.htw-bucket {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  min-height: 72px;
  transition: border-color 300ms ease, box-shadow 300ms ease, background 300ms ease;
}
.htw-bucket-hdr {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid #2a2f3e;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #8a93a8;
}
.htw-bucket-body {
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 4px;
  flex: 1;
}
.htw-entry {
  background: #1f3a2e;
  border: 1px solid #4a9f6f;
  border-radius: 4px;
  padding: 4px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  animation: htw-fade-in 300ms ease-out;
}
.htw-entry.htw-new {
  animation: htw-pulse-green 700ms ease-in-out;
}
.htw-entry.htw-replaced {
  animation: htw-pulse-blue 700ms ease-in-out;
}
.htw-bucket.htw-on-path {
  border-color: #ffd24a;
  box-shadow: 0 0 10px rgba(255, 210, 74, 0.35);
}
.htw-bucket.htw-landed {
  border-color: #4a9f6f;
  box-shadow: 0 0 12px rgba(74, 159, 111, 0.55);
}
.htw-bucket.htw-rehashed {
  animation: htw-flash-blue 700ms ease-in-out;
}
@keyframes htw-fade-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: none; }
}
@keyframes htw-pulse-green {
  0%, 100% { box-shadow: 0 0 0 rgba(74, 159, 111, 0); }
  50%      { box-shadow: 0 0 12px rgba(74, 159, 111, 0.9); }
}
@keyframes htw-pulse-blue {
  0%, 100% { box-shadow: 0 0 0 rgba(74, 124, 255, 0); }
  50%      { box-shadow: 0 0 12px rgba(74, 124, 255, 0.9); }
}
@keyframes htw-flash-blue {
  0%, 100% { background: #1a1f2e; }
  50%      { background: #223050; }
}
.htw-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #141925;
  border-top: 1px solid #2a2f3e;
  font-size: 13px;
  gap: 16px;
  flex-wrap: wrap;
}
.htw-status { color: #d1d5db; flex: 1; min-width: 0; }
.htw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.htw-stats b { color: #e6e6e6; }
.htw-stats .htw-load-hi { color: #ffd24a; }
.htw-stats .htw-load-crit { color: #ff5c5c; }
`,Fa=["apple","grape","mango","peach","lemon","olive","cherry","kiwi"];
function Ia(){const a=h.useRef(new $t({capacity:8,strategy:"chain"})),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("Fresh table: 8 buckets, separate chaining. Insert keys to collide them."),[c,r]=h.useState(""),[l,i]=h.useState(""),[d,f]=h.useState("chain"),[p,u]=h.useState({path:[],landed:-1,newEntryId:-1,replacedEntryId:-1,rehashed:!1}),m=h.useRef(null);function w(j){m.current&&clearTimeout(m.current),u(j),m.current=setTimeout(()=>{u({path:[],landed:-1,newEntryId:-1,replacedEntryId:-1,rehashed:!1})},1e3)}h.useEffect(()=>()=>m.current&&clearTimeout(m.current),[]);function b(){s(a.current.snapshot())}function k(j){f(j),a.current=new $t({capacity:8,strategy:j}),b(),w({path:[],landed:-1,newEntryId:-1,replacedEntryId:-1,rehashed:!1}),n(j==="chain"?"Switched to separate chaining. Colliding keys append to the bucket's linked list.":"Switched to open-addressing (linear probing). On collision, scan forward until an empty slot.")}function $(){a.current=new $t({capacity:8,strategy:d}),b(),w({path:[],landed:-1,newEntryId:-1,replacedEntryId:-1,rehashed:!1}),n("Cleared. Back to 8 empty buckets.")}function g(j,x){const N=String(j||"").trim();if(!N){n("Insert needs a key.");return}const E=x&&x.length?x:N,A=a.current.capacity,R=a.current.insert(N,E);b();let S=-1;if(!R.resized){const B=(a.current.buckets[R.landed]||[]).find(q=>q.key===N);B&&(S=B.id)}w({path:R.path||[],landed:R.landed,newEntryId:R.replaced?-1:S,replacedEntryId:R.replaced?S:-1,rehashed:!!R.resized});const P=Qe(N,A);R.resized?n(`Inserted '${N}'. Load factor crossed threshold → doubled ${R.oldCapacity||A} → ${R.newCapacity||a.current.capacity} and rehashed ${R.rehashedCount!=null?R.rehashedCount:a.current.size} entries.`):R.replaced?n(`Updated '${N}': hash=${P}, landed in bucket ${R.landed}. Value replaced.`):R.path.length>1?n(`Inserted '${N}': hash=${P}, collided — ${d==="chain"?"chained into":"probed to"} bucket ${R.landed} via ${R.path.join(" → ")}.`):n(`Inserted '${N}': hash=${P}, landed in bucket ${R.landed}. No collision.`)}function z(j){const x=String(j||"").trim();if(!x){n("Lookup needs a key.");return}const N=a.current.lookup(x);w({path:N.path,landed:N.found?N.path[N.path.length-1]:-1,newEntryId:-1,replacedEntryId:-1,rehashed:!1}),N.found?n(`Found '${x}' = '${N.value}' after ${N.path.length} probe(s): ${N.path.join(" → ")}.`):n(`'${x}' not found (probed ${N.path.join(" → ")}).`)}function F(){g(c,l),r(""),i("")}function M(){z(c)}function y(j){j.key==="Enter"&&F()}const C=h.useMemo(()=>new Set(p.path),[p.path]),T=t.load,v=T>.75?"htw-load-crit":T>.5?"htw-load-hi":"",I=h.useMemo(()=>{if(t.strategy==="chain"){let x=0;for(const N of t.buckets)N.length>1&&(x+=N.length-1);return x}let j=0;for(let x=0;x<t.buckets.length;x++){const N=t.buckets[x];N.length!==0&&Qe(N[0].key,t.capacity)!==x&&j++}return j},[t]);return e.jsxs("div",{className:"htw-root",children:[e.jsx("style",{children:Ea}),e.jsxs("div",{className:"htw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"htw-title",children:"Hash Table Visualizer"}),e.jsx("div",{className:"htw-sub",children:"Separate chaining vs. open-addressing (linear probing). Resize-and-rehash at load > 0.75."})]}),e.jsxs("div",{className:"htw-head-right",children:[e.jsx("label",{className:"htw-quick",children:"Strategy:"}),e.jsxs("select",{className:"htw-select",value:d,onChange:j=>k(j.target.value),children:[e.jsx("option",{value:"chain",children:"Chaining"}),e.jsx("option",{value:"probe",children:"Linear Probing"})]}),e.jsx("button",{className:"htw-btn htw-danger",onClick:$,children:"Reset"})]})]}),e.jsxs("div",{className:"htw-bar",children:[e.jsx("input",{className:"htw-input",placeholder:"key",value:c,onChange:j=>r(j.target.value),onKeyDown:y}),e.jsx("input",{className:"htw-input",placeholder:"value (opt)",value:l,onChange:j=>i(j.target.value),onKeyDown:y}),e.jsx("button",{className:"htw-btn",onClick:F,children:"Insert"}),e.jsx("button",{className:"htw-btn htw-ghost",onClick:M,children:"Lookup"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"htw-quick",children:"Quick-seed:"}),Fa.map(j=>e.jsx("button",{className:"htw-btn htw-ghost",onClick:()=>g(j,j),children:j},j))]}),e.jsxs("div",{className:"htw-canvas-wrap",children:[e.jsx("div",{className:"htw-formula",children:`hash(key) = (Σ s[i] * 31^(len-i-1)) mod ${t.capacity}   →   load = size/cap = ${t.size}/${t.capacity} = ${T.toFixed(3)}`}),e.jsx("div",{className:"htw-grid",children:t.buckets.map((j,x)=>{const N=["htw-bucket"];return C.has(x)&&N.push("htw-on-path"),p.landed===x&&N.push("htw-landed"),p.rehashed&&N.push("htw-rehashed"),e.jsxs("div",{className:N.join(" "),children:[e.jsxs("div",{className:"htw-bucket-hdr",children:[e.jsxs("span",{children:["bucket ",x]}),e.jsx("span",{children:j.length})]}),e.jsx("div",{className:"htw-bucket-body",children:j.length===0?e.jsx("span",{style:{color:"#4a5365",fontSize:12,fontStyle:"italic"},children:"empty"}):j.map(E=>{const A=["htw-entry"];return E.id===p.newEntryId&&A.push("htw-new"),E.id===p.replacedEntryId&&A.push("htw-replaced"),e.jsxs("div",{className:A.join(" "),children:[E.key," → ",String(E.value)]},E.id)})})]},x)})})]}),e.jsxs("div",{className:"htw-footer",children:[e.jsxs("div",{className:"htw-status",children:["Status: ",o]}),e.jsxs("div",{className:"htw-stats",children:["size=",e.jsx("b",{children:t.size}),"   cap=",e.jsx("b",{children:t.capacity}),"   load=",e.jsx("b",{className:v,children:T.toFixed(2)}),"   collisions=",e.jsx("b",{children:I})]})]})]})}

export default Ia;
export { Ia as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ia, {}));
  return () => root.unmount();
}
