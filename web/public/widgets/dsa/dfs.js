import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const js=0,vs=1,Vo=2;
function Ns(a,t){const s=Xo(a),o=[],n=new Map,c=new Map,r=new Map,l=new Map,i=[],d=new Map;let f=0;for(const u of a.vertices)n.set(u.id,js);o.push(Se({message:`Start DFS from ${t}.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:null,time:f}));function p(u){const m=[{u,iter:0,started:!1}];for(;m.length;){const w=m[m.length-1];w.started||(w.started=!0,f++,n.set(w.u,vs),c.set(w.u,f),l.has(w.u)||l.set(w.u,null),i.push(w.u),o.push(Se({message:`enter ${w.u}. disc[${w.u}]=${f}. push.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:w.u,time:f})));const b=s.get(w.u)||[];if(w.iter<b.length){const k=b[w.iter++],$=`${w.u}->${k}`,g=n.get(k);if(g===js)d.set($,"tree"),l.set(k,w.u),o.push(Se({message:`  (${w.u},${k}) tree edge — recurse into ${k}.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:w.u,time:f})),m.push({u:k,iter:0,started:!1});else if(g===vs)d.set($,"back"),o.push(Se({message:`  (${w.u},${k}) BACK edge → cycle.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:w.u,time:f}));else{const z=c.get(w.u)<c.get(k)?"forward":"cross";d.set($,z),o.push(Se({message:`  (${w.u},${k}) ${z.toUpperCase()} edge.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:w.u,time:f}))}}else f++,n.set(w.u,Vo),r.set(w.u,f),i.pop(),o.push(Se({message:`finish ${w.u}. fin[${w.u}]=${f}. pop.`,color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:i.length?i[i.length-1]:null,time:f})),m.pop()}}return p(t),o.push(Se({message:"DFS complete. Tree/back/forward/cross edges classified.",color:n,disc:c,finish:r,parent:l,stack:i,edgeClass:d,current:null,time:f})),o}
function Xo(a){const t=new Map;for(const s of a.vertices)t.set(s.id,[]);for(const s of a.edges)t.get(s.u).push(s.v),a.directed||t.get(s.v).push(s.u);return t}
function Se(a){return{message:a.message,color:new Map(a.color),disc:new Map(a.disc),finish:new Map(a.finish),parent:new Map(a.parent),stack:a.stack.slice(),edgeClass:new Map(a.edgeClass),current:a.current,time:a.time}}
function Yo(){return{vertices:[{id:"A",x:100,y:80},{id:"B",x:260,y:60},{id:"C",x:260,y:180},{id:"D",x:420,y:60},{id:"E",x:420,y:180},{id:"F",x:560,y:120},{id:"G",x:420,y:280}],edges:[{u:"A",v:"B"},{u:"A",v:"C"},{u:"B",v:"D"},{u:"D",v:"E"},{u:"E",v:"C"},{u:"C",v:"G"},{u:"G",v:"E"},{u:"D",v:"F"},{u:"A",v:"D"}],directed:!0}}
const Qo=`
.dfw-root {
  display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden;
}
.dfw-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e;
}
.dfw-title { font-weight:600; font-size:15px; }
.dfw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.dfw-bar {
  display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap;
}
.dfw-btn {
  padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px;
  font-family:inherit;
}
.dfw-btn:hover { background:#3b6ae8; }
.dfw-btn.ghost {
  background:transparent; border:1px solid #2a2f3e; color:#d1d5db;
}
.dfw-btn.ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.dfw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.dfw-select {
  padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit;
}
.dfw-hint { color:#8a93a8; font-size:12px; }
.dfw-main { flex:1; display:flex; min-height:360px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.dfw-canvas { flex:1; padding:16px; overflow:auto; }
.dfw-side {
  width:250px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto;
}
.dfw-side h4 {
  margin:4px 0 6px 0; font-size:12px; color:#8a93a8; text-transform:uppercase;
  letter-spacing:0.06em; font-weight:600;
}
.dfw-stack-box {
  display:flex; flex-direction:column; gap:4px; margin-bottom:12px; min-height:24px;
}
.dfw-frame {
  padding:4px 8px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f;
}
.dfw-frame.top { background:#3a4a70; border-color:#ffd24a; }
.dfw-table { width:100%; border-collapse:collapse; font-size:11px; }
.dfw-table td { padding:2px 4px; }
.dfw-table td.l { color:#8a93a8; }
.dfw-legend { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; font-size:11px; }
.dfw-legend span { display:inline-flex; align-items:center; gap:4px; }
.dfw-legend i { width:14px; height:3px; display:inline-block; border-radius:2px; }
.dfw-footer {
  display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap;
}
.dfw-status { color:#d1d5db; flex:1; min-width:0; }
.dfw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.dfw-stats b { color:#e6e6e6; }
.dfw-node circle {
  fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 250ms ease, stroke 250ms ease, filter 250ms ease;
}
.dfw-node.gray circle { fill:#3a3a20; stroke:#ffd24a; }
.dfw-node.black circle { fill:#1f3a2e; stroke:#4a9f6f; }
.dfw-node.current circle { stroke:#ff9f40; stroke-width:3;
  filter:drop-shadow(0 0 8px rgba(255,159,64,0.7)); }
.dfw-node text {
  fill:#e6e6e6; font-size:13px; text-anchor:middle; dominant-baseline:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none;
}
.dfw-lvl { fill:#8a93a8; font-size:10px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.dfw-edge { fill:none; stroke:#3a4560; stroke-width:1.6;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.dfw-edge.tree { stroke:#4a9f6f; stroke-width:2.4; }
.dfw-edge.back { stroke:#ff5c5c; stroke-width:2.4; stroke-dasharray:6 4; }
.dfw-edge.forward { stroke:#4a7cff; stroke-width:2.2; stroke-dasharray:2 3; }
.dfw-edge.cross { stroke:#c678dd; stroke-width:2.2; stroke-dasharray:4 4; }
`;
function Zo(){const a=h.useMemo(()=>Yo(),[]),[t,s]=h.useState("A"),[o,n]=h.useState(()=>Ns(a,"A")),[c,r]=h.useState(0),[l,i]=h.useState(!1),d=h.useRef(null);h.useEffect(()=>{n(Ns(a,t)),r(0),i(!1)},[t,a]),h.useEffect(()=>{if(l)return d.current=setTimeout(()=>{r(b=>b>=o.length-1?(i(!1),b):b+1)},700),()=>clearTimeout(d.current)},[l,c,o.length]);const f=o[c];function p(){r(b=>Math.min(b+1,o.length-1))}function u(){r(b=>Math.max(b-1,0))}function m(){r(0),i(!1)}function w(b,k){const $=k.x-b.x,g=k.y-b.y,z=Math.hypot($,g)||1,F=-g/z*14,M=$/z*14,y=(b.x+k.x)/2+F,C=(b.y+k.y)/2+M,T=k.x-$/z*24,v=k.y-g/z*24;return`M ${b.x} ${b.y} Q ${y} ${C} ${T} ${v}`}return e.jsxs("div",{className:"dfw-root",children:[e.jsx("style",{children:Qo}),e.jsx("div",{className:"dfw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"dfw-title",children:"Depth-First Search — Edge Classification"}),e.jsx("div",{className:"dfw-sub",children:"Discovery/finish timestamps; tree, back (cycle), forward, and cross edges."})]})}),e.jsxs("div",{className:"dfw-bar",children:[e.jsx("span",{className:"dfw-hint",children:"Source:"}),e.jsx("select",{className:"dfw-select",value:t,onChange:b=>s(b.target.value),children:a.vertices.map(b=>e.jsx("option",{value:b.id,children:b.id},b.id))}),e.jsx("button",{className:"dfw-btn ghost",onClick:u,disabled:c===0,children:"Prev"}),e.jsx("button",{className:"dfw-btn",onClick:()=>i(b=>!b),children:l?"Pause":"Play"}),e.jsx("button",{className:"dfw-btn ghost",onClick:p,disabled:c>=o.length-1,children:"Next"}),e.jsx("button",{className:"dfw-btn ghost",onClick:m,children:"Reset"}),e.jsxs("span",{className:"dfw-hint",children:["step ",c+1,"/",o.length,"   time=",f.time]})]}),e.jsxs("div",{className:"dfw-main",children:[e.jsx("div",{className:"dfw-canvas",children:e.jsxs("svg",{width:680,height:340,viewBox:"0 0 680 340",children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"dfw-arrow",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#6a7389"})}),e.jsx("marker",{id:"dfw-arrow-tree",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#4a9f6f"})}),e.jsx("marker",{id:"dfw-arrow-back",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#ff5c5c"})})]}),e.jsx("g",{children:a.edges.map((b,k)=>{const $=a.vertices.find(C=>C.id===b.u),g=a.vertices.find(C=>C.id===b.v),z=`${b.u}->${b.v}`,F=f.edgeClass.get(z);let M="url(#dfw-arrow)",y="dfw-edge";return F==="tree"&&(y+=" tree",M="url(#dfw-arrow-tree)"),F==="back"&&(y+=" back",M="url(#dfw-arrow-back)"),F==="forward"&&(y+=" forward"),F==="cross"&&(y+=" cross"),e.jsx("path",{className:y,d:w($,g),markerEnd:M},k)})}),e.jsx("g",{children:a.vertices.map(b=>{const k=f.color.get(b.id),$=["dfw-node"];k===1&&$.push("gray"),k===2&&$.push("black"),f.current===b.id&&$.push("current");const g=f.disc.get(b.id),z=f.finish.get(b.id);return e.jsxs("g",{className:$.join(" "),children:[e.jsx("circle",{cx:b.x,cy:b.y,r:22}),e.jsx("text",{x:b.x,y:b.y,children:b.id}),g!==void 0&&e.jsxs("text",{className:"dfw-lvl",x:b.x,y:b.y+34,children:[g,"/",z??"·"]})]},b.id)})})]})}),e.jsxs("div",{className:"dfw-side",children:[e.jsxs("div",{className:"dfw-legend",children:[e.jsxs("span",{children:[e.jsx("i",{style:{background:"#4a9f6f"}}),"tree"]}),e.jsxs("span",{children:[e.jsx("i",{style:{background:"#ff5c5c"}}),"back"]}),e.jsxs("span",{children:[e.jsx("i",{style:{background:"#4a7cff"}}),"fwd"]}),e.jsxs("span",{children:[e.jsx("i",{style:{background:"#c678dd"}}),"cross"]})]}),e.jsx("h4",{children:"Call Stack (bottom → top)"}),e.jsx("div",{className:"dfw-stack-box",children:f.stack.length===0?e.jsx("span",{className:"dfw-hint",children:"empty"}):f.stack.map((b,k)=>e.jsxs("div",{className:"dfw-frame"+(k===f.stack.length-1?" top":""),children:[k===f.stack.length-1?"▶ ":"  ",b]},k))}),e.jsx("h4",{children:"Timestamps (disc / fin)"}),e.jsx("table",{className:"dfw-table",children:e.jsx("tbody",{children:a.vertices.map(b=>e.jsxs("tr",{children:[e.jsx("td",{className:"l",children:b.id}),e.jsx("td",{children:f.disc.has(b.id)?f.disc.get(b.id):"—"}),e.jsx("td",{children:f.finish.has(b.id)?f.finish.get(b.id):"—"})]},b.id))})})]})]}),e.jsxs("div",{className:"dfw-footer",children:[e.jsxs("div",{className:"dfw-status",children:["Status: ",f.message]}),e.jsxs("div",{className:"dfw-stats",children:["time=",e.jsx("b",{children:f.time}),"   stack=",e.jsx("b",{children:f.stack.length}),"   edges-classified=",e.jsx("b",{children:f.edgeClass.size}),"/",e.jsx("b",{children:a.edges.length})]})]})]})}

export default Zo;
export { Zo as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Zo, {}));
  return () => root.unmount();
}
