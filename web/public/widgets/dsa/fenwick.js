import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class ye{constructor(t){this.n=t,this.tree=new Array(t+1).fill(0),this.a=new Array(t+1).fill(0)}static lowBit(t){return t&-t}update(t,s){const o=[];for(this.a[t]+=s;t<=this.n;)this.tree[t]+=s,o.push(t),t+=ye.lowBit(t);return{path:o}}query(t){const s=[];let o=0;for(;t>0;)o+=this.tree[t],s.push(t),t-=ye.lowBit(t);return{sum:o,path:s}}rangeSum(t,s){const o=this.query(s),n=t>1?this.query(t-1):{sum:0,path:[]};return{sum:o.sum-n.sum,rightPath:o.path,leftPath:n.path}}build(t){this.n=t.length,this.tree=new Array(this.n+1).fill(0),this.a=new Array(this.n+1).fill(0);for(let s=1;s<=this.n;s++)this.update(s,t[s-1])}snapshot(){return{n:this.n,tree:this.tree.slice(),a:this.a.slice()}}}
const Ao=`
.fwk-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.fwk-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.fwk-title { font-weight: 600; font-size: 15px; }
.fwk-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.fwk-head-right { display: flex; gap: 8px; align-items: center; }
.fwk-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.fwk-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 70px; }
.fwk-input:focus { outline: none; border-color: #4a7cff; }
.fwk-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.fwk-btn:hover { background: #3b6ae8; }
.fwk-btn.fwk-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.fwk-btn.fwk-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.fwk-btn.fwk-danger { background: #c13c3c; }
.fwk-btn.fwk-danger:hover { background: #a73232; }
.fwk-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.fwk-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.fwk-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.fwk-status { color: #d1d5db; flex: 1; min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.fwk-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.fwk-stats b { color: #e6e6e6; }

.fwk-row { display: flex; gap: 6px; padding: 6px 0; flex-wrap: nowrap; }
.fwk-row-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #8a93a8; margin-bottom: 4px; }
.fwk-cell {
  width: 56px; height: 60px; background: #0f1419;
  border: 1.5px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: all 250ms ease; position: relative;
}
.fwk-cell .fwk-val { font-size: 14px; }
.fwk-cell .fwk-idx { font-size: 10px; color: #6a7389; margin-top: 2px; }
.fwk-cell .fwk-lb { font-size: 9px; color: #ffd24a; margin-top: 1px; }

/* bit-range tints: 1=light, 2=darker, 4, 8 */
.fwk-cell.fwk-lb1 { background: #171e2d; }
.fwk-cell.fwk-lb2 { background: #1a2440; }
.fwk-cell.fwk-lb4 { background: #1e2c55; }
.fwk-cell.fwk-lb8 { background: #223466; }

.fwk-cell.fwk-upd {
  border-color: #4a7cff;
  animation: fwk-flash-blue 550ms ease-out 1;
  box-shadow: 0 0 12px rgba(74, 124, 255, 0.55);
}
.fwk-cell.fwk-q {
  border-color: #ffd24a;
  box-shadow: 0 0 10px rgba(255, 210, 74, 0.45);
}
.fwk-cell.fwk-a-upd {
  border-color: #4a9f6f;
  animation: fwk-flash-green 550ms ease-out 1;
}
@keyframes fwk-flash-blue { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes fwk-flash-green { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }

.fwk-arrow {
  height: 28px; display: flex; align-items: center; margin: 4px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: #ffd24a;
}
`,Ae=[3,2,-1,6,5,4,-3,3];
function To(){const a=h.useRef(new ye(Ae.length)),[t,s]=h.useState(()=>(a.current.build(Ae),a.current.snapshot())),[o,n]=h.useState(`Built Fenwick over [${Ae.join(", ")}]. Each tree[i] stores sum of (i − lowBit(i), i].`),[c,r]=h.useState({upd:new Set,q:new Set,aUpd:null}),l=h.useRef(null),[i,d]=h.useState("4"),[f,p]=h.useState("5"),[u,m]=h.useState("6");function w(F,M=1e3){l.current&&clearTimeout(l.current),r(F),l.current=setTimeout(()=>r({upd:new Set,q:new Set,aUpd:null}),M)}h.useEffect(()=>()=>l.current&&clearTimeout(l.current),[]);function b(){s(a.current.snapshot())}function k(){const F=Number(i),M=Number(f);if(!Number.isFinite(F)||!Number.isFinite(M)||F<1||F>a.current.n){n(`Invalid update index ${i}.`);return}const y=a.current.update(F,M);b(),w({upd:new Set(y.path),q:new Set,aUpd:F});const C=y.path.map(T=>`${T} (lowBit=${ye.lowBit(T)})`).join(" → ");n(`update(${F}, ${M}): walk i += (i & -i): ${C}.`)}function $(){const F=Number(u);if(!Number.isFinite(F)||F<0||F>a.current.n){n(`Invalid query index ${u}.`);return}const M=a.current.query(F);w({upd:new Set,q:new Set(M.path),aUpd:null});const y=M.path.map(C=>`${C} (lowBit=${ye.lowBit(C)})`).join(" → ");n(`query(${F}) = ${M.sum}: walk i −= (i & -i): ${y||"(empty)"}.`)}function g(){a.current=new ye(Ae.length),a.current.build(Ae),b(),w({upd:new Set,q:new Set,aUpd:null}),n(`Rebuilt over [${Ae.join(", ")}].`)}const z=F=>F>=8?"fwk-lb8":F>=4?"fwk-lb4":F>=2?"fwk-lb2":"fwk-lb1";return e.jsxs("div",{className:"fwk-root",children:[e.jsx("style",{children:Ao}),e.jsxs("div",{className:"fwk-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"fwk-title",children:"Fenwick Tree (BIT)"}),e.jsx("div",{className:"fwk-sub",children:"Fenwick 1994 — O(log n) prefix sums via low-bit arithmetic (i & -i)."})]}),e.jsx("div",{className:"fwk-head-right",children:e.jsx("button",{className:"fwk-btn fwk-danger",onClick:g,children:"Reset"})})]}),e.jsxs("div",{className:"fwk-bar",children:[e.jsx("span",{className:"fwk-quick",children:"update(i, Δ):"}),e.jsx("input",{className:"fwk-input",placeholder:"i",type:"number",value:i,onChange:F=>d(F.target.value)}),e.jsx("input",{className:"fwk-input",placeholder:"Δ",type:"number",value:f,onChange:F=>p(F.target.value)}),e.jsx("button",{className:"fwk-btn",onClick:k,children:"Update"}),e.jsx("span",{style:{width:16}}),e.jsx("span",{className:"fwk-quick",children:"query(i):"}),e.jsx("input",{className:"fwk-input",placeholder:"i",type:"number",value:u,onChange:F=>m(F.target.value)}),e.jsx("button",{className:"fwk-btn fwk-ghost",onClick:$,children:"Query"})]}),e.jsxs("div",{className:"fwk-canvas-wrap",children:[e.jsxs("div",{className:"fwk-row-label",children:["Logical array a[1..",t.n,"] (source of truth):"]}),e.jsx("div",{className:"fwk-row",children:Array.from({length:t.n}).map((F,M)=>{const y=M+1,C=["fwk-cell"];return c.aUpd===y&&C.push("fwk-a-upd"),e.jsxs("div",{className:C.join(" "),style:{background:"#0f1419",borderColor:"#4a9f6f"},children:[e.jsx("div",{className:"fwk-val",children:t.a[y]}),e.jsxs("div",{className:"fwk-idx",children:["i=",y]})]},y)})}),e.jsx("div",{className:"fwk-arrow",children:"tree[i] covers (i − lowBit(i), i] — color tint by lowBit value"}),e.jsxs("div",{className:"fwk-row-label",children:["BIT array tree[1..",t.n,"]:"]}),e.jsx("div",{className:"fwk-row",children:Array.from({length:t.n}).map((F,M)=>{const y=M+1,C=ye.lowBit(y),T=["fwk-cell",z(C)];return c.upd.has(y)&&T.push("fwk-upd"),c.q.has(y)&&T.push("fwk-q"),e.jsxs("div",{className:T.join(" "),children:[e.jsx("div",{className:"fwk-val",children:t.tree[y]}),e.jsxs("div",{className:"fwk-idx",children:["i=",y]}),e.jsxs("div",{className:"fwk-lb",children:["lb=",C," · (",y-C,",",y,"]"]})]},y)})})]}),e.jsxs("div",{className:"fwk-footer",children:[e.jsxs("div",{className:"fwk-status",children:["Status: ",o]}),e.jsxs("div",{className:"fwk-stats",children:["n=",e.jsx("b",{children:t.n}),"   total=",e.jsx("b",{children:t.a.reduce((F,M)=>F+M,0)})]})]})]})}

export default To;
export { To as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(To, {}));
  return () => root.unmount();
}
