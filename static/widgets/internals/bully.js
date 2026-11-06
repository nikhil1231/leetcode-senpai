import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class Sc{constructor({nodeCount:t=5,messageDelayMs:s=120,electionTimeoutMs:r=400}={}){this.N=t,this.messageDelayMs=s,this.electionTimeoutMs=r,this.simTime=0,this.messages=[],this._msgId=0,this._pendingEvents=[],this.nodes=[];for(let i=0;i<t;i++)this.nodes.push(this._freshNode(i));const o=t-1;this.nodes[o].role="leader";for(const i of this.nodes)i.currentLeader=o}_freshNode(t){return{id:t,role:"follower",alive:!0,currentLeader:null,electionActive:!1,electionTimerRemaining:0,higherOkReceived:!1,recentlyElected:0}}_emit(t){this._pendingEvents.push({t:this.simTime,...t})}tick(t){this.simTime+=t,this._pendingEvents=[];for(const r of this.nodes)r.alive&&(r.recentlyElected>0&&(r.recentlyElected=Math.max(0,r.recentlyElected-t)),r.electionActive&&(r.electionTimerRemaining-=t,r.electionTimerRemaining<=0&&this._onElectionTimeout(r)));const s=[];for(const r of this.messages)r.progress+=t/this.messageDelayMs,r.progress>=1?this._deliver(r):s.push(r);return this.messages=s,this._pendingEvents}killNode(t){const s=this.nodes[t];if(!s||!s.alive)return;const r=s.role==="leader";s.alive=!1,s.role="follower",s.electionActive=!1,s.electionTimerRemaining=0,s.higherOkReceived=!1,this.messages=this.messages.filter(o=>o.from!==t&&o.to!==t),this._emit({type:"nodeKilled",nodeId:t,wasLeader:r})}reviveNode(t){const s=this.nodes[t];!s||s.alive||(s.alive=!0,s.role="follower",s.electionActive=!1,s.higherOkReceived=!1,s.electionTimerRemaining=0,this._emit({type:"nodeRevived",nodeId:t}))}detectFailure(t){const s=this.nodes[t];!s||!s.alive||(this._emit({type:"failureDetected",nodeId:t,suspectedLeader:s.currentLeader}),s.currentLeader=null,this._startElection(s))}snapshot(){return{simTime:this.simTime,N:this.N,electionTimeoutMs:this.electionTimeoutMs,messageDelayMs:this.messageDelayMs,nodes:this.nodes.map(t=>({id:t.id,role:t.electionActive?"candidate":t.role,alive:t.alive,currentLeader:t.currentLeader,electionActive:t.electionActive,electionTimerRemaining:t.electionTimerRemaining,higherOkReceived:t.higherOkReceived,recentlyElected:t.recentlyElected})),messages:this.messages.map(t=>({id:t.id,from:t.from,to:t.to,type:t.type,progress:t.progress}))}}_send(t,s,r,o){!this.nodes[t]||!this.nodes[s]||this.nodes[t].alive&&this.messages.push({id:++this._msgId,from:t,to:s,type:r,data:o||{},progress:0})}_deliver(t){const s=this.nodes[t.to];if(!(!s||!s.alive))switch(t.type){case"ELECTION":return this._onElection(s,t);case"OK":return this._onOk(s,t);case"COORDINATOR":return this._onCoordinator(s,t)}}_startElection(t){const s=[];for(let r=t.id+1;r<this.N;r++)s.push(r);if(s.length===0){this._declareLeader(t);return}t.electionActive=!0,t.higherOkReceived=!1,t.electionTimerRemaining=this.electionTimeoutMs,this._emit({type:"electionStart",nodeId:t.id,higherIds:s.slice()});for(const r of s)this._send(t.id,r,"ELECTION")}_onElection(t,s){this._emit({type:"electionReceived",nodeId:t.id,from:s.from}),this._send(t.id,s.from,"OK"),t.electionActive||this._startElection(t)}_onOk(t,s){t.electionActive&&(t.higherOkReceived=!0,this._emit({type:"okReceived",nodeId:t.id,from:s.from}),t.electionActive=!1,t.electionTimerRemaining=0,t.role="follower")}_onCoordinator(t,s){const r=s.from;t.electionActive=!1,t.electionTimerRemaining=0,t.higherOkReceived=!1,t.currentLeader=r,t.id!==r&&t.role==="leader"&&(t.role="follower"),this._emit({type:"coordinatorReceived",nodeId:t.id,leaderId:r})}_onElectionTimeout(t){if(t.higherOkReceived){t.electionActive=!1,t.electionTimerRemaining=0;return}this._emit({type:"electionTimeout",nodeId:t.id}),this._declareLeader(t)}_declareLeader(t){t.electionActive=!1,t.electionTimerRemaining=0,t.higherOkReceived=!1,t.role="leader",t.currentLeader=t.id,t.recentlyElected=800,this._emit({type:"leaderElected",nodeId:t.id});for(let s=0;s<this.N;s++)s!==t.id&&this._send(t.id,s,"COORDINATOR")}}
const wa=620,ka=320,$c=wa/2,Nc=ka/2+10,Cc=120,et=32,_s=5,Ye={leader:"#f5c542",candidate:"#a15cff",follower:"#4a8fd8",dead:"#3a3a3a"},ss={ELECTION:"#ff5a5a",OK:"#4a8fd8",COORDINATOR:"#f5c542"};
function _c(n=_s,t=Cc,s=$c,r=Nc){const o=[];for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n;o.push({x:s+t*Math.cos(a),y:r+t*Math.sin(a)})}return o}
function Rc(n,t){t&&t.N;const s=t?t.electionTimeoutMs:400;switch(n.type){case"failureDetected":{const r=n.suspectedLeader===null||n.suspectedLeader===void 0?"(unknown)":`N${n.suspectedLeader}`;return`N${n.nodeId} detects leader ${r} dead -> sends ELECTION to all nodes with id > ${n.nodeId} (timeout ${s}ms)`}case"electionStart":return n.higherIds.length===0?`N${n.nodeId} started election -> no nodes with id > ${n.nodeId} exist -> N${n.nodeId} is leader`:`N${n.nodeId} started election -> ELECTION sent to {${n.higherIds.map(r=>"N"+r).join(", ")}}`;case"electionReceived":return`N${n.nodeId} received ELECTION from N${n.from} -> replies OK, starts its own election`;case"okReceived":return`N${n.nodeId} received OK from N${n.from} -> backs off, N${n.from} takes over`;case"electionTimeout":return`N${n.nodeId} got no OK within ${s}ms -> declares itself leader`;case"leaderElected":return`N${n.nodeId} is the new leader -> broadcasting COORDINATOR to all other nodes`;case"coordinatorReceived":return`N${n.nodeId} received COORDINATOR -> new leader is N${n.leaderId}`;case"nodeKilled":return`N${n.nodeId} killed${n.wasLeader?" (was the leader!)":""}`;case"nodeRevived":return`N${n.nodeId} revived (joins as follower)`;default:return JSON.stringify(n)}}
const li={leaderElected:10,failureDetected:9,electionTimeout:9,electionStart:8,nodeKilled:8,nodeRevived:7,coordinatorReceived:6,okReceived:5,electionReceived:4},ci=`
.bully-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 920px;
}
.bully-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.bully-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.bully-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.bully-toolbar label { font-size: 12px; color: #8a95a3; }
.bully-toolbar select,
.bully-toolbar input[type="number"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.bully-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.bully-toolbar button:hover { background: #232a33; }
.bully-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.bully-toolbar button.primary:hover { background: #3467b0; }
.bully-toolbar button.danger {
  background: #8a2c2c;
  border-color: #a03c3c;
}
.bully-toolbar button.danger:hover { background: #a03333; }
.bully-toolbar .spacer { flex: 1; }
.bully-main {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 12px;
}
.bully-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.bully-node-panels {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.bully-node-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
}
.bully-node-card:hover { background: #1c232d; }
.bully-node-card .hdr {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  font-weight: 600;
}
.bully-node-card .meta {
  color: #8a95a3;
  font-size: 11px;
}
.bully-status {
  margin-top: 10px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 20px;
  color: #cfd6e0;
}
.bully-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.bully-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.bully-widget svg text { user-select: none; }
`;
function Tc(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState(!0),[l,d]=h.useState("Cluster initialized. N4 is leader."),[c,p]=h.useState(4),[m,g]=h.useState(4),[w,C]=h.useState(2);h.useEffect(()=>{n.current=new Sc({nodeCount:_s,messageDelayMs:140,electionTimeoutMs:400}),o(n.current.snapshot()),d(`Cluster initialized. N${_s-1} is leader.`)},[t]);const j=h.useCallback(()=>{const b=n.current;if(!b)return;const x=b.tick(50);if(o(b.snapshot()),x.length>0){let f=x[0];for(const u of x)(li[u.type]??0)>=(li[f.type]??0)&&(f=u);d(Rc(f,b.snapshot()))}},[]);h.useEffect(()=>{if(!i)return;const b=setInterval(j,100);return()=>clearInterval(b)},[i,j]);const $=h.useCallback(b=>{const x=n.current;if(!x)return;x.nodes[b].alive?x.killNode(b):x.reviveNode(b),o(x.snapshot())},[]),O=h.useCallback(()=>{const b=n.current;if(!b)return;const x=b.nodes.find(f=>f.alive&&f.role==="leader");if(!x){d("No alive leader to kill.");return}b.killNode(x.id),o(b.snapshot()),d(`Killed leader N${x.id}. No one has noticed yet — click "Detect failure" from a lower-id follower.`)},[]),q=h.useCallback(()=>{const b=n.current;b&&(b.killNode(c),o(b.snapshot()),d(`Killed N${c}.`))},[c]),R=h.useCallback(()=>{const b=n.current;b&&(b.reviveNode(m),o(b.snapshot()),d(`Revived N${m}.`))},[m]),D=h.useCallback(()=>{const b=n.current;if(!b)return;const x=b.nodes[w];if(!x||!x.alive){d(`N${w} is not alive; cannot detect.`);return}b.detectFailure(w),o(b.snapshot()),d(`N${w} initiates election.`)},[w]),B=h.useMemo(()=>_c(_s),[]);if(!r)return e.jsxs("div",{className:"bully-widget",children:[e.jsx("style",{children:ci}),e.jsx("h2",{children:"Bully Leader Election Visualizer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const V=r.nodes.find(b=>b.alive&&b.role==="leader"),T=r.nodes.filter(b=>b.alive&&b.electionActive),_=Array.from({length:_s},(b,x)=>x);return e.jsxs("div",{className:"bully-widget",children:[e.jsx("style",{children:ci}),e.jsxs("h2",{children:[e.jsx("span",{children:"Bully Leader Election Visualizer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:()=>a(b=>!b),children:i?"Pause":"Auto-tick"}),e.jsx("button",{onClick:j,disabled:i,children:"Step"}),e.jsx("button",{onClick:()=>s(b=>b+1),children:"Reset"})]})]}),e.jsx("p",{className:"sub",children:"Petrov ch.10: highest-id live node wins. 5 nodes (ids 0..4). Click a node to kill/revive it."}),e.jsxs("div",{className:"bully-toolbar",children:[e.jsx("button",{className:"danger",onClick:O,children:"Kill leader"}),e.jsx("label",{children:"Kill id:"}),e.jsx("select",{value:c,onChange:b=>p(Number(b.target.value)),children:_.map(b=>e.jsxs("option",{value:b,children:["N",b]},b))}),e.jsx("button",{onClick:q,children:"Kill"}),e.jsx("label",{children:"Revive id:"}),e.jsx("select",{value:m,onChange:b=>g(Number(b.target.value)),children:_.map(b=>e.jsxs("option",{value:b,children:["N",b]},b))}),e.jsx("button",{onClick:R,children:"Revive"}),e.jsx("label",{children:"Detect failure from:"}),e.jsx("select",{value:w,onChange:b=>C(Number(b.target.value)),children:_.map(b=>e.jsxs("option",{value:b,children:["N",b]},b))}),e.jsx("button",{className:"primary",onClick:D,children:"Detect failure"}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:12,color:"#8a95a3"},children:["Leader: ",V?`N${V.id}`:"none",T.length>0&&` | running election: ${T.map(b=>"N"+b.id).join(", ")}`," ·  sim t = ",(r.simTime/1e3).toFixed(2),"s"]})]}),e.jsxs("div",{className:"bully-main",children:[e.jsxs("div",{className:"bully-canvas-wrap",children:[e.jsxs("svg",{width:wa,height:ka,children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"bully-arrow-red",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:ss.ELECTION})}),e.jsx("marker",{id:"bully-arrow-blue",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:ss.OK})}),e.jsx("marker",{id:"bully-arrow-gold",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:ss.COORDINATOR})})]}),B.map((b,x)=>{const f=B[(x+1)%B.length];return e.jsx("line",{x1:b.x,y1:b.y,x2:f.x,y2:f.y,stroke:"#1e252e",strokeWidth:"1"},`edge-${x}`)}),r.messages.map(b=>{const x=B[b.from],f=B[b.to],u=f.x-x.x,y=f.y-x.y,v=Math.sqrt(u*u+y*y)||1,I=-y/v,S=u/v,H=b.type==="ELECTION"?-6:b.type==="OK"?6:0,M=I*H,k=S*H,P=x.x+M+(f.x-x.x)*b.progress,N=x.y+k+(f.y-x.y)*b.progress,z=ss[b.type]||"#888";return e.jsxs("g",{children:[e.jsx("line",{x1:x.x+M,y1:x.y+k,x2:f.x+M,y2:f.y+k,stroke:z,strokeOpacity:"0.18",strokeWidth:"1",strokeDasharray:b.type==="OK"?"3 3":void 0}),e.jsx("circle",{cx:P,cy:N,r:b.type==="COORDINATOR"?6:5,fill:z,opacity:"0.95",children:e.jsx("title",{children:`${b.type} ${b.from}->${b.to}`})})]},b.id)}),r.nodes.map(b=>{const x=B[b.id];let f;b.alive?b.role==="leader"?f=Ye.leader:b.electionActive?f=Ye.candidate:f=Ye.follower:f=Ye.dead;const u=b.recentlyElected>0;return e.jsxs("g",{onClick:()=>$(b.id),style:{cursor:"pointer"},children:[u&&e.jsx("circle",{cx:x.x,cy:x.y,r:et+8,fill:"none",stroke:Ye.leader,strokeWidth:"3",opacity:b.recentlyElected/800}),b.alive&&b.electionActive&&e.jsx("circle",{cx:x.x,cy:x.y,r:et+5,fill:"none",stroke:Ye.candidate,strokeWidth:"2",strokeDasharray:"4 3",opacity:"0.8"}),e.jsx("circle",{cx:x.x,cy:x.y,r:et,fill:f,stroke:b.alive?"#111":"#555",strokeWidth:"2"}),e.jsxs("text",{x:x.x,y:x.y-2,textAnchor:"middle",fill:"#111",fontSize:"15",fontWeight:"700",children:["N",b.id]}),e.jsx("text",{x:x.x,y:x.y+14,textAnchor:"middle",fill:"#111",fontSize:"10",fontWeight:"600",children:b.alive?b.role==="leader"?"LEADER":b.electionActive?"ELECT":b.currentLeader!==null?`-> N${b.currentLeader}`:"(?)":"X"}),!b.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:x.x-et*.6,y1:x.y-et*.6,x2:x.x+et*.6,y2:x.y+et*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:x.x+et*.6,y1:x.y-et*.6,x2:x.x-et*.6,y2:x.y+et*.6,stroke:"#ff6b6b",strokeWidth:"3"})]}),b.alive&&b.electionActive&&e.jsxs("text",{x:x.x,y:x.y+et+14,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",children:["waiting ",Math.max(0,Math.round(b.electionTimerRemaining)),"ms"]})]},b.id)})]}),e.jsxs("div",{className:"bully-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ye.leader}}),"leader"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ye.follower}}),"follower"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ye.candidate}}),"running election"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ye.dead}}),"crashed"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ss.ELECTION}}),"ELECTION"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ss.OK}}),"OK"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ss.COORDINATOR}}),"COORDINATOR"]})]})]}),e.jsx("div",{className:"bully-node-panels",children:r.nodes.map(b=>{const x=b.alive?b.role==="leader"?Ye.leader:b.electionActive?Ye.candidate:Ye.follower:"#888";let f;return b.alive?b.role==="leader"?f="LEADER":b.electionActive?f="CANDIDATE":f="FOLLOWER":f="CRASHED",e.jsxs("div",{className:"bully-node-card",onClick:()=>$(b.id),title:"click to kill / revive",children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:x},children:["N",b.id," ",f]}),e.jsx("span",{style:{color:"#8a95a3"},children:b.alive?"alive":"dead"})]}),e.jsxs("div",{className:"meta",children:["leader:"," ",b.currentLeader===null?"(none)":`N${b.currentLeader}`,b.electionActive&&` | waiting ${Math.max(0,Math.round(b.electionTimerRemaining))}ms`,b.higherOkReceived&&" | OK received"]})]},b.id)})})]}),e.jsx("div",{className:"bully-status",children:l})]})}

export default Tc;
export { Tc as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Tc, {}));
  return () => root.unmount();
}
