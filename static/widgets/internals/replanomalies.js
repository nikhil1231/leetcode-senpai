import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class zd{constructor({followerCount:t=3,replicationLagMs:s=[30,500]}={}){this.simTime=0,this._version=0,this._msgId=0,this.leader={kv:Object.create(null),log:[]},this.followers=[];const[r,o]=s;for(let i=0;i<t;i++){const a=t>1?i/(t-1):0,l=Math.round(r+a*(o-r));this.followers.push({id:`F${i+1}`,kv:Object.create(null),lag:l,pending:[],appliedVersion:0})}this.clients=[],this.readMessages=[],this.anomalies=[],this.lastResult=null}addClient(t,s={}){this.clients.find(r=>r.id===t)||this.clients.push({id:t,routingPolicy:s.routingPolicy||"any",stickyFollowerId:s.stickyFollowerId||null,lastWriteVersion:Object.create(null),lastReadVersion:Object.create(null),highestObservedVersion:0,reads:[],writes:[]})}setClientPolicy(t,s,r=null){const o=this.clients.find(i=>i.id===t);o&&(o.routingPolicy=s,o.stickyFollowerId=r)}setFollowerLag(t,s){const r=this.followers.find(o=>o.id===t);r&&(r.lag=Math.max(0,Math.round(s)))}tick(t){this.simTime+=t;for(const r of this.followers){const o=[];for(const i of r.pending){const a=this.simTime-i.enqueuedAt;if(i.progress=Math.max(0,Math.min(1,a/Math.max(1,i.flightMs))),a>=i.flightMs){const l=r.kv[i.key];(!l||l.version<i.version)&&(r.kv[i.key]={value:i.value,version:i.version,ts:i.ts}),i.version>r.appliedVersion&&(r.appliedVersion=i.version)}else o.push(i)}r.pending=o}const s=[];for(const r of this.readMessages)r.progress+=t/Math.max(1,r.flightMs),r.progress>=1?r.phase==="request"&&s.push({...r,id:++this._msgId,phase:"reply",from:r.to,to:r.from,progress:0,flightMs:120}):s.push(r);this.readMessages=s}leaderWrite(t,s,r={}){this._version+=1;const o=this._version,i=this.simTime;this.leader.kv[t]={value:s,version:o,ts:i},this.leader.log.push({version:o,key:t,value:s,ts:i});const a=[];for(const p of this.followers){const m=p.lag,g={msgId:++this._msgId,version:o,key:t,value:s,ts:i,enqueuedAt:this.simTime,flightMs:m,progress:0};p.pending.push(g),a.push({followerId:p.id,inMs:m})}const l=r.clientId?this.clients.find(p=>p.id===r.clientId):null;l&&(l.lastWriteVersion[t]=o,l.writes.push({t:i,key:t,value:s,version:o}),l.writes.length>20&&l.writes.shift());const d=a.map(p=>`${p.followerId} (arrives in ${p.inMs}ms)`).join(", "),c=l?l.id:"client";return this.lastResult=`${c} wrote ${t}=${JSON.stringify(s)} @ leader (v${o}). Replicating: ${d}.`,{version:o,arrivals:a}}clientRead({clientId:t,key:s,fromFollowerId:r}){const o=this.clients.find(q=>q.id===t);if(!o)return{error:`unknown client ${t}`};let i=r;o.routingPolicy==="leader"?i="leader":o.routingPolicy==="sticky"&&o.stickyFollowerId&&(i=o.stickyFollowerId);const a=this.leader.kv[s],l=this._version;let d,c;if(i==="leader"||i==="LEADER")d="leader",c=this.leader.kv;else{const q=this.followers.find(R=>R.id===i);if(!q)return{error:`unknown follower ${i}`};d=q.id,c=q.kv,q.appliedVersion}const p=c[s],m=p?p.value:void 0,g=p?p.version:0,w=l-g,C=a&&g<a.version;d!=="leader"?this.readMessages.push({id:++this._msgId,clientId:t,key:s,from:t,to:d,phase:"request",progress:0,flightMs:120,value:m,version:g}):this.readMessages.push({id:++this._msgId,clientId:t,key:s,from:t,to:"leader",phase:"request",progress:0,flightMs:120,value:m,version:g});let j=null;const $=o.lastWriteVersion[s];if($!=null&&g<$&&(j={kind:"RYW",msg:`RYW violation: ${t} wrote ${s} v${$}, but reading from ${d} saw v${g||0}${p?`=${JSON.stringify(m)}`:" (not present)"}.`}),!j){const q=o.lastReadVersion[s];q!=null&&g<q&&(j={kind:"MONOTONIC",msg:`Monotonic-read violation: ${t} read ${s} v${q} earlier, now ${d} returned v${g} (time went backwards).`})}if(!j&&p){const q=o.highestObservedVersion;if(q>0&&g<q){const R=this.leader.log.find(D=>D.version===q-1);R&&R.key===s&&g<q-1&&(j={kind:"CONSISTENT_PREFIX",msg:`Consistent-prefix violation: ${t} previously saw a write @ v${q}, but now reading ${s} from ${d} returned v${g} — missing the causal predecessor v${q-1}.`})}}o.lastReadVersion[s]=Math.max(o.lastReadVersion[s]||0,g),g>o.highestObservedVersion&&(o.highestObservedVersion=g);const O={t:this.simTime,key:s,value:m,version:g,source:d,freshness:w,stale:!!C,anomaly:j};return o.reads.push(O),o.reads.length>20&&o.reads.shift(),j?(this.anomalies.push({t:this.simTime,clientId:t,...j}),this.anomalies.length>20&&this.anomalies.shift(),this.lastResult=`${t} read ${s} from ${d} → got v${g}${p?`=${JSON.stringify(m)}`:" (missing)"}. ANOMALY: ${j.msg}`):this.lastResult=`${t} read ${s} from ${d} → got v${g}${p?`=${JSON.stringify(m)}`:" (missing)"}${C?` (STALE by ${w} version${w===1?"":"s"})`:" (fresh)"}.`,{value:m,version:g,freshness:w,stale:!!C,source:d,anomaly:j}}resetAnomalies(){this.anomalies=[];for(const t of this.clients)t.lastWriteVersion=Object.create(null),t.lastReadVersion=Object.create(null),t.highestObservedVersion=0,t.reads=[],t.writes=[]}snapshot(){return{currentTime:this.simTime,leader:{kv:{...this.leader.kv},version:this._version,log:this.leader.log.slice(-10)},followers:this.followers.map(t=>({id:t.id,lag:t.lag,appliedVersion:t.appliedVersion,kv:{...t.kv},pending:t.pending.map(s=>({msgId:s.msgId,version:s.version,key:s.key,value:s.value,progress:s.progress,arrivalTime:s.enqueuedAt+s.flightMs}))})),clients:this.clients.map(t=>({id:t.id,routingPolicy:t.routingPolicy,stickyFollowerId:t.stickyFollowerId,lastWriteVersion:{...t.lastWriteVersion},lastReadVersion:{...t.lastReadVersion},highestObservedVersion:t.highestObservedVersion,reads:t.reads.slice(),writes:t.writes.slice()})),readMessages:this.readMessages.map(t=>({id:t.id,clientId:t.clientId,key:t.key,from:t.from,to:t.to,phase:t.phase,progress:t.progress,version:t.version,value:t.value})),anomalies:this.anomalies.slice(),lastResult:this.lastResult}}}
const xn=780,Pd=460,fe={x:xn/2,y:70},Ma=230,Aa=390,Ht=26,Lr=20,ne={leader:"#d4a640",follower:"#4a8fd8",followerStale:"#7a6f3a",client:"#9d7bd8",clientBad:"#ff6b6b",writeMsg:"#d4a640",readMsg:"#9d7bd8",readReply:"#d6b8ff",warn:"#f5c542",bad:"#ff6b6b",edge:"#2a3038",edgeHot:"#4a3a1a",bg:"#0f1419",panel:"#161b22",mute:"#8a95a3"};
function Od(n){const t=[],r=xn-280,o=n>1?r/(n-1):0;for(let i=0;i<n;i++)t.push({x:140+i*o,y:Ma});return t}
function Ld(n){const t=[],r=xn-400,o=n>1?r/(n-1):0;for(let i=0;i<n;i++)t.push({x:200+i*o,y:Aa});return t}
function Fd(n){return n?/ANOMALY|violation/i.test(n)?ne.bad:/STALE/i.test(n)?ne.warn:"#cfd6e0":ne.mute}
const Si=`
.repl-widget {
  background: ${ne.bg};
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 1100px;
}
.repl-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.repl-widget .sub {
  font-size: 12px;
  color: ${ne.mute};
  margin: 0 0 12px 0;
}
.repl-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.repl-toolbar label {
  font-size: 12px;
  color: ${ne.mute};
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.repl-toolbar input[type="text"] {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 70px;
}
.repl-toolbar input[type="range"] {
  width: 110px;
}
.repl-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.repl-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.repl-toolbar button:hover { background: #232a33; }
.repl-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.repl-toolbar button.primary:hover { background: #3467b0; }
.repl-toolbar button.accent {
  background: #6c3ba0;
  border-color: #7f4cb0;
}
.repl-toolbar button.accent:hover { background: #7a4ab0; }
.repl-toolbar button.danger {
  background: #8b2a2a;
  border-color: #a23939;
}
.repl-toolbar button.danger:hover { background: #a13535; }
.repl-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
}
.repl-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.repl-legend {
  font-size: 11px;
  color: ${ne.mute};
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.repl-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.repl-sidepanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.repl-card {
  background: ${ne.panel};
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
}
.repl-card .title {
  font-size: 11px;
  color: ${ne.mute};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.repl-card .body {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #cfd6e0;
}
.repl-card.anomaly {
  border-color: #8b2a2a;
  background: #2a1717;
}
.repl-client-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
}
.repl-client-row button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.repl-client-row button:hover { background: #232a33; }
.repl-client-row select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}
.repl-status {
  margin-top: 10px;
  background: ${ne.panel};
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 20px;
}
.repl-anomaly-log {
  margin-top: 8px;
  background: ${ne.panel};
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  color: #cfd6e0;
  max-height: 110px;
  overflow-y: auto;
}
.repl-anomaly-log .title {
  font-size: 11px;
  color: ${ne.mute};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.repl-anomaly-log .row { font-family: ui-monospace, Menlo, monospace; margin: 2px 0; color: #ff9a9a; }
.repl-anomaly-log .row.empty { color: ${ne.mute}; font-style: italic; }
.repl-lag-cell { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #cfd6e0; }
.repl-widget svg text { user-select: none; }
.repl-kv {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  color: #cfd6e0;
}
.repl-kv .empty { color: #555; }
.repl-pill {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  margin-left: 4px;
}
.repl-pill.leader { background: #3f2f13; color: ${ne.leader}; border: 1px solid #6d5520; }
.repl-pill.sticky { background: #1a2a3a; color: #9dcaff; border: 1px solid #2f5a80; }
.repl-pill.any    { background: #1a1f26; color: ${ne.mute}; border: 1px solid #2a3038; }
.repl-scenario-hint {
  font-size: 11px;
  color: ${ne.mute};
  margin-left: 6px;
  font-style: italic;
}
`;
function Dd(){return{"read-your-writes":{label:"Read your writes",description:"C1 writes x=5, then immediately reads x from slow follower F2 before replication has arrived.",steps:[{kind:"setLag",id:"F1",ms:60},{kind:"setLag",id:"F2",ms:1500},{kind:"setLag",id:"F3",ms:400},{kind:"write",clientId:"C1",key:"x",value:5},{kind:"tick",ms:80},{kind:"read",clientId:"C1",key:"x",fromFollowerId:"F2"}]},"monotonic-reads":{label:"Monotonic reads",description:"C1 reads x from fresh F1 (new value), then from stale F2 — time appears to go backwards.",steps:[{kind:"setLag",id:"F1",ms:80},{kind:"setLag",id:"F2",ms:1800},{kind:"setLag",id:"F3",ms:400},{kind:"write",clientId:"C2",key:"x",value:42},{kind:"tick",ms:150},{kind:"read",clientId:"C1",key:"x",fromFollowerId:"F1"},{kind:"tick",ms:50},{kind:"read",clientId:"C1",key:"x",fromFollowerId:"F2"}]},"consistent-prefix":{label:"Consistent prefix (Mrs Cake)",description:'Mr Poons writes "question", Mrs Cake writes "answer". C1 reads answer then question from a slow follower and sees the answer before the question.',steps:[{kind:"setLag",id:"F1",ms:80},{kind:"setLag",id:"F2",ms:1800},{kind:"setLag",id:"F3",ms:400},{kind:"write",clientId:"C1",key:"question",value:"how far can you see?"},{kind:"write",clientId:"C2",key:"answer",value:"about ten seconds"},{kind:"tick",ms:120},{kind:"read",clientId:"C1",key:"answer",fromFollowerId:"leader"},{kind:"tick",ms:30},{kind:"read",clientId:"C1",key:"question",fromFollowerId:"F2"}]}}}
function qd(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState(!0),[l,d]=h.useState("x"),[c,p]=h.useState("5"),[m,g]=h.useState("read-your-writes"),[w,C]=h.useState(null),j=h.useMemo(Dd,[]);h.useEffect(()=>{const k=new zd({followerCount:3,replicationLagMs:[60,900]});k.addClient("C1"),k.addClient("C2"),n.current=k,o(k.snapshot())},[t]),h.useCallback(()=>{const k=n.current;k&&o(k.snapshot())},[]);const $=h.useCallback(()=>{const k=n.current;k&&(k.tick(50),o(k.snapshot()))},[]);h.useEffect(()=>{if(!i)return;const k=setInterval($,60);return()=>clearInterval(k)},[i,$]);const O=h.useRef(0);h.useEffect(()=>{if(!r)return;const k=r.anomalies;if(k.length>O.current){const P=k[k.length-1];C(P.clientId);const N=setTimeout(()=>C(null),1800);return O.current=k.length,()=>clearTimeout(N)}O.current=k.length},[r]);const q=h.useCallback(k=>{const P=n.current;if(!P)return;const N=l.trim();if(!N)return;let z=c;z!==""&&!isNaN(Number(z))&&(z=Number(z)),P.leaderWrite(N,z,{clientId:k}),o(P.snapshot())},[l,c]),R=h.useCallback((k,P)=>{const N=n.current;if(!N)return;const z=l.trim();z&&(N.clientRead({clientId:k,key:z,fromFollowerId:P}),o(N.snapshot()))},[l]),D=h.useCallback((k,P)=>{const N=n.current;N&&(N.setFollowerLag(k,P),o(N.snapshot()))},[]),B=h.useCallback((k,P,N)=>{const z=n.current;z&&(z.setClientPolicy(k,P,N),o(z.snapshot()))},[]),V=h.useRef(!1),T=h.useCallback(async k=>{const P=n.current;if(!P||V.current)return;V.current=!0;const N=j[k].steps;(async()=>{for(const E of N){if(E.kind==="setLag")P.setFollowerLag(E.id,E.ms);else if(E.kind==="write")P.leaderWrite(E.key,E.value,{clientId:E.clientId});else if(E.kind==="read")P.clientRead({clientId:E.clientId,key:E.key,fromFollowerId:E.fromFollowerId});else if(E.kind==="tick"){const J=E.ms,Y=Math.max(1,Math.ceil(J/50));for(let se=0;se<Y;se++)P.tick(J/Y),o(P.snapshot()),await new Promise(A=>setTimeout(A,60));continue}o(P.snapshot()),await new Promise(J=>setTimeout(J,450))}V.current=!1})()},[j]),_=h.useCallback(()=>{V.current=!1,O.current=0,C(null),s(k=>k+1)},[]);if(!r)return e.jsxs("div",{className:"repl-widget",children:[e.jsx("style",{children:Si}),e.jsx("h2",{children:"Replication Lag & Anomalies — DDIA Ch 5"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const b=r.followers,x=r.clients,f=Od(b.length),u=Ld(x.length),y=Object.fromEntries(b.map((k,P)=>[k.id,P])),v=Object.fromEntries(x.map((k,P)=>[k.id,P]));function I(k){return k==="leader"||k==="LEADER"?fe:y[k]!=null?f[y[k]]:v[k]!=null?u[v[k]]:fe}const S=[];for(const k of b){const P=f[y[k.id]];for(const N of k.pending){const z=fe.x+(P.x-fe.x)*N.progress,E=fe.y+(P.y-fe.y)*N.progress;S.push({id:`r-${k.id}-${N.msgId}`,x:z,y:E,key:N.key,version:N.version,value:N.value})}}const H=r.readMessages.map(k=>{const P=I(k.from),N=I(k.to),z=P.x+(N.x-P.x)*k.progress,E=P.y+(N.y-P.y)*k.progress;return{id:`rd-${k.id}`,x:z,y:E,phase:k.phase,key:k.key,version:k.version}}),M=r.lastResult;return e.jsxs("div",{className:"repl-widget",children:[e.jsx("style",{children:Si}),e.jsxs("h2",{children:[e.jsx("span",{children:"Replication Lag & Anomalies — DDIA Ch 5"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:()=>a(k=>!k),children:i?"Pause":"Auto-tick"}),e.jsx("button",{onClick:$,disabled:i,children:"Step"}),e.jsx("button",{onClick:_,children:"Reset"})]})]}),e.jsx("p",{className:"sub",children:"Leader-based async replication. Each follower has its own lag, so different clients can see different versions. Covers the three anomalies from Kleppmann ch.5 §“Problems with Replication Lag”: read-your-writes, monotonic reads, and consistent prefix."}),e.jsxs("div",{className:"repl-toolbar",children:[e.jsxs("label",{children:["key:",e.jsx("input",{type:"text",value:l,onChange:k=>d(k.target.value)})]}),e.jsxs("label",{children:["value:",e.jsx("input",{type:"text",value:c,onChange:k=>p(k.target.value)})]}),e.jsx("span",{style:{flex:1}}),e.jsxs("label",{children:["scenario:",e.jsx("select",{value:m,onChange:k=>g(k.target.value),children:Object.entries(j).map(([k,P])=>e.jsx("option",{value:k,children:P.label},k))})]}),e.jsx("button",{className:"primary",onClick:()=>T(m),title:j[m].description,children:"Replay scenario"}),e.jsx("span",{className:"repl-scenario-hint",children:j[m].description})]}),e.jsxs("div",{className:"repl-main",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"repl-canvas-wrap",children:[e.jsxs("svg",{width:xn,height:Pd,children:[e.jsx("defs",{children:e.jsx("marker",{id:"rarrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),b.map((k,P)=>e.jsx("line",{x1:fe.x,y1:fe.y+Ht,x2:f[P].x,y2:f[P].y-Ht,stroke:k.pending.length>0?ne.edgeHot:ne.edge,strokeWidth:"1.5",strokeDasharray:"4 3"},`edge-${k.id}`)),S.map(k=>e.jsxs("g",{children:[e.jsx("circle",{cx:k.x,cy:k.y,r:5,fill:ne.writeMsg,opacity:"0.95",children:e.jsx("title",{children:`${k.key}=${JSON.stringify(k.value)} v${k.version}`})}),e.jsxs("text",{x:k.x+8,y:k.y+3,fill:"#cfd6e0",fontSize:"9",fontFamily:"ui-monospace, Menlo, monospace",children:["v",k.version]})]},k.id)),H.map(k=>e.jsx("circle",{cx:k.x,cy:k.y,r:k.phase==="reply"?3.5:4.5,fill:k.phase==="reply"?ne.readReply:ne.readMsg,opacity:"0.9",children:e.jsx("title",{children:`read ${k.key} ${k.phase}`})},k.id)),e.jsxs("g",{children:[e.jsx("circle",{cx:fe.x,cy:fe.y,r:Ht+4,fill:"none",stroke:ne.leader,strokeWidth:"2",strokeDasharray:"4 2"}),e.jsx("circle",{cx:fe.x,cy:fe.y,r:Ht,fill:ne.leader,stroke:"#111",strokeWidth:"2"}),e.jsx("text",{x:fe.x,y:fe.y-2,textAnchor:"middle",fill:"#111",fontSize:"12",fontWeight:"700",children:"LEADER"}),e.jsxs("text",{x:fe.x,y:fe.y+10,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"700",children:["v",r.leader.version]}),e.jsx("text",{x:fe.x,y:fe.y+Ht+14,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:Object.keys(r.leader.kv).length===0?"(empty)":Object.entries(r.leader.kv).slice(0,2).map(([k,P])=>`${k}=${JSON.stringify(P.value)}@v${P.version}`).join("  ")})]}),b.map((k,P)=>{const N=f[P],z=r.leader.version>0&&k.appliedVersion<r.leader.version,E=z?ne.followerStale:ne.follower;return e.jsxs("g",{children:[e.jsx("circle",{cx:N.x,cy:N.y,r:Ht,fill:E,stroke:"#111",strokeWidth:"2"}),e.jsx("text",{x:N.x,y:N.y-2,textAnchor:"middle",fill:"#111",fontSize:"12",fontWeight:"700",children:k.id}),e.jsxs("text",{x:N.x,y:N.y+10,textAnchor:"middle",fill:"#111",fontSize:"9",fontWeight:"700",children:["v",k.appliedVersion]}),e.jsxs("text",{x:N.x,y:N.y+Ht+14,textAnchor:"middle",fill:ne.mute,fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:["lag ",k.lag,"ms",k.pending.length>0?` · q${k.pending.length}`:""]}),e.jsx("text",{x:N.x,y:N.y+Ht+26,textAnchor:"middle",fill:z?ne.warn:"#cfd6e0",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:Object.keys(k.kv).length===0?"(empty)":Object.entries(k.kv).slice(0,2).map(([J,Y])=>`${J}=${JSON.stringify(Y.value)}@v${Y.version}`).join("  ")})]},k.id)}),x.map((k,P)=>{const N=u[P],z=w===k.id;return e.jsxs("g",{children:[e.jsx("circle",{cx:N.x,cy:N.y,r:Lr+(z?6:3),fill:"none",stroke:z?ne.bad:"#333",strokeWidth:z?3:1,strokeDasharray:z?void 0:"3 3"}),e.jsx("circle",{cx:N.x,cy:N.y,r:Lr,fill:z?ne.clientBad:ne.client,stroke:"#111",strokeWidth:"2"}),e.jsx("text",{x:N.x,y:N.y+4,textAnchor:"middle",fill:"#111",fontSize:"12",fontWeight:"700",children:k.id}),e.jsx("text",{x:N.x,y:N.y+Lr+12,textAnchor:"middle",fill:ne.mute,fontSize:"9",fontFamily:"ui-monospace, Menlo, monospace",children:k.routingPolicy==="leader"?"→ leader":k.routingPolicy==="sticky"?`→ sticky ${k.stickyFollowerId||""}`:"→ any"})]},k.id)}),r.anomalies.length>0&&w&&(()=>{const k=x.findIndex(z=>z.id===w);if(k<0)return null;const P=u[k],N=r.anomalies[r.anomalies.length-1];return e.jsxs("g",{children:[e.jsx("rect",{x:P.x-140,y:P.y-72,width:"280",height:"48",rx:"4",fill:"#2a1717",stroke:ne.bad,strokeWidth:"1.5"}),e.jsxs("text",{x:P.x,y:P.y-56,textAnchor:"middle",fill:ne.bad,fontSize:"11",fontWeight:"700",children:[N.kind," violation"]}),e.jsx("text",{x:P.x,y:P.y-40,textAnchor:"middle",fill:"#ffb0b0",fontSize:"9",fontFamily:"ui-monospace, Menlo, monospace",children:N.msg.length>56?N.msg.slice(0,56)+"…":N.msg}),e.jsx("line",{x1:P.x,y1:P.y-24,x2:P.x,y2:P.y-Lr-4,stroke:ne.bad,strokeWidth:"1",strokeDasharray:"2 2"})]})})(),e.jsx("text",{x:16,y:fe.y+4,fill:ne.mute,fontSize:"10",children:"LEADER"}),e.jsx("text",{x:16,y:Ma+4,fill:ne.mute,fontSize:"10",children:"FOLLOWERS"}),e.jsx("text",{x:16,y:Aa+4,fill:ne.mute,fontSize:"10",children:"CLIENTS"})]}),e.jsxs("div",{className:"repl-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.leader}})," leader"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.follower}})," follower (fresh)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.followerStale}})," follower (lagging)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.client}})," client"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.writeMsg}})," replication"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.readMsg}})," read req"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.readReply}})," read reply"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:ne.bad}})," anomaly"]})]})]}),e.jsx("div",{className:"repl-status",style:{color:Fd(M)},children:M||"Idle. Pick a scenario and hit Replay, or drive clients manually from the side panel."}),e.jsxs("div",{className:"repl-anomaly-log",children:[e.jsxs("div",{className:"title",children:["anomalies detected (",r.anomalies.length,")"]}),r.anomalies.length===0?e.jsx("div",{className:"row empty",children:"(none yet)"}):r.anomalies.slice(-5).map((k,P)=>e.jsxs("div",{className:"row",children:["[t=",Math.round(k.t),"ms] ",k.kind,": ",k.msg]},P))]})]}),e.jsxs("div",{className:"repl-sidepanel",children:[e.jsxs("div",{className:"repl-card",children:[e.jsxs("div",{className:"title",children:[e.jsx("span",{children:"follower lag (ms)"}),e.jsxs("span",{children:["t = ",Math.round(r.currentTime),"ms"]})]}),b.map(k=>e.jsxs("div",{style:{marginBottom:6},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx("span",{className:"repl-lag-cell",style:{width:28},children:k.id}),e.jsx("input",{type:"range",min:30,max:2e3,step:10,value:k.lag,onChange:P=>D(k.id,Number(P.target.value)),style:{flex:1}}),e.jsxs("span",{className:"repl-lag-cell",style:{width:60,textAlign:"right"},children:[k.lag,"ms"]})]}),e.jsxs("div",{className:"repl-kv",style:{paddingLeft:32},children:["q=",k.pending.length,", applied v",k.appliedVersion,k.pending.length>0&&e.jsxs("span",{style:{color:ne.warn},children:[" ","(next in ~",Math.max(0,Math.round(k.pending[0].arrivalTime-r.currentTime)),"ms)"]})]})]},k.id))]}),x.map(k=>{const P=w===k.id,N=k.reads[k.reads.length-1],z=k.writes[k.writes.length-1];return e.jsxs("div",{className:`repl-card ${P?"anomaly":""}`,children:[e.jsx("div",{className:"title",children:e.jsxs("span",{style:{color:P?ne.bad:"#cfd6e0"},children:[k.id,e.jsx("span",{className:`repl-pill ${k.routingPolicy}`,children:k.routingPolicy==="leader"?"route→leader":k.routingPolicy==="sticky"?`sticky:${k.stickyFollowerId||"?"}`:"any"})]})}),e.jsxs("div",{className:"repl-client-row",children:[e.jsx("span",{style:{fontSize:11,color:ne.mute},children:"routing:"}),e.jsxs("select",{value:k.routingPolicy==="sticky"?`sticky:${k.stickyFollowerId}`:k.routingPolicy,onChange:E=>{const J=E.target.value;J.startsWith("sticky:")?B(k.id,"sticky",J.slice(7)):B(k.id,J,null)},children:[e.jsx("option",{value:"any",children:"any (random follower)"}),e.jsx("option",{value:"leader",children:"read from leader"}),b.map(E=>e.jsxs("option",{value:`sticky:${E.id}`,children:["sticky → ",E.id]},E.id))]})]}),e.jsx("div",{className:"repl-client-row",children:e.jsxs("button",{onClick:()=>q(k.id),children:["write ",l,"=",c]})}),e.jsxs("div",{className:"repl-client-row",children:[e.jsx("span",{style:{fontSize:11,color:ne.mute},children:"read from:"}),e.jsx("button",{onClick:()=>R(k.id,"leader"),children:"leader"}),b.map(E=>e.jsx("button",{onClick:()=>R(k.id,E.id),children:E.id},E.id))]}),e.jsxs("div",{className:"body",style:{marginTop:4},children:[z&&e.jsxs("div",{children:["last write: ",z.key,"=",JSON.stringify(z.value)," @ v",z.version]}),N&&e.jsxs("div",{style:{color:N.anomaly?ne.bad:N.stale?ne.warn:"#cfd6e0"},children:["last read: ",N.key,"=",N.value===void 0?"(missing)":JSON.stringify(N.value)," ","@ v",N.version," from ",N.source,N.stale?" (stale)":"",N.anomaly?` ← ${N.anomaly.kind}`:""]}),!N&&!z&&e.jsx("div",{style:{color:ne.mute},children:"(no ops yet)"})]})]},k.id)})]})]})]})}

export default qd;
export { qd as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(qd, {}));
  return () => root.unmount();
}
