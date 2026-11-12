import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Qn={flightMs:450,ackTimeoutMs:300,retryLimit:5};
class Ch{constructor({mode:t="queue",deliverySemantic:s="at-least-once",flightMs:r=Qn.flightMs,ackTimeoutMs:o=Qn.ackTimeoutMs,retryLimit:i=Qn.retryLimit}={}){this.mode=t,this.semantic=s,this.flightMs=r,this.ackTimeoutMs=o,this.retryLimit=i,this.simTime=0,this.consumers=[],this.messages=[],this.deliveries=[],this._deliveryIdCounter=0,this._rrCursor=new Map,this._log=[],this._logMax=40,this.stats={published:0,delivered:0,acked:0,lost:0,duplicates:0,redeliveries:0,totalLatencyMs:0,firstPublishAt:null,lastPublishAt:null}}setMode(t){t!==this.mode&&(this.mode=t,this._pushEvent({type:"modeChange",mode:t}))}setSemantic(t){t!==this.semantic&&(this.semantic=t,this._pushEvent({type:"semanticChange",semantic:t}))}addConsumer(t,s=null){return this.consumers.find(r=>r.id===t)?!1:(this.consumers.push({id:t,groupId:s||null,alive:!0,deliveredIds:new Set}),this._pushEvent({type:"consumerAdded",consumerId:t,groupId:s}),!0)}removeConsumer(t){const s=this.consumers.findIndex(r=>r.id===t);if(s<0)return!1;this.consumers.splice(s,1);for(const r of this.deliveries)r.consumerId===t&&r.status!=="acked"&&r.status!=="lost"&&(r.status="lost",r.lostAt=this.simTime);return this._pushEvent({type:"consumerRemoved",consumerId:t}),!0}killConsumer(t){const s=this.consumers.find(r=>r.id===t);if(!s)return!1;s.alive=!1;for(const r of this.deliveries)r.consumerId===t&&(r.status==="pending"||r.status==="delivered")&&(r.status="lost",r.lostAt=this.simTime);return this._pushEvent({type:"consumerKilled",consumerId:t}),!0}reviveConsumer(t){const s=this.consumers.find(r=>r.id===t);return s?(s.alive=!0,this._pushEvent({type:"consumerRevived",consumerId:t}),!0):!1}setConsumerGroup(t,s){const r=this.consumers.find(o=>o.id===t);return r?(r.groupId=s||null,this._pushEvent({type:"consumerGroupChanged",consumerId:t,groupId:s}),!0):!1}publish(t,s,r=null){const o={id:t,payload:s,partitionKey:r??null,producedAt:this.simTime,deliveredTo:[]};this.messages.push(o),this.stats.published+=1,this.stats.firstPublishAt===null&&(this.stats.firstPublishAt=this.simTime),this.stats.lastPublishAt=this.simTime;const i=this._pickTargets(o);if(i.length===0)return this._pushEvent({type:"publishNoConsumers",messageId:t}),{ok:!1,reason:"no consumers"};for(const a of i)this._createDelivery(o,a,!1);return this._pushEvent({type:"publish",messageId:t,mode:this.mode,targets:[...i]}),{ok:!0,targets:[...i]}}_pickTargets(t){const s=this.consumers.filter(r=>r.alive);if(s.length===0)return[];if(this.mode==="pubsub")return s.map(r=>r.id);if(this.mode==="queue"){const r=this._rr("_queue",s.length);return[s[r].id]}if(this.mode==="kafka"){const r=new Map;for(const i of s){const a=i.groupId||`_solo_${i.id}`;r.has(a)||r.set(a,[]),r.get(a).push(i)}const o=[];for(const[i,a]of r){const l=this._rr(i,a.length);o.push(a[l].id)}return o}return[]}_rr(t,s){const o=((this._rrCursor.get(t)??-1)+1)%s;return this._rrCursor.set(t,o),o}_createDelivery(t,s,r){const o={deliveryId:`d${++this._deliveryIdCounter}`,messageId:t.id,consumerId:s,status:"pending",createdAt:this.simTime,arriveAt:this.simTime+this.flightMs,ackDeadline:null,deliveredAt:null,ackedAt:null,attempts:r?1:0,isRetry:r,payload:t.payload,partitionKey:t.partitionKey};return this.deliveries.push(o),t.deliveredTo.push({consumerId:s,status:"pending",deliveryId:o.deliveryId}),r&&(this.stats.redeliveries+=1,this._pushEvent({type:"redelivery",messageId:t.id,consumerId:s,attempt:o.attempts})),o}ackMessage(t,s){const r=this.deliveries.find(a=>a.consumerId===t&&a.messageId===s&&a.status==="delivered");if(!r)return!1;r.status="acked",r.ackedAt=this.simTime,this.stats.acked+=1;const o=r.ackedAt-this.deliveries.find(a=>a.deliveryId===r.deliveryId).createdAt;this.stats.totalLatencyMs+=Math.max(0,o);const i=this.messages.find(a=>a.id===s);if(i){const a=i.deliveredTo.find(l=>l.deliveryId===r.deliveryId);a&&(a.status="acked")}return this._pushEvent({type:"ack",messageId:s,consumerId:t,latencyMs:o}),!0}tick(t=50){this.simTime+=t;for(const r of this.deliveries)if(r.status==="pending"&&this.simTime>=r.arriveAt){const o=this.consumers.find(a=>a.id===r.consumerId);if(!o||!o.alive){r.status="lost",r.lostAt=this.simTime,this._pushEvent({type:"deliveryLost",messageId:r.messageId,consumerId:r.consumerId,reason:o?"consumer dead":"consumer removed"});continue}if(this.semantic==="exactly-once"&&o.deliveredIds.has(r.messageId)){r.status="acked",r.ackedAt=this.simTime,r.deliveredAt=this.simTime,this._pushEvent({type:"deduped",messageId:r.messageId,consumerId:r.consumerId});const a=this.messages.find(l=>l.id===r.messageId);if(a){const l=a.deliveredTo.find(d=>d.deliveryId===r.deliveryId);l&&(l.status="acked")}continue}r.status="delivered",r.deliveredAt=this.simTime,this.semantic==="exactly-once"&&o.deliveredIds.add(r.messageId),this.semantic!=="exactly-once"&&this.deliveries.filter(l=>l!==r&&l.consumerId===r.consumerId&&l.messageId===r.messageId&&(l.status==="delivered"||l.status==="acked")).length>0&&(this.stats.duplicates+=1),this.stats.delivered+=1;const i=this.messages.find(a=>a.id===r.messageId);if(i){const a=i.deliveredTo.find(l=>l.deliveryId===r.deliveryId);a&&(a.status="delivered")}if(this._pushEvent({type:"delivered",messageId:r.messageId,consumerId:r.consumerId,attempt:r.attempts+1}),this.semantic==="at-most-once"){r.status="acked",r.ackedAt=this.simTime,this.stats.acked+=1;const a=r.ackedAt-r.createdAt;if(this.stats.totalLatencyMs+=Math.max(0,a),i){const l=i.deliveredTo.find(d=>d.deliveryId===r.deliveryId);l&&(l.status="acked")}this._pushEvent({type:"ack",messageId:r.messageId,consumerId:r.consumerId,latencyMs:a,implicit:!0})}else r.ackDeadline=this.simTime+this.ackTimeoutMs,r._autoAckAt=this.simTime+120}for(const r of this.deliveries)if(r.status==="delivered"&&r._autoAckAt&&this.simTime>=r._autoAckAt){const o=this.consumers.find(i=>i.id===r.consumerId);if(!o||!o.alive)continue;this.ackMessage(r.consumerId,r.messageId)}if(this.semantic!=="at-most-once")for(const r of this.deliveries){if(r._retried||!(r.status==="delivered"&&r.ackDeadline!==null&&this.simTime>=r.ackDeadline||r.status==="lost"&&r.lostAt!==void 0))continue;if(r._retried=!0,r.attempts+1>this.retryLimit){this._pushEvent({type:"retryExhausted",messageId:r.messageId,consumerId:r.consumerId});continue}const i=this.messages.find(d=>d.id===r.messageId);if(!i)continue;const a=this._pickRedeliveryTarget(r);if(!a){this._pushEvent({type:"retryNoTarget",messageId:r.messageId,consumerId:r.consumerId});continue}const l=this._createDelivery(i,a,!0);l.attempts=r.attempts+1}const s=2e3;return this.deliveries=this.deliveries.filter(r=>!(r.status==="acked"&&r.ackedAt!==null&&this.simTime-r.ackedAt>s||r.status==="lost"&&r.lostAt!==void 0&&this.simTime-r.lostAt>s)),[...this._log]}_pickRedeliveryTarget(t){const s=this.consumers.filter(r=>r.alive);if(s.length===0)return null;if(this.mode==="queue"){const r=s.filter(a=>a.id!==t.consumerId),o=r.length>0?r:s,i=this._rr("_queue_retry",o.length);return o[i].id}if(this.mode==="pubsub"){const r=s.find(o=>o.id===t.consumerId);return r?r.id:null}if(this.mode==="kafka"){const r=this.consumers.find(a=>a.id===t.consumerId),o=r?r.groupId:null,i=s.filter(a=>(a.groupId||null)===o);if(i.length>0){const a=i.filter(c=>c.id!==t.consumerId),l=a.length>0?a:i,d=this._rr(`${o||"_null"}_retry`,l.length);return l[d].id}return null}return null}_pushEvent(t){const s={...t,t:this.simTime};this._log.push(s),this._log.length>this._logMax&&this._log.shift()}snapshot(){const t=this.simTime/1e3,s=this.stats.firstPublishAt!==null?(this.simTime-this.stats.firstPublishAt)/1e3:0,r=s>0?this.stats.published/s:0,o=this.stats.acked>0?this.stats.totalLatencyMs/this.stats.acked:0;return{mode:this.mode,semantic:this.semantic,simTime:this.simTime,consumers:this.consumers.map(i=>({id:i.id,groupId:i.groupId,alive:i.alive,delivered:i.deliveredIds.size})),messages:this.messages.map(i=>({id:i.id,payload:i.payload,partitionKey:i.partitionKey,producedAt:i.producedAt,deliveredTo:[...i.deliveredTo]})),deliveries:this.deliveries.map(i=>{let a;return i.status==="pending"?a=Bi((this.simTime-i.createdAt)/this.flightMs,0,1):i.status==="delivered"||i.status==="acked"?a=1:a=Bi((this.simTime-i.createdAt)/this.flightMs,0,1),{deliveryId:i.deliveryId,messageId:i.messageId,consumerId:i.consumerId,status:i.status,attempts:i.attempts,isRetry:i.isRetry,progress:a}}),events:[...this._log],stats:{published:this.stats.published,delivered:this.stats.delivered,acked:this.stats.acked,lost:this.stats.lost,duplicates:this.stats.duplicates,redeliveries:this.stats.redeliveries,avgLatencyMs:o,msgPerSec:r,elapsedSec:t}}}}
function Bi(n,t,s){return Math.max(t,Math.min(s,n))}
const qo=720,Nr=360,At={x:60,y:Nr/2},ue={x:qo/2,y:Nr/2},Ro=qo-70,Zn={"g-orders":"#4a8fd8","g-audit":"#f5c542","g-metrics":"#5cd894","g-archive":"#ef6f9a",_default:"#a15cff"},er={pending:"#a15cff",delivered:"#5cd894",acked:"#4a8fd8",lost:"#f66"},_h=[{id:"queue",label:"Queue"},{id:"pubsub",label:"Pub/Sub"},{id:"kafka",label:"Kafka-style groups"}],Rh=[{id:"at-most-once",label:"at-most-once"},{id:"at-least-once",label:"at-least-once"},{id:"exactly-once",label:"exactly-once"}];
function tr(n){return n&&Zn[n]||Zn._default}
function Th(n){const t=Math.max(1,n.length),s=40,o=Nr-s-40;return n.map((i,a)=>{const l=t===1?Nr/2:s+o*a/(t-1);return{x:Ro,y:l,id:i.id}})}
function Hi(n){let t=0;for(let s=0;s<n.length;s++)t=(t*31+n.charCodeAt(s))%360;return`hsl(${t}, 70%, 62%)`}
function Ki(n){switch(n.type){case"publish":return`${n.messageId} published (${n.mode}) -> ${n.targets.join(", ")}`;case"publishNoConsumers":return`${n.messageId} published but no consumers - message dropped`;case"delivered":return`${n.messageId} -> ${n.consumerId} delivered (attempt ${n.attempt})`;case"ack":return`${n.messageId} -> ${n.consumerId} acked after ${Math.round(n.latencyMs)}ms${n.implicit?" (at-most-once, implicit)":""}`;case"deduped":return`${n.messageId} -> ${n.consumerId} DEDUPED (exactly-once)`;case"deliveryLost":return`${n.messageId} -> ${n.consumerId} lost: ${n.reason}`;case"redelivery":return`${n.messageId} redelivered to ${n.consumerId} (attempt ${n.attempt})`;case"retryExhausted":return`${n.messageId} retry limit reached for ${n.consumerId}`;case"retryNoTarget":return`${n.messageId} could not redeliver - no live target`;case"consumerKilled":return`${n.consumerId} killed`;case"consumerRevived":return`${n.consumerId} revived`;case"consumerAdded":return`${n.consumerId} joined${n.groupId?` (group ${n.groupId})`:""}`;case"consumerRemoved":return`${n.consumerId} removed`;case"modeChange":return`Mode -> ${n.mode}`;case"semanticChange":return`Delivery semantic -> ${n.semantic}`;case"consumerGroupChanged":return`${n.consumerId} reassigned to group ${n.groupId||"(none)"}`;default:return JSON.stringify(n)}}
function Mh(n,t,s,r){if(n<.5){const i=n/.5;return{x:t.x+(s.x-t.x)*i,y:t.y+(s.y-t.y)*i}}const o=(n-.5)/.5;return{x:s.x+(r.x-s.x)*o,y:s.y+(r.y-s.y)*o}}
const Ui=`
.ps-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.ps-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.ps-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.ps-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.ps-toolbar .grp {
  display: flex;
  gap: 0;
  border: 1px solid #2a3038;
  border-radius: 4px;
  overflow: hidden;
}
.ps-toolbar .grp button {
  background: #1a1f26;
  color: #cfd6e0;
  border: none;
  border-right: 1px solid #2a3038;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.ps-toolbar .grp button:last-child { border-right: none; }
.ps-toolbar .grp button.on {
  background: #2c5aa0;
  color: #fff;
}
.ps-toolbar .grp button:hover:not(.on) { background: #232a33; }
.ps-toolbar button.act {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.ps-toolbar button.act:hover { background: #232a33; }
.ps-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.ps-toolbar button.primary:hover { background: #3467b0; }
.ps-toolbar button.danger {
  background: #5a2030;
  border-color: #823040;
  color: #fff;
}
.ps-toolbar button.danger:hover { background: #702637; }
.ps-toolbar .label {
  font-size: 11px;
  color: #8a95a3;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-right: 4px;
}
.ps-toolbar .spacer { flex: 1; }
.ps-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  width: 88px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.ps-main {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 12px;
}
.ps-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}
.ps-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 10px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  border-top: 1px solid #2a3038;
}
.ps-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.ps-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.ps-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
}
.ps-card .hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 4px;
}
.ps-card .meta {
  color: #8a95a3;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ps-card .row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.ps-card input {
  background: #0f1419;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  width: 80px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ps-card button {
  background: #1a1f26;
  color: #cfd6e0;
  border: 1px solid #3a4250;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.ps-card button:hover { background: #232a33; }
.ps-card .group-pill {
  font-size: 10px;
  padding: 1px 8px;
  border-radius: 999px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #111;
  font-weight: 700;
}

.ps-stats {
  margin-top: 10px;
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-size: 12px;
  color: #8a95a3;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ps-stats strong { color: #e6e6e6; font-weight: 600; margin-right: 2px; }
.ps-stats .warn { color: #f5c542; }
.ps-stats .good { color: #5cd894; }

.ps-status {
  margin-top: 8px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-left: 3px solid #4a8fd8;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 20px;
  color: #cfd6e0;
}
.ps-status.err {
  border-left-color: #f66;
  color: #ffb4b4;
}

.ps-footer {
  margin-top: 14px;
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  color: #cfd6e0;
}
.ps-footer h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: #8a95a3;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.ps-footer .row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  align-items: baseline;
}
.ps-footer .row .tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #161b22;
  border: 1px solid #2a3038;
  color: #cfd6e0;
  min-width: 90px;
  text-align: center;
  flex-shrink: 0;
}
.ps-footer .row .desc { color: #cfd6e0; }

.ps-widget svg text { user-select: none; }

@keyframes ps-pulse {
  0% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.3; transform: scale(0.8); }
}
`;
function Ah(){return[{id:"c1",groupId:"g-orders"},{id:"c2",groupId:"g-orders"},{id:"c3",groupId:"g-audit"},{id:"c4",groupId:"g-audit"}]}
function Ih(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState("queue"),[l,d]=h.useState("at-least-once"),[c,p]=h.useState("Broker idle. Publish a message to get started."),[m,g]=h.useState(!1),w=h.useRef(0),C=h.useRef(4);h.useEffect(()=>{const x=new Ch({mode:i,deliverySemantic:l});for(const f of Ah())x.addConsumer(f.id,f.groupId);n.current=x,w.current=0,C.current=4,o(x.snapshot()),p(`Broker reset. Mode=${i}, semantic=${l}.`),g(!1)},[t]),h.useEffect(()=>{const x=n.current;x&&(x.setMode(i),o(x.snapshot()))},[i]),h.useEffect(()=>{const x=n.current;x&&(x.setSemantic(l),o(x.snapshot()))},[l]),h.useEffect(()=>{const x=setInterval(()=>{const f=n.current;if(!f)return;const u=f.tick(50);if(o(f.snapshot()),u.length>0){const y={publish:9,redelivery:8,deliveryLost:8,retryExhausted:7,deduped:7,consumerKilled:6,consumerRevived:5,delivered:5,ack:4,consumerAdded:3,consumerRemoved:3,publishNoConsumers:9,modeChange:2,semanticChange:2,retryNoTarget:7,consumerGroupChanged:3};let v=u[u.length-1];for(const I of u)(y[I.type]??0)>=(y[v.type]??0)&&(v=I);p(Ki(v)),g(v.type==="publishNoConsumers"||v.type==="retryExhausted"||v.type==="retryNoTarget")}},50);return()=>clearInterval(x)},[]);const j=h.useCallback(()=>{const x=n.current;if(!x)return;w.current+=1;const f=`m${w.current}`,u=x.publish(f,`payload-${f}`,null);o(x.snapshot()),u.ok?(p(`${f} published (${i}) -> ${u.targets.join(", ")}`),g(!1)):(p(`${f}: ${u.reason}`),g(!0))},[i]),$=h.useCallback(()=>{const x=n.current;if(x){for(let f=0;f<10;f++)w.current+=1,x.publish(`m${w.current}`,`payload-m${w.current}`,null);o(x.snapshot()),p(`Burst of 10 messages published in ${i} mode.`),g(!1)}},[i]),O=h.useCallback(()=>{const x=n.current;if(!x)return;C.current+=1;const f=`c${C.current}`,y=Array.from(new Set(x.consumers.map(v=>v.groupId).filter(Boolean)))[0]||"g-orders";x.addConsumer(f,y),o(x.snapshot()),p(`${f} joined group ${y}.`),g(!1)},[]),q=h.useCallback(()=>{const x=n.current;if(!x||x.consumers.length===0)return;const f=x.consumers[x.consumers.length-1];x.removeConsumer(f.id),o(x.snapshot()),p(`${f.id} removed.`),g(!1)},[]),R=h.useCallback(x=>{const f=n.current;if(!f)return;const u=f.consumers.find(y=>y.id===x);u&&(u.alive?f.killConsumer(x):f.reviveConsumer(x),o(f.snapshot()),p(u.alive?`${x} killed. At-least-once will redeliver after ${f.ackTimeoutMs}ms.`:`${x} revived.`),g(!1))},[]),D=h.useCallback((x,f)=>{const u=n.current;u&&(u.setConsumerGroup(x,f),o(u.snapshot()))},[]),B=()=>s(x=>x+1),V=h.useMemo(()=>r?Th(r.consumers):[],[r]),T=h.useMemo(()=>{const x=new Map;for(const f of V)x.set(f.id,f);return x},[V]),_=r==null?void 0:r.consumers.find(x=>x.alive);if(!r)return e.jsxs("div",{className:"ps-widget",children:[e.jsx("style",{children:Ui}),e.jsx("h2",{children:"Pub/Sub vs Queue - System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const b=r.stats;return e.jsxs("div",{className:"ps-widget",children:[e.jsx("style",{children:Ui}),e.jsxs("h2",{children:[e.jsx("span",{children:"Pub/Sub vs Queue - System Design Primer"}),e.jsx("span",{style:{display:"flex",gap:8},children:e.jsx("button",{className:"act",onClick:B,children:"Reset"})})]}),e.jsx("p",{className:"sub",children:"Users constantly confuse these: a queue delivers each message to exactly ONE consumer, pub/sub delivers it to EVERY subscriber, and Kafka-style consumer groups straddle both."}),e.jsxs("div",{className:"ps-toolbar",children:[e.jsx("span",{className:"label",children:"Mode"}),e.jsx("div",{className:"grp",children:_h.map(x=>e.jsx("button",{className:i===x.id?"on":"",onClick:()=>a(x.id),children:x.label},x.id))}),e.jsx("span",{className:"label",style:{marginLeft:8},children:"Semantic"}),e.jsx("div",{className:"grp",children:Rh.map(x=>e.jsx("button",{className:l===x.id?"on":"",onClick:()=>d(x.id),children:x.label},x.id))}),e.jsx("span",{className:"spacer"}),e.jsx("button",{className:"act primary",onClick:j,children:"Publish message"}),e.jsx("button",{className:"act",onClick:$,children:"Publish 10"}),e.jsx("button",{className:"act",onClick:O,children:"Add consumer"}),e.jsx("button",{className:"act",onClick:q,children:"Remove consumer"}),e.jsxs("button",{className:"act danger",onClick:()=>_&&R(_.id),disabled:!_,title:_?`Kill ${_.id}`:"No live consumers",children:["Kill ",_?_.id:"--"]})]}),e.jsxs("div",{className:"ps-main",children:[e.jsxs("div",{className:"ps-canvas-wrap",children:[e.jsxs("svg",{width:qo,height:Nr,children:[e.jsx("defs",{children:e.jsx("marker",{id:"ps-arrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),e.jsx("line",{x1:At.x,y1:At.y,x2:ue.x,y2:ue.y,stroke:"#1e252e",strokeWidth:"1"}),V.map(x=>e.jsx("line",{x1:ue.x,y1:ue.y,x2:x.x,y2:x.y,stroke:"#1e252e",strokeWidth:"1",strokeDasharray:"3 4"},`route-${x.id}`)),r.deliveries.map(x=>{const f=T.get(x.consumerId);if(!f)return null;const u=Mh(x.progress,At,ue,f),y=Hi(x.messageId),v=er[x.status]||y,I=x.status==="pending"?7:x.status==="delivered"?8:6,S=x.status==="lost"?"#3a2025":y;return e.jsxs("g",{children:[e.jsx("circle",{cx:u.x,cy:u.y,r:I+3,fill:"none",stroke:v,strokeWidth:"1.5",opacity:x.status==="pending"?.7:.9}),e.jsx("circle",{cx:u.x,cy:u.y,r:I,fill:S,stroke:"#0a0e13",strokeWidth:"1",children:e.jsx("title",{children:`msg=${x.messageId} -> ${x.consumerId} status=${x.status}${x.isRetry?" (retry)":""}`})}),e.jsx("text",{x:u.x,y:u.y+3,textAnchor:"middle",fontSize:"9",fontWeight:"700",fill:"#0a0e13",children:x.messageId.replace(/^m/,"")}),x.isRetry&&e.jsx("text",{x:u.x+10,y:u.y-8,textAnchor:"start",fontSize:"8",fill:"#f5c542",children:"retry"})]},x.deliveryId)}),e.jsxs("g",{children:[e.jsx("rect",{x:At.x-38,y:At.y-22,width:"76",height:"44",rx:"6",fill:"#1a1f26",stroke:"#4a8fd8",strokeWidth:"2"}),e.jsx("text",{x:At.x,y:At.y-4,textAnchor:"middle",fontSize:"12",fill:"#e6e6e6",fontWeight:"700",children:"Producer"}),e.jsxs("text",{x:At.x,y:At.y+12,textAnchor:"middle",fontSize:"10",fill:"#8a95a3",children:["m",w.current]})]}),e.jsxs("g",{children:[e.jsx("rect",{x:ue.x-78,y:ue.y-54,width:"156",height:"108",rx:"8",fill:"#13202d",stroke:"#f5c542",strokeWidth:"2"}),e.jsx("text",{x:ue.x,y:ue.y-34,textAnchor:"middle",fontSize:"12",fill:"#e6e6e6",fontWeight:"700",children:"Broker / Topic"}),e.jsxs("text",{x:ue.x,y:ue.y-18,textAnchor:"middle",fontSize:"10",fill:"#8a95a3",children:["mode = ",r.mode]}),e.jsxs("text",{x:ue.x,y:ue.y-4,textAnchor:"middle",fontSize:"10",fill:"#8a95a3",children:["semantic = ",r.semantic]}),(()=>{const x=new Map;for(const u of r.deliveries)u.status==="pending"&&x.set(u.messageId,(x.get(u.messageId)||0)+1);return Array.from(x.entries()).slice(-4).map(([u,y],v)=>e.jsxs("g",{children:[e.jsx("circle",{cx:ue.x-50+v*30,cy:ue.y+18,r:"10",fill:Hi(u),opacity:"0.9"}),e.jsx("text",{x:ue.x-50+v*30,y:ue.y+22,textAnchor:"middle",fontSize:"10",fontWeight:"700",fill:"#0a0e13",children:u.replace(/^m/,"")}),y>1&&e.jsxs("text",{x:ue.x-50+v*30+10,y:ue.y+12,fontSize:"9",fill:"#f5c542",children:["x",y]})]},`chip-${u}`))})(),e.jsx("text",{x:ue.x,y:ue.y+44,textAnchor:"middle",fontSize:"9",fill:"#8a95a3",children:"in-flight chips"})]}),r.consumers.map(x=>{const f=T.get(x.id);if(!f)return null;const u=x.alive?tr(x.groupId):"#3a3a3a";return e.jsxs("g",{style:{cursor:"pointer"},onClick:()=>R(x.id),children:[e.jsx("rect",{x:f.x-38,y:f.y-22,width:"76",height:"44",rx:"6",fill:"#1a1f26",stroke:u,strokeWidth:"2"}),e.jsx("text",{x:f.x,y:f.y-4,textAnchor:"middle",fontSize:"12",fill:x.alive?"#e6e6e6":"#888",fontWeight:"700",children:x.id}),e.jsx("text",{x:f.x,y:f.y+12,textAnchor:"middle",fontSize:"10",fill:"#8a95a3",children:x.groupId||"(no group)"}),!x.alive&&e.jsxs("g",{children:[e.jsx("line",{x1:f.x-20,y1:f.y-14,x2:f.x+20,y2:f.y+14,stroke:"#f66",strokeWidth:"2.5"}),e.jsx("line",{x1:f.x+20,y1:f.y-14,x2:f.x-20,y2:f.y+14,stroke:"#f66",strokeWidth:"2.5"})]})]},x.id)}),r.mode==="kafka"&&(()=>{const x=new Map;for(const u of r.consumers){const y=u.groupId||"(none)";x.has(y)||x.set(y,[]),x.get(y).push(u)}const f=[];for(const[u,y]of x){const v=y.map(H=>T.get(H.id)).filter(Boolean);if(v.length===0)continue;const I=Math.min(...v.map(H=>H.y))-30,S=Math.max(...v.map(H=>H.y))+30;f.push(e.jsxs("g",{children:[e.jsx("rect",{x:Ro-52,y:I,width:"104",height:S-I,rx:"8",fill:"none",stroke:tr(u),strokeOpacity:"0.35",strokeWidth:"1.5",strokeDasharray:"4 4"}),e.jsx("text",{x:Ro+52,y:I+12,textAnchor:"end",fontSize:"9",fill:tr(u),fontWeight:"700",children:u})]},`gbx-${u}`))}return f})()]}),e.jsxs("div",{className:"ps-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:er.pending}})," in-flight"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:er.delivered}})," delivered"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:er.acked}})," acked"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:er.lost}})," lost"]}),e.jsx("span",{children:"click a consumer to kill/revive"})]})]}),e.jsxs("div",{className:"ps-side",children:[e.jsxs("div",{className:"ps-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Consumers"}),e.jsxs("span",{className:"meta",children:[r.consumers.length," total"]})]}),r.consumers.map(x=>e.jsxs("div",{className:"row",children:[e.jsx("span",{style:{color:x.alive?tr(x.groupId):"#888",fontWeight:700,width:28},children:x.id}),r.mode==="kafka"?e.jsx("input",{value:x.groupId||"",onChange:f=>D(x.id,f.target.value),title:"consumer group id",placeholder:"(no group)"}):e.jsx("span",{className:"group-pill",style:{background:tr(x.groupId),color:"#0a0e13"},children:x.groupId||"none"}),e.jsx("span",{className:"spacer",style:{flex:1}}),e.jsx("button",{onClick:()=>R(x.id),children:x.alive?"kill":"revive"})]},x.id))]}),e.jsxs("div",{className:"ps-card",children:[e.jsx("div",{className:"hdr",children:e.jsx("span",{children:"Recent activity"})}),e.jsxs("div",{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontSize:11,lineHeight:1.5,maxHeight:150,overflow:"auto"},children:[r.events.slice(-8).reverse().map((x,f)=>e.jsxs("div",{style:{color:"#cfd6e0"},children:[e.jsxs("span",{style:{color:"#8a95a3"},children:["t=",Math.round(x.t),"ms"]})," ",Ki(x)]},f)),r.events.length===0&&e.jsx("div",{style:{color:"#555"},children:"(no events yet)"})]})]})]})]}),e.jsxs("div",{className:"ps-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"mode"}),"=",r.mode]}),e.jsxs("span",{children:[e.jsx("strong",{children:"semantic"}),"=",r.semantic]}),e.jsxs("span",{children:[e.jsx("strong",{children:"msg/sec"}),"=",b.msgPerSec.toFixed(2)]}),e.jsxs("span",{children:[e.jsx("strong",{children:"avg latency"}),"=",b.avgLatencyMs.toFixed(1),"ms"]}),e.jsxs("span",{children:[e.jsx("strong",{children:"published"}),"=",b.published]}),e.jsxs("span",{children:[e.jsx("strong",{children:"delivered"}),"=",b.delivered]}),e.jsxs("span",{children:[e.jsx("strong",{children:"acked"}),"=",b.acked]}),e.jsxs("span",{children:[e.jsx("strong",{children:"redeliveries"}),"=",b.redeliveries]}),e.jsxs("span",{className:b.duplicates>0?"warn":"good",children:[e.jsx("strong",{children:"duplicates"}),"=",b.duplicates,r.semantic==="exactly-once"&&b.duplicates===0&&" (EOS)"]})]}),e.jsx("div",{className:`ps-status ${m?"err":""}`,children:c}),e.jsxs("div",{className:"ps-footer",children:[e.jsx("h4",{children:"Cheat sheet"}),e.jsxs("div",{className:"row",children:[e.jsx("span",{className:"tag",style:{borderColor:"#4a8fd8",color:"#4a8fd8"},children:"Queue"}),e.jsx("span",{className:"desc",children:"one producer, one message, one consumer (competing consumers)"})]}),e.jsxs("div",{className:"row",children:[e.jsx("span",{className:"tag",style:{borderColor:"#a15cff",color:"#a15cff"},children:"Pub/Sub"}),e.jsx("span",{className:"desc",children:"one producer, one message, every consumer (fan-out)"})]}),e.jsxs("div",{className:"row",children:[e.jsx("span",{className:"tag",style:{borderColor:"#f5c542",color:"#f5c542"},children:"Kafka groups"}),e.jsx("span",{className:"desc",children:"between groups: pub/sub; within a group: queue"})]})]})]})}

export default Ih;
export { Ih as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ih, {}));
  return () => root.unmount();
}
