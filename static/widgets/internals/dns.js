import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Zr({label:n,value:t,sub:s,colorClass:r}){return e.jsxs("div",{className:"boe-card",children:[e.jsx("div",{className:"boe-card-label",children:n}),e.jsx("div",{className:`boe-card-value ${r}`,children:t}),e.jsx("div",{className:"boe-card-sub",children:s})]})}
function io({step:n}){return e.jsxs("div",{className:"boe-step",children:[e.jsx("div",{className:"boe-step-label",children:n.label}),e.jsx("div",{className:"boe-step-math",children:n.math}),e.jsx("div",{className:"boe-step-result",children:n.result})]})}
const ao=["recursive","root","tld","authoritative"],or={tlds:{com:{server:"a.gtld-servers.net"},net:{server:"a.gtld-servers.net"},org:{server:"a.org-servers.net"}},zones:{"example.com":{ns:"ns1.example.com",records:{"api.example.com":{type:"A",value:"93.184.216.34",ttl:300},"www.example.com":{type:"A",value:"93.184.216.35",ttl:300},"example.com":{type:"A",value:"93.184.216.33",ttl:300}},negativeTtl:60}}};
function eu(n){const t=n.replace(/\.$/,"").split(".");if(t.length<2)return{tld:null,zone:null,full:n};const s=t[t.length-1],r=t.slice(-2).join(".");return{tld:s,zone:r,full:n}}
class tu{constructor({defaultTtl:t=300}={}){this.defaultTtl=t,this.clock=0,this.caches={recursive:new Map,root:new Map,tld:new Map,authoritative:new Map},this.queryCount=0}tick(t=1e3){this.clock+=t;for(const s of ao){const r=this.caches[s];for(const[o,i]of r)this.clock-i.insertedAt>=i.ttlMs&&r.delete(o)}}clearCache(t="all"){if(t==="all"){for(const s of ao)this.caches[s].clear();return}this.caches[t]&&this.caches[t].clear()}snapshot(){const t={};for(const s of ao){t[s]=[];for(const[r,o]of this.caches[s]){const i=this.clock-o.insertedAt,a=Math.max(0,Math.round((o.ttlMs-i)/1e3));t[s].push({name:r,value:o.negative?"NXDOMAIN":`${o.type} ${o.value}`,ttlRemaining:a,ttlTotal:Math.round(o.ttlMs/1e3),negative:!!o.negative})}}return{clock:this.clock,caches:t,queryCount:this.queryCount}}_cache(t,s,r,o){this.caches[t].set(s,{type:r.type||"A",value:r.value,negative:!!r.negative,ttlMs:o*1e3,insertedAt:this.clock})}_getCached(t,s){const r=this.caches[t],o=r.get(s);if(!o)return null;const i=this.clock-o.insertedAt;return i>=o.ttlMs?(r.delete(s),null):{...o,ttlRemaining:Math.max(0,Math.round((o.ttlMs-i)/1e3))}}query(t,{fromClient:s=!0}={}){this.queryCount++;const r=[],{tld:o,zone:i}=eu(t);s&&r.push({type:"send",from:"client",to:"recursive",question:`${t} A`});const a=this._getCached("recursive",t);if(a){r.push({type:"cache-check",at:"recursive",result:"hit",ttlRemaining:a.ttlRemaining});const m=a.negative?`${t} NXDOMAIN`:`${t} ${a.type} ${a.value} TTL=${a.ttlRemaining}`;return r.push({type:"answer",from:"recursive",to:"client",record:m,cached:!0,negative:!!a.negative,ttlRemaining:a.ttlRemaining}),r}r.push({type:"cache-check",at:"recursive",result:"miss"});const l=this._getCached("root",o||".");if(l)r.push({type:"cache-check",at:"root",result:"hit",ttlRemaining:l.ttlRemaining});else{r.push({type:"send",from:"recursive",to:"root",question:`${t} A`});const m=or.tlds[o];if(!m)return r.push({type:"nxdomain",from:"root",to:"recursive",reason:`unknown TLD .${o}`}),this._cache("recursive",t,{negative:!0},or.zones["example.com"].negativeTtl),r.push({type:"cached",at:"recursive",record:`${t} NXDOMAIN`,ttl:or.zones["example.com"].negativeTtl,negative:!0}),r.push({type:"answer",from:"recursive",to:"client",record:`${t} NXDOMAIN`,negative:!0}),r;r.push({type:"referral",from:"root",to:"recursive",answer:`ask .${o} at ${m.server}`,nextLevel:"tld"}),this._cache("root",o,{type:"NS",value:m.server},3600),r.push({type:"cached",at:"root",record:`.${o} NS ${m.server}`,ttl:3600})}const d=this._getCached("tld",i);if(d)r.push({type:"cache-check",at:"tld",result:"hit",ttlRemaining:d.ttlRemaining});else{r.push({type:"send",from:"recursive",to:"tld",question:`${t} A`});const m=or.zones[i];if(!m){r.push({type:"nxdomain",from:"tld",to:"recursive",reason:`no delegation for ${i}`});const g=60;return this._cache("recursive",t,{negative:!0},g),r.push({type:"cached",at:"recursive",record:`${t} NXDOMAIN`,ttl:g,negative:!0}),r.push({type:"answer",from:"recursive",to:"client",record:`${t} NXDOMAIN`,negative:!0}),r}r.push({type:"referral",from:"tld",to:"recursive",answer:`ask ${i} at ${m.ns}`,nextLevel:"authoritative"}),this._cache("tld",i,{type:"NS",value:m.ns},1800),r.push({type:"cached",at:"tld",record:`${i} NS ${m.ns}`,ttl:1800})}r.push({type:"send",from:"recursive",to:"authoritative",question:`${t} A`});const c=or.zones[i],p=c&&c.records[t];if(!p){const m=c&&c.negativeTtl||60;return r.push({type:"nxdomain",from:"authoritative",to:"recursive",reason:`${t} not in zone ${i}`}),this._cache("authoritative",t,{negative:!0},m),r.push({type:"cached",at:"authoritative",record:`${t} NXDOMAIN`,ttl:m,negative:!0}),this._cache("recursive",t,{negative:!0},m),r.push({type:"cached",at:"recursive",record:`${t} NXDOMAIN`,ttl:m,negative:!0}),r.push({type:"answer",from:"recursive",to:"client",record:`${t} NXDOMAIN`,negative:!0}),r}return r.push({type:"answer",from:"authoritative",to:"recursive",record:`${t} ${p.type} ${p.value} TTL=${p.ttl}`,ttl:p.ttl}),this._cache("authoritative",t,{type:p.type,value:p.value},p.ttl),r.push({type:"cached",at:"authoritative",record:`${t} ${p.type} ${p.value}`,ttl:p.ttl}),this._cache("recursive",t,{type:p.type,value:p.value},p.ttl),r.push({type:"cached",at:"recursive",record:`${t} ${p.type} ${p.value}`,ttl:p.ttl}),r.push({type:"answer",from:"recursive",to:"client",record:`${t} ${p.type} ${p.value} TTL=${p.ttl}`,ttl:p.ttl}),r}}
const ea=[{id:"first-query",label:"First query (cold cache)",domain:"api.example.com",description:"Cold cache. Recursive resolver walks root -> .com -> example.com.",setup:n=>n.clearCache("all")},{id:"cache-hit",label:"Cache hit (repeat query)",domain:"api.example.com",description:"Run after first-query. Recursive answers from cache without asking anyone.",setup:n=>{n.clearCache("all"),n.query("api.example.com")}},{id:"cache-expired",label:"Cache expired (after TTL)",domain:"api.example.com",description:"Prime the cache, advance past TTL, then query again: full walk repeats.",setup:n=>{n.clearCache("all"),n.query("api.example.com"),n.tick(600*1e3)}},{id:"negative-cache",label:"NXDOMAIN (negative caching)",domain:"nxdomain.example.com",description:"Authoritative returns NXDOMAIN. Recursive negatively caches for SOA minimum.",setup:n=>n.clearCache("all")}],Wa=920,ta=360,su=5,un=Wa/su,Et=70,as=30,sa=400,mr=[{id:"client",label:"Client",sub:"stub resolver",color:"#4a8fd8"},{id:"recursive",label:"Recursive",sub:"8.8.8.8",color:"#f5c542"},{id:"root",label:"Root",sub:".",color:"#a15cff"},{id:"tld",label:"TLD",sub:".com",color:"#d27c2a"},{id:"authoritative",label:"Authoritative",sub:"example.com",color:"#3fbf7f"}],ru=Object.fromEntries(mr.map((n,t)=>[n.id,t])),nu=["recursive","root","tld","authoritative"];
function Ns(n){const t=ru[n];return un*t+un/2}
function ou(n){switch(n.type){case"send":return`${n.from} -> ${n.to}: ${n.question}`;case"cache-check":return n.result==="hit"?`${n.at}: cache HIT (TTL ${n.ttlRemaining}s remaining). Returning immediately.`:`${n.at}: cache MISS. Walking the hierarchy.`;case"referral":return`${n.from}: ${n.answer}`;case"answer":return n.cached?`Answer -> client (from recursive cache): ${n.record}`:`${n.from} -> ${n.to}: ${n.record}`;case"cached":return`${n.at} cached: ${n.record} (TTL ${n.ttl}s)`;case"nxdomain":return`${n.from}: NXDOMAIN (${n.reason})`;default:return JSON.stringify(n)}}
function iu(n){const t=[];let s=0;for(const r of n)if(r.type==="send"||r.type==="answer"||r.type==="referral"){const o=(r.type==="referral",r.from),i=r.type==="referral"?"recursive":r.to;t.push({kind:"msg",from:o,to:i,label:r.type==="send"?r.question:r.type==="referral"?r.answer:r.record,ev:r,start:s,duration:sa}),s+=sa}else t.push({kind:"beat",ev:r,start:s,duration:220}),s+=220;return{frames:t,total:s}}
const Gt={send:"#4a8fd8",referral:"#a15cff",answer:"#3fbf7f",negative:"#ff6b6b"},ra=`
.dns-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.dns-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.dns-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.dns-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.dns-toolbar input[type="text"],
.dns-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #2a3038;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.dns-toolbar input[type="text"] { width: 180px; }
.dns-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.dns-toolbar button:hover { background: #232a33; }
.dns-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.dns-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.dns-toolbar button.primary:hover { background: #3467b0; }
.dns-toolbar button.danger {
  background: #8b2a2a;
  border-color: #a03333;
}
.dns-toolbar button.danger:hover { background: #a03434; }
.dns-toolbar button.accent {
  background: #6c3ba0;
  border-color: #7f4cb0;
}
.dns-toolbar button.accent:hover { background: #7a4ab0; }
.dns-toolbar .spacer { flex: 1; }
.dns-toolbar label {
  font-size: 12px;
  color: #8a95a3;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.dns-main {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.dns-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
}
.dns-cache-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.dns-cache-col {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 6px 8px;
  min-height: 90px;
  font-size: 11px;
}
.dns-cache-col .hdr {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dns-cache-col .hdr .badge {
  font-size: 9px;
  background: #2a3038;
  color: #cfd6e0;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.04em;
}
.dns-cache-col .empty {
  color: #555;
  font-style: italic;
  font-size: 11px;
}
.dns-cache-entry {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: #cfd6e0;
  padding: 2px 0;
  border-bottom: 1px dotted #222831;
}
.dns-cache-entry:last-child { border-bottom: none; }
.dns-cache-entry .name { color: #e6e6e6; }
.dns-cache-entry .val { color: #9dd8b8; }
.dns-cache-entry.negative .val { color: #ff9a9a; }
.dns-cache-entry .ttl {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  color: #8a95a3;
  font-size: 9px;
}
.dns-cache-entry .ttl-bar {
  flex: 1;
  height: 3px;
  background: #1a1f26;
  border-radius: 2px;
  overflow: hidden;
}
.dns-cache-entry .ttl-fill {
  height: 100%;
  background: #3fbf7f;
  transition: width 0.3s linear;
}
.dns-cache-entry.negative .ttl-fill { background: #ff6b6b; }
.dns-cache-entry.expiring .ttl-fill { background: #f5c542; }
.dns-status {
  margin-top: 10px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 20px;
  color: #cfd6e0;
  white-space: pre-wrap;
}
.dns-status.error { color: #ff9a9a; }
.dns-status.hit   { color: #9dd8b8; }
.dns-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.dns-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.dns-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  color: #cfd6e0;
  line-height: 1.5;
}
.dns-footer b { color: #f5c542; }
.dns-footer code {
  background: #0a0e13;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}
.dns-widget svg text { user-select: none; }
`;
function au(){const n=h.useRef(null),[t,s]=h.useState(0),[r,o]=h.useState(null),[i,a]=h.useState("api.example.com"),[l,d]=h.useState(""),[c,p]=h.useState([]),[m,g]=h.useState(0),[w,C]=h.useState(0),[j,$]=h.useState("Idle. Type a domain and press Query, or pick a preset scenario."),[O,q]=h.useState("idle"),[R,D]=h.useState(!1);h.useEffect(()=>{n.current=new tu({defaultTtl:300}),o(n.current.snapshot()),$("Idle. Type a domain and press Query, or pick a preset scenario."),q("idle"),p([]),D(!1)},[t]),h.useEffect(()=>{let u;const y=()=>{C(performance.now()),u=requestAnimationFrame(y)};return u=requestAnimationFrame(y),()=>cancelAnimationFrame(u)},[]),h.useEffect(()=>{if(c.length===0)return;const u=w-m;let y=c[0];for(const S of c)if(S.start<=u)y=S;else break;const v=ou(y.ev);$(v),y.ev.type==="cache-check"&&y.ev.result==="hit"?(q("hit"),D(!0)):y.ev.type==="nxdomain"||y.ev.type==="answer"&&y.ev.negative?q("error"):q("info");const I=c[c.length-1];u>=I.start+I.duration+50&&(o(n.current.snapshot()),p([]),setTimeout(()=>D(!1),1200))},[w,c,m]);const B=h.useCallback(u=>{const y=n.current;if(!y)return;const v=y.query(u),{frames:I}=iu(v);o(y.snapshot()),p(I),g(performance.now()),D(!1)},[]),V=h.useCallback(()=>{const u=i.trim();u&&B(u)},[i,B]),T=h.useCallback(u=>{if(d(u),!u)return;const y=ea.find(I=>I.id===u);if(!y)return;const v=n.current;v&&(y.setup(v),a(y.domain),o(v.snapshot()),setTimeout(()=>B(y.domain),60))},[B]),_=h.useCallback(()=>{const u=n.current;u&&(u.clearCache("recursive"),o(u.snapshot()),$("Cleared recursive resolver cache."),q("info"))},[]),b=h.useCallback(()=>{const u=n.current;u&&(u.tick(600*1e3),o(u.snapshot()),$("Advanced simulated time by 10 minutes. Expired entries dropped."),q("info"))},[]),x=r?r.caches:null,f=h.useMemo(()=>{if(c.length===0)return[];const u=w-m,y=[];for(const v of c){if(v.kind!=="msg")continue;const I=u-v.start;if(I<0||I>v.duration)continue;const S=Ns(v.from),H=Ns(v.to),M=Math.max(0,Math.min(1,I/v.duration)),k=S+(H-S)*M,N=Et+Math.sin(M*Math.PI)*(v.from===v.to?0:-24)+0,z=v.ev.type==="send"?Gt.send:v.ev.type==="referral"?Gt.referral:v.ev.negative?Gt.negative:Gt.answer;y.push({id:v.start,x:k,y:N,fromX:S,toX:H,label:v.label,color:z,type:v.ev.type})}return y},[c,m,w]);return r?e.jsxs("div",{className:"dns-widget",children:[e.jsx("style",{children:ra}),e.jsxs("h2",{children:[e.jsx("span",{children:"DNS Resolution — System Design Primer"}),e.jsx("span",{style:{display:"flex",gap:8},children:e.jsx("button",{onClick:()=>s(u=>u+1),children:"Reset"})})]}),e.jsx("p",{className:"sub",children:"Recursive resolution walk for a domain. Caches at each level are TTL-bound; a repeat query short-circuits at the recursive resolver."}),e.jsxs("div",{className:"dns-toolbar",children:[e.jsxs("label",{children:["domain:",e.jsx("input",{type:"text",value:i,onChange:u=>a(u.target.value),onKeyDown:u=>u.key==="Enter"&&V(),placeholder:"api.example.com"})]}),e.jsx("button",{className:"primary",onClick:V,disabled:c.length>0,children:"Query"}),e.jsxs("label",{children:["preset:",e.jsxs("select",{value:l,onChange:u=>T(u.target.value),disabled:c.length>0,children:[e.jsx("option",{value:"",children:"(pick a scenario...)"}),ea.map(u=>e.jsx("option",{value:u.id,children:u.label},u.id))]})]}),e.jsx("span",{className:"spacer"}),e.jsx("button",{className:"danger",onClick:_,children:"Clear recursive cache"}),e.jsx("button",{className:"accent",onClick:b,children:"Advance 10 min"}),e.jsxs("span",{style:{fontSize:12,color:"#8a95a3",fontFamily:"ui-monospace, Menlo, monospace",marginLeft:4},children:["sim t = ",(r.clock/1e3).toFixed(1),"s · queries:"," ",r.queryCount]})]}),e.jsxs("div",{className:"dns-main",children:[e.jsxs("div",{className:"dns-canvas-wrap",children:[e.jsxs("svg",{width:Wa,height:ta,children:[e.jsx("defs",{children:e.jsx("marker",{id:"dnsarrow",markerWidth:"6",markerHeight:"6",refX:"5",refY:"3",orient:"auto",children:e.jsx("path",{d:"M0,0 L6,3 L0,6 z",fill:"#3a4250"})})}),mr.map((u,y)=>e.jsx("line",{x1:un*y,y1:0,x2:un*y,y2:ta,stroke:"#1a1f26",strokeWidth:"1"},`div-${y}`)),mr.map(u=>{const y=Ns(u.id);return e.jsxs("g",{children:[e.jsx("text",{x:y,y:22,textAnchor:"middle",fill:"#cfd6e0",fontSize:"13",fontWeight:"700",children:u.label}),e.jsx("text",{x:y,y:38,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:u.sub})]},`hdr-${u.id}`)}),mr.map(u=>{const y=Ns(u.id);return e.jsxs("g",{children:[e.jsx("circle",{cx:y,cy:Et,r:as,fill:u.color,stroke:"#111",strokeWidth:"2"}),e.jsx("text",{x:y,y:Et+4,textAnchor:"middle",fill:"#111",fontSize:"11",fontWeight:"700",children:u.id==="authoritative"?"AUTH":u.id.slice(0,4).toUpperCase()}),u.id==="recursive"&&R&&e.jsxs("g",{children:[e.jsx("rect",{x:y-22,y:Et-as-22,width:"44",height:"16",rx:"3",fill:"#1f5c3a",stroke:"#2f7b50"}),e.jsx("text",{x:y,y:Et-as-10,textAnchor:"middle",fill:"#9dd8b8",fontSize:"10",fontWeight:"700",children:"CACHE HIT"})]})]},`node-${u.id}`)}),f.map(u=>{const y=u.type==="referral"||u.type==="answer";return e.jsxs("g",{children:[e.jsx("line",{x1:u.fromX,y1:Et,x2:u.toX,y2:Et,stroke:u.color,strokeOpacity:"0.18",strokeWidth:"1",strokeDasharray:y?"3 3":void 0}),e.jsx("circle",{cx:u.x,cy:u.y,r:y?4.5:6,fill:u.color,opacity:"0.95",children:e.jsx("title",{children:u.label})}),e.jsx("rect",{x:u.x-Math.min(180,u.label.length*3.4),y:u.y-30,width:Math.min(360,u.label.length*6.8),height:"18",rx:"3",fill:"#0a0e13",stroke:u.color,strokeOpacity:"0.6",opacity:"0.92"}),e.jsx("text",{x:u.x,y:u.y-17,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:u.label.length>46?u.label.slice(0,44)+"...":u.label})]},`${u.id}-${u.label}`)}),e.jsx("line",{x1:Ns("client")+as,y1:Et+as+10,x2:Ns("authoritative")-as,y2:Et+as+10,stroke:"#1e252e",strokeWidth:"1"})]}),e.jsxs("div",{className:"dns-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Gt.send}})," ","query"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Gt.referral}})," ","referral"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Gt.answer}})," ","answer"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:Gt.negative}})," ","NXDOMAIN"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#1f5c3a"}})," cache hit"]})]})]}),e.jsxs("div",{className:"dns-cache-row",children:[e.jsxs("div",{className:"dns-cache-col",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Client"}),e.jsx("span",{className:"badge",children:"stub"})]}),e.jsx("div",{className:"empty",children:"(no caching here — browser usually defers to OS/stub resolver)"})]}),nu.map(u=>{const y=mr.find(I=>I.id===u),v=x[u];return e.jsxs("div",{className:"dns-cache-col",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{style:{color:y.color},children:y.label}),e.jsxs("span",{className:"badge",children:[v.length," ",v.length===1?"rec":"recs"]})]}),v.length===0&&e.jsx("div",{className:"empty",children:"(empty)"}),v.map(I=>{const S=I.ttlTotal>0?Math.max(0,I.ttlRemaining/I.ttlTotal*100):0,H=I.ttlRemaining>0&&S<25;return e.jsxs("div",{className:`dns-cache-entry${I.negative?" negative":""}${H?" expiring":""}`,style:{opacity:I.ttlRemaining===0?.3:1},children:[e.jsxs("div",{children:[e.jsx("span",{className:"name",children:I.name})," ",e.jsx("span",{className:"val",children:I.value})]}),e.jsxs("div",{className:"ttl",children:[e.jsxs("span",{children:[I.ttlRemaining,"s"]}),e.jsx("div",{className:"ttl-bar",children:e.jsx("div",{className:"ttl-fill",style:{width:`${S}%`}})})]})]},I.name)})]},u)})]})]}),e.jsx("div",{className:`dns-status ${O==="error"?"error":O==="hit"?"hit":""}`,children:j}),e.jsxs("div",{className:"dns-footer",children:[e.jsxs("div",{children:[e.jsx("b",{children:"Recursive vs iterative."})," The ",e.jsx("i",{children:"recursive resolver"})," (e.g."," ",e.jsx("code",{children:"8.8.8.8"}),", ",e.jsx("code",{children:"1.1.1.1"}),", your ISP) does the real walking. Each authoritative server only answers ",e.jsx("i",{children:"iteratively"}),`: "I don't know, but ask them." That keeps root/TLD servers cheap and globally cacheable.`]}),e.jsxs("div",{style:{marginTop:6},children:[e.jsx("b",{children:"TTLs."})," Every record carries a time-to-live. Short TTLs let you move traffic quickly (failover, blue/green); long TTLs reduce load and latency. Resolvers must honor the TTL they're handed."]}),e.jsxs("div",{style:{marginTop:6},children:[e.jsx("b",{children:"Negative caching (RFC 2308)."})," When authoritative returns NXDOMAIN, the resolver caches the absence for the zone's SOA minimum so a typo doesn't re-hit the auth servers repeatedly."]}),e.jsxs("div",{style:{marginTop:6},children:[e.jsx("b",{children:"DNSSEC."})," Integrity via signed RRsets and a chain of trust from the root KSK down through DS records at each delegation. It does"," ",e.jsx("i",{children:"not"})," encrypt; that's DoT/DoH. Validating resolvers will discard answers that fail signature checks."]})]})]}):e.jsxs("div",{className:"dns-widget",children:[e.jsx("style",{children:ra}),e.jsx("h2",{children:"DNS Resolution — System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]})}

export default au;
export { au as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(au, {}));
  return () => root.unmount();
}
