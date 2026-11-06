import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ks(a,t){const s=Wo(a),o=[],n=new Set,c=new Map,r=new Map,l=new Set,i=[];for(n.add(t),c.set(t,0),r.set(t,null),i.push(t),o.push(Ue({message:`Start BFS from ${t}. Enqueue ${t} (level 0).`,queue:i,visited:n,level:c,parent:r,current:null,frontier:[],treeEdges:l}));i.length;){const d=i.shift();o.push(Ue({message:`Dequeue ${d} (level ${c.get(d)}). Scan neighbors.`,queue:i,visited:n,level:c,parent:r,current:d,frontier:[],treeEdges:l}));const f=s.get(d)||[],p=[];for(const u of f)n.has(u)?o.push(Ue({message:`  skip ${u}: already visited.`,queue:i,visited:n,level:c,parent:r,current:d,frontier:p,treeEdges:l})):(n.add(u),c.set(u,c.get(d)+1),r.set(u,d),l.add(Uo(d,u)),i.push(u),p.push(u),o.push(Ue({message:`  discover ${u} via (${d},${u}). Level ${c.get(u)}. Enqueue.`,queue:i,visited:n,level:c,parent:r,current:d,frontier:p,treeEdges:l})))}return o.push(Ue({message:`BFS complete. ${n.size} vertex/vertices reached.`,queue:[],visited:n,level:c,parent:r,current:null,frontier:[],treeEdges:l})),o}
function Wo(a){const t=new Map;for(const s of a.vertices)t.set(s.id,[]);for(const s of a.edges)t.get(s.u).push(s.v),a.directed||t.get(s.v).push(s.u);return t}
function Uo(a,t){return a<t?`${a}-${t}`:`${t}-${a}`}
function Ue(a){return{message:a.message,queue:a.queue.slice(),visited:new Set(a.visited),level:new Map(a.level),parent:new Map(a.parent),current:a.current,frontier:a.frontier.slice(),treeEdges:new Set(a.treeEdges)}}
function Ko(){return{vertices:[{id:"A",x:100,y:100},{id:"B",x:240,y:60},{id:"C",x:240,y:160},{id:"D",x:380,y:60},{id:"E",x:380,y:160},{id:"F",x:520,y:100},{id:"G",x:520,y:220},{id:"H",x:380,y:260}],edges:[{u:"A",v:"B"},{u:"A",v:"C"},{u:"B",v:"D"},{u:"C",v:"E"},{u:"D",v:"F"},{u:"E",v:"F"},{u:"E",v:"H"},{u:"H",v:"G"},{u:"F",v:"G"}],directed:!1}}
const Ho=`
.bfw-root {
  display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden;
}
.bfw-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e;
}
.bfw-title { font-weight:600; font-size:15px; }
.bfw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.bfw-bar {
  display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap;
}
.bfw-btn {
  padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px;
  font-family:inherit;
}
.bfw-btn:hover { background:#3b6ae8; }
.bfw-btn.ghost {
  background:transparent; border:1px solid #2a2f3e; color:#d1d5db;
}
.bfw-btn.ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.bfw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.bfw-select, .bfw-input {
  padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit;
}
.bfw-hint { color:#8a93a8; font-size:12px; }
.bfw-main {
  flex:1; display:flex; min-height:360px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
}
.bfw-canvas { flex:1; padding:16px; overflow:auto; }
.bfw-side {
  width:240px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto;
}
.bfw-side h4 {
  margin:4px 0 6px 0; font-size:12px; color:#8a93a8; text-transform:uppercase;
  letter-spacing:0.06em; font-weight:600;
}
.bfw-queue-box {
  display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;
  min-height:28px;
}
.bfw-chip {
  padding:3px 8px; border-radius:4px;
  background:#2a3550; border:1px solid #4a5f8f; color:#e6e6e6;
}
.bfw-table { width:100%; border-collapse:collapse; margin-bottom:12px; }
.bfw-table td { padding:2px 6px; }
.bfw-table td.l { color:#8a93a8; }
.bfw-footer {
  display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap;
}
.bfw-status { color:#d1d5db; flex:1; min-width:0; }
.bfw-stats {
  color:#8a93a8; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap;
}
.bfw-stats b { color:#e6e6e6; }
.bfw-edge { stroke:#3a4560; stroke-width:1.8; fill:none;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.bfw-edge.tree { stroke:#4a9f6f; stroke-width:2.5; }
.bfw-edge.frontier { stroke:#ffd24a; stroke-width:2.5; }
.bfw-node circle {
  fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease, filter 300ms ease;
}
.bfw-node.visited circle { fill:#1f3a2e; stroke:#4a9f6f; }
.bfw-node.current circle { stroke:#ffd24a; stroke-width:3;
  filter:drop-shadow(0 0 8px rgba(255,210,74,0.7)); }
.bfw-node.frontier circle { stroke:#ff9f40; stroke-width:3; }
.bfw-node text {
  fill:#e6e6e6; font-size:13px; text-anchor:middle; dominant-baseline:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none;
}
.bfw-lvl {
  fill:#8a93a8; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
}
`,ys=["#4a7cff","#4a9f6f","#ffd24a","#ff9f40","#c678dd","#56b6c2","#e06c75"];
function Go(){const a=h.useMemo(()=>Ko(),[]),[t,s]=h.useState("A"),[o,n]=h.useState(()=>ks(a,"A")),[c,r]=h.useState(0),[l,i]=h.useState(!1),d=h.useRef(null);h.useEffect(()=>{n(ks(a,t)),r(0),i(!1)},[t,a]),h.useEffect(()=>{if(l)return d.current=setTimeout(()=>{r(b=>b>=o.length-1?(i(!1),b):b+1)},700),()=>clearTimeout(d.current)},[l,c,o.length]);const f=o[c],p=h.useMemo(()=>{const b=new Map;for(const k of a.vertices){const $=f.level.get(k.id);b.set(k.id,{visited:f.visited.has(k.id),current:f.current===k.id,frontier:f.frontier.includes(k.id),level:$})}return b},[f,a]);function u(){r(b=>Math.min(b+1,o.length-1))}function m(){r(b=>Math.max(b-1,0))}function w(){r(0),i(!1)}return e.jsxs("div",{className:"bfw-root",children:[e.jsx("style",{children:Ho}),e.jsx("div",{className:"bfw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"bfw-title",children:"Breadth-First Search"}),e.jsx("div",{className:"bfw-sub",children:"Queue-based level-order traversal. Discovers shortest-hop paths on unweighted graphs."})]})}),e.jsxs("div",{className:"bfw-bar",children:[e.jsx("span",{className:"bfw-hint",children:"Source:"}),e.jsx("select",{className:"bfw-select",value:t,onChange:b=>s(b.target.value),children:a.vertices.map(b=>e.jsx("option",{value:b.id,children:b.id},b.id))}),e.jsx("button",{className:"bfw-btn ghost",onClick:m,disabled:c===0,children:"Prev"}),e.jsx("button",{className:"bfw-btn",onClick:()=>i(b=>!b),children:l?"Pause":"Play"}),e.jsx("button",{className:"bfw-btn ghost",onClick:u,disabled:c>=o.length-1,children:"Next"}),e.jsx("button",{className:"bfw-btn ghost",onClick:w,children:"Reset"}),e.jsxs("span",{className:"bfw-hint",children:["step ",c+1,"/",o.length]})]}),e.jsxs("div",{className:"bfw-main",children:[e.jsx("div",{className:"bfw-canvas",children:e.jsxs("svg",{width:640,height:340,viewBox:"0 0 640 340",style:{display:"block"},children:[e.jsx("g",{children:a.edges.map((b,k)=>{const $=a.vertices.find(C=>C.id===b.u),g=a.vertices.find(C=>C.id===b.v),z=$.id<g.id?`${$.id}-${g.id}`:`${g.id}-${$.id}`,F=f.treeEdges.has(z),M=f.current&&(b.u===f.current&&f.frontier.includes(b.v)||b.v===f.current&&f.frontier.includes(b.u));let y="bfw-edge";return F?y+=" tree":M&&(y+=" frontier"),e.jsx("line",{className:y,x1:$.x,y1:$.y,x2:g.x,y2:g.y},k)})}),e.jsx("g",{children:a.vertices.map(b=>{const k=p.get(b.id),$=["bfw-node"];k.visited&&$.push("visited"),k.current&&$.push("current"),k.frontier&&$.push("frontier");const g=k.visited&&k.level!==void 0?ys[k.level%ys.length]:null;return e.jsxs("g",{className:$.join(" "),children:[e.jsx("circle",{cx:b.x,cy:b.y,r:22,style:g?{fill:g}:void 0}),e.jsx("text",{x:b.x,y:b.y,children:b.id}),k.level!==void 0&&e.jsxs("text",{className:"bfw-lvl",x:b.x,y:b.y+34,children:["L",k.level]})]},b.id)})})]})}),e.jsxs("div",{className:"bfw-side",children:[e.jsx("h4",{children:"Queue (front → back)"}),e.jsx("div",{className:"bfw-queue-box",children:f.queue.length===0?e.jsx("span",{className:"bfw-hint",children:"empty"}):f.queue.map((b,k)=>e.jsx("span",{className:"bfw-chip",children:b},k))}),e.jsx("h4",{children:"Parent / Level"}),e.jsx("table",{className:"bfw-table",children:e.jsx("tbody",{children:a.vertices.map(b=>e.jsxs("tr",{children:[e.jsx("td",{className:"l",children:b.id}),e.jsx("td",{children:f.parent.has(b.id)?f.parent.get(b.id)??"·":"—"}),e.jsx("td",{children:f.level.has(b.id)?`L${f.level.get(b.id)}`:"—"})]},b.id))})})]})]}),e.jsxs("div",{className:"bfw-footer",children:[e.jsxs("div",{className:"bfw-status",children:["Status: ",f.message]}),e.jsxs("div",{className:"bfw-stats",children:["visited=",e.jsx("b",{children:f.visited.size}),"/",e.jsx("b",{children:a.vertices.length}),"   queue=",e.jsx("b",{children:f.queue.length}),"   tree-edges=",e.jsx("b",{children:f.treeEdges.size})]})]})]})}

export default Go;
export { Go as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Go, {}));
  return () => root.unmount();
}
