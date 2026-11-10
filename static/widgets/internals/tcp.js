import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Ba(n){let t=n>>>0||1;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
function Ha(n,t=5){const s=String(n??""),r=Math.max(1,t|0);if(s.length===0)return new Array(r).fill("");const o=Math.ceil(s.length/r),i=[];for(let a=0;a<r;a++)i.push(s.slice(a*o,(a+1)*o));return i}
class lu{constructor({seed:t=1,lossRate:s=.2,reorderRate:r=.1,rttMs:o=100,rtoMs:i=300,segmentCount:a=5}={}){this.rand=Ba(t),this.lossRate=s,this.reorderRate=r,this.rttMs=Math.max(10,o),this.rtoMs=Math.max(50,i),this.segmentCount=a,this.simTime=0,this._pid=0,this.state="CLOSED",this.packets=[],this.events=[],this.nextSeq=1,this.unacked=new Map,this.sendOrder=[],this.recvBuf=new Map,this.expectedSeq=1,this.deliveredSeqs=[],this.stats={segmentsSent:0,transmissions:0,acked:0,retransmitted:0,outOfOrder:0,dropped:0},this._waitingToSend=null}open(){if(this.state!=="CLOSED"){this._log(`open() ignored: state=${this.state}`);return}this.state="SYN_SENT",this._launch({kind:"SYN",dir:"c2s",seq:0}),this._log("Client -> SYN (state: SYN_SENT)")}send(t){const s=Ha(t,this.segmentCount);if(this.state==="CLOSED"||this.state==="SYN_SENT"){this._waitingToSend=s,this._log(this.state==="CLOSED"?"Queued payload; connection not open yet.":"Queued payload; waiting for handshake to complete.");return}if(this.state!=="ESTABLISHED"){this._log(`send() ignored: state=${this.state}`);return}this._segmentAndSend(s)}close(){if(this.state!=="ESTABLISHED"){this._log(`close() ignored: state=${this.state}`);return}if(this.unacked.size>0){this._pendingClose=!0,this._log("close() deferred: unacked segments still in flight.");return}this._startFin()}tick(t){const s=Math.max(0,t);this.simTime+=s;const r=[];for(const o of this.packets)if(!o.finished){if(o.dropped){o.progress<(o._dropAt??.5)?(o.progress+=s/(this.rttMs*(o._rttMul||1)),o.progress>=(o._dropAt??.5)&&(o.progress=o._dropAt??.5)):(o.fadeMs=(o.fadeMs??0)+s,o.fadeMs>800&&(o.finished=!0));continue}o.progress+=s/(this.rttMs*(o._rttMul||1)),o.progress>=1&&(o.progress=1,o.arrivedAt=this.simTime,this._deliver(o,r),o.finished=!0)}for(const[o,i]of this.unacked)i.acked||this.simTime>=i.rtoAt&&(i.rtx+=1,i.rtoAt=this.simTime+this.rtoMs,this.stats.retransmitted+=1,this.stats.transmissions+=1,this._launch({kind:"DATA",dir:"c2s",seq:o,payload:i.payload,rtx:i.rtx}),r.push(`Client RTX seq=${o} ("${i.payload}") at t=${this._t()} (attempt ${i.rtx+1}).`),this._log(`RTO for seq=${o} -> retransmit ("${i.payload}") attempt ${i.rtx+1}`));return this.packets=this.packets.filter(o=>!o.finished||(o.fadeMs??0)<800),r}snapshot(){return{kind:"tcp",state:this.state,simTime:this.simTime,packets:this.packets.map(t=>({...t})),sendBuf:[...this.unacked.entries()].map(([t,s])=>({seq:t,payload:s.payload,acked:s.acked,rtx:s.rtx})),recvBuf:[...this.recvBuf.entries()].sort((t,s)=>t[0]-s[0]).map(([t,s])=>({seq:t,payload:s})),expectedSeq:this.expectedSeq,delivered:this.deliveredSeqs.slice(),deliveredPayload:this.deliveredSeqs.map(t=>this._originalPayload(t)).join(""),stats:{...this.stats},events:this.events.slice(-6),rttMs:this.rttMs,rtoMs:this.rtoMs,pendingClose:!!this._pendingClose}}_segmentAndSend(t){for(const s of t){const r=this.nextSeq++;this.sendOrder.push(r),this.unacked.set(r,{payload:s,sentAt:this.simTime,acked:!1,rtx:0,rtoAt:this.simTime+this.rtoMs}),this.stats.segmentsSent+=1,this.stats.transmissions+=1,this._launch({kind:"DATA",dir:"c2s",seq:r,payload:s}),this._log(`Client sent seq=${r} ("${s}")`)}}_startFin(){this.state="FIN_WAIT",this._launch({kind:"FIN",dir:"c2s"}),this._log("Client -> FIN (state: FIN_WAIT)")}_launch(t){const s=(t.kind==="DATA"||t.kind==="DATA_ACK")&&this.rand()<this.lossRate,o=t.kind==="DATA"&&this.rand()<this.reorderRate?.4+this.rand()*.8:1,i={id:++this._pid,kind:t.kind,dir:t.dir,seq:t.seq??null,ack:t.ack??null,payload:t.payload??"",rtx:t.rtx??0,_rttMul:o,progress:0,dropped:!1,arrivedAt:null,fadeMs:0,finished:!1};s&&(i.dropped=!0,i._dropAt=.35+this.rand()*.35,this.stats.dropped+=1),this.packets.push(i)}_deliver(t,s){if(t.dir==="c2s")if(t.kind==="SYN")this._launch({kind:"SYN_ACK",dir:"s2c"}),this._log("Server <- SYN; Server -> SYN-ACK");else if(t.kind==="ACK")this.state;else if(t.kind==="DATA"){const r=t.seq;if(r<this.expectedSeq)this._launch({kind:"DATA_ACK",dir:"s2c",ack:this.expectedSeq}),s.push(`Server got duplicate seq=${r} (already delivered); re-ACKs ${this.expectedSeq}.`);else if(r===this.expectedSeq){for(this.recvBuf.set(r,t.payload);this.recvBuf.has(this.expectedSeq);)this.deliveredSeqs.push(this.expectedSeq),this.expectedSeq+=1;this._launch({kind:"DATA_ACK",dir:"s2c",ack:this.expectedSeq});const o=t.rtx?`Server got seq=${r} (RTX) -> delivered; ACK ${this.expectedSeq}.`:`Server got seq=${r} ("${t.payload}") in order; ACK ${this.expectedSeq}.`;s.push(o)}else this.recvBuf.has(r)||(this.recvBuf.set(r,t.payload),this.stats.outOfOrder+=1),this._launch({kind:"DATA_ACK",dir:"s2c",ack:this.expectedSeq}),s.push(`Server got seq=${r} OUT OF ORDER; buffers it, dup-ACK ${this.expectedSeq} (waiting for seq=${this.expectedSeq}).`)}else t.kind==="FIN"&&(this._launch({kind:"FIN_ACK",dir:"s2c"}),this._log("Server <- FIN; Server -> FIN-ACK"));else if(t.kind==="SYN_ACK"){if(this.state="ESTABLISHED",this._launch({kind:"ACK",dir:"c2s"}),this._log("Client <- SYN-ACK; Client -> ACK (state: ESTABLISHED)"),s.push("3-way handshake complete: ESTABLISHED."),this._waitingToSend){const r=this._waitingToSend;this._waitingToSend=null,this._segmentAndSend(r)}}else if(t.kind==="DATA_ACK"){const r=t.ack;for(const[o,i]of this.unacked)o<r&&!i.acked&&(i.acked=!0,this.stats.acked+=1);for(const[o,i]of[...this.unacked.entries()])i.acked&&this.unacked.delete(o);this._pendingClose&&this.unacked.size===0&&(this._pendingClose=!1,this._startFin())}else t.kind==="FIN_ACK"&&(this.state="CLOSED",this._log("Client <- FIN-ACK (state: CLOSED)"),s.push("Connection CLOSED."))}_originalPayload(t){return this.recvBuf.get(t)??""}_log(t){this.events.push(`[${this._t()}] ${t}`),this.events.length>30&&this.events.shift()}_t(){return`+${this.simTime.toFixed(0)}ms`}}
class cu{constructor({seed:t=2,lossRate:s=.2,reorderRate:r=.2,rttMs:o=40,segmentCount:i=5}={}){this.rand=Ba(t),this.lossRate=s,this.reorderRate=r,this.rttMs=Math.max(5,o),this.segmentCount=i,this.simTime=0,this._pid=0,this.packets=[],this.events=[],this.nextSeq=1,this.received=[],this._expectNextSeq=1,this.stats={sent:0,received:0,lost:0,outOfOrder:0}}send(t){const s=Ha(t,this.segmentCount);for(const r of s){const o=this.nextSeq++,i=this.rand()<this.lossRate,l=this.rand()<this.reorderRate?.3+this.rand()*1.4:.9+this.rand()*.2,d={id:++this._pid,seq:o,payload:r,progress:0,dropped:i,_dropAt:i?.3+this.rand()*.4:null,_rttMul:l,arrivedAt:null,fadeMs:0,finished:!1};this.packets.push(d),this.stats.sent+=1,i&&(this.stats.lost+=1),this._log(i?`Client sent dgram=${o} ("${r}") — will be LOST.`:`Client sent dgram=${o} ("${r}").`)}}tick(t){const s=Math.max(0,t);this.simTime+=s;const r=[];for(const o of this.packets)if(!o.finished){if(o.dropped){o.progress<(o._dropAt??.5)?(o.progress+=s/(this.rttMs*(o._rttMul||1)),o.progress>=(o._dropAt??.5)&&(o.progress=o._dropAt??.5,r.push(`UDP dgram=${o.seq} ("${o.payload}") LOST. Not recovered.`))):(o.fadeMs=(o.fadeMs??0)+s,o.fadeMs>800&&(o.finished=!0));continue}if(o.progress+=s/(this.rttMs*(o._rttMul||1)),o.progress>=1){o.progress=1,o.arrivedAt=this.simTime,o.finished=!0;const i=o.seq<this._expectNextSeq;o.seq>=this._expectNextSeq?this._expectNextSeq=o.seq+1:this.stats.outOfOrder+=1,this.received.push({seq:o.seq,payload:o.payload,arrivedAt:this.simTime,outOfOrder:i}),this.stats.received+=1,r.push(i?`Server got dgram=${o.seq} ("${o.payload}") OUT OF ORDER (handed to app as-is).`:`Server got dgram=${o.seq} ("${o.payload}").`)}}return this.packets=this.packets.filter(o=>!o.finished||(o.fadeMs??0)<800),r}snapshot(){return{kind:"udp",simTime:this.simTime,packets:this.packets.map(t=>({...t})),received:this.received.slice(),stats:{...this.stats},events:this.events.slice(-6),rttMs:this.rttMs}}_log(t){this.events.push(`[+${this.simTime.toFixed(0)}ms] ${t}`),this.events.length>30&&this.events.shift()}}
const na=280,Bo=360,oa=40,es=38,xs=Bo-38,Zt={SYN:"#a15cff",SYN_ACK:"#d6b8ff",ACK:"#8aa0b5",DATA:"#4a8fd8",DATA_ACK:"#8aa0b5",DATA_RTX:"#f5c542",FIN:"#d9534f",FIN_ACK:"#f0b6b6"},Mo="#6be0a2",mn="#ff6b6b",du={CLOSED:"#3a3a3a",SYN_SENT:"#a15cff",ESTABLISHED:"#3a9c6a",FIN_WAIT:"#d9534f"},ia=`
.tcp-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.tcp-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.tcp-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.tcp-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.tcp-toolbar .group {
  display: flex;
  gap: 6px;
  padding: 2px 6px;
  border-left: 1px solid #2a3038;
  border-right: 1px solid #2a3038;
  align-items: center;
}
.tcp-toolbar label {
  font-size: 11px;
  color: #8a95a3;
}
.tcp-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 150px;
}
.tcp-toolbar input[type="range"] {
  width: 90px;
}
.tcp-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.tcp-toolbar button:hover { background: #232a33; }
.tcp-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.tcp-toolbar button.primary:hover { background: #3467b0; }
.tcp-toolbar button.danger {
  background: #6b2a2a;
  border-color: #8b3a3a;
}
.tcp-toolbar button.danger:hover { background: #7f3333; }
.tcp-toolbar button.active {
  background: #3a4250;
  border-color: #5a6878;
}
.tcp-toolbar .spacer { flex: 1; }

.tcp-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.tcp-col {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px;
}
.tcp-col .title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.tcp-col .title h3 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.5px;
}
.tcp-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 3px;
  color: #0a0e13;
  background: #3a3a3a;
}
.tcp-svg-wrap {
  background: #0f1419;
  border: 1px solid #1e252e;
  border-radius: 4px;
}
.tcp-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 11px;
  color: #cfd6e0;
}
.tcp-stat {
  background: #161b22;
  border: 1px solid #2a3038;
  padding: 2px 7px;
  border-radius: 3px;
}
.tcp-stat b { color: #e6e6e6; }
.tcp-status {
  margin-top: 6px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  min-height: 18px;
  color: #cfd6e0;
  white-space: pre-wrap;
}
.tcp-delivered {
  margin-top: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #8a95a3;
}
.tcp-delivered b { color: #6be0a2; }
.tcp-buf {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.tcp-buf-entry {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 2px;
  background: #2a3038;
  color: #cfd6e0;
  border: 1px solid #3a4250;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcp-buf-entry.held { background: #5a4a1a; color: #f5c542; border-color: #7a6a2a; }
.tcp-buf-entry.lost { background: #6b2a2a; color: #ff8a8a; border-color: #8b3a3a; }

.tcp-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 2px 2px 2px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.tcp-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.tcp-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  color: #cfd6e0;
}
.tcp-footer h4 {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #8a95a3;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.tcp-footer-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  padding: 3px 0;
  border-top: 1px dashed #2a3038;
}
.tcp-footer-row:first-child { border-top: none; }
.tcp-footer-row .label {
  color: #8a95a3;
  font-weight: 600;
}
.tcp-footer-row .tcp-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: #2a3038;
  color: #b6d4f0;
  font-size: 11px;
  margin-right: 4px;
}
.tcp-widget svg text { user-select: none; }
`;
function pu(n){return n.kind==="DATA"&&n.rtx>0?Zt.DATA_RTX:Zt[n.kind]||"#888"}
function hu(n){return n.kind==="DATA"?n.rtx>0?`RTX${n.seq}`:`D${n.seq}`:n.kind==="DATA_ACK"?`A${n.ack}`:n.kind==="SYN_ACK"?"S/A":n.kind==="FIN_ACK"?"F/A":n.kind}
function uu(n,t){const s=t/2,r=t/2,o=n.dir==="c2s"?-20:20,i=n.dir==="c2s"?es+(xs-es)*n.progress:xs+(es-xs)*n.progress;return{x:(s+r)/2+o,y:i}}
function Ka({width:n}){return e.jsxs("g",{children:[e.jsx("line",{x1:n/2,y1:es,x2:n/2,y2:xs,stroke:"#1e252e",strokeWidth:"1.5",strokeDasharray:"4 4"}),e.jsx("circle",{cx:n/2,cy:es,r:22,fill:"#2c5aa0",stroke:"#111"}),e.jsx("text",{x:n/2,y:es+4,textAnchor:"middle",fill:"#e6e6e6",fontSize:"11",fontWeight:"700",children:"CLIENT"}),e.jsx("circle",{cx:n/2,cy:xs,r:22,fill:"#3a9c6a",stroke:"#111"}),e.jsx("text",{x:n/2,y:xs+4,textAnchor:"middle",fill:"#0a0e13",fontSize:"11",fontWeight:"700",children:"SERVER"})]})}
function mu({snap:n,width:t}){const s=(n==null?void 0:n.packets)??[];return e.jsxs("svg",{width:t,height:Bo,className:"tcp-svg-wrap",children:[e.jsx("defs",{children:e.jsx("marker",{id:"tcp-arrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),e.jsx(Ka,{width:t}),s.map(r=>{const{x:o,y:i}=uu(r,t),a=r.dropped?mn:pu(r),l=r.dropped?Math.max(0,1-(r.fadeMs??0)/800):.95,c=r.kind==="ACK"||r.kind==="DATA_ACK"||r.kind==="FIN_ACK"?8:11;return e.jsxs("g",{opacity:l,children:[e.jsx("circle",{cx:o,cy:i,r:c,fill:a,stroke:r.dropped?"#8b3a3a":"#0a0e13",strokeWidth:"1.5",children:e.jsxs("title",{children:[r.kind,r.seq!=null?` seq=${r.seq}`:"",r.ack!=null?` ack=${r.ack}`:"",r.payload?` "${r.payload}"`:"",r.rtx?` (RTX x${r.rtx})`:""]})}),e.jsx("text",{x:o,y:i+3,textAnchor:"middle",fill:"#0a0e13",fontSize:"9",fontWeight:"700",children:r.dropped?"X":hu(r)})]},r.id)})]})}
function fu({snap:n,width:t}){const s=(n==null?void 0:n.packets)??[];return e.jsxs("svg",{width:t,height:Bo,className:"tcp-svg-wrap",children:[e.jsx(Ka,{width:t}),s.map(r=>{const o=t/2,i=es+(xs-es)*r.progress,a=r.dropped?mn:Mo,l=r.dropped?Math.max(0,1-(r.fadeMs??0)/800):.95;return e.jsxs("g",{opacity:l,children:[e.jsx("circle",{cx:o,cy:i,r:11,fill:a,stroke:r.dropped?"#8b3a3a":"#0a0e13",strokeWidth:"1.5",children:e.jsxs("title",{children:["dgram seq=",r.seq,' "',r.payload,'"',r.dropped?" (LOST)":""]})}),e.jsx("text",{x:o,y:i+3,textAnchor:"middle",fill:"#0a0e13",fontSize:"9",fontWeight:"700",children:r.dropped?"X":`U${r.seq}`})]},r.id)})]})}
function xu(){const n=h.useRef(null),t=h.useRef(null),[s,r]=h.useState(0),[o,i]=h.useState(null),[a,l]=h.useState(null),[d,c]=h.useState(!1),[p,m]=h.useState(1),[g,w]=h.useState("TCP channel CLOSED. Press [Open TCP] to begin the 3-way handshake."),[C,j]=h.useState("UDP is stateless. Press [Send] to fire datagrams."),[$,O]=h.useState(.2),[q,R]=h.useState(.2),[D,B]=h.useState("Hello, world!");h.useEffect(()=>{n.current=new lu({seed:1+s,lossRate:$,reorderRate:q,rttMs:120,rtoMs:320,segmentCount:5}),t.current=new cu({seed:2+s,lossRate:$,reorderRate:q,rttMs:60,segmentCount:5}),i(n.current.snapshot()),l(t.current.snapshot()),w("TCP channel CLOSED. Press [Open TCP] to begin the 3-way handshake."),j("UDP is stateless. Press [Send] to fire datagrams.")},[s]),h.useEffect(()=>{n.current&&(n.current.lossRate=$,n.current.reorderRate=q),t.current&&(t.current.lossRate=$,t.current.reorderRate=q)},[$,q]);const V=h.useCallback(()=>{const M=40*p*window.SimClock.scale(),k=n.current,P=t.current;if(!k||!P)return;const N=k.tick(M),z=P.tick(M);i(k.snapshot()),l(P.snapshot()),N.length>0&&w(N[N.length-1]),z.length>0&&j(z[z.length-1])},[p]);h.useEffect(()=>{if(!d)return;const M=window.SimClock.every(V,60);return()=>clearInterval(M)},[d,V]);const T=h.useCallback(()=>{const M=n.current;M&&(M.open(),i(M.snapshot()),w("TCP: Client -> SYN. Handshake in progress (SYN_SENT)."))},[]),_=h.useCallback(()=>{const M=n.current,k=t.current;!M||!k||(M.send(D),k.send(D),i(M.snapshot()),l(k.snapshot()),w(M.state==="ESTABLISHED"?`TCP: segmenting "${D}" into 5 segments, sending...`:`TCP: payload "${D}" queued until handshake completes.`),j(`UDP: firing 5 datagrams for "${D}" — no handshake, no retries.`))},[D]),b=h.useCallback(()=>{const M=n.current;M&&(M.close(),i(M.snapshot()),w(M.state==="FIN_WAIT"?"TCP: Client -> FIN (state: FIN_WAIT). Awaiting FIN-ACK.":"TCP: close() deferred until all segments are acked."))},[]),x=(o==null?void 0:o.state)??"CLOSED",f=(o==null?void 0:o.stats)??{},u=(a==null?void 0:a.stats)??{},y=(o==null?void 0:o.deliveredPayload)??"",v=(a==null?void 0:a.received)??[],I=new Set((o==null?void 0:o.delivered)??[]),H=((o==null?void 0:o.recvBuf)??[]).filter(M=>!I.has(M.seq));return!o||!a?e.jsxs("div",{className:"tcp-widget",children:[e.jsx("style",{children:ia}),e.jsx("h2",{children:"TCP vs UDP — System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]}):e.jsxs("div",{className:"tcp-widget",children:[e.jsx("style",{children:ia}),e.jsxs("h2",{children:[e.jsx("span",{children:"TCP vs UDP — System Design Primer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{className:d?"active":"",onClick:()=>c(M=>!M),children:d?"Pause":"Play"}),e.jsx("button",{onClick:V,disabled:d,children:"Step"}),e.jsx("button",{onClick:()=>{c(!1);(()=>r(M=>M+1))()},children:"Reset"})]})]}),e.jsx("p",{className:"sub",children:'Same "Hello, world!" payload split into 5 chunks, sent through both stacks side-by-side. TCP handshakes, orders, and retransmits; UDP just fires and forgets.'}),e.jsxs("div",{className:"tcp-toolbar",children:[e.jsxs("div",{className:"group",children:[e.jsx("label",{children:"Loss"}),e.jsx("input",{type:"range",min:"0",max:"0.5",step:"0.01",value:$,onChange:M=>O(Number(M.target.value))}),e.jsxs("span",{style:{fontSize:11,color:"#cfd6e0",width:30},children:[($*100).toFixed(0),"%"]})]}),e.jsxs("div",{className:"group",children:[e.jsx("label",{children:"Reorder"}),e.jsx("input",{type:"range",min:"0",max:"0.5",step:"0.01",value:q,onChange:M=>R(Number(M.target.value))}),e.jsxs("span",{style:{fontSize:11,color:"#cfd6e0",width:30},children:[(q*100).toFixed(0),"%"]})]}),e.jsxs("div",{className:"group",children:[e.jsx("label",{children:"Payload"}),e.jsx("input",{type:"text",value:D,onChange:M=>B(M.target.value)})]}),e.jsxs("div",{className:"group",children:[e.jsx("button",{className:"primary",onClick:T,children:"Open TCP"}),e.jsx("button",{className:"primary",onClick:_,children:"Send"}),e.jsx("button",{className:"danger",onClick:b,children:"Close TCP"})]}),e.jsxs("div",{className:"group",children:[e.jsx("label",{children:"Speed"}),e.jsx("input",{type:"range",min:"0.25",max:"3",step:"0.25",value:p,onChange:M=>m(Number(M.target.value))}),e.jsxs("span",{style:{fontSize:11,color:"#cfd6e0",width:36},children:[p.toFixed(2),"x"]})]}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:11,color:"#8a95a3"},children:["tcp t = ",(o.simTime/1e3).toFixed(2),"s · udp t = ",(a.simTime/1e3).toFixed(2),"s"]})]}),e.jsxs("div",{className:"tcp-columns",children:[e.jsxs("div",{className:"tcp-col",children:[e.jsxs("div",{className:"title",children:[e.jsx("h3",{children:"TCP — connection-oriented, ordered, reliable"}),e.jsx("span",{className:"tcp-badge",style:{background:du[x]||"#3a3a3a",color:"#0a0e13"},children:x})]}),e.jsx(mu,{snap:o,width:na+oa}),e.jsxs("div",{className:"tcp-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.SYN}}),"SYN"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.SYN_ACK}}),"SYN-ACK"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.DATA}}),"DATA"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.DATA_RTX}}),"RTX"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.DATA_ACK}}),"ACK"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Zt.FIN}}),"FIN"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:mn}}),"dropped"]})]}),e.jsxs("div",{className:"tcp-stats",children:[e.jsxs("span",{className:"tcp-stat",children:["sent ",e.jsx("b",{children:f.segmentsSent??0})]}),e.jsxs("span",{className:"tcp-stat",children:["acked ",e.jsx("b",{children:f.acked??0})]}),e.jsxs("span",{className:"tcp-stat",children:["retx ",e.jsx("b",{children:f.retransmitted??0})]}),e.jsxs("span",{className:"tcp-stat",children:["ooo ",e.jsx("b",{children:f.outOfOrder??0})]}),e.jsxs("span",{className:"tcp-stat",children:["dropped ",e.jsx("b",{children:f.dropped??0})]}),e.jsxs("span",{className:"tcp-stat",children:["on wire ",e.jsx("b",{children:f.transmissions??0})]})]}),e.jsxs("div",{className:"tcp-delivered",children:["delivered (in order): ",e.jsxs("b",{children:["“",y,"”"]}),o.state==="ESTABLISHED"&&o.expectedSeq>1&&e.jsxs(e.Fragment,{children:[" · expecting seq=",o.expectedSeq]})]}),H.length>0&&e.jsxs("div",{className:"tcp-buf",children:[e.jsx("span",{style:{fontSize:11,color:"#8a95a3"},children:"recv buf:"}),H.map(M=>e.jsxs("span",{className:"tcp-buf-entry held",title:`seq=${M.seq} held, waiting for seq=${o.expectedSeq}`,children:[M.seq,":",M.payload]},M.seq)),e.jsxs("span",{style:{fontSize:10,color:"#f5c542"},children:["waiting for seq=",o.expectedSeq]})]}),e.jsx("div",{className:"tcp-status",children:g})]}),e.jsxs("div",{className:"tcp-col",children:[e.jsxs("div",{className:"title",children:[e.jsx("h3",{children:"UDP — connectionless, best-effort, fast"}),e.jsx("span",{className:"tcp-badge",style:{background:Mo,color:"#0a0e13"},children:"STATELESS"})]}),e.jsx(fu,{snap:a,width:na+oa}),e.jsxs("div",{className:"tcp-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Mo}}),"datagram"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:mn}}),"dropped (gone)"]}),e.jsx("span",{children:"no ACKs, no retries, no ordering"})]}),e.jsxs("div",{className:"tcp-stats",children:[e.jsxs("span",{className:"tcp-stat",children:["sent ",e.jsx("b",{children:u.sent??0})]}),e.jsxs("span",{className:"tcp-stat",children:["received ",e.jsx("b",{children:u.received??0})]}),e.jsxs("span",{className:"tcp-stat",children:["lost ",e.jsx("b",{children:u.lost??0})]}),e.jsxs("span",{className:"tcp-stat",children:["ooo ",e.jsx("b",{children:u.outOfOrder??0})]})]}),e.jsxs("div",{className:"tcp-delivered",children:["received (arrival order):"," ",e.jsxs("b",{children:["“",v.map(M=>M.payload).join(""),"”"]})]}),v.length>0&&e.jsx("div",{className:"tcp-buf",children:v.map((M,k)=>e.jsxs("span",{className:`tcp-buf-entry ${M.outOfOrder?"held":""}`,title:`dgram ${M.seq} arrived t=+${M.arrivedAt.toFixed(0)}ms${M.outOfOrder?" (out of order)":""}`,children:[M.seq,":",M.payload]},k))}),e.jsx("div",{className:"tcp-status",children:C})]})]}),e.jsxs("div",{className:"tcp-footer",children:[e.jsx("h4",{children:"When each wins"}),e.jsxs("div",{className:"tcp-footer-row",children:[e.jsx("span",{className:"label",children:"TCP use cases"}),e.jsxs("span",{children:[e.jsx("span",{className:"tcp-tag",children:"HTTP/1.1"}),e.jsx("span",{className:"tcp-tag",children:"SSH"}),e.jsx("span",{className:"tcp-tag",children:"Postgres / MySQL"}),e.jsx("span",{className:"tcp-tag",children:"SMTP"}),e.jsx("span",{className:"tcp-tag",children:"git"}),"— anywhere byte-stream correctness matters more than a few ms of latency."]})]}),e.jsxs("div",{className:"tcp-footer-row",children:[e.jsx("span",{className:"label",children:"UDP use cases"}),e.jsxs("span",{children:[e.jsx("span",{className:"tcp-tag",children:"DNS"}),e.jsx("span",{className:"tcp-tag",children:"NTP"}),e.jsx("span",{className:"tcp-tag",children:"Video / VoIP"}),e.jsx("span",{className:"tcp-tag",children:"Game netcode"}),e.jsx("span",{className:"tcp-tag",children:"QUIC base"}),"— short requests or real-time streams that can paper over losses at the app layer."]})]}),e.jsxs("div",{className:"tcp-footer-row",children:[e.jsx("span",{className:"label",children:"UDP wins when"}),e.jsx("span",{children:"a late packet is worse than a missing one (voice, frames, ticks), or when you need your own reliability semantics (QUIC rebuilds TCP-like guarantees in userspace)."})]}),e.jsxs("div",{className:"tcp-footer-row",children:[e.jsx("span",{className:"label",children:"TCP wins when"}),e.jsx("span",{children:"you need every byte delivered exactly once and in order — file transfers, database protocols, RPCs whose idempotency you don't control."})]})]})]})}

export default xu;
export { xu as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(xu, {}));
  return () => root.unmount();
}
