import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Yi(a,t,s,o=.05,n=50){const c=[];let r=t,l=s,i=0;for(c.push({lo:r,hi:l,m1:null,m2:null,fm1:null,fm2:null,decision:`Search range initialized to [${r.toFixed(2)}, ${l.toFixed(2)}]. f is assumed unimodal.`,done:!1,bestX:null,iter:i});l-r>o&&i<n;){const f=(l-r)/3,p=r+f,u=l-f,m=a(p),w=a(u);let b,k=r,$=l;m<w?(b=`f(m1=${p.toFixed(2)}) = ${m.toFixed(2)} < f(m2=${u.toFixed(2)}) = ${w.toFixed(2)}. Peak cannot lie in [${r.toFixed(2)}, ${p.toFixed(2)}]. Discard the left third; lo = m1.`,k=p):(b=`f(m1=${p.toFixed(2)}) = ${m.toFixed(2)} ≥ f(m2=${u.toFixed(2)}) = ${w.toFixed(2)}. Peak cannot lie in [${u.toFixed(2)}, ${l.toFixed(2)}]. Discard the right third; hi = m2.`,$=u),c.push({lo:r,hi:l,m1:p,m2:u,fm1:m,fm2:w,decision:b,done:!1,bestX:null,iter:i+1,nextLo:k,nextHi:$}),r=k,l=$,i++}const d=(r+l)/2;return c.push({lo:r,hi:l,m1:null,m2:null,fm1:null,fm2:null,decision:`Range width ${(l-r).toFixed(3)} ≤ epsilon. Converged in ${i} iterations. Peak ≈ x = ${d.toFixed(3)}, f(x) ≈ ${a(d).toFixed(3)}.`,done:!0,bestX:d,iter:i}),c}
const Qi=`
.tsw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.tsw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.tsw-title { font-weight: 600; font-size: 15px; }
.tsw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.tsw-bar {
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.tsw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.tsw-btn:hover { background: #3b6ae8; }
.tsw-btn.tsw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.tsw-btn.tsw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.tsw-btn.tsw-danger { background: #c13c3c; }
.tsw-btn.tsw-danger:hover { background: #a73232; }
.tsw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tsw-input, .tsw-select {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit;
}
.tsw-input { width: 80px; }
.tsw-input:focus, .tsw-select:focus { outline: none; border-color: #4a7cff; }
.tsw-label { font-size: 12px; color: #8a93a8; }
.tsw-canvas {
  flex: 1; overflow: auto; padding: 20px;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  display: flex; align-items: center; justify-content: center;
}
.tsw-svg-wrap {
  background: #0c1017; border: 1px solid #2a2f3e; border-radius: 8px;
  padding: 12px;
}
.tsw-curve { fill: none; stroke: #4a7cff; stroke-width: 2; }
.tsw-curve-active { stroke: #ffd24a; }
.tsw-axis { stroke: #2a2f3e; stroke-width: 1; }
.tsw-axis-label {
  fill: #6a7389; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tsw-discarded {
  fill: #c13c3c; opacity: 0.12;
}
.tsw-window {
  fill: #4a9f6f; opacity: 0.10;
}
.tsw-probe-line {
  stroke-dasharray: 3 3; stroke-width: 1.5;
}
.tsw-probe-line.tsw-m1 { stroke: #4a7cff; }
.tsw-probe-line.tsw-m2 { stroke: #c13c3c; }
.tsw-probe-dot {
  stroke: #0c1017; stroke-width: 2;
  transition: cx 400ms ease, cy 400ms ease;
}
.tsw-probe-dot.tsw-m1 { fill: #4a7cff; }
.tsw-probe-dot.tsw-m2 { fill: #c13c3c; }
.tsw-probe-label {
  fill: #e6e6e6; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tsw-peak-dot { fill: #4a9f6f; stroke: #0c1017; stroke-width: 2;
  animation: tsw-peak-pulse 900ms ease-in-out infinite; }
@keyframes tsw-peak-pulse {
  0%, 100% { r: 6; }
  50%      { r: 9; }
}
.tsw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.tsw-status { color: #d1d5db; flex: 1; min-width: 0; }
.tsw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.tsw-stats b { color: #e6e6e6; }
.tsw-legend {
  font-size: 11px; color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 8px; display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
}
.tsw-legend .tsw-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  margin-right: 5px; vertical-align: middle;
}
`,Xt=[{key:"parabola",label:"f(x) = −(x − 7)² + 50",f:a=>-(a-7)*(a-7)+50,lo:0,hi:15},{key:"skewed",label:"f(x) = −(x − 3)² + 4x",f:a=>-(a-3)*(a-3)+4*a,lo:0,hi:12},{key:"smooth",label:"f(x) = −0.3(x − 5)² · (x − 20)² + 200 · (scaled)",f:a=>40*Math.exp(-Math.pow((a-5)/3.2,2)),lo:0,hi:12}];
function Ts(a,t,s,o,n,c){let r="";for(let l=0;l<=o;l++){const i=t+l/o*(s-t),d=a(i),f=n(i),p=c(d);r+=(l===0?"M ":"L ")+f.toFixed(2)+" "+p.toFixed(2)+" "}return r}
function Zi(){const[a,t]=h.useState("parabola"),s=Xt.find(A=>A.key===a)||Xt[0],[o,n]=h.useState(800),[c,r]=h.useState(!1),[l,i]=h.useState(0),d=h.useMemo(()=>Yi(s.f,s.lo,s.hi,.05,30),[s]);h.useEffect(()=>{i(0),r(!1)},[a]);const f=d[l]||d[d.length-1],p=l>=d.length-1;h.useEffect(()=>{if(!c)return;if(p){r(!1);return}const A=setTimeout(()=>i(R=>Math.min(R+1,d.length-1)),Math.max(100,o));return()=>clearTimeout(A)},[c,l,o,p,d.length]);const u=640,m=340,w={l:40,r:20,t:20,b:30},b=u-w.l-w.r,k=m-w.t-w.b,$=[s.lo,s.hi],g=h.useMemo(()=>{let A=1/0,R=-1/0;for(let P=0;P<=60;P++){const L=$[0]+P/60*($[1]-$[0]),B=s.f(L);B<A&&(A=B),B>R&&(R=B)}const S=(R-A)*.1||1;return[A-S,R+S]},[s,$]),z=A=>w.l+(A-$[0])/($[1]-$[0])*b,F=A=>w.t+k-(A-g[0])/(g[1]-g[0])*k,M=h.useMemo(()=>Ts(s.f,$[0],$[1],120,z,F),[s,$,z,F]),y=h.useMemo(()=>Ts(s.f,f.lo,f.hi,80,z,F),[s,f.lo,f.hi,z,F]);function C(){i(0),r(!1)}function T(){i(A=>Math.min(A+1,d.length-1))}const v=z($[0]),I=Math.max(0,z(f.lo)-v),j=z(f.hi),x=Math.max(0,z($[1])-j),N=z(f.lo),E=Math.max(0,z(f.hi)-N);return e.jsxs("div",{className:"tsw-root",children:[e.jsx("style",{children:Qi}),e.jsx("div",{className:"tsw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"tsw-title",children:"Ternary Search — maximize a unimodal function"}),e.jsx("div",{className:"tsw-sub",children:"Two probes m1 = lo + (hi − lo)/3, m2 = hi − (hi − lo)/3 per iteration. Each step eliminates one-third of the range."})]})}),e.jsxs("div",{className:"tsw-bar",children:[e.jsx("span",{className:"tsw-label",children:"Function:"}),e.jsx("select",{className:"tsw-select",value:a,onChange:A=>t(A.target.value),children:Xt.map(A=>e.jsx("option",{value:A.key,children:A.label},A.key))}),e.jsx("button",{className:"tsw-btn",onClick:()=>r(A=>!A),disabled:p,children:c?"Pause":"Play"}),e.jsx("button",{className:"tsw-btn tsw-ghost",onClick:T,disabled:p||c,children:"Step"}),e.jsx("button",{className:"tsw-btn tsw-ghost",onClick:C,children:"Reset"}),e.jsx("button",{className:"tsw-btn tsw-danger",onClick:()=>{i(0),r(!0)},children:"Replay"}),e.jsx("span",{className:"tsw-label",children:"tick (ms):"}),e.jsx("input",{className:"tsw-input",type:"number",min:100,max:2e3,value:o,onChange:A=>n(Number(A.target.value)||800)})]}),e.jsx("div",{className:"tsw-canvas",children:e.jsxs("div",{children:[e.jsx("div",{className:"tsw-svg-wrap",children:e.jsxs("svg",{width:u,height:m,children:[I>0&&e.jsx("rect",{className:"tsw-discarded",x:v,y:w.t,width:I,height:k}),x>0&&e.jsx("rect",{className:"tsw-discarded",x:j,y:w.t,width:x,height:k}),e.jsx("rect",{className:"tsw-window",x:N,y:w.t,width:E,height:k}),e.jsx("line",{className:"tsw-axis",x1:w.l,y1:w.t+k,x2:w.l+b,y2:w.t+k}),e.jsx("line",{className:"tsw-axis",x1:w.l,y1:w.t,x2:w.l,y2:w.t+k}),e.jsx("text",{className:"tsw-axis-label",x:w.l+b-4,y:w.t+k+14,textAnchor:"end",children:"x"}),e.jsx("text",{className:"tsw-axis-label",x:w.l-4,y:w.t+10,textAnchor:"end",children:"f(x)"}),e.jsx("text",{className:"tsw-axis-label",x:w.l,y:w.t+k+14,textAnchor:"middle",children:$[0]}),e.jsx("text",{className:"tsw-axis-label",x:w.l+b,y:w.t+k+14,textAnchor:"middle",children:$[1]}),e.jsx("path",{className:"tsw-curve",d:M}),e.jsx("path",{className:"tsw-curve tsw-curve-active",d:y}),f.m1!=null&&e.jsxs(e.Fragment,{children:[e.jsx("line",{className:"tsw-probe-line tsw-m1",x1:z(f.m1),y1:w.t,x2:z(f.m1),y2:w.t+k}),e.jsx("circle",{className:"tsw-probe-dot tsw-m1",cx:z(f.m1),cy:F(f.fm1),r:6}),e.jsx("text",{className:"tsw-probe-label",x:z(f.m1),y:w.t-4,textAnchor:"middle",children:"m1"})]}),f.m2!=null&&e.jsxs(e.Fragment,{children:[e.jsx("line",{className:"tsw-probe-line tsw-m2",x1:z(f.m2),y1:w.t,x2:z(f.m2),y2:w.t+k}),e.jsx("circle",{className:"tsw-probe-dot tsw-m2",cx:z(f.m2),cy:F(f.fm2),r:6}),e.jsx("text",{className:"tsw-probe-label",x:z(f.m2),y:w.t-4,textAnchor:"middle",children:"m2"})]}),f.done&&f.bestX!=null&&e.jsx("circle",{className:"tsw-peak-dot",cx:z(f.bestX),cy:F(s.f(f.bestX)),r:7})]})}),e.jsxs("div",{className:"tsw-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"tsw-dot",style:{background:"#4a7cff"}}),"m1 probe"]}),e.jsxs("span",{children:[e.jsx("span",{className:"tsw-dot",style:{background:"#c13c3c"}}),"m2 probe"]}),e.jsxs("span",{children:[e.jsx("span",{className:"tsw-dot",style:{background:"#ffd24a"}}),"active window curve"]}),e.jsxs("span",{children:[e.jsx("span",{className:"tsw-dot",style:{background:"#4a9f6f"}}),"converged peak"]})]})]})}),e.jsxs("div",{className:"tsw-footer",children:[e.jsxs("div",{className:"tsw-status",children:["Status: ",f.decision]}),e.jsxs("div",{className:"tsw-stats",children:["iter=",e.jsx("b",{children:f.iter}),"   range=",e.jsxs("b",{children:["[",f.lo.toFixed(2),",",f.hi.toFixed(2),"]"]}),"   width=",e.jsx("b",{children:(f.hi-f.lo).toFixed(3)}),"   step=",e.jsx("b",{children:l+1}),"/",e.jsx("b",{children:d.length})]})]})]})}

export default Zi;
export { Zi as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Zi, {}));
  return () => root.unmount();
}
