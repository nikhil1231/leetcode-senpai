import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const we="R",re="B";
let ho=0;
function xo(){return"r"+ho++}
function mo(a,t,s){return{id:xo(),key:a,color:t,left:s,right:s,parent:s}}
class wo{constructor(){this.NIL={id:"NIL",key:null,color:re,left:null,right:null,parent:null},this.NIL.left=this.NIL,this.NIL.right=this.NIL,this.NIL.parent=this.NIL,this.root=this.NIL}clear(){this.root=this.NIL}_rotateLeft(t){const s=t.right;t.right=s.left,s.left!==this.NIL&&(s.left.parent=t),s.parent=t.parent,t.parent===this.NIL?this.root=s:t===t.parent.left?t.parent.left=s:t.parent.right=s,s.left=t,t.parent=s}_rotateRight(t){const s=t.left;t.left=s.right,s.right!==this.NIL&&(s.right.parent=t),s.parent=t.parent,t.parent===this.NIL?this.root=s:t===t.parent.right?t.parent.right=s:t.parent.left=s,s.right=t,t.parent=s}insert(t){const s=[],o=[],n=this.NIL;let c=n,r=this.root;for(;r!==n;){if(s.push(r.id),c=r,t===r.key)return o.push({kind:"DUPLICATE",nodeId:r.id}),{path:s,events:o,duplicate:!0,insertedId:r.id};r=t<r.key?r.left:r.right}const l=mo(t,we,n);l.parent=c,c===n?this.root=l:t<c.key?c.left=l:c.right=l,s.push(l.id),o.push({kind:"INSERT",nodeId:l.id});let i=l;for(;i.parent.color===we;){const d=i.parent,f=d.parent;if(d===f.left){const p=f.right;if(p.color===we)d.color=re,p.color=re,f.color=we,o.push({kind:"CASE1",nodeId:i.id,parentId:d.id,uncleId:p.id,grandId:f.id,note:"Uncle RED → recolor parent+uncle BLACK, grandparent RED; move focus to grandparent."}),i=f;else{i===d.right&&(o.push({kind:"CASE2",nodeId:i.id,parentId:d.id,grandId:f.id,note:"Uncle BLACK, zig-zag → rotate left at parent to align."}),i=d,this._rotateLeft(i));const u=i.parent,m=u.parent;u.color=re,m.color=we,o.push({kind:"CASE3",nodeId:i.id,parentId:u.id,grandId:m.id,note:"Uncle BLACK, aligned → recolor + rotate right at grandparent."}),this._rotateRight(m)}}else{const p=f.left;if(p.color===we)d.color=re,p.color=re,f.color=we,o.push({kind:"CASE1",nodeId:i.id,parentId:d.id,uncleId:p.id,grandId:f.id,note:"Uncle RED → recolor parent+uncle BLACK, grandparent RED; move focus to grandparent."}),i=f;else{i===d.left&&(o.push({kind:"CASE2",nodeId:i.id,parentId:d.id,grandId:f.id,note:"Uncle BLACK, zig-zag → rotate right at parent to align."}),i=d,this._rotateRight(i));const u=i.parent,m=u.parent;u.color=re,m.color=we,o.push({kind:"CASE3",nodeId:i.id,parentId:u.id,grandId:m.id,note:"Uncle BLACK, aligned → recolor + rotate left at grandparent."}),this._rotateLeft(m)}}}return this.root.color!==re&&(this.root.color=re,o.push({kind:"ROOT_BLACK",nodeId:this.root.id})),{path:s,events:o,duplicate:!1,insertedId:l.id}}snapshot(){const t=this.NIL,s=o=>o===t?null:{id:o.id,key:o.key,color:o.color,left:s(o.left),right:s(o.right)};return{root:s(this.root)}}blackHeight(t){const s=this.NIL;if(t===s)return 1;let o=0,n=t;for(;n!==s;)n.color===re&&o++,n=n.left;return o+1}stats(){const t=this.NIL;let s=0,o=-1;const n=(c,r)=>{c!==t&&(s++,r>o&&(o=r),n(c.left,r+1),n(c.right,r+1))};return n(this.root,0),{nodes:s,height:o,blackHeight:this.blackHeight(this.root)}}}
const bo=`
.rbw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.rbw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.rbw-title { font-weight: 600; font-size: 15px; }
.rbw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.rbw-head-right { display: flex; gap: 8px; align-items: center; }
.rbw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.rbw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 90px; }
.rbw-input:focus { outline: none; border-color: #4a7cff; }
.rbw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.rbw-btn:hover { background: #3b6ae8; }
.rbw-btn.rbw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.rbw-btn.rbw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.rbw-btn.rbw-danger { background: #c13c3c; }
.rbw-btn.rbw-danger:hover { background: #a73232; }
.rbw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.rbw-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px; }
.rbw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.rbw-status { color: #d1d5db; flex: 1; min-width: 0; }
.rbw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.rbw-stats b { color: #e6e6e6; }

.rbw-node text { fill: #fff; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none; font-weight: 600; }
.rbw-node.rbw-red circle { fill: #c13c3c; stroke: #ff7575; stroke-width: 1.5; }
.rbw-node.rbw-black circle { fill: #1a1f2e; stroke: #5a6380; stroke-width: 1.5; }
.rbw-node.rbw-on-path circle { stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55)); }
.rbw-node.rbw-fixup circle { animation: rbw-pulse-blue 700ms ease-out 1; }
.rbw-node.rbw-inserted circle { animation: rbw-pulse-green 700ms ease-out 1; }
@keyframes rbw-pulse-blue {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 124, 255, 0.9)); }
}
@keyframes rbw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.rbw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; }
.rbw-empty { color: #8a93a8; text-align: center; padding: 40px; font-style: italic; }
.rbw-events { font-size: 12px; color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 8px 16px; background: #0f1419; border-top: 1px solid #2a2f3e;
  max-height: 110px; overflow: auto; }
.rbw-events div { margin: 2px 0; }
.rbw-ev-case1 { color: #ffd24a; }
.rbw-ev-case2 { color: #4a7cff; }
.rbw-ev-case3 { color: #4a9f6f; }
`,De=18,on=62,Pt=16;
function go(a){const t={};let s=0,o=0;function n(c,r){if(!c)return null;r>o&&(o=r);const l=n(c.left,r+1),i=s;s+=De*2+Pt;const d=n(c.right,r+1);let f=i+De;return l&&d?f=(l.x+d.x)/2:l?f=l.x+De*2+Pt:d&&(f=d.x-De*2-Pt),t[c.id]={x:f,y:r*on+De},t[c.id]}return n(a,0),{positions:t,depth:o,width:s}}
function ko(a){const t=[],s=[];return(function o(n){n&&(t.push(n),n.left&&(s.push({p:n.id,c:n.left.id}),o(n.left)),n.right&&(s.push({p:n.id,c:n.right.id}),o(n.right)))})(a),{nodes:t,edges:s}}
const yo=[10,5,20,3],jo=[10,5,20,3,4],vo=[10,5,20,3,2],qt=[10,20,30,15,25,5,1,40,35,28];
function No(){const a=h.useRef(new wo),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState("Red-Black tree. Insert keys — fix-up restores the invariants."),[c,r]=h.useState([]),[l,i]=h.useState(""),[d,f]=h.useState({path:new Set,inserted:null,fixup:new Set}),p=h.useRef(null);function u(j){p.current&&clearTimeout(p.current),f(j),p.current=setTimeout(()=>f({path:new Set,inserted:null,fixup:new Set}),1e3)}h.useEffect(()=>()=>p.current&&clearTimeout(p.current),[]);function m(){s(a.current.snapshot())}function w(j){if(!Number.isFinite(j)){n("Insert needs a numeric key.");return}const x=a.current.insert(j);m();const N=new Set;for(const A of x.events)A.kind.startsWith("CASE")&&A.grandId&&N.add(A.grandId),A.kind.startsWith("CASE")&&A.parentId&&N.add(A.parentId);u({path:new Set(x.path),inserted:x.duplicate?null:x.insertedId,fixup:N}),r(x.events);const E=x.events.filter(A=>A.kind.startsWith("CASE")).map(A=>A.kind);x.duplicate?n(`Insert ${j}: duplicate.`):E.length===0?n(`Insert ${j}: no fix-up needed (parent was BLACK or root).`):n(`Insert ${j}: fix-up ran [${E.join(" → ")}].`)}function b(j,x){a.current.clear();for(const N of j)a.current.insert(N);m(),r([]),u({path:new Set,inserted:null,fixup:new Set}),n(`Seeded ${x}: [${j.join(", ")}].`)}h.useEffect(()=>{for(const j of qt)a.current.insert(j);m(),n(`Seeded demo [${qt.join(", ")}].`)},[]);const k=()=>{const j=Number(l);return Number.isFinite(j)?j:NaN},$=h.useMemo(()=>{let j=0,x=-1,N=0;const E=(S,P)=>{S&&(j++,P>x&&(x=P),S.color==="R"&&N++,E(S.left,P+1),E(S.right,P+1))};E(t.root,0);let A=t.root,R=0;for(;A;)A.color==="B"&&R++,A=A.left;return R+=1,{nodes:j,height:x,reds:N,bh:R}},[t]),{positions:g,width:z}=h.useMemo(()=>go(t.root),[t]),{nodes:F,edges:M}=h.useMemo(()=>ko(t.root),[t]),y=24,C=24,T=Math.max(z+y*2,520),v=Math.max(($.height+1)*on+C*2,180),I=t.root===null;return e.jsxs("div",{className:"rbw-root",children:[e.jsx("style",{children:bo}),e.jsxs("div",{className:"rbw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"rbw-title",children:"Red-Black Tree"}),e.jsx("div",{className:"rbw-sub",children:"CLRS ch.13 — 3 insert fix-up cases; black-height is constant on every root→NIL path."})]}),e.jsx("div",{className:"rbw-head-right",children:e.jsx("button",{className:"rbw-btn rbw-danger",onClick:()=>{a.current.clear(),m(),r([]),n("Cleared.")},children:"Reset"})})]}),e.jsxs("div",{className:"rbw-bar",children:[e.jsx("input",{className:"rbw-input",placeholder:"key",type:"number",value:l,onChange:j=>i(j.target.value),onKeyDown:j=>{j.key==="Enter"&&(w(k()),i(""))}}),e.jsx("button",{className:"rbw-btn",onClick:()=>{w(k()),i("")},children:"Insert"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"rbw-quick",children:"Case demos:"}),e.jsx("button",{className:"rbw-btn rbw-ghost",onClick:()=>b(yo,"Case 1 (uncle RED)"),children:"Case 1"}),e.jsx("button",{className:"rbw-btn rbw-ghost",onClick:()=>b(jo,"Case 2 (zig-zag)"),children:"Case 2"}),e.jsx("button",{className:"rbw-btn rbw-ghost",onClick:()=>b(vo,"Case 3 (aligned)"),children:"Case 3"}),e.jsx("button",{className:"rbw-btn rbw-ghost",onClick:()=>b(qt,"demo"),children:"demo"})]}),e.jsx("div",{className:"rbw-canvas-wrap",children:I?e.jsx("div",{className:"rbw-empty",children:"Empty tree. Try a case-demo button."}):e.jsxs("svg",{width:T,height:v,viewBox:`0 0 ${T} ${v}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:M.map(j=>{const x=g[j.p],N=g[j.c];if(!x||!N)return null;const E=x.x+y,A=x.y+C,R=N.x+y,S=N.y+C,P=(A+S)/2,L=`M ${E} ${A} C ${E} ${P}, ${R} ${P}, ${R} ${S}`;return e.jsx("path",{className:"rbw-edge",d:L},j.p+"->"+j.c)})}),e.jsx("g",{children:F.map(j=>{const x=g[j.id];if(!x)return null;const N=["rbw-node"];return N.push(j.color==="R"?"rbw-red":"rbw-black"),d.path.has(j.id)&&N.push("rbw-on-path"),d.fixup.has(j.id)&&N.push("rbw-fixup"),d.inserted===j.id&&N.push("rbw-inserted"),e.jsxs("g",{className:N.join(" "),children:[e.jsx("circle",{cx:x.x+y,cy:x.y+C,r:De}),e.jsx("text",{x:x.x+y,y:x.y+C,children:j.key})]},j.id)})})]})}),c.length>0&&e.jsx("div",{className:"rbw-events",children:c.map((j,x)=>{const N=j.kind==="CASE1"?"rbw-ev-case1":j.kind==="CASE2"?"rbw-ev-case2":j.kind==="CASE3"?"rbw-ev-case3":"";return e.jsxs("div",{className:N,children:["[",j.kind,"] ",j.note||JSON.stringify(j)]},x)})}),e.jsxs("div",{className:"rbw-footer",children:[e.jsxs("div",{className:"rbw-status",children:["Status: ",o]}),e.jsxs("div",{className:"rbw-stats",children:["nodes=",e.jsx("b",{children:$.nodes}),"   height=",e.jsx("b",{children:$.height}),"  reds=",e.jsx("b",{children:$.reds}),"   bh=",e.jsx("b",{children:$.bh})]})]})]})}

export default No;
export { No as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(No, {}));
  return () => root.unmount();
}
