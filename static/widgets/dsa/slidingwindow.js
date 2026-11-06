import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function In(a){const t=[],s=new Map;let o=0,n=0,c=0,r=0;for(let l=0;l<a.length;l++){const i=a[l];if(s.has(i)&&s.get(i)>=o){const f=s.get(i);t.push({kind:"dupe",left:o,right:l,ch:i,prior:f,note:`'${i}' already in window at index ${f}. Must shrink from the left.`}),o=f+1,t.push({kind:"shrink",left:o,right:l,note:`Jump left → ${o} (past duplicate).`})}else t.push({kind:"expand",left:o,right:l,ch:i,note:`Extend window to include '${i}' at index ${l}.`});s.set(i,l);const d=l-o+1;d>n&&(n=d,c=o,r=l,t.push({kind:"accept",left:o,right:l,best:{length:n,start:c,end:r},note:`New best: "${a.slice(o,l+1)}" (length ${n}).`}))}return t.push({kind:"done",note:`Done. Longest unique substring is "${a.slice(c,r+1)}" of length ${n}.`}),{s:a,steps:t,best:{length:n,start:c,end:r,substring:a.slice(c,r+1)}}}
const An=`
.slw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.slw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.slw-title { font-weight: 600; font-size: 15px; }
.slw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.slw-head-right { display: flex; gap: 8px; align-items: center; }
.slw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925; border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.slw-input {
  padding: 6px 10px; background: #0f1419;
  border: 1px solid #2a2f3e; border-radius: 6px; color: #e6e6e6;
  font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 280px;
}
.slw-input:focus { outline: none; border-color: #4a7cff; }
.slw-btn {
  padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit;
}
.slw-btn:hover { background: #3b6ae8; }
.slw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.slw-btn.slw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.slw-btn.slw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.slw-btn.slw-danger { background: #c13c3c; }
.slw-btn.slw-danger:hover { background: #a73232; }
.slw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.slw-canvas-wrap {
  flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
}
.slw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.slw-status { color: #d1d5db; flex: 1; min-width: 0; }
.slw-stats {
  color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.slw-stats b { color: #e6e6e6; }

.slw-cell rect {
  fill: #1f2a3a; stroke: #3a4560; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease;
}
.slw-cell text.val {
  fill: #e6e6e6; font-size: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.slw-cell text.idx {
  fill: #6a7389; font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.slw-cell.in-window rect { fill: #2a3550; stroke: #4a7cff; }
.slw-cell.is-dupe rect {
  fill: #3a1a1a; stroke: #c13c3c;
  animation: slw-shake 400ms ease-in-out;
}
.slw-cell.is-best rect { fill: #1f3a2e; stroke: #4a9f6f; }
@keyframes slw-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
.slw-window-bracket {
  fill: none; stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 6px rgba(255, 210, 74, 0.5));
  transition: all 300ms ease;
}
.slw-panel {
  display: flex; gap: 24px; color: #d1d5db;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.slw-panel-box {
  padding: 8px 14px; background: #141925; border: 1px solid #2a2f3e;
  border-radius: 6px; min-width: 180px;
}
.slw-panel-label { color: #8a93a8; font-size: 11px; margin-bottom: 4px; }
.slw-set-item {
  display: inline-block; padding: 2px 8px; margin: 2px 2px;
  background: #2a3550; border: 1px solid #4a7cff; border-radius: 4px;
  color: #e6e6e6;
}
`,Tn=["abcabcbb","bbbbb","pwwkew","dvdf","abcdefgh","tmmzuxt"],ve=40,at=48,ot=4;
function Pn(){const[a,t]=h.useState("abcabcbb"),s=h.useMemo(()=>In(a||""),[a]),[o,n]=h.useState(0),[c,r]=h.useState(!1),l=h.useRef(null);h.useEffect(()=>n(0),[s]),h.useEffect(()=>{if(c){if(o>=s.steps.length-1){r(!1);return}return l.current=setTimeout(()=>n(C=>C+1),600),()=>clearTimeout(l.current)}},[c,o,s]),h.useEffect(()=>()=>clearTimeout(l.current),[]);const i=h.useMemo(()=>{let C=0,T=-1,v="Ready. Step through to see the window slide.",I={length:0,start:0,end:-1},j=null;for(let x=0;x<=o&&x<s.steps.length;x++){const N=s.steps[x];N.left!==void 0&&(C=N.left),N.right!==void 0&&(T=N.right),N.kind==="accept"&&(I=N.best),N.kind==="dupe"?j={ch:N.ch,at:N.right,prior:N.prior}:j=null,N.note&&(v=N.note)}return{left:C,right:T,status:v,best:I,dupeCh:j}},[s,o]),d=h.useMemo(()=>{if(i.right<i.left)return[];const C=[];for(let T=i.left;T<=i.right;T++)C.push(s.s[T]);return C},[i,s]);function f(){o<s.steps.length-1&&n(o+1)}function p(){o>=s.steps.length-1&&n(0),r(!0)}function u(){r(!1)}function m(){r(!1),n(0)}const w=s.s.length,b=Math.max(w*(ve+ot)+40,400),k=140,$=(b-(w*(ve+ot)-ot))/2,g=40;function z(C){return $+C*(ve+ot)}function F(C){const T=["slw-cell"],v=C>=i.best.start&&C<=i.best.end&&i.best.length>0,I=C>=i.left&&C<=i.right;return i.dupeCh&&(C===i.dupeCh.at||C===i.dupeCh.prior)?T.push("is-dupe"):I?T.push("in-window"):v&&T.push("is-best"),T.join(" ")}let M=null;if(i.right>=i.left&&i.left<w){const C=z(i.left)-3,T=z(i.right)+ve+3,v=g-6,I=g+at+6;M=`M ${C} ${I} L ${C} ${v} L ${T} ${v} L ${T} ${I}`}const y=s.steps.length===0?0:Math.round((o+1)/s.steps.length*100);return e.jsxs("div",{className:"slw-root",children:[e.jsx("style",{children:An}),e.jsxs("div",{className:"slw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"slw-title",children:"Sliding Window — Longest Unique Substring"}),e.jsx("div",{className:"slw-sub",children:"LeetCode 3 classic — expand right, shrink left when a duplicate enters the window"})]}),e.jsx("div",{className:"slw-head-right",children:e.jsx("button",{className:"slw-btn slw-danger",onClick:m,children:"Reset"})})]}),e.jsxs("div",{className:"slw-bar",children:[e.jsx("label",{className:"slw-quick",children:"Input:"}),e.jsx("input",{className:"slw-input",value:a,onChange:C=>t(C.target.value),placeholder:"abcabcbb"}),e.jsx("button",{className:"slw-btn",onClick:f,disabled:o>=s.steps.length-1,children:"Next"}),c?e.jsx("button",{className:"slw-btn slw-ghost",onClick:u,children:"Pause"}):e.jsx("button",{className:"slw-btn slw-ghost",onClick:p,children:"Play"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"slw-quick",children:"Seeds:"}),Tn.map(C=>e.jsx("button",{className:"slw-btn slw-ghost",onClick:()=>t(C),children:C},C))]}),e.jsxs("div",{className:"slw-canvas-wrap",children:[e.jsxs("svg",{width:b,height:k,viewBox:`0 0 ${b} ${k}`,children:[e.jsx("g",{children:s.s.split("").map((C,T)=>e.jsxs("g",{className:F(T),children:[e.jsx("rect",{x:z(T),y:g,width:ve,height:at,rx:6,ry:6}),e.jsx("text",{className:"val",x:z(T)+ve/2,y:g+at/2,children:C}),e.jsx("text",{className:"idx",x:z(T)+ve/2,y:g+at+16,children:T})]},T))}),M&&e.jsx("path",{d:M,className:"slw-window-bracket"})]}),e.jsxs("div",{className:"slw-panel",children:[e.jsxs("div",{className:"slw-panel-box",children:[e.jsx("div",{className:"slw-panel-label",children:"window chars"}),e.jsx("div",{children:d.length===0?e.jsx("span",{style:{color:"#6a7389"},children:"(empty)"}):d.map((C,T)=>e.jsx("span",{className:"slw-set-item",children:C},T))})]}),e.jsxs("div",{className:"slw-panel-box",children:[e.jsx("div",{className:"slw-panel-label",children:"best so far"}),e.jsx("div",{style:{color:"#e6e6e6"},children:i.best.length===0?e.jsx("span",{style:{color:"#6a7389"},children:"(none yet)"}):e.jsxs(e.Fragment,{children:['"',s.s.slice(i.best.start,i.best.end+1),'"   len=',i.best.length]})})]})]})]}),e.jsxs("div",{className:"slw-footer",children:[e.jsxs("div",{className:"slw-status",children:["Status: ",i.status]}),e.jsxs("div",{className:"slw-stats",children:["step=",e.jsx("b",{children:Math.min(o+1,s.steps.length)}),"/",e.jsx("b",{children:s.steps.length}),"  L=",e.jsx("b",{children:i.left})," R=",e.jsx("b",{children:i.right}),"  len=",e.jsx("b",{children:Math.max(0,i.right-i.left+1)}),"  progress=",e.jsxs("b",{children:[y,"%"]})]})]})]})}

export default Pn;
export { Pn as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Pn, {}));
  return () => root.unmount();
}
