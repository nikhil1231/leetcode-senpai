import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function qr(a){const t=[],s=new Array(a).fill(-1),o=new Set,n=new Set,c=new Set;let r=0,l=0;function i(f){return{...f,board:s.slice(),rowsUsed:new Set(o),diag1:new Set(n),diag2:new Set(c),solutionsSoFar:r}}function d(f){if(f===a){r++,t.push(i({kind:"solution",col:f,row:-1,solutionIndex:r,note:`Solution #${r} found: placed all ${a} queens.`}));return}for(let p=0;p<a;p++){l++,t.push(i({kind:"try",col:f,row:p,note:`Try row ${p} in column ${f}.`}));const u=o.has(p),m=n.has(p-f),w=c.has(p+f);if(u||m||w){const k=[];u&&k.push("row"),m&&k.push("↗ diag"),w&&k.push("↘ diag"),t.push(i({kind:"conflict",col:f,row:p,note:`(${p},${f}) conflicts on: ${k.join(", ")}. Skip.`}));continue}s[f]=p,o.add(p),n.add(p-f),c.add(p+f),t.push(i({kind:"place",col:f,row:p,note:`Place queen at (${p},${f}). Recurse to column ${f+1}.`})),d(f+1),s[f]=-1,o.delete(p),n.delete(p-f),c.delete(p+f),t.push(i({kind:"backtrack",col:f,row:p,note:`Backtrack from (${p},${f}) in column ${f}.`}))}}return t.push(i({kind:"start",col:0,row:-1,note:`Start N-Queens for N=${a}.`})),d(0),t.push(i({kind:"done",col:a,row:-1,note:`Search complete. Found ${r} solution(s) after ${l} placement attempts.`})),{N:a,steps:t,solutions:r,attempts:l}}
const Lr=`
.nqw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6;
  font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.nqw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.nqw-title { font-weight: 600; font-size: 15px; }
.nqw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.nqw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925;
  border-bottom: 1px solid #2a2f3e; flex-wrap: wrap;
}
.nqw-btn {
  padding: 6px 12px; background: #4a7cff; border: none;
  border-radius: 6px; color: white; font-weight: 500; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.nqw-btn:hover { background: #3b6ae8; }
.nqw-btn.nqw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.nqw-btn.nqw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.nqw-btn.nqw-danger { background: #c13c3c; }
.nqw-btn.nqw-danger:hover { background: #a73232; }
.nqw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.nqw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 60px;
}
.nqw-input:focus { outline: none; border-color: #4a7cff; }
.nqw-lbl { color: #8a93a8; font-size: 12px; }

.nqw-canvas-wrap {
  flex: 1; display: flex; align-items: center; justify-content: center;
  overflow: auto; padding: 20px;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  min-height: 320px;
}

.nqw-board { border: 2px solid #2a2f3e; border-radius: 4px; }
.nqw-cell {
  transition: fill 220ms ease, stroke 220ms ease;
}
.nqw-cell.nqw-dark  { fill: #1a1f2e; }
.nqw-cell.nqw-light { fill: #232a3c; }
.nqw-cell.nqw-try   { fill: #3a4a75; stroke: #ffd24a; stroke-width: 2; }
.nqw-cell.nqw-conflict {
  fill: #5a2020; stroke: #ff5c5c; stroke-width: 2;
  animation: nqw-flash 450ms ease-out;
}
.nqw-cell.nqw-placed { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2; }
@keyframes nqw-flash {
  0%   { fill: #ff5c5c; }
  100% { fill: #5a2020; }
}
.nqw-queen {
  fill: #ffd24a; font-size: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: central;
  pointer-events: none; user-select: none;
  filter: drop-shadow(0 0 3px rgba(255, 210, 74, 0.5));
}
.nqw-queen.nqw-queen-trying { fill: #e6e6e6; opacity: 0.5; }
.nqw-queen.nqw-queen-conflict { fill: #ff9090; opacity: 0.8; }

.nqw-axis-label {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}

.nqw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.nqw-status { color: #d1d5db; flex: 1; min-width: 0; }
.nqw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.nqw-stats b { color: #e6e6e6; }
.nqw-stats .nqw-good { color: #4a9f6f; }
`,Qs=10,Zs=4;
function Dr(){const[a,t]=h.useState(8),[s,o]=h.useState(8),n=h.useMemo(()=>qr(s),[s]),[c,r]=h.useState(0),[l,i]=h.useState(!1),[d,f]=h.useState(120),p=h.useRef(null),u=n.steps[c]||n.steps[n.steps.length-1],m=c>=n.steps.length-1;h.useEffect(()=>{r(0),i(!1)},[s]),h.useEffect(()=>{if(l){if(m){i(!1);return}return p.current=setTimeout(()=>{r(v=>Math.min(v+1,n.steps.length-1))},d),()=>clearTimeout(p.current)}},[l,c,m,d,n.steps.length]);function w(){const v=Math.max(Zs,Math.min(Qs,Number(a)||8));t(v),o(v)}function b(){r(0),i(!1)}function k(){i(!1),r(v=>Math.min(v+1,n.steps.length-1))}function $(){i(!1);for(let v=c+1;v<n.steps.length;v++)if(n.steps[v].kind==="solution"){r(v);return}r(n.steps.length-1)}function g(){i(!1),r(n.steps.length-1)}const z=s<=6?56:s<=8?46:38,F=z*s,M=20,y=F+M*2,C=u.board||new Array(s).fill(-1);function T(v,I){const j=(v+I)%2===0?"nqw-light":"nqw-dark";if(C[I]===v)return"nqw-cell nqw-placed";if(u.col===I&&u.row===v){if(u.kind==="conflict")return"nqw-cell nqw-conflict";if(u.kind==="try"||u.kind==="place")return"nqw-cell nqw-try"}return"nqw-cell "+j}return e.jsxs("div",{className:"nqw-root",children:[e.jsx("style",{children:Lr}),e.jsx("div",{className:"nqw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"nqw-title",children:"N-Queens Backtracking"}),e.jsx("div",{className:"nqw-sub",children:"Column-by-column placement with row / diag1 / diag2 conflict sets."})]})}),e.jsxs("div",{className:"nqw-bar",children:[e.jsx("span",{className:"nqw-lbl",children:"N"}),e.jsx("input",{className:"nqw-input",type:"number",min:Zs,max:Qs,value:a,onChange:v=>t(Number(v.target.value)||4),onKeyDown:v=>{v.key==="Enter"&&w()}}),e.jsx("button",{className:"nqw-btn",onClick:w,children:"Apply"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"nqw-btn",onClick:k,disabled:m,children:"Step"}),e.jsx("button",{className:"nqw-btn nqw-ghost",onClick:()=>i(v=>!v),disabled:m,children:l?"Pause":"Play"}),e.jsx("button",{className:"nqw-btn nqw-ghost",onClick:$,disabled:m,children:"Next solution"}),e.jsx("button",{className:"nqw-btn nqw-ghost",onClick:g,disabled:m,children:"Skip"}),e.jsx("button",{className:"nqw-btn nqw-danger",onClick:b,children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"nqw-lbl",children:"speed"}),e.jsxs("select",{className:"nqw-input",style:{width:80},value:d,onChange:v=>f(Number(v.target.value)),children:[e.jsx("option",{value:400,children:"slow"}),e.jsx("option",{value:200,children:"med"}),e.jsx("option",{value:120,children:"fast"}),e.jsx("option",{value:40,children:"turbo"})]})]}),e.jsx("div",{className:"nqw-canvas-wrap",children:e.jsxs("svg",{className:"nqw-board",width:y,height:y,viewBox:`0 0 ${y} ${y}`,children:[e.jsx("rect",{x:0,y:0,width:y,height:y,fill:"#0f1419"}),Array.from({length:s},(v,I)=>e.jsx("text",{className:"nqw-axis-label",x:M+I*z+z/2,y:M-6,children:I},"col-"+I)),Array.from({length:s},(v,I)=>e.jsx("text",{className:"nqw-axis-label",x:M-10,y:M+I*z+z/2+3,children:I},"row-"+I)),Array.from({length:s},(v,I)=>Array.from({length:s},(j,x)=>e.jsx("rect",{className:T(I,x),x:M+x*z,y:M+I*z,width:z,height:z},`cell-${I}-${x}`))),C.map((v,I)=>v<0?null:e.jsx("text",{className:"nqw-queen",x:M+I*z+z/2,y:M+v*z+z/2,children:"♛"},`q-${I}`)),(u.kind==="try"||u.kind==="conflict")&&u.row>=0&&u.col>=0&&C[u.col]===-1&&e.jsx("text",{className:"nqw-queen "+(u.kind==="conflict"?"nqw-queen-conflict":"nqw-queen-trying"),x:M+u.col*z+z/2,y:M+u.row*z+z/2,children:"♛"})]})}),e.jsxs("div",{className:"nqw-footer",children:[e.jsxs("div",{className:"nqw-status",children:["Status: ",u.note]}),e.jsxs("div",{className:"nqw-stats",children:["step=",e.jsxs("b",{children:[c+1,"/",n.steps.length]}),"   solutions=",e.jsx("b",{className:"nqw-good",children:u.solutionsSoFar||0})," / ",e.jsx("b",{children:n.solutions}),"   N=",e.jsx("b",{children:s})]})]})]})}

export default Dr;
export { Dr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Dr, {}));
  return () => root.unmount();
}
