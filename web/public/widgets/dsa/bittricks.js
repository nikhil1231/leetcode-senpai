import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const _e=32;
function wt(a){if(a==null)return NaN;const t=String(a).trim();if(t.length===0)return NaN;let s;if(/^-?0x[0-9a-f]+$/i.test(t))s=parseInt(t,16);else if(/^-?\d+$/.test(t))s=parseInt(t,10);else return NaN;return Number.isFinite(s)?s>>>0:NaN}
function Kr(a){const t=a>>>0,s=new Array(_e);for(let o=0;o<_e;o++)s[o]=t>>>_e-1-o&1;return s}
function Ye(a){return"0x"+(a>>>0).toString(16).padStart(8,"0").toUpperCase()}
function vt(a){return~(a>>>0)+1>>>0}
function bt(a){const t=a>>>0,s=[];let o=t;for(;o!==0;){const n=o-1>>>0,c=(o&n)>>>0,r=(o&~c)>>>0,l=fn(r);s.push({n:o,nMinus1:n,result:c,clearedIndex:l,clearedMask:r}),o=c}return{start:t,steps:s,count:s.length}}
function Hr(a){const t=a>>>0,s=t-1>>>0,o=(t&s)>>>0,n=t>0&&o===0;return{n:t,nMinus1:s,and:o,ok:n}}
function Gr(a){const t=a>>>0,s=vt(t),o=(t&s)>>>0,n=o===0?-1:fn(o);return{n:t,neg:s,iso:o,idx:n}}
function fn(a){const t=a>>>0;if(t===0)return-1;const s=(t&vt(t))>>>0;return Math.round(Math.log2(s))}
function Vr(a,t){const s=[];let o=a>>>0,n=t>>>0;return s.push({label:"initial",a:o,b:n,changed:null}),o=(o^n)>>>0,s.push({label:"a ^= b",a:o,b:n,changed:"a"}),n=(o^n)>>>0,s.push({label:"b ^= a",a:o,b:n,changed:"b"}),o=(o^n)>>>0,s.push({label:"a ^= b",a:o,b:n,changed:"a"}),s}
function en(a,t=512){const s=a>>>0,o=[];if(s===0)return o.push({sub:0,prev:0}),{mask:s,subsets:o,truncated:!1};let n=s,c=0,r=!1;for(;o.push({sub:n>>>0,prev:n>>>0}),n!==0;)if(n=(n-1&s)>>>0,c++,c>t){r=!0;break}return{mask:s,subsets:o,truncated:r}}
function Xr(a,t,s){const o=a>>>0;if(!Number.isFinite(t)||t<0||t>31)return{ok:!1,reason:"index out of range [0, 31]",before:o,after:o,mask:0};const n=1<<t>>>0;let c;switch(s){case"set":c=(o|n)>>>0;break;case"clear":c=(o&~n)>>>0;break;case"toggle":c=(o^n)>>>0;break;default:return{ok:!1,reason:"unknown op",before:o,after:o,mask:n}}return{ok:!0,before:o,after:c,mask:n,index:t,op:s}}
function Yr(a){const t=a>>>0,s=Math.clz32(t);return{n:t,clz:s,firstOneIndex:t===0?-1:31-s}}
function Qr(a){const t=a>>>0;if(t===0)return{n:t,ctz:32,iso:0,firstOneIndex:-1};const s=(t&vt(t))>>>0,o=Math.round(Math.log2(s));return{n:t,ctz:o,iso:s,firstOneIndex:o}}
const Zr=`
.btx-root {
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
.btx-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
  gap: 12px;
  flex-wrap: wrap;
}
.btx-title { font-weight: 600; font-size: 15px; }
.btx-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.btx-head-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.btx-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.btx-input, .btx-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.btx-input { width: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.btx-input.btx-input-sm { width: 70px; }
.btx-input:focus, .btx-select:focus {
  outline: none; border-color: #4a7cff;
}
.btx-btn {
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
.btx-btn:hover { background: #3b6ae8; }
.btx-btn:disabled { background: #2a2f3e; color: #6a7389; cursor: not-allowed; }
.btx-btn.btx-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.btx-btn.btx-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.btx-label { font-size: 12px; color: #8a93a8; }
.btx-canvas {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 16px 20px;
}
.btx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
  flex-wrap: nowrap;
}
.btx-row-label {
  width: 130px;
  flex-shrink: 0;
  font-size: 12px;
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: right;
}
.btx-row-label b { color: #e6e6e6; font-weight: 600; }
.btx-bits {
  display: flex;
  gap: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.btx-bit {
  width: 16px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: #141925;
  color: #3a4560;
  border: 1px solid #1e2433;
  transition: background 250ms ease, color 250ms ease, border-color 250ms ease, box-shadow 250ms ease;
}
.btx-bit.btx-on {
  background: #1a2a40;
  color: #9ec2ff;
  border-color: #2a4060;
}
.btx-bit.btx-sep-left { margin-left: 4px; }
.btx-bit.btx-hl-accent {
  background: #2a3550;
  color: #bcd0ff;
  border-color: #4a7cff;
  box-shadow: 0 0 6px rgba(74, 124, 255, 0.55);
}
.btx-bit.btx-hl-amber {
  background: #3a2f15;
  color: #ffe69c;
  border-color: #ffd24a;
  box-shadow: 0 0 6px rgba(255, 210, 74, 0.55);
}
.btx-bit.btx-hl-green {
  background: #1f3a2e;
  color: #b8f0c9;
  border-color: #4a9f6f;
  box-shadow: 0 0 6px rgba(74, 159, 111, 0.55);
}
.btx-bit.btx-hl-red {
  background: #3a1f1f;
  color: #ffbcbc;
  border-color: #ff5c5c;
  box-shadow: 0 0 6px rgba(255, 92, 92, 0.55);
}
.btx-bit.btx-dim {
  opacity: 0.35;
}
.btx-scale {
  display: flex;
  gap: 2px;
  margin-left: 142px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  color: #6a7389;
}
.btx-scale-cell {
  width: 16px;
  text-align: center;
}
.btx-section {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed #2a2f3e;
}
.btx-section-title {
  font-size: 12px;
  color: #8a93a8;
  margin-bottom: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.btx-section-title b { color: #e6e6e6; }
.btx-small {
  font-size: 12px;
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.btx-small b { color: #e6e6e6; }
.btx-footer {
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
.btx-status { color: #d1d5db; flex: 1; min-width: 0; }
.btx-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.btx-stats b { color: #e6e6e6; }
.btx-pill {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #2a2f3e;
  background: #0f1419;
  color: #d1d5db;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  margin-right: 6px;
}
.btx-ok  { color: #b8f0c9; border-color: #4a9f6f; background: #1f3a2e; }
.btx-bad { color: #ffbcbc; border-color: #ff5c5c; background: #3a1f1f; }
`,Jr=[{id:"popcount",label:"popcount (Kernighan)   n &= n-1"},{id:"pow2",label:"is power of 2          n & (n-1) == 0"},{id:"lowbit",label:"lowest set bit         n & -n"},{id:"xorswap",label:"XOR swap               a^=b; b^=a; a^=b"},{id:"subsets",label:"subset enum            sub = (sub-1) & mask"},{id:"modbit",label:"set / clear / toggle bit i"},{id:"clzctz",label:"count leading / trailing zeros"}];
function Y({label:a,value:t,highlight:s,dimUnset:o}){const n=Kr(t);return e.jsxs("div",{className:"btx-row",children:[e.jsxs("div",{className:"btx-row-label",children:[a?e.jsxs(e.Fragment,{children:[e.jsx("b",{children:a}),e.jsx("br",{})]}):null,e.jsx("span",{children:Ye(t)}),e.jsx("br",{}),e.jsx("span",{children:(t>>>0).toString(10)})]}),e.jsx("div",{className:"btx-bits",children:n.map((c,r)=>{const l=_e-1-r,i=["btx-bit"];c===1?i.push("btx-on"):o&&i.push("btx-dim"),r>0&&r%8===0&&i.push("btx-sep-left");const d=s&&s(l,c);return d&&i.push("btx-hl-"+d),e.jsx("div",{className:i.join(" "),title:"bit "+l,children:c},r)})})]})}
function Ce(){const a=[];for(let t=0;t<_e;t++){const s=_e-1-t,o=s%4===0;a.push(e.jsx("div",{className:"btx-scale-cell"+(t>0&&t%8===0?" btx-bit-sep":""),style:t>0&&t%8===0?{marginLeft:4}:void 0,children:o?s:""},t))}return e.jsx("div",{className:"btx-scale",children:a})}
function el(){const[a,t]=h.useState("popcount"),[s,o]=h.useState("0x000000B5"),n=h.useMemo(()=>{const q=wt(s);return Number.isFinite(q)?q:0},[s]),[c,r]=h.useState("0x0000A5A5"),[l,i]=h.useState("0x000033CC"),d=h.useMemo(()=>wt(c)||0,[c]),f=h.useMemo(()=>wt(l)||0,[l]),[p,u]=h.useState("0x0000002D"),m=h.useMemo(()=>wt(p)||0,[p]),[w,b]=h.useState(3),[k,$]=h.useState("toggle"),[g,z]=h.useState(0),[F,M]=h.useState("Try the dropdown — each trick animates its bit operation live.");h.useEffect(()=>{z(0)},[a,s,c,l,p,w,k]);function y(){const{start:q,steps:D,count:_}=bt(n),K=Math.min(g,Math.max(D.length-1,0)),O=D[K]||null,G=D.length,Z=(H,W)=>O&&H===O.clearedIndex&&W===1?"amber":null,X=H=>O&&H===O.clearedIndex?"red":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Brian Kernighan's popcount."})," Each iteration: ",e.jsx("code",{children:"n &= n - 1"})," clears the lowest set bit. Step ",e.jsx("b",{children:G===0?0:K+1})," of ",e.jsx("b",{children:G}),". popcount(n) = ",e.jsx("b",{children:_}),"."]}),e.jsx(Ce,{}),e.jsx(Y,{label:"n",value:O?O.n:q,highlight:Z,dimUnset:!0}),O?e.jsxs(e.Fragment,{children:[e.jsx(Y,{label:"n - 1",value:O.nMinus1,dimUnset:!0}),e.jsx(Y,{label:"n & (n-1)",value:O.result,highlight:X,dimUnset:!0})]}):e.jsx("div",{className:"btx-small",style:{marginLeft:142,marginTop:8},children:"n = 0 → loop body never executes. popcount = 0."})]})}function C(){const{n:q,nMinus1:D,and:_,ok:K}=Hr(n),O=q===0?-1:Math.round(Math.log2((q&vt(q))>>>0)),G=(H,W)=>K&&W===1?"green":H===O&&W===1?"accent":null,Z=()=>null,X=(H,W)=>W===1?"red":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Power of two test:"})," ",e.jsx("code",{children:"n > 0 && (n & (n-1)) == 0"}),".  ",K?e.jsxs("span",{className:"btx-pill btx-ok",children:["TRUE — ",q," is a power of 2 (2^",O,")"]}):e.jsxs("span",{className:"btx-pill btx-bad",children:["FALSE — ",q===0?"n is zero":"AND is nonzero"]})]}),e.jsx(Ce,{}),e.jsx(Y,{label:"n",value:q,highlight:G,dimUnset:!0}),e.jsx(Y,{label:"n - 1",value:D,highlight:Z,dimUnset:!0}),e.jsx(Y,{label:"n & (n-1)",value:_,highlight:X,dimUnset:!0})]})}function T(){const{n:q,neg:D,iso:_,idx:K}=Gr(n),O=(X,H)=>X===K&&H===1?"accent":null,G=(X,H)=>X===K&&H===1?"accent":null,Z=(X,H)=>H===1?"green":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Lowest set bit isolation:"})," ",e.jsx("code",{children:"n & -n"}),".  ",K>=0?e.jsxs("span",{className:"btx-pill btx-ok",children:["lowest set bit is at index ",K," (value 2^",K," = ",1<<K>>>0,")"]}):e.jsx("span",{className:"btx-pill btx-bad",children:"n has no set bits"})," ",e.jsx("span",{className:"btx-small",children:"(-n is the two's complement of n: ~n + 1)"})]}),e.jsx(Ce,{}),e.jsx(Y,{label:"n",value:q,highlight:O,dimUnset:!0}),e.jsx(Y,{label:"-n",value:D,highlight:G,dimUnset:!0}),e.jsx(Y,{label:"n & -n",value:_,highlight:Z,dimUnset:!0})]})}function v(){const q=Vr(d,f),D=Math.min(g,q.length-1),_=q[D],K=q[Math.max(D-1,0)],O=(_.a^K.a)>>>0,G=(_.b^K.b)>>>0,Z=H=>O>>>H&1?"amber":null,X=H=>G>>>H&1?"amber":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"XOR swap"})," — swap two values without a temp, using three XOR assignments. Step ",e.jsx("b",{children:D+1})," of ",e.jsx("b",{children:q.length}),": ",e.jsx("code",{children:_.label}),_.changed?e.jsxs(e.Fragment,{children:[" (changed ",e.jsx("b",{children:_.changed}),")"]}):null,"."]}),e.jsx(Ce,{}),e.jsx(Y,{label:"a",value:_.a,highlight:Z,dimUnset:!0}),e.jsx(Y,{label:"b",value:_.b,highlight:X,dimUnset:!0})]})}function I(){const{mask:q,subsets:D,truncated:_}=en(m),K=Math.min(g,Math.max(D.length-1,0)),O=D[K]||{sub:0},G=(X,H)=>H===1?"amber":null,Z=(X,H)=>H===1?"green":((q>>>X&1)===1,null);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Subset enumeration"})," of a bitmask via ",e.jsx("code",{children:"sub = (sub - 1) & mask"}),". Subset ",e.jsx("b",{children:K+1})," of ",e.jsx("b",{children:D.length}),_?" (truncated)":"",". Total subsets for this mask = ",e.jsx("b",{children:"2^k"})," where k = popcount(mask)."]}),e.jsx(Ce,{}),e.jsx(Y,{label:"mask",value:q,highlight:G,dimUnset:!0}),e.jsx(Y,{label:"sub",value:O.sub,highlight:Z,dimUnset:!0}),e.jsxs("div",{className:"btx-small",style:{marginLeft:142,marginTop:8},children:["Enumeration starts at ",e.jsx("b",{children:"sub = mask"}),", then repeatedly ",e.jsx("code",{children:"sub = (sub - 1) & mask"})," until sub returns to 0. Visit order is strictly decreasing."]})]})}function j(){const q=Xr(n,w,k),D=q.index,_=G=>G===D?"accent":null,K=G=>G===D?"amber":null,O=G=>G===D?"green":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Single-bit mutation at index i."})," Ops:  ",e.jsx("code",{children:"set"}),": ",e.jsx("code",{children:"n | (1 << i)"}),",  ",e.jsx("code",{children:"clear"}),": ",e.jsx("code",{children:"n & ~(1 << i)"}),",  ",e.jsx("code",{children:"toggle"}),": ",e.jsx("code",{children:"n ^ (1 << i)"}),".  Active op: ",e.jsx("span",{className:"btx-pill",children:q.op})," at i = ",e.jsx("b",{children:q.index}),"."]}),e.jsx(Ce,{}),e.jsx(Y,{label:"n (before)",value:q.before,highlight:_,dimUnset:!0}),e.jsx(Y,{label:"mask = 1<<"+q.index,value:q.mask,highlight:K,dimUnset:!0}),e.jsx(Y,{label:"n (after)",value:q.after,highlight:O,dimUnset:!0})]})}function x(){const q=Yr(n),D=Qr(n),_=(O,G)=>q.n===0?"red":O===q.firstOneIndex?"green":O>q.firstOneIndex?"red":null,K=(O,G)=>D.n===0?"red":O===D.firstOneIndex?"green":O<D.firstOneIndex?"red":null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"btx-section-title",children:[e.jsx("b",{children:"Count leading / trailing zeros."})," CLZ via ",e.jsx("code",{children:"Math.clz32(n)"}),", CTZ via ",e.jsx("code",{children:"log2(n & -n)"}),".  ",e.jsxs("span",{className:"btx-pill",children:["clz = ",q.clz]})," ",e.jsxs("span",{className:"btx-pill",children:["ctz = ",D.ctz]})]}),e.jsx(Ce,{}),e.jsx("div",{className:"btx-small",style:{marginLeft:142},children:"Leading zeros (scanning MSB → first 1):"}),e.jsx(Y,{label:"n",value:q.n,highlight:_,dimUnset:!0}),e.jsx("div",{className:"btx-small",style:{marginLeft:142,marginTop:6},children:"Trailing zeros (scanning LSB → first 1):"}),e.jsx(Y,{label:"n",value:D.n,highlight:K,dimUnset:!0}),e.jsx(Y,{label:"n & -n",value:D.iso,dimUnset:!0})]})}let N=null,E=0,A=!1,R="Next step";if(a==="popcount"){const{steps:q}=bt(n);E=Math.max(q.length-1,0),A=q.length>1,N=y()}else if(a==="pow2")N=C();else if(a==="lowbit")N=T();else if(a==="xorswap")E=3,A=!0,N=v();else if(a==="subsets"){const{subsets:q}=en(m);E=Math.max(q.length-1,0),A=q.length>1,N=I()}else a==="modbit"?N=j():a==="clzctz"&&(N=x());function S(){z(q=>{const D=q>=E?0:q+1;return a==="popcount"?M(`popcount: step ${D+1}.`):a==="xorswap"?M(`XOR swap: step ${D+1} / 4.`):a==="subsets"&&M(`subset enum: visiting subset ${D+1}.`),D})}function P(){z(0),M("Reset to step 1.")}function L(){return a==="xorswap"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"btx-label",children:"a"}),e.jsx("input",{className:"btx-input",value:c,onChange:q=>r(q.target.value),placeholder:"0x.. or decimal"}),e.jsx("span",{className:"btx-label",children:"b"}),e.jsx("input",{className:"btx-input",value:l,onChange:q=>i(q.target.value),placeholder:"0x.. or decimal"})]}):a==="subsets"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"btx-label",children:"mask"}),e.jsx("input",{className:"btx-input",value:p,onChange:q=>u(q.target.value),placeholder:"0x.. or decimal"})]}):a==="modbit"?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"btx-label",children:"n"}),e.jsx("input",{className:"btx-input",value:s,onChange:q=>o(q.target.value),placeholder:"0x.. or decimal"}),e.jsx("span",{className:"btx-label",children:"i"}),e.jsx("input",{className:"btx-input btx-input-sm",type:"number",min:0,max:31,value:w,onChange:q=>{const D=Math.max(0,Math.min(31,Number(q.target.value)||0));b(D)}}),e.jsx("span",{className:"btx-label",children:"op"}),e.jsxs("select",{className:"btx-select",value:k,onChange:q=>$(q.target.value),children:[e.jsx("option",{value:"set",children:"set"}),e.jsx("option",{value:"clear",children:"clear"}),e.jsx("option",{value:"toggle",children:"toggle"})]})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"btx-label",children:"n"}),e.jsx("input",{className:"btx-input",value:s,onChange:q=>o(q.target.value),placeholder:"0x.. or decimal"})]})}const B=a==="xorswap"?`a=${Ye(d)} b=${Ye(f)}`:a==="subsets"?`mask=${Ye(m)} popcount=${bt(m).count}`:`n=${Ye(n)} popcount=${bt(n).count}`;return e.jsxs("div",{className:"btx-root",children:[e.jsx("style",{children:Zr}),e.jsxs("div",{className:"btx-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"btx-title",children:"Bit Tricks — 32-bit live visualizer"}),e.jsx("div",{className:"btx-sub",children:"Kernighan's popcount, power-of-two test, lowest-set-bit isolation, XOR swap, subset enumeration, single-bit ops, clz/ctz."})]}),e.jsxs("div",{className:"btx-head-right",children:[e.jsx("span",{className:"btx-label",children:"Trick"}),e.jsx("select",{className:"btx-select",value:a,onChange:q=>t(q.target.value),children:Jr.map(q=>e.jsx("option",{value:q.id,children:q.label},q.id))})]})]}),e.jsxs("div",{className:"btx-bar",children:[L(),e.jsx("span",{style:{width:12}}),e.jsx("button",{className:"btx-btn",onClick:S,disabled:!A,title:A?"":"This trick has no multi-step animation.",children:R}),e.jsx("button",{className:"btx-btn btx-ghost",onClick:P,disabled:!A,children:"Reset step"})]}),e.jsx("div",{className:"btx-canvas",children:N}),e.jsxs("div",{className:"btx-footer",children:[e.jsxs("div",{className:"btx-status",children:["Status: ",F]}),e.jsx("div",{className:"btx-stats",children:B})]})]})}

export default el;
export { el as Component };
export function mount(container) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(target);
  root.render(e.jsx(el, {}));
  return () => root.unmount();
}
