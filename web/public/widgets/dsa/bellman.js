import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Ms(a,t){const s=a.vertices.length,o=[],n=new Map,c=new Map;for(const i of a.vertices)n.set(i.id,1/0),c.set(i.id,null);n.set(t,0),o.push($e({message:`Initialize. dist[${t}]=0, others ∞. Will do ${s-1} rounds.`,dist:n,parent:c,round:0,relaxed:null,negCycle:!1,negCycleEdges:new Set}));let r=!0;for(let i=1;i<=s-1&&r;i++){r=!1,o.push($e({message:`--- Round ${i}/${s-1} begins. Relax every edge.`,dist:n,parent:c,round:i,relaxed:null,negCycle:!1,negCycleEdges:new Set}));for(const d of a.edges){const f=(p,u,m)=>{const w=n.get(p);if(w===1/0)return!1;const b=w+m;if(b<n.get(u)){const k=n.get(u);return n.set(u,b),c.set(u,p),o.push($e({message:`  relax (${p},${u}) w=${m}: dist[${u}] ${k===1/0?"∞":k} → ${b}.`,dist:n,parent:c,round:i,relaxed:Wt(p,u),negCycle:!1,negCycleEdges:new Set})),!0}return!1};f(d.u,d.v,d.w)&&(r=!0),a.directed||f(d.v,d.u,d.w)&&(r=!0)}r||o.push($e({message:"  no relaxations this round — early exit (converged).",dist:n,parent:c,round:i,relaxed:null,negCycle:!1,negCycleEdges:new Set}))}o.push($e({message:"--- V-th round: probe for negative cycles.",dist:n,parent:c,round:s,relaxed:null,negCycle:!1,negCycleEdges:new Set}));const l=new Set;for(const i of a.edges){const d=a.directed?[[i.u,i.v]]:[[i.u,i.v],[i.v,i.u]];for(const[f,p]of d){const u=n.get(f);u!==1/0&&u+i.w<n.get(p)&&(l.add(Wt(f,p)),o.push($e({message:`NEGATIVE CYCLE: edge (${f},${p}) still relaxes in round V. ABORT.`,dist:n,parent:c,round:s,relaxed:Wt(f,p),negCycle:!0,negCycleEdges:l})))}}return l.size===0&&o.push($e({message:`No negative cycle reachable from ${t}. dist[] is final.`,dist:n,parent:c,round:s,relaxed:null,negCycle:!1,negCycleEdges:new Set})),o}
function Wt(a,t){return`${a}->${t}`}
function $e(a){return{message:a.message,dist:new Map(a.dist),parent:new Map(a.parent),round:a.round,relaxed:a.relaxed,negCycle:a.negCycle,negCycleEdges:new Set(a.negCycleEdges)}}
function ht(){return{vertices:[{id:"S",x:60,y:140},{id:"A",x:200,y:60},{id:"B",x:200,y:220},{id:"C",x:340,y:60},{id:"D",x:340,y:220},{id:"E",x:480,y:140}],edges:[{u:"S",v:"A",w:6},{u:"S",v:"B",w:7},{u:"A",v:"C",w:5},{u:"A",v:"D",w:-4},{u:"B",v:"C",w:8},{u:"B",v:"D",w:-2},{u:"C",v:"E",w:-3},{u:"D",v:"E",w:9},{u:"E",v:"A",w:2}],directed:!0}}
function ni(a){const t=a.edges.map(s=>({...s}));return t.push({u:"E",v:"B",w:-10}),{...a,edges:t}}
const ai=`
.bmw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.bmw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.bmw-title { font-weight:600; font-size:15px; }
.bmw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.bmw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.bmw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.bmw-btn:hover { background:#3b6ae8; }
.bmw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.bmw-btn.ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.bmw-btn.warn { background:#c13c3c; }
.bmw-btn.warn:hover { background:#a73232; }
.bmw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.bmw-select { padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit; }
.bmw-hint { color:#8a93a8; font-size:12px; }
.bmw-main { flex:1; display:flex; min-height:360px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.bmw-canvas { flex:1; padding:16px; overflow:auto; }
.bmw-side { width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto; }
.bmw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.bmw-table { width:100%; border-collapse:collapse; margin-bottom:12px; }
.bmw-table td { padding:2px 6px; }
.bmw-table td.l { color:#8a93a8; }
.bmw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.bmw-status { color:#d1d5db; flex:1; min-width:0; }
.bmw-status.bad { color:#ff5c5c; }
.bmw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.bmw-stats b { color:#e6e6e6; }
.bmw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease; }
.bmw-node.reached circle { fill:#1f3a2e; stroke:#4a9f6f; }
.bmw-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.bmw-lvl { fill:#8a93a8; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.bmw-edge { stroke:#3a4560; stroke-width:1.8; fill:none; transition:stroke 250ms ease; }
.bmw-edge.relax { stroke:#ffd24a; stroke-width:2.8; }
.bmw-edge.neg { stroke:#c678dd; }
.bmw-edge.badcycle { stroke:#ff5c5c; stroke-width:3;
  filter:drop-shadow(0 0 6px rgba(255,92,92,0.7)); }
.bmw-elabel { fill:#d1d5db; font-size:11px; text-anchor:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
function oi(){const[a,t]=h.useState(()=>ht()),[s,o]=h.useState("S"),[n,c]=h.useState(()=>Ms(ht(),"S")),[r,l]=h.useState(0),[i,d]=h.useState(!1),f=h.useRef(null);h.useEffect(()=>{c(Ms(a,s)),l(0),d(!1)},[a,s]),h.useEffect(()=>{if(i)return f.current=setTimeout(()=>{l(g=>g>=n.length-1?(d(!1),g):g+1)},600),()=>clearTimeout(f.current)},[i,r,n.length]);const p=n[r];function u(){l(g=>Math.min(g+1,n.length-1))}function m(){l(g=>Math.max(g-1,0))}function w(){l(0),d(!1)}function b(){t(ni(ht()))}function k(){t(ht())}function $(g,z){const F=z.x-g.x,M=z.y-g.y,y=Math.hypot(F,M)||1,C=-M/y*12,T=F/y*12,v=(g.x+z.x)/2+C,I=(g.y+z.y)/2+T,j=z.x-F/y*24,x=z.y-M/y*24;return`M ${g.x} ${g.y} Q ${v} ${I} ${j} ${x}`}return e.jsxs("div",{className:"bmw-root",children:[e.jsx("style",{children:ai}),e.jsx("div",{className:"bmw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"bmw-title",children:"Bellman-Ford — Negative Edges & Cycles"}),e.jsx("div",{className:"bmw-sub",children:"V−1 edge-relaxation rounds. A V-th round that still relaxes signals a negative cycle."})]})}),e.jsxs("div",{className:"bmw-bar",children:[e.jsx("span",{className:"bmw-hint",children:"Source:"}),e.jsx("select",{className:"bmw-select",value:s,onChange:g=>o(g.target.value),children:a.vertices.map(g=>e.jsx("option",{value:g.id,children:g.id},g.id))}),e.jsx("button",{className:"bmw-btn ghost",onClick:m,disabled:r===0,children:"Prev"}),e.jsx("button",{className:"bmw-btn",onClick:()=>d(g=>!g),children:i?"Pause":"Play"}),e.jsx("button",{className:"bmw-btn ghost",onClick:u,disabled:r>=n.length-1,children:"Next"}),e.jsx("button",{className:"bmw-btn ghost",onClick:w,children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"bmw-btn warn",onClick:b,children:"Add negative cycle"}),e.jsx("button",{className:"bmw-btn ghost",onClick:k,children:"Restore"}),e.jsxs("span",{className:"bmw-hint",children:["round=",p.round,"   step ",r+1,"/",n.length]})]}),e.jsxs("div",{className:"bmw-main",children:[e.jsx("div",{className:"bmw-canvas",children:e.jsxs("svg",{width:560,height:300,viewBox:"0 0 560 300",children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"bmw-arrow",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#6a7389"})}),e.jsx("marker",{id:"bmw-arrow-bad",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#ff5c5c"})})]}),a.edges.map((g,z)=>{const F=a.vertices.find(v=>v.id===g.u),M=a.vertices.find(v=>v.id===g.v),y=`${g.u}->${g.v}`;let C="bmw-edge";g.w<0&&(C+=" neg"),p.relaxed===y&&(C+=" relax"),p.negCycleEdges.has(y)&&(C+=" badcycle");const T=p.negCycleEdges.has(y)?"url(#bmw-arrow-bad)":"url(#bmw-arrow)";return e.jsxs("g",{children:[e.jsx("path",{className:C,d:$(F,M),markerEnd:T}),e.jsx("text",{className:"bmw-elabel",x:(F.x+M.x)/2,y:(F.y+M.y)/2-6,children:g.w})]},z)}),a.vertices.map(g=>{const z=["bmw-node"],F=p.dist.get(g.id);return F!==void 0&&F!==1/0&&z.push("reached"),e.jsxs("g",{className:z.join(" "),children:[e.jsx("circle",{cx:g.x,cy:g.y,r:22}),e.jsx("text",{x:g.x,y:g.y,children:g.id}),e.jsxs("text",{className:"bmw-lvl",x:g.x,y:g.y+34,children:["d=",F===1/0?"∞":F]})]},g.id)})]})}),e.jsxs("div",{className:"bmw-side",children:[e.jsx("h4",{children:"dist[] / parent[]"}),e.jsx("table",{className:"bmw-table",children:e.jsx("tbody",{children:a.vertices.map(g=>e.jsxs("tr",{children:[e.jsx("td",{className:"l",children:g.id}),e.jsx("td",{children:p.dist.get(g.id)===1/0?"∞":p.dist.get(g.id)}),e.jsx("td",{children:p.parent.get(g.id)??"·"})]},g.id))})})]})]}),e.jsxs("div",{className:"bmw-footer",children:[e.jsxs("div",{className:"bmw-status"+(p.negCycle?" bad":""),children:["Status: ",p.message]}),e.jsxs("div",{className:"bmw-stats",children:["V=",e.jsx("b",{children:a.vertices.length}),"   E=",e.jsx("b",{children:a.edges.length}),"   round=",e.jsx("b",{children:p.round})]})]})]})}

export default oi;
export { oi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(oi, {}));
  return () => root.unmount();
}
