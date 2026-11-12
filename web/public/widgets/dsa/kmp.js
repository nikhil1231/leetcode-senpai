import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function On(a){const t=a.length,s=new Array(t).fill(0),o=[];o.push({kind:"pi-set",i:0,value:0,note:"pi[0] = 0 (single char has no proper prefix)."});let n=0;for(let c=1;c<t;c++){for(o.push({kind:"pi-compare",i:c,k:n,note:`Compare pattern[k=${n}]='${a[n]}' with pattern[i=${c}]='${a[c]}'.`});n>0&&a[n]!==a[c];){const r=n;n=s[n-1],o.push({kind:"pi-fallback",i:c,kOld:r,kNew:n,note:`Mismatch. Fall back via pi: k = pi[${r-1}] = ${n}.`}),o.push({kind:"pi-compare",i:c,k:n,note:`Re-compare with k=${n}.`})}a[n]===a[c]?(n++,o.push({kind:"pi-set",i:c,value:n,note:`Match. pi[${c}] = ${n}.`})):o.push({kind:"pi-set",i:c,value:0,note:`No match at k=0. pi[${c}] = 0.`}),s[c]=n}return{pi:s,steps:o}}
function Wn(a,t,s){const o=a.length,n=t.length,c=[],r=[];if(n===0)return c.push({kind:"found",atIndex:0,note:"Empty pattern matches at every position."}),{steps:c,matches:r};let l=0;for(let i=0;i<o;i++){for(c.push({kind:"compare",i,j:l,note:`Compare text[${i}]='${a[i]}' with pattern[${l}]='${t[l]}'.`});l>0&&a[i]!==t[l];){const d=l;l=s[l-1],c.push({kind:"shift",i,jOld:d,jNew:l,note:`Mismatch. Shift pattern: j = pi[${d-1}] = ${l} (slide by ${d-l} instead of 1).`}),c.push({kind:"compare",i,j:l,note:`Re-compare text[${i}]='${a[i]}' with pattern[${l}]='${t[l]}'.`})}if(a[i]===t[l]&&(c.push({kind:"match",i,j:l,note:"Characters match."}),l++,l===n)){const d=i-n+1;r.push(d),c.push({kind:"found",atIndex:d,note:`Full match at text[${d}..${i}].`}),l=s[l-1]}}return{steps:c,matches:r}}
function Un(a,t){const{pi:s,steps:o}=On(t),{steps:n,matches:c}=Wn(a,t,s);return{pattern:t,text:a,pi:s,piSteps:o,scanSteps:n,matches:c}}
const Kn=`
.kmp-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.kmp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.kmp-title { font-weight: 600; font-size: 15px; }
.kmp-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.kmp-head-right { display: flex; gap: 8px; align-items: center; }
.kmp-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.kmp-input {
  padding: 6px 10px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 260px;
}
.kmp-input.kmp-pat { width: 180px; }
.kmp-input:focus { outline: none; border-color: #4a7cff; }
.kmp-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.kmp-btn:hover { background: #3b6ae8; }
.kmp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.kmp-btn.kmp-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.kmp-btn.kmp-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.kmp-btn.kmp-danger { background: #c13c3c; }
.kmp-btn.kmp-danger:hover { background: #a73232; }
.kmp-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.kmp-canvas-wrap {
  flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px 20px;
  display: flex; flex-direction: column; gap: 22px; align-items: center;
}
.kmp-section-label {
  font-size: 11px; color: #8a93a8; text-transform: uppercase; letter-spacing: 0.06em;
  align-self: flex-start; margin-left: 4px;
}
.kmp-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.kmp-status { color: #d1d5db; flex: 1; min-width: 0; }
.kmp-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.kmp-stats b { color: #e6e6e6; }

.kmp-cell rect {
  fill: #1f2a3a; stroke: #3a4560; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease;
}
.kmp-cell text.val {
  fill: #e6e6e6; font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.kmp-cell text.idx {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.kmp-cell text.pi {
  fill: #ffd24a; font-size: 11px; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.kmp-cell.kmp-i rect { stroke: #ffd24a; stroke-width: 2.5; fill: #2a3550; }
.kmp-cell.kmp-k rect { stroke: #4a7cff; stroke-width: 2.5; fill: #1f2a4a; }
.kmp-cell.kmp-t-i rect { stroke: #ffd24a; stroke-width: 2.5; fill: #2a3550; }
.kmp-cell.kmp-p-j rect { stroke: #4a7cff; stroke-width: 2.5; fill: #1f2a4a; }
.kmp-cell.kmp-match rect { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2; }
.kmp-cell.kmp-mismatch rect { fill: #3a1f1f; stroke: #ff5c5c; stroke-width: 2; }
.kmp-cell.kmp-found rect {
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2.5;
  animation: kmp-pulse-green 700ms ease-in-out;
}
@keyframes kmp-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50% { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.kmp-label { fill: #8a93a8; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`,ee=34,ae=38,We=3;
function Hn(){const[a,t]=h.useState("ABABDABACDABABCABAB"),[s,o]=h.useState("ABABCABAB"),[n,c]=h.useState("pi"),r=h.useMemo(()=>Un(a||"A",s||"A"),[a,s]),l=h.useMemo(()=>{const q=[];return r.piSteps.forEach(D=>q.push({...D,phase:"pi"})),r.scanSteps.forEach(D=>q.push({...D,phase:"scan"})),q},[r]),[i,d]=h.useState(0),[f,p]=h.useState(!1),u=h.useRef(null);h.useEffect(()=>{d(0),c("pi")},[r]),h.useEffect(()=>{if(f){if(i>=l.length-1){p(!1);return}return u.current=setTimeout(()=>d(q=>q+1),600),()=>clearTimeout(u.current)}},[f,i,l]),h.useEffect(()=>()=>clearTimeout(u.current),[]);const m=h.useMemo(()=>{const q=r.pattern.length,D=new Array(q).fill(null);let _="pi",K=null,O=null,G=null,Z=null,X=-1,H=0,W="Ready.",J=null;const is=[];for(let tt=0;tt<=i&&tt<l.length;tt++){const U=l[tt];U.phase==="pi"?(_="pi",U.kind==="pi-set"?(D[U.i]=U.value,K=U.i,O=U.value):U.kind==="pi-compare"?(K=U.i,O=U.k):U.kind==="pi-fallback"&&(K=U.i,O=U.kNew)):(_="scan",U.kind==="compare"?(G=U.i,Z=U.j,H=U.i-U.j,X=U.i-1,J=null):U.kind==="match"?(G=U.i,Z=U.j,H=U.i-U.j,X=U.i,J="match"):U.kind==="shift"?(G=U.i,Z=U.jNew,H=U.i-U.jNew,X=U.i-1,J="mismatch"):U.kind==="found"&&is.push(U.atIndex)),U.note&&(W=U.note)}return{curPhase:_,pi:D,piI:K,piK:O,scanI:G,scanJ:Z,alignStart:H,matchedUntil:X,status:W,cellState:J,foundAt:is}},[l,i,r]);h.useEffect(()=>{c(m.curPhase)},[m.curPhase]);function w(){i<l.length-1&&d(i+1)}function b(){i>=l.length-1&&d(0),p(!0)}function k(){p(!1)}function $(){p(!1),d(0)}const g=r.pattern,z=r.text,F=Math.max(g.length*(ee+We)+40,360),M=110,y=20,C=20;function T(q){return y+q*(ee+We)}function v(q){const D=["kmp-cell"];return m.curPhase==="pi"&&(m.piI===q?D.push("kmp-i"):m.piK===q&&D.push("kmp-k")),D.join(" ")}const I=16,j=Math.max(z.length,g.length),x=Math.max(j*(ee+We)+2*I,420),N=170,E=28,A=92;function R(q){return I+q*(ee+We)}function S(q){return I+(m.alignStart+q)*(ee+We)}function P(q){const D=["kmp-cell"];for(const _ of m.foundAt)if(q>=_&&q<_+g.length)return D.push("kmp-found"),D.join(" ");return m.curPhase==="scan"&&m.scanI===q&&(m.cellState==="match"?D.push("kmp-match"):m.cellState==="mismatch"?D.push("kmp-mismatch"):D.push("kmp-t-i")),D.join(" ")}function L(q){const D=["kmp-cell"];return m.curPhase==="scan"&&m.scanJ===q?m.cellState==="match"?D.push("kmp-match"):m.cellState==="mismatch"?D.push("kmp-mismatch"):D.push("kmp-p-j"):m.curPhase==="scan"&&q<=m.matchedUntil-m.alignStart&&D.push("kmp-match"),D.join(" ")}const B=l.length===0?0:Math.round((i+1)/l.length*100);return e.jsxs("div",{className:"kmp-root",children:[e.jsx("style",{children:Kn}),e.jsxs("div",{className:"kmp-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"kmp-title",children:"KMP String Search"}),e.jsx("div",{className:"kmp-sub",children:"Knuth-Morris-Pratt — failure function π, then text scan with O(n+m) shifts"})]}),e.jsx("div",{className:"kmp-head-right",children:e.jsx("button",{className:"kmp-btn kmp-danger",onClick:$,children:"Reset"})})]}),e.jsxs("div",{className:"kmp-bar",children:[e.jsx("label",{className:"kmp-quick",children:"Text:"}),e.jsx("input",{className:"kmp-input",value:a,onChange:q=>t(q.target.value)}),e.jsx("label",{className:"kmp-quick",children:"Pattern:"}),e.jsx("input",{className:"kmp-input kmp-pat",value:s,onChange:q=>o(q.target.value)}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"kmp-btn",onClick:w,disabled:i>=l.length-1,children:"Next"}),f?e.jsx("button",{className:"kmp-btn kmp-ghost",onClick:k,children:"Pause"}):e.jsx("button",{className:"kmp-btn kmp-ghost",onClick:b,children:"Play"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"kmp-quick",children:"Phase:"}),e.jsx("span",{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontSize:12,color:n==="pi"?"#ffd24a":"#4a9f6f"},children:n==="pi"?"build π":"scan"})]}),e.jsxs("div",{className:"kmp-canvas-wrap",children:[e.jsx("div",{className:"kmp-section-label",children:"Pattern & failure function π"}),e.jsxs("svg",{width:F,height:M,viewBox:`0 0 ${F} ${M}`,children:[e.jsx("text",{x:4,y:C+ae/2+4,className:"kmp-label",children:"pat"}),e.jsx("g",{transform:"translate(28, 0)",children:g.split("").map((q,D)=>e.jsxs("g",{className:v(D),children:[e.jsx("rect",{x:T(D),y:C,width:ee,height:ae,rx:5,ry:5}),e.jsx("text",{className:"val",x:T(D)+ee/2,y:C+ae/2,children:q}),e.jsx("text",{className:"idx",x:T(D)+ee/2,y:C+ae+12,children:D}),e.jsx("text",{className:"pi",x:T(D)+ee/2,y:C+ae+28,children:m.pi[D]===null?"·":m.pi[D]})]},D))})]}),e.jsx("div",{className:"kmp-section-label",children:"Text scan (pattern aligned under text)"}),e.jsxs("svg",{width:x,height:N,viewBox:`0 0 ${x} ${N}`,children:[e.jsx("text",{x:4,y:E+ae/2+4,className:"kmp-label",children:"txt"}),e.jsx("g",{children:z.split("").map((q,D)=>e.jsxs("g",{className:P(D),children:[e.jsx("rect",{x:R(D),y:E,width:ee,height:ae,rx:5,ry:5}),e.jsx("text",{className:"val",x:R(D)+ee/2,y:E+ae/2,children:q}),e.jsx("text",{className:"idx",x:R(D)+ee/2,y:E+ae+12,children:D})]},`t${D}`))}),e.jsx("text",{x:4,y:A+ae/2+4,className:"kmp-label",children:"pat"}),e.jsx("g",{children:g.split("").map((q,D)=>{const _=S(D);return _<I-ee||_>x?null:e.jsxs("g",{className:L(D),children:[e.jsx("rect",{x:_,y:A,width:ee,height:ae,rx:5,ry:5}),e.jsx("text",{className:"val",x:_+ee/2,y:A+ae/2,children:q}),e.jsx("text",{className:"idx",x:_+ee/2,y:A+ae+12,children:D})]},`p${D}`)})})]})]}),e.jsxs("div",{className:"kmp-footer",children:[e.jsxs("div",{className:"kmp-status",children:["Status: ",m.status]}),e.jsxs("div",{className:"kmp-stats",children:["step=",e.jsx("b",{children:Math.min(i+1,l.length)}),"/",e.jsx("b",{children:l.length}),"  progress=",e.jsxs("b",{children:[B,"%"]}),"  matches=",e.jsx("b",{children:m.foundAt.length}),"  |T|=",e.jsx("b",{children:z.length})," |P|=",e.jsx("b",{children:g.length})]})]})]})}

export default Hn;
export { Hn as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Hn, {}));
  return () => root.unmount();
}
