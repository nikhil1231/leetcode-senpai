import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let vl=0;
function Vo(){return"n"+vl++}
let wl=0;
function kl(){return"r"+wl++}
function Go(n,t){let s=0,r=n.length;for(;s<r;){const o=s+r>>>1;n[o]<t?s=o+1:r=o}return s}
class Yo{constructor({order:t=4}={}){if(t<3)throw new Error("order must be >= 3 (otherwise splits cannot make progress)");this.order=t,this.maxKeys=t-1,this.minKeys=Math.ceil(t/2)-1,this.nodes=Object.create(null),this._rootId=null,this.history=[],this._pins=Object.create(null);const s=this._makeLeaf();this._rootId=s.id,this._recordRoot(s.id,"initial")}_makeLeaf(t=[],s=[]){const r={id:Vo(),isLeaf:!0,keys:t.slice(),values:s.slice()};return this.nodes[r.id]=r,r}_makeInternal(t=[],s=[]){const r={id:Vo(),isLeaf:!1,keys:t.slice(),children:s.slice()};return this.nodes[r.id]=r,r}_clone(t){return t.isLeaf?this._makeLeaf(t.keys,t.values):this._makeInternal(t.keys,t.children)}_recordRoot(t,s){const r=kl();this.history.push({rootId:t,rootName:r,ts:Date.now(),label:s||null})}currentRoot(){return this._rootId}snapshot(){return this._dumpState()}_dumpState(){const t={};for(const s of Object.keys(this.nodes)){const r=this.nodes[s];t[s]=r.isLeaf?{id:s,isLeaf:!0,keys:r.keys.slice(),values:r.values.slice()}:{id:s,isLeaf:!1,keys:r.keys.slice(),children:r.children.slice()}}return{order:this.order,maxKeys:this.maxKeys,minKeys:this.minKeys,nodes:t,currentRoot:this._rootId,roots:this.history.map(s=>({...s})),pins:{...this._pins}}}search(t,s=null){const r=s||this._rootId;if(!r||!this.nodes[r])return{path:[],found:!1,value:void 0,leafId:null};const o=[];let i=this.nodes[r];for(;i&&!i.isLeaf;){o.push(i.id);let d=0;for(;d<i.keys.length&&t>=i.keys[d];)d++;i=this.nodes[i.children[d]]}if(!i)return{path:o,found:!1,value:void 0,leafId:null};o.push(i.id);const a=Go(i.keys,t),l=a<i.keys.length&&i.keys[a]===t;return{path:o,found:l,value:l?i.values[a]:void 0,leafId:i.id}}insert(t,s){s===void 0&&(s=String(t));const r=[];let o=this.nodes[this._rootId];for(;!o.isLeaf;){let O=0;for(;O<o.keys.length&&t>=o.keys[O];)O++;r.push({node:o,childIndex:O}),o=this.nodes[o.children[O]]}const i=o,a=this._rootId,l=r.map(O=>O.node.id).concat(i.id),d=this._clone(i),c=[{oldId:i.id,newId:d.id}],p=[],m=Go(d.keys,t);if(m<d.keys.length&&d.keys[m]===t){d.values[m]=s;const O=this._rebuildPath(r,i.id,d.id,null,null,c,p);return{newRootId:O.newRootId,oldRootId:a,oldPath:l,clonedNodes:c,newNodes:p,sharedNodes:this._computeSharedNodes(a,O.newRootId,c,p),splits:[],updated:!0,rootChanged:O.rootChanged}}d.keys.splice(m,0,t),d.values.splice(m,0,s);const g=[];let w=null,C=null;if(d.keys.length>this.maxKeys){const{promotedKey:O,newSibling:q}=this._splitLeaf(d);p.push(q.id),g.push({level:0,sourceOldId:i.id,sourceNewId:d.id,newSiblingId:q.id,promotedKey:O}),w=q,C=O}const j=this._rebuildPath(r,i.id,d.id,C,w,c,p,g),$=this._computeSharedNodes(a,j.newRootId,c,p);return{newRootId:j.newRootId,oldRootId:a,oldPath:l,clonedNodes:c,newNodes:p,sharedNodes:$,splits:g,updated:!1,rootChanged:j.rootChanged}}_rebuildPath(t,s,r,o,i,a,l,d){let c=s,p=r,m=1;for(;t.length;){const{node:C,childIndex:j}=t.pop(),$=this._clone(C);if(a.push({oldId:C.id,newId:$.id}),$.children[j]=p,i&&($.keys.splice(j,0,o),$.children.splice(j+1,0,i.id),i=null,o=null),$.keys.length>this.maxKeys){const{promotedKey:O,newSibling:q}=this._splitInternal($);l.push(q.id),d&&d.push({level:m,sourceOldId:C.id,sourceNewId:$.id,newSiblingId:q.id,promotedKey:O}),i=q,o=O}c=C.id,p=$.id,m++}let g=!1;if(i){const C=this._makeInternal([o],[p,i.id]);l.push(C.id),d&&d.push({level:m,sourceOldId:c,sourceNewId:p,newSiblingId:i.id,promotedKey:o,newRootId:C.id}),p=C.id,g=!0}const w=this._rootId;return this._rootId=p,w!==p&&(g?this._recordRoot(p,"+height"):this._recordRoot(p,null)),{newRootId:p,rootChanged:g}}_splitLeaf(t){const s=t.keys.length,r=Math.floor(s/2),o=this._makeLeaf(t.keys.slice(r),t.values.slice(r));return t.keys.length=r,t.values.length=r,{promotedKey:o.keys[0],newSibling:o}}_splitInternal(t){const s=t.keys.length,r=Math.floor(s/2),o=t.keys[r],i=this._makeInternal(t.keys.slice(r+1),t.children.slice(r+1));return t.keys.length=r,t.children.length=r+1,{promotedKey:o,newSibling:i}}_computeSharedNodes(t,s,r,o){if(!t||!s)return[];const i=this._reachableFrom(t),a=this._reachableFrom(s),l=[];for(const d of a)i.has(d)&&l.push(d);return l}_reachableFrom(t){const s=new Set;if(!t||!this.nodes[t])return s;const r=[t];for(;r.length;){const o=r.pop();if(s.has(o))continue;const i=this.nodes[o];if(i&&(s.add(o),!i.isLeaf))for(const a of i.children)r.push(a)}return s}pinReader(t){const s=t||this._rootId;return this.nodes[s]?(this._pins[s]=(this._pins[s]||0)+1,!0):!1}unpinReader(t){const s=t||this._rootId;return this._pins[s]?(this._pins[s]--,this._pins[s]<=0&&delete this._pins[s],!0):!1}gc(){const t=Object.keys(this.nodes).length,s=new Set,r=a=>{for(const l of this._reachableFrom(a))s.add(l)};r(this._rootId);for(const a of Object.keys(this._pins))r(a);const o=[];for(const a of Object.keys(this.nodes))s.has(a)||(o.push(a),delete this.nodes[a]);this.history=this.history.filter(a=>this.nodes[a.rootId]);const i=Object.keys(this.nodes).length;return{freed:o,liveBefore:t,liveAfter:i}}sizeOf(t){return this._reachableFrom(t||this._rootId).size}reachabilityMap(){[this._rootId,...Object.keys(this._pins)];const t=new Set([this._rootId]);for(const r of this.history)t.add(r.rootId);const s={};for(const r of t)for(const o of this._reachableFrom(r))s[o]||(s[o]=new Set),s[o].add(r);return s}}
const jl=`
.cow-root {
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
.cow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.cow-title { font-weight: 600; font-size: 15px; }
.cow-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.cow-head-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cow-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.cow-bar-sep {
  width: 1px;
  height: 22px;
  background: #2a2f3e;
  margin: 0 4px;
}
.cow-input, .cow-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.cow-input { width: 90px; }
.cow-input.cow-input-val { width: 120px; }
.cow-input:focus, .cow-select:focus {
  outline: none; border-color: #4a7cff;
}
.cow-btn {
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
.cow-btn:hover { background: #3b6ae8; }
.cow-btn.cow-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.cow-btn.cow-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.cow-btn.cow-danger { background: #c13c3c; }
.cow-btn.cow-danger:hover { background: #a73232; }
.cow-btn.cow-accent { background: #7a4acc; }
.cow-btn.cow-accent:hover { background: #683ab3; }
.cow-label { font-size: 12px; color: #8a93a8; }

.cow-canvas-wrap {
  flex: 1;
  min-height: 320px;
  overflow: auto;
  background:
    radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 20px;
}

.cow-footer {
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
.cow-status { color: #d1d5db; flex: 1; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.cow-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.cow-stats b { color: #e6e6e6; }

.cow-legend {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  font-size: 12px;
  color: #8a93a8;
  flex-wrap: wrap;
}
.cow-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: -1px;
}

/* node colors by reachability */
.cow-node rect {
  transition: fill 450ms ease, stroke 450ms ease, filter 450ms ease, opacity 450ms ease;
}
.cow-node text {
  fill: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
  user-select: none;
}
.cow-node.cow-class-shared rect {
  fill: #3a2a55;
  stroke: #9370db;
  stroke-width: 1.5;
}
.cow-node.cow-class-only-current rect {
  fill: #1f2f55;
  stroke: #4a7cff;
  stroke-width: 1.5;
}
.cow-node.cow-class-only-old rect {
  fill: #2a2f3a;
  stroke: #4a5060;
  stroke-width: 1.5;
  opacity: 0.65;
}
.cow-node.cow-class-unreachable rect {
  fill: #3a2020;
  stroke: #a04040;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  opacity: 0.55;
}
.cow-node.cow-on-path rect {
  stroke: #ffd24a !important;
  stroke-width: 2.5 !important;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.cow-node.cow-new rect {
  animation: cow-fade-in 550ms ease-out;
}
.cow-node.cow-cloned rect {
  animation: cow-pulse-green 700ms ease-in-out 1;
}
.cow-node.cow-is-root rect {
  stroke-width: 3 !important;
}
@keyframes cow-fade-in {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes cow-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.cow-edge {
  fill: none;
  stroke: #3a4560;
  stroke-width: 1.5;
  transition: stroke 400ms ease, opacity 400ms ease;
}
.cow-edge.cow-edge-shared { stroke: #6a4a95; }
.cow-edge.cow-edge-old { stroke: #4a5060; opacity: 0.5; stroke-dasharray: 3 4; }
.cow-edge.cow-edge-on-path {
  stroke: #ffd24a;
  stroke-width: 2.5;
  opacity: 1;
}

.cow-empty {
  color: #8a93a8;
  text-align: center;
  padding: 40px;
  font-style: italic;
}

.cow-mapping {
  background: #1a1f2e;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0 16px 8px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #d1d5db;
  animation: cow-fade-in 400ms ease-out;
}
.cow-mapping b { color: #ffd24a; }
.cow-mapping .cow-arrow { color: #6a7389; }
`,Os=42,Sl=10,$l=9,Nl=18,Xo=90;
function Cl(n){const t=n.keys.length?n.keys.join(", "):"∅";return Math.max(60,t.length*$l+Sl*2)}
function _l(n,t){const s={},r=new Map;function o(c,p){const m=n[c];if(m&&((s[c]===void 0||p>s[c])&&(s[c]=p),!m.isLeaf))for(const g of m.children){const w=c+"->"+g;r.has(w)||r.set(w,{parent:c,child:g}),o(g,p+1)}}for(const c of t)o(c,0);const i={};for(const c of Object.keys(s)){const p=s[c];i[p]||(i[p]=[]),i[p].push(c)}for(const c of Object.keys(i))i[c].sort((p,m)=>{const g=n[p],w=n[m],C=g.keys[0]!==void 0?g.keys[0]:1/0,j=w.keys[0]!==void 0?w.keys[0]:1/0;return C!==j?C-j:p.localeCompare(m)});const a={};let l=0;for(const c of Object.keys(i)){const p=i[c];let m=0;for(const g of p){const w=Cl(n[g]),C=m+w/2;a[g]={x:C,y:Number(c)*Xo,w},m+=w+Nl}m>l&&(l=m)}for(const c of Object.keys(i)){const p=i[c];if(!p.length)continue;const m=a[p[p.length-1]],g=m.x+m.w/2,w=(l-g)/2;for(const C of p)a[C].x+=w}const d=Math.max(0,...Object.values(s));return{positions:a,width:l,height:(d+1)*Xo,edges:Array.from(r.values())}}
const Rl=[3,4,5];
function Tl(){const[n,t]=h.useState(4),s=h.useRef(new Yo({order:4})),[r,o]=h.useState(()=>s.current.snapshot()),[i,a]=h.useState("Empty CoW B-Tree. Insert a key — every write will clone the root→leaf path. (Petrov ch.6 / LMDB.)"),[l,d]=h.useState(()=>s.current.currentRoot()),[c,p]=h.useState(""),[m,g]=h.useState(""),[w,C]=h.useState({cloned:new Set,newNodes:new Set,pathNewIds:new Set,mapping:null}),j=h.useRef(null);function $(){C({cloned:new Set,newNodes:new Set,pathNewIds:new Set,mapping:null})}function O(A,K=2600){j.current&&clearTimeout(j.current),C(A),j.current=setTimeout(()=>$(),K)}h.useEffect(()=>()=>j.current&&clearTimeout(j.current),[]);function q(A){s.current=new Yo({order:A});const K=s.current.snapshot();o(K),d(K.currentRoot),$(),a(`Reset CoW tree with order ${A} (max keys/node = ${A-1}).`)}function R(A){const K=Number(A.target.value);t(K),q(K)}function D(A,K=r){const Q=K.roots.find(X=>X.rootId===A);return Q?Q.rootName:A}function B(A,K){const Q=Number(A);if(!Number.isFinite(Q)){a("Insert needs a numeric key.");return}const X=K&&K.length?K:String(Q),ee=s.current.currentRoot(),F=s.current.insert(Q,X),U=s.current.snapshot();o(U),d(F.newRootId);const Z=new Set(F.clonedNodes.map(ke=>ke.newId)),W=new Set(F.newNodes),L=new Set([...Z,...W]);O({cloned:Z,newNodes:W,pathNewIds:L,mapping:F.clonedNodes.slice(0,6)});const G=F.clonedNodes.map(ke=>ke.newId),te=G.length?G.join(" → "):"(none)",re=F.sharedNodes,ie=D(ee,U);if(F.updated)a(`Updated key ${Q}: cloned path ${te} (${F.clonedNodes.length} new node${F.clonedNodes.length===1?"":"s"}); siblings ${re.length?re.join(", "):"(none)"} shared with old root ${ie}.`);else if(F.splits.length===0)a(`Inserted ${Q}: cloned path ${te} (${F.clonedNodes.length} new node${F.clonedNodes.length===1?"":"s"}); siblings ${re.length?re.join(", "):"(none)"} shared with old root ${ie}.`);else{const ke=F.splits.map(Dt=>`split ${Dt.sourceNewId} → ${Dt.newSiblingId} (promote ${Dt.promotedKey})`).join("; "),Mt=F.rootChanged?" Tree height grew.":"";a(`Inserted ${Q}: cloned path ${te} (${F.clonedNodes.length} cloned, ${F.newNodes.length} new); ${ke}; shared with ${ie}: ${re.length?re.join(", "):"(none)"}.${Mt}`)}}function V(A){const K=Number(A);if(!Number.isFinite(K)){a("Search needs a numeric key.");return}const Q=s.current.search(K,l);O({cloned:new Set,newNodes:new Set,pathNewIds:new Set(Q.path),mapping:null},1500);const X=Q.path.join(" → "),ee=D(l);a(Q.found?`Searched ${K} in ${ee}: traversed ${X}. Found '${Q.value}'.`:`Searched ${K} in ${ee}: traversed ${X}. Not found.`)}function T(){const A=s.current.currentRoot();s.current.pinReader(A);const K=s.current.snapshot();o(K),a(`Snapshotted root ${D(A,K)} — pinned; GC will not reclaim its pages.`)}function _(A){s.current.unpinReader(A);const K=s.current.snapshot();o(K),a(`Released reader pin on ${D(A,K)}.`)}function b(){const A=Object.keys(s.current.snapshot().nodes).length,K=s.current.gc(),Q=s.current.snapshot();Q.nodes[l]||d(Q.currentRoot),o(Q),a(`GC: freed ${K.freed.length} node${K.freed.length===1?"":"s"} no longer reachable (${A} → ${K.liveAfter}). Reclaimed: ${K.freed.length?K.freed.join(", "):"(none)"}.`)}function x(A){const K=A.target.value;d(K);const Q=D(K);a(`Viewing historical root ${Q} (${K}). All nodes reachable from it are the snapshot readers would see.`)}const f=h.useMemo(()=>{const A=new Set([r.currentRoot,...Object.keys(r.pins)]);return l&&A.add(l),Array.from(A).filter(K=>r.nodes[K])},[r,l]),u=h.useMemo(()=>{const A={};function K(Q,X,ee){if(ee.has(Q))return;ee.add(Q);const F=r.nodes[Q];if(F&&(A[Q]||(A[Q]=new Set),A[Q].add(X),!F.isLeaf))for(const U of F.children)K(U,X,ee)}for(const Q of f)K(Q,Q,new Set);return A},[r,f]),y=h.useMemo(()=>{const A=new Set;return(function K(Q){if(A.has(Q))return;const X=r.nodes[Q];if(X&&(A.add(Q),!X.isLeaf))for(const ee of X.children)K(ee)})(l),A},[r,l]),v=h.useMemo(()=>{const A=new Set;for(const K of Object.keys(u))A.add(K);return Object.keys(r.nodes).filter(K=>!A.has(K))},[r,u]);function I(A){const K=u[A];return K?K.size>1?"shared":K.has(l)?"only-current":"only-old":"unreachable"}const S=h.useMemo(()=>{const A=new Set(f);for(const K of v)A.add(K);return _l(r.nodes,Array.from(A))},[r.nodes,f,v]),H=w.pathNewIds,M=h.useMemo(()=>{const A=Object.keys(r.nodes).length,K=y.size,Q=Object.keys(r.pins).length;return{total:A,current:K,pinned:Q,versions:r.roots.length,unreach:v.length}},[r,y,v]),k=24,P=24,N=Math.max(S.width+k*2,480),z=Math.max(S.height+P*2,200),E=M.total===1&&r.nodes[r.currentRoot]&&r.nodes[r.currentRoot].keys.length===0;function J(){B(c,m.trim()),p(""),g("")}function Y(A){A.key==="Enter"&&J()}function se(){V(c)}return e.jsxs("div",{className:"cow-root",children:[e.jsx("style",{children:jl}),e.jsxs("div",{className:"cow-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"cow-title",children:"Copy-on-Write B-Tree Visualizer (LMDB-style)"}),e.jsxs("div",{className:"cow-sub",children:["Chapter 6, Petrov: ",e.jsx("i",{children:'"Database Internals"'})," — every write clones the root→leaf path; other subtrees are shared; a version is a root pointer."]})]}),e.jsxs("div",{className:"cow-head-right",children:[e.jsx("span",{className:"cow-label",children:"Order:"}),e.jsx("select",{className:"cow-select",value:n,onChange:R,children:Rl.map(A=>e.jsx("option",{value:A,children:A},A))}),e.jsx("button",{className:"cow-btn cow-danger",onClick:()=>q(n),children:"Reset"})]})]}),e.jsxs("div",{className:"cow-bar",children:[e.jsx("input",{className:"cow-input",placeholder:"key",type:"number",value:c,onChange:A=>p(A.target.value),onKeyDown:Y}),e.jsx("input",{className:"cow-input cow-input-val",placeholder:"value (opt)",value:m,onChange:A=>g(A.target.value),onKeyDown:Y}),e.jsx("button",{className:"cow-btn",onClick:J,children:"Insert"}),e.jsx("button",{className:"cow-btn cow-ghost",onClick:se,children:"Search"}),e.jsx("div",{className:"cow-bar-sep"}),e.jsx("button",{className:"cow-btn cow-accent",onClick:T,children:"Snapshot (pin)"}),e.jsx("span",{className:"cow-label",children:"View root:"}),e.jsx("select",{className:"cow-select",value:l||"",onChange:x,style:{minWidth:200},children:r.roots.map(A=>{const K=r.pins[A.rootId]?` [pinned×${r.pins[A.rootId]}]`:"",Q=A.rootId===r.currentRoot?" (current)":"",X=r.nodes[A.rootId]?"":" (gc'd)";return e.jsxs("option",{value:A.rootId,disabled:!r.nodes[A.rootId],children:[A.rootName," → ",A.rootId,Q,K,X]},A.rootId)})}),r.pins[l]?e.jsx("button",{className:"cow-btn cow-ghost",onClick:()=>_(l),children:"Unpin"}):null,e.jsx("div",{className:"cow-bar-sep"}),e.jsx("button",{className:"cow-btn cow-ghost",onClick:b,children:"GC"})]}),e.jsxs("div",{className:"cow-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"cow-swatch",style:{background:"#3a2a55",border:"1px solid #9370db"}}),"Shared (≥2 roots)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cow-swatch",style:{background:"#1f2f55",border:"1px solid #4a7cff"}}),"Only in selected root"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cow-swatch",style:{background:"#2a2f3a",border:"1px solid #4a5060"}}),"Only in other (older) root"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cow-swatch",style:{background:"#3a2020",border:"1px dashed #a04040"}}),"Unreachable (GC candidate)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"cow-swatch",style:{background:"transparent",border:"2px solid #ffd24a"}}),"Just-cloned path"]})]}),w.mapping&&w.mapping.length?e.jsxs("div",{className:"cow-mapping",children:[e.jsx("b",{children:"cloned:"})," ",w.mapping.map((A,K)=>e.jsxs("span",{children:[K>0?", ":"",A.oldId," ",e.jsx("span",{className:"cow-arrow",children:"→"})," ",e.jsx("b",{children:A.newId})]},K))]}):null,e.jsx("div",{className:"cow-canvas-wrap",children:E?e.jsxs("div",{className:"cow-empty",children:["Tree is empty (root ",r.currentRoot," is an empty leaf). Insert a key to publish the first non-trivial root."]}):e.jsxs("svg",{width:N,height:z,viewBox:`0 0 ${N} ${z}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:S.edges.map(A=>{const K=S.positions[A.parent],Q=S.positions[A.child];if(!K||!Q)return null;const X=K.x+k,ee=K.y+P+Os/2,F=Q.x+k,U=Q.y+P-Os/2,Z=(ee+U)/2,W=`M ${X} ${ee} C ${X} ${Z}, ${F} ${Z}, ${F} ${U}`,L=I(A.parent),G=I(A.child);let te="cow-edge";return H.has(A.parent)&&H.has(A.child)?te+=" cow-edge-on-path":L==="shared"||G==="shared"?te+=" cow-edge-shared":(L==="only-old"||G==="only-old"||L==="unreachable"||G==="unreachable")&&(te+=" cow-edge-old"),e.jsx("path",{className:te,d:W},A.parent+"->"+A.child)})}),e.jsx("g",{children:Object.keys(S.positions).map(A=>{const K=r.nodes[A];if(!K)return null;const Q=S.positions[A],X=I(A),ee=K.keys.length?K.keys.join(", "):"∅",F=Q.w,U=Q.x+k-F/2,Z=Q.y+P-Os/2,W=["cow-node",`cow-class-${X}`];H.has(A)&&W.push("cow-on-path"),w.newNodes.has(A)&&W.push("cow-new"),w.cloned.has(A)&&W.push("cow-cloned"),(A===l||A===r.currentRoot||r.pins[A])&&W.push("cow-is-root");const G=[];return A===r.currentRoot&&G.push("current"),A===l&&A!==r.currentRoot&&G.push("viewing"),r.pins[A]&&G.push(`pinned×${r.pins[A]}`),e.jsxs("g",{className:W.join(" "),children:[e.jsx("rect",{x:U,y:Z,width:F,height:Os,rx:8,ry:8}),e.jsx("text",{x:Q.x+k,y:Q.y+P,children:ee}),e.jsxs("text",{x:Q.x+k,y:Q.y+P+Os/2+12,style:{fill:"#6a7389",fontSize:10},children:[A,G.length?" · "+G.join(","):""]})]},A)})})]})}),e.jsxs("div",{className:"cow-footer",children:[e.jsxs("div",{className:"cow-status",children:["Status: ",i]}),e.jsxs("div",{className:"cow-stats",children:["total=",e.jsx("b",{children:M.total}),"   view-root-size=",e.jsx("b",{children:M.current}),"   pinned=",e.jsx("b",{children:M.pinned}),"   versions=",e.jsx("b",{children:M.versions}),"   gc-candidates=",e.jsx("b",{children:M.unreach})]})]})]})}

export default Tl;
export { Tl as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Tl, {}));
  return () => root.unmount();
}
