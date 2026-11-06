import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class gt{constructor(t){this.n=t,this.parent=[],this.rank=[];for(let s=0;s<t;s++)this.parent.push(s),this.rank.push(0);this.lastOp=null}find(t){const s=[];let o=t;for(;this.parent[o]!==o;)s.push(o),o=this.parent[o];const n=o,c=[];for(const r of s)this.parent[r]!==n&&(this.parent[r]=n,c.push(r));return this.lastOp={type:"find",x:t,root:n,path:[...s,n],compressed:c},n}union(t,s){const o=this.find(t),n=this.find(s);if(o===n)return this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,merged:!1,note:"already in same set"},!1;let c,r;return this.rank[o]<this.rank[n]?(c=n,r=o):this.rank[o]>this.rank[n]?(c=o,r=n):(c=o,r=n,this.rank[c]++),this.parent[r]=c,this.lastOp={type:"union",a:t,b:s,ra:o,rb:n,winner:c,loser:r,merged:!0,rankWinner:this.rank[c],rankLoser:this.rank[r]},!0}roots(){const t=new Set;for(let s=0;s<this.n;s++)t.add(this.find(s));return Array.from(t)}snapshot(){return{parent:this.parent.slice(),rank:this.rank.slice(),lastOp:this.lastOp?{...this.lastOp,path:this.lastOp.path?[...this.lastOp.path]:void 0,compressed:this.lastOp.compressed?[...this.lastOp.compressed]:void 0}:null}}}
function zs(){return[[0,1],[2,3],[4,5],[6,7],[1,3],[5,7],[3,7],[8,9],[9,0]]}
const mi=`
.ufw-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.ufw-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.ufw-title { font-weight:600; font-size:15px; }
.ufw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.ufw-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.ufw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.ufw-btn:hover { background:#3b6ae8; }
.ufw-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.ufw-btn.danger { background:#c13c3c; }
.ufw-btn.danger:hover { background:#a73232; }
.ufw-input { padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e;
  border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit; width:60px; }
.ufw-hint { color:#8a93a8; font-size:12px; }
.ufw-main { flex:1; display:flex; min-height:360px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); }
.ufw-canvas { flex:1; padding:16px; overflow:auto; }
.ufw-side { width:260px; border-left:1px solid #2a2f3e; padding:12px 14px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;
  background:#0f1419; overflow:auto; }
.ufw-side h4 { margin:4px 0 6px 0; font-size:12px; color:#8a93a8;
  text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.ufw-arr { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:12px; }
.ufw-arr-cell {
  padding:3px 7px; border-radius:4px; background:#2a3550;
  border:1px solid #4a5f8f; min-width:28px; text-align:center;
}
.ufw-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.ufw-status { color:#d1d5db; flex:1; min-width:0; }
.ufw-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.ufw-stats b { color:#e6e6e6; }
.ufw-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:fill 300ms ease, stroke 300ms ease; }
.ufw-node.root circle { fill:#1f3a2e; stroke:#4a9f6f; stroke-width:2.5; }
.ufw-node.on-path circle { stroke:#ffd24a; stroke-width:3;
  filter:drop-shadow(0 0 6px rgba(255,210,74,0.7)); }
.ufw-node.compressed circle { stroke:#ff9f40; stroke-width:3;
  filter:drop-shadow(0 0 6px rgba(255,159,64,0.7)); }
.ufw-node text { fill:#e6e6e6; font-size:12px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.ufw-edge { stroke:#4a5f8f; stroke-width:1.8; fill:none;
  transition:stroke 300ms ease, stroke-width 300ms ease; }
.ufw-edge.on-path { stroke:#ffd24a; stroke-width:2.8; }
.ufw-edge.compressed { stroke:#ff9f40; stroke-width:2.5; stroke-dasharray:5 3; }
`,te=10;
function wi(){const a=h.useRef(new gt(te)),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState(""),[c,r]=h.useState(""),[l,i]=h.useState(`Initialized ${te} singletons. Try union or find.`);function d(){s(a.current.snapshot())}function f(g,z){if(!Number.isFinite(g)||!Number.isFinite(z)||g<0||z<0||g>=te||z>=te){i(`union needs two indices in [0, ${te-1}].`);return}const F=a.current.union(g,z);d();const M=a.current.lastOp;i(F?`union(${g}, ${z}): found roots ${M.ra}/${M.rb}; merged ${M.loser} under ${M.winner} (rank ${M.rankWinner}).`:`union(${g}, ${z}): already in the same set (root ${M.ra}).`)}function p(g){if(!Number.isFinite(g)||g<0||g>=te){i(`find needs an index in [0, ${te-1}].`);return}const z=a.current.find(g);d();const F=a.current.lastOp,M=F.compressed.length?`, compressed {${F.compressed.join(", ")}} → ${z}`:" (already direct)";i(`find(${g}) = ${z}. Path: ${F.path.join(" → ")}${M}.`)}function u(){a.current=new gt(te),d(),i(`Reset. ${te} singletons.`)}function m(){a.current=new gt(te);for(const[g,z]of zs())a.current.union(g,z);d(),i(`Seeded with ${zs().length} unions. Try find(3) or find(7) to see path compression.`)}const w=h.useMemo(()=>{const g=new Map;for(let v=0;v<te;v++)g.set(v,[]);for(let v=0;v<te;v++)t.parent[v]!==v&&g.get(t.parent[v]).push(v);const z=[];for(let v=0;v<te;v++)t.parent[v]===v&&z.push(v);const F=new Map;let M=40;const y=52,C=70;function T(v,I){const j=g.get(v);if(j.length===0)return F.set(v,{x:M,y:40+I*C}),M+=y,F.get(v);const x=j.map(E=>T(E,I+1)),N=(x[0].x+x[x.length-1].x)/2;return F.set(v,{x:N,y:40+I*C}),F.get(v)}for(const v of z)T(v,0),M+=20;return{pos:F,children:g,roots:z,width:M+20}},[t]),b=t.lastOp,k=new Set(b&&b.type==="find"?b.path:[]),$=new Set(b&&b.type==="find"?b.compressed:[]);return e.jsxs("div",{className:"ufw-root",children:[e.jsx("style",{children:mi}),e.jsxs("div",{className:"ufw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"ufw-title",children:"Disjoint Set Union (Union-Find)"}),e.jsx("div",{className:"ufw-sub",children:"Union-by-rank + path compression gives near-constant amortized ops (α(N))."})]}),e.jsx("button",{className:"ufw-btn danger",onClick:u,children:"Reset"})]}),e.jsxs("div",{className:"ufw-bar",children:[e.jsx("input",{className:"ufw-input",placeholder:"a",value:o,onChange:g=>n(g.target.value)}),e.jsx("input",{className:"ufw-input",placeholder:"b",value:c,onChange:g=>r(g.target.value)}),e.jsx("button",{className:"ufw-btn",onClick:()=>f(Number(o),Number(c)),children:"union(a, b)"}),e.jsx("button",{className:"ufw-btn ghost",onClick:()=>p(Number(o)),children:"find(a)"}),e.jsx("button",{className:"ufw-btn ghost",onClick:m,children:"Seed unions"})]}),e.jsxs("div",{className:"ufw-main",children:[e.jsx("div",{className:"ufw-canvas",children:e.jsxs("svg",{width:Math.max(w.width,520),height:280,viewBox:`0 0 ${Math.max(w.width,520)} 280`,children:[Array.from(w.pos.entries()).map(([g,z])=>{const F=t.parent[g];if(F===g)return null;const M=w.pos.get(F);let y="ufw-edge";return k.has(g)&&k.has(F)&&(y+=" on-path"),$.has(g)&&(y+=" compressed"),e.jsx("line",{className:y,x1:z.x,y1:z.y,x2:M.x,y2:M.y},g)}),Array.from(w.pos.entries()).map(([g,z])=>{const F=t.parent[g]===g,M=["ufw-node"];return F&&M.push("root"),k.has(g)&&M.push("on-path"),$.has(g)&&M.push("compressed"),e.jsxs("g",{className:M.join(" "),children:[e.jsx("circle",{cx:z.x,cy:z.y,r:18}),e.jsx("text",{x:z.x,y:z.y,children:g}),F&&e.jsxs("text",{x:z.x,y:z.y-26,style:{fill:"#ffd24a",fontSize:10,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",textAnchor:"middle"},children:["r=",t.rank[g]]})]},g)})]})}),e.jsxs("div",{className:"ufw-side",children:[e.jsx("h4",{children:"parent[]"}),e.jsx("div",{className:"ufw-arr",children:t.parent.map((g,z)=>e.jsxs("div",{className:"ufw-arr-cell",children:[e.jsx("div",{style:{color:"#8a93a8",fontSize:10},children:z}),g]},z))}),e.jsx("h4",{children:"rank[]"}),e.jsx("div",{className:"ufw-arr",children:t.rank.map((g,z)=>e.jsxs("div",{className:"ufw-arr-cell",children:[e.jsx("div",{style:{color:"#8a93a8",fontSize:10},children:z}),g]},z))})]})]}),e.jsxs("div",{className:"ufw-footer",children:[e.jsxs("div",{className:"ufw-status",children:["Status: ",l]}),e.jsxs("div",{className:"ufw-stats",children:["components=",e.jsx("b",{children:t.parent.filter((g,z)=>g===z).length}),"   N=",e.jsx("b",{children:te})]})]})]})}

export default wi;
export { wi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(wi, {}));
  return () => root.unmount();
}
