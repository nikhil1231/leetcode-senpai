import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Po={anomalies:[{id:"dirty-read",name:"Dirty read"},{id:"dirty-write",name:"Dirty write"},{id:"non-repeatable-read",name:"Non-repeatable read"},{id:"phantom",name:"Phantom"},{id:"lost-update",name:"Lost update"},{id:"write-skew",name:"Write skew"}],levels:[{id:"readCommitted",name:"Read Committed"},{id:"snapshot",name:"Snapshot Isolation"},{id:"serializable",name:"Serializable"}],matrix:{"dirty-read":{readCommitted:!0,snapshot:!0,serializable:!0},"dirty-write":{readCommitted:!0,snapshot:!0,serializable:!0},"non-repeatable-read":{readCommitted:!1,snapshot:!0,serializable:!0},phantom:{readCommitted:!1,snapshot:!0,serializable:!0},"lost-update":{readCommitted:!1,snapshot:!0,serializable:!0},"write-skew":{readCommitted:!1,snapshot:!1,serializable:!0}}};
function fs(n){return n===void 0||n===null?"null":typeof n=="string"?`"${n}"`:String(n)}
function op(n){switch(n.op){case"begin":return"BEGIN";case"read":return`read(${n.key})`;case"readRange":return`scan(${n.range}*)`;case"write":return`write(${n.key}, ${fs(n.value)})`;case"commit":return"COMMIT";case"abort":return"ABORT";case"note":return"note";default:return n.op}}
function Ci({title:n,txnId:t,scenario:s,stepIdx:r,events:o,snap:i}){const a=i&&t?i.activeTxns.find(c=>c.id===t):null,l=a?a.status:"idle",d=a?a.status:"not started";return e.jsxs("div",{className:"iso-col",children:[e.jsxs("div",{className:"iso-col-title",children:[n,e.jsx("span",{className:`status ${l}`,children:d})]}),s.steps.map((c,p)=>{if(c.txn!==t)return null;const m=p<r,g=p===r-1,w=o[p],C=w&&w.type==="abort",$=["iso-step",m?"done":"pending",g?"current":"",g&&C?"anomaly":""].filter(Boolean).join(" ");let O=null;return m&&w&&(w.type==="read"?O=e.jsx("span",{className:"val",children:`-> ${fs(w.value)}`}):w.type==="readRange"?O=e.jsx("span",{className:"val",children:`-> [${w.values.map(q=>q.key).join(", ")||"∅"}]`}):w.type==="abort"?O=e.jsx("span",{className:"val",style:{color:"#ff8c9c"},children:`ABORT(${w.reason})`}):w.type==="commit"?O=e.jsx("span",{className:"val",style:{color:"#6be0a2"},children:"OK"}):w.type==="writeBlocked"&&(O=e.jsx("span",{className:"val",style:{color:"#ffd97a"},children:"BLOCKED"}))),e.jsxs("div",{className:$,children:[e.jsxs("span",{className:"step-num",children:["#",c.step]}),e.jsx("span",{className:"op",children:op(c)}),O]},p)})]})}
function up({scenario:n,level:t}){const{anomalies:s,levels:r,matrix:o}=Po;return e.jsxs("div",{className:"iso-matrix",children:[e.jsx("div",{className:"iso-matrix-title",children:"Anomaly prevention matrix — current scenario/level highlighted"}),e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{className:"row-head",children:"Anomaly"}),r.map(i=>e.jsx("th",{className:i.id===t?"hi":"",children:i.name},i.id))]})}),e.jsx("tbody",{children:s.map(i=>{const a=i.id===n.anomaly;return e.jsxs("tr",{children:[e.jsx("td",{className:`row-head ${a?"hi":""}`,children:i.name}),r.map(l=>{const d=o[i.id][l.id],c=a&&l.id===t,p=[d?"cell-prev":"cell-allow",c?"hi-cell":a||l.id===t?"hi":""].filter(Boolean).join(" ");return e.jsx("td",{className:p,children:d?"✅ prevented":"❌ allowed"},l.id)})]},i.id)})})]})]})}
function mp(n,t){const s=Math.floor(n/t)*t;return{start:s,end:s+t}}
function fp(n,t,s){const r=Math.floor((n-t+s)/s)*s,o=[];for(let i=r;i<=n;i+=s)i+t>n&&i<=n&&o.push({start:i,end:i+t});return o}
function Pn(n,t){return`${n}:${t}`}
class xp{constructor(t={}){this.windowType=t.windowType||"tumbling",this.windowSizeMs=t.windowSizeMs??1e4,this.slideIntervalMs=t.slideIntervalMs??5e3,this.sessionGapMs=t.sessionGapMs??3e3,this.watermarkDelayMs=t.watermarkDelayMs??2e3,this.windows=new Map,this.closedWindows=[],this.allEvents=[],this.maxEventTime=0,this.haveAnyEvent=!1,this.now=0,this.watermark=-1/0,this.lateEventCount=0,this.eventsIngested=0,this.onEvent=null,this._nextEventId=1}setConfig(t={}){t.windowType!==void 0&&(this.windowType=t.windowType),t.windowSizeMs!==void 0&&(this.windowSizeMs=t.windowSizeMs),t.slideIntervalMs!==void 0&&(this.slideIntervalMs=t.slideIntervalMs),t.sessionGapMs!==void 0&&(this.sessionGapMs=t.sessionGapMs),t.watermarkDelayMs!==void 0&&(this.watermarkDelayMs=t.watermarkDelayMs)}reset(){this.windows=new Map,this.closedWindows=[],this.allEvents=[],this.maxEventTime=0,this.haveAnyEvent=!1,this.now=0,this.watermark=-1/0,this.lateEventCount=0,this.eventsIngested=0,this._nextEventId=1}_recomputeWatermark(){if(!this.haveAnyEvent){this.watermark=-1/0;return}this.watermark=this.maxEventTime-this.watermarkDelayMs}ingest(t){const s=Number(t.value),r=Number(t.eventTime),o=t.processingTime!==void 0?Number(t.processingTime):this.now,i={id:this._nextEventId++,value:s,eventTime:r,processingTime:o,late:!1,assignedTo:[]};this.eventsIngested+=1,this.allEvents.push(i),(!this.haveAnyEvent||r>this.maxEventTime)&&(this.maxEventTime=r),this.haveAnyEvent=!0;const a=this.watermark;return a!==-1/0&&r<a&&(i.late=!0,this.lateEventCount+=1),this._recomputeWatermark(),this.windowType==="tumbling"?this._routeToTumbling(i):this.windowType==="sliding"?this._routeToSliding(i):this.windowType==="session"&&this._routeToSession(i),this.onEvent&&this.onEvent({type:"ingest",event:i,watermark:this.watermark}),i}_assignToOpenWindow(t,s,r){const o=Pn(s,r);let i=this.windows.get(o);return i||(i={start:s,end:r,count:0,sum:0,events:[],lateEvents:[],state:"open",kind:this.windowType},this.windows.set(o,i)),t.late&&i.lateEvents.push(t),i.events.push(t),i.count+=1,i.sum+=t.value,t.assignedTo.push(o),i}_routeToTumbling(t){const{start:s,end:r}=mp(t.eventTime,this.windowSizeMs),o=this.closedWindows.find(i=>i.start===s&&i.end===r);if(o){o.lateEvents.push(t),t.assignedTo.push(`closed:${s}:${r}`),this.onEvent&&this.onEvent({type:"late-after-close",event:t,window:o});return}this._assignToOpenWindow(t,s,r)}_routeToSliding(t){const s=fp(t.eventTime,this.windowSizeMs,this.slideIntervalMs);for(const{start:r,end:o}of s){const i=this.closedWindows.find(a=>a.start===r&&a.end===o);if(i){i.lateEvents.push(t),t.assignedTo.push(`closed:${r}:${o}`),this.onEvent&&this.onEvent({type:"late-after-close",event:t,window:i});continue}this._assignToOpenWindow(t,r,o)}}_routeToSession(t){const s=[];for(const c of this.windows.values())for(const p of c.events)s.push(p);s.push(t);const r=new Map;for(const c of this.closedWindows)r.set(c,[]);const o=[];for(const c of s){let p=null;for(const m of this.closedWindows)if(c.eventTime>=m.start&&c.eventTime<=m.end+this.sessionGapMs){p=m;break}p?r.get(p).push(c):o.push(c)}this.windows=new Map,o.sort((c,p)=>c.eventTime-p.eventTime);let i=null,a=null,l=[];const d=()=>{if(l.length===0)return;const c={start:i,end:a,count:0,sum:0,events:[],lateEvents:[],state:"open",kind:"session"};for(const p of l)c.events.push(p),c.count+=1,c.sum+=p.value,p.late&&c.lateEvents.push(p),p.assignedTo=[Pn(c.start,c.end)];this.windows.set(Pn(c.start,c.end),c)};for(const c of o){if(i===null){i=c.eventTime,a=c.eventTime,l=[c];continue}c.eventTime-a<this.sessionGapMs?(a=Math.max(a,c.eventTime),l.push(c)):(d(),i=c.eventTime,a=c.eventTime,l=[c])}d();for(const[c,p]of r.entries())for(const m of p)c.lateEvents.push(m),m.assignedTo=[`closed:${c.start}:${c.end}`],this.onEvent&&this.onEvent({type:"late-after-close",event:m,window:c})}tick(t){t!==void 0&&(this.now=t);const s=[];if(this.windowType==="session")for(const[r,o]of Array.from(this.windows.entries()))this.watermark>=o.end+this.sessionGapMs&&(o.state="closed",this.windows.delete(r),this.closedWindows.push(o),s.push(o),this.onEvent&&this.onEvent({type:"close",window:o,watermark:this.watermark}));else for(const[r,o]of Array.from(this.windows.entries()))this.watermark>=o.end&&(o.state="closed",this.windows.delete(r),this.closedWindows.push(o),s.push(o),this.onEvent&&this.onEvent({type:"close",window:o,watermark:this.watermark}));return this.closedWindows.sort((r,o)=>r.start-o.start),{flushedWindows:s}}advanceWatermarkTo(t){t>this.watermark&&(this.watermark=t,this.haveAnyEvent&&t>this.maxEventTime&&(this.maxEventTime=t+this.watermarkDelayMs))}snapshot(){const t=Array.from(this.windows.values()).map(r=>({start:r.start,end:r.end,count:r.count,sum:r.sum,events:r.events.slice(),lateEvents:r.lateEvents.slice(),state:r.state,kind:r.kind}));return t.sort((r,o)=>r.start-o.start),{windows:[...this.closedWindows.map(r=>({start:r.start,end:r.end,count:r.count,sum:r.sum,events:r.events.slice(),lateEvents:r.lateEvents.slice(),state:"closed",kind:r.kind})),...t],pending:t.length,watermark:this.watermark,eventsIngested:this.eventsIngested,lateEventCount:this.lateEventCount,now:this.now,maxEventTime:this.maxEventTime,allEvents:this.allEvents.slice(),config:{windowType:this.windowType,windowSizeMs:this.windowSizeMs,slideIntervalMs:this.slideIntervalMs,sessionGapMs:this.sessionGapMs,watermarkDelayMs:this.watermarkDelayMs}}}}
const os="#0f1419",gp="#1a1f2e",Xe="#2a2f3e",Pt="#e6e6e6",mt="#8a93a6",ot="#4a7cff",_i="#f5c451",On="#f66",Ln="#5cd894",bp="rgba(74,124,255,0.14)",yp="#4a7cff",vp="rgba(92,216,148,0.10)",wp="#5cd894",kp="rgba(138,108,255,0.10)",jp="#8a6cff",Sp="rgba(245,196,81,0.10)",$p="#f5c451",Fn=260,ks=40,Dr=20,Dn=16,Ri=32,Ti=6e4,Mi={inorder:{label:"In-order stream",config:{windowType:"tumbling",windowSizeMs:1e4,slideIntervalMs:5e3,sessionGapMs:3e3,watermarkDelayMs:2e3},events:[{value:3,eventTime:1500,processingTime:1500},{value:5,eventTime:4e3,processingTime:4e3},{value:2,eventTime:8500,processingTime:8500},{value:7,eventTime:11e3,processingTime:11e3},{value:4,eventTime:15500,processingTime:15500},{value:6,eventTime:18500,processingTime:18500},{value:9,eventTime:22e3,processingTime:22e3},{value:1,eventTime:26500,processingTime:26500}],advanceTo:3e4},outoforder:{label:"Out-of-order stream",config:{windowType:"tumbling",windowSizeMs:1e4,slideIntervalMs:5e3,sessionGapMs:3e3,watermarkDelayMs:3e3},events:[{value:3,eventTime:1500,processingTime:1500},{value:5,eventTime:4e3,processingTime:4e3},{value:7,eventTime:11e3,processingTime:11500},{value:2,eventTime:8e3,processingTime:12e3},{value:4,eventTime:15500,processingTime:15500},{value:6,eventTime:18500,processingTime:18500}],advanceTo:24e3},late:{label:"Late event after watermark",config:{windowType:"tumbling",windowSizeMs:1e4,slideIntervalMs:5e3,sessionGapMs:3e3,watermarkDelayMs:2e3},events:[{value:3,eventTime:1500,processingTime:1500},{value:5,eventTime:4e3,processingTime:4e3},{value:2,eventTime:8500,processingTime:8500},{value:7,eventTime:12500,processingTime:12500},{value:6,eventTime:15500,processingTime:15500},{value:99,eventTime:5e3,processingTime:17e3}],advanceTo:22e3}};
function Np(n){const t=h.useRef(null);return t.current===null&&(t.current=new xp(n)),t}
function Cp(){const[n,t]=h.useState("tumbling"),[s,r]=h.useState(1e4),[o,i]=h.useState(5e3),[a,l]=h.useState(3e3),[d,c]=h.useState(2e3),[p,m]=h.useState("5"),[g,w]=h.useState(""),[C,j]=h.useState(!1),[$,O]=h.useState(1e3),[q,R]=h.useState("Ready. Click the timeline to drop events, or run a scenario."),[D,B]=h.useState([]),[,V]=h.useState(0),T=()=>V(F=>F+1),_=Np({windowType:n,windowSizeMs:s,slideIntervalMs:o,sessionGapMs:a,watermarkDelayMs:d});h.useEffect(()=>{_.current.setConfig({windowType:n,windowSizeMs:s,slideIntervalMs:o,sessionGapMs:a,watermarkDelayMs:d}),T()},[n,s,o,a,d]);const b=F=>{B(U=>[F,...U].slice(0,6))},x=()=>{const F=_.current;F.onEvent=U=>{if(U.type==="ingest"){const Z=U.event;b(`Ingested event v=${Z.value} at eventTime ${Z.eventTime}ms`+(Z.late?" [LATE]":"")+`. Watermark: ${Number.isFinite(U.watermark)?Math.round(U.watermark):"—"}ms.`)}else if(U.type==="close"){const Z=U.window;b(`Window [${Z.start}..${Z.end}] closed; count=${Z.count}, sum=${Z.sum}. Flushed.`)}else if(U.type==="late-after-close"){const Z=U.event,W=U.window;b(`LATE: event v=${Z.value} eventTime=${Z.eventTime}ms arrived after window [${W.start}..${W.end}] closed at watermark ${Math.round(_.current.watermark)}ms; accumulated onto closed window.`)}}};h.useEffect(()=>{x()},[]),h.useEffect(()=>{if(!C)return;const F=setInterval(()=>{const U=_.current,Z=U.now+500;U.advanceWatermarkTo(Math.max(U.watermark,Z-U.watermarkDelayMs));const W=U.tick(Z);W.flushedWindows.length>0&&R(`Auto-tick: watermark=${Math.round(U.watermark)}ms. Closed ${W.flushedWindows.length} window(s).`),T()},Math.max(80,1e3-$));return()=>clearInterval(F)},[C,$,_]);const f=(F,U)=>{const Z=_.current,W=Number(F);if(!Number.isFinite(W))return;const L=U!==void 0&&U!==""?Number(U):Math.max(Z.now,Z.maxEventTime);if(!Number.isFinite(L))return;const G=Math.max(Z.now,L);Z.now=Math.max(Z.now,G),Z.ingest({value:W,eventTime:L,processingTime:G}),Z.tick(Z.now),R(`Ingested event v=${W} at eventTime ${L}ms. Current watermark: ${Number.isFinite(Z.watermark)?Math.round(Z.watermark):"—"}ms.`),T()},u=()=>{f(p,g)},y=F=>{const U=_.current,Z=U.now+F;U.advanceWatermarkTo(Math.max(U.watermark,Z-U.watermarkDelayMs));const W=U.tick(Z);R(`Advanced processing time to ${Z}ms. Watermark=${Math.round(U.watermark)}ms. Closed ${W.flushedWindows.length} window(s).`),T()},v=()=>{_.current.reset(),x(),B([]),R("Reset. Fresh stream processor."),T()},I=F=>{const U=Mi[F];if(!U)return;t(U.config.windowType),r(U.config.windowSizeMs),i(U.config.slideIntervalMs),l(U.config.sessionGapMs),c(U.config.watermarkDelayMs);const Z=_.current;Z.reset(),Z.setConfig(U.config),x(),B([]);for(const W of U.events)Z.now=Math.max(Z.now,W.processingTime),Z.ingest(W),Z.tick(Z.now);U.advanceTo!==void 0&&(Z.advanceWatermarkTo(Math.max(Z.watermark,U.advanceTo-Z.watermarkDelayMs)),Z.tick(U.advanceTo)),R(`Scenario: ${U.label}. Ingested ${U.events.length} events.`),T()},S=_.current.snapshot(),H=h.useMemo(()=>{let F=Math.max(S.now,S.maxEventTime||0,Number.isFinite(S.watermark)?S.watermark+d:0);for(const U of S.windows)F=Math.max(F,U.end);return F<Ti&&(F=Ti),F=Math.ceil((F+2e3)/1e3)*1e3,{minT:0,maxT:F}},[S,d]),M=900,{minT:k,maxT:P}=H,N=F=>ks+(F-k)/(P-k)*(M-ks-Dr),z=F=>{const U=Math.max(ks,Math.min(M-Dr,F));return k+(U-ks)/(M-ks-Dr)*(P-k)},E=Fn-Ri-80,J=Fn-Ri,Y=h.useMemo(()=>{const F=[];return{placed:[...S.windows].sort((W,L)=>W.start-L.start).map(W=>{for(let L=0;L<F.length;L++){const G=F[L];if(G[G.length-1].end<=W.start)return G.push(W),{w:W,row:L}}return F.push([W]),{w:W,row:F.length-1}}),rowCount:F.length}},[S]),se=F=>{const U=F.currentTarget.getBoundingClientRect(),Z=F.clientX-U.left,W=Math.round(z(Z));if(W<0)return;const L=Math.floor(Math.random()*9)+1;f(L,W)},A=Math.max(1e3,Math.round((P-k)/10/1e3)*1e3||1e3),K=[];for(let F=0;F<=P;F+=A)K.push(F);const Q=[...S.windows].filter(F=>F.state==="closed").sort((F,U)=>F.start-U.start).pop(),X=S.windows.filter(F=>F.state==="open").length,ee=S.windows.filter(F=>F.state==="closed").length;return e.jsxs("div",{className:"sw-root",children:[e.jsx("style",{children:_p}),e.jsxs("div",{className:"sw-panel",children:[e.jsxs("div",{className:"sw-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"sw-title",children:"Stream Windows — DDIA Ch 11"}),e.jsx("div",{className:"sw-subtitle",children:"event-time vs processing-time · watermarks · late data"})]}),e.jsx("div",{className:"sw-title-controls",children:e.jsx("button",{className:"sw-btn sw-btn-ghost",onClick:v,children:"Reset"})})]}),e.jsxs("div",{className:"sw-controls",children:[e.jsxs("label",{className:"sw-label",children:["Window type: ",e.jsxs("select",{value:n,onChange:F=>t(F.target.value),children:[e.jsx("option",{value:"tumbling",children:"tumbling"}),e.jsx("option",{value:"sliding",children:"sliding / hopping"}),e.jsx("option",{value:"session",children:"session"})]})]}),e.jsxs("label",{className:"sw-label",children:["size: ",e.jsx("input",{className:"sw-input",style:{width:70},type:"number",min:"1000",max:"60000",step:"500",value:s,disabled:n==="session",onChange:F=>r(Number(F.target.value))}),e.jsx("span",{className:"sw-unit",children:"ms"})]}),n==="sliding"&&e.jsxs("label",{className:"sw-label",children:["slide: ",e.jsx("input",{className:"sw-input",style:{width:70},type:"number",min:"500",max:"60000",step:"500",value:o,onChange:F=>i(Number(F.target.value))}),e.jsx("span",{className:"sw-unit",children:"ms"})]}),n==="session"&&e.jsxs("label",{className:"sw-label",children:["gap: ",e.jsx("input",{className:"sw-input",style:{width:70},type:"number",min:"500",max:"30000",step:"500",value:a,onChange:F=>l(Number(F.target.value))}),e.jsx("span",{className:"sw-unit",children:"ms"})]}),e.jsxs("label",{className:"sw-label",children:["wm-delay: ",e.jsx("input",{className:"sw-input",style:{width:70},type:"number",min:"0",max:"20000",step:"500",value:d,onChange:F=>c(Number(F.target.value))}),e.jsx("span",{className:"sw-unit",children:"ms"})]})]}),e.jsxs("div",{className:"sw-controls",children:[e.jsx("span",{className:"sw-group-label",children:"Add event:"}),e.jsx("input",{className:"sw-input",style:{width:60},placeholder:"value",value:p,onChange:F=>m(F.target.value)}),e.jsx("input",{className:"sw-input",style:{width:100},placeholder:"eventTime ms",value:g,onChange:F=>w(F.target.value)}),e.jsx("button",{className:"sw-btn",onClick:u,children:"Add"}),e.jsx("span",{className:"sw-sep"}),e.jsx("button",{className:"sw-btn sw-btn-ghost",onClick:()=>y(1e3),children:"+1s"}),e.jsx("button",{className:"sw-btn sw-btn-ghost",onClick:()=>y(5e3),children:"+5s"}),e.jsx("span",{className:"sw-sep"}),e.jsxs("label",{className:"sw-label",children:[e.jsx("input",{type:"checkbox",checked:C,onChange:F=>j(F.target.checked)})," auto-tick"]}),e.jsxs("label",{className:"sw-label",children:["speed: ",e.jsx("input",{type:"range",min:"100",max:"950",step:"50",value:$,onChange:F=>O(Number(F.target.value))})]})]}),e.jsxs("div",{className:"sw-controls",children:[e.jsx("span",{className:"sw-group-label",children:"Scenario:"}),Object.entries(Mi).map(([F,U])=>e.jsx("button",{className:"sw-chip",onClick:()=>I(F),title:U.label,children:U.label},F))]}),e.jsxs("div",{className:"sw-section",children:[e.jsxs("div",{className:"sw-section-label",children:["Timeline",e.jsx("span",{className:"sw-section-hint",children:"click anywhere on the axis to drop an event at that eventTime"})]}),e.jsx("div",{className:"sw-timeline-wrap",children:e.jsxs("svg",{width:M,height:Fn,className:"sw-timeline",onClick:se,children:[e.jsx("line",{x1:ks,y1:J,x2:M-Dr,y2:J,stroke:Xe,strokeWidth:"1"}),K.map(F=>e.jsxs("g",{children:[e.jsx("line",{x1:N(F),y1:J,x2:N(F),y2:J+4,stroke:mt}),e.jsx("text",{x:N(F),y:J+16,fontSize:"10",fill:mt,textAnchor:"middle",fontFamily:"ui-monospace, Menlo, monospace",children:F})]},F)),Y.placed.map(({w:F,row:U},Z)=>{const W=N(F.start),L=N(F.end),G=E-10-(Y.rowCount-1-U)*22,te=F.state==="closed";let re=bp,ie=yp;return te?(re=vp,ie=wp):F.kind==="sliding"?(re=kp,ie=jp):F.kind==="session"&&(re=Sp,ie=$p),e.jsxs("g",{children:[e.jsx("rect",{x:W,y:G-16,width:Math.max(2,L-W),height:18,fill:re,stroke:ie,strokeWidth:"1",rx:"3"}),e.jsxs("text",{x:W+4,y:G-3,fontSize:"10",fill:Pt,fontFamily:"ui-monospace, Menlo, monospace",children:["[",F.start,"..",F.end,"] c=",F.count," sum=",F.sum,te?" ✓":""]})]},`${F.start}-${F.end}-${Z}`)}),S.allEvents.map(F=>{const U=N(F.eventTime),Z=E+22,W=S.windows.some(G=>G.state==="closed"&&G.lateEvents.some(te=>te.id===F.id));let L=ot;return W?L=On:F.late&&(L=_i),e.jsxs("g",{children:[e.jsx("line",{x1:U,y1:Z-8,x2:U,y2:Z+10,stroke:L,strokeWidth:"2"}),e.jsx("circle",{cx:U,cy:Z-10,r:"4",fill:L}),e.jsxs("text",{x:U,y:Z-16,fontSize:"9",fill:L,textAnchor:"middle",fontFamily:"ui-monospace, Menlo, monospace",children:["v=",F.value]}),W&&e.jsx("text",{x:U,y:Z+22,fontSize:"9",fill:On,textAnchor:"middle",fontWeight:"700",children:"LATE"})]},F.id)}),Number.isFinite(S.watermark)&&e.jsxs("g",{children:[e.jsx("line",{x1:N(Math.max(0,S.watermark)),y1:Dn-4,x2:N(Math.max(0,S.watermark)),y2:J,stroke:Ln,strokeDasharray:"4 3",strokeWidth:"1.5"}),e.jsxs("text",{x:N(Math.max(0,S.watermark))+4,y:Dn+8,fontSize:"10",fill:Ln,fontFamily:"ui-monospace, Menlo, monospace",children:["watermark=",Math.round(S.watermark)]})]}),e.jsxs("g",{children:[e.jsx("line",{x1:N(S.now),y1:Dn-4,x2:N(S.now),y2:J,stroke:ot,strokeDasharray:"2 2",strokeWidth:"1"}),e.jsxs("text",{x:N(S.now)+4,y:J-4,fontSize:"10",fill:ot,fontFamily:"ui-monospace, Menlo, monospace",children:["now=",S.now]})]})]})}),e.jsxs("div",{className:"sw-legend",children:[e.jsxs("span",{className:"sw-legend-item",children:[e.jsx("span",{className:"sw-legend-dot",style:{background:ot}}),"in-window"]}),e.jsxs("span",{className:"sw-legend-item",children:[e.jsx("span",{className:"sw-legend-dot",style:{background:_i}}),"late (still open)"]}),e.jsxs("span",{className:"sw-legend-item",children:[e.jsx("span",{className:"sw-legend-dot",style:{background:On}}),"late after close"]}),e.jsxs("span",{className:"sw-legend-item",children:[e.jsx("span",{className:"sw-legend-dot",style:{background:"transparent",border:`1px dashed ${Ln}`}}),"watermark"]}),e.jsxs("span",{className:"sw-legend-item",children:[e.jsx("span",{className:"sw-legend-dot",style:{background:"transparent",border:`1px dashed ${ot}`}}),"processing-time now"]})]})]}),e.jsxs("div",{className:"sw-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"ingested"}),"=",S.eventsIngested]}),e.jsxs("span",{children:[e.jsx("strong",{children:"late"}),"=",S.lateEventCount]}),e.jsxs("span",{children:[e.jsx("strong",{children:"open"}),"=",X]}),e.jsxs("span",{children:[e.jsx("strong",{children:"closed"}),"=",ee]}),e.jsxs("span",{children:[e.jsx("strong",{children:"watermark"}),"=",Number.isFinite(S.watermark)?Math.round(S.watermark):"—","ms"]}),e.jsxs("span",{children:[e.jsx("strong",{children:"now"}),"=",Math.round(S.now),"ms"]}),Q&&e.jsxs("span",{children:[e.jsx("strong",{children:"last closed"}),"=[",Q.start,"..",Q.end,"] c=",Q.count," sum=",Q.sum]})]}),e.jsx("div",{className:"sw-log",children:D.length===0?e.jsx("div",{className:"sw-log-line sw-log-muted",children:"(no events yet — try a scenario or click the timeline)"}):D.map((F,U)=>e.jsx("div",{className:"sw-log-line",children:F},U))}),e.jsxs("div",{className:"sw-status",children:[e.jsx("span",{className:"sw-status-dot"}),e.jsx("span",{className:"sw-status-text",children:q})]})]})]})}
const _p=`
.sw-root {
  color: ${Pt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${os};
}
.sw-panel {
  background: ${gp};
  border: 1px solid ${Xe};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1100px;
  margin: 0 auto;
}
.sw-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Xe};
}
.sw-title {
  font-size: 18px;
  font-weight: 600;
  color: ${Pt};
}
.sw-subtitle {
  font-size: 12px;
  color: ${mt};
  margin-top: 2px;
}
.sw-title-controls { display: flex; gap: 8px; }
.sw-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${Xe};
}
.sw-group-label {
  color: ${mt};
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  margin-right: 2px;
}
.sw-label {
  color: ${mt};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.sw-label select, .sw-input {
  background: ${os};
  border: 1px solid ${Xe};
  color: ${Pt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
}
.sw-input:focus, .sw-label select:focus {
  outline: none;
  border-color: ${ot};
}
.sw-unit {
  color: ${mt};
  font-size: 11px;
  margin-left: 3px;
}
.sw-btn {
  padding: 5px 12px;
  background: ${ot};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.sw-btn:hover { filter: brightness(1.15); }
.sw-btn-ghost {
  background: transparent;
  border: 1px solid ${Xe};
  color: ${Pt};
}
.sw-sep {
  width: 1px;
  height: 22px;
  background: ${Xe};
  margin: 0 4px;
}
.sw-chip {
  padding: 4px 12px;
  background: ${os};
  border: 1px solid ${Xe};
  color: ${Pt};
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.sw-chip:hover {
  border-color: ${ot};
  color: ${ot};
}
.sw-section {
  padding: 12px 0;
  border-bottom: 1px dashed ${Xe};
}
.sw-section:last-of-type { border-bottom: none; }
.sw-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${mt};
  margin-bottom: 8px;
  font-weight: 600;
}
.sw-section-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: ${mt};
  margin-left: 8px;
}
.sw-timeline-wrap {
  overflow-x: auto;
  border: 1px solid ${Xe};
  border-radius: 6px;
  background: ${os};
}
.sw-timeline {
  display: block;
  cursor: crosshair;
}
.sw-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 11px;
  color: ${mt};
}
.sw-legend-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.sw-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.sw-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${os};
  border: 1px solid ${Xe};
  border-radius: 6px;
  font-size: 12px;
  color: ${mt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sw-stats strong { color: ${Pt}; font-weight: 600; margin-right: 2px; }
.sw-log {
  margin-top: 8px;
  padding: 8px 12px;
  background: ${os};
  border: 1px solid ${Xe};
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  max-height: 120px;
  overflow-y: auto;
}
.sw-log-line {
  color: ${Pt};
  padding: 2px 0;
  line-height: 1.4;
  border-bottom: 1px dotted ${Xe};
}
.sw-log-line:last-child { border-bottom: none; }
.sw-log-muted { color: ${mt}; }
.sw-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${os};
  border-left: 3px solid ${ot};
  border-radius: 4px;
  font-size: 12px;
  color: ${Pt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sw-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${ot};
  box-shadow: 0 0 8px ${ot};
  flex-shrink: 0;
}
`;

export default Cp;
export { Cp as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Cp, {}));
  return () => root.unmount();
}
