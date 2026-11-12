import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ui(a){const t=[],s=new Map;for(const i of a.vertices)s.set(i.id,0);for(const i of a.edges)s.set(i.v,(s.get(i.v)||0)+1);const o=new Map;for(const i of a.vertices)o.set(i.id,[]);for(const i of a.edges)o.get(i.u).push(i.v);const n=[];for(const[i,d]of s)d===0&&n.push(i);const c=[],r=new Set;for(t.push(He({message:`Compute in-degrees. Queue initial zero in-degree vertices: [${n.join(", ")}].`,inDeg:s,queue:n,order:c,removed:r,current:null,cycle:!1}));n.length;){const i=n.shift();c.push(i),r.add(i),t.push(He({message:`Remove ${i} (in-deg 0). Append to topo order.`,inDeg:s,queue:n,order:c,removed:r,current:i,cycle:!1}));for(const d of o.get(i))s.set(d,s.get(d)-1),s.get(d)===0?(n.push(d),t.push(He({message:`  decrement in-deg of ${d} → 0. Enqueue.`,inDeg:s,queue:n,order:c,removed:r,current:i,cycle:!1}))):t.push(He({message:`  decrement in-deg of ${d} → ${s.get(d)}.`,inDeg:s,queue:n,order:c,removed:r,current:i,cycle:!1}))}const l=c.length!==a.vertices.length;return t.push(He({message:l?`CYCLE DETECTED: only ${c.length}/${a.vertices.length} vertices ordered. Remaining have non-zero in-degree.`:`Topo order: [${c.join(" → ")}].`,inDeg:s,queue:n,order:c,removed:r,current:null,cycle:l})),t}
function He(a){return{message:a.message,inDeg:new Map(a.inDeg),queue:a.queue.slice(),order:a.order.slice(),removed:new Set(a.removed),current:a.current,cycle:a.cycle}}
function Ut(){return{vertices:[{id:"Socks",x:80,y:60},{id:"Shoes",x:80,y:180},{id:"Undies",x:240,y:40},{id:"Pants",x:240,y:160},{id:"Shirt",x:400,y:40},{id:"Belt",x:400,y:160},{id:"Tie",x:560,y:40},{id:"Jacket",x:560,y:180}],edges:[{u:"Socks",v:"Shoes"},{u:"Undies",v:"Pants"},{u:"Undies",v:"Shoes"},{u:"Pants",v:"Shoes"},{u:"Pants",v:"Belt"},{u:"Shirt",v:"Belt"},{u:"Shirt",v:"Tie"},{u:"Tie",v:"Jacket"},{u:"Belt",v:"Jacket"}],directed:!0}}
function fi(a){const t=a.edges.map(s=>({...s}));return t.push({u:"Jacket",v:"Shirt"}),{...a,edges:t}}
const hi=`
.tsw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.tsw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.tsw-title { font-weight:600; font-size:15px; }
.tsw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.tsw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.tsw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.tsw-btn:hover { background:#3b6ae8; }
.tsw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.tsw-btn.warn { background:#c13c3c; }
.tsw-btn.warn:hover { background:#a73232; }
.tsw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.tsw-hint { color:#8a93a8; font-size:12px; }
.tsw-main { flex:1; display:flex; min-height:380px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.tsw-canvas { flex:1; padding:16px; overflow:auto; }
.tsw-side { width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto; }
.tsw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.tsw-chip { display:inline-block; padding:3px 8px; border-radius:4px;
  background:#2a3550; border:1px solid #4a5f8f; margin:2px; }
.tsw-order { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; }
.tsw-order .tsw-chip { background:#1f3a2e; border-color:#4a9f6f; }
.tsw-queue { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; min-height:24px; }
.tsw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.tsw-status { color:#d1d5db; flex:1; min-width:0; }
.tsw-status.bad { color:#ff5c5c; }
.tsw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.tsw-stats b { color:#e6e6e6; }
.tsw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease, opacity 300ms ease; }
.tsw-node.ready circle { fill:#3a3a1c; stroke:#ffd24a; }
.tsw-node.removed circle { fill:#1f3a2e; stroke:#4a9f6f; opacity:0.4; }
.tsw-node.current circle { stroke:#ff9f40; stroke-width:3;
  filter:drop-shadow(0 0 8px rgba(255,159,64,0.7)); }
.tsw-node.cycle circle { stroke:#ff5c5c; stroke-width:3; }
.tsw-node text { fill:#e6e6e6; font-size:11px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.tsw-indeg { fill:#ffd24a; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.tsw-edge { stroke:#3a4560; stroke-width:1.6; fill:none; transition:opacity 300ms ease; }
.tsw-edge.dim { opacity:0.25; }
`;
function xi(){const[a,t]=h.useState(()=>Ut()),s=h.useMemo(()=>ui(a),[a]),[o,n]=h.useState(0),[c,r]=h.useState(!1),l=h.useRef(null);h.useEffect(()=>{n(0),r(!1)},[a]),h.useEffect(()=>{if(c)return l.current=setTimeout(()=>{n(b=>b>=s.length-1?(r(!1),b):b+1)},600),()=>clearTimeout(l.current)},[c,o,s.length]);const i=s[o];function d(){n(b=>Math.min(b+1,s.length-1))}function f(){n(b=>Math.max(b-1,0))}function p(){n(0),r(!1)}function u(){t(fi(Ut()))}function m(){t(Ut())}function w(b,k){const $=k.x-b.x,g=k.y-b.y,z=Math.hypot($,g)||1,F=-g/z*10,M=$/z*10,y=(b.x+k.x)/2+F,C=(b.y+k.y)/2+M,T=k.x-$/z*28,v=k.y-g/z*28;return`M ${b.x} ${b.y} Q ${y} ${C} ${T} ${v}`}return e.jsxs("div",{className:"tsw-root",children:[e.jsx("style",{children:hi}),e.jsx("div",{className:"tsw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"tsw-title",children:"Topological Sort — Kahn's Algorithm"}),e.jsx("div",{className:"tsw-sub",children:"Repeatedly remove a vertex with in-degree 0; decrement neighbors. Cycles are detectable."})]})}),e.jsxs("div",{className:"tsw-bar",children:[e.jsx("button",{className:"tsw-btn ghost",onClick:f,disabled:o===0,children:"Prev"}),e.jsx("button",{className:"tsw-btn",onClick:()=>r(b=>!b),children:c?"Pause":"Play"}),e.jsx("button",{className:"tsw-btn ghost",onClick:d,disabled:o>=s.length-1,children:"Next"}),e.jsx("button",{className:"tsw-btn ghost",onClick:p,children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"tsw-btn warn",onClick:u,children:"Add cycle edge"}),e.jsx("button",{className:"tsw-btn ghost",onClick:m,children:"Restore"}),e.jsxs("span",{className:"tsw-hint",children:["step ",o+1,"/",s.length]})]}),e.jsxs("div",{className:"tsw-main",children:[e.jsx("div",{className:"tsw-canvas",children:e.jsxs("svg",{width:680,height:260,viewBox:"0 0 680 260",children:[e.jsx("defs",{children:e.jsx("marker",{id:"tsw-arrow",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#6a7389"})})}),a.edges.map((b,k)=>{const $=a.vertices.find(F=>F.id===b.u),g=a.vertices.find(F=>F.id===b.v),z=i.removed.has(b.u);return e.jsx("path",{className:"tsw-edge"+(z?" dim":""),d:w($,g),markerEnd:"url(#tsw-arrow)"},k)}),a.vertices.map(b=>{const k=["tsw-node"],$=i.inDeg.get(b.id);return i.removed.has(b.id)?k.push("removed"):$===0&&k.push("ready"),i.current===b.id&&k.push("current"),i.cycle&&!i.removed.has(b.id)&&$>0&&k.push("cycle"),e.jsxs("g",{className:k.join(" "),children:[e.jsx("circle",{cx:b.x,cy:b.y,r:24}),e.jsx("text",{x:b.x,y:b.y,children:b.id}),e.jsxs("text",{className:"tsw-indeg",x:b.x,y:b.y+36,children:["in=",$]})]},b.id)})]})}),e.jsxs("div",{className:"tsw-side",children:[e.jsx("h4",{children:"Queue (in-deg 0)"}),e.jsx("div",{className:"tsw-queue",children:i.queue.length===0?e.jsx("span",{className:"tsw-hint",children:"empty"}):i.queue.map((b,k)=>e.jsx("span",{className:"tsw-chip",children:b},k))}),e.jsx("h4",{children:"Topo order"}),e.jsx("div",{className:"tsw-order",children:i.order.length===0?e.jsx("span",{className:"tsw-hint",children:"—"}):i.order.map((b,k)=>e.jsxs("span",{className:"tsw-chip",children:[k+1,". ",b]},k))})]})]}),e.jsxs("div",{className:"tsw-footer",children:[e.jsxs("div",{className:"tsw-status"+(i.cycle?" bad":""),children:["Status: ",i.message]}),e.jsxs("div",{className:"tsw-stats",children:["ordered=",e.jsx("b",{children:i.order.length}),"/",e.jsx("b",{children:a.vertices.length}),"   queue=",e.jsx("b",{children:i.queue.length})]})]})]})}

export default xi;
export { xi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(xi, {}));
  return () => root.unmount();
}
