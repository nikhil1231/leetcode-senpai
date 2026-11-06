import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Ji(a){const t=a.length,s=new Array(t).fill(1),o=new Array(t).fill(-1),n=[];n.push({phase:"init",i:-1,j:-1,dp:s.slice(),prev:o.slice(),note:t===0?"Empty array.":"Initialize dp[i] = 1 for all i (every element is an LIS of length 1 by itself)."});for(let l=0;l<t;l++){n.push({phase:"enter-i",i:l,j:-1,dp:s.slice(),prev:o.slice(),note:`i = ${l} (a[i] = ${a[l]}). Scan j < i looking for a[j] < a[i] to extend.`});for(let i=0;i<l;i++){const d=a[i]<a[l],f=d?s[i]+1:null,p=d&&f>s[l];n.push({phase:"compare",i:l,j:i,dp:s.slice(),prev:o.slice(),candidate:f,note:d?`a[${i}]=${a[i]} < a[${l}]=${a[l]}: candidate dp[${i}]+1 = ${f}.${p?` Improves dp[${l}] from ${s[l]} to ${f}.`:` Not better than current dp[${l}]=${s[l]}.`}`:`a[${i}]=${a[i]} ≥ a[${l}]=${a[l]}: skip — can't extend.`}),p&&(s[l]=f,o[l]=i)}n.push({phase:"commit-i",i:l,j:-1,dp:s.slice(),prev:o.slice(),note:`Commit dp[${l}] = ${s[l]}. ${o[l]===-1?"No predecessor (starts a new chain).":`Predecessor index = ${o[l]} (value ${a[o[l]]}).`}`})}let c=0;for(let l=1;l<t;l++)s[l]>s[c]&&(c=l);const r=[];if(t>0){let l=c;for(;l!==-1;)r.push(l),l=o[l];r.reverse()}return n.push({phase:"done",i:t,j:-1,dp:s.slice(),prev:o.slice(),best:c,picked:r,note:t===0?"Empty. LIS length 0.":`Done. LIS length = max(dp) = ${s[c]}. Traceback from index ${c} → ${r.map(l=>a[l]).join(", ")}.`}),n}
function er(a){const t=a.length,s=[],o=[];o.push({phase:"init",i:-1,piles:[],note:t===0?"Empty array.":"Patience sort. Deal each element onto the leftmost pile whose top is strictly greater. If none, start a new pile."});for(let n=0;n<t;n++){const c=a[n];let r=-1;for(let l=0;l<s.length;l++){const i=s[l][s[l].length-1];if(o.push({phase:"scan",i:n,piles:s.map(d=>d.slice()),scanPile:l,note:`i=${n} v=${c}: pile ${l} top is ${i}. ${i>c?"top > v → place here.":"top ≤ v → keep scanning."}`}),i>c){r=l;break}}r===-1?(s.push([c]),o.push({phase:"place",i:n,piles:s.map(l=>l.slice()),pickedPile:s.length-1,note:`No pile had a greater top. Start new pile ${s.length-1} with value ${c}. (# piles = ${s.length}.)`})):(s[r].push(c),o.push({phase:"place",i:n,piles:s.map(l=>l.slice()),pickedPile:r,note:`Placed v=${c} on pile ${r} (# piles still ${s.length}).`}))}return o.push({phase:"done",i:t,piles:s.map(n=>n.slice()),note:`Done. LIS length = # piles = ${s.length}.`}),o}
const tr=`
.lisw-root {
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
.lisw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.lisw-title { font-weight: 600; font-size: 15px; }
.lisw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.lisw-head-right { display: flex; gap: 8px; align-items: center; }
.lisw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.lisw-input, .lisw-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.lisw-input { width: 280px; }
.lisw-input:focus, .lisw-select:focus { outline: none; border-color: #4a7cff; }
.lisw-btn {
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
.lisw-btn:hover { background: #3b6ae8; }
.lisw-btn.lisw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.lisw-btn.lisw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.lisw-btn.lisw-danger { background: #c13c3c; }
.lisw-btn.lisw-danger:hover { background: #a73232; }
.lisw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.lisw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.lisw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.lisw-arrow-row { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.lisw-cell {
  min-width: 44px;
  height: 44px;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  background: #141925;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  transition: background 250ms ease, border-color 250ms ease, color 250ms ease;
}
.lisw-cell.lisw-i { border-color: #4a7cff; background: #1e2a44; color: #e6e6e6; }
.lisw-cell.lisw-j { border-color: #ffd24a; background: #3a2f12; color: #ffd24a; }
.lisw-cell.lisw-picked { border-color: #ffd24a; background: #3a2f12; color: #ffd24a; }
.lisw-cell.lisw-filled { background: #1f3a2e; border-color: #4a9f6f; color: #cfe8d7; }
.lisw-label { font-size: 11px; color: #8a93a8; min-width: 48px; margin-right: 4px; text-align: right; }
.lisw-dp-row { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.lisw-section-title { font-size: 12px; color: #8a93a8; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.lisw-piles { display: flex; gap: 10px; align-items: flex-end; min-height: 180px; }
.lisw-pile {
  display: flex;
  flex-direction: column-reverse;
  gap: 4px;
  border: 1px dashed #2a2f3e;
  border-radius: 6px;
  padding: 6px;
  min-width: 56px;
  transition: border-color 250ms ease, background 250ms ease;
}
.lisw-pile.lisw-scan { border-color: #ffd24a; background: rgba(255, 210, 74, 0.08); }
.lisw-pile.lisw-picked-pile { border-color: #4a9f6f; background: rgba(74, 159, 111, 0.1); }
.lisw-pile-hdr { font-size: 11px; color: #8a93a8; text-align: center; margin-top: 4px; }
.lisw-pile-card {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  text-align: center;
}
.lisw-pile-card.lisw-top { border-color: #4a7cff; color: #cfd9ff; }
.lisw-footer {
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
.lisw-status { color: #d1d5db; flex: 1; min-width: 0; }
.lisw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.lisw-stats b { color: #e6e6e6; }
.lisw-candidate {
  margin-left: 12px;
  color: #ffd24a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
`,Ps=[10,9,2,5,3,7,101,18];
function sr(a){return a.split(/[\s,]+/).map(t=>t.trim()).filter(t=>t.length).map(t=>Number(t)).filter(t=>Number.isFinite(t))}
function nr(){const[a,t]=h.useState("dp"),[s,o]=h.useState(Ps),[n,c]=h.useState(Ps.join(", ")),r=h.useMemo(()=>a==="dp"?Ji(s):er(s),[a,s]),[l,i]=h.useState(0),[d,f]=h.useState(!1),p=h.useRef(null);h.useEffect(()=>{i(0),f(!1)},[r]),h.useEffect(()=>{if(d){if(l>=r.length-1){f(!1);return}return p.current=setTimeout(()=>i(M=>Math.min(M+1,r.length-1)),650),()=>clearTimeout(p.current)}},[d,l,r.length]),h.useEffect(()=>()=>p.current&&clearTimeout(p.current),[]);const u=r[l]||r[0];function m(){const M=sr(n);if(M.length===0){c(s.join(", "));return}o(M)}function w(){i(0),f(!1)}function b(){f(!1),i(M=>Math.min(M+1,r.length-1))}function k(){f(!1),i(M=>Math.max(M-1,0))}const $=l>=r.length-1,g=s.length,z=r[r.length-1],F=h.useMemo(()=>a==="dp"&&$&&z.picked?new Set(z.picked):new Set,[a,$,z]);return e.jsxs("div",{className:"lisw-root",children:[e.jsx("style",{children:tr}),e.jsxs("div",{className:"lisw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"lisw-title",children:"Longest Increasing Subsequence"}),e.jsx("div",{className:"lisw-sub",children:"Two approaches: O(n²) DP on dp[i] vs. O(n log n) patience sort over piles."})]}),e.jsxs("div",{className:"lisw-head-right",children:[e.jsx("label",{className:"lisw-quick",children:"Mode:"}),e.jsxs("select",{className:"lisw-select",value:a,onChange:M=>t(M.target.value),children:[e.jsx("option",{value:"dp",children:"DP (O(n²))"}),e.jsx("option",{value:"patience",children:"Patience (O(n log n))"})]})]})]}),e.jsxs("div",{className:"lisw-bar",children:[e.jsx("input",{className:"lisw-input",value:n,onChange:M=>c(M.target.value),onKeyDown:M=>{M.key==="Enter"&&m()},placeholder:"comma-separated numbers"}),e.jsx("button",{className:"lisw-btn",onClick:m,children:"Apply"}),e.jsx("button",{className:"lisw-btn lisw-ghost",onClick:k,disabled:l===0,children:"◀ Back"}),e.jsx("button",{className:"lisw-btn lisw-ghost",onClick:b,disabled:$,children:"Step ▶"}),e.jsx("button",{className:"lisw-btn",onClick:()=>f(M=>!M),disabled:$&&!d,children:d?"Pause":"Play"}),e.jsx("button",{className:"lisw-btn lisw-danger",onClick:w,children:"Reset"})]}),e.jsxs("div",{className:"lisw-canvas-wrap",children:[e.jsx("div",{className:"lisw-section-title",children:"Input"}),e.jsxs("div",{className:"lisw-dp-row",children:[e.jsx("span",{className:"lisw-label",children:"a[i]"}),s.map((M,y)=>{const C=["lisw-cell"];return a==="dp"?(u.i===y&&C.push("lisw-i"),u.j===y&&C.push("lisw-j"),F.has(y)&&C.push("lisw-picked")):u.i===y&&C.push("lisw-i"),e.jsx("div",{className:C.join(" "),children:M},y)})]}),e.jsxs("div",{className:"lisw-dp-row",children:[e.jsx("span",{className:"lisw-label",children:"i"}),s.map((M,y)=>e.jsx("div",{className:"lisw-cell",style:{background:"transparent",border:"none",color:"#6a7389",fontSize:11},children:y},y))]}),a==="dp"?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"lisw-section-title",children:"dp[i] — length of LIS ending at i"}),e.jsxs("div",{className:"lisw-dp-row",children:[e.jsx("span",{className:"lisw-label",children:"dp[i]"}),u.dp.map((M,y)=>{const C=["lisw-cell"];return u.i===y&&u.phase!=="done"&&C.push("lisw-i"),u.j===y&&C.push("lisw-j"),F.has(y)&&C.push("lisw-picked"),M>1&&C.push("lisw-filled"),e.jsx("div",{className:C.join(" "),children:M},y)}),u.candidate!=null&&e.jsxs("span",{className:"lisw-candidate",children:["candidate dp[",u.j,"]+1 = ",u.candidate]})]}),e.jsxs("div",{className:"lisw-dp-row",children:[e.jsx("span",{className:"lisw-label",children:"prev[i]"}),u.prev.map((M,y)=>e.jsx("div",{className:"lisw-cell",style:{color:M===-1?"#4a5365":"#cfd9ff"},children:M===-1?"·":M},y))]})]}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"lisw-section-title",children:"Piles (top shown at top of stack)"}),e.jsx("div",{className:"lisw-piles",children:(u.piles||[]).length===0?e.jsx("div",{style:{color:"#8a93a8",fontStyle:"italic"},children:"no piles yet"}):u.piles.map((M,y)=>{const C=["lisw-pile"];return u.scanPile===y&&C.push("lisw-scan"),u.pickedPile===y&&u.phase==="place"&&C.push("lisw-picked-pile"),e.jsxs("div",{className:C.join(" "),children:[M.map((T,v)=>{const I=v===M.length-1;return e.jsx("div",{className:"lisw-pile-card"+(I?" lisw-top":""),children:T},v)}),e.jsxs("div",{className:"lisw-pile-hdr",children:["pile ",y]})]},y)})})]})]}),e.jsxs("div",{className:"lisw-footer",children:[e.jsxs("div",{className:"lisw-status",children:["Status: ",u.note]}),e.jsxs("div",{className:"lisw-stats",children:["step=",e.jsx("b",{children:l+1}),"/",e.jsx("b",{children:r.length}),"   n=",e.jsx("b",{children:g}),"  ",a==="dp"?e.jsxs(e.Fragment,{children:["dp=",e.jsxs("b",{children:["[",u.dp.join(", "),"]"]})]}):e.jsxs(e.Fragment,{children:["piles=",e.jsx("b",{children:(u.piles||[]).length})]})]})]})]})}

export default nr;
export { nr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(nr, {}));
  return () => root.unmount();
}
