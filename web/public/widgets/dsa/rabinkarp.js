import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Gn(a,t,s=31,o=1009){const n=a.length,c=t.length,r=[],l=[];if(c===0||c>n)return{text:a,pattern:t,B:s,Q:o,patHash:0,steps:r,matches:l};function i(u){return u.charCodeAt(0)%o}let d=1;for(let u=0;u<c-1;u++)d=d*s%o;let f=0,p=0;for(let u=0;u<c;u++)f=(f*s+i(t[u]))%o,p=(p*s+i(a[u]))%o;r.push({kind:"init-pat",hash:f,note:`Compute pattern hash H(P) = ${f} (base B=${s}, mod Q=${o}).`}),r.push({kind:"init-window",i:0,hash:p,note:`Compute hash of text[0..${c-1}] = ${p}.`});for(let u=0;u<=n-c;u++){if(r.push({kind:"hash-cmp",i:u,winHash:p,patHash:f,note:p===f?`Hash match at i=${u} (${p} == ${f}). Verify chars.`:`Hashes differ at i=${u} (${p} != ${f}). Skip.`}),p===f){let m=!0;for(let w=0;w<c;w++){const b=a[u+w],k=t[w],$=b===k;if(r.push({kind:"verify",i:u,k:w,tch:b,pch:k,ok:$,note:`Verify text[${u+w}]='${b}' vs pattern[${w}]='${k}'.`}),!$){m=!1;break}}m?(l.push(u),r.push({kind:"found",i:u,note:`Confirmed match at i=${u}.`})):r.push({kind:"spurious",i:u,note:`Spurious collision at i=${u} — hashes equal, chars differ.`})}if(u<n-c){const m=a[u],w=a[u+c];let b=p-i(m)*d%o;b=(b%o+o)%o,b=(b*s+i(w))%o,r.push({kind:"roll",iOld:u,iNew:u+1,oldHash:p,newHash:b,outCh:m,inCh:w,note:`Roll window: drop '${m}', add '${w}'. Hash ${p} -> ${b}.`}),p=b}}return{text:a,pattern:t,B:s,Q:o,patHash:f,steps:r,matches:l}}
const Vn=`
.rkw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.rkw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.rkw-title { font-weight: 600; font-size: 15px; }
.rkw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.rkw-head-right { display: flex; gap: 8px; align-items: center; }
.rkw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.rkw-input {
  padding: 6px 10px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 260px;
}
.rkw-input.rkw-pat { width: 160px; }
.rkw-input.rkw-tiny { width: 70px; }
.rkw-input:focus { outline: none; border-color: #4a7cff; }
.rkw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.rkw-btn:hover { background: #3b6ae8; }
.rkw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rkw-btn.rkw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.rkw-btn.rkw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.rkw-btn.rkw-danger { background: #c13c3c; }
.rkw-btn.rkw-danger:hover { background: #a73232; }
.rkw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.rkw-canvas-wrap {
  flex: 1; min-height: 300px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px 20px;
  display: flex; flex-direction: column; gap: 14px; align-items: center;
}
.rkw-hashpanel {
  display: flex; gap: 22px; align-items: center; justify-content: center;
  background: #141925; border: 1px solid #2a2f3e; border-radius: 8px;
  padding: 10px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.rkw-hashpanel .k { color: #8a93a8; margin-right: 6px; }
.rkw-hashpanel .v { color: #ffd24a; font-weight: 600; }
.rkw-hashpanel .v.ok { color: #4a9f6f; }
.rkw-hashpanel .v.bad { color: #ff5c5c; }
.rkw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.rkw-status { color: #d1d5db; flex: 1; min-width: 0; }
.rkw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.rkw-stats b { color: #e6e6e6; }

.rkw-cell rect {
  fill: #1f2a3a; stroke: #3a4560; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease;
}
.rkw-cell text.val {
  fill: #e6e6e6; font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.rkw-cell text.idx {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.rkw-cell.rkw-win rect { fill: #2a3550; stroke: #ffd24a; stroke-width: 2; }
.rkw-cell.rkw-verify rect { fill: #2a3550; stroke: #4a7cff; stroke-width: 2.5; }
.rkw-cell.rkw-ok rect { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2; }
.rkw-cell.rkw-bad rect { fill: #3a1f1f; stroke: #ff5c5c; stroke-width: 2; }
.rkw-cell.rkw-found rect {
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2.5;
  animation: rkw-pulse-green 700ms ease-in-out;
}
.rkw-cell.rkw-spurious rect { fill: #3a2a1f; stroke: #ffa54a; stroke-width: 2; }
@keyframes rkw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50% { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.rkw-label { fill: #8a93a8; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`,he=34,xe=38,cs=3;
function Xn(){const[a,t]=h.useState("GEEKSFORGEEKS"),[s,o]=h.useState("GEEK"),[n,c]=h.useState("31"),[r,l]=h.useState("1009"),i=h.useMemo(()=>{const R=a||"A",S=s||"A",P=Number(n)||31,L=Number(r)||1009;return Gn(R,S,P,L)},[a,s,n,r]),[d,f]=h.useState(0),[p,u]=h.useState(!1),m=h.useRef(null);h.useEffect(()=>f(0),[i]),h.useEffect(()=>{if(p){if(d>=i.steps.length-1){u(!1);return}return m.current=setTimeout(()=>f(R=>R+1),550),()=>clearTimeout(m.current)}},[p,d,i]),h.useEffect(()=>()=>clearTimeout(m.current),[]);const w=h.useMemo(()=>{const R=i.pattern.length;let S=0,P=0,L=i.patHash,B="Ready.",q=null,D=null,_=!1,K=!1,O=null;const G=[],Z=[],X=new Array(R).fill(null);for(let H=0;H<=d&&H<i.steps.length;H++){const W=i.steps[H];if(W.kind==="init-pat")L=W.hash;else if(W.kind==="init-window"){S=W.i,P=W.hash;for(let J=0;J<R;J++)X[J]=null;q=null,D=null,O=null,_=!1,K=!1}else if(W.kind==="hash-cmp"){S=W.i,P=W.winHash,O=W.winHash===W.patHash;for(let J=0;J<R;J++)X[J]=null;q=null,D=null,_=!1,K=!1}else if(W.kind==="verify")q=W.k,D=W.ok,X[W.k]=W.ok?"ok":"bad";else if(W.kind==="found")G.push(W.i),_=!0;else if(W.kind==="spurious")Z.push(W.i),K=!0;else if(W.kind==="roll"){S=W.iNew,P=W.newHash;for(let J=0;J<R;J++)X[J]=null;q=null,D=null,O=null,_=!1,K=!1}W.note&&(B=W.note)}return{winStart:S,winHash:P,patHash:L,status:B,verifyK:q,verifyOk:D,verifyRecord:X,hashCmpEq:O,foundAt:G,spuriousAt:Z,lastWasFound:_,lastWasSpurious:K}},[i,d]);function b(){d<i.steps.length-1&&f(d+1)}function k(){d>=i.steps.length-1&&f(0),u(!0)}function $(){u(!1)}function g(){u(!1),f(0)}const z=i.text,F=i.pattern,M=F.length,y=16,C=Math.max(z.length*(he+cs)+2*y,420),T=170,v=28,I=92;function j(R){return y+R*(he+cs)}function x(R){const S=["rkw-cell"];for(const L of w.foundAt)if(R>=L&&R<L+M)return S.push("rkw-found"),S.join(" ");if(R>=w.winStart&&R<w.winStart+M){const L=R-w.winStart,B=w.verifyRecord[L];B==="ok"?S.push("rkw-ok"):B==="bad"?S.push("rkw-bad"):w.lastWasSpurious?S.push("rkw-spurious"):S.push("rkw-win")}return S.join(" ")}function N(R){const S=["rkw-cell"],P=w.verifyRecord[R];return P==="ok"?S.push("rkw-ok"):P==="bad"?S.push("rkw-bad"):w.verifyK===R&&S.push("rkw-verify"),S.join(" ")}const E=i.steps.length===0?0:Math.round((d+1)/i.steps.length*100);let A="v";return w.hashCmpEq===!0?A="v ok":w.hashCmpEq===!1&&(A="v bad"),e.jsxs("div",{className:"rkw-root",children:[e.jsx("style",{children:Vn}),e.jsxs("div",{className:"rkw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"rkw-title",children:"Rabin-Karp Rolling Hash"}),e.jsx("div",{className:"rkw-sub",children:"Polynomial hash H(s) = Σ s[k]·B^(m-1-k) mod Q — slide window in O(1) per shift"})]}),e.jsx("div",{className:"rkw-head-right",children:e.jsx("button",{className:"rkw-btn rkw-danger",onClick:g,children:"Reset"})})]}),e.jsxs("div",{className:"rkw-bar",children:[e.jsx("label",{className:"rkw-quick",children:"Text:"}),e.jsx("input",{className:"rkw-input",value:a,onChange:R=>t(R.target.value)}),e.jsx("label",{className:"rkw-quick",children:"Pattern:"}),e.jsx("input",{className:"rkw-input rkw-pat",value:s,onChange:R=>o(R.target.value)}),e.jsx("label",{className:"rkw-quick",children:"B:"}),e.jsx("input",{className:"rkw-input rkw-tiny",value:n,onChange:R=>c(R.target.value)}),e.jsx("label",{className:"rkw-quick",children:"Q:"}),e.jsx("input",{className:"rkw-input rkw-tiny",value:r,onChange:R=>l(R.target.value)}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"rkw-btn",onClick:b,disabled:d>=i.steps.length-1,children:"Next"}),p?e.jsx("button",{className:"rkw-btn rkw-ghost",onClick:$,children:"Pause"}):e.jsx("button",{className:"rkw-btn rkw-ghost",onClick:k,children:"Play"})]}),e.jsxs("div",{className:"rkw-canvas-wrap",children:[e.jsxs("div",{className:"rkw-hashpanel",children:[e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"H(pattern)"}),e.jsx("span",{className:"v",children:w.patHash})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"H(window)"}),e.jsx("span",{className:A,children:w.winHash})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"window"}),e.jsxs("span",{className:"v",children:["[",w.winStart,"..",w.winStart+M-1,"]"]})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"B"}),e.jsx("span",{className:"v",children:i.B})]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"Q"}),e.jsx("span",{className:"v",children:i.Q})]})]}),e.jsxs("svg",{width:C,height:T,viewBox:`0 0 ${C} ${T}`,children:[e.jsx("text",{x:4,y:v+xe/2+4,className:"rkw-label",children:"txt"}),e.jsx("g",{children:z.split("").map((R,S)=>e.jsxs("g",{className:x(S),children:[e.jsx("rect",{x:j(S),y:v,width:he,height:xe,rx:5,ry:5}),e.jsx("text",{className:"val",x:j(S)+he/2,y:v+xe/2,children:R}),e.jsx("text",{className:"idx",x:j(S)+he/2,y:v+xe+12,children:S})]},`t${S}`))}),e.jsx("text",{x:4,y:I+xe/2+4,className:"rkw-label",children:"pat"}),e.jsx("g",{children:F.split("").map((R,S)=>e.jsxs("g",{className:N(S),children:[e.jsx("rect",{x:j(w.winStart+S),y:I,width:he,height:xe,rx:5,ry:5}),e.jsx("text",{className:"val",x:j(w.winStart+S)+he/2,y:I+xe/2,children:R}),e.jsx("text",{className:"idx",x:j(w.winStart+S)+he/2,y:I+xe+12,children:S})]},`p${S}`))})]})]}),e.jsxs("div",{className:"rkw-footer",children:[e.jsxs("div",{className:"rkw-status",children:["Status: ",w.status]}),e.jsxs("div",{className:"rkw-stats",children:["step=",e.jsx("b",{children:Math.min(d+1,i.steps.length)}),"/",e.jsx("b",{children:i.steps.length}),"  progress=",e.jsxs("b",{children:[E,"%"]}),"  matches=",e.jsx("b",{children:w.foundAt.length}),"  spurious=",e.jsx("b",{children:w.spuriousAt.length})]})]})]})}

export default Xn;
export { Xn as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Xn, {}));
  return () => root.unmount();
}
