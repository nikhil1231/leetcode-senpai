import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Fs(a,t=100){const s=[];for(let o=0;o<a;o++)s.push(1+Math.floor(Math.random()*t));return s}
function V(a,t,s,o,n){return{arr:a.slice(),highlight:t.slice(),action:s,comparisons:o,swaps:n}}
function Mi(a){const t=a.slice(),s=[];let o=0,n=0;const c=t.length;s.push(V(t,[],"start",o,n));for(let r=0;r<c-1;r++){let l=!1;for(let i=0;i<c-1-r;i++)if(o++,s.push(V(t,[i,i+1],"compare",o,n)),t[i]>t[i+1]){const d=t[i];t[i]=t[i+1],t[i+1]=d,n++,l=!0,s.push(V(t,[i,i+1],"swap",o,n))}if(!l)break}return s.push(V(t,[],"done",o,n)),s}
function zi(a){const t=a.slice(),s=[];let o=0,n=0;const c=t.length;s.push(V(t,[],"start",o,n));for(let r=1;r<c;r++){let l=r;for(;l>0&&(o++,s.push(V(t,[l-1,l],"compare",o,n)),t[l-1]>t[l]);){const i=t[l-1];t[l-1]=t[l],t[l]=i,n++,s.push(V(t,[l-1,l],"swap",o,n)),l--}}return s.push(V(t,[],"done",o,n)),s}
function Ci(a){const t=a.slice(),s=[];let o=0,n=0;s.push(V(t,[],"start",o,n));function c(l,i,d){const f=t.slice(l,i),p=t.slice(i,d);let u=0,m=0,w=l;for(;u<f.length&&m<p.length;){o++;const b=l+u,k=i+m;s.push(V(t,[b,k],"compare",o,n)),f[u]<=p[m]?t[w++]=f[u++]:t[w++]=p[m++],n++,s.push(V(t,[w-1],"set",o,n))}for(;u<f.length;)t[w++]=f[u++],n++,s.push(V(t,[w-1],"set",o,n));for(;m<p.length;)t[w++]=p[m++],n++,s.push(V(t,[w-1],"set",o,n))}function r(l,i){if(i-l<=1)return;const d=l+i>>1;r(l,d),r(d,i),c(l,d,i)}return r(0,t.length),s.push(V(t,[],"done",o,n)),s}
function Ri(a){const t=a.slice(),s=[];let o=0,n=0;s.push(V(t,[],"start",o,n));function c(l,i){const d=t[i];let f=l;for(let p=l;p<i;p++)if(o++,s.push(V(t,[p,i],"compare",o,n)),t[p]<=d){if(f!==p){const u=t[f];t[f]=t[p],t[p]=u,n++,s.push(V(t,[f,p],"swap",o,n))}f++}if(f!==i){const p=t[f];t[f]=t[i],t[i]=p,n++,s.push(V(t,[f,i],"swap",o,n))}return f}function r(l,i){if(l>=i)return;const d=c(l,i);r(l,d-1),r(d+1,i)}return r(0,t.length-1),s.push(V(t,[],"done",o,n)),s}
function Ei(a){const t=a.slice(),s=[];let o=0,n=0;s.push(V(t,[],"start",o,n));const c=t.length;function r(l,i){let d=l;for(;;){const f=2*d+1,p=2*d+2;let u=d;if(f<i&&(o++,s.push(V(t,[u,f],"compare",o,n)),t[f]>t[u]&&(u=f)),p<i&&(o++,s.push(V(t,[u,p],"compare",o,n)),t[p]>t[u]&&(u=p)),u!==d){const m=t[d];t[d]=t[u],t[u]=m,n++,s.push(V(t,[d,u],"swap",o,n)),d=u}else break}}for(let l=(c>>1)-1;l>=0;l--)r(l,c);for(let l=c-1;l>0;l--){const i=t[0];t[0]=t[l],t[l]=i,n++,s.push(V(t,[0,l],"swap",o,n)),r(0,l)}return s.push(V(t,[],"done",o,n)),s}
const Me=[{key:"bubble",label:"Bubble",build:Mi},{key:"insertion",label:"Insertion",build:zi},{key:"merge",label:"Merge",build:Ci},{key:"quick",label:"Quick",build:Ri},{key:"heap",label:"Heap",build:Ei}],Fi=`
.csw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.csw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.csw-title { font-weight: 600; font-size: 15px; }
.csw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.csw-bar {
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.csw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.csw-btn:hover { background: #3b6ae8; }
.csw-btn.csw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.csw-btn.csw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.csw-btn.csw-danger { background: #c13c3c; }
.csw-btn.csw-danger:hover { background: #a73232; }
.csw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.csw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 80px;
}
.csw-input:focus { outline: none; border-color: #4a7cff; }
.csw-label { font-size: 12px; color: #8a93a8; }
.csw-canvas-wrap {
  flex: 1; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 16px;
}
.csw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.csw-panel {
  background: #141925; border: 1px solid #2a2f3e; border-radius: 8px;
  padding: 10px 12px; display: flex; flex-direction: column;
}
.csw-panel-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 8px;
}
.csw-panel-title { font-weight: 600; font-size: 14px; color: #e6e6e6; }
.csw-panel-done { color: #4a9f6f; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; }
.csw-panel-counts {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: #8a93a8;
}
.csw-panel-counts b { color: #e6e6e6; }
.csw-bars {
  display: flex; align-items: flex-end; height: 140px;
  border-bottom: 1px solid #2a2f3e; gap: 1px; padding-bottom: 2px;
}
.csw-bar-el {
  flex: 1; background: #4a7cff; transition: height 120ms ease, background 120ms ease;
  border-radius: 2px 2px 0 0;
}
.csw-bar-el.csw-hl { background: #ffd24a; }
.csw-bar-el.csw-done { background: #4a9f6f; }
.csw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.csw-status { color: #d1d5db; flex: 1; min-width: 0; }
.csw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.csw-stats b { color: #e6e6e6; }
`;
function Ii({def:a,step:t,maxVal:s,isFirstFinished:o}){const n=t.arr,c=new Set(t.highlight),r=t.action==="done";return e.jsxs("div",{className:"csw-panel",children:[e.jsxs("div",{className:"csw-panel-head",children:[e.jsxs("span",{className:"csw-panel-title",children:[a.label,o&&e.jsx("span",{className:"csw-panel-done",children:" first!"})]}),e.jsxs("span",{className:"csw-panel-counts",children:["cmp=",e.jsx("b",{children:t.comparisons})," swp=",e.jsx("b",{children:t.swaps})]})]}),e.jsx("div",{className:"csw-bars",children:n.map((l,i)=>{const d=Math.max(2,Math.round(l/s*100)),f="csw-bar-el"+(r?" csw-done":c.has(i)?" csw-hl":"");return e.jsx("div",{className:f,style:{height:d+"%"}},i)})})]})}
function Ai(){var M;const[a,t]=h.useState(30),[s,o]=h.useState(120),[n,c]=h.useState(()=>Fs(30,100)),[r,l]=h.useState(!1),i=h.useMemo(()=>Me.map(y=>y.build(n)),[n]),[d,f]=h.useState(()=>Me.map(()=>0)),[p,u]=h.useState(null);h.useEffect(()=>{f(Me.map(()=>0)),u(null),l(!1)},[n]);const m=h.useMemo(()=>Math.max(...n,1),[n]),w=d.every((y,C)=>y>=i[C].length-1);function b(){f(y=>{const C=y.slice();let T=p;for(let v=0;v<C.length;v++){const I=i[v].length-1;C[v]<I&&(C[v]=C[v]+1),!T&&C[v]===I&&(T=Me[v].key)}return T!==p&&u(T),C})}h.useEffect(()=>{if(!r)return;if(w){l(!1);return}const y=setTimeout(b,Math.max(10,s));return()=>clearTimeout(y)},[r,d,s,w]);function k(){const y=Math.max(4,Math.min(80,Number(a)||30));c(Fs(y,100))}function $(){f(Me.map(()=>0)),u(null),l(!1)}const g=p&&((M=Me.find(y=>y.key===p))==null?void 0:M.label),z=i.reduce((y,C)=>y+C.length,0),F=d.reduce((y,C)=>y+C+1,0);return e.jsxs("div",{className:"csw-root",children:[e.jsx("style",{children:Fi}),e.jsx("div",{className:"csw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"csw-title",children:"Compare Sorts — 5 algorithms, same array"}),e.jsx("div",{className:"csw-sub",children:"Bubble / Insertion / Merge / Quick / Heap — tick all five in lockstep, watch comparisons and swaps accumulate."})]})}),e.jsxs("div",{className:"csw-bar",children:[e.jsx("button",{className:"csw-btn",onClick:()=>l(y=>!y),disabled:w,children:r?"Pause":"Play"}),e.jsx("button",{className:"csw-btn csw-ghost",onClick:b,disabled:w||r,children:"Step"}),e.jsx("button",{className:"csw-btn csw-ghost",onClick:$,children:"Reset"}),e.jsx("button",{className:"csw-btn csw-danger",onClick:k,children:"Shuffle"}),e.jsx("span",{style:{width:8}}),e.jsx("span",{className:"csw-label",children:"n:"}),e.jsx("input",{className:"csw-input",type:"number",min:4,max:80,value:a,onChange:y=>t(y.target.value)}),e.jsx("span",{className:"csw-label",children:"tick (ms):"}),e.jsx("input",{className:"csw-input",type:"number",min:10,max:2e3,value:s,onChange:y=>o(Number(y.target.value)||120)})]}),e.jsx("div",{className:"csw-canvas-wrap",children:e.jsx("div",{className:"csw-grid",children:Me.map((y,C)=>e.jsx(Ii,{def:y,step:i[C][d[C]],maxVal:m,isFirstFinished:p===y.key},y.key))})}),e.jsxs("div",{className:"csw-footer",children:[e.jsxs("div",{className:"csw-status",children:["Status:"," ",w?`All five finished. ${g||"—"} reached the sorted state first.`:g?`${g} finished first; others still running.`:r?"Playing — each panel advances one step per tick.":"Press Play, Step, or Shuffle to begin."]}),e.jsxs("div",{className:"csw-stats",children:["n=",e.jsx("b",{children:n.length}),"   progress=",e.jsx("b",{children:F}),"/",e.jsx("b",{children:z}),"   tick=",e.jsxs("b",{children:[s,"ms"]})]})]})]})}

export default Ai;
export { Ai as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ai, {}));
  return () => root.unmount();
}
