import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function jr(a,t){const s=new Array(t+1).fill(1/0),o=new Array(t+1).fill(-1);s[0]=0;const n=[];n.push({phase:"init",a:0,dp:s.slice(),choice:o.slice(),note:`Initialize: dp[0]=0, dp[a]=∞ for a>0. Coins=[${a.join(", ")}], target=${t}.`});for(let r=1;r<=t;r++){n.push({phase:"enter",a:r,dp:s.slice(),choice:o.slice(),note:`Amount a=${r}. Try each coin; dp[a] = min(dp[a], dp[a-c]+1).`});for(const l of a){if(l>r){n.push({phase:"skip",a:r,c:l,dp:s.slice(),choice:o.slice(),note:`Coin c=${l} > a=${r}. Skip.`});continue}const i=s[r-l],d=i===1/0?1/0:i+1,f=d<s[r];n.push({phase:"compare",a:r,c:l,dp:s.slice(),choice:o.slice(),candidate:d,better:f,note:i===1/0?`Coin c=${l}: dp[${r-l}] = ∞ → can't use this coin to reach ${r} yet.`:`Coin c=${l}: candidate = dp[${r-l}]+1 = ${d}. ${f?s[r]===1/0?`Set dp[${r}] = ${d} using coin ${l}.`:`Beats current dp[${r}]=${s[r]}. Update to ${d}.`:`Not better than dp[${r}]=${s[r]}.`}`}),f&&(s[r]=d,o[r]=l)}n.push({phase:"commit",a:r,dp:s.slice(),choice:o.slice(),note:s[r]===1/0?`Commit dp[${r}] = ∞ (unreachable with current coins).`:`Commit dp[${r}] = ${s[r]} (best via coin ${o[r]}).`})}const c=[];if(t>0&&s[t]!==1/0){let r=t;for(;r>0;){const l=o[r];c.push(l);const i=r-l;n.push({phase:"traceback",a:r,c:l,dp:s.slice(),choice:o.slice(),tbA:r,tbCoin:l,picked:c.slice(),note:`Traceback at a=${r}: picked coin ${l} → next a = ${r} - ${l} = ${i}.`}),r=i}}return n.push({phase:"done",a:0,dp:s.slice(),choice:o.slice(),picked:c.slice(),note:s[t]===1/0?`Done. Amount ${t} is unreachable with coins [${a.join(", ")}].`:`Done. Min coins for ${t} = ${s[t]} using [${c.join(", ")}].`}),n}
const vr=`
.ccw-root {
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
.ccw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.ccw-title { font-weight: 600; font-size: 15px; }
.ccw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.ccw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.ccw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ccw-input.ccw-coins { width: 200px; }
.ccw-input.ccw-amt { width: 90px; }
.ccw-input:focus { outline: none; border-color: #4a7cff; }
.ccw-btn {
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
.ccw-btn:hover { background: #3b6ae8; }
.ccw-btn.ccw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.ccw-btn.ccw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.ccw-btn.ccw-danger { background: #c13c3c; }
.ccw-btn.ccw-danger:hover { background: #a73232; }
.ccw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ccw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.ccw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.ccw-section-title { font-size: 12px; color: #8a93a8; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.ccw-coins-row { display: flex; gap: 6px; margin-bottom: 16px; }
.ccw-coin {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: #cfd9ff;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}
.ccw-coin.ccw-active { border-color: #ffd24a; background: #3a2f12; color: #ffd24a; }
.ccw-coin.ccw-better { border-color: #4a9f6f; background: #1f3a2e; color: #cfe8d7; }
.ccw-dp-row { display: flex; gap: 2px; flex-wrap: wrap; }
.ccw-dp {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
}
.ccw-dp-idx { font-size: 10px; color: #6a7389; margin-bottom: 2px; }
.ccw-dp-cell {
  width: 40px;
  height: 40px;
  border: 1px solid #2a2f3e;
  border-radius: 4px;
  background: #141925;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
}
.ccw-dp-cell.ccw-inf { color: #4a5365; }
.ccw-dp-cell.ccw-filled { background: #1c2333; color: #cfd9ff; }
.ccw-dp-cell.ccw-current { background: #1e2a44; border-color: #4a7cff; color: #fff; }
.ccw-dp-cell.ccw-source { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; }
.ccw-dp-cell.ccw-tb { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; font-weight: 600; }
.ccw-dp-cell.ccw-goal { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.ccw-picked {
  margin-top: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: #ffd24a;
}
.ccw-footer {
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
.ccw-status { color: #d1d5db; flex: 1; min-width: 0; }
.ccw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.ccw-stats b { color: #e6e6e6; }
`,Ws=[1,2,5],Us=11;
function Nr(a){return a.split(/[\s,]+/).map(t=>t.trim()).filter(t=>t.length).map(t=>Number(t)).filter(t=>Number.isFinite(t)&&t>0)}
function Sr(){const[a,t]=h.useState(Ws),[s,o]=h.useState(Us),[n,c]=h.useState(Ws.join(", ")),[r,l]=h.useState(String(Us)),i=h.useMemo(()=>jr(a,s),[a,s]),[d,f]=h.useState(0),[p,u]=h.useState(!1),m=h.useRef(null);h.useEffect(()=>{f(0),u(!1)},[i]),h.useEffect(()=>{if(p){if(d>=i.length-1){u(!1);return}return m.current=setTimeout(()=>f(x=>Math.min(x+1,i.length-1)),300),()=>clearTimeout(m.current)}},[p,d,i.length]),h.useEffect(()=>()=>m.current&&clearTimeout(m.current),[]);const w=i[d]||i[0],b=d>=i.length-1,k=w.dp;function $(){const x=Nr(n),N=Number(r);if(x.length===0||!Number.isFinite(N)||N<0||N>200){c(a.join(", ")),l(String(s));return}t(x),o(Math.floor(N))}function g(){f(0),u(!1)}function z(){u(!1),f(x=>Math.min(x+1,i.length-1))}function F(){u(!1),f(x=>Math.max(x-1,0))}function M(){u(!1),f(i.length-1)}const y=i[i.length-1],C=w.phase==="init"?0:w.phase==="done"||w.phase==="traceback"?s:w.phase==="commit"?w.a:w.a-1,T=w.phase==="compare"&&w.c!=null&&w.a-w.c>=0?w.a-w.c:-1,v=["enter","compare","commit","skip"].includes(w.phase)?w.a:-1,I=w.phase==="traceback"?w.tbA:-1,j=x=>x===1/0?"∞":String(x);return e.jsxs("div",{className:"ccw-root",children:[e.jsx("style",{children:vr}),e.jsx("div",{className:"ccw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"ccw-title",children:"Coin Change (Minimum Coins)"}),e.jsx("div",{className:"ccw-sub",children:"1D DP: for each amount a, try each coin c — dp[a] = min(dp[a], dp[a−c]+1)."})]})}),e.jsxs("div",{className:"ccw-bar",children:[e.jsx("span",{className:"ccw-quick",children:"coins"}),e.jsx("input",{className:"ccw-input ccw-coins",value:n,onChange:x=>c(x.target.value),onKeyDown:x=>{x.key==="Enter"&&$()}}),e.jsx("span",{className:"ccw-quick",children:"amount"}),e.jsx("input",{className:"ccw-input ccw-amt",value:r,onChange:x=>l(x.target.value),onKeyDown:x=>{x.key==="Enter"&&$()}}),e.jsx("button",{className:"ccw-btn",onClick:$,children:"Apply"}),e.jsx("button",{className:"ccw-btn ccw-ghost",onClick:F,disabled:d===0,children:"◀ Back"}),e.jsx("button",{className:"ccw-btn ccw-ghost",onClick:z,disabled:b,children:"Step ▶"}),e.jsx("button",{className:"ccw-btn",onClick:()=>u(x=>!x),disabled:b&&!p,children:p?"Pause":"Play"}),e.jsx("button",{className:"ccw-btn ccw-ghost",onClick:M,children:"To End"}),e.jsx("button",{className:"ccw-btn ccw-danger",onClick:g,children:"Reset"})]}),e.jsxs("div",{className:"ccw-canvas-wrap",children:[e.jsx("div",{className:"ccw-section-title",children:"Coins"}),e.jsx("div",{className:"ccw-coins-row",children:a.map((x,N)=>{const E=["ccw-coin"];return w.c===x&&(w.phase==="compare"&&w.better?E.push("ccw-better"):E.push("ccw-active")),e.jsx("div",{className:E.join(" "),children:x},N)})}),e.jsx("div",{className:"ccw-section-title",children:"dp[a] — min coins for amount a"}),e.jsx("div",{className:"ccw-dp-row",children:k.map((x,N)=>{const E=N<=C||w.phase==="done"||w.phase==="traceback",A=["ccw-dp-cell"];return N===I?A.push("ccw-tb"):N===v?A.push("ccw-current"):N===T?A.push("ccw-source"):w.phase==="done"&&N===s&&k[s]!==1/0?A.push("ccw-goal"):E&&x!==1/0?A.push("ccw-filled"):x===1/0?A.push("ccw-inf"):A.push("ccw-filled"),e.jsxs("div",{className:"ccw-dp",children:[e.jsx("div",{className:"ccw-dp-idx",children:N}),e.jsx("div",{className:A.join(" "),children:E?j(x):x===1/0?"∞":j(x)})]},N)})}),w.picked&&w.picked.length>0&&e.jsxs("div",{className:"ccw-picked",children:["picked so far: [",w.picked.join(", "),"]   sum=",w.picked.reduce((x,N)=>x+N,0)]})]}),e.jsxs("div",{className:"ccw-footer",children:[e.jsxs("div",{className:"ccw-status",children:["Status: ",w.note]}),e.jsxs("div",{className:"ccw-stats",children:["step=",e.jsx("b",{children:d+1}),"/",e.jsx("b",{children:i.length}),"   |coins|=",e.jsx("b",{children:a.length}),"   amount=",e.jsx("b",{children:s}),"   min=",e.jsx("b",{children:y.dp[s]===1/0?"∞":y.dp[s]})]})]})]})}

export default Sr;
export { Sr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Sr, {}));
  return () => root.unmount();
}
