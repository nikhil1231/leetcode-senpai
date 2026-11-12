import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let Va=0;
function Xa(){return"b"+Va++}
function zt(a){return{id:Xa(),key:a,left:null,right:null}}
class Ya{constructor(){this.root=null}insert(t){const s=[];if(this.root===null)return this.root=zt(t),s.push(this.root.id),{path:s,insertedId:this.root.id,duplicate:!1};let o=this.root;for(;;){if(s.push(o.id),t===o.key)return{path:s,insertedId:o.id,duplicate:!0};if(t<o.key){if(o.left===null)return o.left=zt(t),s.push(o.left.id),{path:s,insertedId:o.left.id,duplicate:!1};o=o.left}else{if(o.right===null)return o.right=zt(t),s.push(o.right.id),{path:s,insertedId:o.right.id,duplicate:!1};o=o.right}}}search(t){const s=[];let o=this.root;for(;o;){if(s.push(o.id),t===o.key)return{path:s,foundId:o.id};o=t<o.key?o.left:o.right}return{path:s,foundId:null}}remove(t){const s=[];let o=null,n=this.root,c=null;for(;n&&n.key!==t;)s.push(n.id),o=n,t<n.key?(c="left",n=n.left):(c="right",n=n.right);if(!n)return{path:s,deletedId:null,successorId:null};s.push(n.id);let r=null;if(n.left===null||n.right===null){const l=n.left||n.right;o===null?this.root=l:o[c]=l}else{let l=n,i=n.right;for(;i.left;)l=i,i=i.left;r=i.id,n.key=i.key,l===n?l.right=i.right:l.left=i.right}return{path:s,deletedId:n.id,successorId:r}}clear(){this.root=null}snapshot(){const t=s=>s===null?null:{id:s.id,key:s.key,left:t(s.left),right:t(s.right)};return{root:t(this.root)}}stats(){let t=0,s=-1;const o=(n,c)=>{n&&(t++,c>s&&(s=c),o(n.left,c+1),o(n.right,c+1))};return o(this.root,0),{nodes:t,height:s}}}
const Qa=`
.bstw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.bstw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.bstw-title { font-weight: 600; font-size: 15px; }
.bstw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.bstw-head-right { display: flex; gap: 8px; align-items: center; }
.bstw-bar {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap;
}
.bstw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit;
  width: 90px;
}
.bstw-input:focus { outline: none; border-color: #4a7cff; }
.bstw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px;
  font-family: inherit;
}
.bstw-btn:hover { background: #3b6ae8; }
.bstw-btn.bstw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.bstw-btn.bstw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.bstw-btn.bstw-danger { background: #c13c3c; }
.bstw-btn.bstw-danger:hover { background: #a73232; }
.bstw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.bstw-canvas-wrap {
  flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.bstw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.bstw-status { color: #d1d5db; flex: 1; min-width: 0; }
.bstw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.bstw-stats b { color: #e6e6e6; }

.bstw-node circle {
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease;
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 1.5;
}
.bstw-node text {
  fill: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.bstw-node.bstw-on-path circle {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.bstw-node.bstw-inserted circle { animation: bstw-pulse-green 600ms ease-out 1; }
.bstw-node.bstw-deleted circle { animation: bstw-flash-red 600ms ease-out 1; }
@keyframes bstw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
@keyframes bstw-flash-red {
  0%   { fill: #1f3a2e; }
  40%  { fill: #5a2020; }
  100% { fill: #1f3a2e; }
}
.bstw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; transition: stroke 300ms ease; }
.bstw-edge.bstw-edge-on-path { stroke: #ffd24a; stroke-width: 2.5; }
.bstw-empty { color: #8a93a8; text-align: center; padding: 40px; font-style: italic; }
`,Le=20,nn=64,Ct=18;
function Za(a){const t={};let s=0,o=0;function n(c,r){if(!c)return null;r>o&&(o=r);const l=n(c.left,r+1),i=s;s+=Le*2+Ct;const d=n(c.right,r+1);let f=i+Le;return l&&d?f=(l.x+d.x)/2:l?f=l.x+Le*2+Ct:d&&(f=d.x-Le*2-Ct),t[c.id]={x:f,y:r*nn+Le},t[c.id]}return n(a,0),{positions:t,depth:o,width:s}}
function Ja(a){const t=[],s=[];return(function o(n){n&&(t.push(n),n.left&&(s.push({parent:n.id,child:n.left.id}),o(n.left)),n.right&&(s.push({parent:n.id,child:n.right.id}),o(n.right)))})(a),{nodes:t,edges:s}}
const Rt=[1,2,3,4,5,6,7],ws=[4,2,6,1,3,5,7],Et=[42,17,63,8,29,55,91,11,38];
function eo(){const a=h.useRef(new Ya),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("Empty BST. Try a quick-seed. Sequential insert 1..7 → right-skewed list, h=n-1."),[c,r]=h.useState(""),[l,i]=h.useState({path:new Set,inserted:null,deleted:null}),d=h.useRef(null);function f(A){d.current&&clearTimeout(d.current),i(A),d.current=setTimeout(()=>i({path:new Set,inserted:null,deleted:null}),800)}h.useEffect(()=>()=>d.current&&clearTimeout(d.current),[]),h.useEffect(()=>{for(const A of ws)a.current.insert(A);s(a.current.snapshot()),n(`Balanced-ish seed [${ws.join(", ")}]. h=${a.current.stats().height}.`)},[]);function p(){s(a.current.snapshot())}function u(A){if(!Number.isFinite(A)){n("Insert needs a numeric key.");return}const R=a.current.insert(A);p(),f({path:new Set(R.path),inserted:R.insertedId,deleted:null}),R.duplicate?n(`Insert ${A}: already present at ${R.insertedId}.`):n(`Insert ${A}: walked ${R.path.length-1} edges, placed at ${R.insertedId}.`)}function m(A){if(!Number.isFinite(A)){n("Search needs a numeric key.");return}const R=a.current.search(A);f({path:new Set(R.path),inserted:null,deleted:null}),n(R.foundId?`Search ${A}: found at ${R.foundId} after ${R.path.length-1} edge(s).`:`Search ${A}: not found (traversed ${R.path.length} node(s)).`)}function w(A){if(!Number.isFinite(A)){n("Delete needs a numeric key.");return}const R=a.current.remove(A);p(),f({path:new Set(R.path),inserted:null,deleted:R.deletedId}),R.deletedId?n(`Delete ${A}: removed ${R.deletedId}`+(R.successorId?` (replaced with successor ${R.successorId}).`:".")):n(`Delete ${A}: not found.`)}function b(){a.current.clear();for(const R of Rt)a.current.insert(R);p();const A=a.current.stats().height;n(`Sequential seed [${Rt.join(", ")}] → right-skewed. h=${A}, n=${Rt.length}. Worst case: a BST degrades to a linked list on sorted input.`),f({path:new Set,inserted:null,deleted:null})}function k(){a.current.clear();for(const R of Et)a.current.insert(R);p();const A=a.current.stats().height;n(`Random-order seed [${Et.join(", ")}] → balanced-ish. h=${A}, n=${Et.length}.`),f({path:new Set,inserted:null,deleted:null})}function $(){a.current.clear(),p(),n("Cleared."),f({path:new Set,inserted:null,deleted:null})}const g=()=>{const A=Number(c);return Number.isFinite(A)?A:NaN};function z(A){A.key==="Enter"&&(u(g()),r(""))}const F=h.useMemo(()=>{let A=0,R=-1;return(function S(P,L){P&&(A++,L>R&&(R=L),S(P.left,L+1),S(P.right,L+1))})(t.root,0),{nodes:A,height:R}},[t]),{positions:M,width:y}=h.useMemo(()=>Za(t.root),[t]),{nodes:C,edges:T}=h.useMemo(()=>Ja(t.root),[t]),v=24,I=24,j=Math.max(y+v*2,500),x=Math.max((F.height+1)*nn+I*2,180),N=A=>l.path.has(A.parent)&&l.path.has(A.child),E=t.root===null;return e.jsxs("div",{className:"bstw-root",children:[e.jsx("style",{children:Qa}),e.jsxs("div",{className:"bstw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"bstw-title",children:"Binary Search Tree"}),e.jsx("div",{className:"bstw-sub",children:"CLRS ch.12 — ordering invariant; no balancing. Sorted input → O(n) height."})]}),e.jsx("div",{className:"bstw-head-right",children:e.jsx("button",{className:"bstw-btn bstw-danger",onClick:$,children:"Reset"})})]}),e.jsxs("div",{className:"bstw-bar",children:[e.jsx("input",{className:"bstw-input",placeholder:"key",type:"number",value:c,onChange:A=>r(A.target.value),onKeyDown:z}),e.jsx("button",{className:"bstw-btn",onClick:()=>{u(g()),r("")},children:"Insert"}),e.jsx("button",{className:"bstw-btn bstw-ghost",onClick:()=>m(g()),children:"Search"}),e.jsx("button",{className:"bstw-btn bstw-ghost",onClick:()=>{w(g()),r("")},children:"Delete"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"bstw-quick",children:"Quick-seed:"}),e.jsx("button",{className:"bstw-btn bstw-ghost",onClick:b,children:"1..7 (worst case)"}),e.jsx("button",{className:"bstw-btn bstw-ghost",onClick:k,children:"random order"})]}),e.jsx("div",{className:"bstw-canvas-wrap",children:E?e.jsx("div",{className:"bstw-empty",children:"Empty tree. Insert a key or try a quick-seed."}):e.jsxs("svg",{width:j,height:x,viewBox:`0 0 ${j} ${x}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:T.map(A=>{const R=M[A.parent],S=M[A.child];if(!R||!S)return null;const P=R.x+v,L=R.y+I,B=S.x+v,q=S.y+I,D=(L+q)/2,_=`M ${P} ${L} C ${P} ${D}, ${B} ${D}, ${B} ${q}`;return e.jsx("path",{className:"bstw-edge"+(N(A)?" bstw-edge-on-path":""),d:_},A.parent+"->"+A.child)})}),e.jsx("g",{children:C.map(A=>{const R=M[A.id];if(!R)return null;const S=["bstw-node"];return l.path.has(A.id)&&S.push("bstw-on-path"),l.inserted===A.id&&S.push("bstw-inserted"),l.deleted===A.id&&S.push("bstw-deleted"),e.jsxs("g",{className:S.join(" "),children:[e.jsx("circle",{cx:R.x+v,cy:R.y+I,r:Le}),e.jsx("text",{x:R.x+v,y:R.y+I,children:A.key})]},A.id)})})]})}),e.jsxs("div",{className:"bstw-footer",children:[e.jsxs("div",{className:"bstw-status",children:["Status: ",o]}),e.jsxs("div",{className:"bstw-stats",children:["nodes=",e.jsx("b",{children:F.nodes}),"   height=",e.jsx("b",{children:F.height}),"  min-possible-h=",e.jsx("b",{children:F.nodes>0?Math.ceil(Math.log2(F.nodes+1))-1:-1})]})]})]})}

export default eo;
export { eo as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(eo, {}));
  return () => root.unmount();
}
