import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ar(a,t){const s=a.length,o=t.length,n=[];for(let p=0;p<=s;p++)n.push(new Array(o+1).fill(0));const c=[];c.push({phase:"init",i:0,j:0,dp:ze(n),note:s===0||o===0?"One string is empty — LCS is empty.":`Initialize (m+1)×(n+1) table with border = 0. m=${s}, n=${o}.`});for(let p=1;p<=s;p++)for(let u=1;u<=o;u++){const m=a[p-1],w=t[u-1];let b;m===w?(n[p][u]=n[p-1][u-1]+1,b="diag"):n[p-1][u]>=n[p][u-1]?(n[p][u]=n[p-1][u],b="up"):(n[p][u]=n[p][u-1],b="left"),c.push({phase:"fill",i:p,j:u,dp:ze(n),pick:b,note:m===w?`s1[${p-1}]='${m}' == s2[${u-1}]='${w}'. dp[${p}][${u}] = dp[${p-1}][${u-1}] + 1 = ${n[p][u]}.`:`s1[${p-1}]='${m}' != s2[${u-1}]='${w}'. dp[${p}][${u}] = max(dp[${p-1}][${u}]=${n[p-1][u]}, dp[${p}][${u-1}]=${n[p][u-1]}) = ${n[p][u]} (${b==="up"?"↑ from above":"← from left"}).`})}c.push({phase:"fill-done",i:s,j:o,dp:ze(n),note:`Fill complete. LCS length = dp[${s}][${o}] = ${n[s][o]}. Trace back now from (${s}, ${o}) → (0, 0).`});const r=new Set,l=[];let i=s,d=o;for(r.add(`${i},${d}`);i>0&&d>0;){const p=a[i-1],u=t[d-1];p===u?(l.push(p),i--,d--,r.add(`${i},${d}`),c.push({phase:"traceback",i,j:d,dp:ze(n),pick:"diag",traceback:new Set(r),result:l.slice().reverse().join(""),note:`Match at s1[${i}]='${p}', s2[${d}]='${u}'. Take '${p}' into LCS. Move ↖ diag to (${i}, ${d}).`})):n[i-1][d]>=n[i][d-1]?(i--,r.add(`${i},${d}`),c.push({phase:"traceback",i,j:d,dp:ze(n),pick:"up",traceback:new Set(r),result:l.slice().reverse().join(""),note:`No match. dp above ≥ dp left → move ↑ to (${i}, ${d}).`})):(d--,r.add(`${i},${d}`),c.push({phase:"traceback",i,j:d,dp:ze(n),pick:"left",traceback:new Set(r),result:l.slice().reverse().join(""),note:`No match. dp left > dp above → move ← to (${i}, ${d}).`}))}const f=l.slice().reverse().join("");return c.push({phase:"done",i,j:d,dp:ze(n),traceback:new Set(r),result:f,note:s===0||o===0?"Done. LCS = '' (empty).":`Done. LCS = '${f}' (length ${f.length}).`}),c}
function ze(a){return a.map(t=>t.slice())}
const or=`
.lcsw-root {
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
.lcsw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.lcsw-title { font-weight: 600; font-size: 15px; }
.lcsw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.lcsw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.lcsw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 200px;
}
.lcsw-input:focus { outline: none; border-color: #4a7cff; }
.lcsw-btn {
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
.lcsw-btn:hover { background: #3b6ae8; }
.lcsw-btn.lcsw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.lcsw-btn.lcsw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.lcsw-btn.lcsw-danger { background: #c13c3c; }
.lcsw-btn.lcsw-danger:hover { background: #a73232; }
.lcsw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.lcsw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.lcsw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.lcsw-grid {
  display: inline-grid;
  gap: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lcsw-cell {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a2f3e;
  background: #141925;
  font-size: 13px;
  color: #e6e6e6;
  position: relative;
  transition: background 220ms ease, color 220ms ease, border-color 220ms ease;
}
.lcsw-cell.lcsw-hdr {
  background: #1a1f2e;
  color: #8a93a8;
  font-weight: 600;
}
.lcsw-cell.lcsw-unfilled { color: #4a5365; }
.lcsw-cell.lcsw-filled { background: #1c2333; color: #cfd9ff; }
.lcsw-cell.lcsw-current { background: #1e2a44; border-color: #4a7cff; color: #fff; }
.lcsw-cell.lcsw-match { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.lcsw-cell.lcsw-trace { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; font-weight: 600; }
.lcsw-arrow {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 10px;
  color: #8a93a8;
}
.lcsw-result {
  margin-top: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: #ffd24a;
}
.lcsw-footer {
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
.lcsw-status { color: #d1d5db; flex: 1; min-width: 0; }
.lcsw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.lcsw-stats b { color: #e6e6e6; }
`,qs="ABCBDAB",Ls="BDCAB";
function ir(){const[a,t]=h.useState(qs),[s,o]=h.useState(Ls),[n,c]=h.useState(qs),[r,l]=h.useState(Ls),i=h.useMemo(()=>ar(a,s),[a,s]),[d,f]=h.useState(0),[p,u]=h.useState(!1),m=h.useRef(null);h.useEffect(()=>{f(0),u(!1)},[i]),h.useEffect(()=>{if(p){if(d>=i.length-1){u(!1);return}return m.current=setTimeout(()=>f(v=>Math.min(v+1,i.length-1)),420),()=>clearTimeout(m.current)}},[p,d,i.length]),h.useEffect(()=>()=>m.current&&clearTimeout(m.current),[]);const w=i[d]||i[0],b=d>=i.length-1;function k(){t(n),o(r)}function $(){f(0),u(!1)}function g(){u(!1),f(v=>Math.min(v+1,i.length-1))}function z(){u(!1),f(v=>Math.max(v-1,0))}const F=a.length,M=s.length,y=w.dp,C=w.traceback||new Set,T=(v,I)=>w.phase==="init"?!1:w.phase==="fill"?v===0||I===0||v<w.i||v===w.i&&I<w.j:!0;return e.jsxs("div",{className:"lcsw-root",children:[e.jsx("style",{children:or}),e.jsx("div",{className:"lcsw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"lcsw-title",children:"Longest Common Subsequence"}),e.jsx("div",{className:"lcsw-sub",children:"2D DP over (|s1|+1)×(|s2|+1). Diagonal on match, else max(top, left). Traceback in amber."})]})}),e.jsxs("div",{className:"lcsw-bar",children:[e.jsx("span",{className:"lcsw-quick",children:"s1"}),e.jsx("input",{className:"lcsw-input",value:n,onChange:v=>c(v.target.value),onKeyDown:v=>{v.key==="Enter"&&k()}}),e.jsx("span",{className:"lcsw-quick",children:"s2"}),e.jsx("input",{className:"lcsw-input",value:r,onChange:v=>l(v.target.value),onKeyDown:v=>{v.key==="Enter"&&k()}}),e.jsx("button",{className:"lcsw-btn",onClick:k,children:"Apply"}),e.jsx("button",{className:"lcsw-btn lcsw-ghost",onClick:z,disabled:d===0,children:"◀ Back"}),e.jsx("button",{className:"lcsw-btn lcsw-ghost",onClick:g,disabled:b,children:"Step ▶"}),e.jsx("button",{className:"lcsw-btn",onClick:()=>u(v=>!v),disabled:b&&!p,children:p?"Pause":"Play"}),e.jsx("button",{className:"lcsw-btn lcsw-danger",onClick:$,children:"Reset"})]}),e.jsxs("div",{className:"lcsw-canvas-wrap",children:[e.jsxs("div",{className:"lcsw-grid",style:{gridTemplateColumns:`40px 40px repeat(${M}, 40px)`},children:[e.jsx("div",{className:"lcsw-cell lcsw-hdr"}),e.jsx("div",{className:"lcsw-cell lcsw-hdr",children:"∅"}),Array.from({length:M},(v,I)=>e.jsx("div",{className:"lcsw-cell lcsw-hdr",children:s[I]},"hc"+I)),Array.from({length:F+1},(v,I)=>e.jsxs(Oe.Fragment,{children:[e.jsx("div",{className:"lcsw-cell lcsw-hdr",children:I===0?"∅":a[I-1]}),Array.from({length:M+1},(j,x)=>{var B,q,D;const N=T(I,x),E=["lcsw-cell"],A=w.phase==="fill"&&w.i===I&&w.j===x,R=A&&w.pick==="diag",S=C.has(`${I},${x}`);S?E.push("lcsw-trace"):R?E.push("lcsw-match"):A?E.push("lcsw-current"):N?E.push("lcsw-filled"):E.push("lcsw-unfilled");const P=N?y[I][x]:"·",L=(A||S)&&I>0&&x>0?w.pick==="diag"||S&&y[I][x]!==((B=y[I-1])==null?void 0:B[x])&&y[I][x]!==((q=y[I])==null?void 0:q[x-1])?"↖":w.pick==="up"||S&&y[I][x]===((D=y[I-1])==null?void 0:D[x])?"↑":"←":null;return e.jsxs("div",{className:E.join(" "),children:[P,L&&e.jsx("span",{className:"lcsw-arrow",children:L})]},"c"+I+"_"+x)})]},"row"+I))]}),w.result!==void 0&&e.jsxs("div",{className:"lcsw-result",children:["LCS so far: '",e.jsx("b",{children:w.result}),"' (length ",w.result.length,")"]})]}),e.jsxs("div",{className:"lcsw-footer",children:[e.jsxs("div",{className:"lcsw-status",children:["Status: ",w.note]}),e.jsxs("div",{className:"lcsw-stats",children:["step=",e.jsx("b",{children:d+1}),"/",e.jsx("b",{children:i.length}),"   |s1|=",e.jsx("b",{children:F}),"   |s2|=",e.jsx("b",{children:M}),"   dp[m][n]=",e.jsx("b",{children:y[F][M]})]})]})]})}

export default ir;
export { ir as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ir, {}));
  return () => root.unmount();
}
