import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let pn=1;
function Ks(){return"n"+pn++}
class $r{constructor(){this.items=[],this._seq=0}push(t){this.items.push({weight:t.weight,seq:this._seq++,node:t}),this._siftUp(this.items.length-1)}pop(){if(this.items.length===0)return null;const t=this.items[0],s=this.items.pop();return this.items.length>0&&(this.items[0]=s,this._siftDown(0)),t.node}size(){return this.items.length}snapshot(){return this.items.slice().sort((s,o)=>s.weight-o.weight||s.seq-o.seq).map(s=>s.node.id)}_less(t,s){const o=this.items[t],n=this.items[s];return o.weight!==n.weight?o.weight<n.weight:o.seq<n.seq}_siftUp(t){for(;t>0;){const s=t-1>>1;if(this._less(t,s))[this.items[t],this.items[s]]=[this.items[s],this.items[t]],t=s;else break}}_siftDown(t){const s=this.items.length;for(;;){const o=t*2+1,n=t*2+2;let c=t;if(o<s&&this._less(o,c)&&(c=o),n<s&&this._less(n,c)&&(c=n),c===t)break;[this.items[t],this.items[c]]=[this.items[c],this.items[t]],t=c}}}
function Mr(a){pn=1;const t=[],s={},o={};for(const d of a)o[d]=(o[d]||0)+1;const n=Object.keys(o).sort(),c=n.map(d=>({char:d,weight:o[d]}));if(t.push({kind:"freq",heap:[],forest:{},freqTable:c,note:`Counted frequencies for ${n.length} unique character(s) in a ${a.length}-char input.`}),n.length===0)return{steps:t,freqTable:c,codebook:{},root:null,text:a};const r=new $r;for(const d of n){const f=Ks();s[f]={id:f,char:d,weight:o[d]},r.push(s[f])}if(t.push({kind:"seed",heap:r.snapshot(),forest:Ve(s),freqTable:c,note:`Seeded min-heap with ${n.length} leaf node(s).`}),n.length===1){const d=s[Object.keys(s)[0]],f={[d.char]:"0"};return t.push({kind:"done",heap:[],forest:Ve(s),freqTable:c,codebook:f,rootId:d.id,note:"Only one unique character. Assigned code '0' by convention."}),{steps:t,freqTable:c,codebook:f,root:d,text:a}}for(;r.size()>1;){const d=r.pop(),f=r.pop();t.push({kind:"pop",heap:r.snapshot(),forest:Ve(s),freqTable:c,picked:[d.id,f.id],note:`Popped two smallest: ${Hs(d)} (w=${d.weight}) and ${Hs(f)} (w=${f.weight}).`});const p={id:Ks(),weight:d.weight+f.weight,left:d.id,right:f.id};s[p.id]=p,r.push(p),t.push({kind:"merge",heap:r.snapshot(),forest:Ve(s),freqTable:c,picked:[d.id,f.id],merged:p.id,note:`Merged into parent (w=${p.weight}). Heap size: ${r.size()}.`})}const l=r.pop(),i={};return ns(l,"",s,i),t.push({kind:"done",heap:[],forest:Ve(s),freqTable:c,codebook:i,rootId:l.id,note:`Tree complete. Derived prefix codes for ${Object.keys(i).length} character(s).`}),{steps:t,freqTable:c,codebook:i,root:l,text:a}}
function Ve(a){const t={};for(const s in a){const o=a[s];t[s]={id:o.id,char:o.char,weight:o.weight,left:o.left,right:o.right}}return t}
function Hs(a){return a.char!=null?`'${a.char}'`:`(${a.id})`}
function ns(a,t,s,o){if(a!=null){if(a.char!=null){o[a.char]=t.length?t:"0";return}a.left!=null&&ns(s[a.left],t+"0",s,o),a.right!=null&&ns(s[a.right],t+"1",s,o)}}
function zr(a,t){let s=0;for(const o of a){const n=t[o];n!=null&&(s+=n.length)}return s}
const Cr=`
.hfw-root {
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
.hfw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e;
}
.hfw-title { font-weight: 600; font-size: 15px; }
.hfw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.hfw-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #141925;
  border-bottom: 1px solid #2a2f3e; flex-wrap: wrap;
}
.hfw-input {
  padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-width: 240px; flex: 1;
}
.hfw-input:focus { outline: none; border-color: #4a7cff; }
.hfw-btn {
  padding: 6px 12px; background: #4a7cff; border: none;
  border-radius: 6px; color: white; font-weight: 500; cursor: pointer;
  font-size: 13px; font-family: inherit;
}
.hfw-btn:hover { background: #3b6ae8; }
.hfw-btn.hfw-ghost {
  background: transparent; border: 1px solid #2a2f3e; color: #d1d5db;
}
.hfw-btn.hfw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.hfw-btn.hfw-danger { background: #c13c3c; }
.hfw-btn.hfw-danger:hover { background: #a73232; }
.hfw-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.hfw-body {
  flex: 1; display: flex; min-height: 0;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
}
.hfw-side {
  width: 280px; padding: 14px 16px;
  border-right: 1px solid #2a2f3e; overflow: auto;
}
.hfw-side h4 {
  margin: 0 0 8px 0; font-size: 12px; color: #8a93a8;
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}
.hfw-heap {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px;
}
.hfw-heap-item {
  padding: 4px 8px; border: 1px solid #2a2f3e; border-radius: 6px;
  background: #141925; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #d1d5db;
  transition: all 250ms ease;
}
.hfw-heap-item.hfw-picked {
  border-color: #ffd24a; color: #ffd24a;
  filter: drop-shadow(0 0 6px rgba(255, 210, 74, 0.45));
}
.hfw-table {
  width: 100%; border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; margin-bottom: 18px;
}
.hfw-table th, .hfw-table td {
  text-align: left; padding: 4px 8px; border-bottom: 1px solid #2a2f3e;
}
.hfw-table th { color: #8a93a8; font-weight: 500; }
.hfw-code { color: #4a9f6f; }

.hfw-canvas-wrap {
  flex: 1; overflow: auto; padding: 20px; min-width: 0;
}

.hfw-node rect { transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease; }
.hfw-node text {
  fill: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
.hfw-node.hfw-leaf rect { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 1.5; }
.hfw-node.hfw-internal rect { fill: #2a3550; stroke: #4a5f8f; stroke-width: 1.5; }
.hfw-node.hfw-picked rect {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.6));
}
.hfw-node.hfw-merged rect {
  animation: hfw-pulse 700ms ease-in-out 1;
  stroke: #4a7cff; stroke-width: 2.5;
}
@keyframes hfw-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74,124,255,0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74,124,255,0.9)); }
}
.hfw-edge {
  fill: none; stroke: #3a4560; stroke-width: 1.5;
  transition: stroke 300ms ease;
}
.hfw-edge-label {
  fill: #8a93a8; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.hfw-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap;
}
.hfw-status { color: #d1d5db; flex: 1; min-width: 0; }
.hfw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap;
}
.hfw-stats b { color: #e6e6e6; }
`,ue=22,Yt=72,Gs=54;
function Rr(a,t){if(!a)return{positions:{},width:0,height:0};const s={};let o=0,n=0;function c(r,l){const i=t[r];if(!i)return null;if(l>n&&(n=l),i.char!=null){const m=o+ue;return o+=ue*2+Gs,s[i.id]={x:m,y:l*Yt},s[i.id]}const f=i.left!=null?c(i.left,l+1):null,p=i.right!=null?c(i.right,l+1):null,u=f&&p?(f.x+p.x)/2:(f||p).x;return s[i.id]={x:u,y:l*Yt},s[i.id]}return c(a.id,0),{positions:s,width:o-Gs+ue,height:(n+1)*Yt}}
function Er(a){const t=new Set;for(const s in a){const o=a[s];o.left&&t.add(o.left),o.right&&t.add(o.right)}return Object.keys(a).filter(s=>!t.has(s))}
const Qt="BCAADDDCCACACAC";
function Fr(){const[a,t]=h.useState(Qt),[s,o]=h.useState(Qt),n=h.useMemo(()=>Mr(s),[s]),[c,r]=h.useState(0),[l,i]=h.useState(!1),d=h.useRef(null),f=n.steps[c]||n.steps[n.steps.length-1],p=c>=n.steps.length-1;h.useEffect(()=>{r(0),i(!1)},[s]),h.useEffect(()=>{if(l){if(p){i(!1);return}return d.current=setTimeout(()=>{r(S=>Math.min(S+1,n.steps.length-1))},750),()=>clearTimeout(d.current)}},[l,c,p,n.steps.length]);function u(){o(a||Qt)}function m(){r(0),i(!1)}function w(){i(!1),r(S=>Math.min(S+1,n.steps.length-1))}function b(){i(!1),r(n.steps.length-1)}const k=f.forest||{},g=Er(k).map(S=>{const P=Rr({id:S},k);return{id:S,...P}}),z=g.reduce((S,P)=>S+P.width+40,20),F=Math.max(120,...g.map(S=>S.height+60)),M={};let y=20;for(const S of g){for(const P in S.positions)M[P]={x:S.positions[P].x+y,y:S.positions[P].y+30};y+=S.width+40}const C=Object.keys(k).filter(S=>M[S]),T=[];for(const S of C){const P=k[S];P.left&&M[P.left]&&T.push({parent:S,child:P.left,label:"0"}),P.right&&M[P.right]&&T.push({parent:S,child:P.right,label:"1"})}const v=new Set(f.picked||[]),I=f.merged,j=n.codebook,x=s.length*8,N=zr(s,j),E=Math.max(0,x-N),A=x>0?N/x:0,R=f.kind==="done";return e.jsxs("div",{className:"hfw-root",children:[e.jsx("style",{children:Cr}),e.jsx("div",{className:"hfw-head",children:e.jsxs("div",{children:[e.jsx("div",{className:"hfw-title",children:"Huffman Coding"}),e.jsx("div",{className:"hfw-sub",children:"Min-heap merges; left=0, right=1. Prefix codes, optimal for known freqs."})]})}),e.jsxs("div",{className:"hfw-bar",children:[e.jsx("input",{className:"hfw-input",value:a,onChange:S=>t(S.target.value),onKeyDown:S=>{S.key==="Enter"&&u()},placeholder:"text to encode"}),e.jsx("button",{className:"hfw-btn",onClick:u,children:"Build"}),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"hfw-btn",onClick:w,disabled:p,children:"Step"}),e.jsx("button",{className:"hfw-btn hfw-ghost",onClick:()=>i(S=>!S),disabled:p,children:l?"Pause":"Play"}),e.jsx("button",{className:"hfw-btn hfw-ghost",onClick:b,disabled:p,children:"Skip"}),e.jsx("button",{className:"hfw-btn hfw-danger",onClick:m,children:"Reset"})]}),e.jsxs("div",{className:"hfw-body",children:[e.jsxs("div",{className:"hfw-side",children:[e.jsx("h4",{children:"Frequencies"}),e.jsxs("table",{className:"hfw-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"char"}),e.jsx("th",{children:"freq"}),R&&e.jsx("th",{children:"code"})]})}),e.jsx("tbody",{children:f.freqTable&&f.freqTable.map(S=>e.jsxs("tr",{children:[e.jsxs("td",{children:["'",S.char,"'"]}),e.jsx("td",{children:S.weight}),R&&e.jsx("td",{className:"hfw-code",children:j[S.char]||""})]},S.char))})]}),e.jsxs("h4",{children:["Min-heap (",(f.heap||[]).length,")"]}),e.jsx("div",{className:"hfw-heap",children:(f.heap||[]).length===0?e.jsx("div",{style:{color:"#6a7389",fontSize:12},children:"empty"}):f.heap.map(S=>{const P=k[S];return P?e.jsxs("div",{className:"hfw-heap-item"+(v.has(S)?" hfw-picked":""),children:[P.char!=null?`'${P.char}'`:"·",":",P.weight]},S):null})}),e.jsxs("h4",{children:["Step ",c+1," / ",n.steps.length]})]}),e.jsx("div",{className:"hfw-canvas-wrap",children:C.length===0?e.jsx("div",{style:{color:"#8a93a8",textAlign:"center",padding:40},children:"No data. Type text above and click Build."}):e.jsxs("svg",{width:Math.max(z,400),height:Math.max(F,160),style:{display:"block"},children:[e.jsx("g",{children:T.map(S=>{const P=M[S.parent],L=M[S.child];if(!P||!L)return null;const B=(P.x+L.x)/2,q=(P.y+L.y)/2;return e.jsxs("g",{children:[e.jsx("line",{className:"hfw-edge",x1:P.x,y1:P.y+ue,x2:L.x,y2:L.y-ue}),e.jsx("text",{className:"hfw-edge-label",x:B+8,y:q,children:S.label})]},S.parent+"-"+S.child)})}),e.jsx("g",{children:C.map(S=>{const P=k[S],L=M[S],B=P.char!=null,q=["hfw-node"];return q.push(B?"hfw-leaf":"hfw-internal"),v.has(S)&&q.push("hfw-picked"),I===S&&q.push("hfw-merged"),e.jsxs("g",{className:q.join(" "),children:[e.jsx("rect",{x:L.x-ue,y:L.y-ue,width:ue*2,height:ue*2,rx:8,ry:8}),e.jsx("text",{x:L.x,y:L.y-4,style:{fontSize:B?14:12,fontWeight:600},children:B?`'${P.char}'`:"•"}),e.jsxs("text",{x:L.x,y:L.y+10,style:{fontSize:10,fill:"#8a93a8"},children:["w=",P.weight]})]},S)})})]})})]}),e.jsxs("div",{className:"hfw-footer",children:[e.jsxs("div",{className:"hfw-status",children:["Status: ",f.note]}),e.jsxs("div",{className:"hfw-stats",children:["input=",e.jsxs("b",{children:[s.length,"ch"]}),"   fixed8=",e.jsxs("b",{children:[x,"bits"]}),"   huffman=",e.jsxs("b",{children:[N,"bits"]}),"   saved=",e.jsxs("b",{children:[E,"bits"]}),"   ratio=",e.jsxs("b",{children:[(A*100).toFixed(1),"%"]})]})]})]})}

export default Fr;
export { Fr as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Fr, {}));
  return () => root.unmount();
}
