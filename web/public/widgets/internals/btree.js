import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let cl=0;
function xa(){return"n"+cl++}
function Ho(){return{id:xa(),isLeaf:!0,keys:[],values:[],nextLeaf:null}}
function Ko(n,t){return{id:xa(),isLeaf:!1,keys:n||[],children:t||[]}}
function wn(n,t){let s=0,r=n.length;for(;s<r;){const o=s+r>>>1;n[o]<t?s=o+1:r=o}return s}
class Uo{constructor({order:t=4}={}){if(t<3)throw new Error("order must be >= 3 (otherwise splits cannot make progress)");this.order=t,this.maxKeys=t-1,this.minKeys=Math.ceil(t/2)-1,this.root=Ho()}search(t){const s=[];let r=this.root;for(;r&&!r.isLeaf;){s.push(r.id);let a=0;for(;a<r.keys.length&&t>=r.keys[a];)a++;r=r.children[a]}if(!r)return{path:s,found:!1,value:void 0,leafId:null};s.push(r.id);const o=wn(r.keys,t),i=o<r.keys.length&&r.keys[o]===t;return{path:s,found:i,value:i?r.values[o]:void 0,leafId:r.id}}insert(t,s){s===void 0&&(s=String(t));const r=[],o=[],i=[];let a=this.root;for(;!a.isLeaf;){r.push(a.id);let C=0;for(;C<a.keys.length&&t>=a.keys[C];)C++;i.push({node:a,childIndex:C}),a=a.children[C]}r.push(a.id);const l=a,d=wn(l.keys,t);if(d<l.keys.length&&l.keys[d]===t)return l.values[d]=s,{path:r,splits:o,updated:!0,rootChanged:!1};if(l.keys.splice(d,0,t),l.values.splice(d,0,s),l.keys.length<=this.maxKeys)return{path:r,splits:o,updated:!1,rootChanged:!1};let c=!1,{promotedKey:p,newSibling:m}=this._splitLeaf(l);o.push({level:0,sourceId:l.id,newSiblingId:m.id,promotedKey:p,parentId:i.length?i[i.length-1].node.id:null});let g=1;for(;i.length;){const{node:C,childIndex:j}=i.pop();if(C.keys.splice(j,0,p),C.children.splice(j+1,0,m),C.keys.length<=this.maxKeys)return{path:r,splits:o,updated:!1,rootChanged:c};const $=this._splitInternal(C);p=$.promotedKey,m=$.newSibling,o.push({level:g,sourceId:C.id,newSiblingId:m.id,promotedKey:p,parentId:i.length?i[i.length-1].node.id:null}),g++}const w=Ko([p],[this.root,m]);return this.root=w,c=!0,o[o.length-1].parentId=w.id,{path:r,splits:o,updated:!1,rootChanged:c}}_splitLeaf(t){const s=t.keys.length,r=Math.floor(s/2),o=Ho();return o.keys=t.keys.splice(r),o.values=t.values.splice(r),o.nextLeaf=t.nextLeaf,t.nextLeaf=o,{promotedKey:o.keys[0],newSibling:o}}_splitInternal(t){const s=t.keys.length,r=Math.floor(s/2),o=t.keys[r],i=Ko(t.keys.slice(r+1),t.children.slice(r+1));return t.keys.length=r,t.children.length=r+1,{promotedKey:o,newSibling:i}}delete(t){const s=[];let r=this.root;for(;r&&!r.isLeaf;){s.push(r.id);let a=0;for(;a<r.keys.length&&t>=r.keys[a];)a++;r=r.children[a]}if(!r)return{path:s,deleted:!1,value:void 0,leafEmpty:!1};s.push(r.id);const o=wn(r.keys,t);if(o>=r.keys.length||r.keys[o]!==t)return{path:s,deleted:!1,value:void 0,leafEmpty:r.keys.length===0};const[i]=r.values.splice(o,1);return r.keys.splice(o,1),{path:s,deleted:!0,value:i,leafEmpty:r.keys.length===0}}toJSON(){const t=s=>s.isLeaf?{id:s.id,isLeaf:!0,keys:s.keys.slice(),values:s.values.slice(),nextLeafId:s.nextLeaf?s.nextLeaf.id:null}:{id:s.id,isLeaf:!1,keys:s.keys.slice(),children:s.children.map(t)};return{order:this.order,maxKeys:this.maxKeys,minKeys:this.minKeys,root:t(this.root)}}snapshot(){return this.toJSON()}stats(){let t=0,s=0,r=0;const o=(i,a)=>{if(t++,a>r&&(r=a),i.isLeaf){s+=i.keys.length;return}for(const l of i.children)o(l,a+1)};return o(this.root,0),{height:r,nodes:t,keys:s}}}
const dl=`
.btw-root {
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
.btw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.btw-title { font-weight: 600; font-size: 15px; }
.btw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.btw-head-right { display: flex; gap: 8px; align-items: center; }
.btw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.btw-input, .btw-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.btw-input { width: 90px; }
.btw-input.btw-input-val { width: 120px; }
.btw-input:focus, .btw-select:focus {
  outline: none; border-color: #4a7cff;
}
.btw-btn {
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
.btw-btn:hover { background: #3b6ae8; }
.btw-btn.btw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.btw-btn.btw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.btw-btn.btw-danger { background: #c13c3c; }
.btw-btn.btw-danger:hover { background: #a73232; }
.btw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.btw-canvas-wrap {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background:
    radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}
.btw-footer {
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
.btw-status { color: #d1d5db; flex: 1; min-width: 0; }
.btw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.btw-stats b { color: #e6e6e6; }

/* SVG node styling + animations */
.btw-node rect {
  transition: fill 400ms ease, stroke 400ms ease, filter 400ms ease;
}
.btw-node text {
  fill: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
  user-select: none;
}
.btw-node.btw-internal rect {
  fill: #2a3550;
  stroke: #4a5f8f;
  stroke-width: 1.5;
}
.btw-node.btw-leaf rect {
  fill: #1f3a2e;
  stroke: #4a9f6f;
  stroke-width: 1.5;
}
.btw-node.btw-on-path rect {
  stroke: #ffd24a;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.btw-node.btw-splitting rect {
  stroke: #ff5c5c;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 10px rgba(255, 92, 92, 0.7));
  animation: btw-flash-red 600ms ease-in-out;
}
.btw-node.btw-new-sibling rect {
  animation: btw-fade-in 500ms ease-out;
}
.btw-node.btw-promote rect {
  animation: btw-pulse 600ms ease-in-out 1;
}
.btw-node.btw-inserted rect {
  animation: btw-pulse-green 600ms ease-in-out 1;
}
@keyframes btw-flash-red {
  0%   { fill: #1f3a2e; }
  40%  { fill: #5a2020; }
  100% { fill: #1f3a2e; }
}
@keyframes btw-fade-in {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes btw-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 124, 255, 0.9)); }
}
@keyframes btw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.btw-edge {
  fill: none;
  stroke: #3a4560;
  stroke-width: 1.5;
  transition: stroke 400ms ease;
}
.btw-edge.btw-edge-on-path {
  stroke: #ffd24a;
  stroke-width: 2.5;
}
.btw-empty {
  color: #8a93a8;
  text-align: center;
  padding: 40px;
  font-style: italic;
}
`,Ps=42,pl=10,hl=9,ul=16,kn=70;
function ml(n){const t=n.keys.length?n.keys.join(", "):"∅";return Math.max(48,t.length*hl+pl*2)}
function fl(n){const t={};let s=0,r=0;function o(l,d){d>r&&(r=d);const c=ml(l);if(l.isLeaf||!l.children||l.children.length===0){const C=s+c/2;return s+=c+ul,t[l.id]={x:C,y:d*kn,w:c},t[l.id]}const p=l.children.map(C=>o(C,d+1)),m=p[0],g=p[p.length-1],w=(m.x+g.x)/2;return t[l.id]={x:w,y:d*kn,w:c},t[l.id]}o(n,0);const i=s,a=(r+1)*kn;return{positions:t,width:i,height:a,depth:r}}
function xl(n){const t=[],s=[];return(function r(o){if(t.push(o),!o.isLeaf&&o.children)for(const i of o.children)s.push({parent:o.id,child:i.id}),r(i)})(n),{nodes:t,edges:s}}
const gl=[7,3,18,10,22,26,6,15],bl=[3,4,5,6];
function yl(){const[n,t]=h.useState(4),s=h.useRef(new Uo({order:4})),[r,o]=h.useState(()=>s.current.snapshot()),[i,a]=h.useState("Empty tree. Insert keys to begin. (Book: Petrov, Database Internals, ch.2 + ch.4.)"),[l,d]=h.useState(""),[c,p]=h.useState(""),[m,g]=h.useState({onPath:new Set,splitting:new Set,newSibling:new Set,promote:new Set,inserted:new Set}),w=h.useRef(null);function C(z){w.current&&clearTimeout(w.current),g(z),w.current=setTimeout(()=>{g({onPath:new Set,splitting:new Set,newSibling:new Set,promote:new Set,inserted:new Set})},850)}h.useEffect(()=>()=>w.current&&clearTimeout(w.current),[]);function j(z){s.current=new Uo({order:z}),o(s.current.snapshot()),a(`Reset tree with order ${z} (max keys per node = ${z-1}).`),C({onPath:new Set,splitting:new Set,newSibling:new Set,promote:new Set,inserted:new Set})}function $(z){const E=Number(z.target.value);t(E),j(E)}function O(z,E){if(!Number.isFinite(z)){a("Insert needs a numeric key.");return}const J=E&&E.length?E:String(z),Y=s.current.insert(z,J),se=s.current.snapshot();o(se);const A=new Set(Y.path),K=new Set,Q=new Set,X=new Set,ee=new Set;ee.add(Y.path[Y.path.length-1]);for(const F of Y.splits)K.add(F.sourceId),Q.add(F.newSiblingId),F.parentId&&X.add(F.parentId);if(C({onPath:A,splitting:K,newSibling:Q,promote:X,inserted:ee}),Y.updated)a(`Updated key ${z}: leaf ${Y.path[Y.path.length-1]} now holds value '${J}'.`);else if(Y.splits.length===0)a(`Inserted ${z}: placed in leaf ${Y.path[Y.path.length-1]}. No split.`);else{const F=Y.splits.map(Z=>{const W=Z.parentId?`promoted ${Z.promotedKey} to ${Z.parentId}`:`promoted ${Z.promotedKey} to new root`;return`${Z.sourceId} split → ${Z.newSiblingId}, ${W}`}),U=Y.rootChanged?" Tree height increased.":"";a(`Inserted ${z}: ${F.join("; ")}.${U}`)}}function q(z){if(!Number.isFinite(z)){a("Delete needs a numeric key.");return}const E=s.current.delete(z),J=s.current.snapshot();o(J);const Y=new Set(E.path);C({onPath:Y,splitting:new Set,newSibling:new Set,promote:new Set,inserted:new Set}),E.deleted?a(`Deleted ${z} from leaf ${E.path[E.path.length-1]}: was '${E.value}'.`+(E.leafEmpty?" Leaf is now empty (lazy — no merge).":"")):a(`Delete ${z}: key not found (traversed ${E.path.length} node(s)).`)}function R(z){if(!Number.isFinite(z)){a("Search needs a numeric key.");return}const E=s.current.search(z),J=new Set(E.path);C({onPath:J,splitting:new Set,newSibling:new Set,promote:new Set,inserted:new Set});const Y=E.path.join(" → ");a(E.found?`Searched ${z}: traversed ${Y}. Found value '${E.value}'.`:`Searched ${z}: traversed ${Y}. Not found.`)}const D=()=>{const z=Number(l);return Number.isFinite(z)?z:NaN};function B(){O(D(),c.trim()),d(""),p("")}function V(){q(D()),d("")}function T(){R(D())}function _(z){z.key==="Enter"&&B()}const b=h.useMemo(()=>{let z=0,E=0,J=0;return(function Y(se,A){if(z++,A>J&&(J=A),se.isLeaf)E+=se.keys.length;else for(const K of se.children)Y(K,A+1)})(r.root,0),{nodes:z,keys:E,height:J}},[r]),{positions:x,width:f,height:u}=h.useMemo(()=>fl(r.root),[r]),{nodes:y,edges:v}=h.useMemo(()=>xl(r.root),[r]),I=20,S=20,H=Math.max(f+I*2,400),M=Math.max(u+S*2,160),k=m.onPath,P=z=>k.has(z.parent)&&k.has(z.child),N=r.root.isLeaf&&r.root.keys.length===0;return e.jsxs("div",{className:"btw-root",children:[e.jsx("style",{children:dl}),e.jsxs("div",{className:"btw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"btw-title",children:"B-Tree Visualizer"}),e.jsxs("div",{className:"btw-sub",children:["Chapters 2 + 4, Petrov: ",e.jsx("i",{children:'"Database Internals"'})," — B+ tree semantics, max keys/node = order − 1"]})]}),e.jsxs("div",{className:"btw-head-right",children:[e.jsx("label",{className:"btw-quick",children:"Order:"}),e.jsx("select",{className:"btw-select",value:n,onChange:$,children:bl.map(z=>e.jsx("option",{value:z,children:z},z))}),e.jsx("button",{className:"btw-btn btw-danger",onClick:()=>j(n),children:"Reset"})]})]}),e.jsxs("div",{className:"btw-bar",children:[e.jsx("input",{className:"btw-input",placeholder:"key",type:"number",value:l,onChange:z=>d(z.target.value),onKeyDown:_}),e.jsx("input",{className:"btw-input btw-input-val",placeholder:"value (opt)",value:c,onChange:z=>p(z.target.value),onKeyDown:_}),e.jsx("button",{className:"btw-btn",onClick:B,children:"Insert"}),e.jsx("button",{className:"btw-btn btw-ghost",onClick:V,children:"Delete"}),e.jsx("button",{className:"btw-btn btw-ghost",onClick:T,children:"Search"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"btw-quick",children:"Quick-insert:"}),gl.map(z=>e.jsx("button",{className:"btw-btn btw-ghost",onClick:()=>O(z,String(z)),children:z},z))]}),e.jsx("div",{className:"btw-canvas-wrap",children:N?e.jsx("div",{className:"btw-empty",children:"Tree is empty. Try a quick-insert button, or type a key and click Insert."}):e.jsxs("svg",{width:H,height:M,viewBox:`0 0 ${H} ${M}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:v.map(z=>{const E=x[z.parent],J=x[z.child];if(!E||!J)return null;const Y=E.x+I,se=E.y+S+Ps/2,A=J.x+I,K=J.y+S-Ps/2,Q=(se+K)/2,X=`M ${Y} ${se} C ${Y} ${Q}, ${A} ${Q}, ${A} ${K}`;return e.jsx("path",{className:"btw-edge"+(P(z)?" btw-edge-on-path":""),d:X},z.parent+"->"+z.child)})}),e.jsx("g",{children:y.map(z=>{const E=x[z.id];if(!E)return null;const J=z.keys.length?z.keys.join(", "):"∅",Y=E.w,se=E.x+I-Y/2,A=E.y+S-Ps/2,K=["btw-node"];return K.push(z.isLeaf?"btw-leaf":"btw-internal"),m.onPath.has(z.id)&&K.push("btw-on-path"),m.splitting.has(z.id)&&K.push("btw-splitting"),m.newSibling.has(z.id)&&K.push("btw-new-sibling"),m.promote.has(z.id)&&K.push("btw-promote"),m.inserted.has(z.id)&&K.push("btw-inserted"),e.jsxs("g",{className:K.join(" "),children:[e.jsx("rect",{x:se,y:A,width:Y,height:Ps,rx:8,ry:8}),e.jsx("text",{x:E.x+I,y:E.y+S,children:J}),e.jsx("text",{x:E.x+I,y:E.y+S+Ps/2+12,style:{fill:"#6a7389",fontSize:10},children:z.id})]},z.id)})})]})}),e.jsxs("div",{className:"btw-footer",children:[e.jsxs("div",{className:"btw-status",children:["Status: ",i]}),e.jsxs("div",{className:"btw-stats",children:["height=",e.jsx("b",{children:b.height}),"   nodes=",e.jsx("b",{children:b.nodes}),"   keys=",e.jsx("b",{children:b.keys}),"   order=",e.jsx("b",{children:r.order}),"   maxKeys=",e.jsx("b",{children:r.maxKeys})]})]})]})}

export default yl;
export { yl as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(yl, {}));
  return () => root.unmount();
}
