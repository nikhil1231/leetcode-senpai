import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let ca=1;
function da(){return"lru-"+ca++}
class pa{constructor(t=4){this.capacity=Math.max(1,t),this.map=new Map,this.head=null,this.tail=null,this.ops=0,this.hits=0,this.misses=0,this.evictions=0}reset(t){this.capacity=Math.max(1,t||this.capacity),this.map=new Map,this.head=null,this.tail=null,this.ops=0,this.hits=0,this.misses=0,this.evictions=0}_detach(t){t.prev&&(t.prev.next=t.next),t.next&&(t.next.prev=t.prev),this.head===t&&(this.head=t.next),this.tail===t&&(this.tail=t.prev),t.prev=null,t.next=null}_pushFront(t){t.prev=null,t.next=this.head,this.head&&(this.head.prev=t),this.head=t,this.tail||(this.tail=t)}get(t){this.ops++;const s=this.map.get(t);return s?(this.hits++,this.head!==s&&(this._detach(s),this._pushFront(s)),{hit:!0,value:s.value,movedId:s.id,evictedId:null}):(this.misses++,{hit:!1,value:null,movedId:null,evictedId:null})}put(t,s){this.ops++;const o=this.map.get(t);if(o)return o.value=s,this.head!==o&&(this._detach(o),this._pushFront(o)),{updated:!0,newId:o.id,evictedId:null,evictedKey:null};let n=null,c=null;this.map.size>=this.capacity&&this.tail&&(n=this.tail.id,c=this.tail.key,this.map.delete(this.tail.key),this._detach(this.tail),this.evictions++);const r={id:da(),key:t,value:s,prev:null,next:null};return this.map.set(t,r),this._pushFront(r),{updated:!1,newId:r.id,evictedId:n,evictedKey:c}}snapshot(){const t=[];let s=this.head;for(;s;)t.push({id:s.id,key:s.key,value:s.value}),s=s.next;const o=[];return this.map.forEach((n,c)=>{o.push({key:c,id:n.id})}),o.sort((n,c)=>String(n.key).localeCompare(String(c.key))),{list:t,mapEntries:o,capacity:this.capacity,size:this.map.size,ops:this.ops,hits:this.hits,misses:this.misses,evictions:this.evictions}}}
const ua=`
.lrw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.lrw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.lrw-title { font-weight: 600; font-size: 15px; }
.lrw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.lrw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.lrw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 90px; }
.lrw-input:focus { outline: none; border-color: #4a7cff; }
.lrw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.lrw-btn:hover { background: #3b6ae8; }
.lrw-btn.ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.lrw-btn.ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.lrw-btn.danger { background: #c13c3c; }
.lrw-btn.danger:hover { background: #a73232; }
.lrw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.lrw-canvas { flex: 1; min-height: 320px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.lrw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.lrw-status { color: #d1d5db; flex: 1; min-width: 0; }
.lrw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.lrw-stats b { color: #e6e6e6; }
.lrw-sec-label { font-size: 11px; color: #8a93a8; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
.lrw-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
.lrw-map-slot { border: 1px dashed #4a5f8f; border-radius: 6px; padding: 4px 8px;
  background: #141925; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #d1d5db; min-width: 60px; text-align: center;
  transition: all 300ms ease; }
.lrw-map-slot .k { color: #4a7cff; font-weight: 600; }
.lrw-map-slot .arrow { color: #6a7389; margin: 0 4px; }
.lrw-map-slot .id { color: #8a93a8; font-size: 11px; }
.lrw-dll-row { display: flex; gap: 0; align-items: center; flex-wrap: nowrap;
  min-height: 80px; }
.lrw-node { display: flex; flex-direction: column; align-items: center;
  padding: 8px 12px; background: #1f3a2e; border: 1.5px solid #4a9f6f;
  border-radius: 8px; min-width: 64px; transition: all 400ms ease;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.lrw-node .nk { font-size: 12px; color: #8a93a8; }
.lrw-node .nv { font-size: 14px; color: #e6e6e6; font-weight: 600; }
.lrw-node.mru { border-color: #ffd24a; box-shadow: 0 0 12px rgba(255, 210, 74, 0.4); }
.lrw-node.hit { animation: lrw-hit 700ms ease-in-out 1; }
.lrw-node.evict { animation: lrw-evict 700ms ease-in-out 1; }
.lrw-node.inserted { animation: lrw-ins 700ms ease-in-out 1; }
@keyframes lrw-hit {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74,159,111,0)); }
  50% { filter: drop-shadow(0 0 14px rgba(74,159,111,0.95)); }
}
@keyframes lrw-evict {
  0% { background: #1f3a2e; opacity: 1; }
  50% { background: #5a2020; opacity: 0.6; }
  100% { background: #1f3a2e; opacity: 1; }
}
@keyframes lrw-ins {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.lrw-conn { width: 20px; height: 2px; background: #3a4560; position: relative; }
.lrw-conn::before, .lrw-conn::after { content: ""; position: absolute;
  top: -3px; width: 8px; height: 2px; background: #3a4560; }
.lrw-conn::before { left: 0; transform: rotate(30deg); transform-origin: left; }
.lrw-conn::after { right: 0; transform: rotate(-30deg); transform-origin: right; }
.lrw-end-cap { padding: 4px 10px; background: #141925; border: 1px solid #2a2f3e;
  border-radius: 4px; color: #8a93a8; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.lrw-empty-mid { color: #8a93a8; font-style: italic; padding: 20px; }
`,fa=[{op:"put",k:"a",v:1},{op:"put",k:"b",v:2},{op:"put",k:"c",v:3},{op:"put",k:"d",v:4},{op:"get",k:"b"},{op:"put",k:"e",v:5}];
function ha(){const a=h.useRef(new pa(4)),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState(""),[c,r]=h.useState(""),[l,i]=h.useState(4),[d,f]=h.useState("Empty LRU cache (capacity 4). Put a key, or try the quick seeds."),[p,u]=h.useState({hit:null,inserted:null,evict:null}),m=h.useRef(null);function w(y){m.current&&clearTimeout(m.current),u(y),m.current=setTimeout(()=>u({hit:null,inserted:null,evict:null}),750)}h.useEffect(()=>()=>m.current&&clearTimeout(m.current),[]);function b(){s(a.current.snapshot())}function k(){const y=o.trim();if(!y){f("Put needs a key.");return}const C=c.trim()||y,T=a.current.put(y,C);b(),T.updated?(f(`Put(${y}, ${C}): key existed, updated value & moved to MRU.`),w({hit:T.newId,inserted:null,evict:null})):T.evictedKey?(f(`Put(${y}, ${C}): cache full → evicted LRU key '${T.evictedKey}'. New node at MRU.`),w({hit:null,inserted:T.newId,evict:T.evictedId})):(f(`Put(${y}, ${C}): inserted new node at MRU end.`),w({hit:null,inserted:T.newId,evict:null})),n(""),r("")}function $(){const y=o.trim();if(!y){f("Get needs a key.");return}const C=a.current.get(y);b(),C.hit?(f(`Get(${y}): HIT → ${C.value}. Node moved to MRU end.`),w({hit:C.movedId,inserted:null,evict:null})):f(`Get(${y}): MISS. Key not in cache.`),n("")}function g(){const y=Math.max(1,Math.min(12,Number(l)||4));a.current.reset(y),b(),f(`Reset cache. Capacity = ${y}.`),w({hit:null,inserted:null,evict:null})}function z(){a.current.reset(Number(l)||4);for(const y of fa)y.op==="put"?a.current.put(y.k,y.v):a.current.get(y.k);b(),f("Ran sample trace: put a..d, get b (MRU), put e (evicts a).")}const F=t.list,M=t.mapEntries;return e.jsxs("div",{className:"lrw-root",children:[e.jsx("style",{children:ua}),e.jsxs("div",{className:"lrw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"lrw-title",children:"LRU Cache (HashMap + Doubly-Linked List)"}),e.jsx("div",{className:"lrw-sub",children:"O(1) get & put. Map points to DLL nodes; MRU lives at the head, LRU at the tail — evictions pop the tail."})]}),e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[e.jsx("span",{className:"lrw-quick",children:"Capacity:"}),e.jsx("input",{className:"lrw-input",type:"number",min:1,max:12,value:l,onChange:y=>i(y.target.value),style:{width:60}}),e.jsx("button",{className:"lrw-btn danger",onClick:g,children:"Reset"})]})]}),e.jsxs("div",{className:"lrw-bar",children:[e.jsx("input",{className:"lrw-input",placeholder:"key",value:o,onChange:y=>n(y.target.value)}),e.jsx("input",{className:"lrw-input",placeholder:"value",value:c,onChange:y=>r(y.target.value)}),e.jsx("button",{className:"lrw-btn",onClick:k,children:"Put"}),e.jsx("button",{className:"lrw-btn ghost",onClick:$,children:"Get"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"lrw-quick",children:"Quick:"}),e.jsx("button",{className:"lrw-btn ghost",onClick:z,children:"Run sample trace"})]}),e.jsxs("div",{className:"lrw-canvas",children:[e.jsx("div",{className:"lrw-sec-label",children:"HashMap (key → node)"}),e.jsx("div",{className:"lrw-row",children:M.length===0?e.jsx("span",{className:"lrw-empty-mid",children:"empty"}):M.map(y=>e.jsxs("div",{className:"lrw-map-slot",children:[e.jsx("span",{className:"k",children:y.key}),e.jsx("span",{className:"arrow",children:"→"}),e.jsx("span",{className:"id",children:y.id.replace("lru-","#")})]},y.key))}),e.jsx("div",{className:"lrw-sec-label",children:"Doubly-Linked List (MRU → LRU)"}),e.jsxs("div",{className:"lrw-dll-row",children:[e.jsx("div",{className:"lrw-end-cap",children:"HEAD"}),e.jsx("div",{className:"lrw-conn"}),F.length===0?e.jsx("span",{className:"lrw-empty-mid",children:"empty"}):F.map((y,C)=>{const T=["lrw-node"];return C===0&&T.push("mru"),p.hit===y.id&&T.push("hit"),p.inserted===y.id&&T.push("inserted"),p.evict===y.id&&T.push("evict"),e.jsxs(Oe.Fragment,{children:[e.jsxs("div",{className:T.join(" "),children:[e.jsx("div",{className:"nk",children:y.key}),e.jsx("div",{className:"nv",children:String(y.value)})]}),C<F.length-1&&e.jsx("div",{className:"lrw-conn"})]},y.id)}),e.jsx("div",{className:"lrw-conn"}),e.jsx("div",{className:"lrw-end-cap",children:"TAIL"})]})]}),e.jsxs("div",{className:"lrw-footer",children:[e.jsxs("div",{className:"lrw-status",children:["Status: ",d]}),e.jsxs("div",{className:"lrw-stats",children:["size=",e.jsx("b",{children:t.size}),"/",e.jsx("b",{children:t.capacity}),"   ops=",e.jsx("b",{children:t.ops}),"   hits=",e.jsx("b",{children:t.hits}),"   miss=",e.jsx("b",{children:t.misses}),"   evict=",e.jsx("b",{children:t.evictions})]})]})]})}

export default ha;
export { ha as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ha, {}));
  return () => root.unmount();
}
