import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
let Po=0;
function qo(){return"t"+Po++}
function Bt(){return{id:qo(),children:{},terminal:!1,count:0}}
class Lo{constructor(){this.root=Bt()}clear(){this.root=Bt()}insert(t){const s=[this.root.id],o=[];let n=this.root,c=!1;for(const l of t){let i=n.children[l];i||(i=Bt(),n.children[l]=i,o.push(i.id),c=!0),n=i,s.push(n.id)}const r=n.terminal;if(!r){n.terminal=!0;let l=this.root;l.count++;for(const i of t)l=l.children[i],l.count++}return{path:s,created:o,duplicate:r,wasNew:c}}search(t){const s=[this.root.id];let o=this.root;for(const n of t){const c=o.children[n];if(!c)return{path:s,found:!1,terminalId:null};o=c,s.push(o.id)}return{path:s,found:o.terminal,terminalId:o.terminal?o.id:null}}findPrefix(t){const s=[this.root.id];let o=this.root;for(const n of t){const c=o.children[n];if(!c)return{path:s,node:null};o=c,s.push(o.id)}return{path:s,node:o}}collect(t){const{path:s,node:o}=this.findPrefix(t),n=[],c=new Set;if(!o)return{words:n,subtreeIds:c,path:s};const r=(l,i)=>{c.add(l.id),l.terminal&&n.push(i);const d=Object.keys(l.children).sort();for(const f of d)r(l.children[f],i+f)};return r(o,t),{words:n,subtreeIds:c,path:s}}snapshot(){const t=[],s=[],o=(n,c,r)=>{t.push({id:n.id,ch:r,parent:c,terminal:n.terminal,count:n.count}),c!==null&&s.push({parent:c,child:n.id,ch:r});const l=Object.keys(n.children).sort();for(const i of l)o(n.children[i],n.id,i)};return o(this.root,null,null),{nodes:t,edges:s}}size(){return this.root.count}}
const Do=`
.trw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.trw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.trw-title { font-weight: 600; font-size: 15px; }
.trw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.trw-head-right { display: flex; gap: 8px; align-items: center; }
.trw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.trw-input { padding: 6px 10px; background: #0f1419; border: 1px solid #2a2f3e;
  border-radius: 6px; color: #e6e6e6; font-size: 13px; font-family: inherit; width: 140px; }
.trw-input:focus { outline: none; border-color: #4a7cff; }
.trw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.trw-btn:hover { background: #3b6ae8; }
.trw-btn.trw-ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.trw-btn.trw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.trw-btn.trw-danger { background: #c13c3c; }
.trw-btn.trw-danger:hover { background: #a73232; }
.trw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.trw-canvas-wrap { flex: 1; min-height: 280px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 20px;
  display: flex; gap: 16px; }
.trw-svg-wrap { flex: 1; min-width: 0; }
.trw-side { width: 220px; flex-shrink: 0;
  background: #141925; border: 1px solid #2a2f3e; border-radius: 8px;
  padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; color: #d1d5db; overflow: auto; }
.trw-side-title { color: #ffd24a; font-weight: 600; margin-bottom: 8px; font-size: 12px; }
.trw-side div { margin: 3px 0; color: #b0b8c8; }
.trw-side .trw-none { color: #6a7389; font-style: italic; }
.trw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.trw-status { color: #d1d5db; flex: 1; min-width: 0; }
.trw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.trw-stats b { color: #e6e6e6; }

.trw-node circle {
  fill: #1a1f2e; stroke: #5a6380; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease;
}
.trw-node.trw-terminal circle {
  stroke: #4a9f6f; stroke-width: 2.5;
  filter: drop-shadow(0 0 6px rgba(74, 159, 111, 0.5));
}
.trw-node.trw-on-path circle {
  stroke: #ffd24a; stroke-width: 2.5;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.55));
}
.trw-node.trw-created circle { animation: trw-pulse-green 600ms ease-out 1; }
.trw-node.trw-subtree circle {
  fill: #2a3550; stroke: #4a7cff; stroke-width: 2;
}
.trw-node text {
  fill: #e6e6e6; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; dominant-baseline: middle;
  pointer-events: none; user-select: none;
}
@keyframes trw-pulse-green {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 159, 111, 0)); }
  50%      { filter: drop-shadow(0 0 12px rgba(74, 159, 111, 0.9)); }
}
.trw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5;
  transition: stroke 300ms ease; }
.trw-edge.trw-edge-on-path { stroke: #ffd24a; stroke-width: 2.5; }
.trw-edge-label {
  fill: #ffd24a; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle;
}
.trw-empty { color: #8a93a8; text-align: center; padding: 40px; font-style: italic; }
`,Xe=16,ts=62,Bo=14,ft=["cat","car","card","care","cart","dog","door"];
function _o(a){const t={};if(!a.nodes.length)return{positions:t,width:0,depth:0};const s=new Map;for(const l of a.nodes)s.has(l.parent)||s.set(l.parent,[]),s.get(l.parent).push(l);for(const[,l]of s)l.sort((i,d)=>(i.ch||"").localeCompare(d.ch||""));let o=0,n=0;function c(l,i){i>n&&(n=i);const d=s.get(l)||[];if(d.length===0){const u=o+Xe;return o+=Xe*2+Bo,t[l]={x:u,y:i*ts+Xe},t[l]}const f=d.map(u=>c(u.id,i+1)),p=(f[0].x+f[f.length-1].x)/2;return t[l]={x:p,y:i*ts+Xe},t[l]}const r=a.nodes.find(l=>l.parent===null);return r&&c(r.id,0),{positions:t,width:o,depth:n}}
function Oo(){const a=h.useRef(new Lo),[t,s]=h.useState(()=>a.current.snapshot()),[o,n]=h.useState(`Seeded: ${ft.join(", ")}. Try autocomplete with "ca".`),[c,r]=h.useState({path:new Set,created:new Set,subtree:new Set}),l=h.useRef(null),[i,d]=h.useState(""),[f,p]=h.useState("ca"),[u,m]=h.useState(["cat","car","card","care","cart"]);function w(x,N=900){l.current&&clearTimeout(l.current),r(x),l.current=setTimeout(()=>r({path:new Set,created:new Set,subtree:new Set}),N)}h.useEffect(()=>()=>l.current&&clearTimeout(l.current),[]),h.useEffect(()=>{for(const x of ft)a.current.insert(x);s(a.current.snapshot())},[]);function b(){s(a.current.snapshot())}function k(){const x=i.trim().toLowerCase();if(!x){n("Insert needs a non-empty word.");return}const N=a.current.insert(x);b(),w({path:new Set(N.path),created:new Set(N.created),subtree:new Set}),n(N.duplicate?`Insert "${x}": already present.`:`Insert "${x}": created ${N.created.length} new node(s), marked terminal.`),d("")}function $(){const x=i.trim().toLowerCase();if(!x){n("Search needs a non-empty word.");return}const N=a.current.search(x);w({path:new Set(N.path),created:new Set,subtree:new Set}),n(N.found?`Search "${x}": found (terminal at node ${N.terminalId}).`:`Search "${x}": walked ${N.path.length-1} edge(s), not a stored word.`)}function g(){const x=f.trim().toLowerCase(),N=a.current.collect(x);w({path:new Set(N.path),created:new Set,subtree:N.subtreeIds},1400),m(N.words),n(N.words.length?`Autocomplete "${x}": ${N.words.length} word(s) in subtree.`:`Autocomplete "${x}": no words under this prefix.`)}function z(){a.current.clear();for(const x of ft)a.current.insert(x);b(),w({path:new Set,created:new Set,subtree:new Set}),m([]),n(`Reset and re-seeded: ${ft.join(", ")}.`)}const{positions:F,width:M,depth:y}=h.useMemo(()=>_o(t),[t]),C=24,T=24,v=Math.max(M+C*2,500),I=Math.max((y+1)*ts+T*2,200),j=t.nodes.length<=1;return e.jsxs("div",{className:"trw-root",children:[e.jsx("style",{children:Do}),e.jsxs("div",{className:"trw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"trw-title",children:"Prefix Trie"}),e.jsx("div",{className:"trw-sub",children:"Fredkin 1960 — one edge per character; green ring = end-of-word."})]}),e.jsx("div",{className:"trw-head-right",children:e.jsx("button",{className:"trw-btn trw-danger",onClick:z,children:"Reset"})})]}),e.jsxs("div",{className:"trw-bar",children:[e.jsx("input",{className:"trw-input",placeholder:"word",value:i,onChange:x=>d(x.target.value),onKeyDown:x=>{x.key==="Enter"&&k()}}),e.jsx("button",{className:"trw-btn",onClick:k,children:"Insert"}),e.jsx("button",{className:"trw-btn trw-ghost",onClick:$,children:"Search"}),e.jsx("span",{style:{width:16}}),e.jsx("span",{className:"trw-quick",children:"Autocomplete:"}),e.jsx("input",{className:"trw-input",placeholder:"prefix",value:f,onChange:x=>p(x.target.value),onKeyDown:x=>{x.key==="Enter"&&g()}}),e.jsx("button",{className:"trw-btn trw-ghost",onClick:g,children:"Match"})]}),e.jsxs("div",{className:"trw-canvas-wrap",children:[e.jsx("div",{className:"trw-svg-wrap",children:j?e.jsx("div",{className:"trw-empty",children:"Empty trie. Insert a word."}):e.jsxs("svg",{width:v,height:I,viewBox:`0 0 ${v} ${I}`,style:{display:"block",margin:"0 auto"},children:[e.jsx("g",{children:t.edges.map(x=>{const N=F[x.parent],E=F[x.child];if(!N||!E)return null;const A=N.x+C,R=N.y+T,S=E.x+C,P=E.y+T,L=(R+P)/2,B=c.path.has(x.parent)&&c.path.has(x.child),q=c.subtree.has(x.parent)&&c.subtree.has(x.child),D="trw-edge"+(B||q?" trw-edge-on-path":"");return e.jsxs("g",{children:[e.jsx("path",{className:D,d:`M ${A} ${R} C ${A} ${L}, ${S} ${L}, ${S} ${P}`}),e.jsx("text",{className:"trw-edge-label",x:(A+S)/2,y:L-4,children:x.ch})]},x.parent+"->"+x.child)})}),e.jsx("g",{children:t.nodes.map(x=>{const N=F[x.id];if(!N)return null;const E=["trw-node"];x.terminal&&E.push("trw-terminal"),c.path.has(x.id)&&E.push("trw-on-path"),c.created.has(x.id)&&E.push("trw-created"),c.subtree.has(x.id)&&E.push("trw-subtree");const A=x.parent===null?"·":x.ch;return e.jsxs("g",{className:E.join(" "),children:[e.jsx("circle",{cx:N.x+C,cy:N.y+T,r:Xe}),e.jsx("text",{x:N.x+C,y:N.y+T,children:A})]},x.id)})})]})}),e.jsxs("div",{className:"trw-side",children:[e.jsxs("div",{className:"trw-side-title",children:['Autocomplete "',f,'"']}),u.length===0?e.jsx("div",{className:"trw-none",children:"no matches"}):u.map(x=>e.jsx("div",{children:x},x))]})]}),e.jsxs("div",{className:"trw-footer",children:[e.jsxs("div",{className:"trw-status",children:["Status: ",o]}),e.jsxs("div",{className:"trw-stats",children:["nodes=",e.jsx("b",{children:t.nodes.length}),"   words=",e.jsx("b",{children:a.current.size()})]})]})]})}

export default Oo;
export { Oo as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Oo, {}));
  return () => root.unmount();
}
