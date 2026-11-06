import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function br(a){const t=a.length-1,s=[],o=[];for(let r=0;r<=t+1;r++)s.push(new Array(t+2).fill(0)),o.push(new Array(t+2).fill(0));const n=[];n.push({phase:"init",i:0,j:0,L:1,dp:ce(s),split:ce(o),note:t<1?"Need at least one matrix.":`Initialize: dp[i][i] = 0 (single matrix, nothing to multiply). ${t} matrices, dims = [${a.join(", ")}].`});for(let r=2;r<=t;r++)for(let l=1;l<=t-r+1;l++){const i=l+r-1;s[l][i]=1/0,n.push({phase:"enter",i:l,j:i,L:r,dp:ce(s),split:ce(o),note:`Chain length L=${r}, i=${l}, j=${i}. Try every split k in [${l}, ${i-1}] for (A${l}…A${i}).`});for(let d=l;d<i;d++){const f=s[l][d]+s[d+1][i]+a[l-1]*a[d]*a[i],p=f<s[l][i];n.push({phase:"compare",i:l,j:i,k:d,L:r,candidate:f,current:s[l][i]===1/0?null:s[l][i],dp:ce(s),split:ce(o),note:`k=${d}: cost = dp[${l}][${d}]=${s[l][d]} + dp[${d+1}][${i}]=${s[d+1][i]} + ${a[l-1]}·${a[d]}·${a[i]} = ${f}. ${p?s[l][i]===1/0?"Set as current best.":`Beats current ${s[l][i]} — update.`:"Not better."}`}),p&&(s[l][i]=f,o[l][i]=d)}n.push({phase:"commit",i:l,j:i,L:r,dp:ce(s),split:ce(o),note:`Commit dp[${l}][${i}] = ${s[l][i]} with split at k=${o[l][i]}.`})}const c=t>=1?ss(o,1,t):"";return n.push({phase:"done",i:1,j:t,L:t,dp:ce(s),split:ce(o),paren:c,note:t<1?"No matrices.":`Done. Minimum cost = dp[1][${t}] = ${s[1][t]===1/0?0:s[1][t]}. Optimal parenthesization: ${c}.`}),n}
function ss(a,t,s){if(t===s)return`A${t}`;const o=a[t][s];return`(${ss(a,t,o)} · ${ss(a,o+1,s)})`}
function ce(a){return a.map(t=>t.slice())}
const gr=`
.mcw-root {
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
.mcw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.mcw-title { font-weight: 600; font-size: 15px; }
.mcw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.mcw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.mcw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 300px;
}
.mcw-input:focus { outline: none; border-color: #4a7cff; }
.mcw-btn {
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
.mcw-btn:hover { background: #3b6ae8; }
.mcw-btn.mcw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.mcw-btn.mcw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.mcw-btn.mcw-danger { background: #c13c3c; }
.mcw-btn.mcw-danger:hover { background: #a73232; }
.mcw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mcw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.mcw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.mcw-section-title { font-size: 12px; color: #8a93a8; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.mcw-mats { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.mcw-mat {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  padding: 6px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.mcw-mat b { color: #cfd9ff; }
.mcw-grid {
  display: inline-grid;
  gap: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mcw-cell {
  width: 56px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a2f3e;
  background: #141925;
  font-size: 13px;
  color: #e6e6e6;
  transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
}
.mcw-cell.mcw-hdr {
  background: #1a1f2e;
  color: #8a93a8;
  font-weight: 600;
}
.mcw-cell.mcw-blank { background: #0f1419; border-color: transparent; color: transparent; }
.mcw-cell.mcw-diag { background: #1c2333; color: #4a5365; }
.mcw-cell.mcw-unfilled { color: #4a5365; }
.mcw-cell.mcw-filled { background: #1c2333; color: #cfd9ff; }
.mcw-cell.mcw-current { background: #1e2a44; border-color: #4a7cff; color: #fff; }
.mcw-cell.mcw-split-a { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; }
.mcw-cell.mcw-best { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.mcw-paren {
  margin-top: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: #ffd24a;
  word-break: break-all;
}
.mcw-compare {
  margin-top: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #8a93a8;
}
.mcw-footer {
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
.mcw-status { color: #d1d5db; flex: 1; min-width: 0; }
.mcw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.mcw-stats b { color: #e6e6e6; }
`,Os=[30,35,15,5,10,20,25];
function kr(a){return a.split(/[\s,]+/).map(t=>t.trim()).filter(t=>t.length).map(t=>Number(t)).filter(t=>Number.isFinite(t)&&t>0)}
function yr(){const[a,t]=h.useState(Os),[s,o]=h.useState(Os.join(", ")),n=h.useMemo(()=>br(a),[a]),[c,r]=h.useState(0),[l,i]=h.useState(!1),d=h.useRef(null);h.useEffect(()=>{r(0),i(!1)},[n]),h.useEffect(()=>{if(l){if(c>=n.length-1){i(!1);return}return d.current=setTimeout(()=>r(M=>Math.min(M+1,n.length-1)),320),()=>clearTimeout(d.current)}},[l,c,n.length]),h.useEffect(()=>()=>d.current&&clearTimeout(d.current),[]);const f=n[c]||n[0],p=c>=n.length-1,u=a.length-1,m=f.dp;f.split;function w(){const M=kr(s);if(M.length<2){o(a.join(", "));return}t(M)}function b(){r(0),i(!1)}function k(){i(!1),r(M=>Math.min(M+1,n.length-1))}function $(){i(!1),r(M=>Math.max(M-1,0))}function g(){i(!1),r(n.length-1)}const z=(M,y)=>{if(y<M)return"blank";if(M===y)return"diag";if(f.phase==="init")return"unfilled";const C=y-M+1;return f.phase==="done"||C<f.L?"filled":C>f.L?"unfilled":f.i===M&&f.j===y?"current":M<f.i?"filled":"unfilled"},F=n[n.length-1];return e.jsxs("div",{className:"mcw-root",children:[e.jsx("style",{children:gr}),e.jsx("div",{className:"mcw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"mcw-title",children:"Matrix Chain Multiplication"}),e.jsx("div",{className:"mcw-sub",children:"Find the parenthesization minimizing scalar multiplications. Sweep by chain length L."})]})}),e.jsxs("div",{className:"mcw-bar",children:[e.jsx("span",{className:"mcw-quick",children:"dims"}),e.jsx("input",{className:"mcw-input",value:s,onChange:M=>o(M.target.value),onKeyDown:M=>{M.key==="Enter"&&w()}}),e.jsx("button",{className:"mcw-btn",onClick:w,children:"Apply"}),e.jsx("button",{className:"mcw-btn mcw-ghost",onClick:$,disabled:c===0,children:"◀ Back"}),e.jsx("button",{className:"mcw-btn mcw-ghost",onClick:k,disabled:p,children:"Step ▶"}),e.jsx("button",{className:"mcw-btn",onClick:()=>i(M=>!M),disabled:p&&!l,children:l?"Pause":"Play"}),e.jsx("button",{className:"mcw-btn mcw-ghost",onClick:g,children:"To End"}),e.jsx("button",{className:"mcw-btn mcw-danger",onClick:b,children:"Reset"})]}),e.jsxs("div",{className:"mcw-canvas-wrap",children:[e.jsx("div",{className:"mcw-section-title",children:"Matrices"}),e.jsx("div",{className:"mcw-mats",children:Array.from({length:u},(M,y)=>e.jsxs("div",{className:"mcw-mat",children:[e.jsxs("b",{children:["A",y+1]}),": ",a[y]," × ",a[y+1]]},y))}),e.jsx("div",{className:"mcw-section-title",children:"dp[i][j] — min cost for chain A_i..A_j"}),e.jsxs("div",{className:"mcw-grid",style:{gridTemplateColumns:`44px repeat(${u}, 56px)`},children:[e.jsx("div",{className:"mcw-cell mcw-hdr",children:"i\\\\j"}),Array.from({length:u},(M,y)=>e.jsx("div",{className:"mcw-cell mcw-hdr",children:y+1},"hc"+y)),Array.from({length:u},(M,y)=>{const C=y+1;return e.jsxs(Oe.Fragment,{children:[e.jsx("div",{className:"mcw-cell mcw-hdr",children:C}),Array.from({length:u},(T,v)=>{const I=v+1,j=z(C,I),x=["mcw-cell","mcw-"+j];f.phase==="compare"&&(C===f.i&&I===f.k||C===f.k+1&&I===f.j)&&x.push("mcw-split-a"),f.phase==="done"&&j==="filled"&&C===1&&I===u&&x.push("mcw-best");const N=j==="blank"?"":j==="diag"?"0":j==="unfilled"?"·":m[C][I]===1/0?"∞":m[C][I];return e.jsx("div",{className:x.join(" "),children:N},"c"+C+"_"+I)})]},"row"+C)})]}),f.phase==="compare"&&f.candidate!=null&&e.jsxs("div",{className:"mcw-compare",children:["candidate at k=",f.k,": cost = ",e.jsx("b",{style:{color:"#ffd24a"},children:f.candidate}),f.current!=null?` (current best ${f.current})`:""]}),f.paren&&e.jsxs("div",{className:"mcw-paren",children:["Optimal: ",f.paren]})]}),e.jsxs("div",{className:"mcw-footer",children:[e.jsxs("div",{className:"mcw-status",children:["Status: ",f.note]}),e.jsxs("div",{className:"mcw-stats",children:["step=",e.jsx("b",{children:c+1}),"/",e.jsx("b",{children:n.length}),"   n=",e.jsx("b",{children:u}),"   minCost=",e.jsx("b",{children:u<1||F.dp[1][u]===1/0?0:F.dp[1][u]})]})]})]})}

export default yr;
export { yr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(yr, {}));
  return () => root.unmount();
}
