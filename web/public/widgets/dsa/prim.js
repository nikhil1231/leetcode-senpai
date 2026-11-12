import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class gt{constructor(t){this.n=t,this.parent=[],this.rank=[];for(let s=0;s<t;s++)this.parent.push(s),this.rank.push(0);this.lastOp=null}find(t){const s=[];let o=t;for(;this.parent[o]!==o;)s.push(o),o=this.parent[o];const n=o,c=[];for(const r of s)this.parent[r]!==n&&(this.parent[r]=n,c.push(r));return this.lastOp={type:"find",x:t,root:n,path:[...s,n],compressed:c},n}union(t,s){const o=this.find(t),n=this.find(s);if(o===n)return this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,merged:!1,note:"already in same set"},!1;let c,r;return this.rank[o]<this.rank[n]?(c=n,r=o):this.rank[o]>this.rank[n]?(c=o,r=n):(c=o,r=n,this.rank[c]++),this.parent[r]=c,this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,winner:c,loser:r,merged:!0,rankWinner:this.rank[c],rankLoser:this.rank[r]},!0}roots(){const t=new Set;for(let s=0;s<this.n;s++)t.add(this.find(s));return Array.from(t)}snapshot(){return{parent:this.parent.slice(),rank:this.rank.slice(),lastOp:this.lastOp?{...this.lastOp,path:this.lastOp.path?[...this.lastOp.path]:void 0,compressed:this.lastOp.compressed?[...this.lastOp.compressed]:void 0}:null}}}
function ln(a){const t=a.vertices.map(d=>d.id),s=new Map(t.map((d,f)=>[d,f])),o=a.edges.map((d,f)=>({...d,origIdx:f})).sort((d,f)=>d.w-f.w),n=new gt(t.length),c=new Set,r=new Set,l=[];let i=0;l.push(Pe({message:`Sorted ${o.length} edges by weight. Initialized ${t.length} singletons.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank}));for(let d=0;d<o.length;d++){const f=o[d],p=s.get(f.u),u=s.get(f.v),m=n.find(p),w=n.find(u);if(l.push(Pe({message:`consider (${f.u},${f.v}) w=${f.w}. find(${f.u})=${m}, find(${f.v})=${w}.`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),m===w)r.add(d),l.push(Pe({message:`  skip (${f.u},${f.v}): cycle (both in root ${m}).`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank}));else if(n.union(p,u),c.add(d),i+=f.w,l.push(Pe({message:`  add (${f.u},${f.v}) to MST. union roots ${m}/${w}. total=${i}.`,sortedEdges:o,currentEdge:d,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),c.size===t.length-1)return l.push(Pe({message:`MST has V−1=${t.length-1} edges. DONE. Total weight=${i}.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),l}return l.push(Pe({message:`No more edges. ${c.size<t.length-1?"Graph is disconnected (no spanning tree).":"Done."} total=${i}.`,sortedEdges:o,currentEdge:null,mst:c,skipped:r,totalWeight:i,parent:n.parent,rank:n.rank})),l}
function Pe(a){return{message:a.message,sortedEdges:a.sortedEdges.slice(),currentEdge:a.currentEdge,mst:new Set(a.mst),skipped:new Set(a.skipped),totalWeight:a.totalWeight,parent:a.parent.slice(),rank:a.rank.slice()}}
function cn(){return{vertices:[{id:"A",x:80,y:60},{id:"B",x:260,y:40},{id:"C",x:440,y:60},{id:"D",x:80,y:200},{id:"E",x:260,y:180},{id:"F",x:440,y:200},{id:"G",x:170,y:280},{id:"H",x:370,y:280}],edges:[{u:"A",v:"B",w:4},{u:"A",v:"D",w:8},{u:"B",v:"C",w:7},{u:"B",v:"E",w:9},{u:"C",v:"F",w:3},{u:"D",v:"E",w:6},{u:"D",v:"G",w:2},{u:"E",v:"F",w:5},{u:"E",v:"H",w:10},{u:"F",v:"H",w:1},{u:"G",v:"H",w:11}],directed:!1}}
function ki(a,t){const s=new Map;for(const i of a.vertices)s.set(i.id,[]);for(const i of a.edges)s.get(i.u).push({to:i.v,w:i.w,key:Cs(i.u,i.v)}),s.get(i.v).push({to:i.u,w:i.w,key:Cs(i.u,i.v)});const o=[],n=new Set,c=new Set;let r=0;const l=[];n.add(t);for(const{to:i,w:d,key:f}of s.get(t))l.push({u:t,v:i,w:d,key:f});for(o.push(Ge({message:`Start Prim at ${t}. Push ${l.length} fringe edges.`,inMst:n,mstEdges:c,totalWeight:r,pq:l,currentEdge:null}));l.length&&n.size<a.vertices.length;){l.sort((f,p)=>f.w-p.w);const i=l.shift();if(o.push(Ge({message:`extract-min → (${i.u},${i.v}) w=${i.w}.`,inMst:n,mstEdges:c,totalWeight:r,pq:l,currentEdge:i.key})),n.has(i.v)){o.push(Ge({message:`  skip: ${i.v} already in MST (stale fringe).`,inMst:n,mstEdges:c,totalWeight:r,pq:l,currentEdge:i.key}));continue}n.add(i.v),c.add(i.key),r+=i.w;let d=0;for(const{to:f,w:p,key:u}of s.get(i.v))n.has(f)||(l.push({u:i.v,v:f,w:p,key:u}),d++);o.push(Ge({message:`  add ${i.v} to MST via (${i.u},${i.v}). Push ${d} new fringe edge(s). total=${r}.`,inMst:n,mstEdges:c,totalWeight:r,pq:l,currentEdge:i.key}))}return o.push(Ge({message:`Done. MST has ${c.size} edges, total weight=${r}.`,inMst:n,mstEdges:c,totalWeight:r,pq:l,currentEdge:null})),o}
function Cs(a,t){return a<t?`${a}-${t}`:`${t}-${a}`}
function Ge(a){return{message:a.message,inMst:new Set(a.inMst),mstEdges:new Set(a.mstEdges),totalWeight:a.totalWeight,pq:a.pq.slice().sort((t,s)=>t.w-s.w).map(t=>({...t})),currentEdge:a.currentEdge}}
const yi=`
.pmw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.pmw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.pmw-title { font-weight:600; font-size:15px; }
.pmw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.pmw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.pmw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.pmw-btn:hover { background:#3b6ae8; }
.pmw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.pmw-btn:disabled { opacity:0.4; cursor:not-allowed; }
.pmw-select { padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit; }
.pmw-hint { color:#8a93a8; font-size:12px; }
.pmw-main { flex:1; display:flex; min-height:380px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.pmw-canvas { flex:1; padding:16px; overflow:auto; }
.pmw-side { width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto; }
.pmw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.pmw-pq { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; min-height:24px; }
.pmw-pq-row { padding:3px 8px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f; display:flex; justify-content:space-between; }
.pmw-pq-row.top { background:#3a4a70; border-color:#ffd24a; }
.pmw-cmp { padding:8px; background:#141925; border:1px solid #2a2f3e;
  border-radius:6px; margin-top:12px; }
.pmw-cmp b { color:#e6e6e6; }
.pmw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.pmw-status { color:#d1d5db; flex:1; min-width:0; }
.pmw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.pmw-stats b { color:#e6e6e6; }
.pmw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease; }
.pmw-node.in-mst circle { fill:#1f3a2e; stroke:#4a9f6f; }
.pmw-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.pmw-edge { stroke:#3a4560; stroke-width:1.8; fill:none;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.pmw-edge.fringe { stroke:#c678dd; stroke-width:2; stroke-dasharray:3 3; }
.pmw-edge.current { stroke:#ffd24a; stroke-width:3; }
.pmw-edge.mst { stroke:#4a9f6f; stroke-width:3; }
.pmw-elabel { fill:#d1d5db; font-size:11px; text-anchor:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
function ji(){const a=h.useMemo(()=>cn(),[]),[t,s]=h.useState("A"),o=h.useMemo(()=>ki(a,t),[a,t]),[n,c]=h.useState(0),[r,l]=h.useState(!1),i=h.useRef(null);h.useEffect(()=>{c(0),l(!1)},[t]),h.useEffect(()=>{if(r)return i.current=setTimeout(()=>{c($=>$>=o.length-1?(l(!1),$):$+1)},600),()=>clearTimeout(i.current)},[r,n,o.length]);const d=o[n];function f(){c($=>Math.min($+1,o.length-1))}function p(){c($=>Math.max($-1,0))}function u(){c(0),l(!1)}const m=h.useMemo(()=>ln(a),[a]),w=m[m.length-1];function b($){return $.u<$.v?`${$.u}-${$.v}`:`${$.v}-${$.u}`}const k=new Set(d.pq.map($=>$.key));return e.jsxs("div",{className:"pmw-root",children:[e.jsx("style",{children:yi}),e.jsx("div",{className:"pmw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"pmw-title",children:"Prim's Minimum Spanning Tree"}),e.jsx("div",{className:"pmw-sub",children:"Grow MST from a seed vertex by repeatedly picking the cheapest fringe edge."})]})}),e.jsxs("div",{className:"pmw-bar",children:[e.jsx("span",{className:"pmw-hint",children:"Seed:"}),e.jsx("select",{className:"pmw-select",value:t,onChange:$=>s($.target.value),children:a.vertices.map($=>e.jsx("option",{value:$.id,children:$.id},$.id))}),e.jsx("button",{className:"pmw-btn ghost",onClick:p,disabled:n===0,children:"Prev"}),e.jsx("button",{className:"pmw-btn",onClick:()=>l($=>!$),children:r?"Pause":"Play"}),e.jsx("button",{className:"pmw-btn ghost",onClick:f,disabled:n>=o.length-1,children:"Next"}),e.jsx("button",{className:"pmw-btn ghost",onClick:u,children:"Reset"}),e.jsxs("span",{className:"pmw-hint",children:["step ",n+1,"/",o.length]})]}),e.jsxs("div",{className:"pmw-main",children:[e.jsx("div",{className:"pmw-canvas",children:e.jsxs("svg",{width:560,height:340,viewBox:"0 0 560 340",children:[a.edges.map(($,g)=>{const z=a.vertices.find(C=>C.id===$.u),F=a.vertices.find(C=>C.id===$.v),M=b($);let y="pmw-edge";return d.mstEdges.has(M)?y+=" mst":d.currentEdge===M?y+=" current":k.has(M)&&(y+=" fringe"),e.jsxs("g",{children:[e.jsx("line",{className:y,x1:z.x,y1:z.y,x2:F.x,y2:F.y}),e.jsx("text",{className:"pmw-elabel",x:(z.x+F.x)/2,y:(z.y+F.y)/2-6,children:$.w})]},g)}),a.vertices.map($=>{const g=["pmw-node"];return d.inMst.has($.id)&&g.push("in-mst"),e.jsxs("g",{className:g.join(" "),children:[e.jsx("circle",{cx:$.x,cy:$.y,r:22}),e.jsx("text",{x:$.x,y:$.y,children:$.id})]},$.id)})]})}),e.jsxs("div",{className:"pmw-side",children:[e.jsx("h4",{children:"Fringe PQ (min-first)"}),e.jsx("div",{className:"pmw-pq",children:d.pq.length===0?e.jsx("span",{className:"pmw-hint",children:"empty"}):d.pq.map(($,g)=>e.jsxs("div",{className:"pmw-pq-row"+(g===0?" top":""),children:[e.jsxs("span",{children:["(",$.u,",",$.v,")"]}),e.jsxs("span",{children:["w=",$.w]})]},g))}),e.jsxs("div",{className:"pmw-cmp",children:[e.jsxs("div",{children:["Prim total: ",e.jsx("b",{children:d.totalWeight})]}),e.jsxs("div",{children:["Kruskal total: ",e.jsx("b",{children:w.totalWeight})]}),e.jsx("div",{style:{marginTop:6,color:d.totalWeight===w.totalWeight?"#4a9f6f":"#ff9f40"},children:d.totalWeight===w.totalWeight?"Same weight — both algorithms agree.":"In progress (same final weight expected)."})]})]})]}),e.jsxs("div",{className:"pmw-footer",children:[e.jsxs("div",{className:"pmw-status",children:["Status: ",d.message]}),e.jsxs("div",{className:"pmw-stats",children:["mst=",e.jsx("b",{children:d.inMst.size}),"/",e.jsx("b",{children:a.vertices.length}),"   weight=",e.jsx("b",{children:d.totalWeight}),"   fringe=",e.jsx("b",{children:d.pq.length})]})]})]})}

export default ji;
export { ji as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ji, {}));
  return () => root.unmount();
}
