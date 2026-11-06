import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Nt="#0f1419";
const Mn="#1a1f2e";
const Le="#2a2f3e";
const zt="#e6e6e6";
const Qe="#8a93a6";
const ls="#4a7cff";
const jr="#f66";
const us="#5cd894";
const id=`
.mk-root {
  color: ${zt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Nt};
}
.mk-panel {
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.mk-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Le};
}
.mk-title {
  font-size: 18px;
  font-weight: 600;
  color: ${zt};
}
.mk-subtitle {
  font-size: 12px;
  color: ${Qe};
  margin-top: 2px;
  max-width: 640px;
}
.mk-title-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.mk-label {
  color: ${Qe};
  font-size: 13px;
}
.mk-label select {
  background: ${Nt};
  border: 1px solid ${Le};
  color: ${zt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.mk-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid ${Le};
}
.mk-btn {
  padding: 6px 14px;
  background: ${ls};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.mk-btn:hover { filter: brightness(1.15); }
.mk-btn-sm { padding: 4px 10px; font-size: 12px; }
.mk-btn-good { background: ${us}; color: ${Nt}; }
.mk-btn-danger { background: ${jr}; }
.mk-btn-ghost {
  background: transparent;
  border: 1px solid ${Le};
  color: ${zt};
}
.mk-sep {
  width: 1px;
  height: 22px;
  background: ${Le};
  margin: 0 4px;
}
.mk-hint {
  margin-left: auto;
  color: ${Qe};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-replicas {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px dashed ${Le};
}
.mk-replica {
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.mk-replica-header {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.mk-replica-sub {
  color: ${Qe};
  font-size: 11px;
  font-weight: 400;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-kv-table {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 28px;
  padding: 6px 8px;
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 5px;
  max-height: 96px;
  overflow-y: auto;
}
.mk-kv-row {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  padding: 2px 6px;
  background: rgba(74, 124, 255, 0.08);
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: background 0.3s, box-shadow 0.3s;
}
.mk-kv-tomb {
  background: rgba(255, 102, 102, 0.15);
}
.mk-kv-flying {
  animation: mk-flash 0.9s ease-in-out 2;
  box-shadow: 0 0 0 2px ${us}aa, 0 0 10px ${us}77;
}
@keyframes mk-flash {
  0%, 100% { background: rgba(92, 216, 148, 0.35); }
  50% { background: rgba(92, 216, 148, 0.15); }
}
.mk-kv-k { color: ${ls}; font-weight: 700; }
.mk-kv-arrow { color: ${Qe}; }
.mk-kv-v { color: ${zt}; }
.mk-kv-x { color: ${jr}; font-weight: 800; }
.mk-kv-ts {
  color: ${Qe};
  font-size: 9px;
  margin-left: 2px;
}
.mk-empty {
  color: ${Qe};
  font-size: 11px;
  font-style: italic;
}
.mk-replica-input {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.mk-input {
  padding: 5px 8px;
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 4px;
  color: ${zt};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-input:focus {
  outline: none;
  border-color: ${ls};
}
.mk-tree-wrap {
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 6px;
  overflow: hidden;
}
.mk-svg-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${Nt};
  border: 1px dashed ${Le};
  border-radius: 6px;
}
.mk-middle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 80px;
  gap: 12px;
  min-width: 86px;
}
.mk-middle-arrow {
  font-size: 26px;
  color: ${Qe};
}
.mk-middle-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: ${Qe};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-middle-legend > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mk-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.mk-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 6px;
  font-size: 12px;
  color: ${Qe};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-stats strong { color: ${zt}; font-weight: 600; margin-right: 2px; }
.mk-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${Nt};
  border-left: 3px solid ${ls};
  border-radius: 4px;
  font-size: 12px;
  color: ${zt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${ls};
  box-shadow: 0 0 8px ${ls};
  flex-shrink: 0;
}
`,dt={INIT:"INIT",WAIT_VOTES:"WAIT_VOTES",DECIDE:"DECIDE",SEND_RESULT:"SEND_RESULT",DONE:"DONE"},Ke={INIT:"INIT",PREPARED:"PREPARED",COMMITTED:"COMMITTED",ABORTED:"ABORTED",STUCK:"STUCK"};
class ad{constructor({participantCount:t=3,messageDelayMs:s=150,prepareFailProb:r=0}={}){this.N=t,this.messageDelayMs=Math.max(1,s),this.prepareFailProb=r,this.simTime=0,this._msgId=0,this._pendingEvents=[],this._txnCounter=0,this._stuckThresholdMs=3*this.messageDelayMs+200,this.coordinator={alive:!0,state:dt.INIT,log:[],currentTxn:null,votesReceived:new Map,acksReceived:new Set,decision:null,forcedNoParticipants:new Set},this.participants=[];for(let o=0;o<this.N;o++)this.participants.push(this._freshParticipant(o));this.messages=[]}_freshParticipant(t){return{id:t,alive:!0,state:Ke.INIT,locks:[],pendingWrites:[],appliedWrites:[],lastVote:null,currentTxnId:null,waitingMs:0}}_emit(t){this._pendingEvents.push({t:this.simTime,...t})}_send(t,s,r,o={}){var i,a;t==="coord"&&!this.coordinator.alive||s==="coord"&&!this.coordinator.alive||typeof t=="number"&&!((i=this.participants[t])!=null&&i.alive)||typeof s=="number"&&!((a=this.participants[s])!=null&&a.alive)||this.messages.push({id:++this._msgId,from:t,to:s,type:r,data:o,progress:0})}tick(t){this.simTime+=t,this._pendingEvents=[];const s=[];for(const r of this.messages)r.progress+=t/this.messageDelayMs,r.progress>=1?this._deliver(r):s.push(r);this.messages=s;for(const r of this.participants)r.alive&&(r.state===Ke.PREPARED?this.coordinator.alive?r.waitingMs=0:(r.waitingMs+=t,r.waitingMs>=this._stuckThresholdMs&&(r.state=Ke.STUCK,this._emit({type:"participantStuck",participantId:r.id,txnId:r.currentTxnId}))):r.state===Ke.STUCK&&this.coordinator.alive&&(r.state=Ke.PREPARED,r.waitingMs=0));return this._pendingEvents}startTransaction(t){if(!this.coordinator.alive)return this._emit({type:"txnRejected",reason:"coordinator down"}),{ok:!1,reason:"coordinator down"};if(this.coordinator.state!==dt.INIT&&this.coordinator.state!==dt.DONE)return this._emit({type:"txnRejected",reason:"another txn in progress",state:this.coordinator.state}),{ok:!1,reason:"another txn in progress"};const s=t&&t.writes||[];if(s.length===0)return this._emit({type:"txnRejected",reason:"empty txn"}),{ok:!1,reason:"empty txn"};const r=new Set(s.map(i=>i.pid).filter(i=>i>=0&&i<this.N));if(r.size===0)return this._emit({type:"txnRejected",reason:"no valid participants"}),{ok:!1,reason:"no valid participants"};const o=++this._txnCounter;for(const i of this.participants)i.locks=[],i.pendingWrites=[],i.lastVote=null,i.currentTxnId=null,i.waitingMs=0,i.state!==Ke.INIT&&(i.state=Ke.INIT);this.coordinator.currentTxn={txnId:o,writes:s.slice(),participants:Array.from(r).sort((i,a)=>i-a)},this.coordinator.votesReceived=new Map,this.coordinator.acksReceived=new Set,this.coordinator.decision=null,this.coordinator.state=dt.WAIT_VOTES,this.coordinator.log.push({type:"BEGIN",txnId:o,participants:this.coordinator.currentTxn.participants.slice()}),this._emit({type:"txnStarted",txnId:o,participants:this.coordinator.currentTxn.participants.slice()});for(const i of this.coordinator.currentTxn.participants){const a=s.filter(l=>l.pid===i);this._send("coord",i,"PREPARE",{txnId:o,writes:a})}return this._emit({type:"prepareSent",txnId:o,to:this.coordinator.currentTxn.participants.slice()}),{ok:!0,txnId:o}}crashCoordinator(){this.coordinator.alive&&(this.coordinator.alive=!1,this.messages=this.messages.filter(t=>t.from!=="coord"&&t.to!=="coord"),this._emit({type:"coordinatorCrashed",state:this.coordinator.state,txnId:this.coordinator.currentTxn?this.coordinator.currentTxn.txnId:null}))}reviveCoordinator(){this.coordinator.alive||(this.coordinator.alive=!0,this._emit({type:"coordinatorRevived",logLen:this.coordinator.log.length}),this._recoverFromLog())}crashParticipant(t){const s=this.participants[t];!s||!s.alive||(s.alive=!1,this.messages=this.messages.filter(r=>r.from!==t&&r.to!==t),this._emit({type:"participantCrashed",participantId:t,state:s.state}))}reviveParticipant(t){const s=this.participants[t];!s||s.alive||(s.alive=!0,s.waitingMs=0,this._emit({type:"participantRevived",participantId:t,state:s.state}),this.coordinator.alive&&s.state===Ke.PREPARED&&this.coordinator.decision&&this._send("coord",t,this.coordinator.decision,{txnId:this.coordinator.currentTxn.txnId}))}forceNoVote(t,s=!0){s?this.coordinator.forcedNoParticipants.add(t):this.coordinator.forcedNoParticipants.delete(t)}snapshot(){return{simTime:this.simTime,coordinator:{alive:this.coordinator.alive,state:this.coordinator.state,log:this.coordinator.log.map(t=>({...t})),decision:this.coordinator.decision,currentTxn:this.coordinator.currentTxn?{txnId:this.coordinator.currentTxn.txnId,participants:this.coordinator.currentTxn.participants.slice(),writes:this.coordinator.currentTxn.writes.slice()}:null,votes:Object.fromEntries(this.coordinator.votesReceived),acks:Array.from(this.coordinator.acksReceived),forcedNoParticipants:Array.from(this.coordinator.forcedNoParticipants)},participants:this.participants.map(t=>({id:t.id,alive:t.alive,state:t.state,locks:t.locks.slice(),lastVote:t.lastVote,currentTxnId:t.currentTxnId,pendingWrites:t.pendingWrites.slice(),appliedWrites:t.appliedWrites.slice()})),messages:this.messages.map(t=>({id:t.id,from:t.from,to:t.to,type:t.type,progress:t.progress,data:t.data})),currentTxn:this.coordinator.currentTxn?{txnId:this.coordinator.currentTxn.txnId,participants:this.coordinator.currentTxn.participants.slice(),writes:this.coordinator.currentTxn.writes.slice()}:null}}_deliver(t){if(t.to==="coord")return this.coordinator.alive?this._coordReceive(t):void 0;if(typeof t.to=="number"){const s=this.participants[t.to];return!s||!s.alive?void 0:this._participantReceive(s,t)}}_participantReceive(t,s){switch(s.type){case"PREPARE":return this._onPrepare(t,s);case"COMMIT":return this._onCommit(t,s);case"ABORT":return this._onAbort(t,s);default:return}}_coordReceive(t){switch(t.type){case"YES":case"NO":return this._onVote(t);case"ACK":return this._onAck(t);default:return}}_onPrepare(t,s){const{txnId:r,writes:o}=s.data;let i="YES";(this.coordinator.forcedNoParticipants.has(t.id)||this.prepareFailProb>0&&Math.random()<this.prepareFailProb)&&(i="NO"),t.currentTxnId=r,t.lastVote=i,i==="YES"?(t.pendingWrites=o.slice(),t.locks=o.map(a=>a.key),t.state=Ke.PREPARED,this._emit({type:"participantPrepared",participantId:t.id,txnId:r,locks:t.locks.slice()})):(t.pendingWrites=[],t.locks=[],t.state=Ke.ABORTED,this._emit({type:"participantVotedNo",participantId:t.id,txnId:r})),this._send(t.id,"coord",i,{txnId:r,participantId:t.id})}_onCommit(t,s){if(t.state===Ke.COMMITTED){this._send(t.id,"coord","ACK",{txnId:s.data.txnId,participantId:t.id});return}for(const r of t.pendingWrites)t.appliedWrites.push({...r});t.pendingWrites=[],t.locks=[],t.state=Ke.COMMITTED,this._emit({type:"participantCommitted",participantId:t.id,txnId:s.data.txnId}),this._send(t.id,"coord","ACK",{txnId:s.data.txnId,participantId:t.id})}_onAbort(t,s){if(t.state===Ke.ABORTED){this._send(t.id,"coord","ACK",{txnId:s.data.txnId,participantId:t.id});return}t.pendingWrites=[],t.locks=[],t.state=Ke.ABORTED,this._emit({type:"participantAborted",participantId:t.id,txnId:s.data.txnId}),this._send(t.id,"coord","ACK",{txnId:s.data.txnId,participantId:t.id})}_onVote(t){const s=this.coordinator;if(!s.currentTxn||t.data.txnId!==s.currentTxn.txnId||s.state!==dt.WAIT_VOTES)return;s.votesReceived.set(t.data.participantId,t.type),this._emit({type:"coordinatorRxVote",participantId:t.data.participantId,vote:t.type,txnId:s.currentTxn.txnId});const r=s.currentTxn.participants;if(!r.every(l=>s.votesReceived.has(l)))return;s.state=dt.DECIDE;const a=r.some(l=>s.votesReceived.get(l)==="NO")?"ABORT":"COMMIT";s.decision=a,s.log.push({type:a,txnId:s.currentTxn.txnId,votes:Object.fromEntries(s.votesReceived)}),this._emit({type:"coordinatorDecided",decision:a,txnId:s.currentTxn.txnId,votes:Object.fromEntries(s.votesReceived)}),s.state=dt.SEND_RESULT;for(const l of r)a==="COMMIT"?this._send("coord",l,"COMMIT",{txnId:s.currentTxn.txnId}):this._send("coord",l,"ABORT",{txnId:s.currentTxn.txnId})}_onAck(t){const s=this.coordinator;s.currentTxn&&t.data.txnId===s.currentTxn.txnId&&(s.acksReceived.add(t.data.participantId),s.acksReceived.size>=s.currentTxn.participants.length&&(s.state=dt.DONE,s.log.push({type:"END",txnId:s.currentTxn.txnId,decision:s.decision}),this._emit({type:"txnComplete",txnId:s.currentTxn.txnId,decision:s.decision})))}_recoverFromLog(){const t=this.coordinator;if(!t.currentTxn)return;const s=t.currentTxn.txnId;let r=null,o=new Set;for(const i of t.log)i.type==="COMMIT"&&i.txnId===s&&(r="COMMIT"),i.type==="ABORT"&&i.txnId===s&&(r="ABORT"),i.type==="END"&&o.add(i.txnId);if(o.has(s)){t.state=dt.DONE,this._emit({type:"coordinatorRecovered",action:"none",txnId:s});return}if(r){t.decision=r,t.state=dt.SEND_RESULT;for(const i of t.currentTxn.participants)t.acksReceived.has(i)||this._send("coord",i,r,{txnId:s});this._emit({type:"coordinatorRecovered",action:"resend-decision",decision:r,txnId:s});return}t.decision="ABORT",t.log.push({type:"ABORT",txnId:s,votes:{},reason:"recovery"}),t.state=dt.SEND_RESULT;for(const i of t.currentTxn.participants)t.acksReceived.has(i)||this._send("coord",i,"ABORT",{txnId:s});this._emit({type:"coordinatorRecovered",action:"abort-on-recovery",decision:"ABORT",txnId:s})}}
const Eo=560,ld=440,Ta=Eo/2,cd=80,dd=300,ae=34,Bs={INIT:"#4a8fd8",WAIT_VOTES:"#f5c542",DECIDE:"#a15cff",SEND_RESULT:"#a15cff",DONE:"#3a9c6a",PREPARED:"#f5c542",COMMITTED:"#3a9c6a",ABORTED:"#d9534f",STUCK:"#d94a6a"},ns={PREPARE:"#f5c542",YES:"#4a8fd8",NO:"#d9534f",COMMIT:"#3a9c6a",ABORT:"#d9534f",ACK:"#8aa0b5"};
function pd(n){const t=[],s=Math.min(Eo-120,120*n),r=Ta-s/2,o=s/(n-1);for(let i=0;i<n;i++)t.push({x:r+i*o,y:dd});return t}
function hd(n,t){const s=t.x-n.x,r=t.y-n.y,o=Math.sqrt(s*s+r*r)||1;return{fx:n.x+s*ae/o,fy:n.y+r*ae/o,tx:t.x-s*ae/o,ty:t.y-r*ae/o}}
function ud(n){const t=s=>`p${s}`;switch(n.type){case"txnStarted":return`Phase 1: coordinator sent PREPARE to ${n.participants.map(t).join(", ")}`;case"prepareSent":return`PREPARE in flight to ${n.to.map(t).join(", ")}`;case"participantPrepared":return`${t(n.participantId)} voted YES (locks: ${n.locks.join(", ")||"-"}), held in PREPARED`;case"participantVotedNo":return`${t(n.participantId)} voted NO — will force ABORT`;case"coordinatorRxVote":return`coordinator received ${n.vote} from ${t(n.participantId)}`;case"coordinatorDecided":return`${Object.entries(n.votes).map(([r,o])=>`${t(r)} ${o}`).join(", ")} -> coordinator logs ${n.decision}`;case"participantCommitted":return`${t(n.participantId)} applied writes + released locks (COMMITTED)`;case"participantAborted":return`${t(n.participantId)} released locks (ABORTED)`;case"participantStuck":return`${t(n.participantId)} STUCK: coordinator unreachable, holding locks, cannot decide alone`;case"coordinatorCrashed":return`coordinator crashed in state ${n.state}; PREPARED participants are blocked holding locks`;case"coordinatorRevived":return`coordinator revived; reading log (${n.logLen} entries)`;case"coordinatorRecovered":return n.action==="resend-decision"?`coordinator revived; read log -> decision was ${n.decision}; re-sent ${n.decision} to all`:n.action==="abort-on-recovery"?"coordinator revived; no decision logged -> conservative ABORT sent to all":"coordinator revived; txn already complete";case"participantCrashed":return`${t(n.participantId)} crashed (was ${n.state})`;case"participantRevived":return`${t(n.participantId)} revived (state ${n.state})`;case"txnComplete":return`txn ${n.txnId} complete: ${n.decision}`;case"txnRejected":return`txn rejected: ${n.reason}`;default:return JSON.stringify(n)}}
const bi=`
.twopc-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 960px;
}
.twopc-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.twopc-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.twopc-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.twopc-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.twopc-toolbar button:hover { background: #232a33; }
.twopc-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.twopc-toolbar button.primary:hover { background: #3467b0; }
.twopc-toolbar button.danger {
  background: #6b2a2a;
  border-color: #8b3a3a;
}
.twopc-toolbar button.danger:hover { background: #7f3333; }
.twopc-toolbar button.active {
  background: #3a4250;
  border-color: #5a6878;
}
.twopc-toolbar .spacer { flex: 1; }
.twopc-toolbar .group {
  display: flex;
  gap: 4px;
  padding: 2px 6px;
  border-left: 1px solid #2a3038;
  border-right: 1px solid #2a3038;
  align-items: center;
}
.twopc-toolbar .group-label {
  font-size: 11px;
  color: #8a95a3;
  margin-right: 4px;
}

.twopc-txn-input {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.twopc-txn-input label {
  font-size: 12px;
  color: #8a95a3;
  margin-right: 4px;
}
.twopc-txn-row {
  display: flex;
  gap: 4px;
  align-items: center;
}
.twopc-txn-row select,
.twopc-txn-row input {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 12px;
}
.twopc-txn-row input { width: 70px; }
.twopc-txn-row .eq { color: #8a95a3; }
.twopc-txn-row .plus,
.twopc-txn-row .minus {
  background: #1a1f26;
  color: #8a95a3;
  border: 1px solid #2a3038;
  border-radius: 3px;
  width: 22px;
  height: 22px;
  line-height: 20px;
  text-align: center;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}

.twopc-main {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 12px;
}
.twopc-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.twopc-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.twopc-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
}
.twopc-card.coord { border-color: #4a5a70; }
.twopc-card .hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-weight: 600;
}
.twopc-card .meta {
  color: #8a95a3;
  font-size: 11px;
  margin-bottom: 4px;
}
.twopc-card .row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 2px 0;
}
.twopc-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  background: #2a3038;
  color: #cfd6e0;
}
.twopc-tag.lock { background: #5a4a1a; color: #f5c542; }
.twopc-tag.write { background: #1f3a5a; color: #b6d4f0; }
.twopc-tag.applied { background: #1f5c3a; color: #b6f0c4; }
.twopc-tag.yes { background: #1f4a6b; color: #b6d4f0; }
.twopc-tag.no { background: #6b2a2a; color: #f0b6b6; }

.twopc-log {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 3px;
  padding: 4px 6px;
  margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  max-height: 110px;
  overflow: auto;
}
.twopc-log .entry {
  padding: 1px 2px;
  color: #cfd6e0;
}
.twopc-log .entry.BEGIN { color: #8a95a3; }
.twopc-log .entry.COMMIT { color: #6be0a2; }
.twopc-log .entry.ABORT { color: #ff8a8a; }
.twopc-log .entry.END { color: #a1a1a1; }

.twopc-status {
  margin-top: 10px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 22px;
  color: #cfd6e0;
}
.twopc-status.error { color: #ff8a8a; }
.twopc-status.warn  { color: #f5c542; }
.twopc-status.good  { color: #6be0a2; }

.twopc-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.twopc-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.twopc-widget svg text { user-select: none; }
`,md=()=>({pid:0,key:"x",value:"1"});
function fd(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState(!0),[l,d]=h.useState("idle"),[c,p]=h.useState(""),[m,g]=h.useState([{pid:0,key:"x",value:"10"},{pid:1,key:"y",value:"20"},{pid:2,key:"z",value:"30"}]),[w,C]=h.useState(new Set);h.useEffect(()=>{n.current=new ad({participantCount:3,messageDelayMs:300});for(const u of w)n.current.forceNoVote(u,!0);o(n.current.snapshot()),d("System initialized. Configure writes and press Start."),p("")},[t]);const j=h.useMemo(()=>({txnRejected:10,coordinatorCrashed:10,participantStuck:10,coordinatorRecovered:10,coordinatorDecided:9,txnComplete:9,txnStarted:8,participantCommitted:7,participantAborted:7,participantPrepared:6,participantVotedNo:6,coordinatorRxVote:5,coordinatorRevived:5,participantCrashed:5,participantRevived:5,prepareSent:4}),[]),$=u=>{switch(u.type){case"coordinatorCrashed":case"participantStuck":case"txnRejected":case"participantCrashed":return"error";case"participantAborted":case"participantVotedNo":return"warn";case"txnComplete":return u.decision==="COMMIT"?"good":"warn";case"coordinatorDecided":return u.decision==="COMMIT"?"good":"warn";case"participantCommitted":return"good";default:return""}},O=h.useCallback(()=>{const u=n.current;if(!u)return;const y=u.tick(60);if(o(u.snapshot()),y.length>0){let v=y[0];for(const I of y)(j[I.type]??0)>=(j[v.type]??0)&&(v=I);d(ud(v)),p($(v))}},[j]);h.useEffect(()=>{if(!i)return;const u=setInterval(O,100);return()=>clearInterval(u)},[i,O]);const q=h.useCallback(()=>{const u=n.current;if(!u)return;const y=m.filter(I=>I.key&&String(I.value).length>0).map(I=>({pid:Number(I.pid),key:I.key,value:I.value}));if(y.length===0){d("txn rejected: no writes configured"),p("error");return}const v=u.startTransaction({writes:y});o(u.snapshot()),v.ok?(d(`txn ${v.txnId} started: PREPARE sent to ${[...new Set(y.map(I=>"p"+I.pid))].join(", ")}`),p("")):(d(`txn rejected: ${v.reason}`),p("error"))},[m]),R=()=>{var u;(u=n.current)==null||u.crashCoordinator(),o(n.current.snapshot()),d("coordinator crashed"),p("error")},D=()=>{var u;(u=n.current)==null||u.reviveCoordinator(),o(n.current.snapshot())},B=u=>{var y;(y=n.current)==null||y.crashParticipant(u),o(n.current.snapshot())},V=u=>{var y;(y=n.current)==null||y.reviveParticipant(u),o(n.current.snapshot())},T=u=>{const y=n.current;y&&(C(v=>{const I=new Set(v);return I.has(u)?(I.delete(u),y.forceNoVote(u,!1)):(I.add(u),y.forceNoVote(u,!0)),I}),o(y.snapshot()))},_=h.useMemo(()=>pd(3),[]),b=h.useMemo(()=>({x:Ta,y:cd}),[]);if(!r)return e.jsxs("div",{className:"twopc-widget",children:[e.jsx("style",{children:bi}),e.jsx("h2",{children:"Two-Phase Commit Visualizer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const x=r.coordinator,f=r.participants;return e.jsxs("div",{className:"twopc-widget",children:[e.jsx("style",{children:bi}),e.jsxs("h2",{children:[e.jsx("span",{children:"Two-Phase Commit Visualizer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{className:i?"active":"",onClick:()=>a(u=>!u),children:i?"Pause":"Auto-tick"}),e.jsx("button",{onClick:O,disabled:i,children:"Step"}),e.jsx("button",{onClick:()=>s(u=>u+1),children:"Reset"})]})]}),e.jsxs("p",{className:"sub",children:["Chapter 13, Petrov: “Database Internals”. 1 coordinator, ",f.length," participants. 2PC is a ",e.jsx("em",{children:"blocking"})," atomic-commitment protocol: a coordinator crash between phases strands PREPARED participants with locks held."]}),e.jsxs("div",{className:"twopc-txn-input",children:[e.jsx("label",{children:"Transaction:"}),m.map((u,y)=>e.jsxs("div",{className:"twopc-txn-row",children:[e.jsx("select",{value:u.pid,onChange:v=>{const I=Number(v.target.value);g(S=>S.map((H,M)=>M===y?{...H,pid:I}:H))},children:f.map(v=>e.jsxs("option",{value:v.id,children:["p",v.id]},v.id))}),e.jsx("span",{className:"eq",children:":"}),e.jsx("input",{type:"text",value:u.key,onChange:v=>{const I=v.target.value;g(S=>S.map((H,M)=>M===y?{...H,key:I}:H))},placeholder:"key"}),e.jsx("span",{className:"eq",children:"="}),e.jsx("input",{type:"text",value:u.value,onChange:v=>{const I=v.target.value;g(S=>S.map((H,M)=>M===y?{...H,value:I}:H))},placeholder:"value"}),e.jsx("button",{className:"minus",title:"remove",onClick:()=>g(v=>v.filter((I,S)=>S!==y)),children:"-"})]},y)),e.jsx("button",{className:"plus",title:"add write",onClick:()=>g(u=>[...u,md()]),children:"+"}),e.jsx("span",{className:"spacer"}),e.jsx("button",{className:"primary",onClick:q,children:"Start"})]}),e.jsxs("div",{className:"twopc-toolbar",children:[e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Coordinator:"}),e.jsx("button",{className:x.alive?"danger":"",onClick:x.alive?R:D,children:x.alive?"Crash":"Revive"})]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Participants:"}),f.map(u=>e.jsx("button",{className:u.alive?"":"danger",onClick:()=>u.alive?B(u.id):V(u.id),title:u.alive?`crash p${u.id}`:`revive p${u.id}`,children:u.alive?`Crash p${u.id}`:`Revive p${u.id}`},u.id))]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Force NO:"}),f.map(u=>e.jsxs("button",{className:w.has(u.id)?"active":"",onClick:()=>T(u.id),title:"force this participant to vote NO on next PREPARE",children:["p",u.id]},u.id))]}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:11,color:"#8a95a3"},children:["sim t = ",(r.simTime/1e3).toFixed(2),"s"]})]}),e.jsxs("div",{className:"twopc-main",children:[e.jsxs("div",{className:"twopc-canvas-wrap",children:[e.jsxs("svg",{width:Eo,height:ld,children:[_.map((u,y)=>{const{fx:v,fy:I,tx:S,ty:H}=hd(b,u);return e.jsx("line",{x1:v,y1:I,x2:S,y2:H,stroke:"#1e252e",strokeWidth:"1.5"},`edge-${y}`)}),r.messages.map(u=>{const y=u.from==="coord"?b:_[u.from],v=u.to==="coord"?b:_[u.to],I=y.x+(v.x-y.x)*u.progress,S=y.y+(v.y-y.y)*u.progress,H=ns[u.type]||"#888";return e.jsxs("g",{children:[e.jsx("circle",{cx:I,cy:S,r:9,fill:H,opacity:"0.95",children:e.jsx("title",{children:`${u.type} ${u.from}->${u.to}`})}),e.jsx("text",{x:I,y:S+3,textAnchor:"middle",fill:"#0a0e13",fontSize:"9",fontWeight:"700",children:u.type.length>4?u.type.slice(0,4):u.type})]},u.id)}),e.jsxs("g",{children:[e.jsx("circle",{cx:b.x,cy:b.y,r:ae,fill:x.alive?Bs[x.state]||"#4a8fd8":"#3a3a3a",stroke:x.alive?"#111":"#555",strokeWidth:"2"}),e.jsx("text",{x:b.x,y:b.y-2,textAnchor:"middle",fill:"#111",fontSize:"11",fontWeight:"700",children:"COORD"}),e.jsx("text",{x:b.x,y:b.y+12,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"600",children:x.alive?x.state:"CRASHED"}),!x.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:b.x-ae*.6,y1:b.y-ae*.6,x2:b.x+ae*.6,y2:b.y+ae*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:b.x+ae*.6,y1:b.y-ae*.6,x2:b.x-ae*.6,y2:b.y+ae*.6,stroke:"#ff6b6b",strokeWidth:"3"})]}),x.decision&&x.alive&&e.jsx("text",{x:b.x,y:b.y-ae-6,textAnchor:"middle",fill:x.decision==="COMMIT"?"#6be0a2":"#ff8a8a",fontSize:"11",fontWeight:"700",children:x.decision})]}),f.map(u=>{const y=_[u.id],v=u.alive?Bs[u.state]||"#4a8fd8":"#3a3a3a",I=u.state==="STUCK";return e.jsxs("g",{children:[I&&e.jsx("circle",{cx:y.x,cy:y.y,r:ae+6,fill:"none",stroke:Bs.STUCK,strokeWidth:"2",strokeDasharray:"4 3"}),e.jsx("circle",{cx:y.x,cy:y.y,r:ae,fill:v,stroke:u.alive?"#111":"#555",strokeWidth:"2"}),e.jsxs("text",{x:y.x,y:y.y-2,textAnchor:"middle",fill:"#111",fontSize:"12",fontWeight:"700",children:["p",u.id]}),e.jsx("text",{x:y.x,y:y.y+12,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"600",children:u.alive?u.state:"CRASHED"}),!u.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:y.x-ae*.6,y1:y.y-ae*.6,x2:y.x+ae*.6,y2:y.y+ae*.6,stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:y.x+ae*.6,y1:y.y-ae*.6,x2:y.x-ae*.6,y2:y.y+ae*.6,stroke:"#ff6b6b",strokeWidth:"3"})]}),u.locks.length>0&&e.jsxs("text",{x:y.x,y:y.y+ae+14,textAnchor:"middle",fill:"#f5c542",fontSize:"10",fontWeight:"600",children:["locks: ",u.locks.join(",")]}),I&&e.jsx("text",{x:y.x,y:y.y+ae+28,textAnchor:"middle",fill:"#ff8a8a",fontSize:"10",fontWeight:"700",children:"BLOCKED"}),w.has(u.id)&&e.jsx("text",{x:y.x,y:y.y-ae-6,textAnchor:"middle",fill:"#d9534f",fontSize:"10",fontWeight:"700",children:"forced NO"})]},u.id)})]}),e.jsxs("div",{className:"twopc-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.PREPARE}})," PREPARE"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.YES}})," YES"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.NO}})," NO"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.COMMIT}})," COMMIT"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.ABORT}})," ABORT"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ns.ACK}})," ACK"]})]})]}),e.jsxs("div",{className:"twopc-side",children:[e.jsxs("div",{className:"twopc-card coord",children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:x.alive?Bs[x.state]:"#888"},children:["Coordinator ",x.alive?"":"(crashed)"]}),e.jsx("span",{style:{color:"#8a95a3"},children:x.state})]}),e.jsxs("div",{className:"meta",children:[x.currentTxn?`txn #${x.currentTxn.txnId}, involves p${x.currentTxn.participants.join(", p")}`:"no active txn",x.decision&&e.jsxs(e.Fragment,{children:[" · decision: ",e.jsx("b",{children:x.decision})]})]}),e.jsx("div",{style:{fontSize:11,color:"#8a95a3"},children:"WAL:"}),e.jsxs("div",{className:"twopc-log",children:[x.log.length===0&&e.jsx("span",{style:{color:"#555"},children:"(empty)"}),x.log.map((u,y)=>{let v;if(u.type==="BEGIN")v=`BEGIN txn=${u.txnId} parts=[${u.participants.join(",")}]`;else if(u.type==="COMMIT"||u.type==="ABORT"){const I=Object.entries(u.votes||{}).map(([S,H])=>`p${S}=${H}`).join(",");v=`${u.type} txn=${u.txnId}${I?` {${I}}`:""}`}else u.type==="END"?v=`END txn=${u.txnId} ${u.decision}`:v=JSON.stringify(u);return e.jsxs("div",{className:`entry ${u.type}`,children:[y+1,". ",v]},y)})]})]}),f.map(u=>e.jsxs("div",{className:"twopc-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsxs("span",{style:{color:u.alive?Bs[u.state]:"#888"},children:["p",u.id," ",u.alive?"":"(crashed)"]}),e.jsx("span",{style:{color:"#8a95a3"},children:u.state})]}),e.jsxs("div",{className:"meta",children:[u.lastVote?e.jsxs(e.Fragment,{children:["vote: ",e.jsx("span",{className:`twopc-tag ${u.lastVote==="YES"?"yes":"no"}`,children:u.lastVote})]}):"no vote yet",u.currentTxnId&&e.jsxs(e.Fragment,{children:[" · txn #",u.currentTxnId]})]}),u.locks.length>0&&e.jsxs("div",{className:"row",children:[e.jsx("span",{style:{fontSize:11,color:"#8a95a3"},children:"locks:"}),u.locks.map(y=>e.jsx("span",{className:"twopc-tag lock",children:y},y))]}),u.pendingWrites.length>0&&e.jsxs("div",{className:"row",children:[e.jsx("span",{style:{fontSize:11,color:"#8a95a3"},children:"staged:"}),u.pendingWrites.map((y,v)=>e.jsxs("span",{className:"twopc-tag write",children:[y.key,"=",y.value]},v))]}),u.appliedWrites.length>0&&e.jsxs("div",{className:"row",children:[e.jsx("span",{style:{fontSize:11,color:"#8a95a3"},children:"applied:"}),u.appliedWrites.map((y,v)=>e.jsxs("span",{className:"twopc-tag applied",children:[y.key,"=",y.value]},v))]}),u.state==="STUCK"&&e.jsx("div",{style:{color:"#ff8a8a",fontSize:11,marginTop:4},children:"holding locks, blocked — cannot decide without coordinator"})]},u.id))]})]}),e.jsx("div",{className:`twopc-status ${c}`,children:l})]})}

export default fd;
export { fd as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(fd, {}));
  return () => root.unmount();
}
