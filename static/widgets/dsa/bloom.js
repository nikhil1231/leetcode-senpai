import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Aa(a){const t=String(a);let s=0,o=0;for(let n=0;n<t.length;n++){const c=t.charCodeAt(n);s=s*31+c>>>0,o=o*131+c*7+17>>>0}return(o&1)===0&&(o=o+1>>>0),[s,o]}
function Jt(a,t,s){const[o,n]=Aa(a),c=[];for(let r=0;r<t;r++)c.push((o+r*n>>>0)%s);return c}
class Ta{constructor({m:t=24,k:s=3}={}){this.m=t,this.k=s,this.bits=new Uint8Array(t),this.n=0,this.unique=new Set}add(t){const s=Jt(t,this.k,this.m),o=[],n=[];for(const c of s)this.bits[c]===0?o.push(c):n.push(c),this.bits[c]=1;return this.n++,this.unique.add(t),{key:t,positions:s,flipped:o,alreadySet:n}}check(t){const s=Jt(t,this.k,this.m),o=[],n=[];for(const r of s)this.bits[r]===1?o.push(r):n.push(r);const c=n.length===0;return{key:t,positions:s,setBits:o,unsetBits:n,maybe:c,definitelyNot:!c,trulyAdded:this.unique.has(t)}}fpProbability(){return this.n===0?0:Math.pow(1-Math.exp(-this.k*this.n/this.m),this.k)}bitsSetCount(){let t=0;for(let s=0;s<this.m;s++)this.bits[s]===1&&t++;return t}findFalsePositiveCandidate(t){for(const s of t){if(this.unique.has(s))continue;if(this.check(s).maybe)return s}return null}clear(){this.bits=new Uint8Array(this.m),this.n=0,this.unique.clear()}resize({m:t=this.m,k:s=this.k}){this.m=t,this.k=s,this.clear()}snapshot(){return{m:this.m,k:this.k,n:this.n,bits:Array.from(this.bits),bitsSet:this.bitsSetCount(),fp:this.fpProbability(),unique:Array.from(this.unique)}}}
const Pa=`
.bfw-root { display:flex; flex-direction:column; height:100%; background:#0f1419; color:#e6e6e6; font-family:inherit; font-size:14px; border:1px solid #2a2f3e; border-radius:8px; overflow:hidden; }
.bfw-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#1a1f2e; border-bottom:1px solid #2a2f3e; }
.bfw-title { font-weight:600; font-size:15px; }
.bfw-sub { font-size:12px; color:#8a93a8; margin-top:2px; }
.bfw-head-right { display:flex; gap:8px; align-items:center; }
.bfw-bar { display:flex; align-items:center; gap:8px; padding:10px 16px; background:#141925; border-bottom:1px solid #2a2f3e; flex-wrap:wrap; }
.bfw-input { padding:6px 10px; background:#0f1419; border:1px solid #2a2f3e; border-radius:6px; color:#e6e6e6; font-size:13px; font-family:inherit; width:130px; }
.bfw-input:focus { outline:none; border-color:#4a7cff; }
.bfw-btn { padding:6px 12px; background:#4a7cff; border:none; border-radius:6px; color:white; font-weight:500; cursor:pointer; font-size:13px; font-family:inherit; }
.bfw-btn:hover { background:#3b6ae8; }
.bfw-btn.bfw-ghost { background:transparent; border:1px solid #2a2f3e; color:#d1d5db; }
.bfw-btn.bfw-ghost:hover { border-color:#4a7cff; color:#e6e6e6; }
.bfw-btn.bfw-amber { background:#b58a1f; }
.bfw-btn.bfw-amber:hover { background:#9a751a; }
.bfw-btn.bfw-danger { background:#c13c3c; }
.bfw-btn.bfw-danger:hover { background:#a73232; }
.bfw-quick { font-size:12px; color:#8a93a8; margin-right:4px; }
.bfw-canvas-wrap { flex:1; min-height:280px; overflow:auto; background:radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding:20px; }
.bfw-formula { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; color:#8a93a8; background:#141925; border:1px solid #2a2f3e; border-radius:6px; padding:8px 10px; margin-bottom:16px; white-space:pre-wrap; }
.bfw-bits { display:grid; grid-template-columns:repeat(auto-fit,minmax(36px,1fr)); gap:6px; margin-bottom:16px; }
.bfw-bit { position:relative; aspect-ratio:1/1; background:#1a1f2e; border:1px solid #2a2f3e; border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px; color:#8a93a8; transition:background 250ms ease, border-color 250ms ease, box-shadow 250ms ease, color 250ms ease; }
.bfw-bit-idx { position:absolute; top:2px; left:4px; font-size:9px; color:#4a5365; }
.bfw-bit.bfw-set { background:#1f3a2e; border-color:#4a9f6f; color:#7fdca5; }
.bfw-bit.bfw-flip { animation:bfw-pulse-green 800ms ease-in-out; }
.bfw-bit.bfw-probe-ok { border-color:#ffd24a; box-shadow:0 0 10px rgba(255,210,74,0.55); }
.bfw-bit.bfw-probe-miss { border-color:#ff5c5c; box-shadow:0 0 10px rgba(255,92,92,0.55); background:#3a1f22; color:#ffb7b7; }
@keyframes bfw-pulse-green { 0%,100% { box-shadow:0 0 0 rgba(74,159,111,0); } 50% { box-shadow:0 0 12px rgba(74,159,111,0.9); } }
.bfw-panel { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width:620px) { .bfw-panel { grid-template-columns:1fr; } }
.bfw-card { background:#141925; border:1px solid #2a2f3e; border-radius:6px; padding:10px 12px; }
.bfw-card-h { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#8a93a8; margin-bottom:8px; }
.bfw-tag { display:inline-block; padding:2px 6px; border-radius:4px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; margin:2px 4px 2px 0; border:1px solid #2a2f3e; background:#0f1419; }
.bfw-tag-pos { background:#1f3a2e; border-color:#4a9f6f; color:#7fdca5; }
.bfw-tag-miss { background:#3a1f22; border-color:#ff5c5c; color:#ffb7b7; }
.bfw-verdict { margin-top:6px; padding:6px 8px; border-radius:4px; font-size:13px; font-weight:500; }
.bfw-verdict.bfw-v-maybe { background:#3a2f1a; border:1px solid #ffd24a; color:#ffd24a; }
.bfw-verdict.bfw-v-fp { background:#3a2f1a; border:1px solid #ffd24a; color:#ffd24a; }
.bfw-verdict.bfw-v-no { background:#3a1f22; border:1px solid #ff5c5c; color:#ffb7b7; }
.bfw-verdict small { display:block; font-weight:400; color:#d1d5db; margin-top:2px; }
.bfw-addedlist { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; color:#d1d5db; word-break:break-word; }
.bfw-footer { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:#141925; border-top:1px solid #2a2f3e; font-size:13px; gap:16px; flex-wrap:wrap; }
.bfw-status { color:#d1d5db; flex:1; min-width:0; }
.bfw-stats { color:#8a93a8; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; white-space:nowrap; }
.bfw-stats b { color:#e6e6e6; }
.bfw-stats .bfw-fp-hi { color:#ffd24a; }
.bfw-stats .bfw-fp-crit { color:#ff5c5c; }
`,fs=["apple","grape","mango","peach","lemon","olive"],hs=["zebra","xenon","yacht","quark","vixen","jumble","pixel","cobra","nebula","puzzle","ember","fjord","glove","hazel","ivory","juno","karma","linen","mocha","nimbus","onyx","prism","raven","sable","tango","umber","vinyl","wafer","yonder","zenith","amber","blaze","cinder","delta","echo","forge","gecko","helix","indigo","jazz","kite","lotus","maze","north","opal","plume","quartz","rift","spark","torch","urchin","vortex","willow","yield","crimson","drift"];
function qa(){const a=h.useRef(new Ta({m:24,k:3})),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("Fresh Bloom filter: m=24 bits, k=3 hashes. Add keys to flip bits; check keys to probe."),[c,r]=h.useState(""),[l,i]=h.useState(null),[d,f]=h.useState({flipped:[],probeOk:[],probeMiss:[]}),p=h.useRef(null);function u(x,N=1e3){p.current&&clearTimeout(p.current),f(x),p.current=setTimeout(()=>f({flipped:[],probeOk:[],probeMiss:[]}),N)}h.useEffect(()=>()=>p.current&&clearTimeout(p.current),[]);function m(){s(a.current.snapshot())}function w(x){const N=String(x||"").trim();if(!N){n("Add needs a key.");return}const E=a.current.add(N);m(),u({flipped:E.positions,probeOk:[],probeMiss:[]}),i(null),E.flipped.length===0?n(`Added '${N}': hashed to bits [${E.positions.join(", ")}] — all already set, no new bits flipped.`):n(`Added '${N}': hashed to bits [${E.positions.join(", ")}], flipped ${E.flipped.length} new bit(s).`)}function b(x){const N=String(x||"").trim();if(!N){n("Check needs a key.");return}const E=a.current.check(N);u({flipped:[],probeOk:E.maybe?E.positions:E.setBits,probeMiss:E.unsetBits},1600),i(E),E.maybe?n(E.trulyAdded?`Check '${N}': all ${E.positions.length} bits set → MAYBE present. (Truly added earlier.)`:`Check '${N}': all ${E.positions.length} bits set → MAYBE present, but NEVER added. Real false positive.`):n(`Check '${N}': bit(s) [${E.unsetBits.join(", ")}] = 0 → DEFINITELY NOT present.`)}function k(){const x=a.current;let N=x.findFalsePositiveCandidate(hs);if(!N){for(const E of fs)x.unique.has(E)||x.add(E);m(),N=x.findFalsePositiveCandidate(hs)}N?(b(N),setTimeout(()=>{n(`False-positive demo: '${N}' was never added, yet all ${x.k} of its bits happen to be set. Classic Bloom false positive.`)},0)):(n("Couldn't produce a false positive yet — too few bits are set. Add more keys and retry."),m())}function $(){a.current.clear(),m(),u({flipped:[],probeOk:[],probeMiss:[]}),i(null),n("Cleared. All 24 bits back to 0.")}function g(){w(c),r("")}function z(){b(c)}function F(x){x.key==="Enter"&&g()}const M=h.useMemo(()=>new Set(d.flipped),[d.flipped]),y=h.useMemo(()=>new Set(d.probeOk),[d.probeOk]),C=h.useMemo(()=>new Set(d.probeMiss),[d.probeMiss]),T=t.fp,v=(T*100).toFixed(2),I=T>.25?"bfw-fp-crit":T>.05?"bfw-fp-hi":"",j=h.useMemo(()=>{const x=c.trim();return x?Jt(x,t.k,t.m):[]},[c,t.k,t.m]);return e.jsxs("div",{className:"bfw-root",children:[e.jsx("style",{children:Pa}),e.jsxs("div",{className:"bfw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"bfw-title",children:"Bloom Filter Visualizer"}),e.jsx("div",{className:"bfw-sub",children:"m=24 bits, k=3 hashes. Add flips bits; check probes them. Watch the false-positive rate climb."})]}),e.jsxs("div",{className:"bfw-head-right",children:[e.jsx("button",{className:"bfw-btn bfw-amber",onClick:k,children:"Force false positive"}),e.jsx("button",{className:"bfw-btn bfw-danger",onClick:$,children:"Reset"})]})]}),e.jsxs("div",{className:"bfw-bar",children:[e.jsx("input",{className:"bfw-input",placeholder:"key",value:c,onChange:x=>r(x.target.value),onKeyDown:F}),e.jsx("button",{className:"bfw-btn",onClick:g,children:"Add"}),e.jsx("button",{className:"bfw-btn bfw-ghost",onClick:z,children:"Check"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"bfw-quick",children:"Quick-seed:"}),fs.map(x=>e.jsx("button",{className:"bfw-btn bfw-ghost",onClick:()=>w(x),children:x},x))]}),e.jsxs("div",{className:"bfw-canvas-wrap",children:[e.jsx("div",{className:"bfw-formula",children:`h_i(x) = (h1(x) + i * h2(x)) mod ${t.m}   →   FP ≈ (1 - e^(-k·n/m))^k = (1 - e^(-${t.k}·${t.n}/${t.m}))^${t.k} = ${v}%`}),e.jsx("div",{className:"bfw-bits",children:t.bits.map((x,N)=>{const E=["bfw-bit"];return x===1&&E.push("bfw-set"),M.has(N)&&E.push("bfw-flip"),y.has(N)&&E.push("bfw-probe-ok"),C.has(N)&&E.push("bfw-probe-miss"),e.jsxs("div",{className:E.join(" "),children:[e.jsx("span",{className:"bfw-bit-idx",children:N}),e.jsx("span",{children:x})]},N)})}),e.jsxs("div",{className:"bfw-panel",children:[e.jsxs("div",{className:"bfw-card",children:[e.jsx("div",{className:"bfw-card-h",children:"Last check"}),l?e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:["Probed bits for ",e.jsx("b",{children:l.key}),":"," ",l.positions.map(x=>e.jsx("span",{className:`bfw-tag ${l.unsetBits.includes(x)?"bfw-tag-miss":"bfw-tag-pos"}`,children:x},x))]}),e.jsxs("div",{className:`bfw-verdict ${l.maybe?l.trulyAdded?"bfw-v-maybe":"bfw-v-fp":"bfw-v-no"}`,children:[l.maybe?l.trulyAdded?"MAYBE present (true positive — this key was added)":"MAYBE present (FALSE positive — never added)":"DEFINITELY NOT present",e.jsx("small",{children:l.maybe?"All k bits were 1. Bloom filter can't distinguish 'really added' from 'collision'.":`Bit(s) [${l.unsetBits.join(", ")}] were 0 — no single 0 can survive an add.`})]})]}):e.jsxs("div",{style:{color:"#8a93a8",fontSize:12},children:["Type a key and click Check.",j.length>0&&e.jsxs(e.Fragment,{children:[" Current input would probe [",j.join(", "),"]."]})]})]}),e.jsxs("div",{className:"bfw-card",children:[e.jsxs("div",{className:"bfw-card-h",children:["Added keys (",t.unique.length,")"]}),e.jsx("div",{className:"bfw-addedlist",children:t.unique.length===0?e.jsx("span",{style:{color:"#4a5365",fontStyle:"italic"},children:"none yet"}):t.unique.map(x=>e.jsx("span",{className:"bfw-tag bfw-tag-pos",children:x},x))})]})]})]}),e.jsxs("div",{className:"bfw-footer",children:[e.jsxs("div",{className:"bfw-status",children:["Status: ",o]}),e.jsxs("div",{className:"bfw-stats",children:["n=",e.jsx("b",{children:t.n}),"   bits=",e.jsx("b",{children:t.bitsSet}),"/",e.jsx("b",{children:t.m}),"   FP=",e.jsxs("b",{className:I,children:[v,"%"]})]})]})]})}

export default qa;
export { qa as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(qa, {}));
  return () => root.unmount();
}
