import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ga(a){const t=a.length,s=new Array(t).fill(-1),o=[],n=[];n.push({phase:"init",i:-1,stack:[],result:s.slice(),resolved:null,note:t===0?"Empty input.":"Start. Scan left → right. Stack holds indices of values still searching for a greater element to the right."});for(let c=0;c<t;c++){for(;o.length>0&&a[o[o.length-1]]<a[c];){const r=o[o.length-1];s[r]=a[c],o.pop(),n.push({phase:"pop",i:c,stack:o.slice(),result:s.slice(),resolved:r,note:`i=${c} (value ${a[c]}) resolves index ${r} (value ${a[r]}): next greater = ${a[c]}.`})}o.push(c),n.push({phase:"push",i:c,stack:o.slice(),result:s.slice(),resolved:null,note:o.length===1?`Push index ${c} (value ${a[c]}). Stack was empty.`:`Push index ${c} (value ${a[c]}). Top is strictly greater, monotonic invariant holds.`})}return n.push({phase:"done",i:t,stack:o.slice(),result:s.slice(),resolved:null,note:o.length===0?"Done. Stack is empty — every element was resolved.":`Done. ${o.length} index(es) left on stack have no greater element to the right; they stay -1.`}),n}
const ka=`
.msw-root {
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
.msw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.msw-title { font-weight: 600; font-size: 15px; }
.msw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.msw-head-right { display: flex; gap: 8px; align-items: center; }
.msw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.msw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 240px;
}
.msw-input:focus { outline: none; border-color: #4a7cff; }
.msw-btn {
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
.msw-btn:hover { background: #3b6ae8; }
.msw-btn:disabled { background: #2a2f3e; color: #6a7389; cursor: not-allowed; }
.msw-btn.msw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.msw-btn.msw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.msw-btn.msw-danger { background: #c13c3c; }
.msw-btn.msw-danger:hover { background: #a73232; }
.msw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }

.msw-canvas-wrap {
  flex: 1;
  min-height: 300px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px;
}
.msw-stage {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 32px;
  min-height: 240px;
}
.msw-panel-title {
  font-size: 11px;
  color: #8a93a8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.msw-array {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.msw-cell {
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
  transition: background 400ms ease, border-color 400ms ease, transform 400ms ease, filter 400ms ease;
  position: relative;
}
.msw-cell .msw-idx {
  position: absolute;
  top: -18px;
  font-size: 10px;
  color: #6a7389;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.msw-cell.msw-cursor {
  border-color: #ffd24a;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.5));
  background: #2a2515;
}
.msw-cell.msw-resolved {
  border-color: #4a9f6f;
  background: #1f3a2e;
}
.msw-cell.msw-flash {
  animation: msw-flash 600ms ease-out 1;
}
@keyframes msw-flash {
  0%   { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255, 210, 74, 0)); }
  50%  { transform: scale(1.12); filter: drop-shadow(0 0 14px rgba(255, 210, 74, 0.8)); }
  100% { transform: scale(1); }
}

.msw-stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  align-items: center;
  padding: 10px;
  border: 1px dashed #2a2f3e;
  border-radius: 10px;
  min-height: 200px;
  background: rgba(74, 124, 255, 0.04);
}
.msw-stack-label {
  font-size: 10px;
  color: #6a7389;
  text-align: center;
  margin-top: 6px;
}
.msw-stack-item {
  width: 90px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #2a3550;
  border: 1.5px solid #4a5f8f;
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  animation: msw-stack-in 300ms ease-out 1;
}
.msw-stack-item.msw-stack-top {
  border-color: #4a7cff;
  filter: drop-shadow(0 0 6px rgba(74, 124, 255, 0.4));
}
.msw-stack-item .msw-stack-ix { color: #8a93a8; font-size: 11px; }
@keyframes msw-stack-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.msw-stack-empty {
  color: #6a7389;
  font-size: 12px;
  font-style: italic;
  margin: auto;
}

.msw-result-section { margin-top: 36px; }
.msw-anno {
  color: #ffd24a;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 6px;
  min-height: 14px;
}

.msw-footer {
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
.msw-status { color: #d1d5db; flex: 1; min-width: 0; }
.msw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.msw-stats b { color: #e6e6e6; }
`,ct=[2,1,5,6,2,3];
function ya(a){if(!a.trim())return null;const t=a.split(/[\s,]+/).map(o=>o.trim()).filter(Boolean),s=[];for(const o of t){const n=Number(o);if(!Number.isFinite(n))return null;s.push(n)}return s}
function ja(){const[a,t]=h.useState(ct),[s,o]=h.useState(ct.join(", ")),[n,c]=h.useState(0),[r,l]=h.useState(!1),[i,d]=h.useState(null),f=h.useRef(null),p=h.useMemo(()=>ga(a),[a]),u=p[Math.min(n,p.length-1)];h.useEffect(()=>{if(u.phase==="pop"&&u.resolved!==null){d(u.resolved);const g=setTimeout(()=>d(null),600);return()=>clearTimeout(g)}d(null)},[n,u.phase,u.resolved]),h.useEffect(()=>{if(r){if(n>=p.length-1){l(!1);return}return f.current=setTimeout(()=>c(g=>g+1),700),()=>clearTimeout(f.current)}},[r,n,p.length]);function m(g){l(!1),g&&t(g),c(0),d(null)}function w(){const g=ya(s);!g||g.length===0||m(g)}function b(){l(!1),c(g=>Math.min(g+1,p.length-1))}function k(){l(!1),c(g=>Math.max(g-1,0))}const $=n>=p.length-1;return e.jsxs("div",{className:"msw-root",children:[e.jsx("style",{children:ka}),e.jsxs("div",{className:"msw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"msw-title",children:"Monotonic Stack — Next Greater Element"}),e.jsx("div",{className:"msw-sub",children:"Decreasing stack of indices; each index is pushed once, popped at most once → O(n)."})]}),e.jsx("div",{className:"msw-head-right",children:e.jsx("button",{className:"msw-btn msw-danger",onClick:()=>{o(ct.join(", ")),m(ct)},children:"Reset"})})]}),e.jsxs("div",{className:"msw-bar",children:[e.jsx("input",{className:"msw-input",placeholder:"comma- or space-separated ints",value:s,onChange:g=>o(g.target.value),onKeyDown:g=>g.key==="Enter"&&w()}),e.jsx("button",{className:"msw-btn",onClick:w,children:"Apply"}),e.jsx("span",{style:{width:8}}),e.jsx("button",{className:"msw-btn msw-ghost",onClick:k,disabled:n===0,children:"◀ Back"}),e.jsx("button",{className:"msw-btn",onClick:b,disabled:$,children:"Step ▶"}),e.jsx("button",{className:"msw-btn msw-ghost",onClick:()=>l(g=>!g),disabled:$,children:r?"Pause":"Play"}),e.jsx("button",{className:"msw-btn msw-ghost",onClick:()=>m(),children:"Restart"}),e.jsx("span",{style:{flex:1}}),e.jsxs("span",{className:"msw-quick",children:["Step ",Math.min(n+1,p.length)," / ",p.length]})]}),e.jsx("div",{className:"msw-canvas-wrap",children:e.jsxs("div",{className:"msw-stage",children:[e.jsxs("div",{children:[e.jsx("div",{className:"msw-panel-title",children:"Input array"}),e.jsx("div",{className:"msw-array",children:a.map((g,z)=>{const F=["msw-cell"];return u.i===z&&u.phase!=="done"&&F.push("msw-cursor"),u.result[z]!==-1&&F.push("msw-resolved"),i===z&&F.push("msw-flash"),e.jsxs("div",{className:F.join(" "),children:[e.jsxs("span",{className:"msw-idx",children:["i=",z]}),g]},z)})}),e.jsx("div",{className:"msw-anno",children:u.phase==="pop"&&u.resolved!==null?`arr[${u.resolved}]=${a[u.resolved]} resolved by arr[${u.i}]=${a[u.i]}`:u.phase==="push"?`pushed index ${u.i} (value ${a[u.i]})`:""}),e.jsxs("div",{className:"msw-result-section",children:[e.jsx("div",{className:"msw-panel-title",children:"Result — next greater (−1 = none)"}),e.jsx("div",{className:"msw-array",children:u.result.map((g,z)=>{const F=["msw-cell"];return g!==-1&&F.push("msw-resolved"),i===z&&F.push("msw-flash"),e.jsxs("div",{className:F.join(" "),children:[e.jsxs("span",{className:"msw-idx",children:["i=",z]}),g===-1?"·":g]},z)})})]})]}),e.jsxs("div",{children:[e.jsx("div",{className:"msw-panel-title",children:"Stack (top ↑)"}),e.jsx("div",{className:"msw-stack",children:u.stack.length===0?e.jsx("div",{className:"msw-stack-empty",children:"empty"}):u.stack.map((g,z)=>{const F=z===u.stack.length-1;return e.jsxs("div",{className:"msw-stack-item"+(F?" msw-stack-top":""),children:[e.jsxs("span",{className:"msw-stack-ix",children:["i=",g]}),e.jsx("span",{children:a[g]})]},`${g}-${z}`)})}),e.jsx("div",{className:"msw-stack-label",children:"indices, values strictly decreasing ↑"})]})]})}),e.jsxs("div",{className:"msw-footer",children:[e.jsxs("div",{className:"msw-status",children:["Status: ",u.note]}),e.jsxs("div",{className:"msw-stats",children:["n=",e.jsx("b",{children:a.length}),"   stack=",e.jsx("b",{children:u.stack.length}),"   resolved=",e.jsx("b",{children:u.result.filter(g=>g!==-1).length}),"   frame=",e.jsxs("b",{children:[n+1,"/",p.length]})]})]})]})}

export default ja;
export { ja as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ja, {}));
  return () => root.unmount();
}
