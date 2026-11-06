import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Ie(n=8){const t="0123456789abcdef";let s="";for(let r=0;r<n*2;r++)s+=t[Math.floor(Math.random()*16)];return s}
const ir=[{id:"tls12-fresh",version:"1.2",resume:!1,label:"TLS 1.2 fresh — 2 RTT",description:"Classic TLS 1.2 full handshake. Two round trips of negotiation before any application byte can flow."},{id:"tls13-fresh",version:"1.3",resume:!1,label:"TLS 1.3 fresh — 1 RTT",description:"TLS 1.3 collapses the handshake: ClientHello carries a key_share, server replies with its key_share + Certificate + Finished (all encrypted). One RTT to first byte."},{id:"tls13-0rtt",version:"1.3",resume:!0,label:"TLS 1.3 resume — 0 RTT",description:"Session resumption via pre-shared key. Client sends early application data in the very first flight alongside ClientHello. Zero round trips before data — with a replay caveat."}];
class gu{constructor({version:t="1.2",resume:s=!1,rttMs:r=50}={}){this.version=t,this.resume=!!s,this.rttMs=r,this.clientRandom=Ie(16),this.serverRandom=Ie(16),this.sessionId=Ie(8),this.pskId=s?"psk_"+Ie(4):null,this.currentStep=0,this.steps=this._buildSteps(),this.appDataReadyAt=this._computeAppDataReadyAt()}start(){return this.currentStep=0,this.snapshot()}advance(){return this.currentStep<this.steps.length&&this.currentStep++,this.snapshot()}canStep(){return this.currentStep<this.steps.length}reset(){return this.clientRandom=Ie(16),this.serverRandom=Ie(16),this.sessionId=Ie(8),this.pskId=this.resume?"psk_"+Ie(4):null,this.currentStep=0,this.steps=this._buildSteps(),this.appDataReadyAt=this._computeAppDataReadyAt(),this.snapshot()}setVersion(t){this.version=t,t!=="1.3"&&(this.resume=!1),this.reset()}setResume(t){this.resume=!!t,this.resume&&(this.version="1.3"),this.reset()}snapshot(){return{version:this.version,resume:this.resume,rttMs:this.rttMs,currentStep:this.currentStep,totalSteps:this.steps.length,steps:this.steps,current:this.steps[this.currentStep-1]||null,appDataReadyAt:this.appDataReadyAt,clientRandom:this.clientRandom,serverRandom:this.serverRandom,sessionId:this.sessionId,pskId:this.pskId}}_buildSteps(){return this.version==="1.2"?this._buildTls12():this.version==="1.3"&&this.resume?this._buildTls13Resume():this._buildTls13Fresh()}_buildTls12(){const t=[],s=r=>t.push({id:t.length+1,...r});return s({from:"client",to:"server",label:"ClientHello",payload:{version:"TLS 1.2",client_random:this.clientRandom,session_id:"(empty)",cipher_suites:["ECDHE-RSA-AES128-GCM-SHA256","ECDHE-RSA-AES256-GCM-SHA384","RSA-AES128-SHA"],compression:["null"],extensions:["server_name","signature_algorithms","supported_groups"]},encrypted:!1,rtt:0,phase:"handshake",note:"Client advertises supported versions, ciphers, random nonce. No key_share yet — 1.2 does key exchange in the next flight."}),s({from:"server",to:"client",label:"ServerHello, Certificate, ServerKeyExchange, ServerHelloDone",payload:{server_hello:{version:"TLS 1.2",server_random:this.serverRandom,session_id:this.sessionId,cipher_suite:"ECDHE-RSA-AES128-GCM-SHA256",compression:"null"},certificate:"[server cert chain, ~3KB]",server_key_exchange:{curve:"secp256r1",server_pub:"0x04..."+Ie(6),signature:"RSA-PKCS1-v1_5 over (client_random || server_random || params)"},server_hello_done:!0},encrypted:!1,rtt:1,rttMarker:!0,phase:"handshake",note:"Server picks a cipher, sends its cert and ephemeral ECDH public key, signs it with the cert key. Still plaintext."}),s({from:"client",to:"server",label:"ClientKeyExchange, ChangeCipherSpec, Finished",payload:{client_key_exchange:{client_pub:"0x04..."+Ie(6)},change_cipher_spec:"[1 byte: 0x01]",finished:{verify_data:Ie(6)+" (encrypted)",note:"HMAC of the handshake transcript under the derived master_secret"}},encrypted:!0,partiallyEncrypted:!0,rtt:1,phase:"handshake",note:"Client derives pre_master_secret from ECDH, then master_secret. ChangeCipherSpec flips the write cipher; Finished is the first encrypted record."}),s({from:"server",to:"client",label:"ChangeCipherSpec, Finished",payload:{change_cipher_spec:"[1 byte: 0x01]",finished:{verify_data:Ie(6)+" (encrypted)",note:"Server proves it derived the same keys and saw the same transcript"}},encrypted:!0,partiallyEncrypted:!0,rtt:2,rttMarker:!0,phase:"handshake",note:"Server confirms keys. Handshake done after 2 RTTs."}),s({from:"client",to:"server",label:"Application Data (HTTP request)",payload:{record_type:"application_data (23)",plaintext_preview:"GET / HTTP/1.1\\r\\nHost: example.com\\r\\n...",cipher:"AES-128-GCM"},encrypted:!0,rtt:2,phase:"appdata",note:"First application byte. Reached after 2 full round trips."}),t}_buildTls13Fresh(){const t=[],s=r=>t.push({id:t.length+1,...r});return s({from:"client",to:"server",label:"ClientHello (+ key_share, signature_algorithms, supported_versions)",payload:{version:"TLS 1.3 (via supported_versions extension)",legacy_version:"TLS 1.2",client_random:this.clientRandom,cipher_suites:["TLS_AES_128_GCM_SHA256","TLS_AES_256_GCM_SHA384","TLS_CHACHA20_POLY1305_SHA256"],extensions:{supported_versions:["TLS 1.3"],supported_groups:["x25519","secp256r1"],key_share:{group:"x25519",client_pub:"0x"+Ie(16)},signature_algorithms:["ecdsa_secp256r1_sha256","rsa_pss_rsae_sha256"]}},encrypted:!1,rtt:0,phase:"handshake",note:"Client speculatively sends a key_share up front. Saves an RTT if the server accepts the group."}),s({from:"server",to:"client",label:"ServerHello + {EncryptedExtensions, Certificate, CertificateVerify, Finished}",payload:{server_hello:{version:"TLS 1.3 (indicated via extension)",server_random:this.serverRandom,cipher_suite:"TLS_AES_128_GCM_SHA256",key_share:{group:"x25519",server_pub:"0x"+Ie(16)}},encrypted_extensions:"{ server_name_ack, alpn: h2 }  [encrypted]",certificate:"[server cert chain, encrypted]",certificate_verify:"ECDSA signature over transcript  [encrypted]",finished:"HMAC of transcript  [encrypted]"},encrypted:!0,partiallyEncrypted:!0,rtt:1,rttMarker:!0,phase:"handshake",note:"After ServerHello the handshake secret is derived. Everything else in this flight is already encrypted under handshake_traffic_secret."}),s({from:"client",to:"server",label:"Finished + Application Data",payload:{finished:"HMAC of transcript  [encrypted]",application_data:{record_type:"application_data (23)",plaintext_preview:"GET / HTTP/1.1\\r\\nHost: example.com\\r\\n...",cipher:"AES-128-GCM under application_traffic_secret"}},encrypted:!0,rtt:1,phase:"appdata",note:"Client can piggyback the first HTTP request onto its Finished. 1 RTT to first byte."}),s({from:"server",to:"client",label:"Application Data (response)",payload:{record_type:"application_data (23)",plaintext_preview:"HTTP/1.1 200 OK\\r\\n...",cipher:"AES-128-GCM"},encrypted:!0,rtt:2,phase:"appdata",note:"Server reply. Round trip 2 delivers the response body."}),t}_buildTls13Resume(){const t=[],s=r=>t.push({id:t.length+1,...r});return s({from:"client",to:"server",label:"ClientHello + early_data + 0-RTT Application Data",payload:{version:"TLS 1.3",client_random:this.clientRandom,cipher_suites:["TLS_AES_128_GCM_SHA256"],extensions:{supported_versions:["TLS 1.3"],key_share:{group:"x25519",client_pub:"0x"+Ie(16)},pre_shared_key:{identities:[this.pskId],binders:["HMAC(early_binder_key, transcript)"]},psk_key_exchange_modes:["psk_dhe_ke"],early_data:!0},early_application_data:{record_type:"application_data (23)",plaintext_preview:"GET / HTTP/1.1\\r\\nHost: example.com\\r\\n...",cipher:"AES-128-GCM under client_early_traffic_secret"}},encrypted:!0,partiallyEncrypted:!0,rtt:0,phase:"appdata",note:"0-RTT: client already has a PSK from a previous session. It derives an early-traffic key and sends the first HTTP request in the very first TCP segment."}),s({from:"server",to:"client",label:"ServerHello + {EE (early_data accepted), Finished} + Application Data",payload:{server_hello:{version:"TLS 1.3",server_random:this.serverRandom,cipher_suite:"TLS_AES_128_GCM_SHA256",key_share:{group:"x25519",server_pub:"0x"+Ie(16)},pre_shared_key:{selected_identity:0}},encrypted_extensions:"{ early_data: accepted, alpn: h2 }  [encrypted]",finished:"HMAC of transcript  [encrypted]",application_data:{record_type:"application_data (23)",plaintext_preview:"HTTP/1.1 200 OK\\r\\n...",cipher:"AES-128-GCM"}},encrypted:!0,partiallyEncrypted:!0,rtt:1,rttMarker:!0,phase:"appdata",note:"Server accepts the PSK, confirms early_data, and replies with the HTTP response in the same flight. Client got its response after just 1 RTT — but sent data at 0-RTT."}),s({from:"client",to:"server",label:"EndOfEarlyData + Finished",payload:{end_of_early_data:"[record, encrypted under early key]",finished:"HMAC of transcript  [encrypted under handshake key]"},encrypted:!0,rtt:1,phase:"handshake",note:"Client signals end of early data and authenticates the handshake. Subsequent traffic uses full handshake keys."}),t}_computeAppDataReadyAt(){return this.version==="1.2"?2*this.rttMs:this.version==="1.3"&&this.resume?0:1*this.rttMs}}
const Yt=780,en=96,tn=56,aa=120,sn={client:"#4a8fd8",server:"#3a9c6a"},lo={client:"Client",server:"Server"},bu={client:"Browser / TLS peer",server:"HTTPS origin"},la=`
.tls-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 1000px;
}
.tls-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.tls-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.tls-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.tls-toolbar button,
.tls-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.tls-toolbar button:hover { background: #232a33; }
.tls-toolbar button.primary { background: #2c5aa0; border-color: #3c6ab0; }
.tls-toolbar button.primary:hover { background: #3467b0; }
.tls-toolbar button.active { background: #3a4250; border-color: #5a6878; }
.tls-toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
.tls-toolbar .group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 2px 6px;
  border-left: 1px solid #2a3038;
  border-right: 1px solid #2a3038;
}
.tls-toolbar .group-label { font-size: 11px; color: #8a95a3; }
.tls-toolbar .spacer { flex: 1; }

.tls-scenario-tabs {
  display: inline-flex;
  gap: 4px;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
}
.tls-scenario-tabs button {
  border: none;
  border-radius: 0;
  padding: 4px 10px;
  background: #1a1f26;
  color: #cfd6e0;
}
.tls-scenario-tabs button.on { background: #2c5aa0; color: #fff; }

.tls-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
}
.tls-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
  overflow: auto;
  max-height: 720px;
}
.tls-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tls-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
}
.tls-card .hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-weight: 600;
}
.tls-card .meta { color: #8a95a3; font-size: 11px; margin-bottom: 4px; }
.tls-card pre {
  margin: 4px 0 0 0;
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 3px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #cfd6e0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tls-enc-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tls-enc-chip.plain { background: #2a3038; color: #8a95a3; }
.tls-enc-chip.mixed { background: #3a4a2a; color: #cfe0a8; }
.tls-enc-chip.enc { background: #1f5c3a; color: #b6f0c4; }

.tls-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #cfd6e0;
}
.tls-footer h3 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #f5c542;
}
.tls-footer ul { margin: 4px 0 0 0; padding-left: 18px; }
.tls-footer li { margin: 2px 0; }
.tls-footer .muted { color: #8a95a3; }
.tls-footer code {
  background: #0a0e13;
  border: 1px solid #2a3038;
  padding: 0 3px;
  border-radius: 2px;
  font-size: 11px;
}

.tls-status {
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
.tls-status.good { color: #6be0a2; }
.tls-status.warn { color: #f5c542; }

.tls-compare {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}
.tls-compare .col {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
}
.tls-compare .col.active { border-color: #f5c542; }
.tls-compare .col .title { font-weight: 600; margin-bottom: 4px; color: #cfd6e0; }
.tls-compare .bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.tls-compare .bar {
  height: 10px;
  border-radius: 2px;
  flex: 1;
  background: linear-gradient(90deg, #4a8fd8, #3a9c6a);
  position: relative;
}
.tls-compare .bar .track {
  position: absolute;
  inset: 0;
  background: #2a3038;
  z-index: -1;
  border-radius: 2px;
}
.tls-compare .meta { color: #8a95a3; font-size: 11px; }
.tls-compare .zero-rtt-warn { color: #f5c542; font-size: 11px; margin-top: 4px; }

.tls-step-row { cursor: default; }
.tls-step-row.current .tls-step-bg { fill: #18222e; }

.tls-widget svg text { user-select: none; }
@keyframes tls-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.tls-glow { animation: tls-glow 1.4s ease-in-out infinite; }
@keyframes tls-march {
  to { stroke-dashoffset: -20; }
}
.tls-march { stroke-dasharray: 6 4; animation: tls-march 0.7s linear infinite; }
`;
function yu(n){if(!n)return"";try{return JSON.stringify(n,null,2)}catch{return String(n)}}
function wr(n){return n?n.partiallyEncrypted?"mixed":n.encrypted?"enc":"plain":"plain"}
function ca(n){const t=wr(n);return t==="enc"?"ENCRYPTED":t==="mixed"?"PARTIALLY ENCRYPTED":"PLAINTEXT"}
function vu(n,{isCurrent:t,isPast:s}){const r=wr(n),o=r==="enc",i=r==="mixed";return t?o?"#6be0a2":i?"#cfe0a8":"#f5c542":s?o?"#3a9c6a":i?"#8aaa55":"#8a95a3":"#3a4250"}
function wu(){var V;const n=h.useRef(null),[t,s]=h.useState("tls12-fresh"),[r,o]=h.useState(null),[i,a]=h.useState(!1),[l,d]=h.useState(1),[c,p]=h.useState(0);h.useEffect(()=>{const T=ir.find(_=>_.id===t)||ir[0];n.current=new gu({version:T.version,resume:T.resume,rttMs:50}),o(n.current.snapshot()),d(1),a(!1)},[t,c]);const m=h.useCallback(()=>{const T=n.current;if(!T)return;if(!T.canStep()){a(!1);return}d(0),T.advance(),o(T.snapshot());const _=performance.now(),b=600,x=f=>{const u=Math.min(1,(f-_)/b);d(u),u<1&&requestAnimationFrame(x)};requestAnimationFrame(x)},[]);h.useEffect(()=>{if(!i)return;const T=n.current;if(!T)return;if(!T.canStep()){a(!1);return}const _=setTimeout(()=>m(),900);return()=>clearTimeout(_)},[i,r,m]);const g=()=>p(T=>T+1),w=h.useMemo(()=>({client:140,server:140+(Yt-280)}),[]);if(!r)return e.jsxs("div",{className:"tls-widget",children:[e.jsx("style",{children:la}),e.jsx("h2",{children:"TLS Handshake — System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const C=r.steps,j=r.currentStep-1,$=aa+C.length*en+60,O=C.map((T,_)=>aa+_*en),q=(()=>{if(r.currentStep===0)return"Press Step or Play to walk through the handshake.";const T=C[j];if(!T)return"done.";const _=`Step ${T.id}/${C.length}: `,b=T.rtt,x=T.phase==="appdata"&&T.rtt===0?" 0-RTT early data.":T.rttMarker?` End of RTT ${b}.`:"";return T.phase==="appdata"&&T.from==="client"?_+`Client sent first application byte.${x} Total to first byte: ${r.appDataReadyAt}ms (${r.appDataReadyAt/r.rttMs} RTT @ ${r.rttMs}ms).`:T.label.includes("Finished")||T.label.includes("ChangeCipherSpec")?_+`${T.from} sent ${T.label}. Further traffic encrypted.${x}`:_+`${T.from} → ${T.to}: ${T.label}.${x}`})(),R=(()=>{const T=C[j];return T?T.phase==="appdata"&&T.rtt===0?"warn":T.phase==="appdata"?"good":"":""})(),D=ir.map(T=>{const _=T.version==="1.2"?2:T.version==="1.3"&&!T.resume?1:0;return{...T,rtt:_,ms:_*r.rttMs}}),B=Math.max(...D.map(T=>T.ms),r.rttMs*2);return e.jsxs("div",{className:"tls-widget",children:[e.jsx("style",{children:la}),e.jsxs("h2",{children:[e.jsx("span",{children:"TLS Handshake — System Design Primer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:m,disabled:!n.current||!n.current.canStep(),children:"Step"}),e.jsx("button",{className:i?"active":"primary",onClick:()=>a(T=>!T),disabled:!n.current||!n.current.canStep(),children:i?"Pause":"Play"}),e.jsx("button",{onClick:g,children:"Reset"})]})]}),e.jsxs("p",{className:"sub",children:["Two peers negotiate a symmetric cipher and authenticate the server before application data flows. TLS 1.3 collapses the 1.2 handshake into one round trip; session resumption with PSK + ",e.jsx("code",{children:"early_data"})," lets the client send its first byte at 0-RTT — with a replay caveat."]}),e.jsxs("div",{className:"tls-toolbar",children:[e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Scenario:"}),e.jsx("div",{className:"tls-scenario-tabs",children:ir.map(T=>e.jsx("button",{className:T.id===t?"on":"",onClick:()=>s(T.id),children:T.label},T.id))})]}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:11,color:"#8a95a3"},children:["step ",r.currentStep," / ",r.totalSteps," · ","RTT = ",r.rttMs,"ms"," · ","first byte @ ",e.jsxs("b",{style:{color:r.appDataReadyAt===0?"#f5c542":"#6be0a2"},children:[r.appDataReadyAt,"ms"]})]})]}),e.jsxs("div",{className:"tls-main",children:[e.jsx("div",{className:"tls-canvas-wrap",children:e.jsxs("svg",{width:Yt,height:$,children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"tls-arrow",markerWidth:"9",markerHeight:"9",refX:"8",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L9,4 L0,8 z",fill:"#8a95a3"})}),e.jsx("marker",{id:"tls-arrow-current",markerWidth:"9",markerHeight:"9",refX:"8",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L9,4 L0,8 z",fill:"#f5c542"})}),e.jsx("marker",{id:"tls-arrow-enc",markerWidth:"9",markerHeight:"9",refX:"8",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L9,4 L0,8 z",fill:"#6be0a2"})})]}),["client","server"].map(T=>{const _=w[T];return e.jsxs("g",{children:[e.jsx("rect",{x:_-90,y:tn-28,width:180,height:46,rx:6,fill:"#161b22",stroke:sn[T],strokeWidth:"2"}),e.jsx("text",{x:_,y:tn-10,textAnchor:"middle",fill:sn[T],fontSize:"14",fontWeight:"700",children:lo[T]}),e.jsx("text",{x:_,y:tn+8,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",children:bu[T]}),e.jsx("line",{x1:_,y1:tn+22,x2:_,y2:$-12,stroke:"#1e252e",strokeWidth:"1.5",strokeDasharray:"3 4"})]},T)}),C.map((T,_)=>{if(!T.rttMarker)return null;const b=O[_]+en/2-4;return e.jsxs("g",{children:[e.jsx("line",{x1:24,x2:Yt-24,y1:b,y2:b,stroke:"#5a6878",strokeWidth:"1",strokeDasharray:"4 4"}),e.jsx("rect",{x:Yt/2-60,y:b-10,width:120,height:18,rx:3,fill:"#1a1f26",stroke:"#5a6878"}),e.jsxs("text",{x:Yt/2,y:b+3,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",fontWeight:"700",children:["↕ end of RTT ",T.rtt," (",T.rtt*r.rttMs,"ms)"]})]},`rtt-${_}`)}),(()=>{const T=C.findIndex(b=>b.phase==="appdata"&&b.from==="client");if(T<0)return null;const _=O[T]-28;return e.jsxs("g",{children:[e.jsx("rect",{x:16,y:_-12,width:200,height:20,rx:3,fill:r.appDataReadyAt===0?"#5a4a1a":"#1f5c3a",stroke:r.appDataReadyAt===0?"#f5c542":"#6be0a2"}),e.jsxs("text",{x:116,y:_+2,textAnchor:"middle",fill:r.appDataReadyAt===0?"#f5c542":"#b6f0c4",fontSize:"10",fontWeight:"700",fontFamily:"ui-monospace, Menlo, monospace",children:["★ first app byte @ ",r.appDataReadyAt,"ms"]})]})})(),C.map((T,_)=>{const b=O[_],x=w[T.from],f=w[T.to],u=_===j,y=_<j,v=f>x?1:-1,I=f-v*12,S="tls-step-row"+(u?" current":""),H=u?x+(I-x)*l:I,M=vu(T,{isCurrent:u,isPast:y}),k=u?"url(#tls-arrow-current)":wr(T)==="enc"&&(y||u)?"url(#tls-arrow-enc)":"url(#tls-arrow)",P=wr(T);return e.jsxs("g",{className:S,children:[e.jsx("rect",{className:"tls-step-bg",x:8,y:b-28,width:Yt-16,height:en-8,rx:4,fill:u?"#18222e":"transparent"}),e.jsx("text",{x:20,y:b,fill:"#8a95a3",fontSize:"11",fontFamily:"ui-monospace, Menlo, monospace",children:String(T.id).padStart(2,"0")}),e.jsxs("g",{children:[e.jsx("rect",{x:Yt-76,y:b-10,width:60,height:16,rx:3,fill:"#1a1f26",stroke:"#3a4250"}),e.jsx("text",{x:Yt-46,y:b+2,textAnchor:"middle",fill:"#cfd6e0",fontSize:"10",fontFamily:"ui-monospace, Menlo, monospace",children:T.phase==="appdata"&&T.rtt===0?"0-RTT":`RTT ${T.rtt}`})]}),e.jsx("text",{x:Math.min(x,f)+Math.abs(f-x)/2,y:b-12,textAnchor:"middle",fill:u?"#f5c542":"#cfd6e0",fontSize:"11",fontWeight:"600",children:ku(T.label,72)}),e.jsx("line",{x1:x+v*12,y1:b+4,x2:y||u?H:I,y2:b+4,stroke:M,strokeWidth:u?3:2,markerEnd:u||y?k:"url(#tls-arrow)",className:u?"tls-march":"",opacity:_>j?.35:1}),u&&e.jsx("circle",{cx:x+(I-x)*l,cy:b+4,r:6,fill:P==="enc"?"#6be0a2":"#f5c542",className:"tls-glow"}),e.jsxs("g",{children:[e.jsx("rect",{x:Math.min(x,f)+Math.abs(f-x)/2-60,y:b+12,width:120,height:16,rx:3,fill:P==="enc"?"#1f5c3a":P==="mixed"?"#3a4a2a":"#2a3038",opacity:u||y?1:.45}),e.jsx("text",{x:Math.min(x,f)+Math.abs(f-x)/2,y:b+24,textAnchor:"middle",fill:P==="enc"?"#b6f0c4":P==="mixed"?"#cfe0a8":"#8a95a3",fontSize:"10",fontWeight:"700",fontFamily:"ui-monospace, Menlo, monospace",opacity:u||y?1:.6,children:ca(T)})]})]},T.id)})]})}),e.jsxs("div",{className:"tls-side",children:[e.jsxs("div",{className:"tls-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Current step"}),e.jsx("span",{style:{color:"#8a95a3"},children:r.currentStep===0?"—":`${r.currentStep}/${r.totalSteps}`})]}),C[j]?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"meta",children:[e.jsx("span",{style:{color:sn[C[j].from]},children:lo[C[j].from]})," → ",e.jsx("span",{style:{color:sn[C[j].to]},children:lo[C[j].to]})]}),e.jsx("div",{style:{fontSize:11,color:"#cfd6e0",marginBottom:4},children:e.jsx("b",{children:C[j].label})}),e.jsxs("div",{style:{marginBottom:6},children:[e.jsx("span",{className:`tls-enc-chip ${wr(C[j])}`,children:ca(C[j])})," ",e.jsx("span",{className:"tls-enc-chip plain",children:C[j].phase==="appdata"&&C[j].rtt===0?"0-RTT":`RTT ${C[j].rtt}`})]}),C[j].payload&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{fontSize:11,color:"#8a95a3"},children:"records"}),e.jsx("pre",{children:yu(C[j].payload)})]}),e.jsx("div",{style:{marginTop:6,color:"#8a95a3",fontSize:11},children:C[j].note})]}):e.jsx("div",{className:"meta",children:"No step selected yet."})]}),e.jsxs("div",{className:"tls-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Session state"}),e.jsx("span",{style:{color:r.resume?"#f5c542":"#6be0a2"},children:r.resume?"RESUME (PSK)":"FRESH"})]}),e.jsxs("div",{className:"meta",children:["version: ",e.jsxs("code",{children:["TLS ",r.version]})]}),e.jsxs("div",{className:"meta",children:["client_random:"," ",e.jsxs("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:[r.clientRandom.slice(0,18),"…"]})]}),e.jsxs("div",{className:"meta",children:["server_random:"," ",e.jsxs("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:[r.serverRandom.slice(0,18),"…"]})]}),r.pskId&&e.jsxs("div",{className:"meta",children:["psk_id:"," ",e.jsx("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:r.pskId})]}),e.jsxs("div",{className:"meta",style:{marginTop:4},children:["first app byte @"," ",e.jsxs("b",{style:{color:r.appDataReadyAt===0?"#f5c542":"#6be0a2"},children:[r.appDataReadyAt,"ms"]})," ","(",r.appDataReadyAt/r.rttMs," × RTT)"]})]}),e.jsxs("div",{className:"tls-card",children:[e.jsx("div",{className:"hdr",children:e.jsx("span",{children:"Scenario notes"})}),e.jsx("div",{className:"meta",children:(V=ir.find(T=>T.id===t))==null?void 0:V.description})]})]})]}),e.jsx("div",{className:`tls-status ${R}`,children:q}),e.jsx("div",{className:"tls-compare",children:D.map(T=>{const _=T.id===t,b=B===0?1:T.ms/B*100;return e.jsxs("div",{className:`col ${_?"active":""}`,children:[e.jsx("div",{className:"title",children:T.label}),e.jsxs("div",{className:"meta",children:[T.rtt," × RTT = ",e.jsxs("b",{children:[T.ms,"ms"]})," to first byte"]}),e.jsxs("div",{className:"bar-row",children:[e.jsx("div",{className:"bar",style:{width:`${Math.max(b,4)}%`,background:T.rtt===0?"linear-gradient(90deg, #f5c542, #d9534f)":T.rtt===1?"linear-gradient(90deg, #4a8fd8, #3a9c6a)":"linear-gradient(90deg, #4a8fd8, #a15cff)"}}),e.jsxs("span",{className:"meta",style:{minWidth:44,textAlign:"right"},children:[T.ms,"ms"]})]}),T.rtt===0&&e.jsx("div",{className:"zero-rtt-warn",children:"⚠ replay risk — early_data can be replayed by a network attacker"})]},T.id)})}),e.jsxs("div",{className:"tls-footer",children:[e.jsx("h3",{children:"Why TLS 1.3 is faster"}),e.jsxs("ul",{children:[e.jsxs("li",{children:[e.jsx("b",{children:"Key share in ClientHello."})," The client speculatively picks an ECDHE group (x25519) and sends its public key in the very first flight. The server can derive shared secrets immediately — no separate ",e.jsx("code",{children:"ServerKeyExchange"}),"/",e.jsx("code",{children:"ClientKeyExchange"})," round trip."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Merged messages."})," ",e.jsx("code",{children:"ServerHello"}),", ",e.jsx("code",{children:"EncryptedExtensions"}),",",e.jsx("code",{children:"Certificate"}),", ",e.jsx("code",{children:"CertificateVerify"}),", ",e.jsx("code",{children:"Finished"})," all travel in the server’s single reply flight."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Encrypted earlier."})," Everything after ",e.jsx("code",{children:"ServerHello"})," is encrypted under the handshake traffic secret, so the cert chain and extensions don’t leak on the wire."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Pruned cipher suites."})," No more CBC-MAC, RSA key transport, static-DH, compression, or renegotiation. Only AEAD + ECDHE/PSK. Fewer knobs, fewer downgrade bugs."]})]}),e.jsx("h3",{style:{marginTop:8},children:"0-RTT caveat"}),e.jsxs("p",{style:{margin:"2px 0 0 0"},children:["Early data is encrypted under a key derived from the PSK, but the server has no anti-replay nonce for it. A passive attacker that recorded the first flight can replay it later and the server will accept the same application bytes. Only use 0-RTT for ",e.jsx("em",{children:"idempotent"})," operations (e.g. ",e.jsx("code",{children:"GET"})," with safe side effects), never for state-changing requests. Servers MUST enforce single-use replay caches per PSK."]})]})]})}
function ku(n,t){return n?n.length<=t?n:n.slice(0,t-1)+"…":""}

export default wu;
export { wu as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(wu, {}));
  return () => root.unmount();
}
