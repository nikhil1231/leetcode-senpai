import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Vs(a){const t=a.map((p,u)=>({id:p.id!=null?p.id:u,start:p.start,finish:p.finish})),s=t.slice().sort((p,u)=>p.finish!==u.finish?p.finish-u.finish:p.start-u.start),o=[];o.push({kind:"start",cursor:-1,lastPickedIdx:-1,decisions:{},note:`Sorted ${s.length} intervals by earliest finish time.`});const n={},c=[];let r=-1/0,l=-1;for(let p=0;p<s.length;p++){const u=s[p];if(o.push({kind:"consider",cursor:p,lastPickedIdx:l,decisions:{...n},note:`Consider interval #${u.id} [${u.start}, ${u.finish}). Last finish = ${Xs(r)}.`}),u.start>=r){const m=r;n[p]="selected",c.push(u),r=u.finish,l=p,o.push({kind:"select",cursor:p,lastPickedIdx:l,decisions:{...n},note:`Select #${u.id}: start ${u.start} >= last finish ${Xs(m)}. Advance last finish to ${u.finish}.`})}else n[p]="skipped",o.push({kind:"skip",cursor:p,lastPickedIdx:l,decisions:{...n},note:`Skip #${u.id}: start ${u.start} < last finish ${r}. Overlaps previous pick.`})}o.push({kind:"done",cursor:s.length,lastPickedIdx:l,decisions:n,note:`Greedy selected ${c.length} / ${s.length} intervals.`});const i=t.slice().sort((p,u)=>p.start!==u.start?p.start-u.start:p.finish-u.finish),d=[];let f=-1/0;for(const p of i)p.start>=f&&(d.push(p),f=p.finish);return{intervals:t,sorted:s,picked:c,naivePicked:d,steps:o}}
function Xs(a){return a===-1/0?"-∞":String(a)}
function Ys(a=8,t=1){const s=Ir(t),o=[];for(let n=0;n<a;n++){const c=Math.floor(s()*18),r=2+Math.floor(s()*6);o.push({id:n+1,start:c,finish:c+r})}return o}
function Ir(a){return function(){a|=0,a=a+1831565813|0;let t=a;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}
const Ar=`
.isw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6;
  font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.isw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.isw-title { font-weight: 600; font-size: 15px; }
.isw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.isw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925;
  border-bottom: 1px solid #2a2f3e; flex-wrap: wrap;
}
.isw-btn {
  padding: 6px 12px; background: #4a7cff; border: none;
  border-radius: 6px; color: white; font-weight: 500; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.isw-btn:hover { background: #3b6ae8; }
.isw-btn.isw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.isw-btn.isw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.isw-btn.isw-danger { background: #c13c3c; }
.isw-btn.isw-danger:hover { background: #a73232; }
.isw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.isw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 70px;
}
.isw-input:focus { outline: none; border-color: #4a7cff; }
.isw-lbl { color: #8a93a8; font-size: 12px; }

.isw-canvas-wrap {
  flex: 1; overflow: auto; padding: 20px;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  min-height: 280px;
}
.isw-section-title {
  color: #8a93a8; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.08em; margin: 0 0 10px 0; font-weight: 600;
}

.isw-bar-row { transition: opacity 200ms ease; }
.isw-bar-shape {
  rx: 4; ry: 4;
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease;
}
.isw-bar-shape.isw-pending { fill: #2a3550; stroke: #4a5f8f; stroke-width: 1; }
.isw-bar-shape.isw-cursor {
  fill: #3a4a75; stroke: #ffd24a; stroke-width: 2;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.6));
}
.isw-bar-shape.isw-selected { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2; }
.isw-bar-shape.isw-skipped  { fill: #3a1f1f; stroke: #ff5c5c; stroke-width: 1; }

.isw-bar-label {
  fill: #e6e6e6; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events: none; user-select: none;
  dominant-baseline: middle;
}
.isw-axis-label {
  fill: #8a93a8; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.isw-axis-line { stroke: #2a2f3e; stroke-width: 1; }
.isw-guide { stroke: #ffd24a; stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.6; }

.isw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.isw-status { color: #d1d5db; flex: 1; min-width: 0; }
.isw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.isw-stats b { color: #e6e6e6; }
.isw-stats .isw-good { color: #4a9f6f; }
.isw-stats .isw-bad { color: #ff5c5c; }
`,de=28,xt=6,ie=40,Tr=20;
function Pr(){const[a,t]=h.useState(7),[s,o]=h.useState(8),[n,c]=h.useState(()=>Vs(Ys(8,7))),[r,l]=h.useState(0),[i,d]=h.useState(!1),f=h.useRef(null),p=n.steps[r]||n.steps[n.steps.length-1],u=r>=n.steps.length-1;h.useEffect(()=>{if(i){if(u){d(!1);return}return f.current=setTimeout(()=>{l(L=>Math.min(L+1,n.steps.length-1))},600),()=>clearTimeout(f.current)}},[i,r,u,n.steps.length]);function m(L,B){const q=Ys(B,L);c(Vs(q)),l(0),d(!1)}function w(){l(0),d(!1)}function b(){d(!1),l(L=>Math.min(L+1,n.steps.length-1))}function k(){d(!1),l(n.steps.length-1)}const{minT:$,maxT:g}=h.useMemo(()=>{let L=1/0,B=-1/0;for(const q of n.intervals)q.start<L&&(L=q.start),q.finish>B&&(B=q.finish);return isFinite(L)||(L=0,B=1),{minT:L,maxT:B}},[n]),z=700,F=z-ie-Tr,M=Math.max(1,g-$),y=L=>ie+(L-$)/M*F,C=n.sorted.map((L,B)=>{let q="pending";return B===p.cursor&&(q="cursor"),p.decisions&&p.decisions[B]==="selected"&&(q="selected"),p.decisions&&p.decisions[B]==="skipped"&&(q="skipped"),{iv:L,idx:B,state:q}}),T=new Set(n.naivePicked.map(L=>L.id)),I=n.intervals.slice().sort((L,B)=>L.start-B.start||L.finish-B.finish).map(L=>({iv:L,state:T.has(L.id)?"selected":"skipped"})),j=50,x=C.length*(de+xt),N=j+x+30,E=N+30,A=I.length*(de+xt),R=E+A+40;let S=null;if(p.lastPickedIdx>=0){const L=n.sorted[p.lastPickedIdx];L&&(S=y(L.finish))}const P=[];for(let L=Math.ceil($);L<=Math.floor(g);L++)P.push(L);return e.jsxs("div",{className:"isw-root",children:[e.jsx("style",{children:Ar}),e.jsx("div",{className:"isw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"isw-title",children:"Interval Scheduling (Greedy)"}),e.jsx("div",{className:"isw-sub",children:"Sort by earliest finish time; compared against a naive earliest-start heuristic."})]})}),e.jsxs("div",{className:"isw-bar",children:[e.jsx("span",{className:"isw-lbl",children:"n"}),e.jsx("input",{className:"isw-input",type:"number",min:"3",max:"15",value:s,onChange:L=>o(Math.max(3,Math.min(15,Number(L.target.value)||8)))}),e.jsx("span",{className:"isw-lbl",children:"seed"}),e.jsx("input",{className:"isw-input",type:"number",value:a,onChange:L=>t(Number(L.target.value)||0)}),e.jsx("button",{className:"isw-btn",onClick:()=>m(a,s),children:"Regenerate"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"isw-btn",onClick:b,disabled:u,children:"Step"}),e.jsx("button",{className:"isw-btn isw-ghost",onClick:()=>d(L=>!L),disabled:u,children:i?"Pause":"Play"}),e.jsx("button",{className:"isw-btn isw-ghost",onClick:k,disabled:u,children:"Skip"}),e.jsx("button",{className:"isw-btn isw-danger",onClick:w,children:"Reset"})]}),e.jsx("div",{className:"isw-canvas-wrap",children:e.jsxs("svg",{width:z,height:R,viewBox:`0 0 ${z} ${R}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("text",{x:ie,y:20,className:"isw-axis-label",style:{fontSize:12,fill:"#d1d5db",fontWeight:600},children:"Greedy (by earliest finish)"}),e.jsx("text",{x:ie,y:36,className:"isw-axis-label",children:"Sorted by finish time, top → bottom"}),e.jsx("line",{className:"isw-axis-line",x1:ie,y1:j-8,x2:ie+F,y2:j-8}),P.map(L=>e.jsxs("g",{children:[e.jsx("line",{className:"isw-axis-line",x1:y(L),y1:j-8,x2:y(L),y2:j-4}),e.jsx("text",{x:y(L),y:j-12,className:"isw-axis-label",style:{textAnchor:"middle"},children:L})]},"tick-top-"+L)),S!=null&&e.jsx("line",{className:"isw-guide",x1:S,y1:j-10,x2:S,y2:j+x+4}),C.map(L=>{const B=j+L.idx*(de+xt),q=y(L.iv.start),D=y(L.iv.finish);return e.jsxs("g",{className:"isw-bar-row",children:[e.jsxs("text",{x:ie-8,y:B+de/2,className:"isw-axis-label",style:{textAnchor:"end",dominantBaseline:"middle"},children:["#",L.iv.id]}),e.jsx("rect",{className:"isw-bar-shape isw-"+L.state,x:q,y:B,width:Math.max(2,D-q),height:de}),e.jsxs("text",{className:"isw-bar-label",x:q+6,y:B+de/2,children:["[",L.iv.start,", ",L.iv.finish,")"]})]},"g-"+L.iv.id)}),e.jsx("line",{className:"isw-axis-line",x1:ie,y1:N,x2:ie+F,y2:N}),e.jsx("text",{x:ie,y:N+18,className:"isw-axis-label",style:{fontSize:12,fill:"#d1d5db",fontWeight:600},children:"Naive (by earliest start)"}),e.jsx("text",{x:ie,y:N+32,className:"isw-axis-label",children:"For comparison — may be suboptimal"}),I.map((L,B)=>{const q=E+B*(de+xt),D=y(L.iv.start),_=y(L.iv.finish);return e.jsxs("g",{className:"isw-bar-row",children:[e.jsxs("text",{x:ie-8,y:q+de/2,className:"isw-axis-label",style:{textAnchor:"end",dominantBaseline:"middle"},children:["#",L.iv.id]}),e.jsx("rect",{className:"isw-bar-shape isw-"+L.state,x:D,y:q,width:Math.max(2,_-D),height:de}),e.jsxs("text",{className:"isw-bar-label",x:D+6,y:q+de/2,children:["[",L.iv.start,", ",L.iv.finish,")"]})]},"n-"+L.iv.id)})]})}),e.jsxs("div",{className:"isw-footer",children:[e.jsxs("div",{className:"isw-status",children:["Status: ",p.note]}),e.jsxs("div",{className:"isw-stats",children:["greedy=",e.jsx("b",{className:"isw-good",children:Object.values(p.decisions||{}).filter(L=>L==="selected").length})," / ",e.jsx("b",{children:n.sorted.length}),"   naive=",e.jsx("b",{className:n.naivePicked.length<n.picked.length?"isw-bad":"isw-good",children:n.naivePicked.length}),"   optimal=",e.jsx("b",{className:"isw-good",children:n.picked.length})]})]})]})}

export default Pr;
export { Pr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Pr, {}));
  return () => root.unmount();
}
