import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ii(a){const t=a.vertices.map(l=>l.id),s=t.length,o=[],n=[],c=[];for(let l=0;l<s;l++)n.push(new Array(s).fill(1/0)),c.push(new Array(s).fill(null)),n[l][l]=0;for(const l of a.edges){const i=t.indexOf(l.u),d=t.indexOf(l.v);n[i][d]=Math.min(n[i][d],l.w),a.directed||(n[d][i]=Math.min(n[d][i],l.w))}o.push(Ke({message:`Initialize dist from direct edges (∞ where no edge). Now iterate k=0..${s-1}.`,ids:t,mat:n,via:c,k:-1,changed:new Set,highlight:null}));for(let l=0;l<s;l++){o.push(Ke({message:`--- k=${l} (${t[l]}). Try to route via ${t[l]}.`,ids:t,mat:n,via:c,k:l,changed:new Set,highlight:null}));const i=new Set;for(let d=0;d<s;d++)for(let f=0;f<s;f++)if(d!==f&&n[d][l]+n[l][f]<n[d][f]){const p=n[d][f];n[d][f]=n[d][l]+n[l][f],c[d][f]=l,i.add(ri(d,f)),o.push(Ke({message:`  (${t[d]},${t[f]}): ${li(p)} → ${n[d][f]} via ${t[l]}.`,ids:t,mat:n,via:c,k:l,changed:i,highlight:{i:d,j:f,k:l}}))}i.size===0&&o.push(Ke({message:`  k=${l}: no improvements.`,ids:t,mat:n,via:c,k:l,changed:i,highlight:null}))}let r=!1;for(let l=0;l<s;l++)n[l][l]<0&&(r=!0);return o.push(Ke({message:r?"Done. NEGATIVE CYCLE present (some dist[i][i] < 0).":"Done. Matrix holds all-pairs shortest paths.",ids:t,mat:n,via:c,k:s-1,changed:new Set,highlight:null})),o}
function ri(a,t){return`${a},${t}`}
function li(a){return a===1/0?"∞":a}
function Ke(a){return{message:a.message,ids:a.ids,mat:a.mat.map(t=>t.slice()),via:a.via.map(t=>t.slice()),k:a.k,changed:new Set(a.changed),highlight:a.highlight?{...a.highlight}:null}}
function ci(){return{vertices:[{id:"A",x:80,y:80},{id:"B",x:300,y:60},{id:"C",x:500,y:100},{id:"D",x:100,y:220},{id:"E",x:500,y:240}],edges:[{u:"A",v:"B",w:3},{u:"A",v:"D",w:7},{u:"B",v:"C",w:1},{u:"B",v:"D",w:2},{u:"C",v:"E",w:4},{u:"D",v:"C",w:-2},{u:"D",v:"E",w:5},{u:"E",v:"A",w:6}],directed:!0}}
const di=`
.fww-root { display:flex; flex-direction:column; height:100%;
  background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px;
  border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.fww-head { display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.fww-title { font-weight:600; font-size:15px; }
.fww-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.fww-bar { display:flex; gap:8px; align-items:center; padding:10px 16px;
  background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.fww-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px;
  color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.fww-btn:hover { background:#3b6ae8; }
.fww-btn.ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.fww-btn.ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.fww-btn:disabled { opacity:0.4; cursor:not-allowed; }
.fww-hint { color:#8a93a8; font-size:12px; }
.fww-main { flex:1; display:flex; min-height:380px;
  background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); overflow:auto; }
.fww-left { flex:0 0 360px; padding:16px; border-right:1px solid #2a2f3e; }
.fww-right { flex:1; padding:16px; overflow:auto;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.fww-mat { border-collapse:collapse; }
.fww-mat th, .fww-mat td {
  padding:6px 10px; border:1px solid #2a2f3e; text-align:center; font-size:12px; min-width:40px;
}
.fww-mat th { background:#141925; color:#8a93a8; }
.fww-mat td { background:#0f1419; transition:background 300ms ease, color 300ms ease; }
.fww-mat td.changed { background:#3a3a1c; color:#ffd24a; }
.fww-mat td.hi-row { background:#2a3550; }
.fww-mat td.hi-col { background:#2a3550; }
.fww-mat td.hi-cell { background:#3a4a70; color:#ffd24a; }
.fww-mat td.via { font-size:10px; color:#8a93a8; display:block; margin-top:2px; }
.fww-footer { display:flex; justify-content:space-between; align-items:center;
  padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e;
  font-size:13px; gap:16px; flex-wrap:wrap; }
.fww-status { color:#d1d5db; flex:1; min-width:0; }
.fww-stats { color:#8a93a8;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px; white-space:nowrap; }
.fww-stats b { color:#e6e6e6; }
.fww-node circle { fill:#1a1f2e; stroke:#4a5f8f; stroke-width:2;
  transition:stroke 250ms ease; }
.fww-node.k circle { stroke:#ffd24a; stroke-width:3; }
.fww-node text { fill:#e6e6e6; font-size:13px; text-anchor:middle;
  dominant-baseline:middle; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events:none; user-select:none; }
.fww-edge { stroke:#3a4560; stroke-width:1.6; fill:none; }
.fww-edge.neg { stroke:#c678dd; }
.fww-elabel { fill:#d1d5db; font-size:10px; text-anchor:middle;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
function pi(){const a=h.useMemo(()=>ci(),[]),[t]=h.useState(()=>ii(a)),[s,o]=h.useState(0),[n,c]=h.useState(!1),r=h.useRef(null);h.useEffect(()=>{if(n)return r.current=setTimeout(()=>{o(m=>m>=t.length-1?(c(!1),m):m+1)},500),()=>clearTimeout(r.current)},[n,s,t.length]);const l=t[s];function i(){o(m=>Math.min(m+1,t.length-1))}function d(){o(m=>Math.max(m-1,0))}function f(){o(0),c(!1)}function p(m,w){const b=w.x-m.x,k=w.y-m.y,$=Math.hypot(b,k)||1,g=-k/$*10,z=b/$*10,F=(m.x+w.x)/2+g,M=(m.y+w.y)/2+z,y=w.x-b/$*20,C=w.y-k/$*20;return`M ${m.x} ${m.y} Q ${F} ${M} ${y} ${C}`}const u=l.highlight;return e.jsxs("div",{className:"fww-root",children:[e.jsx("style",{children:di}),e.jsx("div",{className:"fww-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"fww-title",children:"Floyd-Warshall — All Pairs Shortest Paths"}),e.jsx("div",{className:"fww-sub",children:"O(V³) DP: dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])."})]})}),e.jsxs("div",{className:"fww-bar",children:[e.jsx("button",{className:"fww-btn ghost",onClick:d,disabled:s===0,children:"Prev"}),e.jsx("button",{className:"fww-btn",onClick:()=>c(m=>!m),children:n?"Pause":"Play"}),e.jsx("button",{className:"fww-btn ghost",onClick:i,disabled:s>=t.length-1,children:"Next"}),e.jsx("button",{className:"fww-btn ghost",onClick:f,children:"Reset"}),e.jsxs("span",{className:"fww-hint",children:["step ",s+1,"/",t.length,"   k=",l.k<0?"—":l.ids[l.k]]})]}),e.jsxs("div",{className:"fww-main",children:[e.jsx("div",{className:"fww-left",children:e.jsxs("svg",{width:340,height:300,viewBox:"0 0 600 300",children:[e.jsx("defs",{children:e.jsx("marker",{id:"fww-arrow",viewBox:"0 0 10 10",refX:"10",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto",children:e.jsx("path",{d:"M0,0 L10,5 L0,10 z",fill:"#6a7389"})})}),a.edges.map((m,w)=>{const b=a.vertices.find(g=>g.id===m.u),k=a.vertices.find(g=>g.id===m.v),$="fww-edge"+(m.w<0?" neg":"");return e.jsxs("g",{children:[e.jsx("path",{className:$,d:p(b,k),markerEnd:"url(#fww-arrow)"}),e.jsx("text",{className:"fww-elabel",x:(b.x+k.x)/2,y:(b.y+k.y)/2-6,children:m.w})]},w)}),a.vertices.map((m,w)=>{const b=["fww-node"];return l.k>=0&&l.ids[l.k]===m.id&&b.push("k"),e.jsxs("g",{className:b.join(" "),children:[e.jsx("circle",{cx:m.x,cy:m.y,r:22}),e.jsx("text",{x:m.x,y:m.y,children:m.id})]},m.id)})]})}),e.jsx("div",{className:"fww-right",children:e.jsxs("table",{className:"fww-mat",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{}),l.ids.map(m=>e.jsx("th",{children:m},m))]})}),e.jsx("tbody",{children:l.ids.map((m,w)=>e.jsxs("tr",{children:[e.jsx("th",{children:m}),l.ids.map((b,k)=>{const $=l.mat[w][k],g=l.via[w][k],z=[];return l.changed.has(`${w},${k}`)&&z.push("changed"),u&&(u.i===w&&u.j===k?z.push("hi-cell"):u.i===w&&u.k===k?z.push("hi-row"):u.k===w&&u.j===k&&z.push("hi-col")),e.jsxs("td",{className:z.join(" "),children:[$===1/0?"∞":$,g!==null&&e.jsxs("div",{className:"fww-mat via",children:["via ",l.ids[g]]})]},b)})]},m))})]})})]}),e.jsxs("div",{className:"fww-footer",children:[e.jsxs("div",{className:"fww-status",children:["Status: ",l.message]}),e.jsxs("div",{className:"fww-stats",children:["V=",e.jsx("b",{children:a.vertices.length}),"   iterations=",e.jsx("b",{children:l.ids.length**3})]})]})]})}

export default pi;
export { pi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(pi, {}));
  return () => root.unmount();
}
