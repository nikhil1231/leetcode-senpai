import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const De="#0f1419";
const po="#1a1f2e";
const Re="#2a2f3e";
const be="#e6e6e6";
const $e="#8a93a6";
const bt="#4a7cff";
const fr="#f5c451";
const vt="#f66";
const We="#5cd894";
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
`,Cs="https://bank.com",ua="https://evil.com";
function Uu(n=""){const t=Math.random().toString(36).slice(2,10);return n?`${n}_${t}`:t}
const ho=[{id:"no-defense",name:"No defense — CSRF succeeds",description:"SameSite=None cookie, no CSRF token, no Origin check. A hidden form on evil.com auto-submits a cross-site POST and the browser attaches the bank.com session cookie. Transfer goes through.",defenses:{sameSite:"none",csrfToken:!1,originCheck:!1}},{id:"samesite-lax",name:"SameSite=Lax — blocks cross-site POST",description:"The session cookie is marked SameSite=Lax. Modern browsers omit the cookie on cross-site POST requests, so the forged transfer arrives unauthenticated. 401 Unauthorized.",defenses:{sameSite:"lax",csrfToken:!1,originCheck:!1}},{id:"csrf-token",name:"CSRF token — forged request rejected",description:"bank.com embeds a per-session CSRF token in its legitimate forms. evil.com cannot read that token (Same-Origin Policy) so its forged POST is missing the token. 403 Forbidden.",defenses:{sameSite:"none",csrfToken:!0,originCheck:!1}},{id:"origin-check",name:"Origin header check — forged request rejected",description:"bank.com rejects state-changing requests whose Origin header is not https://bank.com. The browser honestly reports Origin: https://evil.com. 403 Forbidden.",defenses:{sameSite:"none",csrfToken:!1,originCheck:!0}}];
class Vu{constructor({defenses:t}={}){this.defenses=Object.assign({sameSite:"none",csrfToken:!1,originCheck:!1},t||{}),this.reset()}reset(){this.cookie=null,this.log=[],this.evilPage=null,this.transferSucceeded=null,this.lastResponse=null,this.serverCsrfToken=null,this.phase="idle",this.stepId=0}setDefense(t,s){t in this.defenses&&(this.defenses[t]=s,this.cookie&&t==="sameSite"&&(this.cookie.sameSite=s))}_log(t){this.stepId+=1,this.log.push({id:this.stepId,...t})}victimLogin(){return this.cookie={value:"session=abc123",sameSite:this.defenses.sameSite,httpOnly:!0},this.defenses.csrfToken&&(this.serverCsrfToken=Uu("csrf")),this._log({kind:"login",from:"victim",to:"bank",method:"POST",url:`${Cs}/login`,note:"Victim submits credentials to bank.com."}),this._log({kind:"login-response",from:"bank",to:"victim",method:"200",url:`Set-Cookie: session=abc123; SameSite=${xr(this.defenses.sameSite)}${this.cookie.httpOnly?"; HttpOnly":""}`,note:`bank.com sets the session cookie${this.defenses.csrfToken?` and embeds CSRF token ${this.serverCsrfToken} in legitimate forms.`:"."}`}),this.phase="logged-in",this.snapshot()}victimVisitAttacker(){this.phase==="idle"&&this.victimLogin();const t=[{name:"to",value:"attacker_account_42"},{name:"amount",value:"1000"}];return this.evilPage={formTarget:`${Cs}/transfer`,hiddenFields:t,html:`<form id="f" method="POST" action="${Cs}/transfer">
`+t.map(s=>`  <input name="${s.name}" value="${s.value}">`).join(`
`)+`
</form>
<script>document.getElementById("f").submit();<\/script>`},this._log({kind:"visit",from:"victim",to:"attacker",method:"GET",url:`${ua}/`,note:"Victim is lured to evil.com (phishing link, malicious ad, etc)."}),this._log({kind:"visit-response",from:"attacker",to:"victim",method:"200",url:"HTML + hidden auto-submit form",note:"evil.com serves a page whose <form> targets bank.com and auto-submits."}),this.phase="visited-evil",this.snapshot()}attackerAutoSubmit(){var d;this.phase==="idle"&&this.victimLogin(),this.phase==="logged-in"&&this.victimVisitAttacker();const t=((d=this.cookie)==null?void 0:d.sameSite)||"none",s=!!this.cookie&&(t==="none"||!1),r=null,o=ua;this._log({kind:"forged-post",from:"victim",to:"bank",method:"POST",url:`${Cs}/transfer?to=attacker_account_42&amount=1000`,note:s?`Browser attaches cookie (SameSite=${xr(t)}). Origin: ${o}.`:`Browser OMITS cookie (SameSite=${xr(t)} blocks cross-site POST). Origin: ${o}.`,crossSite:!0,cookieAttached:s,origin:o,csrfToken:r});let i=!0,a=200,l="Transfer accepted. $1000 sent to attacker_account_42.";return s?this.defenses.originCheck&&o!==Cs?(i=!1,a=403,l=`Origin header is ${o}, not ${Cs} → 403 Forbidden.`):this.defenses.csrfToken&&r!==this.serverCsrfToken&&(i=!1,a=403,l=`CSRF token missing or invalid (server expected ${this.serverCsrfToken}) → 403 Forbidden.`):(i=!1,a=401,l=`SameSite=${xr(t)} stripped the session cookie from the cross-site POST → 401 Unauthorized.`),this.transferSucceeded=i,this.lastResponse={status:a,reason:l},this._log({kind:i?"transfer-success":"transfer-blocked",from:"bank",to:"victim",method:String(a),url:i?"OK — transfer complete":`Rejected — ${l}`,note:i?"bank.com happily processed the forged transfer. ATTACK SUCCEEDED.":`bank.com rejected the request. ATTACK BLOCKED — ${l}`}),this.phase="submitted",this.snapshot()}runAll(){return this.reset(),this.victimLogin(),this.victimVisitAttacker(),this.attackerAutoSubmit(),this.snapshot()}snapshot(){return{defenses:{...this.defenses},cookie:this.cookie?{...this.cookie}:null,serverCsrfToken:this.serverCsrfToken,evilPage:this.evilPage?{...this.evilPage}:null,log:this.log.map(t=>({...t})),phase:this.phase,transferSucceeded:this.transferSucceeded,lastResponse:this.lastResponse?{...this.lastResponse}:null}}}
function xr(n){return n?n.charAt(0).toUpperCase()+n.slice(1):"None"}
function uo(n){const t=n.sameSite||"none";return t==="lax"||t==="strict"?{blocked:!0,status:401,reason:`SameSite=${xr(t)} → browser omits cookie on cross-site POST → 401.`}:n.originCheck?{blocked:!0,status:403,reason:"Origin header is https://evil.com, not https://bank.com → 403."}:n.csrfToken?{blocked:!0,status:403,reason:"Forged request lacks a valid per-session CSRF token → 403."}:{blocked:!1,status:200,reason:"No defense active. Browser attaches cookie cross-site; bank processes transfer."}}
const on=900,mo=72,lr=56,fo=120,xo=["victim","attacker","bank"],an={victim:"#f5c542",attacker:"#d9534f",bank:"#3a9c6a"},go={victim:"Victim",attacker:"Attacker site",bank:"Bank"},Gu={victim:"Browser w/ session cookie",attacker:"evil.com",bank:"bank.com"},ma=`
.csrf-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 1000px;
}
.csrf-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.csrf-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.csrf-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.csrf-toolbar button,
.csrf-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.csrf-toolbar button:hover { background: #232a33; }
.csrf-toolbar button.primary { background: #2c5aa0; border-color: #3c6ab0; }
.csrf-toolbar button.primary:hover { background: #3467b0; }
.csrf-toolbar button.active { background: #3a4250; border-color: #5a6878; }
.csrf-toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
.csrf-toolbar .group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 2px 6px;
  border-left: 1px solid #2a3038;
  border-right: 1px solid #2a3038;
}
.csrf-toolbar .group-label { font-size: 11px; color: #8a95a3; }
.csrf-toolbar .spacer { flex: 1; }

.csrf-seg {
  display: inline-flex;
  gap: 0;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
}
.csrf-seg button {
  border: none;
  border-radius: 0;
  padding: 4px 8px;
  background: #1a1f26;
  font-size: 11px;
}
.csrf-seg button.on {
  background: #1f5c3a;
  color: #b6f0c4;
}
.csrf-seg button.off {
  background: #6b2a2a;
  color: #f0b6b6;
}
.csrf-seg button.sel-none { background: #6b2a2a; color: #f0b6b6; }
.csrf-seg button.sel-lax,
.csrf-seg button.sel-strict { background: #1f5c3a; color: #b6f0c4; }

.csrf-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
}
.csrf-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
  overflow: auto;
  max-height: 640px;
}
.csrf-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.csrf-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
}
.csrf-card .hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-weight: 600;
}
.csrf-card .meta { color: #8a95a3; font-size: 11px; margin-bottom: 4px; }
.csrf-card pre {
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
.csrf-outcome {
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
}
.csrf-outcome.bad { background: #6b2a2a; color: #ffd0d0; }
.csrf-outcome.good { background: #1f5c3a; color: #b6f0c4; }
.csrf-outcome.neutral { background: #20283a; color: #cfd6e0; }

.csrf-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #cfd6e0;
}
.csrf-footer h3 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #f5c542;
}
.csrf-footer ul { margin: 4px 0 0 0; padding-left: 18px; }
.csrf-footer li { margin: 2px 0; }
.csrf-footer code {
  background: #0a0e13;
  border: 1px solid #2a3038;
  padding: 0 3px;
  border-radius: 2px;
  font-size: 11px;
}

.csrf-status {
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
.csrf-status.error { color: #ff8a8a; }
.csrf-status.good { color: #6be0a2; }
.csrf-status.warn { color: #f5c542; }

.csrf-widget svg text { user-select: none; }
@keyframes csrf-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.csrf-glow { animation: csrf-glow 1.4s ease-in-out infinite; }
@keyframes csrf-march {
  to { stroke-dashoffset: -20; }
}
.csrf-march { stroke-dasharray: 6 4; animation: csrf-march 0.7s linear infinite; }
.csrf-dashed { stroke-dasharray: 6 4; }
`;
function fa(n){if(!n)return"(none)";const t=[n.value,`SameSite=${cs(n.sameSite)}`];return n.httpOnly&&t.push("HttpOnly"),t.join("; ")}
function cs(n){return n?n.charAt(0).toUpperCase()+n.slice(1):"None"}
function Yu(n){if(!n)return"";if(n.length<=58)return n;const t=n.indexOf("?");return t>0&&t<48?n.slice(0,t)+"?…":n.slice(0,54)+"…"}
const cr={login:{from:"victim",to:"bank"},"login-response":{from:"bank",to:"victim"},visit:{from:"victim",to:"attacker"},"visit-response":{from:"attacker",to:"victim"},"forged-post":{from:"victim",to:"bank"},"transfer-success":{from:"bank",to:"victim"},"transfer-blocked":{from:"bank",to:"victim"}};
function Xu(){var v,I,S,H,M;const n=h.useRef(null),[t,s]=h.useState("no-defense"),[r,o]=h.useState({sameSite:"none",csrfToken:!1,originCheck:!1}),[i,a]=h.useState(null),[l,d]=h.useState(-1),[c,p]=h.useState(1),[m,g]=h.useState(!1),[w,C]=h.useState(0);h.useEffect(()=>{n.current=new Vu({defenses:r}),a(n.current.snapshot()),d(-1),p(1),g(!1)},[r,w]);const j=k=>{const P=ho.find(N=>N.id===k);P&&(s(k),o({...P.defenses}))},$=(k,P)=>{o(N=>({...N,[k]:P})),s("custom")},O=h.useCallback(k=>{const P=n.current;if(!P)return;k(P);const N=P.snapshot();a(N),d(N.log.length-1),p(0);const z=performance.now(),E=500,J=Y=>{const se=Math.min(1,(Y-z)/E);p(se),se<1&&requestAnimationFrame(J)};requestAnimationFrame(J)},[]),q=()=>O(k=>k.victimLogin()),R=()=>O(k=>k.victimVisitAttacker()),D=()=>O(k=>k.attackerAutoSubmit()),B=()=>C(k=>k+1);h.useEffect(()=>{if(!m||!n.current)return;const P=(i==null?void 0:i.phase)||"idle";let N=null;if(P==="idle")N=E=>E.victimLogin();else if(P==="logged-in")N=E=>E.victimVisitAttacker();else if(P==="visited-evil")N=E=>E.attackerAutoSubmit();else{g(!1);return}const z=setTimeout(()=>O(N),900);return()=>clearTimeout(z)},[m,i,O]);const V=h.useMemo(()=>{const N=(on-240)/(xo.length-1),z={};return xo.forEach((E,J)=>{z[E]=120+J*N}),z},[]);if(!i)return e.jsxs("div",{className:"csrf-widget",children:[e.jsx("style",{children:ma}),e.jsx("h2",{children:"CSRF: Attack + Defense — System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const T=i.log,_=fo+Math.max(T.length,5)*mo+40,b=(()=>{var P,N,z;if(l<0||!T[l]){const E=uo(r);return E.blocked?`Defenses armed. Predicted outcome: ${E.reason} Press Step/Play to walk the attack.`:`No defenses active. Predicted outcome: ${E.reason} Press Step/Play to watch the attack.`}const k=T[l];switch(k.kind){case"login":return"Victim POSTs credentials to bank.com/login.";case"login-response":return`Victim logged in. Cookie set: ${fa(i.cookie)}${i.serverCsrfToken?`. Server CSRF token: ${i.serverCsrfToken}.`:"."}`;case"visit":return"Victim navigates to evil.com (phishing link, malicious ad, …).";case"visit-response":return'evil.com returns HTML with a hidden <form action="https://bank.com/transfer"> and a script that auto-submits it.';case"forged-post":return k.cookieAttached?`Browser auto-submitted the cross-site POST. Cookie attached (SameSite=${cs((P=i.cookie)==null?void 0:P.sameSite)}). Origin: https://evil.com.`:`Browser auto-submitted the cross-site POST. Cookie OMITTED (SameSite=${cs((N=i.cookie)==null?void 0:N.sameSite)} blocks cross-site POST).`;case"transfer-success":return"Bank processed transfer. ATTACK SUCCEEDED — $1000 sent to attacker_account_42.";case"transfer-blocked":return`[Defense]: ${(z=i.lastResponse)==null?void 0:z.reason} ATTACK BLOCKED.`;default:return k.note||""}})(),x=(()=>{if(l<0)return uo(r).blocked?"good":"warn";const k=T[l];return k?k.kind==="transfer-success"?"error":k.kind==="transfer-blocked"?"good":k.kind==="forged-post"?k.cookieAttached?"warn":"good":"":""})(),f=(()=>{var k,P;if(i.phase!=="submitted"){const N=uo(r);return{cls:"neutral",label:N.blocked?"Not yet run · predicted BLOCKED":"Not yet run · predicted ATTACK SUCCEEDS",reason:N.reason}}return i.transferSucceeded?{cls:"bad",label:"Transfer succeeded? YES — attack succeeded.",reason:"Browser attached the session cookie on a cross-site POST and bank.com accepted it."}:{cls:"good",label:`Transfer succeeded? NO — ${((k=i.lastResponse)==null?void 0:k.status)||""} rejected.`,reason:((P=i.lastResponse)==null?void 0:P.reason)||"Defense blocked the forged request."}})(),u=T.map((k,P)=>{const N=cr[k.kind]||{from:k.from,to:k.to},z=V[N.from],E=V[N.to],J=fo+P*mo,Y=P===l,se=P<l,A=E>z?1:-1,K=E-A*10,Q=Y?z+(K-z)*c:K,X=k.kind==="forged-post",ee=k.kind==="transfer-blocked",F=k.kind==="transfer-success";let U="#8a95a3";X?U="#d9534f":F?U="#6be0a2":ee?U="#d9534f":Y&&(U="#f5c542");let Z="url(#csrf-arrow)";X||ee?Z="url(#csrf-arrow-fail)":F?Z="url(#csrf-arrow-good)":Y&&(Z="url(#csrf-arrow-current)");const W=["csrf-step"];return Y&&W.push("csrf-march"),X&&W.push("csrf-dashed"),{entry:k,i:P,y:J,fromX:z,toX:E,dir:A,endX:K,drawEndX:Q,isCurrent:Y,isPast:se,strokeColor:U,marker:Z,classes:W.join(" "),label:`${k.method||""}${k.url?"  "+Yu(k.url):""}`}}),y=l>=0?T[l]:null;return e.jsxs("div",{className:"csrf-widget",children:[e.jsx("style",{children:ma}),e.jsxs("h2",{children:[e.jsx("span",{children:"CSRF: Attack + Defense — System Design Primer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:q,disabled:i.phase!=="idle",children:"Login"}),e.jsx("button",{onClick:R,disabled:i.phase==="idle"||i.phase==="visited-evil"||i.phase==="submitted",children:"Visit evil.com"}),e.jsx("button",{onClick:D,disabled:i.phase!=="visited-evil"&&i.phase!=="logged-in",children:"Auto-submit form"}),e.jsx("button",{className:m?"active":"primary",onClick:()=>g(k=>!k),disabled:i.phase==="submitted",children:m?"Pause":"Play"}),e.jsx("button",{onClick:B,children:"Reset"})]})]}),e.jsx("p",{className:"sub",children:"A cross-site request forgery: evil.com tricks the browser into issuing an authenticated POST to bank.com using the victim’s existing session cookie. Toggle defenses to see which ones actually stop it."}),e.jsxs("div",{className:"csrf-toolbar",children:[e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Scenario:"}),e.jsxs("select",{value:t,onChange:k=>j(k.target.value),children:[ho.map(k=>e.jsx("option",{value:k.id,children:k.name},k.id)),e.jsx("option",{value:"custom",children:"Custom"})]})]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"SameSite:"}),e.jsx("div",{className:"csrf-seg",children:["none","lax","strict"].map(k=>e.jsx("button",{className:r.sameSite===k?`sel-${k}`:"",onClick:()=>$("sameSite",k),children:cs(k)},k))})]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"CSRF token:"}),e.jsxs("div",{className:"csrf-seg",children:[e.jsx("button",{className:r.csrfToken?"on":"",onClick:()=>$("csrfToken",!0),children:"ON"}),e.jsx("button",{className:r.csrfToken?"":"off",onClick:()=>$("csrfToken",!1),children:"OFF"})]})]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Origin check:"}),e.jsxs("div",{className:"csrf-seg",children:[e.jsx("button",{className:r.originCheck?"on":"",onClick:()=>$("originCheck",!0),children:"ON"}),e.jsx("button",{className:r.originCheck?"":"off",onClick:()=>$("originCheck",!1),children:"OFF"})]})]}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:11,color:"#8a95a3"},children:["phase: ",i.phase," · ","step ",Math.max(0,l+1)," / ",T.length]})]}),e.jsxs("div",{className:"csrf-main",children:[e.jsx("div",{className:"csrf-canvas-wrap",children:e.jsxs("svg",{width:on,height:_,children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"csrf-arrow",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#8a95a3"})}),e.jsx("marker",{id:"csrf-arrow-current",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#f5c542"})}),e.jsx("marker",{id:"csrf-arrow-fail",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#d9534f"})}),e.jsx("marker",{id:"csrf-arrow-good",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#6be0a2"})})]}),xo.map(k=>{const P=V[k];return e.jsxs("g",{children:[e.jsx("rect",{x:P-80,y:lr-26,width:160,height:48,rx:6,fill:"#161b22",stroke:an[k],strokeWidth:"2"}),e.jsx("text",{x:P,y:lr-10,textAnchor:"middle",fill:an[k],fontSize:"13",fontWeight:"700",children:go[k]}),e.jsx("text",{x:P,y:lr+6,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",children:Gu[k]}),e.jsx("text",{x:P,y:lr+18,textAnchor:"middle",fill:"#5a6878",fontSize:"9",fontFamily:"ui-monospace, Menlo, monospace",children:k==="victim"&&i.cookie?`cookie: ${i.cookie.value}; ${cs(i.cookie.sameSite)}`:k==="bank"&&i.serverCsrfToken?`csrf_token=${i.serverCsrfToken}`:""}),e.jsx("line",{x1:P,y1:lr+26,x2:P,y2:_-12,stroke:"#1e252e",strokeWidth:"1.5",strokeDasharray:"3 4"})]},k)}),u.map(k=>{var Z;const{entry:P,i:N,y:z,fromX:E,toX:J,dir:Y,endX:se,drawEndX:A,isCurrent:K,isPast:Q,strokeColor:X,marker:ee}=k,F=Math.min(E,J)+Math.abs(J-E)/2,U=P.kind==="forged-post";return e.jsxs("g",{className:"csrf-step-row",onClick:()=>d(N),style:{cursor:"pointer"},children:[e.jsx("rect",{x:8,y:z-22,width:on-16,height:mo-6,rx:4,fill:K?"#18222e":"transparent"}),e.jsx("text",{x:20,y:z+4,fill:"#8a95a3",fontSize:"11",fontFamily:"ui-monospace, Menlo, monospace",children:String(N+1).padStart(2,"0")}),e.jsx("text",{x:F,y:z-8,textAnchor:"middle",fill:K?"#f5c542":"#cfd6e0",fontSize:"11",fontWeight:"600",children:k.label}),U&&e.jsxs("text",{x:F,y:z+22,textAnchor:"middle",fill:"#ff8a8a",fontSize:"10",fontStyle:"italic",children:["cross-site POST",P.cookieAttached?" · cookie attached":` · cookie STRIPPED by SameSite=${cs((Z=i.cookie)==null?void 0:Z.sameSite)}`]}),e.jsx("line",{x1:E+Y*10,y1:z,x2:Q||K?A:se,y2:z,stroke:X,strokeWidth:K?2.5:1.5,markerEnd:ee,className:(K?"csrf-march ":"")+(U?"csrf-dashed":""),opacity:N>l?.35:1}),K&&e.jsx("circle",{cx:E+(se-E)*c,cy:z,r:6,fill:X,className:"csrf-glow"})]},P.id)}),T.length===0&&e.jsxs("text",{x:on/2,y:fo+20,textAnchor:"middle",fill:"#5a6878",fontSize:"12",children:["Press ",e.jsx("tspan",{fill:"#cfd6e0",children:"Login"})," to begin."]})]})}),e.jsxs("div",{className:"csrf-side",children:[e.jsxs("div",{className:"csrf-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Current step"}),e.jsx("span",{style:{color:"#8a95a3"},children:l<0?"—":`${l+1}/${T.length}`})]}),y?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"meta",children:[e.jsx("span",{style:{color:an[((v=cr[y.kind])==null?void 0:v.from)||y.from]},children:go[((I=cr[y.kind])==null?void 0:I.from)||y.from]})," → ",e.jsx("span",{style:{color:an[((S=cr[y.kind])==null?void 0:S.to)||y.to]},children:go[((H=cr[y.kind])==null?void 0:H.to)||y.to]})]}),e.jsxs("div",{style:{fontSize:11,color:"#cfd6e0",marginBottom:4},children:[e.jsx("b",{children:y.method}),y.url&&e.jsxs(e.Fragment,{children:[" ",y.url]})]}),e.jsx("div",{style:{marginTop:6,color:"#8a95a3",fontSize:11},children:y.note})]}):e.jsx("div",{className:"meta",children:"No step run yet. Use the buttons above."})]}),e.jsxs("div",{className:"csrf-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Session state"}),e.jsx("span",{style:{color:i.cookie?"#6be0a2":"#8a95a3",fontSize:11},children:i.cookie?"logged in":"not logged in"})]}),e.jsxs("div",{className:"meta",children:["cookie: ",e.jsx("code",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:fa(i.cookie)})]}),i.serverCsrfToken&&e.jsxs("div",{className:"meta",children:["server csrf_token: ",e.jsx("code",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:i.serverCsrfToken})]}),e.jsx("div",{className:"meta",style:{marginTop:6},children:"defenses active:"}),e.jsxs("ul",{style:{margin:"2px 0 0 0",paddingLeft:18,fontSize:11},children:[e.jsxs("li",{children:["SameSite = ",e.jsx("b",{style:{color:r.sameSite==="none"?"#ff8a8a":"#6be0a2"},children:cs(r.sameSite)})]}),e.jsxs("li",{children:["CSRF token = ",e.jsx("b",{style:{color:r.csrfToken?"#6be0a2":"#ff8a8a"},children:r.csrfToken?"ON":"OFF"})]}),e.jsxs("li",{children:["Origin check = ",e.jsx("b",{style:{color:r.originCheck?"#6be0a2":"#ff8a8a"},children:r.originCheck?"ON":"OFF"})]})]})]}),i.evilPage&&e.jsxs("div",{className:"csrf-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"evil.com payload"}),e.jsx("span",{style:{color:"#d9534f",fontSize:11},children:"hidden form"})]}),e.jsx("pre",{children:i.evilPage.html})]}),e.jsxs("div",{className:"csrf-card",children:[e.jsx("div",{className:"hdr",children:e.jsx("span",{children:"Scenario notes"})}),e.jsx("div",{className:"meta",children:((M=ho.find(k=>k.id===t))==null?void 0:M.description)||"Custom defense combination. Toggle to compare."})]}),e.jsxs("div",{className:`csrf-outcome ${f.cls}`,children:[f.label,e.jsx("div",{style:{fontWeight:400,fontSize:11,marginTop:4,opacity:.9},children:f.reason})]})]})]}),e.jsx("div",{className:`csrf-status ${x}`,children:b}),e.jsxs("div",{className:"csrf-footer",children:[e.jsx("h3",{children:"Defense-in-depth"}),e.jsxs("ul",{children:[e.jsxs("li",{children:[e.jsx("b",{children:"SameSite=Lax"})," is the default in modern browsers (Chrome, Firefox, Edge). It already blocks cross-site POST forgeries like this one — but only if the cookie is actually marked ",e.jsx("code",{children:"SameSite=Lax"})," ","or ",e.jsx("code",{children:"Strict"}),". Legacy apps still ship ",e.jsx("code",{children:"SameSite=None"}),"."]}),e.jsxs("li",{children:[e.jsx("b",{children:"CSRF tokens"})," are a per-session (or per-request) secret that bank.com embeds in its own forms and checks on every state-changing request. evil.com can’t read the token — the Same-Origin Policy blocks reading a cross-origin response’s body — so the forged request can’t supply a valid value."]}),e.jsxs("li",{children:[e.jsx("b",{children:"Origin/Referer check"})," — on state-changing endpoints, reject requests whose ",e.jsx("code",{children:"Origin"})," (or ",e.jsx("code",{children:"Referer"}),") is not your own. The browser sets these headers honestly; attackers cannot forge them from JS."]}),e.jsxs("li",{children:["Bonus: ",e.jsx("b",{children:"GETs must be safe"}),". If a ",e.jsx("code",{children:"GET /transfer"})," ","changes state, any ",e.jsx("code",{children:"<img src>"})," or link triggers it — SameSite=Lax even allows cross-site GET navigation. Treat GETs as idempotent reads; put all mutations behind POST/PUT/DELETE."]})]})]})]})}

export default Xu;
export { Xu as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Xu, {}));
  return () => root.unmount();
}
