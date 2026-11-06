import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ta(a){const t=a.map((s,o)=>({id:"n"+o,val:s,next:o<a.length-1?"n"+(o+1):null}));return{nodes:t,head:t.length?t[0].id:null}}
function sa(a,t){const s=a.nodes.map(o=>({...o}));return s.length===0?{nodes:s,head:null,cycleEntry:null}:(s[s.length-1].next=s[t].id,{nodes:s,head:s[0].id,cycleEntry:s[t].id})}
function ge(a,t){return t==null?null:a.nodes.find(s=>s.id===t)||null}
function na(a){const t=[];let s=null,o=a.head;const n=new Set;for(t.push({prev:s,curr:o,next:null,reversed:new Set(n),note:"Init: prev=null, curr=head. We walk forward and rewire each node's next back to prev.",done:!1});o!=null;){const c=ge(a,o),r=c?c.next:null;t.push({prev:s,curr:o,next:r,reversed:new Set(n),note:`Save next = ${r??"null"} before we overwrite curr.next.`,done:!1}),s!=null&&n.add(o+"->"+s),t.push({prev:s,curr:o,next:r,reversed:new Set(n),note:`Rewire: curr(${o}).next = prev(${s??"null"}).`,done:!1}),s=o,o=r,t.push({prev:s,curr:o,next:null,reversed:new Set(n),note:`Advance: prev = ${s}, curr = ${o??"null"}.`,done:!1})}return t.push({prev:s,curr:null,next:null,reversed:new Set(n),note:`Done. New head = ${s??"null"}.`,done:!0}),t}
function aa(a){const t=[];let s=a.head,o=a.head;t.push({slow:s,fast:o,entry:null,phase:1,note:"Phase 1: slow and fast both at head.",done:!1});let n=0;for(;o!=null&&ge(a,o)&&ge(a,o).next!=null&&!(n++>200);){const c=ge(a,s);s=c?c.next:null;const r=ge(a,o),l=r?ge(a,r.next):null;if(o=l?l.next:null,t.push({slow:s,fast:o,entry:null,phase:1,note:`Phase 1: slow→${s??"null"}, fast→${o??"null"} (fast moves 2).`,done:!1}),s!=null&&s===o){t.push({slow:s,fast:o,entry:null,phase:1,note:`Meet at ${s}. A cycle exists. Start phase 2 to find the entry.`,done:!1});let i=a.head,d=s;t.push({slow:i,fast:d,entry:null,phase:2,note:"Phase 2: p1 at head, p2 at meet. Advance both one step; they converge at the cycle entry.",done:!1});let f=0;for(;i!==d&&!(f++>200);){const p=ge(a,i);i=p?p.next:null;const u=ge(a,d);d=u?u.next:null,t.push({slow:i,fast:d,entry:null,phase:2,note:`Phase 2: p1→${i??"null"}, p2→${d??"null"}.`,done:!1})}return t.push({slow:i,fast:d,entry:i,phase:2,note:`Cycle entry = ${i}. Done.`,done:!0}),t}}return t.push({slow:s,fast:o,entry:null,phase:1,note:"fast reached null — no cycle.",done:!0}),t}
const oa=`
.llw-root { display: flex; flex-direction: column; height: 100%;
  background: #0f1419; color: #e6e6e6; font-family: inherit; font-size: 14px;
  border: 1px solid #2a2f3e; border-radius: 8px; overflow: hidden; }
.llw-head { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #1a1f2e; border-bottom: 1px solid #2a2f3e; }
.llw-title { font-weight: 600; font-size: 15px; }
.llw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.llw-head-right { display: flex; gap: 8px; align-items: center; }
.llw-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: #141925; border-bottom: 1px solid #2a2f3e; flex-wrap: wrap; }
.llw-btn { padding: 6px 12px; background: #4a7cff; border: none; border-radius: 6px;
  color: white; font-weight: 500; cursor: pointer; font-size: 13px; font-family: inherit; }
.llw-btn:hover { background: #3b6ae8; }
.llw-btn.ghost { background: transparent; border: 1px solid #2a2f3e; color: #d1d5db; }
.llw-btn.ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.llw-btn.danger { background: #c13c3c; }
.llw-btn.danger:hover { background: #a73232; }
.llw-btn.active { background: #1f3a2e; border: 1px solid #4a9f6f; color: #e6e6e6; }
.llw-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }
.llw-canvas { flex: 1; min-height: 260px; overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%); padding: 24px; }
.llw-footer { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #141925; border-top: 1px solid #2a2f3e;
  font-size: 13px; gap: 16px; flex-wrap: wrap; }
.llw-status { color: #d1d5db; flex: 1; min-width: 0; }
.llw-stats { color: #8a93a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: nowrap; }
.llw-stats b { color: #e6e6e6; }
.llw-node rect { fill: #1f3a2e; stroke: #4a9f6f; stroke-width: 1.5;
  transition: fill 300ms ease, stroke 300ms ease, filter 300ms ease; }
.llw-node.slow rect { stroke: #4a7cff; filter: drop-shadow(0 0 8px rgba(74,124,255,0.8)); }
.llw-node.fast rect { stroke: #ffd24a; filter: drop-shadow(0 0 8px rgba(255,210,74,0.8)); }
.llw-node.both rect { stroke: #ff5c5c; filter: drop-shadow(0 0 10px rgba(255,92,92,0.9)); fill: #5a2020; }
.llw-node.entry rect { stroke: #4a9f6f; stroke-width: 3; filter: drop-shadow(0 0 10px rgba(74,159,111,0.9)); }
.llw-node.curr rect { stroke: #ffd24a; filter: drop-shadow(0 0 8px rgba(255,210,74,0.85)); }
.llw-node.prev rect { stroke: #4a7cff; filter: drop-shadow(0 0 8px rgba(74,124,255,0.85)); }
.llw-node text { fill: #e6e6e6; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.llw-ptr-label { fill: #e6e6e6; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-anchor: middle; }
.llw-edge { fill: none; stroke: #3a4560; stroke-width: 1.5; marker-end: url(#llw-arrow); }
.llw-edge.reversed { stroke: #c13c3c; stroke-width: 2; marker-end: url(#llw-arrow-red); }
`,ne=60,Ie=40,tn=40,sn=40,ia=140;
function ra(a){const t={};return a.nodes.forEach((s,o)=>{t[s.id]={x:sn+o*(ne+tn),y:ia}}),t}
function la(){const[a,t]=h.useState("reverse"),[s,o]=h.useState(!0),[n]=h.useState(2),c=h.useMemo(()=>ta([10,20,30,40,50,60,70]),[]),r=h.useMemo(()=>a==="floyd"&&s?sa(c,n):c,[a,s,c,n]),l=h.useMemo(()=>a==="reverse"?na(r):aa(r),[a,r]),[i,d]=h.useState(0),[f,p]=h.useState(!1),u=h.useRef(null);h.useEffect(()=>{d(0),p(!1)},[a,s]),h.useEffect(()=>{if(f)return u.current=setTimeout(()=>{d(M=>M>=l.length-1?(p(!1),M):M+1)},900),()=>clearTimeout(u.current)},[f,i,l.length]);const m=l[Math.min(i,l.length-1)],w=h.useMemo(()=>ra(r),[r]),b=h.useMemo(()=>{const M=[];if(r.nodes.forEach(y=>{y.next!=null&&M.push({from:y.id,to:y.next,reversed:!1})}),a==="reverse"&&m.reversed){const y=[];return m.reversed.forEach(C=>{const[T,v]=C.split("->");y.push({from:T,to:v,reversed:!0})}),{forward:M,reversed:y}}return{forward:M,reversed:[]}},[r,m,a]),k=sn*2+r.nodes.length*(ne+tn),$=260,g=M=>{const y=["llw-node"];return a==="floyd"?(m.slow===M&&m.fast===M?y.push("both"):m.slow===M?y.push("slow"):m.fast===M&&y.push("fast"),m.entry===M&&y.push("entry")):(m.curr===M&&y.push("curr"),m.prev===M&&y.push("prev")),y.join(" ")};function z(M,y,C=!1){const T=w[M],v=w[y];if(!T||!v)return"";const I=T.x+ne,j=T.y+Ie/2,x=v.x,N=v.y+Ie/2;if(M===y)return"";if(C||T.x>v.x){const E=j-60;return`M ${I-ne/2} ${T.y} C ${I} ${E}, ${v.x+ne/2} ${E}, ${v.x+ne/2} ${v.y}`}return`M ${I} ${j} L ${x-6} ${N}`}function F(M,y){const C=w[M],T=w[y];if(!C||!T)return"";const v=C.x+ne/2,I=C.y+Ie,j=T.x+ne/2,x=T.y+Ie,N=I+45;return`M ${v} ${I} C ${v} ${N}, ${j} ${N}, ${j} ${x+2}`}return e.jsxs("div",{className:"llw-root",children:[e.jsx("style",{children:oa}),e.jsxs("div",{className:"llw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"llw-title",children:"Linked List: Reverse & Floyd's Cycle Detection"}),e.jsx("div",{className:"llw-sub",children:"Two classic pointer drills. Reverse iterates prev/curr/next; Floyd's tortoise & hare finds a cycle, then its entry."})]}),e.jsxs("div",{className:"llw-head-right",children:[e.jsx("button",{className:"llw-btn "+(a==="reverse"?"active":"ghost"),onClick:()=>t("reverse"),children:"Reverse"}),e.jsx("button",{className:"llw-btn "+(a==="floyd"?"active":"ghost"),onClick:()=>t("floyd"),children:"Floyd"})]})]}),e.jsxs("div",{className:"llw-bar",children:[e.jsx("button",{className:"llw-btn",onClick:()=>p(M=>!M),children:f?"Pause":"Play"}),e.jsx("button",{className:"llw-btn ghost",disabled:i>=l.length-1,onClick:()=>d(M=>Math.min(M+1,l.length-1)),children:"Step"}),e.jsx("button",{className:"llw-btn danger",onClick:()=>{d(0),p(!1)},children:"Reset"}),a==="floyd"&&e.jsxs(e.Fragment,{children:[e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"llw-quick",children:"Cycle:"}),e.jsx("button",{className:"llw-btn "+(s?"active":"ghost"),onClick:()=>o(!0),children:"On"}),e.jsx("button",{className:"llw-btn "+(s?"ghost":"active"),onClick:()=>o(!1),children:"Off"})]}),e.jsx("span",{style:{width:12}}),e.jsxs("span",{className:"llw-quick",children:["Step ",i+1," / ",l.length]})]}),e.jsx("div",{className:"llw-canvas",children:e.jsxs("svg",{width:k,height:$,viewBox:`0 0 ${k} ${$}`,children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"llw-arrow",markerWidth:"8",markerHeight:"8",refX:"6",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4560"})}),e.jsx("marker",{id:"llw-arrow-red",markerWidth:"8",markerHeight:"8",refX:"6",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#c13c3c"})})]}),e.jsx("g",{children:b.forward.map(M=>{if(a==="reverse"&&Array.from(m.reversed||[]).some(T=>{const[v]=T.split("->");return v===M.from}))return null;const y=w[M.from]&&w[M.to]&&w[M.from].x>w[M.to].x;return e.jsx("path",{className:"llw-edge",d:y?z(M.from,M.to,!0):z(M.from,M.to)},M.from+M.to)})}),a==="reverse"&&e.jsx("g",{children:b.reversed.map(M=>e.jsx("path",{className:"llw-edge reversed",d:F(M.from,M.to)},"r"+M.from+M.to))}),e.jsx("g",{children:r.nodes.map(M=>{const y=w[M.id];return e.jsxs("g",{className:g(M.id),children:[e.jsx("rect",{x:y.x,y:y.y,width:ne,height:Ie,rx:8}),e.jsx("text",{x:y.x+ne/2,y:y.y+Ie/2,children:M.val})]},M.id)})}),e.jsxs("g",{children:[a==="reverse"&&m.prev&&w[m.prev]&&e.jsx("text",{className:"llw-ptr-label",fill:"#4a7cff",x:w[m.prev].x+ne/2,y:w[m.prev].y-10,children:"prev"}),a==="reverse"&&m.curr&&w[m.curr]&&e.jsx("text",{className:"llw-ptr-label",fill:"#ffd24a",x:w[m.curr].x+ne/2,y:w[m.curr].y-10,children:"curr"}),a==="floyd"&&m.slow&&w[m.slow]&&e.jsx("text",{className:"llw-ptr-label",fill:"#4a7cff",x:w[m.slow].x+ne/2,y:w[m.slow].y-10,children:"slow"}),a==="floyd"&&m.fast&&w[m.fast]&&e.jsx("text",{className:"llw-ptr-label",fill:"#ffd24a",x:w[m.fast].x+ne/2,y:w[m.fast].y-24,children:"fast"})]})]})}),e.jsxs("div",{className:"llw-footer",children:[e.jsxs("div",{className:"llw-status",children:["Status: ",m.note]}),e.jsxs("div",{className:"llw-stats",children:["mode=",e.jsx("b",{children:a}),"   step=",e.jsx("b",{children:i+1}),"/",e.jsx("b",{children:l.length}),a==="floyd"&&e.jsxs(e.Fragment,{children:["   phase=",e.jsx("b",{children:m.phase||1})]})]})]})]})}

export default la;
export { la as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(la, {}));
  return () => root.unmount();
}
