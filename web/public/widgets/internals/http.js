import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ku(n,t){return n?n.length<=t?n:n.slice(0,t-1)+"…":""}
const ar=600,ju=150,Su=150,$u=60,Nu=12,Cu=60,_u=60,Ua=[{name:"index.html",size:6e3,kind:"html"},{name:"main.css",size:14e3,kind:"css"},{name:"hero.jpg",size:6e4,kind:"img"},{name:"photo.jpg",size:9e4,kind:"img"},{name:"app.js",size:4e4,kind:"js"},{name:"vendor.js",size:7e4,kind:"js"}];
function Ru(n){let t=n>>>0;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
class Es{constructor(t={}){this.version=t.version||"h1",this.lossRate=t.lossRate??.02,this.resources=(t.resources||Ua).map((s,r)=>({id:r,name:s.name,size:s.size,kind:s.kind})),this.seed=t.seed??1234,this.reset()}reset(){if(this.rand=Ru(this.seed),this.now=0,this.running=!1,this.done=!1,this.retransmits=0,this.events=[],this.completedAt=null,this.resState=this.resources.map(t=>({id:t.id,name:t.name,size:t.size,kind:t.kind,bytes:0,state:"pending",startedAt:null,doneAt:null,blockedUntil:0})),this.version==="h1"){const t=Math.min(6,this.resources.length);this.connections=Array.from({length:t},(s,r)=>({id:r,kind:"tcp",activeResId:null,queue:[],blockedUntil:ju,bytesTransferred:0,retransmits:0})),this.resources.forEach((s,r)=>{this.connections[r%this.connections.length].queue.push(s.id)})}else this.version==="h2"?this.connections=[{id:0,kind:"tcp",streamIds:this.resources.map(t=>t.id),blockedUntil:Su,bytesTransferred:0,retransmits:0}]:this.connections=[{id:0,kind:"quic",streamIds:this.resources.map(t=>t.id),blockedUntil:$u,bytesTransferred:0,retransmits:0}]}setVersion(t){t!==this.version&&(this.version=t,this.reset())}setLossRate(t){this.lossRate=Math.max(0,Math.min(1,t))}start(){this.running=!0,this.pushEvent("start",`Loading ${this.resources.length} resources over ${this.version.toUpperCase()}`)}pause(){this.running=!1}pushEvent(t,s){this.events.push({t:Math.round(this.now),type:t,text:s}),this.events.length>40&&this.events.shift()}tick(t){if(!this.running||this.done)return;this.now+=t,this.version==="h1"?this.tickH1(t):this.version==="h2"?this.tickH2(t):this.tickH3(t),this.resState.every(r=>r.state==="done")&&!this.done&&(this.done=!0,this.running=!1,this.completedAt=Math.round(this.now),this.pushEvent("done",`All resources loaded in ${this.completedAt}ms`))}tickH1(t){for(const s of this.connections){if(s.activeResId==null){const i=s.queue.find(l=>this.resState[l].state!=="done");if(i==null)continue;s.activeResId=i;const a=this.resState[i];a.state==="pending"&&(a.state="inflight",a.startedAt=Math.round(this.now))}const r=this.resState[s.activeResId];if(!r)continue;if(this.now<s.blockedUntil){r.state!=="blocked"&&(r.state="blocked");continue}if(r.state==="blocked"&&(r.state="inflight"),this.rollLoss(t)){s.blockedUntil=this.now+ar,s.retransmits++,this.retransmits++,r.state="blocked",this.pushEvent("loss",`h1 conn#${s.id}: packet loss on ${r.name} → RTO ${ar}ms (other conns unaffected)`);continue}const o=Math.min(r.size-r.bytes,Nu*t);r.bytes+=o,s.bytesTransferred+=o,r.bytes>=r.size&&(r.bytes=r.size,r.state="done",r.doneAt=Math.round(this.now),s.activeResId=null,this.pushEvent("done-res",`h1 conn#${s.id}: ${r.name} done @${r.doneAt}ms`))}}tickH2(t){const s=this.connections[0],r=s.streamIds.filter(i=>this.resState[i].state!=="done");for(const i of r){const a=this.resState[i];a.state==="pending"&&(a.state="inflight",a.startedAt=Math.round(this.now))}if(this.now<s.blockedUntil){for(const i of r)this.resState[i].state="blocked";return}for(const i of r){const a=this.resState[i];a.state==="blocked"&&(a.state="inflight")}if(this.rollLoss(t)){s.blockedUntil=this.now+ar,s.retransmits++,this.retransmits++;for(const i of r)this.resState[i].state="blocked";this.pushEvent("loss",`h2: TCP packet lost → all ${r.length} streams stall ${ar}ms (TCP HoL)`);return}if(r.length===0)return;const o=Cu*t/r.length;for(const i of r){const a=this.resState[i],l=Math.min(a.size-a.bytes,o);a.bytes+=l,s.bytesTransferred+=l,a.bytes>=a.size&&(a.bytes=a.size,a.state="done",a.doneAt=Math.round(this.now),this.pushEvent("done-res",`h2: stream ${a.name} done @${a.doneAt}ms`))}}tickH3(t){const s=this.connections[0],r=s.streamIds.filter(a=>this.resState[a].state!=="done");if(this.now<s.blockedUntil){for(const a of r)this.resState[a].state="blocked";return}for(const a of r){const l=this.resState[a];l.state==="pending"&&(l.state="inflight",l.startedAt=Math.round(this.now)),l.state==="blocked"&&this.now>=l.blockedUntil&&(l.state="inflight")}for(const a of r){const l=this.resState[a];l.state!=="blocked"&&this.rollLoss(t)&&(l.blockedUntil=this.now+ar,l.state="blocked",s.retransmits++,this.retransmits++,this.pushEvent("loss",`h3: QUIC stream ${l.name} lost packet → only this stream stalls (other streams keep flowing)`))}const o=r.filter(a=>this.resState[a].state==="inflight");if(o.length===0)return;const i=_u*t/o.length;for(const a of o){const l=this.resState[a],d=Math.min(l.size-l.bytes,i);l.bytes+=d,s.bytesTransferred+=d,l.bytes>=l.size&&(l.bytes=l.size,l.state="done",l.doneAt=Math.round(this.now),this.pushEvent("done-res",`h3: stream ${l.name} done @${l.doneAt}ms`))}}rollLoss(t){const s=this.lossRate*(t/50);return this.rand()<s}snapshot(){return{version:this.version,now:Math.round(this.now),running:this.running,done:this.done,completedAt:this.completedAt,lossRate:this.lossRate,retransmits:this.retransmits,connections:this.connections.map(t=>({id:t.id,kind:t.kind,bytesTransferred:Math.round(t.bytesTransferred),retransmits:t.retransmits,blockedUntil:t.blockedUntil,isBlocked:this.now<t.blockedUntil})),resources:this.resState.map(t=>({id:t.id,name:t.name,size:t.size,kind:t.kind,state:t.state,progress:t.size>0?Math.min(1,t.bytes/t.size):1,bytesReceived:Math.round(t.bytes),startedAt:t.startedAt,doneAt:t.doneAt})),events:this.events.slice(-8)}}}
const Xt="#0f1419",Tu="#1a1f2e",Ee="#2a2f3e",Ge="#e6e6e6",Fe="#8a93a6",da="#4a7cff",pa="#f5c451",kr="#f66",zs="#5cd894",Va="#8a6cff",Mu="#2aa1b3",fn=[{key:"h1",label:"HTTP/1.1",tagline:"6 TCP connections · 1 request-at-a-time per conn",accent:Mu},{key:"h2",label:"HTTP/2",tagline:"1 TCP conn + multiplexed streams · TCP HoL still bites",accent:Va},{key:"h3",label:"HTTP/3",tagline:"1 QUIC conn · independent streams · HoL immunity",accent:zs}],Au=50,Iu=50;
function Ao(n){return n<1024?`${n}B`:n<1024*1024?`${(n/1024).toFixed(1)}KB`:`${(n/1024/1024).toFixed(2)}MB`}
function Ga(n){return n==null?"—":`${n}ms`}
function Eu(n){const t=h.useRef(null);return t.current===null&&(t.current={h1:new Es({version:"h1",lossRate:n,seed:101}),h2:new Es({version:"h2",lossRate:n,seed:101}),h3:new Es({version:"h3",lossRate:n,seed:101})}),t}
function zu(){const[n,t]=h.useState(.04),[s,r]=h.useState(!1),[,o]=h.useState(0),i=()=>o(m=>m+1),a=Eu(n);h.useEffect(()=>{for(const m of["h1","h2","h3"])a.current[m].setLossRate(n)},[n,a]),h.useEffect(()=>{if(!s)return;const m=setInterval(()=>{let g=!1;for(const w of["h1","h2","h3"]){const C=a.current[w];C.running&&(C.tick(Iu),C.running&&(g=!0))}i(),g||r(!1)},Au);return()=>clearInterval(m)},[s,a]);const l=()=>{for(const m of["h1","h2","h3"]){const g=a.current[m];g.done||g.start()}r(!0),i()},d=()=>{for(const m of["h1","h2","h3"])a.current[m].pause();r(!1),i()},c=()=>{r(!1),a.current={h1:new Es({version:"h1",lossRate:n,seed:101}),h2:new Es({version:"h2",lossRate:n,seed:101}),h3:new Es({version:"h3",lossRate:n,seed:101})},i()};h.useMemo(()=>({h1:a.current.h1.snapshot(),h2:a.current.h2.snapshot(),h3:a.current.h3.snapshot()}),[s,n]);const p={h1:a.current.h1.snapshot(),h2:a.current.h2.snapshot(),h3:a.current.h3.snapshot()};return e.jsxs("div",{className:"http-root",children:[e.jsx("style",{children:Fu}),e.jsxs("div",{className:"http-panel",children:[e.jsxs("div",{className:"http-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"http-title",children:"HTTP/1.1 vs HTTP/2 vs HTTP/3 — System Design Primer"}),e.jsx("div",{className:"http-subtitle",children:"Loading 6 page assets · head-of-line blocking compared"})]}),e.jsx("div",{className:"http-title-controls",children:e.jsx("button",{className:"http-btn http-btn-ghost",onClick:c,children:"Reset"})})]}),e.jsxs("div",{className:"http-controls",children:[e.jsx("button",{className:"http-btn",onClick:l,disabled:s||p.h1.done&&p.h2.done&&p.h3.done,children:"Start"}),e.jsx("button",{className:"http-btn http-btn-ghost",onClick:d,disabled:!s,children:"Pause"}),e.jsx("span",{className:"http-sep"}),e.jsxs("label",{className:"http-label",children:["loss rate: ",e.jsx("input",{type:"range",min:"0",max:"0.2",step:"0.005",value:n,onChange:m=>t(Number(m.target.value))}),e.jsxs("span",{className:"http-unit",children:[(n*100).toFixed(1),"% / tick"]})]}),e.jsx("span",{className:"http-hint",children:"Tip: raise loss to watch H2 collapse while H3 stays steady."})]}),e.jsx("div",{className:"http-cols",children:fn.map(m=>e.jsx(Pu,{version:m,snap:p[m.key],resources:Ua},m.key))}),e.jsx(Ou,{snaps:p}),e.jsx(Lu,{snaps:p})]})]})}
function Pu({version:n,snap:t,resources:s}){const r=n.accent,o=t.completedAt,i=t.connections.length;return e.jsxs("div",{className:"http-col",style:{borderTop:`3px solid ${r}`},children:[e.jsxs("div",{className:"http-col-head",children:[e.jsx("div",{className:"http-col-title",style:{color:r},children:n.label}),e.jsx("div",{className:"http-col-tag",children:n.tagline}),e.jsxs("div",{className:"http-col-meta",children:["conns: ",e.jsx("strong",{children:i})," · retransmits:"," ",e.jsx("strong",{children:t.retransmits})," · now:"," ",e.jsxs("strong",{children:[t.now,"ms"]}),o!=null&&e.jsxs(e.Fragment,{children:[" ","· ",e.jsxs("span",{style:{color:zs},children:["done @",o,"ms"]})]})]})]}),e.jsx("div",{className:"http-lanes",children:t.resources.map(a=>{const l=Math.round(a.progress*100),d=a.state==="blocked",c=a.state==="done",p=a.state==="pending";let m=r;return d?m=kr:c?m=zs:p&&(m=Fe),e.jsxs("div",{className:"http-lane",children:[e.jsxs("div",{className:"http-lane-label",children:[e.jsx("span",{className:"http-lane-kind","data-kind":a.kind,children:a.kind}),e.jsx("span",{className:"http-lane-name",children:a.name}),e.jsx("span",{className:"http-lane-size",children:Ao(a.size)})]}),e.jsxs("div",{className:"http-bar-wrap",children:[e.jsx("div",{className:"http-bar"+(d?" http-bar-blocked":"")+(c?" http-bar-done":""),style:{width:`${l}%`,background:m}}),d&&e.jsx("div",{className:"http-bar-blocked-overlay"}),e.jsxs("div",{className:"http-bar-pct",children:[l,"%"]})]}),e.jsxs("div",{className:"http-lane-right",children:[d&&e.jsx("span",{className:"http-badge http-badge-block",children:"BLOCKED"}),c&&e.jsx("span",{className:"http-badge http-badge-done",children:Ga((a.doneAt||0)-(a.startedAt||0))}),p&&e.jsx("span",{className:"http-badge http-badge-pending",children:"queued"})]})]},a.id)})}),e.jsx("div",{className:"http-conns",children:t.connections.map(a=>e.jsxs("span",{className:"http-conn",children:[e.jsxs("span",{className:"http-conn-id",children:[a.kind==="quic"?"quic#":"tcp#",a.id]}),e.jsx("span",{className:"http-conn-bytes",children:Ao(a.bytesTransferred)}),a.isBlocked&&e.jsx("span",{className:"http-conn-blocked",children:"stalled"})]},a.id))})]})}
function Ou({snaps:n}){const t=n.h1,s=n.h2,r=n.h3,o={h1:t.completedAt,h2:s.completedAt,h3:r.completedAt};let i="Start the simulation and watch each row fill. A packet loss on HTTP/2 freezes every stream; on HTTP/3 only the affected stream stalls.";const a=["h1","h2","h3"].filter(l=>o[l]!=null);if(a.length===3){const l=a.reduce((p,m)=>o[p]<o[m]?p:m),d=a.reduce((p,m)=>o[p]>o[m]?p:m),c=p=>fn.find(m=>m.key===p).label;o.h2>o.h1?i=`H2 finished at ${o.h2}ms — slower than H1's ${o.h1}ms because a single packet loss stalled all ${s.resources.length} streams (TCP HoL). H3 finished at ${o.h3}ms: loss isolated to one stream.`:o.h3<=o.h2&&o.h3<=o.h1?i=`H3 won at ${o.h3}ms thanks to per-stream independence. H2 = ${o.h2}ms (shared stall), H1 = ${o.h1}ms (independent conns but serial per conn).`:i=`Fastest: ${c(l)} @${o[l]}ms. Slowest: ${c(d)} @${o[d]}ms. Raise the loss rate to emphasise the HoL gap.`}return e.jsxs("div",{className:"http-section",children:[e.jsx("div",{className:"http-section-label",children:"Comparison"}),e.jsx("div",{className:"http-summary",children:fn.map(l=>{const d=n[l.key],c=d.connections.reduce((p,m)=>p+m.bytesTransferred,0);return e.jsxs("div",{className:"http-summary-card",children:[e.jsx("div",{className:"http-summary-label",style:{color:l.accent},children:l.label}),e.jsxs("div",{className:"http-summary-row",children:[e.jsx("strong",{children:"page load"}),e.jsx("span",{children:d.completedAt!=null?Ga(d.completedAt):"…"})]}),e.jsxs("div",{className:"http-summary-row",children:[e.jsx("strong",{children:"bytes"}),e.jsx("span",{children:Ao(c)})]}),e.jsxs("div",{className:"http-summary-row",children:[e.jsx("strong",{children:"retransmits"}),e.jsx("span",{children:d.retransmits})]}),e.jsxs("div",{className:"http-summary-row",children:[e.jsx("strong",{children:"conns"}),e.jsx("span",{children:d.connections.length})]})]},l.key)})}),e.jsx("div",{className:"http-narrative",children:i})]})}
function Lu({snaps:n}){const t=[];for(const r of fn)for(const o of n[r.key].events)t.push({...o,version:r.label,accent:r.accent});t.sort((r,o)=>o.t-r.t);const s=t.slice(0,10);return e.jsx("div",{className:"http-log",children:s.length===0?e.jsx("div",{className:"http-log-line http-log-muted",children:"(press Start — loss & completion events land here)"}):s.map((r,o)=>e.jsxs("div",{className:"http-log-line",children:[e.jsxs("span",{className:"http-log-time",children:[r.t,"ms"]}),e.jsxs("span",{className:"http-log-tag",style:{color:r.accent},children:["[",r.version,"]"]}),e.jsx("span",{className:"http-log-type",style:{color:r.type==="loss"?kr:r.type==="done"||r.type==="done-res"?zs:Fe},children:r.type}),e.jsx("span",{className:"http-log-text",children:r.text})]},o))})}
const Fu=`
.http-root {
  color: ${Ge};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Xt};
}
.http-panel {
  background: ${Tu};
  border: 1px solid ${Ee};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.http-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Ee};
  gap: 12px;
}
.http-title {
  font-size: 18px;
  font-weight: 600;
  color: ${Ge};
}
.http-subtitle {
  font-size: 12px;
  color: ${Fe};
  margin-top: 2px;
}
.http-title-controls { display: flex; gap: 8px; }
.http-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${Ee};
}
.http-label {
  color: ${Fe};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.http-unit {
  color: ${Ge};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-width: 80px;
}
.http-hint {
  color: ${Fe};
  font-size: 11px;
  margin-left: auto;
  font-style: italic;
}
.http-btn {
  padding: 5px 14px;
  background: ${da};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.http-btn:hover:not(:disabled) { filter: brightness(1.15); }
.http-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.http-btn-ghost {
  background: transparent;
  border: 1px solid ${Ee};
  color: ${Ge};
}
.http-sep {
  width: 1px;
  height: 22px;
  background: ${Ee};
  margin: 0 4px;
}
.http-cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid ${Ee};
}
@media (max-width: 960px) {
  .http-cols { grid-template-columns: 1fr; }
}
.http-col {
  background: ${Xt};
  border: 1px solid ${Ee};
  border-radius: 6px;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.http-col-head {
  border-bottom: 1px dashed ${Ee};
  padding-bottom: 8px;
}
.http-col-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.http-col-tag {
  font-size: 11px;
  color: ${Fe};
  margin-top: 2px;
  font-style: italic;
}
.http-col-meta {
  margin-top: 6px;
  font-size: 11px;
  color: ${Fe};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.http-col-meta strong {
  color: ${Ge};
  font-weight: 600;
}
.http-lanes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.http-lane {
  display: grid;
  grid-template-columns: 130px 1fr 80px;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.http-lane-label {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${Ge};
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}
.http-lane-kind {
  font-size: 9px;
  text-transform: uppercase;
  color: ${Fe};
  letter-spacing: 0.1em;
  font-weight: 700;
}
.http-lane-kind[data-kind="html"] { color: ${da}; }
.http-lane-kind[data-kind="css"] { color: ${Va}; }
.http-lane-kind[data-kind="img"] { color: ${pa}; }
.http-lane-kind[data-kind="js"] { color: ${zs}; }
.http-lane-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.http-lane-size {
  color: ${Fe};
  font-size: 10px;
}
.http-bar-wrap {
  position: relative;
  height: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid ${Ee};
  border-radius: 3px;
  overflow: hidden;
}
.http-bar {
  height: 100%;
  transition: width 0.1s linear, background 0.2s;
  border-radius: 2px;
}
.http-bar-done {
  filter: brightness(1.1);
}
.http-bar-blocked {
  background: ${kr} !important;
  animation: http-blink 0.6s ease-in-out infinite;
}
.http-bar-blocked-overlay {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent 0,
    transparent 4px,
    rgba(255,102,102,0.25) 4px,
    rgba(255,102,102,0.25) 8px
  );
  pointer-events: none;
  animation: http-blink 0.6s ease-in-out infinite;
}
@keyframes http-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.http-bar-pct {
  position: absolute;
  right: 4px;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  font-size: 10px;
  color: ${Ge};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-shadow: 0 0 3px ${Xt};
}
.http-lane-right {
  text-align: right;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.http-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 700;
  font-size: 9px;
  letter-spacing: 0.04em;
}
.http-badge-block {
  background: ${kr};
  color: ${Xt};
  animation: http-blink 0.6s ease-in-out infinite;
}
.http-badge-done {
  background: ${zs};
  color: ${Xt};
}
.http-badge-pending {
  background: transparent;
  color: ${Fe};
  border: 1px solid ${Ee};
}
.http-conns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed ${Ee};
}
.http-conn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid ${Ee};
  border-radius: 3px;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${Fe};
}
.http-conn-id { color: ${Ge}; font-weight: 600; }
.http-conn-bytes { color: ${Ge}; }
.http-conn-blocked {
  color: ${kr};
  font-weight: 700;
}
.http-section {
  padding: 12px 0;
  border-bottom: 1px dashed ${Ee};
}
.http-section:last-of-type { border-bottom: none; }
.http-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${Fe};
  margin-bottom: 8px;
  font-weight: 600;
}
.http-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (max-width: 720px) {
  .http-summary { grid-template-columns: 1fr; }
}
.http-summary-card {
  background: ${Xt};
  border: 1px solid ${Ee};
  border-radius: 5px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
}
.http-summary-label {
  font-weight: 700;
  margin-bottom: 4px;
  font-size: 12px;
}
.http-summary-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
  color: ${Fe};
}
.http-summary-row strong {
  color: ${Ge};
  font-weight: 500;
}
.http-summary-row span { color: ${Ge}; }
.http-narrative {
  margin-top: 10px;
  padding: 8px 10px;
  background: ${Xt};
  border-left: 3px solid ${pa};
  border-radius: 4px;
  font-size: 12px;
  color: ${Ge};
  line-height: 1.45;
}
.http-log {
  margin-top: 8px;
  padding: 8px 12px;
  background: ${Xt};
  border: 1px solid ${Ee};
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  max-height: 140px;
  overflow-y: auto;
}
.http-log-line {
  padding: 2px 0;
  line-height: 1.4;
  border-bottom: 1px dotted ${Ee};
  display: flex;
  gap: 8px;
  color: ${Ge};
}
.http-log-line:last-child { border-bottom: none; }
.http-log-muted { color: ${Fe}; }
.http-log-time {
  color: ${Fe};
  width: 54px;
  flex-shrink: 0;
  text-align: right;
}
.http-log-tag {
  width: 72px;
  flex-shrink: 0;
  font-weight: 700;
}
.http-log-type {
  width: 66px;
  flex-shrink: 0;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.http-log-text {
  color: ${Ge};
}
`;

export default zu;
export { zu as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(zu, {}));
  return () => root.unmount();
}
