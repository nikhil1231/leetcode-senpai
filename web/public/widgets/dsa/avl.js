import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let to=0;
function so(){return"a"+to++}
function no(a){return{id:so(),key:a,left:null,right:null,height:1}}
function jt(a){return a?a.height:0}
function et(a){a.height=1+Math.max(jt(a.left),jt(a.right))}
function bs(a){return a?jt(a.left)-jt(a.right):0}
function Ft(a){const t=a.left,s=t.right;return t.right=a,a.left=s,et(a),et(t),t}
function It(a){const t=a.right,s=t.left;return t.left=a,a.right=s,et(a),et(t),t}
class ao{constructor(){this.root=null}clear(){this.root=null}insert(t){const s=[],o=[];let n=!1;const c=r=>{if(r===null){const i=no(t);return s.push(i.id),i}if(s.push(r.id),t===r.key)return n=!0,r;t<r.key?r.left=c(r.left):r.right=c(r.right),et(r);const l=bs(r);if(l>1&&t<r.left.key){const i=r.id,d=Ft(r);return o.push({kind:"LL",pivotId:i,newRootId:d.id}),d}if(l<-1&&t>r.right.key){const i=r.id,d=It(r);return o.push({kind:"RR",pivotId:i,newRootId:d.id}),d}if(l>1&&t>r.left.key){const i=r.id;r.left=It(r.left);const d=Ft(r);return o.push({kind:"LR",pivotId:i,newRootId:d.id}),d}if(l<-1&&t<r.right.key){const i=r.id;r.right=Ft(r.right);const d=It(r);return o.push({kind:"RL",pivotId:i,newRootId:d.id}),d}return r};return this.root=c(this.root),{path:s,rotations:o,duplicate:n}}snapshot(){const t=s=>s===null?null:{id:s.id,key:s.key,height:s.height,bf:bs(s),left:t(s.left),right:t(s.right)};return{root:t(this.root)}}stats(){let t=0,s=-1;const o=(n,c)=>{n&&(t++,c>s&&(s=c),o(n.left,c+1),o(n.right,c+1))};return o(this.root,0),{nodes:t,height:s}}}
const oo=`
.avw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.avw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.avw-title { font-weight: 600; font-size: 15px; }
.avw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.avw-head-right { display: flex; gap: 8px; align-items: center; }
.avw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.avw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 90px; }
.avw-input:focus { outline: none; border-color: #4a7cff; }
.avw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.avw-btn:hover { background: #3b6ae8; }
.avw-btn.avw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.avw-btn.avw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.avw-btn.avw-danger { background: #c13c3c; }
.avw-btn.avw-danger:hover { background: #a73232; }
.avw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.avw-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.avw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.avw-status { color: #d1d5db; flex: 1; min-width: 0; }
.avw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.avw-stats b { color: #e6e6e6; }

.avw-node circle {
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease;
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 1.5;
}
.avw-node text {
  fill: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.avw-node text.avw-bf { font-size: 10px; fill: #ffd24a; }
.avw-node.avw-unbalanced circle {
  fill: #5a2020; stroke: #ff5c5c; stroke-width: 2.5;
  filter: drop-shadow(0 0 10px rgba(255, 92, 92, 0.7));
  animation: avw-flash-red 600ms ease-out 1;
}
.avw-node.avw-on-path circle {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.avw-node.avw-pivot circle { animation: avw-pulse-blue 700ms ease-out 1; }
.avw-node.avw-inserted circle { animation: avw-pulse-green 600ms ease-out 1; }
@keyframes avw-pulse-blue {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 124, 255, 0.9)); }
}
@keyframes avw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
@keyframes avw-flash-red {
  0%   { fill: #1f3a2e; }
  40%  { fill: #5a2020; }
  100% { fill: #5a2020; }
}
.avw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; }
.avw-empty { color: #8a93a8; text-align: center; padding: 40px; font-style: italic; }
`,ke=20,an=70,At=20;
function io(a){const t={};let s=0,o=0;function n(c,r){if(!c)return null;r>o&&(o=r);const l=n(c.left,r+1),i=s;s+=ke*2+At;const d=n(c.right,r+1);let f=i+ke;return l&&d?f=(l.x+d.x)/2:l?f=l.x+ke*2+At:d&&(f=d.x-ke*2-At),t[c.id]={x:f,y:r*an+ke},t[c.id]}return n(a,0),{positions:t,depth:o,width:s}}
function ro(a){const t=[],s=[];return(function o(n){n&&(t.push(n),n.left&&(s.push({p:n.id,c:n.left.id}),o(n.left)),n.right&&(s.push({p:n.id,c:n.right.id}),o(n.right)))})(a),{nodes:t,edges:s}}
const lo=[30,20,10],co=[10,20,30],po=[30,10,20],uo=[10,30,20],Tt=[50,30,70,20,40,60,80,10];
function fo(){const a=h.useRef(new ao),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("AVL tree. Insert keys — when |bf| > 1 at some ancestor, rotate."),[c,r]=h.useState(""),[l,i]=h.useState({path:new Set,inserted:null,unbalanced:new Set,pivot:new Set}),d=h.useRef(null);function f(v){d.current&&clearTimeout(d.current),i(v),d.current=setTimeout(()=>i({path:new Set,inserted:null,unbalanced:new Set,pivot:new Set}),900)}h.useEffect(()=>()=>d.current&&clearTimeout(d.current),[]);function p(){s(a.current.snapshot())}function u(v){if(!Number.isFinite(v)){n("Insert needs a numeric key.");return}const I=a.current.insert(v);p();const j=new Set(I.rotations.map(N=>N.pivotId)),x=new Set(I.rotations.map(N=>N.newRootId));if(f({path:new Set(I.path),inserted:I.duplicate?null:I.path[I.path.length-1],unbalanced:j,pivot:x}),I.duplicate)n(`Insert ${v}: duplicate, no change.`);else if(I.rotations.length===0)n(`Insert ${v}: no rotation needed.`);else{const N=I.rotations.map(E=>`${E.kind} at ${E.pivotId} (new subtree root ${E.newRootId})`);n(`Insert ${v}: rotations → ${N.join("; ")}.`)}}function m(v,I){a.current.clear();for(const j of v)a.current.insert(j);p(),f({path:new Set,inserted:null,unbalanced:new Set,pivot:new Set}),n(`Seeded ${I}: [${v.join(", ")}].`)}h.useEffect(()=>{for(const v of Tt)a.current.insert(v);p(),n(`Seeded balanced demo [${Tt.join(", ")}]. Heights shown via bf labels.`)},[]);const w=()=>{const v=Number(c);return Number.isFinite(v)?v:NaN},b=h.useMemo(()=>{let v=0,I=-1,j=0;return(function x(N,E){N&&(v++,E>I&&(I=E),Math.abs(N.bf)>Math.abs(j)&&(j=N.bf),x(N.left,E+1),x(N.right,E+1))})(t.root,0),{nodes:v,height:I,worstBf:j}},[t]),{positions:k,width:$}=h.useMemo(()=>io(t.root),[t]),{nodes:g,edges:z}=h.useMemo(()=>ro(t.root),[t]),F=24,M=24,y=Math.max($+F*2,520),C=Math.max((b.height+1)*an+M*2,180),T=t.root===null;return e.jsxs("div",{className:"avw-root",children:[e.jsx("style",{children:oo}),e.jsxs("div",{className:"avw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"avw-title",children:"AVL Tree"}),e.jsx("div",{className:"avw-sub",children:"Adelson-Velsky & Landis 1962 — |balance factor| ≤ 1 maintained via rotations."})]}),e.jsx("div",{className:"avw-head-right",children:e.jsx("button",{className:"avw-btn avw-danger",onClick:()=>{a.current.clear(),p(),n("Cleared.")},children:"Reset"})})]}),e.jsxs("div",{className:"avw-bar",children:[e.jsx("input",{className:"avw-input",placeholder:"key",type:"number",value:c,onChange:v=>r(v.target.value),onKeyDown:v=>{v.key==="Enter"&&(u(w()),r(""))}}),e.jsx("button",{className:"avw-btn",onClick:()=>{u(w()),r("")},children:"Insert"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"avw-quick",children:"Rotation demos:"}),e.jsx("button",{className:"avw-btn avw-ghost",onClick:()=>m(lo,"LL"),children:"LL"}),e.jsx("button",{className:"avw-btn avw-ghost",onClick:()=>m(co,"RR"),children:"RR"}),e.jsx("button",{className:"avw-btn avw-ghost",onClick:()=>m(po,"LR"),children:"LR"}),e.jsx("button",{className:"avw-btn avw-ghost",onClick:()=>m(uo,"RL"),children:"RL"}),e.jsx("button",{className:"avw-btn avw-ghost",onClick:()=>m(Tt,"balanced demo"),children:"balanced"})]}),e.jsx("div",{className:"avw-canvas-wrap",children:T?e.jsx("div",{className:"avw-empty",children:"Empty tree. Try a rotation-demo button."}):e.jsxs("svg",{width:y,height:C,viewBox:`0 0 ${y} ${C}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:z.map(v=>{const I=k[v.p],j=k[v.c];if(!I||!j)return null;const x=I.x+F,N=I.y+M,E=j.x+F,A=j.y+M,R=(N+A)/2,S=`M ${x} ${N} C ${x} ${R}, ${E} ${R}, ${E} ${A}`;return e.jsx("path",{className:"avw-edge",d:S},v.p+"->"+v.c)})}),e.jsx("g",{children:g.map(v=>{const I=k[v.id];if(!I)return null;const j=["avw-node"];return l.unbalanced.has(v.id)&&j.push("avw-unbalanced"),l.pivot.has(v.id)&&j.push("avw-pivot"),l.path.has(v.id)&&j.push("avw-on-path"),l.inserted===v.id&&j.push("avw-inserted"),e.jsxs("g",{className:j.join(" "),children:[e.jsx("circle",{cx:I.x+F,cy:I.y+M,r:ke}),e.jsx("text",{x:I.x+F,y:I.y+M,children:v.key}),e.jsxs("text",{className:"avw-bf",x:I.x+F+ke+4,y:I.y+M-ke+4,children:["bf=",v.bf]})]},v.id)})})]})}),e.jsxs("div",{className:"avw-footer",children:[e.jsxs("div",{className:"avw-status",children:["Status: ",o]}),e.jsxs("div",{className:"avw-stats",children:["nodes=",e.jsx("b",{children:b.nodes}),"   height=",e.jsx("b",{children:b.height}),"   worst-bf=",e.jsx("b",{children:b.worstBf})]})]})]})}

export default fo;
export { fo as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(fo, {}));
  return () => root.unmount();
}
