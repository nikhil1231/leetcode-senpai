import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function rr(a,t){const s=a.length,o=t.length,n=[],c=[];for(let p=0;p<=s;p++)n.push(new Array(o+1).fill(0)),c.push(new Array(o+1).fill(null));const r=[];for(let p=0;p<=s;p++)n[p][0]=p,c[p][0]=p>0?"delete":null;for(let p=0;p<=o;p++)n[0][p]=p,c[0][p]=p>0?"insert":null;r.push({phase:"init",i:0,j:0,dp:le(n),opGrid:le(c),note:`Initialize borders. dp[i][0]=i (i deletions) and dp[0][j]=j (j insertions). m=${s}, n=${o}.`});for(let p=1;p<=s;p++)for(let u=1;u<=o;u++){const m=a[p-1],w=t[u-1];if(m===w)n[p][u]=n[p-1][u-1],c[p][u]="match";else{const b=n[p-1][u],k=n[p][u-1],$=n[p-1][u-1],g=Math.min(b,k,$);n[p][u]=1+g,g===$?c[p][u]="replace":g===b?c[p][u]="delete":c[p][u]="insert"}r.push({phase:"fill",i:p,j:u,dp:le(n),opGrid:le(c),op:c[p][u],note:m===w?`s1[${p-1}]='${m}' == s2[${u-1}]='${w}'. Free match: dp[${p}][${u}] = dp[${p-1}][${u-1}] = ${n[p][u]} (↖).`:`Mismatch s1[${p-1}]='${m}' vs s2[${u-1}]='${w}'. 1 + min(↑${n[p-1][u]} del, ←${n[p][u-1]} ins, ↖${n[p-1][u-1]} rep) = ${n[p][u]} (${lr(c[p][u])} ${c[p][u]}).`})}r.push({phase:"fill-done",i:s,j:o,dp:le(n),opGrid:le(c),note:`Fill complete. Distance = dp[${s}][${o}] = ${n[s][o]}. Trace back to recover the edit script.`});const l=new Set,i=[];let d=s,f=o;for(l.add(`${d},${f}`);d>0||f>0;){const p=c[d][f];p==="match"?(i.unshift({op:"match",at:d-1,ch:a[d-1]}),d--,f--):p==="replace"?(i.unshift({op:"replace",at:d-1,from:a[d-1],to:t[f-1]}),d--,f--):p==="delete"?(i.unshift({op:"delete",at:d-1,ch:a[d-1]}),d--):(i.unshift({op:"insert",at:f-1,ch:t[f-1]}),f--),l.add(`${d},${f}`),r.push({phase:"traceback",i:d,j:f,dp:le(n),opGrid:le(c),op:p,traceback:new Set(l),ops:i.slice(),note:cr(p,a,t,d,f)})}return r.push({phase:"done",i:0,j:0,dp:le(n),opGrid:le(c),traceback:new Set(l),ops:i,note:`Done. Distance = ${n[s][o]}. Edit script: ${i.length?i.map(dr).join("; "):"(no edits — strings equal)"}.`}),r}
function lr(a){return a==="match"||a==="replace"?"↖":a==="delete"?"↑":a==="insert"?"←":""}
function cr(a,t,s,o,n){return a==="match"?`Match '${t[o]}' at s1[${o}], s2[${n}]. Step ↖ to (${o}, ${n}). No edit.`:a==="replace"?`Replace s1[${o}]='${t[o]}' → '${s[n]}'. Step ↖ to (${o}, ${n}).`:a==="delete"?`Delete s1[${o}]='${t[o]}'. Step ↑ to (${o}, ${n}).`:a==="insert"?`Insert '${s[n]}' into s1. Step ← to (${o}, ${n}).`:"Traceback step."}
function dr(a){return a.op==="match"?`keep '${a.ch}'`:a.op==="replace"?`replace '${a.from}'→'${a.to}'`:a.op==="delete"?`delete '${a.ch}'`:a.op==="insert"?`insert '${a.ch}'`:""}
function le(a){return a.map(t=>t.slice())}
const pr=`
.edw-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.edw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.edw-title { font-weight: 600; font-size: 15px; }
.edw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.edw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.edw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 180px;
}
.edw-input:focus { outline: none; border-color: #4a7cff; }
.edw-btn {
  padding: 6px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.edw-btn:hover { background: #3b6ae8; }
.edw-btn.edw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.edw-btn.edw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.edw-btn.edw-danger { background: #c13c3c; }
.edw-btn.edw-danger:hover { background: #a73232; }
.edw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.edw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.edw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.edw-grid {
  display: inline-grid;
  gap: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.edw-cell {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a2f3e;
  background: #141925;
  font-size: 14px;
  color: #e6e6e6;
  position: relative;
  transition: background 220ms ease, color 220ms ease, border-color 220ms ease;
}
.edw-cell.edw-hdr {
  background: #1a1f2e;
  color: #8a93a8;
  font-weight: 600;
}
.edw-cell.edw-unfilled { color: #4a5365; }
.edw-cell.edw-filled { background: #1c2333; color: #cfd9ff; }
.edw-cell.edw-current { background: #1e2a44; border-color: #4a7cff; color: #fff; }
.edw-cell.edw-match { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.edw-cell.edw-trace { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; font-weight: 600; }
.edw-arrow {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 11px;
  color: #8a93a8;
}
.edw-cell.edw-current .edw-arrow,
.edw-cell.edw-match .edw-arrow,
.edw-cell.edw-trace .edw-arrow { color: inherit; }
.edw-script {
  margin-top: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: #e6e6e6;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.edw-op {
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #2a2f3e;
}
.edw-op.edw-match { background: rgba(74, 159, 111, 0.15); border-color: #4a9f6f; color: #cfe8d7; }
.edw-op.edw-replace { background: rgba(74, 124, 255, 0.15); border-color: #4a7cff; color: #cfd9ff; }
.edw-op.edw-insert { background: rgba(255, 210, 74, 0.12); border-color: #ffd24a; color: #ffd24a; }
.edw-op.edw-delete { background: rgba(255, 92, 92, 0.12); border-color: #ff5c5c; color: #ffb3b3; }
.edw-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #141925;
  border-top: 1px solid #2a2f3e;
  font-size: 13px;
  gap: 16px;
  flex-wrap: wrap;
}
.edw-status { color: #d1d5db; flex: 1; min-width: 0; }
.edw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.edw-stats b { color: #e6e6e6; }
`,Ds="kitten",Bs="sitting";
function ur(a){return a==="match"||a==="replace"?"↖":a==="delete"?"↑":a==="insert"?"←":""}
function fr(){const[a,t]=h.useState(Ds),[s,o]=h.useState(Bs),[n,c]=h.useState(Ds),[r,l]=h.useState(Bs),i=h.useMemo(()=>rr(a,s),[a,s]),[d,f]=h.useState(0),[p,u]=h.useState(!1),m=h.useRef(null);h.useEffect(()=>{f(0),u(!1)},[i]),h.useEffect(()=>{if(p){if(d>=i.length-1){u(!1);return}return m.current=setTimeout(()=>f(j=>Math.min(j+1,i.length-1)),420),()=>clearTimeout(m.current)}},[p,d,i.length]),h.useEffect(()=>()=>m.current&&clearTimeout(m.current),[]);const w=i[d]||i[0],b=d>=i.length-1,k=a.length,$=s.length,g=w.dp,z=w.opGrid,F=w.traceback||new Set,M=(j,x)=>w.phase==="init"?j===0||x===0:w.phase==="fill"?j===0||x===0||j<w.i||j===w.i&&x<w.j:!0;function y(){t(n),o(r)}function C(){f(0),u(!1)}function T(){u(!1),f(j=>Math.min(j+1,i.length-1))}function v(){u(!1),f(j=>Math.max(j-1,0))}const I=i[i.length-1];return e.jsxs("div",{className:"edw-root",children:[e.jsx("style",{children:pr}),e.jsx("div",{className:"edw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"edw-title",children:"Edit Distance (Levenshtein)"}),e.jsx("div",{className:"edw-sub",children:"Arrows tag the chosen op in each cell: ↖ match/replace, ↑ delete, ← insert."})]})}),e.jsxs("div",{className:"edw-bar",children:[e.jsx("span",{className:"edw-quick",children:"s1"}),e.jsx("input",{className:"edw-input",value:n,onChange:j=>c(j.target.value),onKeyDown:j=>{j.key==="Enter"&&y()}}),e.jsx("span",{className:"edw-quick",children:"s2"}),e.jsx("input",{className:"edw-input",value:r,onChange:j=>l(j.target.value),onKeyDown:j=>{j.key==="Enter"&&y()}}),e.jsx("button",{className:"edw-btn",onClick:y,children:"Apply"}),e.jsx("button",{className:"edw-btn edw-ghost",onClick:v,disabled:d===0,children:"◀ Back"}),e.jsx("button",{className:"edw-btn edw-ghost",onClick:T,disabled:b,children:"Step ▶"}),e.jsx("button",{className:"edw-btn",onClick:()=>u(j=>!j),disabled:b&&!p,children:p?"Pause":"Play"}),e.jsx("button",{className:"edw-btn edw-danger",onClick:C,children:"Reset"})]}),e.jsxs("div",{className:"edw-canvas-wrap",children:[e.jsxs("div",{className:"edw-grid",style:{gridTemplateColumns:`48px 48px repeat(${$}, 48px)`},children:[e.jsx("div",{className:"edw-cell edw-hdr"}),e.jsx("div",{className:"edw-cell edw-hdr",children:"∅"}),Array.from({length:$},(j,x)=>e.jsx("div",{className:"edw-cell edw-hdr",children:s[x]},"hc"+x)),Array.from({length:k+1},(j,x)=>e.jsxs(Oe.Fragment,{children:[e.jsx("div",{className:"edw-cell edw-hdr",children:x===0?"∅":a[x-1]}),Array.from({length:$+1},(N,E)=>{const A=M(x,E),R=["edw-cell"],S=w.phase==="fill"&&w.i===x&&w.j===E,P=S&&w.op==="match";F.has(`${x},${E}`)?R.push("edw-trace"):P?R.push("edw-match"):S?R.push("edw-current"):A?R.push("edw-filled"):R.push("edw-unfilled");const B=A?g[x][E]:"·",q=z&&z[x]?z[x][E]:null,D=A&&q?ur(q):null;return e.jsxs("div",{className:R.join(" "),children:[B,D&&e.jsx("span",{className:"edw-arrow",children:D})]},"c"+x+"_"+E)})]},"row"+x))]}),w.ops&&e.jsx("div",{className:"edw-script",children:w.ops.length===0?e.jsx("span",{style:{color:"#8a93a8",fontStyle:"italic"},children:"no edits yet"}):w.ops.map((j,x)=>{const N=["edw-op"];N.push("edw-"+j.op);let E="";return j.op==="match"?E=`keep '${j.ch}'`:j.op==="replace"?E=`replace '${j.from}'→'${j.to}'`:j.op==="delete"?E=`delete '${j.ch}'`:j.op==="insert"&&(E=`insert '${j.ch}'`),e.jsx("span",{className:N.join(" "),children:E},x)})})]}),e.jsxs("div",{className:"edw-footer",children:[e.jsxs("div",{className:"edw-status",children:["Status: ",w.note]}),e.jsxs("div",{className:"edw-stats",children:["step=",e.jsx("b",{children:d+1}),"/",e.jsx("b",{children:i.length}),"   |s1|=",e.jsx("b",{children:k}),"   |s2|=",e.jsx("b",{children:$}),"   distance=",e.jsx("b",{children:I.dp[k][$]})]})]})]})}

export default fr;
export { fr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(fr, {}));
  return () => root.unmount();
}
