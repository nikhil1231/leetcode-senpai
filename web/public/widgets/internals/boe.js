import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Wh(n){if(!n)return"";if(n.length<=56)return n;const t=n.indexOf("?");return t>0&&t<48?n.slice(0,t)+"?…":n.slice(0,52)+"…"}
const Qi=86400;
function xt(n){if(!Number.isFinite(n))return"—";const t=n<0?"-":"",s=Math.abs(n);return s<1e3?`${t}${we(s,2)} B`:s<1e6?`${t}${we(s/1e3,2)} KB`:s<1e9?`${t}${we(s/1e6,2)} MB`:s<1e12?`${t}${we(s/1e9,2)} GB`:s<1e15?`${t}${we(s/1e12,2)} TB`:`${t}${we(s/1e15,2)} PB`}
function Ms(n){return Number.isFinite(n)?n<1e3?`${we(n,1)}`:n<1e6?`${we(n/1e3,2)}K`:n<1e9?`${we(n/1e6,2)}M`:`${we(n/1e9,2)}B`:"—"}
function Ze(n){return Number.isFinite(n)?Math.round(n).toLocaleString("en-US"):"—"}
function yt(n){return Number.isFinite(n)?n<1e3?`${we(n,1)} bps`:n<1e6?`${we(n/1e3,2)} Kbps`:n<1e9?`${we(n/1e6,2)} Mbps`:n<1e12?`${we(n/1e9,2)} Gbps`:`${we(n/1e12,2)} Tbps`:"—"}
function oo(n){if(!Number.isFinite(n))return"—";const t=Math.abs(n);return t<1e3?`${n}`:t<1e6?`${we(n/1e3,1)}K`:t<1e9?`${we(n/1e6,1)}M`:`${we(n/1e9,2)}B`}
function we(n,t){const s=Math.pow(10,t);return Math.round(n*s)/s}
function Bh(n){const{dau:t,readsPerUserPerDay:s,writesPerUserPerDay:r,avgReadBytes:o,avgWriteBytes:i,cacheHitRatio:a,compressionRatio:l,replicationFactor:d,retentionYears:c,peakMultiplier:p}=n,m=[],g=t*s,w=t*r,C=g/Qi,j=w/Qi,$=C*p,O=j*p,q=C+j;m.push({label:"QPS (avg read)",math:`${oo(t)} DAU × ${s} reads/user/day ÷ 86,400 s/day`,result:`≈ ${Ze(C)} QPS  (${Ms(C)})`}),m.push({label:"QPS (peak read)",math:`${Ze(C)} × ${p}× peak`,result:`≈ ${Ze($)} QPS  (${Ms($)})`}),m.push({label:"QPS (avg write)",math:`${oo(t)} × ${r} writes/user/day ÷ 86,400`,result:`≈ ${Ze(j)} QPS  (${Ms(j)})`}),m.push({label:"QPS (peak write)",math:`${Ze(j)} × ${p}× peak`,result:`≈ ${Ze(O)} QPS  (${Ms(O)})`});const R=w*i,D=R*365,B=D*c,V=B*d,T=V*l;m.push({label:"Storage / day",math:`${oo(t)} × ${r} × ${i} B`,result:`= ${xt(R)} / day`}),m.push({label:"Storage / year",math:`${xt(R)}/day × 365`,result:`= ${xt(D)} / year`}),m.push({label:`Storage over ${c}y retention`,math:`${xt(D)} × ${c}y`,result:`= ${xt(B)}  (raw)`}),m.push({label:`With RF=${d}`,math:`${xt(B)} × ${d}`,result:`= ${xt(V)}  (replicated)`}),m.push({label:`Compressed (ratio ${l})`,math:`${xt(V)} × ${l}`,result:`= ${xt(T)}  (on disk)`});const _=C*o,b=j*i,x=_*8,f=b*8,u=1-a,y=_*u,v=y*8,I=y*l,S=I*8;return m.push({label:"Egress (reads, naive)",math:`${Ze(C)} QPS × ${o} B × 8 bits/B`,result:`= ${yt(x)}`}),m.push({label:`DB QPS after ${Math.round(a*100)}% cache`,math:`(1 − ${a}) × ${Ze(C)} QPS`,result:`≈ ${Ze(C*u)} QPS hit origin`}),m.push({label:"Egress (with cache)",math:`${yt(x)} × ${we(u,3)}`,result:`= ${yt(v)}`}),m.push({label:"Egress (cache + compression)",math:`${yt(v)} × ${l}`,result:`= ${yt(S)}`}),{qps:{avgRead:C,peakRead:$,avgWrite:j,peakWrite:O,total:q},storage:{rawPerDay:R,rawPerYear:D,totalRaw:B,totalWithReplication:V,totalCompressed:T},bandwidth:{bpsRead:x,bpsWrite:f,withCache:v,withCacheAndCompression:S},comparison:{naiveBytesPerSec:_,cachedBytesPerSec:y,cachedCompressedBytesPerSec:I},steps:m}}
const To={"url-shortener":{label:"URL shortener (Xu Ch.8)",dau:1e8,readsPerUserPerDay:100,writesPerUserPerDay:1,avgReadBytes:500,avgWriteBytes:500,cacheHitRatio:.95,compressionRatio:.8,replicationFactor:3,retentionYears:10,peakMultiplier:2},"twitter-feed":{label:"Twitter / news feed (Xu Ch.11)",dau:2e8,readsPerUserPerDay:50,writesPerUserPerDay:2,avgReadBytes:2e3,avgWriteBytes:300,cacheHitRatio:.9,compressionRatio:.7,replicationFactor:3,retentionYears:5,peakMultiplier:3},"video-streaming":{label:"Video streaming (Xu Ch.14)",dau:1e8,readsPerUserPerDay:5,writesPerUserPerDay:.01,avgReadBytes:5e7,avgWriteBytes:1e9,cacheHitRatio:.98,compressionRatio:.5,replicationFactor:3,retentionYears:10,peakMultiplier:2},chat:{label:"Chat / messaging (Xu Ch.12)",dau:5e7,readsPerUserPerDay:40,writesPerUserPerDay:40,avgReadBytes:200,avgWriteBytes:200,cacheHitRatio:.5,compressionRatio:.6,replicationFactor:3,retentionYears:3,peakMultiplier:3}},Hh=[{label:"L1 cache reference",value:"0.5 ns"},{label:"Branch mispredict",value:"5 ns"},{label:"L2 cache reference",value:"7 ns"},{label:"Mutex lock/unlock",value:"25 ns"},{label:"Main memory reference",value:"100 ns"},{label:"Compress 1 KB (zippy)",value:"3 µs"},{label:"Send 1 KB over 1 Gbps",value:"10 µs"},{label:"SSD random read",value:"150 µs"},{label:"Read 1 MB from memory",value:"250 µs"},{label:"Round trip in datacenter",value:"500 µs"},{label:"Read 1 MB from SSD",value:"1 ms"},{label:"HDD seek",value:"10 ms"},{label:"Read 1 MB from HDD",value:"30 ms"},{label:"CA → Netherlands RTT",value:"150 ms"}],Kh=[{label:"1 KB",value:"10³ B — one short message"},{label:"1 MB",value:"10⁶ B — a small image"},{label:"1 GB",value:"10⁹ B — a short video / big DB"},{label:"1 TB",value:"10¹² B — a big drive"},{label:"1 PB",value:"10¹⁵ B — a data warehouse"}],Uh=[{label:"1 day",value:"86,400 s"},{label:"1 year",value:"~31.5M s (Xu uses 31M)"},{label:"10 years",value:"~315M s"}],Vh=`
.boe-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 13px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.boe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.boe-title { font-weight: 600; font-size: 15px; }
.boe-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }

.boe-body {
  flex: 1;
  overflow: auto;
  padding: 14px 16px;
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 14px;
}
@media (max-width: 860px) {
  .boe-body { grid-template-columns: 1fr; }
}

.boe-section {
  background: #141925;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  padding: 12px 14px;
}
.boe-section h3 {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: #d1d5db;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.boe-muted { color: #8a93a8; font-weight: 400; font-size: 12px; }

.boe-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.boe-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.boe-field label {
  font-size: 11px;
  color: #8a93a8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.boe-input, .boe-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.boe-input:focus, .boe-select:focus { outline: none; border-color: #4a7cff; }

.boe-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.boe-chip {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid #2a2f3e;
  border-radius: 4px;
  color: #d1d5db;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.boe-chip:hover { border-color: #4a7cff; color: #e6e6e6; }

.boe-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.boe-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 1100px) {
  .boe-cards { grid-template-columns: repeat(2, 1fr); }
}
.boe-card {
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.boe-card-label {
  font-size: 11px;
  color: #8a93a8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.boe-card-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}
.boe-card-sub {
  font-size: 11px;
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.boe-scale-green  { color: #7fd6a4; }
.boe-scale-yellow { color: #ffd24a; }
.boe-scale-red    { color: #ff9a6a; }

.boe-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #c9d1e0;
  background: #0b0f17;
  border: 1px solid #222838;
  border-radius: 6px;
  padding: 10px 12px;
  max-height: 340px;
  overflow: auto;
}
.boe-step {
  display: grid;
  grid-template-columns: 190px 1fr auto;
  gap: 10px;
  padding: 3px 0;
  border-bottom: 1px dashed #1a2030;
}
.boe-step:last-child { border-bottom: none; }
.boe-step-label { color: #8a93a8; white-space: nowrap; }
.boe-step-math  { color: #c9d1e0; }
.boe-step-result {
  color: #7fd6a4;
  white-space: nowrap;
  text-align: right;
}

/* Comparison bar */
.boe-compare {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.boe-bar-row {
  display: grid;
  grid-template-columns: 160px 1fr 110px;
  gap: 10px;
  align-items: center;
}
.boe-bar-label { color: #8a93a8; }
.boe-bar-track {
  height: 14px;
  background: #0b0f17;
  border: 1px solid #222838;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.boe-bar-fill {
  height: 100%;
  transition: width 400ms ease;
}
.boe-bar-fill.naive      { background: #c13c3c; }
.boe-bar-fill.cached     { background: #d08a2a; }
.boe-bar-fill.compressed { background: #4a9f6f; }
.boe-bar-val {
  color: #e6e6e6;
  text-align: right;
}

/* Footer tables */
.boe-foot {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
  border-top: 1px solid #2a2f3e;
  background: #141925;
  padding: 12px 16px;
}
@media (max-width: 860px) {
  .boe-foot { grid-template-columns: 1fr; }
}
.boe-foot h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: #d1d5db;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.boe-ref-table {
  border-collapse: collapse;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.boe-ref-table td {
  padding: 2px 6px;
  border-bottom: 1px solid #1a2030;
}
.boe-ref-table td:first-child { color: #8a93a8; }
.boe-ref-table td:last-child  { color: #c9d1e0; text-align: right; }
.boe-ref-note {
  font-size: 11px;
  color: #8a93a8;
  margin-top: 8px;
  font-style: italic;
}
`;
function Zi(n){return n<1e4?"boe-scale-green":n<1e6?"boe-scale-yellow":"boe-scale-red"}
function Gh(n){return n<1e12?"boe-scale-green":n<1e15?"boe-scale-yellow":"boe-scale-red"}
function Yh(n){return n<1e8?"boe-scale-green":n<1e10?"boe-scale-yellow":"boe-scale-red"}
const qa={...To["url-shortener"]};
delete qa.label;
const Xh=[1,2,3,5],Jh=[1,2,3,5],Qh=[{label:"×1K",factor:1e3},{label:"×1M",factor:1e6},{label:"×1B",factor:1e9}];
function Zh(){const[n,t]=h.useState(qa),[s,r]=h.useState("url-shortener"),o=h.useMemo(()=>Bh(n),[n]);function i($,O){t(q=>({...q,[$]:O}))}function a($,O,q={}){const R=Number(O);if(!Number.isFinite(R))return;const D=q.min??-1/0,B=q.max??1/0;i($,Math.max(D,Math.min(B,R)))}function l($){r($);const O=To[$];if(!O)return;const{label:q,...R}=O;t(R)}const d=o.qps.peakRead,c=o.qps.peakWrite,p=o.storage.rawPerYear,m=o.bandwidth.withCache,g=o.comparison,w=Math.max(g.naiveBytesPerSec,g.cachedBytesPerSec,g.cachedCompressedBytesPerSec,1);function C($){return`${$/w*100}%`}const j=h.useMemo(()=>{const $={qps:[],storage:[],bandwidth:[]};for(const O of o.steps)O.label.startsWith("QPS")?$.qps.push(O):O.label.startsWith("Storage")||O.label.startsWith("With RF")||O.label.startsWith("Compressed")?$.storage.push(O):$.bandwidth.push(O);return $},[o]);return e.jsxs("div",{className:"boe-root",children:[e.jsx("style",{children:Vh}),e.jsxs("div",{className:"boe-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"boe-title",children:"Back-of-the-envelope estimator — Alex Xu Ch.2 / System Design Primer"}),e.jsx("div",{className:"boe-sub",children:"Plug DAU, traffic, payload. Read the math line by line. Every HLD interview starts here: QPS, storage, bandwidth."})]}),e.jsxs("div",{children:[e.jsx("label",{className:"boe-muted",style:{marginRight:6},children:"Preset:"}),e.jsx("select",{className:"boe-select",value:s,onChange:$=>l($.target.value),children:Object.entries(To).map(([$,O])=>e.jsx("option",{value:$,children:O.label},$))})]})]}),e.jsxs("div",{className:"boe-body",children:[e.jsxs("div",{className:"boe-section",children:[e.jsxs("h3",{children:["Inputs ",e.jsx("span",{className:"boe-muted",children:"edit or use preset"})]}),e.jsxs("div",{className:"boe-form",children:[e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"DAU (daily active users)"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",value:n.dau,onChange:$=>a("dau",$.target.value,{min:0})}),e.jsxs("div",{className:"boe-row",children:[Qh.map($=>e.jsx("button",{className:"boe-chip",onClick:()=>i("dau",$.factor),title:`Set DAU = ${$.label}`,children:$.label},$.label)),e.jsx("button",{className:"boe-chip",onClick:()=>i("dau",n.dau*10),title:"×10",children:"×10"}),e.jsx("button",{className:"boe-chip",onClick:()=>i("dau",Math.max(1,Math.round(n.dau/10))),title:"÷10",children:"÷10"})]})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Reads / user / day"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",value:n.readsPerUserPerDay,onChange:$=>a("readsPerUserPerDay",$.target.value,{min:0})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Writes / user / day"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",value:n.writesPerUserPerDay,onChange:$=>a("writesPerUserPerDay",$.target.value,{min:0})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Avg read bytes"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",value:n.avgReadBytes,onChange:$=>a("avgReadBytes",$.target.value,{min:0})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Avg write bytes"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",value:n.avgWriteBytes,onChange:$=>a("avgWriteBytes",$.target.value,{min:0})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Cache hit ratio (0–1)"}),e.jsx("input",{className:"boe-input",type:"number",min:"0",max:"1",step:"0.01",value:n.cacheHitRatio,onChange:$=>a("cacheHitRatio",$.target.value,{min:0,max:1})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Compression ratio (0.1–1)"}),e.jsx("input",{className:"boe-input",type:"number",min:"0.1",max:"1",step:"0.05",value:n.compressionRatio,onChange:$=>a("compressionRatio",$.target.value,{min:.1,max:1})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Replication factor"}),e.jsx("select",{className:"boe-select",value:n.replicationFactor,onChange:$=>i("replicationFactor",Number($.target.value)),children:Xh.map($=>e.jsx("option",{value:$,children:$},$))})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Retention years"}),e.jsx("input",{className:"boe-input",type:"number",min:"1",max:"50",value:n.retentionYears,onChange:$=>a("retentionYears",$.target.value,{min:1,max:50})})]}),e.jsxs("div",{className:"boe-field",children:[e.jsx("label",{children:"Peak multiplier (avg → peak)"}),e.jsx("select",{className:"boe-select",value:n.peakMultiplier,onChange:$=>i("peakMultiplier",Number($.target.value)),children:Jh.map($=>e.jsxs("option",{value:$,children:[$,"×"]},$))})]})]})]}),e.jsxs("div",{className:"boe-right",children:[e.jsxs("div",{className:"boe-cards",children:[e.jsx(Zr,{label:"Read QPS (peak)",value:Ms(d),sub:`${Ze(d)} rps · avg ${Ze(o.qps.avgRead)}`,colorClass:Zi(d)}),e.jsx(Zr,{label:"Write QPS (peak)",value:Ms(c),sub:`${Ze(c)} rps · avg ${Ze(o.qps.avgWrite)}`,colorClass:Zi(c)}),e.jsx(Zr,{label:"Storage / year",value:xt(p),sub:`${xt(o.storage.totalCompressed)} over ${n.retentionYears}y (RF×${n.replicationFactor}, comp)`,colorClass:Gh(p)}),e.jsx(Zr,{label:"Egress (w/ cache)",value:yt(m),sub:`naive ${yt(o.bandwidth.bpsRead)} · +comp ${yt(o.bandwidth.withCacheAndCompression)}`,colorClass:Yh(m)})]}),e.jsxs("div",{className:"boe-section",children:[e.jsxs("h3",{children:["QPS — the math",e.jsx("span",{className:"boe-muted",children:"whiteboard trace, Xu-style"})]}),e.jsx("div",{className:"boe-steps",children:j.qps.map(($,O)=>e.jsx(io,{step:$},O))})]}),e.jsxs("div",{className:"boe-section",children:[e.jsxs("h3",{children:["Storage — the math",e.jsx("span",{className:"boe-muted",children:"raw → replicated → compressed"})]}),e.jsx("div",{className:"boe-steps",children:j.storage.map(($,O)=>e.jsx(io,{step:$},O))})]}),e.jsxs("div",{className:"boe-section",children:[e.jsxs("h3",{children:["Bandwidth — the math",e.jsx("span",{className:"boe-muted",children:"naive → cached → cached+compressed"})]}),e.jsx("div",{className:"boe-steps",children:j.bandwidth.map(($,O)=>e.jsx(io,{step:$},O))}),e.jsx("div",{style:{height:12}}),e.jsxs("div",{className:"boe-compare",children:[e.jsxs("div",{className:"boe-bar-row",children:[e.jsx("div",{className:"boe-bar-label",children:"naive"}),e.jsx("div",{className:"boe-bar-track",children:e.jsx("div",{className:"boe-bar-fill naive",style:{width:C(g.naiveBytesPerSec)}})}),e.jsx("div",{className:"boe-bar-val",children:yt(g.naiveBytesPerSec*8)})]}),e.jsxs("div",{className:"boe-bar-row",children:[e.jsx("div",{className:"boe-bar-label",children:"+ cache"}),e.jsx("div",{className:"boe-bar-track",children:e.jsx("div",{className:"boe-bar-fill cached",style:{width:C(g.cachedBytesPerSec)}})}),e.jsx("div",{className:"boe-bar-val",children:yt(g.cachedBytesPerSec*8)})]}),e.jsxs("div",{className:"boe-bar-row",children:[e.jsx("div",{className:"boe-bar-label",children:"+ cache + compression"}),e.jsx("div",{className:"boe-bar-track",children:e.jsx("div",{className:"boe-bar-fill compressed",style:{width:C(g.cachedCompressedBytesPerSec)}})}),e.jsx("div",{className:"boe-bar-val",children:yt(g.cachedCompressedBytesPerSec*8)})]})]})]})]})]}),e.jsxs("div",{className:"boe-foot",children:[e.jsxs("div",{children:[e.jsx("h4",{children:"Latency numbers every programmer should know (Jeff Dean)"}),e.jsx("table",{className:"boe-ref-table",children:e.jsx("tbody",{children:Hh.map($=>e.jsxs("tr",{children:[e.jsx("td",{children:$.label}),e.jsx("td",{children:$.value})]},$.label))})}),e.jsx("div",{className:"boe-ref-note",children:"These are order-of-magnitude estimates; actual numbers vary 2–3× depending on hardware, load, and workload. Good enough to reason on a whiteboard — never quote them as truth."})]}),e.jsxs("div",{children:[e.jsx("h4",{children:"Byte sizes"}),e.jsx("table",{className:"boe-ref-table",children:e.jsx("tbody",{children:Kh.map($=>e.jsxs("tr",{children:[e.jsx("td",{children:$.label}),e.jsx("td",{children:$.value})]},$.label))})})]}),e.jsxs("div",{children:[e.jsx("h4",{children:"Time"}),e.jsx("table",{className:"boe-ref-table",children:e.jsx("tbody",{children:Uh.map($=>e.jsxs("tr",{children:[e.jsx("td",{children:$.label}),e.jsx("td",{children:$.value})]},$.label))})})]})]})]})}
function Zr({label:n,value:t,sub:s,colorClass:r}){return e.jsxs("div",{className:"boe-card",children:[e.jsx("div",{className:"boe-card-label",children:n}),e.jsx("div",{className:`boe-card-value ${r}`,children:t}),e.jsx("div",{className:"boe-card-sub",children:s})]})}
function io({step:n}){return e.jsxs("div",{className:"boe-step",children:[e.jsx("div",{className:"boe-step-label",children:n.label}),e.jsx("div",{className:"boe-step-math",children:n.math}),e.jsx("div",{className:"boe-step-result",children:n.result})]})}

export default Zh;
export { Zh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Zh, {}));
  return () => root.unmount();
}
