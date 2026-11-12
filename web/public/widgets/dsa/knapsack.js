import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function hr(a,t){const s=a.length,o=t,n=[],c=[];for(let m=0;m<=s;m++)n.push(new Array(o+1).fill(0)),c.push(new Array(o+1).fill(!1));const r=[];r.push({phase:"init",i:0,w:0,dp:qe(n),chosen:new Set,note:`Initialize (N+1)×(W+1) table. dp[0][*] = 0 (no items). N=${s}, capacity=${o}.`});for(let m=1;m<=s;m++){const w=a[m-1].weight,b=a[m-1].value;for(let k=0;k<=o;k++){let $;if(w>k)n[m][k]=n[m-1][k],$="forced-skip";else{const g=n[m-1][k],z=n[m-1][k-w]+b;z>g?(n[m][k]=z,c[m][k]=!0,$="take"):(n[m][k]=g,$="skip")}r.push({phase:"fill",i:m,w:k,dp:qe(n),pick:$,chosen:new Set,note:$==="forced-skip"?`Item ${m-1} (${a[m-1].name}) weight=${w} > capacity=${k}. Forced skip: dp[${m}][${k}] = dp[${m-1}][${k}] = ${n[m][k]}.`:$==="take"?`Take item ${m-1} (${a[m-1].name}, w=${w}, v=${b}): dp[${m}][${k}] = dp[${m-1}][${k-w}] + ${b} = ${n[m][k]}. Beats skip (${n[m-1][k]}).`:`Skip item ${m-1} (${a[m-1].name}): dp[${m}][${k}] = dp[${m-1}][${k}] = ${n[m][k]}. Take would give ${n[m-1][k-w]+b}.`})}}r.push({phase:"fill-done",i:s,w:o,dp:qe(n),chosen:new Set,note:`Fill complete. Best value = dp[${s}][${o}] = ${n[s][o]}. Trace back to pick items.`});const l=new Set;let i=s,d=o;const f=new Set;for(f.add(`${i},${d}`);i>0;){if(c[i][d]){l.add(i-1);const m=d-a[i-1].weight;r.push({phase:"traceback",i,w:d,dp:qe(n),pick:"take",chosen:new Set(l),tbCell:`${i},${d}`,note:`At (${i}, ${d}): dp increased — item ${i-1} (${a[i-1].name}) was taken. Subtract weight ${a[i-1].weight} → (${i-1}, ${m}).`}),i--,d=m}else r.push({phase:"traceback",i,w:d,dp:qe(n),pick:"skip",chosen:new Set(l),tbCell:`${i},${d}`,note:`At (${i}, ${d}): dp same as row above — item ${i-1} (${a[i-1].name}) was skipped. Move ↑ to (${i-1}, ${d}).`}),i--;f.add(`${i},${d}`)}let p=0,u=0;for(const m of l)p+=a[m].weight,u+=a[m].value;return r.push({phase:"done",i:0,w:0,dp:qe(n),chosen:new Set(l),note:`Done. Chose ${l.size} item(s): ${[...l].map(m=>a[m].name).join(", ")||"(none)"}. Total weight=${p}/${o}, total value=${u}.`}),r}
function qe(a){return a.map(t=>t.slice())}
const xr=`
.kpw-root {
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
.kpw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.kpw-title { font-weight: 600; font-size: 15px; }
.kpw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.kpw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.kpw-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 70px;
}
.kpw-input:focus { outline: none; border-color: #4a7cff; }
.kpw-btn {
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
.kpw-btn:hover { background: #3b6ae8; }
.kpw-btn.kpw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.kpw-btn.kpw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.kpw-btn.kpw-danger { background: #c13c3c; }
.kpw-btn.kpw-danger:hover { background: #a73232; }
.kpw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.kpw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.kpw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
  display: flex;
  gap: 20px;
}
.kpw-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
}
.kpw-item {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  transition: border-color 220ms ease, background 220ms ease;
}
.kpw-item .kpw-name { color: #e6e6e6; font-weight: 600; }
.kpw-item .kpw-wv { color: #8a93a8; }
.kpw-item.kpw-considering { border-color: #4a7cff; background: #1e2a44; }
.kpw-item.kpw-taken { border-color: #4a9f6f; background: #1f3a2e; }
.kpw-grid-wrap { flex: 1; min-width: 0; overflow: auto; }
.kpw-grid {
  display: inline-grid;
  gap: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.kpw-cell {
  width: 40px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a2f3e;
  background: #141925;
  font-size: 12px;
  color: #e6e6e6;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
}
.kpw-cell.kpw-hdr {
  background: #1a1f2e;
  color: #8a93a8;
  font-weight: 600;
}
.kpw-cell.kpw-unfilled { color: #4a5365; }
.kpw-cell.kpw-filled { background: #1c2333; color: #cfd9ff; }
.kpw-cell.kpw-current { background: #1e2a44; border-color: #4a7cff; color: #fff; }
.kpw-cell.kpw-take { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.kpw-cell.kpw-trace { background: #3a2f12; border-color: #ffd24a; color: #ffd24a; font-weight: 600; }
.kpw-footer {
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
.kpw-status { color: #d1d5db; flex: 1; min-width: 0; }
.kpw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.kpw-stats b { color: #e6e6e6; }
`,mr=[{name:"map",weight:2,value:6},{name:"compass",weight:2,value:3},{name:"water",weight:6,value:15},{name:"sandwich",weight:5,value:11},{name:"glucose",weight:1,value:5}],_s=10;
function wr(){const[a,t]=h.useState(mr),[s,o]=h.useState(_s),[n,c]=h.useState(String(_s)),r=h.useMemo(()=>hr(a,s),[a,s]),[l,i]=h.useState(0),[d,f]=h.useState(!1),p=h.useRef(null);h.useEffect(()=>{i(0),f(!1)},[r]),h.useEffect(()=>{if(d){if(l>=r.length-1){f(!1);return}return p.current=setTimeout(()=>i(j=>Math.min(j+1,r.length-1)),180),()=>clearTimeout(p.current)}},[d,l,r.length]),h.useEffect(()=>()=>p.current&&clearTimeout(p.current),[]);const u=r[l]||r[0],m=l>=r.length-1,w=a.length,b=s,k=u.dp,$=(j,x)=>u.phase==="init"?j===0:u.phase==="fill"?j===0||j<u.i||j===u.i&&x<u.w:!0,g=u.chosen||new Set;function z(){const j=Number(n);Number.isFinite(j)&&j>0&&j<=60&&o(Math.floor(j))}function F(){i(0),f(!1)}function M(){f(!1),i(j=>Math.min(j+1,r.length-1))}function y(){f(!1),i(j=>Math.max(j-1,0))}function C(){f(!1);const j=r.findIndex(x=>x.phase==="fill-done");j!==-1&&i(j)}function T(){f(!1),i(r.length-1)}const v=r[r.length-1],I=v.chosen||new Set;return e.jsxs("div",{className:"kpw-root",children:[e.jsx("style",{children:xr}),e.jsx("div",{className:"kpw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"kpw-title",children:"0/1 Knapsack"}),e.jsx("div",{className:"kpw-sub",children:"dp[i][w] = max value using first i items with capacity w. Traceback picks items where dp jumped."})]})}),e.jsxs("div",{className:"kpw-bar",children:[e.jsx("span",{className:"kpw-quick",children:"capacity"}),e.jsx("input",{className:"kpw-input",value:n,onChange:j=>c(j.target.value),onKeyDown:j=>{j.key==="Enter"&&z()}}),e.jsx("button",{className:"kpw-btn",onClick:z,children:"Apply"}),e.jsx("button",{className:"kpw-btn kpw-ghost",onClick:y,disabled:l===0,children:"◀ Back"}),e.jsx("button",{className:"kpw-btn kpw-ghost",onClick:M,disabled:m,children:"Step ▶"}),e.jsx("button",{className:"kpw-btn",onClick:()=>f(j=>!j),disabled:m&&!d,children:d?"Pause":"Play"}),e.jsx("button",{className:"kpw-btn kpw-ghost",onClick:C,children:"Skip Fill"}),e.jsx("button",{className:"kpw-btn kpw-ghost",onClick:T,children:"To End"}),e.jsx("button",{className:"kpw-btn kpw-danger",onClick:F,children:"Reset"})]}),e.jsxs("div",{className:"kpw-canvas-wrap",children:[e.jsxs("div",{className:"kpw-items",children:[e.jsx("div",{style:{fontSize:12,color:"#8a93a8",marginBottom:4},children:"ITEMS"}),a.map((j,x)=>{const N=["kpw-item"];return u.phase==="fill"&&u.i===x+1&&N.push("kpw-considering"),(g.has(x)||m&&I.has(x))&&N.push("kpw-taken"),e.jsxs("div",{className:N.join(" "),children:[e.jsxs("div",{className:"kpw-name",children:["#",x," ",j.name]}),e.jsxs("div",{className:"kpw-wv",children:["w=",j.weight,", v=",j.value]})]},x)})]}),e.jsx("div",{className:"kpw-grid-wrap",children:e.jsxs("div",{className:"kpw-grid",style:{gridTemplateColumns:`60px repeat(${b+1}, 40px)`},children:[e.jsx("div",{className:"kpw-cell kpw-hdr",children:"i\\\\w"}),Array.from({length:b+1},(j,x)=>e.jsx("div",{className:"kpw-cell kpw-hdr",children:x},"hc"+x)),Array.from({length:w+1},(j,x)=>e.jsxs(Oe.Fragment,{children:[e.jsx("div",{className:"kpw-cell kpw-hdr",children:x}),Array.from({length:b+1},(N,E)=>{const A=$(x,E),R=["kpw-cell"],S=u.phase==="fill"&&u.i===x&&u.w===E,P=S&&u.pick==="take";u.phase==="traceback"&&u.tbCell===`${x},${E}`?R.push("kpw-trace"):P?R.push("kpw-take"):S?R.push("kpw-current"):A?R.push("kpw-filled"):R.push("kpw-unfilled");const B=A?k[x][E]:"·";return e.jsx("div",{className:R.join(" "),children:B},"c"+x+"_"+E)})]},"row"+x))]})})]}),e.jsxs("div",{className:"kpw-footer",children:[e.jsxs("div",{className:"kpw-status",children:["Status: ",u.note]}),e.jsxs("div",{className:"kpw-stats",children:["step=",e.jsx("b",{children:l+1}),"/",e.jsx("b",{children:r.length}),"   N=",e.jsx("b",{children:w}),"   W=",e.jsx("b",{children:b}),"   best=",e.jsx("b",{children:v.dp[w][b]})]})]})]})}

export default wr;
export { wr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(wr, {}));
  return () => root.unmount();
}
