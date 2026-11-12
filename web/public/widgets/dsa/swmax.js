import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function va(a,t){const s=a.length,o=[],n=[],c=[];if(t<=0||s===0||t>s)return o.push({sub:"init",i:-1,deque:[],output:[],windowStart:null,windowEnd:null,poppedBack:null,poppedFront:null,note:s===0?"Empty input.":t<=0?`Invalid k=${t}.`:`k=${t} > n=${s}: no full window possible.`}),o;o.push({sub:"init",i:-1,deque:[],output:[],windowStart:null,windowEnd:null,poppedBack:null,poppedFront:null,note:`Start. Window size k=${t}. Deque holds indices with strictly decreasing values.`});for(let r=0;r<s;r++){const l=Math.max(0,r-t+1),i=r;for(;n.length>0&&n[0]<=r-t;){const d=n.shift();o.push({sub:"front-evict",i:r,deque:n.slice(),output:c.slice(),windowStart:l,windowEnd:i,poppedBack:null,poppedFront:d,note:`i=${r}: evict index ${d} from front — window is [${l}..${i}], ${d} is out of range.`})}for(;n.length>0&&a[n[n.length-1]]<=a[r];){const d=n.pop();o.push({sub:"back-pop",i:r,deque:n.slice(),output:c.slice(),windowStart:l,windowEnd:i,poppedBack:d,poppedFront:null,note:`i=${r} (value ${a[r]}): pop back index ${d} (value ${a[d]}) — dominated by current.`})}if(n.push(r),o.push({sub:"push",i:r,deque:n.slice(),output:c.slice(),windowStart:l,windowEnd:i,poppedBack:null,poppedFront:null,note:`Push index ${r} (value ${a[r]}) to back. Deque front is current candidate max.`}),r>=t-1){const d=n[0];c.push(a[d]),o.push({sub:"emit",i:r,deque:n.slice(),output:c.slice(),windowStart:l,windowEnd:i,poppedBack:null,poppedFront:null,note:`Window [${l}..${i}] max = arr[${d}] = ${a[d]}.`})}else o.push({sub:"skip",i:r,deque:n.slice(),output:c.slice(),windowStart:l,windowEnd:i,poppedBack:null,poppedFront:null,note:`Window not full yet (need k=${t} elements). Keep scanning.`})}return o.push({sub:"done",i:s,deque:n.slice(),output:c.slice(),windowStart:s-t,windowEnd:s-1,poppedBack:null,poppedFront:null,note:`Done. Emitted ${c.length} window maxima: [${c.join(", ")}].`}),o}
const Na=`
.swm-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.swm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.swm-title { font-weight: 600; font-size: 15px; }
.swm-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.swm-head-right { display: flex; gap: 8px; align-items: center; }
.swm-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.swm-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.swm-input.arr { width: 260px; }
.swm-input.k { width: 56px; text-align: center; }
.swm-input:focus { outline: none; border-color: #4a7cff; }
.swm-btn {
  padding: 6px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.swm-btn:hover { background: #3b6ae8; }
.swm-btn:disabled { background: #2a2f3e; color: #6a7389; cursor: not-allowed; }
.swm-btn.swm-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.swm-btn.swm-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.swm-btn.swm-danger { background: #c13c3c; }
.swm-btn.swm-danger:hover { background: #a73232; }
.swm-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }

.swm-canvas-wrap {
  flex: 1;
  min-height: 320px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px;
}

.swm-panel-title {
  font-size: 11px;
  color: #8a93a8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}
.swm-section { margin-bottom: 28px; }

.swm-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  position: relative;
}
.swm-cell {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: #1a1f2e;
  border: 1.5px solid #2a2f3e;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 15px;
  position: relative;
  transition: background 300ms ease, border-color 300ms ease, filter 300ms ease;
}
.swm-cell .swm-idx {
  position: absolute;
  top: -18px;
  font-size: 10px;
  color: #6a7389;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.swm-cell.swm-in-window {
  background: #15243a;
  border-color: #4a7cff;
}
.swm-cell.swm-cursor {
  border-color: #ffd24a;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.5));
  background: #2a2515;
}
.swm-cell.swm-is-max {
  border-color: #4a9f6f;
  background: #1f3a2e;
  filter: drop-shadow(0 0 6px rgba(74, 159, 111, 0.5));
}
.swm-cell.swm-flash-out {
  animation: swm-flash-red 500ms ease-out 1;
}
@keyframes swm-flash-red {
  0%   { background: #5a2020; border-color: #ff5c5c; transform: scale(1); }
  60%  { background: #5a2020; border-color: #ff5c5c; transform: scale(1.1); }
  100% { background: #1a1f2e; border-color: #2a2f3e; transform: scale(1); }
}

.swm-deque {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #2a2f3e;
  border-radius: 10px;
  background: rgba(74, 124, 255, 0.04);
  min-height: 70px;
  align-items: center;
}
.swm-deque-empty {
  color: #6a7389;
  font-style: italic;
  font-size: 12px;
  margin: auto;
}
.swm-deque-item {
  padding: 8px 12px;
  border-radius: 6px;
  background: #2a3550;
  border: 1.5px solid #4a5f8f;
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 54px;
  animation: swm-dq-in 280ms ease-out 1;
}
.swm-deque-item.swm-deque-front {
  border-color: #4a9f6f;
  background: #1f3a2e;
  filter: drop-shadow(0 0 6px rgba(74, 159, 111, 0.5));
}
.swm-deque-item .swm-dq-ix { color: #8a93a8; font-size: 10px; }
@keyframes swm-dq-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.swm-deque-label {
  color: #6a7389;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 0 6px;
}

.swm-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #141925;
  border-top: 1px solid #2a2f3e;
  font-size: 13px;
  gap: 16px;
  flex-wrap: wrap;
}
.swm-status { color: #d1d5db; flex: 1; min-width: 0; }
.swm-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.swm-stats b { color: #e6e6e6; }
`,dt=[1,3,-1,-3,5,3,6,7],pt=3;
function Sa(a){if(!a.trim())return null;const t=a.split(/[\s,]+/).map(o=>o.trim()).filter(Boolean),s=[];for(const o of t){const n=Number(o);if(!Number.isFinite(n))return null;s.push(n)}return s}
function $a(){const[a,t]=h.useState(dt),[s,o]=h.useState(pt),[n,c]=h.useState(dt.join(", ")),[r,l]=h.useState(String(pt)),[i,d]=h.useState(0),[f,p]=h.useState(!1),[u,m]=h.useState(null),w=h.useRef(null),b=h.useMemo(()=>va(a,s),[a,s]),k=b[Math.min(i,b.length-1)];h.useEffect(()=>{if(k.poppedBack!==null)m(k.poppedBack);else if(k.poppedFront!==null)m(k.poppedFront);else{m(null);return}const v=setTimeout(()=>m(null),500);return()=>clearTimeout(v)},[i,k.poppedBack,k.poppedFront]),h.useEffect(()=>{if(f){if(i>=b.length-1){p(!1);return}return w.current=setTimeout(()=>d(v=>v+1),650),()=>clearTimeout(w.current)}},[f,i,b.length]);function $(){p(!1),d(0),m(null)}function g(){const v=Sa(n),I=Number(r);!v||v.length===0||!Number.isFinite(I)||I<1||(t(v),o(Math.min(I,v.length)),d(0),p(!1),m(null))}function z(){p(!1),d(v=>Math.min(v+1,b.length-1))}function F(){p(!1),d(v=>Math.max(v-1,0))}function M(){t(dt),o(pt),c(dt.join(", ")),l(String(pt)),d(0),p(!1),m(null)}const y=i>=b.length-1,C=v=>k.windowStart!==null&&v>=k.windowStart&&v<=k.windowEnd&&k.sub!=="init",T=v=>k.sub==="emit"&&k.deque.length>0&&k.deque[0]===v;return e.jsxs("div",{className:"swm-root",children:[e.jsx("style",{children:Na}),e.jsxs("div",{className:"swm-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"swm-title",children:"Sliding Window Maximum — Monotonic Deque"}),e.jsx("div",{className:"swm-sub",children:"Deque stores indices; values strictly decreasing front → back. Each index enters and leaves once → O(n)."})]}),e.jsx("div",{className:"swm-head-right",children:e.jsx("button",{className:"swm-btn swm-danger",onClick:M,children:"Reset"})})]}),e.jsxs("div",{className:"swm-bar",children:[e.jsx("input",{className:"swm-input arr",placeholder:"comma- or space-separated ints",value:n,onChange:v=>c(v.target.value),onKeyDown:v=>v.key==="Enter"&&g()}),e.jsx("span",{className:"swm-quick",children:"k="}),e.jsx("input",{className:"swm-input k",value:r,onChange:v=>l(v.target.value),onKeyDown:v=>v.key==="Enter"&&g()}),e.jsx("button",{className:"swm-btn",onClick:g,children:"Apply"}),e.jsx("span",{style:{width:8}}),e.jsx("button",{className:"swm-btn swm-ghost",onClick:F,disabled:i===0,children:"◀ Back"}),e.jsx("button",{className:"swm-btn",onClick:z,disabled:y,children:"Step ▶"}),e.jsx("button",{className:"swm-btn swm-ghost",onClick:()=>p(v=>!v),disabled:y,children:f?"Pause":"Play"}),e.jsx("button",{className:"swm-btn swm-ghost",onClick:$,children:"Restart"}),e.jsx("span",{style:{flex:1}}),e.jsxs("span",{className:"swm-quick",children:["Step ",Math.min(i+1,b.length)," / ",b.length]})]}),e.jsxs("div",{className:"swm-canvas-wrap",children:[e.jsxs("div",{className:"swm-section",children:[e.jsxs("div",{className:"swm-panel-title",children:["Input array — window [",k.windowStart??"·","..",k.windowEnd??"·","]"]}),e.jsx("div",{className:"swm-row",children:a.map((v,I)=>{const j=["swm-cell"];return C(I)&&j.push("swm-in-window"),k.i===I&&k.sub!=="init"&&k.sub!=="done"&&j.push("swm-cursor"),T(I)&&j.push("swm-is-max"),u===I&&j.push("swm-flash-out"),e.jsxs("div",{className:j.join(" "),children:[e.jsxs("span",{className:"swm-idx",children:["i=",I]}),v]},I)})})]}),e.jsxs("div",{className:"swm-section",children:[e.jsx("div",{className:"swm-panel-title",children:"Deque (front ← → back)"}),e.jsxs("div",{className:"swm-deque",children:[e.jsx("span",{className:"swm-deque-label",children:"FRONT"}),k.deque.length===0?e.jsx("div",{className:"swm-deque-empty",children:"empty"}):k.deque.map((v,I)=>e.jsxs("div",{className:"swm-deque-item"+(I===0?" swm-deque-front":""),children:[e.jsxs("span",{className:"swm-dq-ix",children:["i=",v]}),e.jsx("span",{children:a[v]})]},`${v}-${I}`)),e.jsx("span",{style:{flex:1}}),e.jsx("span",{className:"swm-deque-label",children:"BACK"})]})]}),e.jsxs("div",{className:"swm-section",children:[e.jsx("div",{className:"swm-panel-title",children:"Output — window maxima"}),e.jsx("div",{className:"swm-row",children:k.output.length===0?e.jsx("div",{style:{color:"#6a7389",fontStyle:"italic",fontSize:12},children:"no window has been emitted yet"}):k.output.map((v,I)=>e.jsxs("div",{className:"swm-cell swm-is-max",children:[e.jsxs("span",{className:"swm-idx",children:["w=",I]}),v]},I))})]})]}),e.jsxs("div",{className:"swm-footer",children:[e.jsxs("div",{className:"swm-status",children:["Status: ",k.note]}),e.jsxs("div",{className:"swm-stats",children:["n=",e.jsx("b",{children:a.length}),"   k=",e.jsx("b",{children:s}),"   deque=",e.jsx("b",{children:k.deque.length}),"   emitted=",e.jsx("b",{children:k.output.length}),"   frame=",e.jsxs("b",{children:[i+1,"/",b.length]})]})]})]})}

export default $a;
export { $a as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx($a, {}));
  return () => root.unmount();
}
