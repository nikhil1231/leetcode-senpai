import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class Zt{constructor(){this.main=[],this.min=[],this.ops=0}push(t){this.main.push(t);const s=this.min.length===0?t:Math.min(t,this.min[this.min.length-1]);return this.min.push(s),this.ops++,{kind:"push",value:t,pushedMin:s}}pop(){if(this.main.length===0)return this.ops++,{kind:"pop",ok:!1};const t=this.main.pop(),s=this.min.pop();return this.ops++,{kind:"pop",ok:!0,value:t,minValue:s}}top(){return this.main.length===0?{kind:"top",ok:!1}:{kind:"top",ok:!0,value:this.main[this.main.length-1]}}getMin(){return this.ops++,this.min.length===0?{kind:"getMin",ok:!1}:{kind:"getMin",ok:!0,value:this.min[this.min.length-1]}}snapshot(){return{main:this.main.slice(),min:this.min.slice(),ops:this.ops}}}
function Ma(a){const t=new Zt,s=[];s.push({kind:"init",snap:t.snapshot(),note:"Empty stack. Each push pushes min(top, value) onto the parallel min-stack → getMin is O(1).",flash:null});for(const o of a)if(o.op==="push"){const n=t.push(o.value);s.push({kind:"push",snap:t.snapshot(),note:`push(${o.value}) → main top = ${o.value}, min top = ${n.pushedMin}.`,flash:"main-top"})}else if(o.op==="pop"){const n=t.pop();s.push({kind:"pop",snap:t.snapshot(),note:n.ok?`pop() → removed ${n.value} (its min was ${n.minValue}). Both stacks pop together.`:"pop() on empty stack — no-op.",flash:"both-top"})}else if(o.op==="getMin"){const n=t.getMin();s.push({kind:"getMin",snap:t.snapshot(),note:n.ok?`getMin() = ${n.value} (top of min-stack, no scan).`:"getMin() on empty stack — undefined.",flash:"min-top"})}return s}
const za=[{op:"push",value:3},{op:"push",value:5},{op:"push",value:2},{op:"push",value:1},{op:"getMin"},{op:"pop"},{op:"getMin"}],Ca=`
.mns-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.mns-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.mns-title { font-weight: 600; font-size: 15px; }
.mns-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.mns-head-right { display: flex; gap: 8px; align-items: center; }
.mns-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.mns-input {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 90px;
}
.mns-input:focus { outline: none; border-color: #4a7cff; }
.mns-btn {
  padding: 6px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.mns-btn:hover { background: #3b6ae8; }
.mns-btn:disabled { background: #2a2f3e; color: #6a7389; cursor: not-allowed; }
.mns-btn.mns-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.mns-btn.mns-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.mns-btn.mns-danger { background: #c13c3c; }
.mns-btn.mns-danger:hover { background: #a73232; }
.mns-btn.mns-green { background: #4a9f6f; }
.mns-btn.mns-green:hover { background: #3d8a5e; }
.mns-quick { font-size: 12px; color: #8a93a8; margin-right: 4px; }

.mns-canvas-wrap {
  flex: 1;
  min-height: 320px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.mns-stacks {
  display: grid;
  grid-template-columns: 200px 200px;
  gap: 48px;
}
.mns-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mns-panel-title {
  font-size: 11px;
  color: #8a93a8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
  text-align: center;
}
.mns-stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  padding: 12px;
  border: 1px dashed #2a2f3e;
  border-radius: 10px;
  background: rgba(74, 124, 255, 0.04);
  min-height: 240px;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
}
.mns-stack.mns-min .mns-item {
  background: #2d3320;
  border-color: #b09a3a;
}
.mns-stack.mns-min .mns-item.mns-top {
  border-color: #ffd24a;
  filter: drop-shadow(0 0 8px rgba(255, 210, 74, 0.5));
}
.mns-empty {
  color: #6a7389;
  font-style: italic;
  font-size: 12px;
  margin: auto;
}
.mns-item {
  width: 110px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #2a3550;
  border: 1.5px solid #4a5f8f;
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  text-align: center;
  animation: mns-in 280ms ease-out 1;
}
.mns-item.mns-top {
  border-color: #4a7cff;
  filter: drop-shadow(0 0 8px rgba(74, 124, 255, 0.4));
}
.mns-item.mns-flash-push {
  animation: mns-pulse-blue 600ms ease-out 1;
}
.mns-item.mns-flash-pop {
  animation: mns-pulse-red 600ms ease-out 1;
}
.mns-item.mns-flash-min {
  animation: mns-pulse-yellow 800ms ease-out 1;
}
@keyframes mns-in {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes mns-pulse-blue {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(74, 124, 255, 0)); transform: scale(1); }
  50%      { filter: drop-shadow(0 0 16px rgba(74, 124, 255, 0.9)); transform: scale(1.08); }
}
@keyframes mns-pulse-red {
  0%   { filter: drop-shadow(0 0 0 rgba(255, 92, 92, 0)); transform: scale(1); }
  50%  { filter: drop-shadow(0 0 16px rgba(255, 92, 92, 0.9)); transform: scale(1.1); }
  100% { filter: drop-shadow(0 0 0 rgba(255, 92, 92, 0)); transform: scale(0.9); opacity: 0.3; }
}
@keyframes mns-pulse-yellow {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(255, 210, 74, 0)); transform: scale(1); }
  50%      { filter: drop-shadow(0 0 18px rgba(255, 210, 74, 0.95)); transform: scale(1.12); }
}

.mns-base-label {
  font-size: 10px;
  color: #6a7389;
  margin-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.mns-log {
  margin-top: 18px;
  padding: 10px 14px;
  background: #141925;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #8a93a8;
  max-height: 120px;
  overflow: auto;
  width: 100%;
}
.mns-log-line { padding: 2px 0; }
.mns-log-line.mns-log-latest { color: #ffd24a; }

.mns-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #141925;
  border-top: 1px solid #2a2f3e;
  font-size: 13px;
  gap: 16px;
  flex-wrap: wrap;
}
.mns-status { color: #d1d5db; flex: 1; min-width: 0; }
.mns-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.mns-stats b { color: #e6e6e6; }
.mns-minval b { color: #ffd24a; }
`;
function Ra(){const[a,t]=h.useState("manual"),s=h.useRef(new Zt),[o,n]=h.useState(()=>s.current.snapshot()),[c,r]=h.useState({kind:null,where:null}),[l,i]=h.useState("Try push/pop/getMin, or click 'Run demo' to see push 3, 5, 2, 1, getMin, pop, getMin."),[d,f]=h.useState([]),[p,u]=h.useState(""),m=h.useRef(null),w=h.useMemo(()=>Ma(za),[]),[b,k]=h.useState(0),[$,g]=h.useState(!1),z=h.useRef(null);h.useEffect(()=>()=>{m.current&&clearTimeout(m.current),z.current&&clearTimeout(z.current)},[]),h.useEffect(()=>{if(!(a!=="scripted"||!$)){if(b>=w.length-1){g(!1);return}return z.current=setTimeout(()=>k(S=>S+1),900),()=>clearTimeout(z.current)}},[a,$,b,w.length]);function F(S){m.current&&clearTimeout(m.current),r({kind:S,where:Date.now()}),m.current=setTimeout(()=>r({kind:null,where:null}),700)}function M(S){f(P=>[...P.slice(-19),S])}function y(){const S=Number(p);if(!Number.isFinite(S)){i("Push needs a numeric value.");return}const P=s.current.push(S);n(s.current.snapshot()),F("push"),i(`push(${S}): main.top = ${S}, min.top = ${P.pushedMin}${S===P.pushedMin?" (new minimum)":""}.`),M(`push(${S}) → min=${P.pushedMin}`),u("")}function C(){const S=s.current.pop();if(n(s.current.snapshot()),!S.ok){i("pop(): stack is empty — no-op."),M("pop() → empty");return}F("pop"),i(`pop(): removed ${S.value}. Its parallel min was ${S.minValue}. Both stacks pop in lockstep.`),M(`pop() → ${S.value}`)}function T(){const S=s.current.getMin();if(n(s.current.snapshot()),!S.ok){i("getMin(): stack is empty."),M("getMin() → ∅");return}F("min"),i(`getMin() = ${S.value} — O(1), just read the top of the min-stack.`),M(`getMin() → ${S.value}`)}function v(){s.current=new Zt,n(s.current.snapshot()),F(null),i("Cleared. Both stacks are empty."),f([])}function I(){t("scripted"),k(0),g(!1)}function j(){t("manual"),g(!1)}const x=a==="manual"?o:w[b].snap,N=a==="manual"?c.kind:w[b].flash==="main-top"?"push":w[b].flash==="both-top"?"pop":w[b].flash==="min-top"?"min":null,E=a==="manual"?l:w[b].note,A=x.min.length>0?x.min[x.min.length-1]:null,R=(S,P)=>{const L=S.length-1;return e.jsx("div",{className:"mns-stack"+(P?" mns-min":""),children:S.length===0?e.jsx("div",{className:"mns-empty",children:"empty"}):S.map((B,q)=>{const D=q===L,_=["mns-item"];return D&&_.push("mns-top"),D&&N==="push"&&!P&&_.push("mns-flash-push"),D&&N==="push"&&P&&_.push("mns-flash-push"),D&&N==="pop"&&_.push("mns-flash-pop"),D&&N==="min"&&P&&_.push("mns-flash-min"),e.jsx("div",{className:_.join(" "),children:B},`${P?"m":"s"}-${q}-${B}-${x.ops}`)})})};return e.jsxs("div",{className:"mns-root",children:[e.jsx("style",{children:Ca}),e.jsxs("div",{className:"mns-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"mns-title",children:"Min Stack — O(1) getMin via parallel stack"}),e.jsx("div",{className:"mns-sub",children:"Every push also pushes min(top, value) onto a second stack. Pop removes from both together."})]}),e.jsxs("div",{className:"mns-head-right",children:[e.jsx("button",{className:"mns-btn "+(a==="manual"?"":"mns-ghost"),onClick:j,children:"Manual"}),e.jsx("button",{className:"mns-btn "+(a==="scripted"?"":"mns-ghost"),onClick:I,children:"Run demo"}),e.jsx("button",{className:"mns-btn mns-danger",onClick:v,children:"Clear"})]})]}),e.jsx("div",{className:"mns-bar",children:a==="manual"?e.jsxs(e.Fragment,{children:[e.jsx("input",{className:"mns-input",type:"number",placeholder:"value",value:p,onChange:S=>u(S.target.value),onKeyDown:S=>S.key==="Enter"&&y()}),e.jsx("button",{className:"mns-btn",onClick:y,children:"Push"}),e.jsx("button",{className:"mns-btn mns-ghost",onClick:C,disabled:x.main.length===0,children:"Pop"}),e.jsx("button",{className:"mns-btn mns-green",onClick:T,disabled:x.main.length===0,children:"getMin"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"mns-quick",children:"Quick:"}),[3,5,2,1,7,4].map(S=>e.jsxs("button",{className:"mns-btn mns-ghost",onClick:()=>{const P=s.current.push(S);n(s.current.snapshot()),F("push"),i(`push(${S}): main.top = ${S}, min.top = ${P.pushedMin}.`),M(`push(${S}) → min=${P.pushedMin}`)},children:["push ",S]},S))]}):e.jsxs(e.Fragment,{children:[e.jsx("button",{className:"mns-btn mns-ghost",onClick:()=>{g(!1),k(S=>Math.max(S-1,0))},disabled:b===0,children:"◀ Back"}),e.jsx("button",{className:"mns-btn",onClick:()=>{g(!1),k(S=>Math.min(S+1,w.length-1))},disabled:b>=w.length-1,children:"Step ▶"}),e.jsx("button",{className:"mns-btn mns-ghost",onClick:()=>g(S=>!S),disabled:b>=w.length-1,children:$?"Pause":"Play"}),e.jsx("button",{className:"mns-btn mns-ghost",onClick:()=>{g(!1),k(0)},children:"Restart"}),e.jsx("span",{style:{flex:1}}),e.jsx("span",{className:"mns-quick",children:"Demo: push 3, push 5, push 2, push 1, getMin, pop, getMin"}),e.jsxs("span",{className:"mns-quick",children:["(",Math.min(b+1,w.length),"/",w.length,")"]})]})}),e.jsx("div",{className:"mns-canvas-wrap",children:e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center"},children:[e.jsxs("div",{className:"mns-stacks",children:[e.jsxs("div",{className:"mns-col",children:[e.jsx("div",{className:"mns-panel-title",children:"Main stack"}),R(x.main,!1),e.jsx("div",{className:"mns-base-label",children:"base"})]}),e.jsxs("div",{className:"mns-col",children:[e.jsx("div",{className:"mns-panel-title",children:"Min stack (top = current min)"}),R(x.min,!0),e.jsx("div",{className:"mns-base-label",children:"base"})]})]}),d.length>0&&a==="manual"&&e.jsx("div",{className:"mns-log",children:d.map((S,P)=>e.jsx("div",{className:"mns-log-line"+(P===d.length-1?" mns-log-latest":""),children:S},P))})]})}),e.jsxs("div",{className:"mns-footer",children:[e.jsxs("div",{className:"mns-status",children:["Status: ",E]}),e.jsxs("div",{className:"mns-stats",children:["main=",e.jsx("b",{children:x.main.length}),"   min=",e.jsx("b",{children:x.min.length}),"  ",e.jsxs("span",{className:"mns-minval",children:["min-top=",e.jsx("b",{children:A===null?"∅":A})]}),a==="scripted"&&e.jsxs(e.Fragment,{children:["  frame=",e.jsxs("b",{children:[b+1,"/",w.length]})]})]})]})]})}

export default Ra;
export { Ra as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ra, {}));
  return () => root.unmount();
}
