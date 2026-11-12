import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const nt="#0f1419";
const is="#1a1f2e";
const je="#2a2f3e";
const ze="#e6e6e6";
const Ce="#8a93a6";
const _t="#4a7cff";
const Cr="#f5c451";
const ur="#f66";
const vn="#5cd894";
function Ph(n){const t=[];for(const r of Object.keys(n)){const o=n[r];if(t.push(`${r}=${o}`),t.length>=4)break}let s=t.join(" ");return s.length>48&&(s=s.slice(0,45)+"…"),s}
const Oh=`
.sq-root {
  color: ${ze};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${nt};
}
.sq-panel {
  background: ${is};
  border: 1px solid ${je};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1280px;
  margin: 0 auto;
}
.sq-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${je};
  flex-wrap: wrap;
}
.sq-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ze};
}
.sq-subtitle {
  font-size: 12px;
  color: ${Ce};
  margin-top: 2px;
}
.sq-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.sq-label {
  color: ${Ce};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.sq-label select {
  background: ${nt};
  border: 1px solid ${je};
  color: ${ze};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.sq-toggle {
  display: inline-flex;
  background: ${nt};
  border: 1px solid ${je};
  border-radius: 5px;
  overflow: hidden;
}
.sq-toggle-opt {
  padding: 5px 12px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  text-transform: lowercase;
  transition: filter 0.15s;
}
.sq-toggle-opt:hover { filter: brightness(1.2); }
.sq-btn {
  padding: 5px 12px;
  background: ${_t};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.sq-btn:hover { filter: brightness(1.15); }
.sq-btn-ghost {
  background: transparent;
  border: 1px solid ${je};
  color: ${ze};
}
.sq-btn-run {
  background: ${vn};
  color: ${nt};
  font-weight: 700;
}
.sq-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sq-mini { font-size: 11px; color: ${Ce}; }

/* 3-column layout */
.sq-columns {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1.25fr;
  gap: 12px;
  padding-top: 12px;
}
.sq-col {
  background: ${nt};
  border: 1px solid ${je};
  border-radius: 8px;
  padding: 10px 12px;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sq-col-title {
  font-size: 13px;
  font-weight: 700;
  color: ${ze};
  display: flex;
  align-items: center;
}
.sq-col-sub {
  font-size: 11px;
  color: ${Ce};
  margin-top: -4px;
  margin-bottom: 2px;
}
.sq-strategy-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: lowercase;
}

/* logical schema */
.sq-logical-tbl {
  background: ${is};
  border: 1px solid ${je};
  border-radius: 6px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sq-logical-hd {
  font-weight: 700;
  font-size: 13px;
  color: ${_t};
  border-bottom: 1px dashed ${je};
  padding-bottom: 3px;
  margin-bottom: 3px;
}
.sq-logical-col {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 1px 0;
  color: ${ze};
}
.sq-col-type {
  color: ${Ce};
  font-size: 10px;
}
.sq-fk-note {
  font-size: 10px;
  color: ${Ce};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 4px 8px;
  background: ${is};
  border: 1px dashed ${je};
  border-radius: 4px;
  line-height: 1.5;
}

/* physical shards */
.sq-shards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 460px;
  overflow-y: auto;
}
.sq-shard {
  background: ${is};
  border: 1px solid ${je};
  border-radius: 7px;
  padding: 6px 8px;
  transition: box-shadow 0.3s, border-color 0.3s;
}
.sq-shard-hit {
  border-color: ${Cr};
  box-shadow: 0 0 0 2px ${Cr}44;
}
.sq-shard-hd {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px dashed ${je};
  padding-bottom: 3px;
  margin-bottom: 4px;
}
.sq-shard-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 12px;
}
.sq-shard-sub {
  font-size: 10px;
  color: ${Ce};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sq-tbl {
  background: ${nt};
  border: 1px solid ${je};
  border-radius: 5px;
  padding: 4px 6px;
  margin-bottom: 4px;
  transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s, background 0.3s;
}
.sq-tbl-hit {
  border-color: ${ur};
  background: #2a1a22;
  animation: sq-pulse 1.3s ease-in-out;
}
@keyframes sq-pulse {
  0% { box-shadow: 0 0 0 0 ${ur}88; transform: scale(1.02); }
  100% { box-shadow: 0 0 0 0 ${ur}00; transform: scale(1); }
}
.sq-tbl-hd {
  display: flex;
  justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sq-tbl-name { font-size: 11px; font-weight: 700; color: ${ze}; }
.sq-tbl-rows { font-size: 10px; color: ${Ce}; }
.sq-tbl-sample {
  margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  color: ${Ce};
  line-height: 1.5;
}
.sq-tbl-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sq-tbl-more {
  font-style: italic;
  color: ${Ce};
  font-size: 9.5px;
}

/* query runner */
.sq-presets {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sq-preset {
  text-align: left;
  background: ${is};
  border: 1px solid ${je};
  border-radius: 5px;
  color: ${ze};
  padding: 5px 8px;
  cursor: pointer;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: border-color 0.15s, background 0.15s;
}
.sq-preset:hover {
  border-color: ${_t};
  background: #1f2738;
}
.sq-sql {
  width: 100%;
  background: ${is};
  border: 1px solid ${je};
  color: ${ze};
  border-radius: 5px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}
.sq-sql:focus { outline: none; border-color: ${_t}; }
.sq-run-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sq-err {
  color: ${ur};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.sq-lastq {
  background: ${is};
  border: 1px solid ${je};
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
}
.sq-lastq-hd {
  font-size: 10px;
  color: ${Ce};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.sq-lastq-sql {
  color: ${ze};
  word-break: break-word;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px dashed ${je};
}
.sq-lastq-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.sq-lastq-grid > div { display: flex; justify-content: space-between; }
.sq-k { color: ${Ce}; }
.sq-v { color: ${ze}; font-weight: 600; }
.sq-lastq-shards {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sq-chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* stats bar */
.sq-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${nt};
  border: 1px solid ${je};
  border-radius: 6px;
  font-size: 12px;
  color: ${Ce};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sq-stats strong { color: ${ze}; font-weight: 600; margin-right: 2px; }

/* teaching cards */
.sq-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.sq-teach-col {
  background: ${nt};
  border: 1px solid ${je};
  border-left: 3px solid ${_t};
  border-radius: 5px;
  padding: 9px 12px;
}
.sq-teach-title {
  font-size: 13px;
  font-weight: 700;
  color: ${ze};
  margin-bottom: 5px;
}
.sq-teach-body {
  font-size: 11px;
  color: ${Ce};
  line-height: 1.6;
}
.sq-teach-body strong { color: ${ze}; }
.sq-teach-sub {
  margin-top: 4px;
  font-size: 11px;
  color: ${Ce};
}

/* status */
.sq-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  background: ${nt};
  border-left: 3px solid ${_t};
  border-radius: 4px;
  font-size: 12px;
  color: ${ze};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sq-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${_t};
  box-shadow: 0 0 8px ${_t};
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .sq-columns {
    grid-template-columns: 1fr;
  }
}
`;
function It(n=""){const t=Math.random().toString(36).slice(2,10);return n?`${n}_${t}`:t}
function Lh(n){let t=2166136261;for(let o=0;o<n.length;o++)t^=n.charCodeAt(o),t=Math.imul(t,16777619)>>>0;const s=(t^3735928559)>>>0;return`cc_${`${n.length}-${s.toString(36)}-${(t>>>0).toString(36)}`}`}
const ps=[{id:"happy-path",label:"Happy path (legitimate client)",description:"User logs in, auth server redirects with code, client exchanges code for access token, client calls API.",pkce:!0,attacker:!1},{id:"happy-path-no-pkce",label:"Happy path (confidential client, no PKCE)",description:"A server-side web app with a client_secret. PKCE not required because the secret proves client identity.",pkce:!1,attacker:!1},{id:"stolen-code-no-pkce",label:"Attack: stolen code, PKCE OFF (public client)",description:"A public SPA / mobile app with no secret. Attacker intercepts the redirect, races to /token, and wins.",pkce:!1,attacker:!0},{id:"stolen-code-with-pkce",label:"Defense: stolen code, PKCE ON",description:"Same attack, but PKCE is enabled. Attacker has the code but not the code_verifier → /token rejects.",pkce:!0,attacker:!0}];
class Wo{constructor(t={}){const s=t.scenarioId||"happy-path";this.scenarioId=s;const r=ps.find(o=>o.id===s)||ps[0];this.usePkce=typeof t.usePkce=="boolean"?t.usePkce:r.pkce,this.withAttacker=!!r.attacker,this.clientId="spa-demo-42",this.clientSecret=this.usePkce?null:"s3cr3t-shhh",this.redirectUri="https://app.example.com/callback",this.scope="profile email read:orders",this.state=It("state"),this.codeVerifier=this.usePkce?It("ver")+It("ver"):null,this.codeChallenge=this.usePkce?Lh(this.codeVerifier):null,this.authCode=null,this.accessToken=null,this.refreshToken=null,this.stolenCode=null,this.attackerWon=!1,this.currentStep=0,this.steps=this._buildSteps()}_buildSteps(){const t=[],s=a=>{t.push({id:t.length+1,...a})},r={response_type:"code",client_id:this.clientId,redirect_uri:this.redirectUri,scope:this.scope,state:this.state};this.usePkce&&(r.code_challenge=this.codeChallenge,r.code_challenge_method="S256"),s({from:"client",to:"userAgent",method:"HTTP 302",url:`${this._authorizeUrl()}?${Yr(r)}`,payload:{...r},note:this.usePkce?"Client generated a code_verifier and sends code_challenge = BASE64URL(SHA256(verifier)).":"No PKCE. Client relies on client_secret at the token endpoint.",tokens:this.usePkce?["code_challenge"]:[],highlight:"auth-request"}),s({from:"userAgent",to:"authServer",method:"GET",url:`${this._authorizeUrl()}?${Yr(r)}`,payload:{...r},note:"Browser hits /authorize with the client_id, scopes, state and PKCE challenge.",highlight:"auth-request"}),s({from:"authServer",to:"userAgent",method:"HTTP 200",url:"/login",payload:{prompt:"Sign in + approve scopes",scopes:this.scope.split(" ")},note:"User authenticates and consents to the requested scopes.",highlight:"user-consent"}),this.authCode=It("code");const o={code:this.authCode,state:this.state};if(s({from:"authServer",to:"userAgent",method:"HTTP 302",url:`${this.redirectUri}?${Yr(o)}`,payload:o,note:"Auth server redirects back to redirect_uri with a short-lived, single-use code.",tokens:["code"],highlight:"code-issued"}),this.withAttacker&&(this.stolenCode=this.authCode,s({from:"userAgent",to:"attacker",method:"leak",url:"referer / open-redirect / malicious app handler",payload:{code:this.authCode,state:this.state},note:"Attacker sniffs the code off the redirect (e.g. referer header, evil app registered for the custom scheme, network MITM).",tokens:["code"],highlight:"code-stolen"})),s({from:"userAgent",to:"client",method:"GET",url:`${this.redirectUri}?${Yr(o)}`,payload:o,note:"Browser hands the code to the client app (callback). Client verifies state matches what it stored.",tokens:["code"],highlight:"code-delivered"}),this.withAttacker&&!this.usePkce){const a={grant_type:"authorization_code",code:this.stolenCode,redirect_uri:this.redirectUri,client_id:this.clientId};return s({from:"attacker",to:"authServer",method:"POST",url:this._tokenUrl(),headers:{"Content-Type":"application/x-www-form-urlencoded"},payload:a,note:"Attacker races the legit client and redeems the code first. No PKCE + no client_secret = nothing to prove identity.",tokens:["code"],highlight:"attacker-token-request"}),this.accessToken=It("at"),this.refreshToken=It("rt"),this.attackerWon=!0,s({from:"authServer",to:"attacker",method:"HTTP 200",url:this._tokenUrl(),payload:{access_token:this.accessToken,refresh_token:this.refreshToken,token_type:"Bearer",expires_in:3600,scope:this.scope},note:"Auth server has no way to tell the attacker apart from the legit client. Tokens issued to the attacker.",tokens:["access_token","refresh_token"],highlight:"attacker-tokens"}),s({from:"client",to:"authServer",method:"POST",url:this._tokenUrl(),headers:{"Content-Type":"application/x-www-form-urlencoded"},payload:{grant_type:"authorization_code",code:this.authCode,redirect_uri:this.redirectUri,client_id:this.clientId},note:"Legit client redeems the code...",tokens:["code"],highlight:"client-token-request"}),s({from:"authServer",to:"client",method:"HTTP 400",url:this._tokenUrl(),payload:{error:"invalid_grant",error_description:"code already used"},note:"Code is single-use; attacker already burned it. Legit client is locked out.",fails:!0,failureReason:"invalid_grant (code reuse)",highlight:"client-token-fail"}),s({from:"attacker",to:"resourceServer",method:"GET",url:"https://api.example.com/me/orders",headers:{Authorization:`Bearer ${this.accessToken}`},note:"Attacker calls the API impersonating the user.",tokens:["access_token"],highlight:"attacker-api"}),s({from:"resourceServer",to:"attacker",method:"HTTP 200",payload:{user:"alice",orders:[{id:7,total:42}]},note:"Resource server trusts the bearer token. User data leaks.",highlight:"attacker-api-response"}),t}if(this.withAttacker&&this.usePkce){const a={grant_type:"authorization_code",code:this.stolenCode,redirect_uri:this.redirectUri,client_id:this.clientId,code_verifier:"attacker-guess-"+It()};s({from:"attacker",to:"authServer",method:"POST",url:this._tokenUrl(),headers:{"Content-Type":"application/x-www-form-urlencoded"},payload:a,note:"Attacker has the code but never saw the original code_verifier. They have to guess.",tokens:["code"],highlight:"attacker-token-request"}),s({from:"authServer",to:"attacker",method:"HTTP 400",url:this._tokenUrl(),payload:{error:"invalid_grant",error_description:"PKCE verifier does not match challenge"},note:"AS recomputes SHA256(verifier) and compares to the challenge it stored. Mismatch → reject.",fails:!0,failureReason:"PKCE verifier/challenge mismatch",highlight:"attacker-token-fail"})}const i={grant_type:"authorization_code",code:this.authCode,redirect_uri:this.redirectUri,client_id:this.clientId};return this.usePkce?i.code_verifier=this.codeVerifier:i.client_secret=this.clientSecret,s({from:"client",to:"authServer",method:"POST",url:this._tokenUrl(),headers:{"Content-Type":"application/x-www-form-urlencoded"},payload:i,note:this.usePkce?"Client sends code + code_verifier. AS hashes verifier and checks it matches the stored challenge.":"Confidential client authenticates with client_secret (usually via Basic auth or body param).",tokens:this.usePkce?["code","code_verifier"]:["code","client_secret"],highlight:"client-token-request"}),this.accessToken=It("at"),this.refreshToken=It("rt"),s({from:"authServer",to:"client",method:"HTTP 200",url:this._tokenUrl(),payload:{access_token:this.accessToken,refresh_token:this.refreshToken,token_type:"Bearer",expires_in:3600,scope:this.scope},note:"Tokens issued. Access token is short-lived; refresh token can mint new access tokens.",tokens:["access_token","refresh_token"],highlight:"client-tokens"}),s({from:"client",to:"resourceServer",method:"GET",url:"https://api.example.com/me/orders",headers:{Authorization:`Bearer ${this.accessToken}`},note:"Client attaches the access token in the Authorization header.",tokens:["access_token"],highlight:"api-call"}),s({from:"resourceServer",to:"client",method:"HTTP 200",payload:{user:"alice",orders:[{id:7,total:42}]},note:"Resource server validates the token (introspection or JWT verify) and returns the protected data.",highlight:"api-response"}),t}_authorizeUrl(){return"https://auth.example.com/authorize"}_tokenUrl(){return"https://auth.example.com/token"}step(t=1){for(let s=0;s<t&&this.currentStep<this.steps.length;s++)this.currentStep++;return this.steps[this.currentStep-1]||null}canStep(){return this.currentStep<this.steps.length}reset(t={}){const s=t.scenarioId||this.scenarioId,r=typeof t.usePkce=="boolean"?t.usePkce:this.usePkce,o=ps.find(a=>a.id===s)||ps[0],i=typeof t.usePkce=="boolean"?r:o.pkce;Object.assign(this,new Wo({usePkce:i,scenarioId:s}))}setPkce(t){this.reset({usePkce:!!t,scenarioId:this.scenarioId})}setScenario(t){this.reset({scenarioId:t})}tamper(t,s,r){const o=this.steps[t];return!o||!o.payload?null:(o.payload={...o.payload,[s]:r},o.tampered=!0,o)}snapshot(){return{scenarioId:this.scenarioId,pkce:this.usePkce,withAttacker:this.withAttacker,currentStep:this.currentStep,totalSteps:this.steps.length,steps:this.steps,current:this.steps[this.currentStep-1]||null,tokens:{code:this.authCode,codeVerifier:this.codeVerifier,codeChallenge:this.codeChallenge,accessToken:this.accessToken,refreshToken:this.refreshToken,clientSecret:this.clientSecret},stolenCode:this.stolenCode,attackerWon:this.attackerWon}}}
function Yr(n){return Object.entries(n).map(([t,s])=>`${encodeURIComponent(t)}=${encodeURIComponent(s)}`).join("&")}
const Fh=[{id:"client_credentials",label:"client_credentials",summary:"Machine-to-machine. No user. Client authenticates with its own credentials and gets an access token directly."},{id:"device_code",label:"device_code",summary:"TVs, CLIs, consoles: device shows a short code, user authorizes on their phone."},{id:"implicit",label:"implicit (deprecated)",summary:"Token returned directly in the redirect URL fragment. Dropped in OAuth 2.1 — fragment leaks, no refresh tokens, no PKCE guarantee."},{id:"password",label:"resource_owner_password (deprecated)",summary:"Client collects the user's password directly. Defeats the whole point of OAuth. Do not use."},{id:"refresh_token",label:"refresh_token",summary:"Exchange a refresh_token for a new access_token when the old one expires."}],so=900,ro=72,Xr=56,Yi=110,Jr={client:"#4a8fd8",userAgent:"#f5c542",authServer:"#a15cff",resourceServer:"#3a9c6a",attacker:"#d9534f"},no={client:"Client app",userAgent:"User-agent",authServer:"Auth server",resourceServer:"Resource server",attacker:"Attacker"},Dh={client:"SPA / web backend",userAgent:"Browser",authServer:"/authorize, /token",resourceServer:"Protected API",attacker:"MITM / evil app"},Qr={code:"#f5c542",code_challenge:"#c089ff",code_verifier:"#c089ff",access_token:"#3a9c6a",refresh_token:"#4a8fd8",client_secret:"#d9534f"},Xi=`
.oauth-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 1000px;
}
.oauth-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.oauth-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.oauth-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
}
.oauth-toolbar button,
.oauth-toolbar select {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.oauth-toolbar button:hover { background: #232a33; }
.oauth-toolbar button.primary { background: #2c5aa0; border-color: #3c6ab0; }
.oauth-toolbar button.primary:hover { background: #3467b0; }
.oauth-toolbar button.active { background: #3a4250; border-color: #5a6878; }
.oauth-toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
.oauth-toolbar .group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 2px 6px;
  border-left: 1px solid #2a3038;
  border-right: 1px solid #2a3038;
}
.oauth-toolbar .group-label { font-size: 11px; color: #8a95a3; }
.oauth-toolbar .spacer { flex: 1; }

.oauth-pkce-toggle {
  display: inline-flex;
  gap: 4px;
  border: 1px solid #3a4250;
  border-radius: 4px;
  overflow: hidden;
}
.oauth-pkce-toggle button {
  border: none;
  border-radius: 0;
  padding: 4px 10px;
  background: #1a1f26;
}
.oauth-pkce-toggle button.on { background: #1f5c3a; color: #b6f0c4; }
.oauth-pkce-toggle button.off { background: #6b2a2a; color: #f0b6b6; }

.oauth-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
}
.oauth-canvas-wrap {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  position: relative;
  overflow: auto;
  max-height: 640px;
}
.oauth-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oauth-card {
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
}
.oauth-card .hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-weight: 600;
}
.oauth-card .meta { color: #8a95a3; font-size: 11px; margin-bottom: 4px; }
.oauth-card pre {
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

.oauth-tok {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  background: #2a3038;
  color: #cfd6e0;
  margin-right: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.oauth-step-row {
  cursor: pointer;
}
.oauth-step-row:hover .oauth-step-bg { fill: #141a22; }
.oauth-step-row.current .oauth-step-bg { fill: #18222e; }
.oauth-step-row.fails .oauth-step-bg { fill: #2a1616; }

.oauth-footer {
  margin-top: 12px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #cfd6e0;
}
.oauth-footer h3 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #f5c542;
}
.oauth-footer ul { margin: 4px 0 0 0; padding-left: 18px; }
.oauth-footer li { margin: 2px 0; }
.oauth-footer .muted { color: #8a95a3; }
.oauth-footer code {
  background: #0a0e13;
  border: 1px solid #2a3038;
  padding: 0 3px;
  border-radius: 2px;
  font-size: 11px;
}

.oauth-status {
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
.oauth-status.error { color: #ff8a8a; }
.oauth-status.good { color: #6be0a2; }
.oauth-status.warn { color: #f5c542; }

.oauth-widget svg text { user-select: none; }
@keyframes oauth-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.oauth-glow { animation: oauth-glow 1.4s ease-in-out infinite; }
@keyframes oauth-march {
  to { stroke-dashoffset: -20; }
}
.oauth-march { stroke-dasharray: 6 4; animation: oauth-march 0.7s linear infinite; }
`;
function Ji(n){if(!n)return"";try{return JSON.stringify(n,null,2)}catch{return String(n)}}
function qh(){var T,_,b;const n=h.useRef(null),[t,s]=h.useState("happy-path"),[r,o]=h.useState(!0),[i,a]=h.useState(null),[l,d]=h.useState(!1),[c,p]=h.useState(1),[m,g]=h.useState(0);h.useEffect(()=>{n.current=new Wo({usePkce:r,scenarioId:t}),a(n.current.snapshot()),p(1),d(!1)},[t,r,m]);const w=x=>{const f=ps.find(u=>u.id===x);f&&(s(x),o(f.pkce))},C=h.useCallback(()=>{const x=n.current;if(!x)return;if(!x.canStep()){d(!1);return}p(0),x.step(1),a(x.snapshot());const f=performance.now(),u=500,y=v=>{const I=Math.min(1,(v-f)/u);p(I),I<1&&requestAnimationFrame(y)};requestAnimationFrame(y)},[]);h.useEffect(()=>{if(!l)return;const x=n.current;if(!x)return;if(!x.canStep()){d(!1);return}const f=setTimeout(()=>C(),800);return()=>clearTimeout(f)},[l,i,C]);const j=()=>g(x=>x+1),$=h.useMemo(()=>{const x=["client","userAgent","authServer","resourceServer"];return i!=null&&i.withAttacker&&x.push("attacker"),x},[i==null?void 0:i.withAttacker]),O=h.useMemo(()=>{const x=$.length,f=90,u=so-f*2,y=x>1?u/(x-1):0,v={};return $.forEach((I,S)=>{v[I]=f+S*y}),v},[$]);if(!i)return e.jsxs("div",{className:"oauth-widget",children:[e.jsx("style",{children:Xi}),e.jsx("h2",{children:"OAuth 2.0 Authorization Code Flow — System Design Primer"}),e.jsx("p",{className:"sub",children:"initializing..."})]});const q=i.steps,R=i.currentStep-1,D=Yi+q.length*ro+40,B=(()=>{if(i.currentStep===0)return"Press Step or Play to walk through the flow.";const x=q[R];if(!x)return"done.";const f=`Step ${x.id}/${q.length}: `;return x.fails?f+"FAILURE — "+(x.failureReason||x.note):i.attackerWon&&x.from==="attacker"&&x.to==="resourceServer"?f+"Attacker impersonated the user!":f+x.note})(),V=(()=>{const x=q[R];return x?x.fails||i.attackerWon&&x.from==="attacker"?"error":x.highlight==="api-response"&&!i.attackerWon||x.highlight==="attacker-token-fail"?"good":x.highlight==="code-stolen"?"warn":"":""})();return e.jsxs("div",{className:"oauth-widget",children:[e.jsx("style",{children:Xi}),e.jsxs("h2",{children:[e.jsx("span",{children:"OAuth 2.0 Authorization Code Flow — System Design Primer"}),e.jsxs("span",{style:{display:"flex",gap:8},children:[e.jsx("button",{onClick:C,disabled:!n.current||!n.current.canStep(),children:"Step"}),e.jsx("button",{className:l?"active":"primary",onClick:()=>d(x=>!x),disabled:!n.current||!n.current.canStep(),children:l?"Pause":"Play"}),e.jsx("button",{onClick:j,children:"Reset"})]})]}),e.jsx("p",{className:"sub",children:"RFC 6749 authorization_code grant, with optional RFC 7636 PKCE. Four actors pass six HTTP messages; most vulnerabilities live in the redirect/code-exchange step."}),e.jsxs("div",{className:"oauth-toolbar",children:[e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"Scenario:"}),e.jsx("select",{value:t,onChange:x=>w(x.target.value),children:ps.map(x=>e.jsx("option",{value:x.id,children:x.label},x.id))})]}),e.jsxs("div",{className:"group",children:[e.jsx("span",{className:"group-label",children:"PKCE:"}),e.jsxs("div",{className:"oauth-pkce-toggle",children:[e.jsx("button",{className:r?"on":"",onClick:()=>o(!0),children:"ON"}),e.jsx("button",{className:r?"":"off",onClick:()=>o(!1),children:"OFF"})]})]}),e.jsx("span",{className:"spacer"}),e.jsxs("span",{style:{fontSize:11,color:"#8a95a3"},children:["step ",i.currentStep," / ",i.totalSteps,i.withAttacker&&e.jsxs(e.Fragment,{children:[" · ",e.jsx("span",{style:{color:"#ff8a8a"},children:"attacker present"})]})]})]}),e.jsxs("div",{className:"oauth-main",children:[e.jsx("div",{className:"oauth-canvas-wrap",children:e.jsxs("svg",{width:so,height:D,children:[e.jsxs("defs",{children:[e.jsx("marker",{id:"oauth-arrow",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#8a95a3"})}),e.jsx("marker",{id:"oauth-arrow-current",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#f5c542"})}),e.jsx("marker",{id:"oauth-arrow-fail",markerWidth:"8",markerHeight:"8",refX:"7",refY:"4",orient:"auto",markerUnits:"strokeWidth",children:e.jsx("path",{d:"M0,0 L8,4 L0,8 z",fill:"#d9534f"})})]}),$.map(x=>{const f=O[x];return e.jsxs("g",{children:[e.jsx("rect",{x:f-70,y:Xr-26,width:140,height:40,rx:6,fill:"#161b22",stroke:Jr[x],strokeWidth:"2"}),e.jsx("text",{x:f,y:Xr-10,textAnchor:"middle",fill:Jr[x],fontSize:"13",fontWeight:"700",children:no[x]}),e.jsx("text",{x:f,y:Xr+5,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",children:Dh[x]}),e.jsx("line",{x1:f,y1:Xr+18,x2:f,y2:D-12,stroke:"#1e252e",strokeWidth:"1.5",strokeDasharray:"3 4"})]},x)}),q.map((x,f)=>{const u=Yi+f*ro,y=O[x.from],v=O[x.to];if(y==null||v==null)return null;const I=f===R,S=f<R,H=v>y?1:-1,M=v-H*10,k="oauth-step-row"+(I?" current":"")+(x.fails?" fails":""),P=I?y+(M-y)*c:M,N=x.fails?"#d9534f":I?"#f5c542":S?"#8a95a3":"#3a4250",z=x.fails?"url(#oauth-arrow-fail)":I?"url(#oauth-arrow-current)":"url(#oauth-arrow)";return e.jsxs("g",{className:k,onClick:()=>{},children:[e.jsx("rect",{className:"oauth-step-bg",x:8,y:u-18,width:so-16,height:ro-6,rx:4,fill:I?"#18222e":"transparent"}),e.jsx("text",{x:20,y:u+4,fill:"#8a95a3",fontSize:"11",fontFamily:"ui-monospace, Menlo, monospace",children:String(x.id).padStart(2,"0")}),e.jsxs("text",{x:Math.min(y,v)+Math.abs(v-y)/2,y:u-6,textAnchor:"middle",fill:I?"#f5c542":"#cfd6e0",fontSize:"11",fontWeight:"600",children:[x.method,x.url?`  ${Wh(x.url)}`:""]}),e.jsx("line",{x1:y+H*10,y1:u,x2:S||I?P:M,y2:u,stroke:N,strokeWidth:I?2.5:1.5,markerEnd:I||S?z:"url(#oauth-arrow)",className:I?"oauth-march":"",opacity:f>R?.35:1}),I&&e.jsx("circle",{cx:y+(M-y)*c,cy:u,r:6,fill:x.fails?"#d9534f":"#f5c542",className:"oauth-glow"}),x.tokens&&x.tokens.length>0&&(I||S)&&e.jsx("g",{children:x.tokens.map((E,J)=>{const Y=Math.min(y,v)+Math.abs(v-y)/2;return e.jsxs("g",{children:[e.jsx("rect",{x:Y-40+J*86,y:u+6,width:80,height:16,rx:3,fill:Qr[E]||"#555",opacity:.25}),e.jsx("text",{x:Y+J*86,y:u+18,textAnchor:"middle",fill:Qr[E]||"#cfd6e0",fontSize:"10",fontWeight:"700",fontFamily:"ui-monospace, Menlo, monospace",children:E})]},E+J)})}),x.fails&&(I||S)&&e.jsxs("g",{children:[e.jsx("rect",{x:M-46,y:u-22,width:44,height:14,rx:2,fill:"#6b2a2a"}),e.jsx("text",{x:M-24,y:u-12,textAnchor:"middle",fill:"#f0b6b6",fontSize:"9",fontWeight:"700",children:"FAIL"})]})]},x.id)})]})}),e.jsxs("div",{className:"oauth-side",children:[e.jsxs("div",{className:"oauth-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Current step"}),e.jsx("span",{style:{color:"#8a95a3"},children:i.currentStep===0?"—":`${i.currentStep}/${i.totalSteps}`})]}),q[R]?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"meta",children:[e.jsx("span",{style:{color:Jr[q[R].from]},children:no[q[R].from]})," → ",e.jsx("span",{style:{color:Jr[q[R].to]},children:no[q[R].to]})]}),e.jsxs("div",{style:{fontSize:11,color:"#cfd6e0",marginBottom:4},children:[e.jsx("b",{children:q[R].method}),q[R].url&&e.jsxs(e.Fragment,{children:[" ",q[R].url]})]}),q[R].headers&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{fontSize:11,color:"#8a95a3"},children:"headers"}),e.jsx("pre",{children:Ji(q[R].headers)})]}),q[R].payload&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{fontSize:11,color:"#8a95a3"},children:q[R].method==="POST"?"body":"params / payload"}),e.jsx("pre",{children:Ji(q[R].payload)})]}),((T=q[R].tokens)==null?void 0:T.length)>0&&e.jsx("div",{style:{marginTop:4},children:q[R].tokens.map(x=>e.jsx("span",{className:"oauth-tok",style:{background:(Qr[x]||"#555")+"33",color:Qr[x]||"#cfd6e0"},children:x},x))}),e.jsx("div",{style:{marginTop:6,color:"#8a95a3",fontSize:11},children:q[R].note})]}):e.jsx("div",{className:"meta",children:"No step selected yet."})]}),e.jsxs("div",{className:"oauth-card",children:[e.jsxs("div",{className:"hdr",children:[e.jsx("span",{children:"Session state"}),e.jsxs("span",{style:{color:i.pkce?"#6be0a2":"#ff8a8a"},children:["PKCE ",i.pkce?"ON":"OFF"]})]}),e.jsxs("div",{className:"meta",children:["client_id: ",e.jsx("code",{children:(_=n.current)==null?void 0:_.clientId})]}),i.tokens.codeVerifier&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#c089ff33",color:"#c089ff"},children:"code_verifier"}),e.jsxs("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:[i.tokens.codeVerifier.slice(0,18),"…"]})]}),i.tokens.codeChallenge&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#c089ff33",color:"#c089ff"},children:"code_challenge"}),e.jsxs("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:[i.tokens.codeChallenge.slice(0,18),"…"]})]}),i.tokens.clientSecret&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#d9534f33",color:"#d9534f"},children:"client_secret"}),e.jsx("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:i.tokens.clientSecret})]}),i.tokens.code&&i.currentStep>=4&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#f5c54233",color:"#f5c542"},children:"code"}),e.jsx("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:i.tokens.code})]}),i.tokens.accessToken&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#3a9c6a33",color:"#3a9c6a"},children:"access_token"}),e.jsx("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:i.tokens.accessToken})]}),i.tokens.refreshToken&&e.jsxs("div",{className:"meta",children:[e.jsx("span",{className:"oauth-tok",style:{background:"#4a8fd833",color:"#4a8fd8"},children:"refresh_token"}),e.jsx("span",{style:{fontFamily:"ui-monospace, Menlo, monospace"},children:i.tokens.refreshToken})]}),i.stolenCode&&e.jsxs("div",{style:{marginTop:6,color:"#ff8a8a",fontSize:11},children:["Attacker has stolen code: ",e.jsx("code",{children:i.stolenCode}),i.attackerWon?" — and already redeemed it for tokens.":" — but PKCE blocked the token exchange."]})]}),e.jsxs("div",{className:"oauth-card",children:[e.jsx("div",{className:"hdr",children:e.jsx("span",{children:"Scenario notes"})}),e.jsx("div",{className:"meta",children:(b=ps.find(x=>x.id===t))==null?void 0:b.description})]})]})]}),e.jsx("div",{className:`oauth-status ${V}`,children:B}),e.jsxs("div",{className:"oauth-footer",children:[e.jsx("h3",{children:"What breaks without PKCE?"}),e.jsxs("p",{style:{margin:"2px 0 6px 0"},children:["A public client (SPA, mobile, native) cannot safely hold a ",e.jsx("code",{children:"client_secret"}),". Without PKCE, the authorization code on the ",e.jsx("code",{children:"redirect_uri"})," is the",e.jsx("em",{children:" only"})," thing proving identity at ",e.jsx("code",{children:"/token"})," — and it travels through the browser. Any component that can read the redirect (a malicious app registered for a custom URL scheme, a rogue browser extension, a compromised referer header, even HTTP logs) can race the legitimate client to",e.jsx("code",{children:" /token"})," and win, since codes are single-use but the auth server can’t tell the two requests apart. PKCE binds the code to a secret (",e.jsx("code",{children:"code_verifier"}),") that never left the original client, so a stolen code alone is useless."]}),e.jsx("h3",{style:{marginTop:8},children:"Other OAuth 2.0 grants (not shown)"}),e.jsx("ul",{children:Fh.map(x=>e.jsxs("li",{children:[e.jsx("code",{children:x.label})," ",e.jsxs("span",{className:"muted",children:["— ",x.summary]})]},x.id))})]})]})}
function Wh(n){if(!n)return"";if(n.length<=56)return n;const t=n.indexOf("?");return t>0&&t<48?n.slice(0,t)+"?…":n.slice(0,52)+"…"}

export default qh;
export { qh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(qh, {}));
  return () => root.unmount();
}
