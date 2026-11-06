import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function qn(a){const t=[0],s=[{kind:"fill",i:0,value:0,prev:null,contrib:null,note:"P[0] = 0 (empty prefix)."}];for(let o=0;o<a.length;o++){const n=t[o],c=n+a[o];t.push(c),s.push({kind:"fill",i:o+1,value:c,prev:n,contrib:a[o],note:`P[${o+1}] = P[${o}] + A[${o}] = ${n} + ${a[o]} = ${c}.`})}return{A:a.slice(),P:t,buildSteps:s}}
function Ln(a,t,s){const o=a[t],n=a[s+1];return{l:t,r:s,left:o,right:n,sum:n-o}}
const Dn=`
.psw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.psw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.psw-title { font-weight: 600; font-size: 15px; }
.psw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.psw-head-right { display: flex; gap: 8px; align-items: center; }
.psw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.psw-input {
  padding: 6px 10px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 260px;
}
.psw-input.small { width: 70px; }
.psw-input:focus { outline: none; border-color: #4a7cff; }
.psw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.psw-btn:hover { background: #3b6ae8; }
.psw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.psw-btn.psw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.psw-btn.psw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.psw-btn.psw-danger { background: #c13c3c; }
.psw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.psw-canvas-wrap {
  flex: 1; min-height: 320px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px 20px;
  display: flex; align-items: center; justify-content: center;
}
.psw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.psw-status { color: #d1d5db; flex: 1; min-width: 0; }
.psw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.psw-stats b { color: #e6e6e6; }

.psw-row-label {
  fill: #8a93a8; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.psw-cell rect {
  stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease;
}
.psw-cell.a rect { fill: #1f2a3a; stroke: #3a4560; }
.psw-cell.p rect { fill: #1a2030; stroke: #3a4560; }
.psw-cell.a.selected rect { fill: #2a3550; stroke: #4a7cff; stroke-width: 2.5; cursor: pointer; }
.psw-cell.a.in-range rect { fill: #2a3550; stroke: #4a7cff; }
.psw-cell.p.q-left rect {
  fill: #3a1a1a; stroke: #c13c3c; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(193, 60, 60, 0.6));
}
.psw-cell.p.q-right rect {
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(74, 159, 111, 0.6));
}
.psw-cell.p.filled rect {
  animation: psw-fill-in 400ms ease-out;
}
.psw-cell.a rect { cursor: pointer; }
.psw-cell text.val {
  fill: #e6e6e6; font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.psw-cell text.idx {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
@keyframes psw-fill-in {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
}
.psw-arrow {
  fill: none; stroke: #ffd24a; stroke-width: 2;
  stroke-dasharray: 4 3;
  marker-end: url(#psw-arrowhead);
}
.psw-formula {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  fill: #e6e6e6; font-size: 14px; text-anchor: middle;
}
.psw-formula .minus { fill: #c13c3c; }
.psw-formula .plus  { fill: #4a9f6f; }
`,it={small:"3,1,4,1,5,9,2,6",mixed:"2,-1,3,5,-2,4,1",range:"10,20,30,40,50,60,70,80"},pe=54,fe=48,rt=6;
function Bn(a){return a.split(/[\s,]+/).map(t=>t.trim()).filter(Boolean).map(Number).filter(t=>Number.isFinite(t))}
function _n(){const[a,t]=h.useState(it.small),s=h.useMemo(()=>{const S=Bn(a);return S.length?S:[3,1,4,1,5]},[a]),{P:o,buildSteps:n}=h.useMemo(()=>qn(s),[s]),[c,r]=h.useState(n.length-1),[l,i]=h.useState(!1),d=h.useRef(null);h.useEffect(()=>r(n.length-1),[n]),h.useEffect(()=>{if(l){if(c>=n.length-1){i(!1);return}return d.current=setTimeout(()=>r(S=>S+1),550),()=>clearTimeout(d.current)}},[l,c,n]),h.useEffect(()=>()=>clearTimeout(d.current),[]);const[f,p]=h.useState(1),[u,m]=h.useState(Math.min(3,s.length-1));h.useEffect(()=>{f>=s.length&&p(0),u>=s.length&&m(s.length-1)},[s.length]);function w(S){f===S&&u===S||(S<f?p(S):S>u?m(S):Math.abs(S-f)<=Math.abs(S-u)?p(S):m(S))}const b=h.useMemo(()=>Ln(o,Math.min(f,u),Math.max(f,u)),[o,f,u]),k=Math.min(f,u),$=Math.max(f,u),g=s.length,z=Math.max((g+1)*(pe+rt)+60,500),F=260,M=60,y=40,C=140;function T(S){return M+S*(pe+rt)}function v(S){return M+S*(pe+rt)+(pe+rt)/2}function I(S){const P=["psw-cell","a"];return S>=k&&S<=$&&P.push("in-range"),(S===f||S===u)&&P.push("selected"),P.join(" ")}function j(S){const P=["psw-cell","p"];return S>c?P.join(" ")+" hidden":(S<=c&&P.push("filled"),S===k&&P.push("q-left"),S===$+1&&P.push("q-right"),P.join(" "))}function x(){c<n.length-1&&r(c+1)}function N(){i(!1),r(0),setTimeout(()=>i(!0),50)}function E(){i(!1),r(n.length-1)}let R=n[Math.min(c,n.length-1)].note;return c>=n.length-1&&(R=`Prefix built. Range A[${k}..${$}] sum = P[${$+1}] − P[${k}] = ${b.right} − ${b.left} = ${b.sum}. Click cells in the A row to move the range.`),e.jsxs("div",{className:"psw-root",children:[e.jsx("style",{children:Dn}),e.jsxs("div",{className:"psw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"psw-title",children:"Prefix Sum — Range Query in O(1)"}),e.jsx("div",{className:"psw-sub",children:"Precompute once in O(n); every range-sum query reduces to one subtraction"})]}),e.jsxs("div",{className:"psw-head-right",children:[e.jsx("button",{className:"psw-btn psw-ghost",onClick:N,children:"Replay build"}),e.jsx("button",{className:"psw-btn psw-danger",onClick:E,children:"Reset"})]})]}),e.jsxs("div",{className:"psw-bar",children:[e.jsx("label",{className:"psw-quick",children:"Array A:"}),e.jsx("input",{className:"psw-input",value:a,onChange:S=>t(S.target.value),placeholder:"3,1,4,1,5,9,2,6"}),e.jsx("button",{className:"psw-btn",onClick:x,disabled:c>=n.length-1,children:"Build step"}),e.jsx("span",{style:{width:12}}),e.jsx("label",{className:"psw-quick",children:"l:"}),e.jsx("input",{className:"psw-input small",type:"number",value:f,onChange:S=>p(Math.max(0,Math.min(g-1,Number(S.target.value))))}),e.jsx("label",{className:"psw-quick",children:"r:"}),e.jsx("input",{className:"psw-input small",type:"number",value:u,onChange:S=>m(Math.max(0,Math.min(g-1,Number(S.target.value))))}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"psw-quick",children:"Seeds:"}),e.jsx("button",{className:"psw-btn psw-ghost",onClick:()=>t(it.small),children:"small"}),e.jsx("button",{className:"psw-btn psw-ghost",onClick:()=>t(it.mixed),children:"mixed"}),e.jsx("button",{className:"psw-btn psw-ghost",onClick:()=>t(it.range),children:"range"})]}),e.jsx("div",{className:"psw-canvas-wrap",children:e.jsxs("svg",{width:z,height:F,viewBox:`0 0 ${z} ${F}`,children:[e.jsx("defs",{children:e.jsx("marker",{id:"psw-arrowhead",markerWidth:"8",markerHeight:"8",refX:"6",refY:"4",orient:"auto",children:e.jsx("polygon",{points:"0,0 8,4 0,8",fill:"#ffd24a"})})}),e.jsx("text",{x:12,y:y+fe/2+4,className:"psw-row-label",children:"A[i]"}),e.jsx("text",{x:12,y:C+fe/2+4,className:"psw-row-label",children:"P[i]"}),e.jsx("g",{children:s.map((S,P)=>e.jsxs("g",{className:I(P),onClick:()=>w(P),children:[e.jsx("rect",{x:T(P),y,width:pe,height:fe,rx:6,ry:6}),e.jsx("text",{className:"val",x:T(P)+pe/2,y:y+fe/2,children:S}),e.jsx("text",{className:"idx",x:T(P)+pe/2,y:y+fe+14,children:P})]},"a"+P))}),e.jsx("g",{children:o.map((S,P)=>e.jsxs("g",{className:j(P),children:[e.jsx("rect",{x:v(P)-pe/2,y:C,width:pe,height:fe,rx:6,ry:6}),e.jsx("text",{className:"val",x:v(P),y:C+fe/2,children:P<=c?S:""}),e.jsx("text",{className:"idx",x:v(P),y:C+fe+14,children:P})]},"p"+P))}),c>=n.length-1&&e.jsxs("text",{className:"psw-formula",x:z/2,y:F-20,children:[e.jsxs("tspan",{className:"plus",children:["P[",$+1,"]=",b.right]}),e.jsx("tspan",{children:" − "}),e.jsxs("tspan",{className:"minus",children:["P[",k,"]=",b.left]}),e.jsx("tspan",{children:" = "}),e.jsx("tspan",{style:{fill:"#ffd24a",fontWeight:700},children:b.sum})]})]})}),e.jsxs("div",{className:"psw-footer",children:[e.jsxs("div",{className:"psw-status",children:["Status: ",R]}),e.jsxs("div",{className:"psw-stats",children:["n=",e.jsx("b",{children:g}),"   [l,r]=[",e.jsx("b",{children:k}),",",e.jsx("b",{children:$}),"]   sum=",e.jsx("b",{children:b.sum})]})]})]})}

export default _n;
export { _n as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(_n, {}));
  return () => root.unmount();
}
