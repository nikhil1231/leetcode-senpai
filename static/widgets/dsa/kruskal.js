import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class gt{constructor(t){this.n=t,this.parent=[],this.rank=[];for(let s=0;s<t;s++)this.parent.push(s),this.rank.push(0);this.lastOp=null}find(t){const s=[];let o=t;for(;this.parent[o]!==o;)s.push(o),o=this.parent[o];const n=o,c=[];for(const r of s)this.parent[r]!==n&&(this.parent[r]=n,c.push(r));return this.lastOp={type:"find",x:t,root:n,path:[...s,n],compressed:c},n}union(t,s){const o=this.find(t),n=this.find(s);if(o===n)return this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,merged:!1,note:"already in same set"},!1;let c,r;return this.rank[o]<this.rank[n]?(c=n,r=o):this.rank[o]>this.rank[n]?(c=o,r=n):(c=o,r=n,this.rank[c]++),this.parent[r]=c,this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,winner:c,loser:r,merged:!0,rankWinner:this.rank[c],rankLoser:this.rank[r]},!0}roots(){const t=new Set;for(let s=0;s<this.n;s++)t.add(this.find(s));return Array.from(t)}snapshot(){return{parent:this.parent.slice(),rank:this.rank.slice(),lastOp:this.lastOp?{...this.lastOp,path:this.lastOp.path?[...this.lastOp.path]:void 0,compressed:this.lastOp.compressed?[...this.lastOp.compressed]:void 0}:null}}}
function ln(a){const t=a.vertices.map(d=>d.id),s=new Map(t.map((d,f)=>[d,f])),o=a.edges.map((d,f)=>({...d,origIdx:f})).sort((d,f)=>d.w-f.w),n=new gt(t.length),c=new Set,r=new Set,l=[];let i=0;l.push(Pe({message:`Sorted ${o.length} edges by weight. Initialized ${t.length} singletons.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank}));for(let d=0;d<o.length;d++){const f=o[d],p=s.get(f.u),u=s.get(f.v),m=n.find(p),w=n.find(u);if(l.push(Pe({message:`consider (${f.u},${f.v}) w=${f.w}. find(${f.u})=${m}, find(${f.v})=${w}.`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),m===w)r.add(d),l.push(Pe({message:`  skip (${f.u},${f.v}): cycle (both in root ${m}).`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank}));else if(n.union(p,u),c.add(d),i+=f.w,l.push(Pe({message:`  add (${f.u},${f.v}) to MST. union roots ${m}/${w}. total=${i}.`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),c.size===t.length-1)return l.push(Pe({message:`MST has V−1=${t.length-1} edges. DONE. Total weight=${i}.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),l}return l.push(Pe({message:`No more edges. ${c.size<t.length-1?"Graph is disconnected (no spanning tree).":"Done."} total=${i}.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),l}
function Pe(a){return{message:a.message,sortedEdges:a.sortedEdges.slice(),currentEdge:a.currentEdge,mst:new Set(a.mst),skipped:new Set(a.skipped),totalWeight:a.totalWeight,parent:a.parent.slice(),rank:a.rank.slice()}}
function cn(){return{vertices:[{id:"A",x:80,y:60},{id:"B",x:260,y:40},{id:"C",x:440,y:60},{id:"D",x:80,y:200},{id:"E",x:260,y:180},{id:"F",x:440,y:200},{id:"G",x:170,y:280},{id:"H",x:370,y:280}],edges:[{u:"A",v:"B",w:4},{u:"A",v:"D",w:8},{u:"B",v:"C",w:7},{u:"B",v:"E",w:9},{u:"C",v:"F",w:3},{u:"D",v:"E",w:6},{u:"D",v:"G",w:2},{u:"E",v:"F",w:5},{u:"E",v:"H",w:10},{u:"F",v:"H",w:1},{u:"G",v:"H",w:11}],directed:!1}}
const bi=`
.krw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.krw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.krw-title { font-weight:600; font-size:15px; }
.krw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.krw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.krw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.krw-btn:hover { background:#3b6ae8; }
.krw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.krw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.krw-hint { color:#8a93a8; font-size:12px; }
.krw-main { flex:1; display:flex; flex-direction:column; min-height:400px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); overflow:auto; }
.krw-canvas { padding:16px; }
.krw-edges { padding:12px 16px; border-top:1px solid #2a2f3e;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
.krw-edges h4 { margin:0 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.krw-edge-list { display:flex; flex-wrap:wrap; gap:6px; }
.krw-chip {
  padding:4px 8px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f; display:inline-block;
}
.krw-chip.current { background:#3a4a70; border-color:#ffd24a; color:#ffd24a; }
.krw-chip.mst { background:#1f3a2e; border-color:#4a9f6f; color:#b6ebc9; }
.krw-chip.skipped { background:#3a2424; border-color:#ff5c5c; color:#ffb3b3;
  text-decoration:line-through; }
.krw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.krw-status { color:#d1d5db; flex:1; min-width:0; }
.krw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.krw-stats b { color:#e6e6e6; }
.krw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2; }
.krw-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.krw-edge { stroke:#3a4560; stroke-width:1.8; fill:none;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.krw-edge.current { stroke:#ffd24a; stroke-width:3; }
.krw-edge.mst { stroke:#4a9f6f; stroke-width:3; }
.krw-edge.skipped { stroke:#ff5c5c; stroke-dasharray:4 4; }
.krw-elabel { fill:#d1d5db; font-size:11px; text-anchor:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
function gi(){const a=h.useMemo(()=>cn(),[]),t=h.useMemo(()=>ln(a),[a]),[s,o]=h.useState(0),[n,c]=h.useState(!1),r=h.useRef(null);h.useEffect(()=>{if(n)return r.current=setTimeout(()=>{o(u=>u>=t.length-1?(c(!1),u):u+1)},600),()=>clearTimeout(r.current)},[n,s,t.length]);const l=t[s];function i(){o(u=>Math.min(u+1,t.length-1))}function d(){o(u=>Math.max(u-1,0))}function f(){o(0),c(!1)}function p(u){const m=l.sortedEdges[u],w=a.vertices.find(k=>k.id===m.u),b=a.vertices.find(k=>k.id===m.v);return{e:m,a:w,b}}return e.jsxs("div",{className:"krw-root",children:[e.jsx("style",{children:bi}),e.jsx("div",{className:"krw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"krw-title",children:"Kruskal's Minimum Spanning Tree"}),e.jsx("div",{className:"krw-sub",children:"Sort edges by weight. Greedily add each if endpoints aren't already connected (union-find)."})]})}),e.jsxs("div",{className:"krw-bar",children:[e.jsx("button",{className:"krw-btn ghost",onClick:d,disabled:s===0,children:"Prev"}),e.jsx("button",{className:"krw-btn",onClick:()=>c(u=>!u),children:n?"Pause":"Play"}),e.jsx("button",{className:"krw-btn ghost",onClick:i,disabled:s>=t.length-1,children:"Next"}),e.jsx("button",{className:"krw-btn ghost",onClick:f,children:"Reset"}),e.jsxs("span",{className:"krw-hint",children:["step ",s+1,"/",t.length]})]}),e.jsxs("div",{className:"krw-main",children:[e.jsx("div",{className:"krw-canvas",children:e.jsxs("svg",{width:560,height:340,viewBox:"0 0 560 340",children:[l.sortedEdges.map((u,m)=>{const{a:w,b}=p(m);let k="krw-edge";return l.mst.has(m)?k+=" mst":l.skipped.has(m)?k+=" skipped":l.currentEdge===m&&(k+=" current"),e.jsxs("g",{children:[e.jsx("line",{className:k,x1:w.x,y1:w.y,x2:b.x,y2:b.y}),e.jsx("text",{className:"krw-elabel",x:(w.x+b.x)/2,y:(w.y+b.y)/2-6,children:u.w})]},m)}),a.vertices.map(u=>e.jsxs("g",{className:"krw-node",children:[e.jsx("circle",{cx:u.x,cy:u.y,r:22}),e.jsx("text",{x:u.x,y:u.y,children:u.id})]},u.id))]})}),e.jsxs("div",{className:"krw-edges",children:[e.jsx("h4",{children:"Edges sorted by weight"}),e.jsx("div",{className:"krw-edge-list",children:l.sortedEdges.map((u,m)=>{let w="krw-chip";return l.mst.has(m)?w+=" mst":l.skipped.has(m)?w+=" skipped":l.currentEdge===m&&(w+=" current"),e.jsxs("span",{className:w,children:["(",u.u,",",u.v,") w=",u.w]},m)})})]})]}),e.jsxs("div",{className:"krw-footer",children:[e.jsxs("div",{className:"krw-status",children:["Status: ",l.message]}),e.jsxs("div",{className:"krw-stats",children:["mst-edges=",e.jsx("b",{children:l.mst.size}),"   weight=",e.jsx("b",{children:l.totalWeight}),"   skipped=",e.jsx("b",{children:l.skipped.size})]})]})]})}

export default gi;
export { gi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(gi, {}));
  return () => root.unmount();
}
