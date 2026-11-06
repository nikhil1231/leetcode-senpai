import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function _i(a,t){const s=[];let o=0,n=a.length-1;for(;o<=n;){const c=o+n>>1,r=a[c];if(r===t)return s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`arr[${c}] = ${r} equals target ${t}. Found.`,result:c,done:!0}),s;r<t?(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`arr[${c}] = ${r} < ${t}. Discard left half; lo = ${c+1}.`,result:null,done:!1}),o=c+1):(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`arr[${c}] = ${r} > ${t}. Discard right half; hi = ${c-1}.`,result:null,done:!1}),n=c-1)}return s.push({arr:a,lo:o,hi:n,mid:null,target:t,decision:`lo > hi. Target ${t} is not in the array.`,result:-1,done:!0}),s}
function Oi(a,t){const s=[];let o=0,n=a.length-1,c=-1;for(;o<=n;){const r=o+n>>1,l=a[r];l===t?(c=r,s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} matches. Record ${r}, keep looking left for an earlier match; hi = ${r-1}.`,result:null,done:!1}),n=r-1):l<t?(s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} < ${t}. lo = ${r+1}.`,result:null,done:!1}),o=r+1):(s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} > ${t}. hi = ${r-1}.`,result:null,done:!1}),n=r-1)}return s.push({arr:a,lo:o,hi:n,mid:null,target:t,decision:c===-1?`Exhausted search window. Target ${t} not present.`:`Converged. First occurrence of ${t} is at index ${c}.`,result:c,done:!0}),s}
function Wi(a,t){const s=[];let o=0,n=a.length-1,c=-1;for(;o<=n;){const r=o+n>>1,l=a[r];l===t?(c=r,s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} matches. Record ${r}, keep looking right for a later match; lo = ${r+1}.`,result:null,done:!1}),o=r+1):l<t?(s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} < ${t}. lo = ${r+1}.`,result:null,done:!1}),o=r+1):(s.push({arr:a,lo:o,hi:n,mid:r,target:t,decision:`arr[${r}] = ${l} > ${t}. hi = ${r-1}.`,result:null,done:!1}),n=r-1)}return s.push({arr:a,lo:o,hi:n,mid:null,target:t,decision:c===-1?`Exhausted search window. Target ${t} not present.`:`Converged. Last occurrence of ${t} is at index ${c}.`,result:c,done:!0}),s}
function Ui(a,t){const s=[];let o=0,n=a.length-1;for(;o<=n;){const c=o+n>>1,r=a[c];if(r===t)return s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`arr[${c}] = ${r} equals target. Found at ${c}.`,result:c,done:!0}),s;a[o]<=a[c]?a[o]<=t&&t<r?(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`Left [${o}..${c}] sorted; ${a[o]} ≤ ${t} < ${r}. Search left; hi = ${c-1}.`,result:null,done:!1}),n=c-1):(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`Left [${o}..${c}] sorted; target ${t} not in its range. Search right; lo = ${c+1}.`,result:null,done:!1}),o=c+1):r<t&&t<=a[n]?(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`Right [${c}..${n}] sorted; ${r} < ${t} ≤ ${a[n]}. Search right; lo = ${c+1}.`,result:null,done:!1}),o=c+1):(s.push({arr:a,lo:o,hi:n,mid:c,target:t,decision:`Right [${c}..${n}] sorted; target ${t} not in its range. Search left; hi = ${c-1}.`,result:null,done:!1}),n=c-1)}return s.push({arr:a,lo:o,hi:n,mid:null,target:t,decision:`lo > hi. Target ${t} not found in rotated array.`,result:-1,done:!0}),s}
function dn(a=16,t=1,s=99){const o=new Set;for(;o.size<a;)o.add(t+Math.floor(Math.random()*(s-t+1)));return[...o].sort((n,c)=>n-c)}
function Ki(a=16,t=null){const s=[],o=[3,5,5,7,9,9,9,12,14,14,17,20,21,21,23,27];for(let n=0;n<a;n++)s.push(o[n%o.length]);if(s.sort((n,c)=>n-c),t!=null){const n=s.filter(c=>c!==t);for(let c=0;c<3;c++)n.push(t);return n.sort((c,r)=>c-r)}return s}
function Hi(a=14){const t=dn(a,1,50),s=1+Math.floor(Math.random()*(a-2));return t.slice(s).concat(t.slice(0,s))}
const Gi=`
.bsw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.bsw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.bsw-title { font-weight: 600; font-size: 15px; }
.bsw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.bsw-bar {
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.bsw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.bsw-btn:hover { background: #3b6ae8; }
.bsw-btn.bsw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.bsw-btn.bsw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.bsw-btn.bsw-danger { background: #c13c3c; }
.bsw-btn.bsw-danger:hover { background: #a73232; }
.bsw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bsw-input, .bsw-select {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit;
}
.bsw-input { width: 90px; }
.bsw-input:focus, .bsw-select:focus { outline: none; border-color: #4a7cff; }
.bsw-label { font-size: 12px; color: #8a93a8; }
.bsw-canvas {
  flex: 1; overflow: auto; padding: 24px;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  display: flex; align-items: center; justify-content: center;
}
.bsw-boxes {
  display: flex; flex-direction: column; align-items: center;
  gap: 0; position: relative; max-width: 100%;
}
.bsw-indices {
  display: flex; gap: 6px;
}
.bsw-index-cell {
  min-width: 44px; text-align: center; font-size: 10px; color: #6a7389;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 0;
}
.bsw-row {
  display: flex; gap: 6px;
}
.bsw-box {
  min-width: 44px; padding: 10px 0; background: #1f2638;
  border: 1.5px solid #2a2f3e; border-radius: 6px; text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px; transition: all 260ms ease; position: relative;
}
.bsw-box.bsw-in-window { background: #1a2438; border-color: #3a4a72; }
.bsw-box.bsw-out-window { opacity: 0.28; }
.bsw-box.bsw-mid { background: #4a3b1a; border-color: #ffd24a; color: #ffe08a; font-weight: 600; }
.bsw-box.bsw-found { background: #1f3a2e; border-color: #4a9f6f; color: #8fe4b2; font-weight: 600;
  animation: bsw-pulse-green 700ms ease-in-out; }
.bsw-box.bsw-notfound { background: #3a1f1f; border-color: #c13c3c; color: #ff9f9f; }
@keyframes bsw-pulse-green {
  0%, 100% { box-shadow: 0 0 0 rgba(74, 159, 111, 0); }
  50%      { box-shadow: 0 0 16px rgba(74, 159, 111, 0.8); }
}
.bsw-pointers {
  display: flex; gap: 6px; margin-top: 6px; position: relative;
}
.bsw-ptr-cell {
  min-width: 44px; display: flex; flex-direction: column; align-items: center;
  font-size: 10px; color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-height: 38px;
}
.bsw-ptr-bar {
  width: 2px; height: 14px; border-radius: 1px; margin-top: 2px;
}
.bsw-ptr-bar.lo { background: #4a7cff; }
.bsw-ptr-bar.hi { background: #c13c3c; }
.bsw-ptr-bar.mid { background: #ffd24a; }
.bsw-ptr-label { margin-top: 2px; }
.bsw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.bsw-status { color: #d1d5db; flex: 1; min-width: 0; }
.bsw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.bsw-stats b { color: #e6e6e6; }
`,Vi=[{key:"classic",label:"Classic"},{key:"first",label:"First Occurrence"},{key:"last",label:"Last Occurrence"},{key:"rotated",label:"Rotated Sorted"}];
function Gt(a){return a==="classic"?dn(16,1,99):a==="first"||a==="last"?Ki(16,9):Hi(14)}
function Vt(a,t){return a==="first"||a==="last"?9:a==="rotated"?t[Math.floor(Math.random()*t.length)]:t[Math.floor(t.length/2)+1]}
function Xi(){const[a,t]=h.useState("classic"),[s,o]=h.useState(()=>Gt("classic")),[n,c]=h.useState(()=>Vt("classic",s)),[r,l]=h.useState(600),[i,d]=h.useState(!1),[f,p]=h.useState(0),u=h.useMemo(()=>a==="classic"?_i(s,n):a==="first"?Oi(s,n):a==="last"?Wi(s,n):Ui(s,n),[a,s,n]);h.useEffect(()=>{p(0),d(!1)},[a,s,n]);const m=u[f]||u[u.length-1],w=f>=u.length-1;h.useEffect(()=>{if(!i)return;if(w){d(!1);return}const y=setTimeout(()=>p(C=>Math.min(C+1,u.length-1)),Math.max(80,r));return()=>clearTimeout(y)},[i,f,r,w,u.length]);function b(y){const C=Gt(y),T=Vt(y,C);t(y),o(C),c(T)}function k(){const y=Gt(a);o(y),c(Vt(a,y))}function $(){const y=[n,n],C=s.concat(y).sort((T,v)=>T-v);o(C)}function g(){p(0),d(!1)}function z(){p(y=>Math.min(y+1,u.length-1))}const F=y=>y>=m.lo&&y<=m.hi,M=u[u.length-1]&&u[u.length-1].result;return e.jsxs("div",{className:"bsw-root",children:[e.jsx("style",{children:Gi}),e.jsx("div",{className:"bsw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"bsw-title",children:"Binary Search — classic, boundary, rotated"}),e.jsx("div",{className:"bsw-sub",children:"Watch lo/mid/hi pointers slide as the search window halves each step. Each comparison discards an entire half."})]})}),e.jsxs("div",{className:"bsw-bar",children:[e.jsx("span",{className:"bsw-label",children:"Mode:"}),e.jsx("select",{className:"bsw-select",value:a,onChange:y=>b(y.target.value),children:Vi.map(y=>e.jsx("option",{value:y.key,children:y.label},y.key))}),e.jsx("span",{className:"bsw-label",children:"target:"}),e.jsx("input",{className:"bsw-input",type:"number",value:n,onChange:y=>c(Number(y.target.value))}),e.jsx("button",{className:"bsw-btn",onClick:()=>d(y=>!y),disabled:w,children:i?"Pause":"Play"}),e.jsx("button",{className:"bsw-btn bsw-ghost",onClick:z,disabled:w||i,children:"Step"}),e.jsx("button",{className:"bsw-btn bsw-ghost",onClick:g,children:"Reset"}),e.jsx("button",{className:"bsw-btn bsw-danger",onClick:k,children:"New Array"}),(a==="first"||a==="last")&&e.jsx("button",{className:"bsw-btn bsw-ghost",onClick:$,children:"+ Duplicates"}),e.jsx("span",{className:"bsw-label",children:"tick (ms):"}),e.jsx("input",{className:"bsw-input",type:"number",min:80,max:2e3,value:r,onChange:y=>l(Number(y.target.value)||600)})]}),e.jsx("div",{className:"bsw-canvas",children:e.jsxs("div",{className:"bsw-boxes",children:[e.jsx("div",{className:"bsw-indices",children:m.arr.map((y,C)=>e.jsx("div",{className:"bsw-index-cell",children:C},C))}),e.jsx("div",{className:"bsw-row",children:m.arr.map((y,C)=>{let T="bsw-box";return F(C)?T+=" bsw-in-window":T+=" bsw-out-window",m.mid===C&&(T+=" bsw-mid"),m.done&&m.result===C&&m.result!==-1&&(T+=" bsw-found"),e.jsx("div",{className:T,children:y},C)})}),e.jsx("div",{className:"bsw-pointers",children:m.arr.map((y,C)=>{const T=m.lo===C,v=m.hi===C,I=m.mid===C;return e.jsx("div",{className:"bsw-ptr-cell",children:(T||v||I)&&e.jsxs(e.Fragment,{children:[I&&e.jsx("div",{className:"bsw-ptr-bar mid"}),T&&!I&&e.jsx("div",{className:"bsw-ptr-bar lo"}),v&&!I&&e.jsx("div",{className:"bsw-ptr-bar hi"}),e.jsx("div",{className:"bsw-ptr-label",style:{color:I?"#ffd24a":T?"#4a7cff":"#c13c3c"},children:[T&&"lo",I&&"mid",v&&"hi"].filter(Boolean).join("/")})]})},C)})})]})}),e.jsxs("div",{className:"bsw-footer",children:[e.jsxs("div",{className:"bsw-status",children:["Status: ",m.decision]}),e.jsxs("div",{className:"bsw-stats",children:["n=",e.jsx("b",{children:m.arr.length}),"   step=",e.jsx("b",{children:f+1}),"/",e.jsx("b",{children:u.length}),"   window=",e.jsxs("b",{children:["[",m.lo,",",m.hi,"]"]}),"  ",m.done&&"result=",m.done&&e.jsx("b",{children:m.result}),!m.done&&M!=null&&" final=",!m.done&&M!=null&&e.jsx("b",{children:M})]})]})]})}

export default Xi;
export { Xi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Xi, {}));
  return () => root.unmount();
}
