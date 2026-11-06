import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Is(a,t=0,s=999){const o=[];for(let n=0;n<a;n++)o.push(t+Math.floor(Math.random()*(s-t+1)));return o}
function Ti(a,t){return Math.floor(Math.abs(a)/Math.pow(10,t))%10}
function Pi(a){let t=0;for(const s of a)t=Math.max(t,Math.abs(s));return t===0?1:Math.floor(Math.log10(t))+1}
function qi(a){const t=a.slice(),s=[],o=Pi(t);for(let n=0;n<o;n++){s.push({kind:"radix-start",arr:t.slice(),digit:n,buckets:Kt()});const c=Kt();for(let l=0;l<t.length;l++){const i=Ti(t[l],n);c[i].push(t[l]),s.push({kind:"radix-bucket",arr:t.slice(),buckets:As(c),digit:n,moving:{from:l,bucket:i,value:t[l]}})}let r=0;for(let l=0;l<10;l++)for(let i=0;i<c[l].length;i++)t[r]=c[l][i],s.push({kind:"radix-concat",arr:t.slice(),buckets:As(c),digit:n,writing:{to:r,bucket:l,posInBucket:i,value:c[l][i]}}),r++;s.push({kind:"radix-pass-end",arr:t.slice(),digit:n,buckets:Kt()})}return s.push({kind:"done",arr:t.slice()}),s}
function Kt(){return[[],[],[],[],[],[],[],[],[],[]]}
function As(a){return a.map(t=>t.slice())}
function Li(a){const t=a.slice(),s=[];let o=0;for(const l of t)l>o&&(o=l);const n=new Array(o+1).fill(0);for(let l=0;l<t.length;l++)n[t[l]]++,s.push({kind:"count-tally",arr:t.slice(),counts:n.slice(),reading:l,value:t[l]});let c=0;const r=n.slice();for(let l=0;l<=o;l++)for(;r[l]>0;)t[c]=l,s.push({kind:"count-write",arr:t.slice(),counts:r.slice(),writing:c,value:l}),r[l]--,c++;return s.push({kind:"done",arr:t.slice()}),s}
const Di=`
.rxw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.rxw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.rxw-title { font-weight: 600; font-size: 15px; }
.rxw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.rxw-bar {
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.rxw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.rxw-btn:hover { background: #3b6ae8; }
.rxw-btn.rxw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.rxw-btn.rxw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.rxw-btn.rxw-danger { background: #c13c3c; }
.rxw-btn.rxw-danger:hover { background: #a73232; }
.rxw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rxw-input, .rxw-select {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit;
}
.rxw-input { width: 70px; }
.rxw-input:focus, .rxw-select:focus { outline: none; border-color: #4a7cff; }
.rxw-label { font-size: 12px; color: #8a93a8; }
.rxw-canvas {
  flex: 1; overflow: auto; padding: 18px;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
}
.rxw-row {
  display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 14px;
  justify-content: center;
}
.rxw-cell {
  min-width: 38px; padding: 6px 8px; background: #1f2638;
  border: 1px solid #2a2f3e; border-radius: 5px; text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; transition: all 180ms ease;
}
.rxw-cell.rxw-src { background: #2a3550; border-color: #4a5f8f; }
.rxw-cell.rxw-reading { background: #4a3b1a; border-color: #ffd24a; }
.rxw-cell.rxw-writing { background: #1f3a2e; border-color: #4a9f6f; }
.rxw-cell.rxw-digit {
  color: #ffd24a; font-weight: 700;
}
.rxw-buckets {
  display: grid; grid-template-columns: repeat(10, minmax(60px, 1fr));
  gap: 6px; margin-bottom: 14px;
}
.rxw-bucket {
  display: flex; flex-direction: column; align-items: stretch;
  background: #141925; border: 1px solid #2a2f3e; border-radius: 6px;
  min-height: 60px; padding: 4px;
}
.rxw-bucket-head {
  text-align: center; color: #8a93a8; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 2px;
}
.rxw-bucket-items {
  display: flex; flex-direction: column; gap: 2px;
}
.rxw-bucket-item {
  background: #2a3550; color: #e6e6e6; text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; padding: 3px 4px; border-radius: 3px;
  border: 1px solid #4a5f8f;
}
.rxw-bucket-item.rxw-bucket-new { animation: rxw-pop 260ms ease; }
@keyframes rxw-pop {
  from { transform: scale(0.5); opacity: 0.2; }
  to   { transform: scale(1); opacity: 1; }
}
.rxw-section-title {
  color: #8a93a8; font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.6px; margin: 10px 0 6px;
}
.rxw-counts {
  display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px;
}
.rxw-count-cell {
  min-width: 48px; padding: 4px 6px; background: #141925;
  border: 1px solid #2a2f3e; border-radius: 4px; text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
}
.rxw-count-cell .rxw-cv-k { color: #8a93a8; }
.rxw-count-cell .rxw-cv-v { color: #e6e6e6; font-weight: 600; }
.rxw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.rxw-status { color: #d1d5db; flex: 1; min-width: 0; }
.rxw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.rxw-stats b { color: #e6e6e6; }
`;
function Ht(a){return["ones","tens","hundreds","thousands"][a]||`10^${a}`}
function Bi(){const[a,t]=h.useState("radix"),[s,o]=h.useState(()=>Is(12,0,999)),[n,c]=h.useState(350),[r,l]=h.useState(!1),[i,d]=h.useState(0),f=h.useMemo(()=>a==="radix"?qi(s):Li(s),[s,a]);h.useEffect(()=>{d(0),l(!1)},[s,a]);const p=f[i]||f[f.length-1],u=i>=f.length-1;h.useEffect(()=>{if(!r)return;if(u){l(!1);return}const g=setTimeout(()=>d(z=>Math.min(z+1,f.length-1)),Math.max(40,n));return()=>clearTimeout(g)},[r,i,n,u,f.length]);function m(){o(Is(12,0,999))}function w(){d(0),l(!1)}function b(){d(g=>Math.min(g+1,f.length-1))}let k="",$="";return a==="radix"?(p.kind==="radix-start"?k=`Pass over the ${Ht(p.digit)} digit begins. Buckets are empty.`:p.kind==="radix-bucket"?k=`Place ${p.moving.value} (digit ${p.moving.bucket}) into bucket ${p.moving.bucket}.`:p.kind==="radix-concat"?k=`Write bucket ${p.writing.bucket}'s next value (${p.writing.value}) into position ${p.writing.to} of the array.`:p.kind==="radix-pass-end"?k=`Finished the ${Ht(p.digit)} pass. Array is now stably sorted by this digit.`:p.kind==="done"&&(k="Sorted. Each LSD pass preserved earlier digits' order (stability)."),$=`passes=${Math.max(1,Math.floor(Math.log10(Math.max(...p.arr,1)))+1)}`):(p.kind==="count-tally"?k=`Tally: counts[${p.value}]++ (reading index ${p.reading}).`:p.kind==="count-write"?k=`Write ${p.value} at array index ${p.writing}. Output is stable by original arrival order.`:p.kind==="done"&&(k="Counting sort done. O(n + k), non-comparison, stable."),$=`k=${p.counts?p.counts.length:Math.max(...p.arr,1)+1}`),e.jsxs("div",{className:"rxw-root",children:[e.jsx("style",{children:Di}),e.jsx("div",{className:"rxw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"rxw-title",children:"Radix / Counting Sort"}),e.jsx("div",{className:"rxw-sub",children:"LSD radix sort distributes into 10 buckets per digit. Counting sort tallies values, then writes them back in order — both run in O(n + k)."})]})}),e.jsxs("div",{className:"rxw-bar",children:[e.jsx("button",{className:"rxw-btn",onClick:()=>l(g=>!g),disabled:u,children:r?"Pause":"Play"}),e.jsx("button",{className:"rxw-btn rxw-ghost",onClick:b,disabled:u||r,children:"Step"}),e.jsx("button",{className:"rxw-btn rxw-ghost",onClick:w,children:"Reset"}),e.jsx("button",{className:"rxw-btn rxw-danger",onClick:m,children:"Shuffle"}),e.jsx("span",{style:{width:8}}),e.jsx("span",{className:"rxw-label",children:"Mode:"}),e.jsxs("select",{className:"rxw-select",value:a,onChange:g=>t(g.target.value),children:[e.jsx("option",{value:"radix",children:"LSD Radix (base 10)"}),e.jsx("option",{value:"counting",children:"Counting Sort"})]}),e.jsx("span",{className:"rxw-label",children:"tick (ms):"}),e.jsx("input",{className:"rxw-input",type:"number",min:40,max:2e3,value:n,onChange:g=>c(Number(g.target.value)||350)})]}),e.jsxs("div",{className:"rxw-canvas",children:[e.jsx("div",{className:"rxw-section-title",children:"Array"}),e.jsx("div",{className:"rxw-row",children:p.arr.map((g,z)=>{let F="rxw-cell";if(a==="radix"?(p.kind==="radix-bucket"&&p.moving&&p.moving.from===z&&(F+=" rxw-reading"),p.kind==="radix-concat"&&p.writing&&p.writing.to===z&&(F+=" rxw-writing")):(p.kind==="count-tally"&&p.reading===z&&(F+=" rxw-reading"),p.kind==="count-write"&&p.writing===z&&(F+=" rxw-writing")),a==="radix"&&p.digit!=null&&p.kind!=="done"){const M=String(g).padStart(3,"0"),y=2-p.digit;return e.jsx("div",{className:F,children:M.split("").map((C,T)=>e.jsx("span",{style:{color:T===y?"#ffd24a":"#e6e6e6",fontWeight:T===y?700:400},children:C},T))},z)}return e.jsx("div",{className:F,children:g},z)})}),a==="radix"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"rxw-section-title",children:["Buckets (digit = ",p.digit!=null?Ht(p.digit):"—",")"]}),e.jsx("div",{className:"rxw-buckets",children:(p.buckets||[[],[],[],[],[],[],[],[],[],[]]).map((g,z)=>e.jsxs("div",{className:"rxw-bucket",children:[e.jsx("div",{className:"rxw-bucket-head",children:z}),e.jsx("div",{className:"rxw-bucket-items",children:g.map((F,M)=>{const y=p.kind==="radix-bucket"&&p.moving&&p.moving.bucket===z&&M===g.length-1;return e.jsx("div",{className:"rxw-bucket-item"+(y?" rxw-bucket-new":""),children:F},M)})})]},z))})]}),a==="counting"&&p.counts&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rxw-section-title",children:"Counts (key → remaining to write)"}),e.jsx("div",{className:"rxw-counts",children:p.counts.map((g,z)=>e.jsxs("div",{className:"rxw-count-cell",children:[e.jsx("div",{className:"rxw-cv-k",children:z}),e.jsx("div",{className:"rxw-cv-v",children:g})]},z))})]})]}),e.jsxs("div",{className:"rxw-footer",children:[e.jsxs("div",{className:"rxw-status",children:["Status: ",k||"Ready."]}),e.jsxs("div",{className:"rxw-stats",children:["n=",e.jsx("b",{children:p.arr.length}),"   step=",e.jsx("b",{children:i}),"/",e.jsx("b",{children:f.length-1}),"  ",$]})]})]})}

export default Bi;
export { Bi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Bi, {}));
  return () => root.unmount();
}
