import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Br=[[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],[8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],[0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]];
function as(a){return a.map(t=>t.slice())}
function _r(a){const t=[];for(let s=0;s<9;s++)for(let o=0;o<9;o++)a[s][o]!==0&&t.push(s*9+o);return new Set(t)}
function un(a,t,s){if(a[t][s]!==0)return[];const o=new Uint8Array(10);for(let l=0;l<9;l++)o[a[t][l]]=1,o[a[l][s]]=1;const n=Math.floor(t/3)*3,c=Math.floor(s/3)*3;for(let l=0;l<3;l++)for(let i=0;i<3;i++)o[a[n+l][c+i]]=1;const r=[];for(let l=1;l<=9;l++)o[l]||r.push(l);return r}
function Js(a){let t=null;for(let s=0;s<9;s++)for(let o=0;o<9;o++)if(a[s][o]===0){const n=un(a,s,o);if((t==null||n.length<t.cands.length)&&(t={r:s,c:o,cands:n},n.length<=1))return t}return t}
function*Or(a){const t=as(a);let s=0,o=0;function n(i){return{board:as(t),fills:s,backtracks:o,...i}}yield n({kind:"start",cell:null,digit:null,candidates:null,note:"Starting Sudoku solver (backtracking with MRV)."});const c=[];function r(){const i=Js(t);return i==null?null:(c.push({r:i.r,c:i.c,cands:i.cands,idx:0}),i)}let l=r();if(l==null){yield n({kind:"done",cell:null,digit:null,candidates:null,note:"Puzzle already solved."});return}for(yield n({kind:"pick",cell:{r:l.r,c:l.c},digit:null,candidates:l.cands.slice(),note:`Pick cell (r${l.r}, c${l.c}) — ${l.cands.length} candidate(s): {${l.cands.join(", ")}}.`});c.length>0;){const i=c[c.length-1];if(i.idx>=i.cands.length){if(o++,t[i.r][i.c]=0,s=Math.max(0,s-1),c.pop(),yield n({kind:"backtrack",cell:{r:i.r,c:i.c},digit:null,candidates:null,note:`Dead end at (r${i.r}, c${i.c}). Clear and backtrack.`}),c.length===0){yield n({kind:"fail",cell:null,digit:null,candidates:null,note:"No solution exists for this puzzle."});return}continue}const d=i.cands[i.idx];if(i.idx++,!un(t,i.r,i.c).includes(d)){yield n({kind:"conflict",cell:{r:i.r,c:i.c},digit:d,candidates:null,note:`Try ${d} at (r${i.r}, c${i.c}) — conflicts with row/col/box. Skip.`});continue}yield n({kind:"try",cell:{r:i.r,c:i.c},digit:d,candidates:null,note:`Try ${d} at (r${i.r}, c${i.c}).`}),t[i.r][i.c]=d,s++,yield n({kind:"place",cell:{r:i.r,c:i.c},digit:d,candidates:null,note:`Place ${d} at (r${i.r}, c${i.c}). Recurse.`});const p=Js(t);if(p==null){yield n({kind:"done",cell:null,digit:null,candidates:null,note:`Solved! ${s} cells filled, ${o} backtracks.`});return}c.push({r:p.r,c:p.c,cands:p.cands,idx:0}),yield n({kind:"pick",cell:{r:p.r,c:p.c},digit:null,candidates:p.cands.slice(),note:`Pick cell (r${p.r}, c${p.c}) — ${p.cands.length} candidate(s): {${p.cands.join(", ")}}.`})}}
const Wr=`
.sdw-root {
  display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6;
  font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden;
}
.sdw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.sdw-title { font-weight: 600; font-size: 15px; }
.sdw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.sdw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925;
  border-bottom: 1px solid #2a2f3e; flex-wrap: wrap;
}
.sdw-btn {
  padding: 6px 12px; background: #4a7cff; border: none;
  border-radius: 6px; color: white; font-weight: 500; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.sdw-btn:hover { background: #3b6ae8; }
.sdw-btn.sdw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.sdw-btn.sdw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.sdw-btn.sdw-danger { background: #c13c3c; }
.sdw-btn.sdw-danger:hover { background: #a73232; }
.sdw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sdw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sdw-input:focus { outline: none; border-color: #4a7cff; }
.sdw-lbl { color: #8a93a8; font-size: 12px; }

.sdw-body {
  flex: 1; display: flex; min-height: 0;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
}
.sdw-canvas-wrap {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 20px; min-width: 0; overflow: auto;
}
.sdw-side {
  width: 220px; padding: 14px 16px;
  border-left: 1px solid #2a2f3e; overflow: auto;
}
.sdw-side h4 {
  margin: 0 0 8px 0; font-size: 12px; color: #8a93a8;
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}
.sdw-candidates {
  display: flex; flex-wrap: wrap; gap: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 16px;
}
.sdw-cand {
  padding: 2px 7px; background: #141925; border: 1px solid #2a2f3e;
  border-radius: 4px; font-size: 12px; color: #d1d5db;
}
.sdw-cand.sdw-cand-active { border-color: #ffd24a; color: #ffd24a; }

.sdw-grid { border: 2px solid #4a5f8f; border-radius: 2px; }

.sdw-cell-bg {
  fill: #141925;
  transition: fill 180ms ease, stroke 180ms ease;
}
.sdw-cell-bg.sdw-cell-alt { fill: #1a2030; }
.sdw-cell-bg.sdw-cell-pick {
  fill: #2a3550; stroke: #ffd24a; stroke-width: 2;
}
.sdw-cell-bg.sdw-cell-place {
  fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 2;
}
.sdw-cell-bg.sdw-cell-conflict {
  fill: #5a2020; stroke: #ff5c5c; stroke-width: 2;
  animation: sdw-flash 400ms ease-out;
}
@keyframes sdw-flash {
  0%   { fill: #ff5c5c; }
  100% { fill: #5a2020; }
}

.sdw-thick { stroke: #4a5f8f; stroke-width: 2; }
.sdw-thin  { stroke: #2a2f3e; stroke-width: 1; }

.sdw-digit {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: central;
  pointer-events: none; user-select: none;
}
.sdw-digit.sdw-given   { fill: #e6e6e6; font-weight: 700; }
.sdw-digit.sdw-solved  { fill: #8abff0; font-weight: 500; }
.sdw-digit.sdw-trying  { fill: #ffd24a; font-weight: 700; opacity: 0.85; }

.sdw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.sdw-status { color: #d1d5db; flex: 1; min-width: 0; }
.sdw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.sdw-stats b { color: #e6e6e6; }
.sdw-stats .sdw-good { color: #4a9f6f; }
.sdw-stats .sdw-bad { color: #ff5c5c; }
`,oe=46,mt=oe*9,se=12;
function Ur(){const[a]=h.useState(()=>as(Br)),t=h.useMemo(()=>_r(a),[a]),s=h.useRef(null),o=h.useRef([]),n=h.useRef(!1),[c,r]=h.useState(0),[,l]=h.useState(0),[i,d]=h.useState(!1),[f,p]=h.useState(80),u=h.useRef(null);h.useEffect(()=>{m()},[]);function m(){s.current=Or(a),o.current=[],n.current=!1,w(0),r(0),d(!1),l(j=>j+1)}function w(j){for(;o.current.length<=j&&!n.current;){const x=s.current.next();if(x.done){n.current=!0;break}o.current.push(x.value)}return o.current.length>j}function b(j=1){let x=c;for(let N=0;N<j&&w(x+1);N++)x++;r(x),l(N=>N+1)}function k(){d(!1),b(1)}function $(){d(!1);const j=5e5;let x=0;for(;!n.current&&x<j;){const N=s.current.next();if(N.done){n.current=!0;break}o.current.push(N.value),x++}r(o.current.length-1),l(N=>N+1)}h.useEffect(()=>{if(i)return u.current=setTimeout(()=>{if(!w(c+1)){d(!1);return}r(j=>j+1)},f),()=>clearTimeout(u.current)},[i,c,f]);const g=o.current[c]||{kind:"idle",board:a,cell:null,digit:null,candidates:null,fills:0,backtracks:0,note:"Ready. Click Step or Play to begin."},z=g.board,F=n.current&&c>=o.current.length-1,M=g.kind==="done",y=mt+se*2,C=mt+se*2;function T(j,x){const N=(Math.floor(j/3)+Math.floor(x/3))%2===1?" sdw-cell-alt":"";if(g.cell&&g.cell.r===j&&g.cell.c===x){if(g.kind==="conflict")return"sdw-cell-bg sdw-cell-conflict";if(g.kind==="place"||g.kind==="try")return"sdw-cell-bg sdw-cell-place";if(g.kind==="pick")return"sdw-cell-bg sdw-cell-pick"}return"sdw-cell-bg"+N}function v(j,x){const N=z[j][x],E=t.has(j*9+x),A=g.cell&&g.cell.r===j&&g.cell.c===x;return(g.kind==="try"||g.kind==="conflict")&&A&&g.digit!=null&&N===0?{value:g.digit,cls:"sdw-digit sdw-trying"}:N===0?null:{value:N,cls:"sdw-digit "+(E?"sdw-given":"sdw-solved")}}const I=h.useMemo(()=>{let j=0;for(let x=0;x<9;x++)for(let N=0;N<9;N++)z[x][N]===0&&j++;return j},[z]);return e.jsxs("div",{className:"sdw-root",children:[e.jsx("style",{children:Wr}),e.jsx("div",{className:"sdw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"sdw-title",children:"Sudoku Solver"}),e.jsx("div",{className:"sdw-sub",children:"Backtracking with MRV: pick the empty cell with the fewest legal digits."})]})}),e.jsxs("div",{className:"sdw-bar",children:[e.jsx("button",{className:"sdw-btn",onClick:k,disabled:F,children:"Step"}),e.jsx("button",{className:"sdw-btn sdw-ghost",onClick:()=>d(j=>!j),disabled:F,children:i?"Pause":"Play"}),e.jsx("button",{className:"sdw-btn sdw-ghost",onClick:$,disabled:F,children:"Skip"}),e.jsx("button",{className:"sdw-btn sdw-danger",onClick:m,children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"sdw-lbl",children:"speed"}),e.jsxs("select",{className:"sdw-input",value:f,onChange:j=>p(Number(j.target.value)),children:[e.jsx("option",{value:400,children:"slow"}),e.jsx("option",{value:160,children:"med"}),e.jsx("option",{value:80,children:"fast"}),e.jsx("option",{value:20,children:"turbo"})]})]}),e.jsxs("div",{className:"sdw-body",children:[e.jsx("div",{className:"sdw-canvas-wrap",children:e.jsxs("svg",{className:"sdw-grid",width:y,height:C,viewBox:`0 0 ${y} ${C}`,children:[e.jsx("rect",{x:0,y:0,width:y,height:C,fill:"#0f1419"}),Array.from({length:9},(j,x)=>Array.from({length:9},(N,E)=>e.jsx("rect",{className:T(x,E),x:se+E*oe,y:se+x*oe,width:oe,height:oe},`bg-${x}-${E}`))),Array.from({length:10},(j,x)=>e.jsx("line",{className:x%3===0?"sdw-thick":"sdw-thin",x1:se,y1:se+x*oe,x2:se+mt,y2:se+x*oe},"hl-"+x)),Array.from({length:10},(j,x)=>e.jsx("line",{className:x%3===0?"sdw-thick":"sdw-thin",x1:se+x*oe,y1:se,x2:se+x*oe,y2:se+mt},"vl-"+x)),Array.from({length:9},(j,x)=>Array.from({length:9},(N,E)=>{const A=v(x,E);return A?e.jsx("text",{className:A.cls,x:se+E*oe+oe/2,y:se+x*oe+oe/2+1,style:{fontSize:22},children:A.value},`d-${x}-${E}`):null}))]})}),e.jsxs("div",{className:"sdw-side",children:[e.jsx("h4",{children:"Current cell"}),e.jsx("div",{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontSize:13,marginBottom:12,color:"#d1d5db"},children:g.cell?`(r${g.cell.r}, c${g.cell.c})`:e.jsx("span",{style:{color:"#6a7389"},children:"none"})}),e.jsx("h4",{children:"Candidates"}),e.jsx("div",{className:"sdw-candidates",children:g.candidates&&g.candidates.length>0?g.candidates.map(j=>e.jsx("div",{className:"sdw-cand"+(g.digit===j?" sdw-cand-active":""),children:j},j)):e.jsx("div",{style:{color:"#6a7389",fontSize:12},children:"—"})}),e.jsx("h4",{children:"Attempted"}),e.jsx("div",{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontSize:20,color:g.kind==="conflict"?"#ff5c5c":"#ffd24a",marginBottom:12},children:g.digit!=null?g.digit:e.jsx("span",{style:{color:"#6a7389",fontSize:13},children:"—"})})]})]}),e.jsxs("div",{className:"sdw-footer",children:[e.jsxs("div",{className:"sdw-status",children:["Status: ",g.note]}),e.jsxs("div",{className:"sdw-stats",children:["step=",e.jsx("b",{children:c+1}),"   filled=",e.jsx("b",{className:M?"sdw-good":"",children:g.fills}),"   empty=",e.jsx("b",{children:I}),"   backtracks=",e.jsx("b",{className:"sdw-bad",children:g.backtracks})]})]})]})}

export default Ur;
export { Ur as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ur, {}));
  return () => root.unmount();
}
