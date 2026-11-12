import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Yn(a){const t=a.length,s=new Array(t).fill(0),o=[];if(t===0)return{s:a,z:s,steps:o};o.push({kind:"init",note:"z[0] = 0 by convention."});let n=0,c=0;for(let r=1;r<t;r++){if(r<=c){const l=r-n,i=c-r+1,d=s[l],f=Math.min(i,d);o.push({kind:"inside",i:r,L:n,R:c,k:l,zk:d,zNow:f,note:`i=${r} in window [${n}, ${c}]. Mirror k=i-L=${l}, z[${l}]=${d}, seed z[${r}]=min(R-i+1=${i}, z[${l}]=${d})=${f}.`}),s[r]=f}else o.push({kind:"outside",i:r,note:`i=${r} > R=${c}. Start match from scratch.`}),s[r]=0;for(;r+s[r]<t&&a[s[r]]===a[r+s[r]];)o.push({kind:"compare",i:r,a:s[r],b:r+s[r],note:`Match s[${s[r]}]='${a[s[r]]}' == s[${r+s[r]}]='${a[r+s[r]]}'. Extend z[${r}].`}),s[r]++;r+s[r]<t&&o.push({kind:"compare",i:r,a:s[r],b:r+s[r],note:`Mismatch s[${s[r]}]='${a[s[r]]}' != s[${r+s[r]}]='${a[r+s[r]]}'. Stop extending.`}),o.push({kind:"set",i:r,value:s[r],note:`z[${r}] = ${s[r]}.`}),r+s[r]-1>c&&(n=r,c=r+s[r]-1,o.push({kind:"window",L:n,R:c,note:`Update window to [${n}, ${c}] (rightmost prefix match).`}))}return{s:a,z:s,steps:o}}
const Qn=`
.zaw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.zaw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.zaw-title { font-weight: 600; font-size: 15px; }
.zaw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.zaw-head-right { display: flex; gap: 8px; align-items: center; }
.zaw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.zaw-input {
  padding: 6px 10px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 260px;
}
.zaw-input:focus { outline: none; border-color: #4a7cff; }
.zaw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.zaw-btn:hover { background: #3b6ae8; }
.zaw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.zaw-btn.zaw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.zaw-btn.zaw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.zaw-btn.zaw-danger { background: #c13c3c; }
.zaw-btn.zaw-danger:hover { background: #a73232; }
.zaw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.zaw-canvas-wrap {
  flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 28px 20px;
  display: flex; flex-direction: column; gap: 18px; align-items: center;
}
.zaw-lr-panel {
  display: flex; gap: 22px; align-items: center; justify-content: center;
  background: #141925; border: 1px solid #2a2f3e; border-radius: 8px;
  padding: 8px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.zaw-lr-panel .k { color: #8a93a8; margin-right: 6px; }
.zaw-lr-panel .v { color: #ffd24a; font-weight: 600; }
.zaw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.zaw-status { color: #d1d5db; flex: 1; min-width: 0; }
.zaw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.zaw-stats b { color: #e6e6e6; }

.zaw-cell rect {
  fill: #1f2a3a; stroke: #3a4560; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease;
}
.zaw-cell text.val {
  fill: #e6e6e6; font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.zaw-cell text.idx {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.zaw-cell text.zval {
  fill: #ffd24a; font-size: 11px; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.zaw-cell.zaw-i rect { stroke: #ffd24a; stroke-width: 2.5; fill: #2a3550; }
.zaw-cell.zaw-cmp-a rect { stroke: #4a7cff; stroke-width: 2.5; fill: #1f2a4a; }
.zaw-cell.zaw-cmp-b rect { stroke: #ff5c5c; stroke-width: 2.5; fill: #3a1f1f; }
.zaw-cell.zaw-in-window rect { fill: #1a2838; stroke: #3a5580; }
.zaw-cell.zaw-z1 rect { fill: #1d2f3a; }
.zaw-cell.zaw-z2 rect { fill: #1e3a44; }
.zaw-cell.zaw-z3 rect { fill: #1f4a4e; }
.zaw-cell.zaw-z4 rect { fill: #205a58; }
.zaw-cell.zaw-z5 rect { fill: #216a62; stroke: #4a9f6f; }

.zaw-window-bracket {
  stroke: #ffd24a; stroke-width: 2; fill: none;
}
.zaw-bracket-label {
  fill: #ffd24a; font-size: 11px; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.zaw-label { fill: #8a93a8; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`,Ne=40,lt=44,ds=4,ps="aabcaabxaaaz",Zn="aaaaa",Jn="abababab";
function ea(){const[a,t]=h.useState(ps),s=h.useMemo(()=>Yn(a||"a"),[a]),[o,n]=h.useState(0),[c,r]=h.useState(!1),l=h.useRef(null);h.useEffect(()=>n(0),[s]),h.useEffect(()=>{if(c){if(o>=s.steps.length-1){r(!1);return}return l.current=setTimeout(()=>n(j=>j+1),600),()=>clearTimeout(l.current)}},[c,o,s]),h.useEffect(()=>()=>clearTimeout(l.current),[]);const i=h.useMemo(()=>{const j=s.s.length,x=new Array(j).fill(null);let N=0,E=0,A=null,R=null,S=null,P="Ready.";for(let L=0;L<=o&&L<s.steps.length;L++){const B=s.steps[L];B.kind==="init"?x[0]=0:B.kind==="inside"||B.kind==="outside"?(A=B.i,R=null,S=null):B.kind==="compare"?(A=B.i,R=B.a,S=B.b):B.kind==="set"?(x[B.i]=B.value,R=null,S=null):B.kind==="window"&&(N=B.L,E=B.R),B.note&&(P=B.note)}return{z:x,L:N,R:E,curI:A,cmpA:R,cmpB:S,status:P}},[s,o]);function d(){o<s.steps.length-1&&n(o+1)}function f(){o>=s.steps.length-1&&n(0),r(!0)}function p(){r(!1)}function u(){r(!1),n(0)}const m=s.s,w=m.length,b=20,k=Math.max(w*(Ne+ds)+2*b,420),$=150,g=40;function z(j){return b+j*(Ne+ds)}function F(j){const x=["zaw-cell"],N=i.z[j];return i.curI===j&&x.push("zaw-i"),i.cmpB===j&&i.curI!==null&&x.push("zaw-cmp-b"),i.cmpA===j&&j!==i.curI&&x.push("zaw-cmp-a"),i.R>0&&j>=i.L&&j<=i.R&&i.curI!==j&&!x.includes("zaw-cmp-a")&&!x.includes("zaw-cmp-b")&&x.push("zaw-in-window"),N!==null&&N>0&&i.curI!==j&&!x.includes("zaw-cmp-b")&&(N===1?x.push("zaw-z1"):N===2?x.push("zaw-z2"):N===3?x.push("zaw-z3"):N===4?x.push("zaw-z4"):x.push("zaw-z5")),x.join(" ")}const M=s.steps.length===0?0:Math.round((o+1)/s.steps.length*100),y=i.R>=i.L&&i.R>0,C=y?z(i.L):0,T=y?z(i.R)+Ne:0,v=g-14,I=i.z.filter(j=>j!==null).length;return e.jsxs("div",{className:"zaw-root",children:[e.jsx("style",{children:Qn}),e.jsxs("div",{className:"zaw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"zaw-title",children:"Z-Algorithm"}),e.jsx("div",{className:"zaw-sub",children:"Build Z-array in O(n) using rightmost prefix-match window [L, R]"})]}),e.jsx("div",{className:"zaw-head-right",children:e.jsx("button",{className:"zaw-btn zaw-danger",onClick:u,children:"Reset"})})]}),e.jsxs("div",{className:"zaw-bar",children:[e.jsx("label",{className:"zaw-quick",children:"String:"}),e.jsx("input",{className:"zaw-input",value:a,onChange:j=>t(j.target.value)}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"zaw-btn",onClick:d,disabled:o>=s.steps.length-1,children:"Next"}),c?e.jsx("button",{className:"zaw-btn zaw-ghost",onClick:p,children:"Pause"}):e.jsx("button",{className:"zaw-btn zaw-ghost",onClick:f,children:"Play"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"zaw-quick",children:"Seed:"}),e.jsx("button",{className:"zaw-btn zaw-ghost",onClick:()=>t(ps),children:"aabcaabxaaaz"}),e.jsx("button",{className:"zaw-btn zaw-ghost",onClick:()=>t(Zn),children:"aaaaa"}),e.jsx("button",{className:"zaw-btn zaw-ghost",onClick:()=>t(Jn),children:"abababab"})]}),e.jsxs("div",{className:"zaw-canvas-wrap",children:[e.jsxs("div",{className:"zaw-lr-panel",children:[e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"L"}),e.jsx("span",{className:"v",children:i.L})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"R"}),e.jsx("span",{className:"v",children:i.R})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"i"}),e.jsx("span",{className:"v",children:i.curI===null?"-":i.curI})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"|s|"}),e.jsx("span",{className:"v",children:w})]})]}),e.jsxs("svg",{width:k,height:$,viewBox:`0 0 ${k} ${$}`,children:[y&&e.jsxs("g",{children:[e.jsx("path",{d:`M ${C} ${v+8} L ${C} ${v} L ${T} ${v} L ${T} ${v+8}`,className:"zaw-window-bracket"}),e.jsxs("text",{x:(C+T)/2,y:v-3,className:"zaw-bracket-label",textAnchor:"middle",children:["[L=",i.L,", R=",i.R,"]"]})]}),e.jsx("g",{children:m.split("").map((j,x)=>e.jsxs("g",{className:F(x),children:[e.jsx("rect",{x:z(x),y:g,width:Ne,height:lt,rx:6,ry:6}),e.jsx("text",{className:"val",x:z(x)+Ne/2,y:g+lt/2,children:j}),e.jsx("text",{className:"idx",x:z(x)+Ne/2,y:g+lt+14,children:x}),e.jsxs("text",{className:"zval",x:z(x)+Ne/2,y:g+lt+30,children:["z=",i.z[x]===null?"·":i.z[x]]})]},x))})]})]}),e.jsxs("div",{className:"zaw-footer",children:[e.jsxs("div",{className:"zaw-status",children:["Status: ",i.status]}),e.jsxs("div",{className:"zaw-stats",children:["step=",e.jsx("b",{children:Math.min(o+1,s.steps.length)}),"/",e.jsx("b",{children:s.steps.length}),"  progress=",e.jsxs("b",{children:[M,"%"]}),"  computed=",e.jsx("b",{children:I}),"/",e.jsx("b",{children:w})]})]})]})}

export default ea;
export { ea as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ea, {}));
  return () => root.unmount();
}
