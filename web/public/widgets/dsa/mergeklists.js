import { r as h, j as e, R as ReactDOM, a as Oe } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function us(a,t){a.push(t);let s=a.length-1;for(;s>0;){const o=s-1>>1;if(a[o].val>a[s].val)[a[o],a[s]]=[a[s],a[o]],s=o;else break}}
function xa(a){if(a.length===0)return null;const t=a[0],s=a.pop();if(a.length){a[0]=s;let o=0;const n=a.length;for(;;){const c=2*o+1,r=2*o+2;let l=o;if(c<n&&a[c].val<a[l].val&&(l=c),r<n&&a[r].val<a[l].val&&(l=r),l===o)break;[a[o],a[l]]=[a[l],a[o]],o=l}}return t}
function St(a=3,t=[4,5],s=40){const o=[];for(let n=0;n<a;n++){const c=t[0]+Math.floor(Math.random()*(t[1]-t[0]+1)),r=new Set;for(;r.size<c;)r.add(1+Math.floor(Math.random()*s));const l=Array.from(r).sort((i,d)=>i-d);o.push(l)}return o}
function ma(a){const t=[];a.map(()=>0);const s=[],o=a.map(()=>new Set);let n=[],c=0;for(let d=0;d<a.length;d++)a[d].length>0&&(us(n,{val:a[d][0],listIdx:d,nodeIdx:0}),c+=Math.max(0,n.length-1));t.push({heap:n.map(d=>({...d})),output:s.slice(),consumed:o.map(d=>new Set(d)),note:`Seed: pushed the head of each of ${a.length} lists into the heap.`,highlight:null,comparisons:c,done:!1});let r=0;for(;n.length>0&&!(r++>500);){const d=xa(n);c+=n.length,o[d.listIdx].add(d.nodeIdx),s.push({val:d.val,from:d.listIdx}),t.push({heap:n.map(p=>({...p})),output:s.slice(),consumed:o.map(p=>new Set(p)),note:`Popped min ${d.val} from list ${d.listIdx} → output. Heap size now ${n.length}.`,highlight:{listIdx:d.listIdx,nodeIdx:d.nodeIdx},comparisons:c,done:!1});const f=d.nodeIdx+1;f<a[d.listIdx].length?(us(n,{val:a[d.listIdx][f],listIdx:d.listIdx,nodeIdx:f}),c+=Math.max(0,n.length-1),t.push({heap:n.map(p=>({...p})),output:s.slice(),consumed:o.map(p=>new Set(p)),note:`Pushed successor ${a[d.listIdx][f]} from list ${d.listIdx}.`,highlight:{listIdx:d.listIdx,nodeIdx:f},comparisons:c,done:!1})):t.push({heap:n.map(p=>({...p})),output:s.slice(),consumed:o.map(p=>new Set(p)),note:`List ${d.listIdx} exhausted. Nothing to push.`,highlight:null,comparisons:c,done:!1})}const l=a.reduce((d,f)=>d+f.length,0),i=Math.max(0,l*a.length-a.length);return t.push({heap:[],output:s.slice(),consumed:o.map(d=>new Set(d)),note:`Done. Merged ${l} items with heap. Heap cost ≈ N·log(k). Naive linear-scan cost ≈ N·k = ${i}.`,highlight:null,comparisons:c,done:!0}),{steps:t,naive:i}}
const wa=`
.mkw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.mkw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.mkw-title { font-weight: 600; font-size: 15px; }
.mkw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.mkw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.mkw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.mkw-btn:hover { background: #3b6ae8; }
.mkw-btn.ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.mkw-btn.ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.mkw-btn.danger { background: #c13c3c; }
.mkw-btn.danger:hover { background: #a73232; }
.mkw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.mkw-select { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; }
.mkw-canvas { flex: 1; min-height: 340px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 16px; }
.mkw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.mkw-status { color: #d1d5db; flex: 1; min-width: 0; }
.mkw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.mkw-stats b { color: #e6e6e6; }
.mkw-main { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
.mkw-col { min-width: 0; }
.mkw-sec { font-size: 11px; color: #8a93a8; letter-spacing: 0.5px;
  text-transform: uppercase; margin-bottom: 8px; }
.mkw-list-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.mkw-list-label { min-width: 44px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #8a93a8; }
.mkw-cell { min-width: 40px; padding: 8px 10px; background: #1f3a2e;
  border: 1.5px solid #4a9f6f; border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center;
  transition: all 350ms ease; color: #e6e6e6; }
.mkw-cell.consumed { background: #141925; border-color: #2a2f3e; color: #6a7389;
  text-decoration: line-through; }
.mkw-cell.highlight { border-color: #ffd24a; background: #5a4d1a;
  filter: drop-shadow(0 0 10px rgba(255, 210, 74, 0.8)); }
.mkw-cell.next { border-color: #4a7cff; background: #1a2a52; color: #e6e6e6; }
.mkw-arrow { color: #3a4560; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mkw-heap { display: flex; flex-direction: column; gap: 6px; }
.mkw-heap-slot { padding: 8px 10px; background: #2a3550; border: 1.5px solid #4a5f8f;
  border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; color: #e6e6e6; display: flex; justify-content: space-between;
  gap: 8px; transition: all 300ms ease; }
.mkw-heap-slot.root { border-color: #ffd24a; filter: drop-shadow(0 0 6px rgba(255,210,74,0.5)); }
.mkw-heap-slot .hv { font-weight: 600; }
.mkw-heap-slot .hs { color: #8a93a8; font-size: 11px; }
.mkw-output-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
  background: #0a0e15; border: 1px solid #2a2f3e; border-radius: 6px; min-height: 42px; }
.mkw-out-cell { padding: 6px 10px; background: #141925; border: 1px solid #2a2f3e;
  border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #e6e6e6; animation: mkw-pop 400ms ease-out; }
.mkw-out-cell.just { border-color: #ffd24a; background: #5a4d1a; }
@keyframes mkw-pop {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.mkw-empty { color: #8a93a8; font-style: italic; font-size: 12px; }
`,me=["#4a9f6f","#4a7cff","#ffd24a","#c17aff","#ff7a4a","#4ac1ff"];
function ba(){const[a,t]=h.useState(3),[s,o]=h.useState(()=>St(3,[4,5],40)),{steps:n,naive:c}=h.useMemo(()=>ma(s),[s]),[r,l]=h.useState(0),[i,d]=h.useState(!1),f=h.useRef(null);h.useEffect(()=>{l(0),d(!1)},[s]),h.useEffect(()=>{if(i)return f.current=setTimeout(()=>{l(b=>b>=n.length-1?(d(!1),b):b+1)},700),()=>clearTimeout(f.current)},[i,r,n.length]);const p=n[Math.min(r,n.length-1)];function u(){o(St(a,[4,5],40))}function m(b){const k=Number(b.target.value);t(k),o(St(k,[4,5],40))}const w=h.useMemo(()=>s.map((k,$)=>{for(let g=0;g<k.length;g++)if(!p.consumed[$].has(g))return g;return-1}),[s,p]);return e.jsxs("div",{className:"mkw-root",children:[e.jsx("style",{children:wa}),e.jsxs("div",{className:"mkw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"mkw-title",children:"Merge K Sorted Lists (Min-Heap)"}),e.jsx("div",{className:"mkw-sub",children:"Classic: keep one head per list on a size-k heap. Each pop costs O(log k); total O(N·log k)."})]}),e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[e.jsx("span",{className:"mkw-quick",children:"k:"}),e.jsx("select",{className:"mkw-select",value:a,onChange:m,children:[2,3,4,5,6].map(b=>e.jsx("option",{value:b,children:b},b))}),e.jsx("button",{className:"mkw-btn ghost",onClick:u,children:"Regenerate"})]})]}),e.jsxs("div",{className:"mkw-bar",children:[e.jsx("button",{className:"mkw-btn",onClick:()=>d(b=>!b),children:i?"Pause":"Play"}),e.jsx("button",{className:"mkw-btn ghost",disabled:r>=n.length-1,onClick:()=>l(b=>Math.min(b+1,n.length-1)),children:"Step"}),e.jsx("button",{className:"mkw-btn danger",onClick:()=>{l(0),d(!1)},children:"Reset"}),e.jsx("span",{style:{width:12}}),e.jsxs("span",{className:"mkw-quick",children:["Step ",r+1," / ",n.length]})]}),e.jsx("div",{className:"mkw-canvas",children:e.jsxs("div",{className:"mkw-main",children:[e.jsxs("div",{className:"mkw-col",children:[e.jsx("div",{className:"mkw-sec",children:"K sorted input lists"}),s.map((b,k)=>e.jsxs("div",{className:"mkw-list-row",children:[e.jsxs("div",{className:"mkw-list-label",style:{color:me[k%me.length]},children:["L",k]}),b.map(($,g)=>{const z=p.consumed[k]&&p.consumed[k].has(g),F=p.highlight&&p.highlight.listIdx===k&&p.highlight.nodeIdx===g,M=!z&&w[k]===g&&!F,y=["mkw-cell"];return z&&y.push("consumed"),F&&y.push("highlight"),M&&y.push("next"),e.jsxs(Oe.Fragment,{children:[e.jsx("div",{className:y.join(" "),style:!z&&!F&&!M?{borderColor:me[k%me.length]}:void 0,children:$}),g<b.length-1&&e.jsx("span",{className:"mkw-arrow",children:"→"})]},g)})]},k)),e.jsx("div",{className:"mkw-sec",style:{marginTop:20},children:"Merged output"}),e.jsx("div",{className:"mkw-output-row",children:p.output.length===0?e.jsx("span",{className:"mkw-empty",children:"empty"}):p.output.map((b,k)=>e.jsx("div",{className:"mkw-out-cell"+(k===p.output.length-1?" just":""),style:{borderLeft:`3px solid ${me[b.from%me.length]}`},children:b.val},k))})]}),e.jsxs("div",{className:"mkw-col",children:[e.jsx("div",{className:"mkw-sec",children:"Min-heap (size ≤ k)"}),e.jsx("div",{className:"mkw-heap",children:p.heap.length===0?e.jsx("span",{className:"mkw-empty",children:"empty"}):p.heap.map((b,k)=>e.jsxs("div",{className:"mkw-heap-slot"+(k===0?" root":""),children:[e.jsx("span",{className:"hv",style:{color:me[b.listIdx%me.length]},children:b.val}),e.jsxs("span",{className:"hs",children:["from L",b.listIdx,"[",b.nodeIdx,"]"]})]},k))})]})]})}),e.jsxs("div",{className:"mkw-footer",children:[e.jsxs("div",{className:"mkw-status",children:["Status: ",p.note]}),e.jsxs("div",{className:"mkw-stats",children:["k=",e.jsx("b",{children:s.length}),"   N=",e.jsx("b",{children:s.reduce((b,k)=>b+k.length,0)}),"   heap-cmps≈",e.jsx("b",{children:p.comparisons}),"   naive≈",e.jsx("b",{children:c})]})]})]})}

export default ba;
export { ba as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ba, {}));
  return () => root.unmount();
}
