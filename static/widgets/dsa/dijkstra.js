import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Ss(a,t){const s=Jo(a),o=[],n=new Map,c=new Map,r=new Set;for(const d of a.vertices)n.set(d.id,1/0),c.set(d.id,null);n.set(t,0);const l=[{id:t,d:0}];let i=!1;for(o.push(Te({message:`Start Dijkstra from ${t}. dist[${t}]=0.`,dist:n,parent:c,settled:r,pq:l,current:null,relaxed:null,sawNegative:i}));l.length;){l.sort((p,u)=>p.d-u.d);const d=l.shift();if(r.has(d.id)){o.push(Te({message:`skip ${d.id} — already settled (stale pq entry).`,dist:n,parent:c,settled:r,pq:l,current:d.id,relaxed:null,sawNegative:i}));continue}if(d.d>n.get(d.id))continue;r.add(d.id),o.push(Te({message:`extract-min → ${d.id} (d=${_t(d.d)}). Settle.`,dist:n,parent:c,settled:r,pq:l,current:d.id,relaxed:null,sawNegative:i}));const f=s.get(d.id)||[];for(const{to:p,w:u,key:m}of f){u<0&&(i=!0);const w=n.get(d.id)+u;if(w<n.get(p)){const b=n.get(p);n.set(p,w),c.set(p,d.id),l.push({id:p,d:w}),o.push(Te({message:`relax (${d.id},${p}) w=${u}: ${_t(b)} → ${w}. push ${p}.`,dist:n,parent:c,settled:r,pq:l,current:d.id,relaxed:m,sawNegative:i}))}else o.push(Te({message:`  skip (${d.id},${p}) w=${u}: ${w} ≥ ${_t(n.get(p))}.`,dist:n,parent:c,settled:r,pq:l,current:d.id,relaxed:m,sawNegative:i}))}}return o.push(Te({message:i?"Done. Note: negative edge present — Dijkstra may be WRONG here. Use Bellman-Ford.":"Done. All reachable vertices settled.",dist:n,parent:c,settled:r,pq:l,current:null,relaxed:null,sawNegative:i})),o}
function _t(a){return a===1/0?"∞":a}
function Jo(a){const t=new Map;for(const s of a.vertices)t.set(s.id,[]);for(const s of a.edges)t.get(s.u).push({to:s.v,w:s.w,key:$s(s.u,s.v)}),a.directed||t.get(s.v).push({to:s.u,w:s.w,key:$s(s.u,s.v)});return t}
function $s(a,t){return a<t?`${a}-${t}`:`${t}-${a}`}
function Te(a){return{message:a.message,dist:new Map(a.dist),parent:new Map(a.parent),settled:new Set(a.settled),pq:a.pq.slice().sort((t,s)=>t.d-s.d).map(t=>({...t})),current:a.current,relaxed:a.relaxed,sawNegative:a.sawNegative}}
function Ot(){return{vertices:[{id:"A",x:80,y:140},{id:"B",x:220,y:60},{id:"C",x:220,y:220},{id:"D",x:360,y:60},{id:"E",x:360,y:220},{id:"F",x:500,y:140}],edges:[{u:"A",v:"B",w:4},{u:"A",v:"C",w:2},{u:"B",v:"C",w:1},{u:"B",v:"D",w:5},{u:"C",v:"D",w:8},{u:"C",v:"E",w:10},{u:"D",v:"E",w:2},{u:"D",v:"F",w:6},{u:"E",v:"F",w:3}],directed:!1}}
function ei(a){const t=a.edges.map(o=>({...o})),s=t.find(o=>o.u==="B"&&o.v==="C"||o.u==="C"&&o.v==="B");return s&&(s.w=-6),{...a,edges:t}}
const ti=`
.djw-root {
  display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden;
}
.djw-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e;
}
.djw-title { font-weight:600; font-size:15px; }
.djw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.djw-bar {
  display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap;
}
.djw-btn {
  padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit;
}
.djw-btn:hover { background:#3b6ae8; }
.djw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.djw-btn.ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.djw-btn.warn { background:#c13c3c; }
.djw-btn.warn:hover { background:#a73232; }
.djw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.djw-select { padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit; }
.djw-hint { color:#8a93a8; font-size:12px; }
.djw-main { flex:1; display:flex; min-height:360px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.djw-canvas { flex:1; padding:16px; overflow:auto; }
.djw-side {
  width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto;
}
.djw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.djw-pq-box { display:flex; flex-direction:column; gap:4px; min-height:24px; margin-bottom:14px; }
.djw-pq-row { padding:3px 8px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f; display:flex; justify-content:space-between; }
.djw-pq-row.top { background:#3a4a70; border-color:#ffd24a; }
.djw-table { width:100%; border-collapse:collapse; }
.djw-table td { padding:2px 6px; }
.djw-table td.l { color:#8a93a8; }
.djw-footer {
  display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap;
}
.djw-status { color:#d1d5db; flex:1; min-width:0; }
.djw-status.warn { color:#ff9f40; }
.djw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.djw-stats b { color:#e6e6e6; }
.djw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease, filter 300ms ease; }
.djw-node.settled circle { fill:#1f3a2e; stroke:#4a9f6f; }
.djw-node.current circle { stroke:#ffd24a; stroke-width:3;
  filter:drop-shadow(0 0 8px rgba(255,210,74,0.7)); }
.djw-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.djw-lvl { fill:#8a93a8; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.djw-edge { stroke:#3a4560; stroke-width:1.8; fill:none;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.djw-edge.relax { stroke:#ffd24a; stroke-width:3; }
.djw-edge.neg { stroke:#ff5c5c; stroke-dasharray:6 4; }
.djw-elabel {
  fill:#d1d5db; font-size:11px; text-anchor:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
}
`;
function si(){const[a,t]=h.useState(()=>Ot()),[s,o]=h.useState("A"),[n,c]=h.useState(()=>Ss(Ot(),"A")),[r,l]=h.useState(0),[i,d]=h.useState(!1),f=h.useRef(null);h.useEffect(()=>{c(Ss(a,s)),l(0),d(!1)},[a,s]),h.useEffect(()=>{if(i)return f.current=setTimeout(()=>{l($=>$>=n.length-1?(d(!1),$):$+1)},700),()=>clearTimeout(f.current)},[i,r,n.length]);const p=n[r];function u(){l($=>Math.min($+1,n.length-1))}function m(){l($=>Math.max($-1,0))}function w(){l(0),d(!1)}function b(){t(ei(a))}function k(){t(Ot())}return e.jsxs("div",{className:"djw-root",children:[e.jsx("style",{children:ti}),e.jsx("div",{className:"djw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"djw-title",children:"Dijkstra's Shortest Paths"}),e.jsx("div",{className:"djw-sub",children:"Greedy settle via priority queue. Requires non-negative edge weights."})]})}),e.jsxs("div",{className:"djw-bar",children:[e.jsx("span",{className:"djw-hint",children:"Source:"}),e.jsx("select",{className:"djw-select",value:s,onChange:$=>o($.target.value),children:a.vertices.map($=>e.jsx("option",{value:$.id,children:$.id},$.id))}),e.jsx("button",{className:"djw-btn ghost",onClick:m,disabled:r===0,children:"Prev"}),e.jsx("button",{className:"djw-btn",onClick:()=>d($=>!$),children:i?"Pause":"Play"}),e.jsx("button",{className:"djw-btn ghost",onClick:u,disabled:r>=n.length-1,children:"Next"}),e.jsx("button",{className:"djw-btn ghost",onClick:w,children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"djw-btn warn",onClick:b,children:"Add negative edge"}),e.jsx("button",{className:"djw-btn ghost",onClick:k,children:"Restore"}),e.jsxs("span",{className:"djw-hint",children:["step ",r+1,"/",n.length]})]}),e.jsxs("div",{className:"djw-main",children:[e.jsx("div",{className:"djw-canvas",children:e.jsxs("svg",{width:600,height:300,viewBox:"0 0 600 300",children:[e.jsx("g",{children:a.edges.map(($,g)=>{const z=a.vertices.find(C=>C.id===$.u),F=a.vertices.find(C=>C.id===$.v),M=$.u<$.v?`${$.u}-${$.v}`:`${$.v}-${$.u}`;let y="djw-edge";return p.relaxed===M&&(y+=" relax"),$.w<0&&(y+=" neg"),e.jsxs("g",{children:[e.jsx("line",{className:y,x1:z.x,y1:z.y,x2:F.x,y2:F.y}),e.jsx("text",{className:"djw-elabel",x:(z.x+F.x)/2,y:(z.y+F.y)/2-6,children:$.w})]},g)})}),e.jsx("g",{children:a.vertices.map($=>{const g=["djw-node"];p.settled.has($.id)&&g.push("settled"),p.current===$.id&&g.push("current");const z=p.dist.get($.id);return e.jsxs("g",{className:g.join(" "),children:[e.jsx("circle",{cx:$.x,cy:$.y,r:22}),e.jsx("text",{x:$.x,y:$.y,children:$.id}),e.jsxs("text",{className:"djw-lvl",x:$.x,y:$.y+34,children:["d=",z===1/0?"∞":z]})]},$.id)})})]})}),e.jsxs("div",{className:"djw-side",children:[e.jsx("h4",{children:"Priority Queue (min-first)"}),e.jsx("div",{className:"djw-pq-box",children:p.pq.length===0?e.jsx("span",{className:"djw-hint",children:"empty"}):p.pq.map(($,g)=>e.jsxs("div",{className:"djw-pq-row"+(g===0?" top":""),children:[e.jsx("span",{children:$.id}),e.jsxs("span",{children:["d=",$.d]})]},g))}),e.jsx("h4",{children:"dist[] / parent[]"}),e.jsx("table",{className:"djw-table",children:e.jsx("tbody",{children:a.vertices.map($=>e.jsxs("tr",{children:[e.jsx("td",{className:"l",children:$.id}),e.jsx("td",{children:p.dist.get($.id)===1/0?"∞":p.dist.get($.id)}),e.jsx("td",{children:p.parent.get($.id)??"·"})]},$.id))})})]})]}),e.jsxs("div",{className:"djw-footer",children:[e.jsxs("div",{className:"djw-status"+(p.sawNegative?" warn":""),children:["Status: ",p.message]}),e.jsxs("div",{className:"djw-stats",children:["settled=",e.jsx("b",{children:p.settled.size}),"/",e.jsx("b",{children:a.vertices.length}),"   pq=",e.jsx("b",{children:p.pq.length})]})]})]})}

export default si;
export { si as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(si, {}));
  return () => root.unmount();
}
