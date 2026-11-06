import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class gs{constructor(t){this.n=t.length,this.arr=t.slice(),this.t=new Array(4*Math.max(this.n,1)).fill(0),this.range=new Array(4*Math.max(this.n,1)).fill(null),this.n>0&&this._build(1,0,this.n-1)}_build(t,s,o){if(this.range[t]=[s,o],s===o){this.t[t]=this.arr[s];return}const n=s+o>>1;this._build(2*t,s,n),this._build(2*t+1,n+1,o),this.t[t]=this.t[2*t]+this.t[2*t+1]}query(t,s){const o=[],n=(r,l,i)=>{if(s<l||i<t)return 0;if(o.push(r),t<=l&&i<=s)return this.t[r];const d=l+i>>1;return n(2*r,l,d)+n(2*r+1,d+1,i)};return{sum:this.n===0?0:n(1,0,this.n-1),visited:o}}update(t,s){const o=[],n=(c,r,l)=>{if(o.push(c),r===l){this.t[c]=s,this.arr[t]=s;return}const i=r+l>>1;t<=i?n(2*c,r,i):n(2*c+1,i+1,l),this.t[c]=this.t[2*c]+this.t[2*c+1]};return this.n>0&&n(1,0,this.n-1),{path:o}}snapshot(){const t=[];if(this.n===0)return{nodes:t,arr:this.arr.slice()};for(let s=1;s<this.t.length;s++){if(this.range[s]===null)continue;const[o,n]=this.range[s];t.push({k:s,lo:o,hi:n,sum:this.t[s],parent:s===1?null:s>>1})}return{nodes:t,arr:this.arr.slice()}}}
const Ro=`
.stw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.stw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.stw-title { font-weight: 600; font-size: 15px; }
.stw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.stw-head-right { display: flex; gap: 8px; align-items: center; }
.stw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.stw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 70px; }
.stw-input:focus { outline: none; border-color: #4a7cff; }
.stw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.stw-btn:hover { background: #3b6ae8; }
.stw-btn.stw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.stw-btn.stw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.stw-btn.stw-danger { background: #c13c3c; }
.stw-btn.stw-danger:hover { background: #a73232; }
.stw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.stw-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.stw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.stw-status { color: #d1d5db; flex: 1; min-width: 0; }
.stw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.stw-stats b { color: #e6e6e6; }

.stw-node rect {
  fill: #2a3550; stroke: #4a5f8f; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease;
}
.stw-node text {
  fill: #e6e6e6; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.stw-node text.stw-range { font-size: 10px; fill: #8a93a8; }
.stw-node.stw-leaf rect { fill: #1f3a2e; stroke: #4a9f6f; }
.stw-node.stw-visited rect {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.stw-node.stw-update rect {
  stroke: #4a7cff; stroke-width: 2.5;
  animation: stw-pulse-blue 600ms ease-out 1;
}
@keyframes stw-pulse-blue {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 124, 255, 0.9)); }
}
.stw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; transition: stroke 300ms ease; }
.stw-edge.stw-edge-on-path { stroke: #ffd24a; stroke-width: 2.5; }
.stw-array { display: flex; gap: 6px; padding: 10px 16px;
  background: #141925; border-top: 1px solid #2a2f3e; overflow-x: auto; }
.stw-cell {
  width: 44px; height: 44px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  display: flex; align-items: center; justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; transition: all 200ms ease; flex-direction: column;
}
.stw-cell.stw-cell-q { border-color: #ffd24a; color: #ffd24a; }
.stw-cell.stw-cell-u { border-color: #4a7cff; color: #4a7cff;
  animation: stw-cell-flash 500ms ease-out 1; }
@keyframes stw-cell-flash { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
.stw-cell small { font-size: 10px; color: #6a7389; }
`,ut=[1,3,5,7,9,11,13,15],Ze=82,Be=40,es=70,Eo=12;
function Fo(a){const t={};if(!a.nodes.length)return{positions:t,width:0,depth:0};const s=new Map;for(const r of a.nodes)s.set(r.k,r);let o=0,n=0;function c(r,l){const i=s.get(r);if(!i)return null;if(l>n&&(n=l),i.lo===i.hi){const u=o+Ze/2;return o+=Ze+Eo,t[r]={x:u,y:l*es+Be/2},t[r]}const d=c(2*r,l+1),f=c(2*r+1,l+1);let p;return d&&f?p=(d.x+f.x)/2:d?p=d.x:f?p=f.x:p=o+Ze/2,t[r]={x:p,y:l*es+Be/2},t[r]}return c(1,0),{positions:t,width:o,depth:n}}
function Io(){const a=h.useRef(new gs(ut)),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState(`Built segment tree over [${ut.join(", ")}] — root = sum(all).`),[c,r]=h.useState({visited:new Set,update:new Set,arrQ:new Set,arrU:null}),l=h.useRef(null),[i,d]=h.useState("2"),[f,p]=h.useState("5"),[u,m]=h.useState("3"),[w,b]=h.useState("10");function k(x,N=900){l.current&&clearTimeout(l.current),r(x),l.current=setTimeout(()=>r({visited:new Set,update:new Set,arrQ:new Set,arrU:null}),N)}h.useEffect(()=>()=>l.current&&clearTimeout(l.current),[]);function $(){s(a.current.snapshot())}function g(){const x=Number(i),N=Number(f);if(!Number.isFinite(x)||!Number.isFinite(N)||x<0||N>=a.current.n||x>N){n(`Invalid query range [${i}, ${f}].`);return}const E=a.current.query(x,N),A=new Set(E.visited),R=new Set;for(let S=x;S<=N;S++)R.add(S);k({visited:A,update:new Set,arrQ:R,arrU:null}),n(`Query sum(a[${x}..${N}]) = ${E.sum}, visited ${E.visited.length} tree node(s): {${E.visited.join(", ")}}.`)}function z(){const x=Number(u),N=Number(w);if(!Number.isFinite(x)||!Number.isFinite(N)||x<0||x>=a.current.n){n(`Invalid update index ${u}.`);return}const E=a.current.update(x,N);$();const A=new Set(E.path);k({visited:new Set,update:A,arrQ:new Set,arrU:x}),n(`Update a[${x}] = ${N}, refreshed ${E.path.length} node(s) on the path: {${E.path.join(", ")}}.`)}function F(){a.current=new gs(ut),$(),k({visited:new Set,update:new Set,arrQ:new Set,arrU:null}),n(`Rebuilt over [${ut.join(", ")}].`)}const{positions:M,width:y,depth:C}=h.useMemo(()=>Fo(t),[t]),T=24,v=24,I=Math.max(y+T*2,520),j=Math.max((C+1)*es+v*2,180);return e.jsxs("div",{className:"stw-root",children:[e.jsx("style",{children:Ro}),e.jsxs("div",{className:"stw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"stw-title",children:"Segment Tree (range-sum)"}),e.jsx("div",{className:"stw-sub",children:"CP-Algorithms — O(log n) query/update; each internal node stores the sum of its range."})]}),e.jsx("div",{className:"stw-head-right",children:e.jsx("button",{className:"stw-btn stw-danger",onClick:F,children:"Reset"})})]}),e.jsxs("div",{className:"stw-bar",children:[e.jsx("span",{className:"stw-quick",children:"Query:"}),e.jsx("input",{className:"stw-input",placeholder:"l",type:"number",value:i,onChange:x=>d(x.target.value)}),e.jsx("input",{className:"stw-input",placeholder:"r",type:"number",value:f,onChange:x=>p(x.target.value)}),e.jsx("button",{className:"stw-btn",onClick:g,children:"Query"}),e.jsx("span",{style:{width:16}}),e.jsx("span",{className:"stw-quick",children:"Update:"}),e.jsx("input",{className:"stw-input",placeholder:"i",type:"number",value:u,onChange:x=>m(x.target.value)}),e.jsx("input",{className:"stw-input",placeholder:"value",type:"number",value:w,onChange:x=>b(x.target.value)}),e.jsx("button",{className:"stw-btn stw-ghost",onClick:z,children:"Update"})]}),e.jsx("div",{className:"stw-canvas-wrap",children:e.jsxs("svg",{width:I,height:j,viewBox:`0 0 ${I} ${j}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:t.nodes.map(x=>{if(x.parent===null)return null;const N=M[x.parent],E=M[x.k];if(!N||!E)return null;const A=N.x+T,R=N.y+v+Be/2,S=E.x+T,P=E.y+v-Be/2,L=(R+P)/2,B=c.visited.has(x.k)&&c.visited.has(x.parent),q=c.update.has(x.k)&&c.update.has(x.parent),D="stw-edge"+(B||q?" stw-edge-on-path":"");return e.jsx("path",{className:D,d:`M ${A} ${R} C ${A} ${L}, ${S} ${L}, ${S} ${P}`},x.k)})}),e.jsx("g",{children:t.nodes.map(x=>{const N=M[x.k];if(!N)return null;const E=["stw-node"];return x.lo===x.hi&&E.push("stw-leaf"),c.visited.has(x.k)&&E.push("stw-visited"),c.update.has(x.k)&&E.push("stw-update"),e.jsxs("g",{className:E.join(" "),children:[e.jsx("rect",{x:N.x+T-Ze/2,y:N.y+v-Be/2,width:Ze,height:Be,rx:8,ry:8}),e.jsxs("text",{x:N.x+T,y:N.y+v-4,children:["Σ=",x.sum]}),e.jsxs("text",{className:"stw-range",x:N.x+T,y:N.y+v+10,children:["[",x.lo,",",x.hi,"]"]})]},x.k)})})]})}),e.jsx("div",{className:"stw-array",children:t.arr.map((x,N)=>{const E=["stw-cell"];return c.arrQ.has(N)&&E.push("stw-cell-q"),c.arrU===N&&E.push("stw-cell-u"),e.jsxs("div",{className:E.join(" "),children:[e.jsx("div",{children:x}),e.jsxs("small",{children:["i=",N]})]},N)})}),e.jsxs("div",{className:"stw-footer",children:[e.jsxs("div",{className:"stw-status",children:["Status: ",o]}),e.jsxs("div",{className:"stw-stats",children:["n=",e.jsx("b",{children:t.arr.length}),"   root-sum=",e.jsx("b",{children:t.nodes.length?t.nodes[0].sum:0})]})]})]})}

export default Io;
export { Io as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Io, {}));
  return () => root.unmount();
}
