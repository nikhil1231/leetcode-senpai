import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let So=class{constructor(){this.arr=[]}size(){return this.arr.length}clear(){this.arr=[]}peek(){return this.arr.length?this.arr[0]:void 0}insert(t){this.arr.push(t);let s=this.arr.length-1;const o=[];for(;s>0;){const n=s-1>>1;if(this.arr[s]<this.arr[n])[this.arr[s],this.arr[n]]=[this.arr[n],this.arr[s]],o.push([s,n]),s=n;else break}return{swaps:o,finalIndex:s}}extractMin(){if(this.arr.length===0)return{value:void 0,swaps:[]};const t=this.arr[0],s=this.arr.pop(),o=[];if(this.arr.length>0){this.arr[0]=s;let n=0;const c=this.arr.length;for(;;){const r=2*n+1,l=2*n+2;let i=n;if(r<c&&this.arr[r]<this.arr[i]&&(i=r),l<c&&this.arr[l]<this.arr[i]&&(i=l),i!==n)[this.arr[n],this.arr[i]]=[this.arr[i],this.arr[n]],o.push([n,i]),n=i;else break}}return{value:t,swaps:o}}heapify(t){this.arr=t.slice();const s=this.arr.length,o=[];for(let n=(s>>1)-1;n>=0;n--){const c=this._siftDown(n);o.push({root:n,swaps:c})}return{passes:o}}_siftDown(t){const s=[],o=this.arr.length;for(;;){const n=2*t+1,c=2*t+2;let r=t;if(n<o&&this.arr[n]<this.arr[r]&&(r=n),c<o&&this.arr[c]<this.arr[r]&&(r=c),r!==t)[this.arr[t],this.arr[r]]=[this.arr[r],this.arr[t]],s.push([t,r]),t=r;else break}return s}snapshot(){return{arr:this.arr.slice()}}};
const $o=`
.hpw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.hpw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.hpw-title { font-weight: 600; font-size: 15px; }
.hpw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.hpw-head-right { display: flex; gap: 8px; align-items: center; }
.hpw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.hpw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 110px; }
.hpw-input:focus { outline: none; border-color: #4a7cff; }
.hpw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.hpw-btn:hover { background: #3b6ae8; }
.hpw-btn.hpw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.hpw-btn.hpw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.hpw-btn.hpw-danger { background: #c13c3c; }
.hpw-btn.hpw-danger:hover { background: #a73232; }
.hpw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.hpw-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.hpw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.hpw-status { color: #d1d5db; flex: 1; min-width: 0; }
.hpw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.hpw-stats b { color: #e6e6e6; }

.hpw-node text { fill: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none; }
.hpw-node text.hpw-idx { font-size: 10px; fill: #6a7389; }
.hpw-node circle { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease; }
.hpw-node.hpw-compare circle {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.hpw-node.hpw-swap circle {
  fill: #2a3550; stroke: #4a7cff; stroke-width: 2.5;
  animation: hpw-pulse-blue 500ms ease-out 1;
}
.hpw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; }
@keyframes hpw-pulse-blue {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 124, 255, 0.9)); }
}

.hpw-array-wrap {
  display: flex; gap: 6px; padding: 14px 16px; background: #141925;
  border-top: 1px solid #2a2f3e; overflow-x: auto; align-items: flex-end;
}
.hpw-cell {
  display: flex; flex-direction: column; align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.hpw-cell-box {
  width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  background: #0f1419; border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; transition: all 200ms ease;
}
.hpw-cell.hpw-cell-compare .hpw-cell-box {
  border-color: #ffd24a; color: #ffd24a;
  box-shadow: 0 0 8px rgba(255, 210, 74, 0.35);
}
.hpw-cell.hpw-cell-swap .hpw-cell-box {
  border-color: #4a7cff; background: #2a3550;
  animation: hpw-cell-flash 500ms ease-out 1;
}
@keyframes hpw-cell-flash {
  0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); }
}
.hpw-cell-idx { font-size: 10px; color: #6a7389; margin-top: 4px; }
.hpw-empty { color: #8a93a8; text-align: center; padding: 40px; font-style: italic; }
`,Ee=20,rn=70,Lt=20;
function Mo(a){const t=a.length,s={};if(t===0)return{pos:s,width:0,depth:0};let o=0,n=0;function c(r,l){if(r>=t)return null;l>n&&(n=l);const i=2*r+1,d=2*r+2,f=c(i,l+1),p=o;o+=Ee*2+Lt;const u=c(d,l+1);let m=p+Ee;return f&&u?m=(f.x+u.x)/2:f?m=f.x+Ee*2+Lt:u&&(m=u.x-Ee*2-Lt),s[r]={x:m,y:l*rn+Ee},s[r]}return c(0,0),{pos:s,width:o,depth:n}}
const Dt=[5,2,8,1,9,3,7,4,6],zo=[12,0,15,6,20];
function Co(){const a=h.useRef(new So),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("Binary min-heap. Insert to sift up; Extract-Min to sift down."),[c,r]=h.useState({compare:new Set,swap:new Set}),l=h.useRef(null),[i,d]=h.useState("");function f(v,I=650){l.current&&clearTimeout(l.current),r(v),l.current=setTimeout(()=>r({compare:new Set,swap:new Set}),I)}h.useEffect(()=>()=>l.current&&clearTimeout(l.current),[]);function p(){s(a.current.snapshot())}h.useEffect(()=>{a.current.heapify(Dt),p(),n(`Heapified [${Dt.join(", ")}] bottom-up (Floyd, O(n)).`)},[]);function u(v){if(!Number.isFinite(v)){n("Insert needs a number.");return}const I=a.current.insert(v);p();const j=new Set,x=new Set;for(const[N,E]of I.swaps)x.add(N),x.add(E),j.add(N),j.add(E);j.add(I.finalIndex),f({compare:j,swap:x}),n(`Insert ${v}: pushed to index ${a.current.size()-1}, sifted up with ${I.swaps.length} swap(s) to index ${I.finalIndex}.`)}function m(){if(a.current.size()===0){n("Heap is empty.");return}const v=a.current.extractMin();p();const I=new Set,j=new Set;for(const[x,N]of v.swaps)j.add(x),j.add(N),I.add(x),I.add(N);f({compare:I,swap:j}),n(`Extract-min → ${v.value}. Moved last to root, sifted down with ${v.swaps.length} swap(s).`)}function w(){const v=Dt.slice().reverse();a.current.heapify(v),p(),n(`Heapify [${v.join(", ")}] bottom-up (Floyd, O(n)). Result is a valid min-heap.`),f({compare:new Set,swap:new Set})}function b(){a.current.clear(),p(),n("Cleared."),f({compare:new Set,swap:new Set})}const k=()=>{const v=Number(i);return Number.isFinite(v)?v:NaN},{pos:$,width:g,depth:z}=h.useMemo(()=>Mo(t.arr),[t]),F=24,M=24,y=Math.max(g+F*2,500),C=Math.max((z+1)*rn+M*2,180),T=t.arr.length===0;return e.jsxs("div",{className:"hpw-root",children:[e.jsx("style",{children:$o}),e.jsxs("div",{className:"hpw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"hpw-title",children:"Binary Min-Heap"}),e.jsx("div",{className:"hpw-sub",children:"CLRS ch.6 — array-backed; parent/child via index math; sift-up/sift-down in O(log n)."})]}),e.jsx("div",{className:"hpw-head-right",children:e.jsx("button",{className:"hpw-btn hpw-danger",onClick:b,children:"Reset"})})]}),e.jsxs("div",{className:"hpw-bar",children:[e.jsx("input",{className:"hpw-input",placeholder:"value",type:"number",value:i,onChange:v=>d(v.target.value),onKeyDown:v=>{v.key==="Enter"&&(u(k()),d(""))}}),e.jsx("button",{className:"hpw-btn",onClick:()=>{u(k()),d("")},children:"Insert"}),e.jsx("button",{className:"hpw-btn hpw-ghost",onClick:m,children:"Extract-Min"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"hpw-quick",children:"Quick-insert:"}),zo.map(v=>e.jsx("button",{className:"hpw-btn hpw-ghost",onClick:()=>u(v),children:v},v)),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"hpw-btn hpw-ghost",onClick:w,children:"Heapify demo"})]}),e.jsx("div",{className:"hpw-canvas-wrap",children:T?e.jsx("div",{className:"hpw-empty",children:"Heap is empty. Insert a value or run Heapify demo."}):e.jsxs("svg",{width:y,height:C,viewBox:`0 0 ${y} ${C}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:t.arr.map((v,I)=>{const j=2*I+1,x=2*I+2,N=[];for(const E of[j,x])if(E<t.arr.length&&$[I]&&$[E]){const A=$[I].x+F,R=$[I].y+M,S=$[E].x+F,P=$[E].y+M,L=(R+P)/2;N.push(e.jsx("path",{className:"hpw-edge",d:`M ${A} ${R} C ${A} ${L}, ${S} ${L}, ${S} ${P}`},I+"-"+E))}return N})}),e.jsx("g",{children:t.arr.map((v,I)=>{const j=$[I];if(!j)return null;const x=["hpw-node"];return c.compare.has(I)&&x.push("hpw-compare"),c.swap.has(I)&&x.push("hpw-swap"),e.jsxs("g",{className:x.join(" "),children:[e.jsx("circle",{cx:j.x+F,cy:j.y+M,r:Ee}),e.jsx("text",{x:j.x+F,y:j.y+M,children:v}),e.jsxs("text",{className:"hpw-idx",x:j.x+F,y:j.y+M+Ee+10,children:["i=",I]})]},I)})})]})}),e.jsx("div",{className:"hpw-array-wrap",children:t.arr.length===0?e.jsx("div",{style:{color:"#6a7389",fontStyle:"italic"},children:"array: []"}):t.arr.map((v,I)=>{const j=["hpw-cell"];return c.compare.has(I)&&j.push("hpw-cell-compare"),c.swap.has(I)&&j.push("hpw-cell-swap"),e.jsxs("div",{className:j.join(" "),children:[e.jsx("div",{className:"hpw-cell-box",children:v}),e.jsx("div",{className:"hpw-cell-idx",children:I})]},I)})}),e.jsxs("div",{className:"hpw-footer",children:[e.jsxs("div",{className:"hpw-status",children:["Status: ",o]}),e.jsxs("div",{className:"hpw-stats",children:["size=",e.jsx("b",{children:t.arr.length}),"   peek=",e.jsx("b",{children:t.arr.length?t.arr[0]:"∅"}),"  height=",e.jsx("b",{children:z})]})]})]})}

export default Co;
export { Co as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Co, {}));
  return () => root.unmount();
}
