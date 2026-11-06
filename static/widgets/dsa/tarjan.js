import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function vi(a){const t=new Map;for(const p of a.vertices)t.set(p.id,[]);for(const p of a.edges)t.get(p.u).push(p.v);const s=[],o=new Map,n=new Map,c=new Set,r=[];let l=0;const i=new Map;let d=0;s.push(be({message:"Tarjan: iterative DFS, track disc/low, keep a stack of active vertices. Form an SCC when low[u]==disc[u].",disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:null,popped:[]}));for(const p of a.vertices)o.has(p.id)||f(p.id);function f(p){const u=[{u:p,iter:0,started:!1}];for(;u.length;){const m=u[u.length-1];m.started||(m.started=!0,l++,o.set(m.u,l),n.set(m.u,l),r.push(m.u),c.add(m.u),s.push(be({message:`visit ${m.u}: disc=low=${l}. push onto stack.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:m.u,popped:[]})));const w=t.get(m.u)||[];if(m.iter<w.length){const b=w[m.iter++];if(!o.has(b))s.push(be({message:`  recurse into ${b} from ${m.u}.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:m.u,popped:[]})),u.push({u:b,iter:0,started:!1,parent:m.u});else if(c.has(b)){const k=Math.min(n.get(m.u),o.get(b));n.set(m.u,k),s.push(be({message:`  back edge (${m.u},${b}): low[${m.u}] = min(low[${m.u}], disc[${b}]) = ${k}.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:m.u,popped:[]}))}else s.push(be({message:`  cross/forward edge (${m.u},${b}) into already-finished SCC — ignore.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:m.u,popped:[]}))}else{if(n.get(m.u)===o.get(m.u)){const b=[];for(d++;;){const k=r.pop();if(c.delete(k),i.set(k,d),b.push(k),k===m.u)break}s.push(be({message:`SCC #${d} formed at root ${m.u}: {${b.join(", ")}}.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:m.u,popped:b}))}if(u.pop(),u.length){const b=u[u.length-1],k=Math.min(n.get(b.u),n.get(m.u));n.set(b.u,k),s.push(be({message:`return from ${m.u} → ${b.u}: low[${b.u}] = min(low[${b.u}], low[${m.u}]) = ${k}.`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:b.u,popped:[]}))}}}}return s.push(be({message:`Done. Found ${d} SCC(s).`,disc:o,low:n,stack:r,onStack:c,sccOf:i,sccCount:d,current:null,popped:[]})),s}
function be(a){return{message:a.message,disc:new Map(a.disc),low:new Map(a.low),stack:a.stack.slice(),onStack:new Set(a.onStack),sccOf:new Map(a.sccOf),sccCount:a.sccCount,current:a.current,popped:a.popped.slice()}}
function Ni(){return{vertices:[{id:"A",x:80,y:80},{id:"B",x:220,y:40},{id:"C",x:220,y:140},{id:"D",x:360,y:80},{id:"E",x:500,y:40},{id:"F",x:500,y:140},{id:"G",x:360,y:220},{id:"H",x:220,y:260}],edges:[{u:"A",v:"B"},{u:"B",v:"C"},{u:"C",v:"A"},{u:"B",v:"D"},{u:"D",v:"E"},{u:"E",v:"F"},{u:"F",v:"D"},{u:"D",v:"G"},{u:"G",v:"H"},{u:"H",v:"G"}],directed:!0}}
const Si=`
.tjw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.tjw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.tjw-title { font-weight:600; font-size:15px; }
.tjw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.tjw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.tjw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.tjw-btn:hover { background:#3b6ae8; }
.tjw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.tjw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.tjw-hint { color:#8a93a8; font-size:12px; }
.tjw-main { flex:1; display:flex; min-height:380px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.tjw-canvas { flex:1; padding:16px; overflow:auto; }
.tjw-side { width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto; }
.tjw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.tjw-stack { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; min-height:24px; }
.tjw-frame { padding:3px 8px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f; }
.tjw-frame.top { background:#3a4a70; border-color:#ffd24a; }
.tjw-table { width:100%; border-collapse:collapse; }
.tjw-table td { padding:2px 4px; font-size:11px; }
.tjw-table td.l { color:#8a93a8; }
.tjw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.tjw-status { color:#d1d5db; flex:1; min-width:0; }
.tjw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.tjw-stats b { color:#e6e6e6; }
.tjw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease, filter 300ms ease; }
.tjw-node.on-stack circle { fill:#2a3550; stroke:#c678dd; }
.tjw-node.current circle { stroke:#ffd24a; stroke-width:3;
  filter:drop-shadow(0 0 8px rgba(255,210,74,0.7)); }
.tjw-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.tjw-sub-text { fill:#8a93a8; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.tjw-edge { stroke:#3a4560; stroke-width:1.6; fill:none; }
`,Rs=["#1f3a2e","#3a2a5c","#2a3550","#5c3a2a","#2a4a4a","#4a4a2a"],Es=["#4a9f6f","#c678dd","#4a7cff","#ff9f40","#56b6c2","#e5c07b"];
function $i(){const a=h.useMemo(()=>Ni(),[]),t=h.useMemo(()=>vi(a),[a]),[s,o]=h.useState(0),[n,c]=h.useState(!1),r=h.useRef(null);h.useEffect(()=>{if(n)return r.current=setTimeout(()=>{o(u=>u>=t.length-1?(c(!1),u):u+1)},600),()=>clearTimeout(r.current)},[n,s,t.length]);const l=t[s];function i(){o(u=>Math.min(u+1,t.length-1))}function d(){o(u=>Math.max(u-1,0))}function f(){o(0),c(!1)}function p(u,m){const w=m.x-u.x,b=m.y-u.y,k=Math.hypot(w,b)||1,$=-b/k*12,g=w/k*12,z=(u.x+m.x)/2+$,F=(u.y+m.y)/2+g,M=m.x-w/k*24,y=m.y-b/k*24;return`M ${u.x} ${u.y} Q ${z} ${F} ${M} ${y}`}return e.jsxs("div",{className:"tjw-root",children:[e.jsx("style",{children:Si}),e.jsx("div",{className:"tjw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"tjw-title",children:"Tarjan's SCC Algorithm"}),e.jsx("div",{className:"tjw-sub",children:"Single DFS finds all strongly connected components using disc/low and an explicit stack."})]})}),e.jsxs("div",{className:"tjw-bar",children:[e.jsx("button",{className:"tjw-btn ghost",onClick:d,disabled:s===0,children:"Prev"}),e.jsx("button",{className:"tjw-btn",onClick:()=>c(u=>!u),children:n?"Pause":"Play"}),e.jsx("button",{className:"tjw-btn ghost",onClick:i,disabled:s>=t.length-1,children:"Next"}),e.jsx("button",{className:"tjw-btn ghost",onClick:f,children:"Reset"}),e.jsxs("span",{className:"tjw-hint",children:["step ",s+1,"/",t.length]})]}),e.jsxs("div",{className:"tjw-main",children:[e.jsx("div",{className:"tjw-canvas",children:e.jsxs("svg",{width:600,height:320,viewBox:"0 0 600 320",children:[e.jsx("defs",{children:e.jsx("marker",{id:"tjw-arrow",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#6a7389"})})}),a.edges.map((u,m)=>{const w=a.vertices.find(k=>k.id===u.u),b=a.vertices.find(k=>k.id===u.v);return e.jsx("path",{className:"tjw-edge",d:p(w,b),markerEnd:"url(#tjw-arrow)"},m)}),a.vertices.map(u=>{const m=["tjw-node"];l.onStack.has(u.id)&&m.push("on-stack"),l.current===u.id&&m.push("current");const w=l.sccOf.get(u.id),b=w?Rs[(w-1)%Rs.length]:null,k=w?Es[(w-1)%Es.length]:null,$=l.disc.get(u.id),g=l.low.get(u.id);return e.jsxs("g",{className:m.join(" "),children:[e.jsx("circle",{cx:u.x,cy:u.y,r:22,style:b?{fill:b,stroke:k}:void 0}),e.jsx("text",{x:u.x,y:u.y,children:u.id}),e.jsx("text",{className:"tjw-sub-text",x:u.x,y:u.y+34,children:$!==void 0?`${$}/${g}`:"—"}),w&&e.jsxs("text",{className:"tjw-sub-text",x:u.x,y:u.y-30,style:{fill:k},children:["SCC",w]})]},u.id)})]})}),e.jsxs("div",{className:"tjw-side",children:[e.jsx("h4",{children:"DFS Stack (bottom → top)"}),e.jsx("div",{className:"tjw-stack",children:l.stack.length===0?e.jsx("span",{className:"tjw-hint",children:"empty"}):l.stack.map((u,m)=>e.jsx("div",{className:"tjw-frame"+(m===l.stack.length-1?" top":""),children:u},m))}),e.jsx("h4",{children:"disc / low"}),e.jsx("table",{className:"tjw-table",children:e.jsx("tbody",{children:a.vertices.map(u=>e.jsxs("tr",{children:[e.jsx("td",{className:"l",children:u.id}),e.jsx("td",{children:l.disc.has(u.id)?l.disc.get(u.id):"—"}),e.jsx("td",{children:l.low.has(u.id)?l.low.get(u.id):"—"}),e.jsx("td",{children:l.sccOf.has(u.id)?`SCC${l.sccOf.get(u.id)}`:""})]},u.id))})})]})]}),e.jsxs("div",{className:"tjw-footer",children:[e.jsxs("div",{className:"tjw-status",children:["Status: ",l.message]}),e.jsxs("div",{className:"tjw-stats",children:["sccs=",e.jsx("b",{children:l.sccCount}),"   stack=",e.jsx("b",{children:l.stack.length})]})]})]})}

export default $i;
export { $i as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx($i, {}));
  return () => root.unmount();
}
