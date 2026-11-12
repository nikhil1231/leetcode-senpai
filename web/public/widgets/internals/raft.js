import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ii({title:n,mode:t,cost:s,blockSize:r,winner:o,other:i}){const a=o===t,l=o&&o!=="tie"&&!a,d="rcw-compare-card"+(a?" rcw-winner":"")+(l?" rcw-loser":""),c=i&&s.bytesRead>0?(i.bytesRead/s.bytesRead).toFixed(2):null;return e.jsxs("div",{className:d,children:[e.jsxs("div",{className:"rcw-compare-title",children:[e.jsx("span",{children:n}),a&&e.jsx("span",{className:"rcw-badge rcw-win",children:"WINNER"}),l&&e.jsx("span",{className:"rcw-badge rcw-lose",children:"slower"})]}),e.jsxs("div",{className:"rcw-compare-detail",children:[e.jsxs("div",{children:[s.blocksRead," blocks × ",r," B = ",e.jsxs("b",{children:[s.bytesRead," bytes"]})]}),e.jsxs("div",{children:["touched: ",s.columnsTouched.join(", ")]}),e.jsxs("div",{children:["rows matched: ",s.rowsMatched]}),a&&c&&c!=="1.00"&&e.jsxs("div",{style:{color:"#7fd6a4"},children:[c,"× less I/O than the other layout"]})]})]})}
function fc(n){let t=n>>>0;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
function xc(n,t,s,r){return n!==s?n>s:t>=r}
class gc{constructor({nodeCount:t=5,electionTimeoutMin:s=150,electionTimeoutMax:r=300,heartbeatInterval:o=50,messageFlightMs:i=80,seed:a=1}={}){this.N=t,this.quorum=Math.floor(t/2)+1,this.electionTimeoutMin=s,this.electionTimeoutMax=r,this.heartbeatInterval=o,this.messageFlightMs=i,this.rand=fc(a),this.simTime=0,this.messages=[],this._msgId=0,this._pendingEvents=[],this.nodes=[];for(let l=0;l<t;l++)this.nodes.push(this._freshNode(l))}_freshNode(t){return{id:t,role:"follower",currentTerm:0,votedFor:null,log:[],commitIndex:0,lastApplied:0,nextIndex:new Array(this.N).fill(1),matchIndex:new Array(this.N).fill(0),electionTimeoutRemaining:this._randTimeout(),heartbeatTimerRemaining:this.heartbeatInterval,alive:!0,votesGranted:new Set,recentlyElected:0}}_randTimeout(){return this.electionTimeoutMin+this.rand()*(this.electionTimeoutMax-this.electionTimeoutMin)}_emit(t){this._pendingEvents.push({t:this.simTime,...t})}tick(t){this.simTime+=t,this._pendingEvents=[];for(const r of this.nodes)r.alive&&(r.recentlyElected>0&&(r.recentlyElected=Math.max(0,r.recentlyElected-t)),r.role==="leader"?(r.heartbeatTimerRemaining-=t,r.heartbeatTimerRemaining<=0&&(r.heartbeatTimerRemaining=this.heartbeatInterval,this._leaderBroadcastAppend(r))):(r.electionTimeoutRemaining-=t,r.electionTimeoutRemaining<=0&&this._startElection(r)));const s=[];for(const r of this.messages)r.progress+=t/this.messageFlightMs,r.progress>=1?this._deliver(r):s.push(r);return this.messages=s,this._pendingEvents}clientWrite(t){const s=this.nodes.find(o=>o.alive&&o.role==="leader");if(!s)return this._emit({type:"clientWriteRejected",reason:"no leader",value:t}),{ok:!1,reason:"no leader"};s.log.push({term:s.currentTerm,value:t});const r=s.log.length;return s.matchIndex[s.id]=r,s.nextIndex[s.id]=r+1,this._emit({type:"clientWrite",nodeId:s.id,value:t,entryIndex:r,term:s.currentTerm}),s.heartbeatTimerRemaining=0,{ok:!0,index:r}}killNode(t){const s=this.nodes[t];!s||!s.alive||(s.alive=!1,s.role="follower",s.votedFor=null,s.votesGranted=new Set,this.messages=this.messages.filter(r=>r.from!==t&&r.to!==t),this._emit({type:"nodeKilled",nodeId:t}))}reviveNode(t){const s=this.nodes[t];!s||s.alive||(s.alive=!0,s.role="follower",s.votedFor=null,s.votesGranted=new Set,s.electionTimeoutRemaining=this._randTimeout(),s.heartbeatTimerRemaining=this.heartbeatInterval,this._emit({type:"nodeRevived",nodeId:t}))}snapshot(){return{simTime:this.simTime,quorum:this.quorum,nodes:this.nodes.map(t=>({id:t.id,role:t.role,alive:t.alive,currentTerm:t.currentTerm,votedFor:t.votedFor,log:t.log.slice(),commitIndex:t.commitIndex,nextIndex:t.nextIndex.slice(),matchIndex:t.matchIndex.slice(),electionTimeoutRemaining:t.electionTimeoutRemaining,recentlyElected:t.recentlyElected,votesGranted:Array.from(t.votesGranted)})),messages:this.messages.map(t=>({id:t.id,from:t.from,to:t.to,type:t.type,term:t.term,progress:t.progress,data:t.data}))}}_send(t,s,r,o,i){!this.nodes[t].alive||!this.nodes[s].alive||this.messages.push({id:++this._msgId,from:t,to:s,type:r,term:o,data:i,progress:0})}_deliver(t){const s=this.nodes[t.to];if(!(!s||!s.alive))switch(t.type){case"RequestVote":return this._onRequestVote(s,t);case"RequestVoteReply":return this._onRequestVoteReply(s,t);case"AppendEntries":return this._onAppendEntries(s,t);case"AppendEntriesReply":return this._onAppendEntriesReply(s,t)}}_stepDown(t,s){const r=t.role==="leader";t.role="follower",t.currentTerm=s,t.votedFor=null,t.votesGranted=new Set,t.electionTimeoutRemaining=this._randTimeout(),r&&this._emit({type:"steppedDown",nodeId:t.id,term:s})}_startElection(t){t.currentTerm+=1,t.role="candidate",t.votedFor=t.id,t.votesGranted=new Set([t.id]),t.electionTimeoutRemaining=this._randTimeout();const s=t.log.length,r=s>0?t.log[s-1].term:0;this._emit({type:"electionStart",nodeId:t.id,term:t.currentTerm});for(let o=0;o<this.N;o++)o!==t.id&&this._send(t.id,o,"RequestVote",t.currentTerm,{candidateId:t.id,lastLogIndex:s,lastLogTerm:r});this._maybeBecomeLeader(t)}_becomeLeader(t){t.role="leader",t.recentlyElected=800;for(let s=0;s<this.N;s++)t.nextIndex[s]=t.log.length+1,t.matchIndex[s]=0;t.matchIndex[t.id]=t.log.length,t.heartbeatTimerRemaining=0,this._emit({type:"leaderElected",nodeId:t.id,term:t.currentTerm,votes:t.votesGranted.size,clusterSize:this.N})}_maybeBecomeLeader(t){t.role==="candidate"&&t.votesGranted.size>=this.quorum&&this._becomeLeader(t)}_onRequestVote(t,s){const{candidateId:r,lastLogIndex:o,lastLogTerm:i}=s.data;s.term>t.currentTerm&&this._stepDown(t,s.term);let a=!1;const l=t.log.length,d=l>0?t.log[l-1].term:0,c=xc(i,o,d,l);s.term===t.currentTerm&&(t.votedFor===null||t.votedFor===r)&&c&&(a=!0,t.votedFor=r,t.electionTimeoutRemaining=this._randTimeout()),this._emit({type:a?"voteGranted":"voteDenied",nodeId:t.id,to:r,term:t.currentTerm}),this._send(t.id,r,"RequestVoteReply",t.currentTerm,{granted:a,voter:t.id})}_onRequestVoteReply(t,s){if(s.term>t.currentTerm){this._stepDown(t,s.term);return}t.role!=="candidate"||s.term!==t.currentTerm||s.data.granted&&(t.votesGranted.add(s.data.voter),this._maybeBecomeLeader(t))}_leaderBroadcastAppend(t){for(let s=0;s<this.N;s++)s!==t.id&&this._sendAppendEntriesTo(t,s);this._emit({type:"appendBroadcast",nodeId:t.id,term:t.currentTerm,logLen:t.log.length})}_sendAppendEntriesTo(t,s){const o=t.nextIndex[s]-1,i=o>0?t.log[o-1].term:0,a=t.log.slice(o);this._send(t.id,s,"AppendEntries",t.currentTerm,{prevLogIndex:o,prevLogTerm:i,entries:a,leaderCommit:t.commitIndex})}_onAppendEntries(t,s){const{prevLogIndex:r,prevLogTerm:o,entries:i,leaderCommit:a}=s.data;let l=!1,d=0;if(s.term<t.currentTerm){this._send(t.id,s.from,"AppendEntriesReply",t.currentTerm,{success:!1,matchIndex:0,follower:t.id});return}if(s.term>t.currentTerm&&this._stepDown(t,s.term),t.role="follower",t.currentTerm=s.term,t.electionTimeoutRemaining=this._randTimeout(),r===0||r<=t.log.length&&t.log[r-1].term===o){let p=r;for(let m=0;m<i.length;m++){const g=p+m;g<t.log.length?t.log[g].term!==i[m].term&&(t.log.length=g,t.log.push(i[m])):t.log.push(i[m])}if(l=!0,d=r+i.length,a>t.commitIndex){const m=Math.min(a,t.log.length);m>t.commitIndex&&(t.commitIndex=m,this._emit({type:"followerCommitted",nodeId:t.id,commitIndex:t.commitIndex}))}}this._send(t.id,s.from,"AppendEntriesReply",t.currentTerm,{success:l,matchIndex:d,follower:t.id,prevLogIndex:r})}_onAppendEntriesReply(t,s){if(s.term>t.currentTerm){this._stepDown(t,s.term);return}if(t.role!=="leader"||s.term!==t.currentTerm)return;const r=s.data.follower;s.data.success?(t.matchIndex[r]=Math.max(t.matchIndex[r],s.data.matchIndex),t.nextIndex[r]=t.matchIndex[r]+1,this._maybeAdvanceCommit(t)):(t.nextIndex[r]=Math.max(1,t.nextIndex[r]-1),this._emit({type:"appendRejected",nodeId:r,leaderId:t.id,nextIndex:t.nextIndex[r]}),this._sendAppendEntriesTo(t,r))}_maybeAdvanceCommit(t){for(let s=t.log.length;s>t.commitIndex;s--){if(t.log[s-1].term!==t.currentTerm)continue;let r=0;for(let o=0;o<this.N;o++)t.matchIndex[o]>=s&&r++;if(r>=this.quorum){const o=t.commitIndex;t.commitIndex=s;for(let i=o+1;i<=s;i++)this._emit({type:"entryCommitted",nodeId:t.id,entryIndex:i,value:t.log[i-1].value,term:t.log[i-1].term,matchIndex:t.matchIndex.slice()});break}}}}
const ya=560,va=460,bc=ya/2,yc=va/2,vc=160,lt=30,ys={leader:"#f5c542",candidate:"#a15cff",follower:"#4a8fd8"},Ar={RequestVote:"#a15cff",RequestVoteReply:"#d6b8ff",AppendEntries:"#4a8fd8",AppendEntriesReply:"#b6d4f0"};
function wc(n=5,t=vc,s=bc,r=yc){const o=[];for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n;o.push({x:s+t*Math.cos(a),y:r+t*Math.sin(a)})}return o}
function kc(n,t){switch(n.type){case"electionStart":return`N${n.nodeId} election timeout -> candidate term=${n.term}, broadcast RequestVote`;case"voteGranted":return`N${n.nodeId} granted vote to N${n.to} (term ${n.term})`;case"voteDenied":return`N${n.nodeId} denied vote to N${n.to} (term ${n.term})`;case"leaderElected":return`N${n.nodeId} elected leader for term ${n.term} with ${n.votes}/${n.clusterSize} votes`;case"steppedDown":return`N${n.nodeId} stepped down (higher term ${n.term} observed)`;case"appendBroadcast":return`N${n.nodeId} leader heartbeat (term ${n.term}, log=${n.logLen})`;case"appendRejected":return`N${n.nodeId} rejected AppendEntries from N${n.leaderId}: prevLog mismatch. Leader nextIndex -> ${n.nextIndex}`;case"clientWrite":return`N${n.nodeId} client write '${n.value}' -> entry ${n.entryIndex} term=${n.term}`;case"clientWriteRejected":return`client write '${n.value}' rejected: ${n.reason}`;case"entryCommitted":return`Entry ${n.entryIndex} ('${n.value}') committed at N${n.nodeId} (matchIndex quorum: [${n.matchIndex.join(",")}])`;case"followerCommitted":return`N${n.nodeId} advanced commitIndex to ${n.commitIndex}`;case"nodeKilled":return`N${n.nodeId} killed.`;case"nodeRevived":return`N${n.nodeId} revived.`;default:return JSON.stringify(n)}}
const ai=`
.raft-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 920px;
}
.raft-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.raft-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.raft-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.raft-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 120px;
}
.raft-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.raft-toolbar button:hover { background: #232a33; }
.raft-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.raft-toolbar button.primary:hover { background: #3467b0; }
.raft-toolbar .spacer { flex: 1; }
.raft-toolbar .quorum {
  font-size: 12px;
  color: #8a95a3;
  margin-left: 8px;
}
.raft-main {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 12px;
}
.raft-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.raft-node-panels {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.raft-node-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
}
.raft-node-card .hdr {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  font-weight: 600;
}
.raft-node-card .meta {
  color: #8a95a3;
  font-size: 11px;
  margin-bottom: 4px;
}
.raft-log-row {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
}
.raft-log-entry {
  width: 38px;
  height: 18px;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  border: 1px solid #2a3038;
  overflow: hidden;
  white-space: nowrap;
  padding: 0 3px;
  box-sizing: border-box;
}
.raft-log-entry.committed { background: #1f5c3a; border-color: #2f7b50; color: #d5f0e0; }
.raft-log-entry.uncommitted { background: #2a3038; color: #cfcfcf; }
.raft-status {
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
.raft-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.raft-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.raft-error {
  color: #ff6b6b;
}
.raft-widget svg text { user-select: none; }
`;
function jc(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState(!1),[l,d]=h.useState("idle"),[c,p]=h.useState(!1),[m,g]=h.useState("x=1"),w=h.useRef(Math.floor(Math.random()*1e9));h.useEffect(()=>{w.current=Math.floor(Math.random()*1e9),n.current=new gc({seed:w.current}),o(n.current.snapshot()),d("Cluster initialized. Waiting for election..."),p(!1)},[t]);const C=h.useCallback(()=>{const R=n.current;if(!R)return;const D=R.tick(50*window.SimClock.scale());if(o(R.snapshot()),D.length>0){const B={leaderElected:10,entryCommitted:9,electionStart:8,clientWrite:8,clientWriteRejected:8,appendRejected:7,nodeKilled:7,nodeRevived:7,followerCommitted:6,steppedDown:5,voteGranted:2,voteDenied:1,appendBroadcast:0};let V=D[0];for(const T of D)(B[T.type]??0)>=(B[V.type]??0)&&(V=T);d(kc(V,R.N)),p(V.type==="clientWriteRejected")}},[]);h.useEffect(()=>{if(!i)return;const R=window.SimClock.every(C,100);return()=>clearInterval(R)},[i,C]);const j=h.useCallback(()=>{const R=n.current;if(!R)return;const D=m.trim();if(!D)return;const B=R.clientWrite(D);o(R.snapshot()),B.ok?(d(`client write '${D}' accepted at leader, entry ${B.index}`),p(!1)):(d(`client write '${D}' rejected: ${B.reason}`),p(!0))},[m]),$=h.useCallback(R=>{const D=n.current;if(!D)return;D.nodes[R].alive?D.killNode(R):D.reviveNode(R),o(D.snapshot())},[]),O=h.useMemo(()=>wc(5),[]);if(!r)return e.jsxs("div",{className:"raft-widget",children:[e.jsx("style",{children:ai}),e.jsx("h2",{children:"Raft Consensus Visualizer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const q=r.nodes.find(R=>R.alive&&R.role==="leader");return e.jsxs("div",{className:"raft-widget",children:[e.jsx("style",{children:ai}),e.jsxs("h2",{children:[e.jsx("span",{children:"Raft Consensus Visualizer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:()=>a(R=>!R),children:i?"Pause":"Play"}),e.jsx("button",{onClick:C,disabled:i,children:"Step"}),e.jsx("button",{onClick:()=>{a(!1);(()=>s(R=>R+1))()},children:"Reset"}),e.jsx("span",{ref:window.SimClock.control})]})]}),e.jsxs("p",{className:"sub",children:["Chapter 14, Petrov: “Database Internals”. 5 nodes, quorum = ",r.quorum,"."]}),e.jsxs("div",{className:"raft-toolbar",children:[e.jsx("label",{style:{fontSize:12,color:"#8a95a3"},children:"Write:"}),e.jsx("input",{type:"text",value:m,onChange:R=>g(R.target.value),placeholder:"e.g. x=5",onKeyDown:R=>R.key==="Enter"&&j()}),e.jsx("button",{className:"primary",onClick:j,children:"Submit write"}),e.jsxs("span",{className:"quorum",children:["Leader: ",q?`N${q.id} (term ${q.currentTerm})`:"none"," ·  Quorum: ",r.quorum," of ",r.nodes.length," ·  sim t = ",(r.simTime/1e3).toFixed(2),"s"]}),e.jsx("span",{className:"spacer"})]}),e.jsxs("div",{className:"raft-main",children:[e.jsxs("div",{className:"raft-canvas-wrap",children:[e.jsxs("svg",{width:ya,height:va,children:[e.jsx("defs",{children:e.jsx("marker",{id:"arrowhead",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),O.map((R,D)=>{const B=O[(D+1)%O.length];return e.jsx("line",{x1:R.x,y1:R.y,x2:B.x,y2:B.y,stroke:"#1e252e",strokeWidth:"1"},`edge-${D}`)}),r.messages.map(R=>{const D=O[R.from],B=O[R.to],V=B.x-D.x,T=B.y-D.y,_=Math.sqrt(V*V+T*T)||1,b=-T/_,x=V/_,f=6,u=b*f,y=x*f,v=D.x+u+(B.x-D.x)*R.progress,I=D.y+y+(B.y-D.y)*R.progress,S=R.type.endsWith("Reply");return e.jsxs("g",{children:[e.jsx("line",{x1:D.x+u,y1:D.y+y,x2:B.x+u,y2:B.y+y,stroke:Ar[R.type]||"#666",strokeOpacity:"0.18",strokeWidth:"1",strokeDasharray:S?"3 3":void 0}),e.jsx("circle",{cx:v,cy:I,r:S?3.5:5,fill:Ar[R.type]||"#666",opacity:"0.95",children:e.jsx("title",{children:`${R.type} t=${R.term} ${R.from}->${R.to}`})})]},R.id)}),r.nodes.map(R=>{const D=O[R.id],B=R.alive?ys[R.role]:"#3a3a3a",V=R.recentlyElected>0,T=R.role==="leader"?"L":R.role==="candidate"?"C":"F";return e.jsxs("g",{onClick:()=>$(R.id),style:{cursor:"pointer"},children:[V&&e.jsx("circle",{cx:D.x,cy:D.y,r:lt+8,fill:"none",stroke:ys.leader,strokeWidth:"3",opacity:R.recentlyElected/800}),e.jsx("circle",{cx:D.x,cy:D.y,r:lt,fill:B,stroke:R.alive?"#111":"#555",strokeWidth:"2"}),e.jsxs("text",{x:D.x,y:D.y-2,textAnchor:"middle",fill:"#111",fontSize:"14",fontWeight:"700",children:["N",R.id]}),e.jsxs("text",{x:D.x,y:D.y+12,textAnchor:"middle",fill:"#111",fontSize:"10",fontWeight:"600",children:[R.alive?T:"X"," t=",R.currentTerm]}),!R.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:D.x-lt*.6,y1:D.y-lt*.6,x2:D.x+lt*.6,y2:D.y+lt*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:D.x+lt*.6,y1:D.y-lt*.6,x2:D.x-lt*.6,y2:D.y+lt*.6,stroke:"#ff6b6b",strokeWidth:"3"})]}),e.jsxs("text",{x:D.x,y:D.y+lt+14,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",children:["log=",R.log.length," cmt=",R.commitIndex]})]},R.id)})]}),e.jsxs("div",{className:"raft-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ys.leader}})," leader"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ys.candidate}})," candidate"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ys.follower}})," follower"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ar.RequestVote}})," RequestVote"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Ar.AppendEntries}})," AppendEntries"]}),e.jsx("span",{children:"click a node to kill / revive"})]})]}),e.jsx("div",{className:"raft-node-panels",children:r.nodes.map(R=>e.jsxs("div",{className:"raft-node-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:R.alive?ys[R.role]:"#888"},children:["N",R.id," ",R.alive?R.role:"CRASHED"]}),e.jsxs("span",{style:{color:"#8a95a3"},children:["T:",R.currentTerm]})]}),e.jsxs("div",{className:"meta",children:["L:",R.log.length," cmt:",R.commitIndex,R.votedFor!==null&&` votedFor:N${R.votedFor}`]}),e.jsxs("div",{className:"raft-log-row",children:[R.log.length===0&&e.jsx("span",{style:{color:"#555",fontSize:11},children:"(empty)"}),R.log.map((D,B)=>{const V=B+1<=R.commitIndex;return e.jsx("span",{className:`raft-log-entry ${V?"committed":"uncommitted"}`,title:`idx=${B+1} term=${D.term} value=${D.value}`,children:D.value},B)})]})]},R.id))})]}),e.jsx("div",{className:`raft-status ${c?"raft-error":""}`,children:l})]})}

export default jc;
export { jc as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(jc, {}));
  return () => root.unmount();
}
