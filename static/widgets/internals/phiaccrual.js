import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Dc(n){const t=n<0?-1:1,s=Math.abs(n)/Math.SQRT2,r=1/(1+.3275911*s),o=1-((((1.061405429*r-1.453152027)*r+1.421413741)*r-.284496736)*r+.254829592)*r*Math.exp(-s*s);return .5*(1+t*o)}
class qc{constructor({windowSize:t=100,minSamples:s=5,distributionShift:r=0}={}){this.windowSize=Math.max(2,t|0),this.minSamples=Math.max(2,s|0),this.distributionShift=r,this.arrivals=[],this.intervals=[],this.lastHeartbeatAt=null}heartbeat(t){if(this.lastHeartbeatAt!=null){const s=t-this.lastHeartbeatAt;s>0&&(this.intervals.push(s),this.intervals.length>this.windowSize&&this.intervals.shift())}this.arrivals.push(t),this.arrivals.length>this.windowSize+1&&this.arrivals.shift(),this.lastHeartbeatAt=t}_stats(){const t=this.intervals,s=t.length;if(s===0)return{mean:0,stddev:0,n:0};let r=0;for(let c=0;c<s;c++)r+=t[c];const o=r/s;if(s<2)return{mean:o,stddev:0,n:s};let i=0;for(let c=0;c<s;c++){const p=t[c]-o;i+=p*p}const a=i/(s-1),l=Math.sqrt(a),d=Math.max(l,1);return{mean:o,stddev:d,n:s}}phi(t){if(this.lastHeartbeatAt==null)return 0;const s=t-this.lastHeartbeatAt+this.distributionShift;if(s<=0)return 0;const{mean:r,stddev:o,n:i}=this._stats();if(i<this.minSamples){if(i===0||r<=0)return 0;const c=s-r;return c<=0?0:Math.max(0,Math.log10(1+c/r)*3)}const a=(s-r)/o,l=1-Dc(a);if(!isFinite(l)||l<=1e-100)return 100;const d=-Math.log10(l);return isFinite(d)?Math.max(0,Math.min(100,d)):100}snapshot(){const{mean:t,stddev:s,n:r}=this._stats();return{arrivals:this.arrivals.slice(),intervals:this.intervals.slice(),mean:t,stddev:s,sampleCount:r,lastHeartbeatAt:this.lastHeartbeatAt,windowSize:this.windowSize,minSamples:this.minSamples}}reset(){this.arrivals=[],this.intervals=[],this.lastHeartbeatAt=null}}
const yo=620,vo=260,Sa=36,$a=10,Na=14,Ca=22,Ws=260,vs=120,Bt=28,Tn=8,rs=10,hi=22,pn=12,ds=60*1e3,Wc=10,Bc=1e3/Wc;
function Ir(n){return n<1?"#3fb77a":n<3?"#e0c04b":n<8?"#e88b3a":"#ff5757"}
function Er(n){return n<1?"healthy":n<3?"suspect (mild)":n<8?"suspect":"declared dead"}
const Hc=`
.phi-widget {
  background: #0f1419;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #2a3038;
  border-radius: 8px;
  padding: 16px;
  max-width: 980px;
}
.phi-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.phi-widget .sub {
  font-size: 12px;
  color: #8a95a3;
  margin: 0 0 12px 0;
}
.phi-toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #2a3038;
  border-bottom: 1px solid #2a3038;
  margin-bottom: 12px;
  font-size: 13px;
}
.phi-toolbar label { color: #8a95a3; font-size: 12px; }
.phi-toolbar input[type="range"] { vertical-align: middle; }
.phi-toolbar select,
.phi-toolbar button {
  background: #1a1f26;
  color: #e6e6e6;
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.phi-toolbar button:hover { background: #232a33; }
.phi-toolbar button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.phi-toolbar button.primary:hover { background: #3467b0; }
.phi-toolbar button.danger {
  background: #702525;
  border-color: #a23838;
}
.phi-toolbar button.danger:hover { background: #8a2d2d; }
.phi-toolbar .spacer { flex: 1; }
.phi-main {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 12px;
}
.phi-card {
  background: #0a0e13;
  border: 1px solid #2a3038;
  border-radius: 6px;
  padding: 10px 12px;
}
.phi-card h3 {
  margin: 0 0 6px 0;
  font-size: 13px;
  color: #cfd6e0;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.phi-card h3 .muted { color: #8a95a3; font-weight: 400; font-size: 11px; }
.phi-value {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0 10px 0;
}
.phi-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}
.phi-number {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 28px;
  font-weight: 700;
}
.phi-state {
  font-size: 12px;
  color: #8a95a3;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.phi-peer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0 4px 0;
}
.phi-peer-node {
  width: 56px; height: 56px;
  border-radius: 50%;
  border: 2px solid #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #111;
  position: relative;
}
.phi-peer-node.dead {
  background: #3a3a3a !important;
  color: #aaa;
}
.phi-peer-meta {
  font-size: 12px;
  line-height: 1.5;
  color: #cfd6e0;
}
.phi-peer-meta .k { color: #8a95a3; }
.phi-status {
  margin-top: 10px;
  background: #161b22;
  border: 1px solid #2a3038;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  min-height: 38px;
  color: #cfd6e0;
  white-space: pre-wrap;
}
.phi-legend {
  font-size: 11px;
  color: #8a95a3;
  padding: 6px 0 0 0;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.phi-legend .dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
`;
function Kc({detector:n,onStatus:t}){const[s,r]=h.useState("paused"),o=h.useRef(s);o.current=s;const i=h.useRef(1e3),a=h.useRef(.2),l=h.useRef(null),d=h.useRef(null),c=h.useRef(null),p=h.useCallback(()=>{const j=performance.now(),$=i.current,O=(Math.random()*2-1)*a.current*$;d.current=j+$+O},[]),m=h.useCallback(()=>{o.current!=="running"&&(r("running"),p())},[p]),g=h.useCallback(()=>{o.current==="running"&&(r("paused"),d.current=null)},[]),w=h.useCallback(()=>{r("dead"),d.current=null},[]),C=h.useCallback(()=>{r("running"),p()},[p]);return h.useEffect(()=>(l.current=setInterval(()=>{const j=performance.now();if(o.current==="running"&&d.current!=null&&j>=d.current){const $=c.current;n.heartbeat(j),c.current=j;const O=n.snapshot(),q=$!=null?j-$:null;t({kind:"beat",atMs:j,intervalMs:q,mean:O.mean,stddev:O.stddev,sampleCount:O.sampleCount}),p()}},20),()=>{clearInterval(l.current),l.current=null}),[n,t,p]),{peerState:s,start:m,pause:g,kill:w,revive:C,setIntervalMs:j=>{i.current=j},setJitter:j=>{a.current=j},getLastBeatAt:()=>c.current,clearLastBeat:()=>{c.current=null}}}
function Uc(n,t){if(n.length===0)return"";const s=Sa,r=yo-$a,o=Na,i=vo-Ca,a=r-s,l=i-o,d=t-ds,c=g=>s+(g-d)/ds*a,p=g=>i-Math.min(g,pn)/pn*l;let m="";for(let g=0;g<n.length;g++){const w=n[g];m+=(g===0?"M":"L")+c(w.t).toFixed(1)+","+p(w.phi).toFixed(1)+" "}return m}
function Vc(){const n=h.useRef(null);n.current==null&&(n.current=new qc({windowSize:100,minSamples:5}));const[t,s]=h.useState(1e3),[r,o]=h.useState(100),[,i]=h.useState(0),a=h.useCallback(()=>i(v=>v+1&65535),[]),l=h.useRef([]),d=h.useRef(performance.now()),c=h.useRef('Click "Start heartbeats" to begin.'),p=h.useRef("#4a8fd8").current,m=h.useCallback(v=>{if(v.kind==="beat"){const I=v.intervalMs!=null?v.intervalMs.toFixed(0):"n/a",S=v.mean>0?v.mean.toFixed(0):"—",H=v.stddev>0?v.stddev.toFixed(1):"—";c.current=`Heartbeat received at ${(v.atMs/1e3).toFixed(2)}s (interval ${I}ms, mean ${S}ms, stddev ${H}ms, n=${v.sampleCount})`}},[]),g=Kc({detector:n.current,onStatus:m});h.useEffect(()=>{g.setIntervalMs(t)},[t,g]),h.useEffect(()=>{const v=n.current;for(v.windowSize=r;v.intervals.length>r;)v.intervals.shift();for(;v.arrivals.length>r+1;)v.arrivals.shift()},[r]),h.useEffect(()=>{const v=setInterval(()=>{const I=performance.now();d.current=I;const S=n.current.phi(I),H=l.current;H.push({t:I,phi:S});const M=I-ds;for(;H.length&&H[0].t<M;)H.shift();a()},Bc);return()=>clearInterval(v)},[a]);const w=d.current,C=g.getLastBeatAt(),j=n.current.phi(w),$=n.current.snapshot();let O=c.current;if(g.peerState!=="running"&&C!=null){const v=w-C,I=Er(j);O=`${c.current}
No heartbeat for ${v.toFixed(0)}ms; φ = ${j.toFixed(2)} -> ${I}`,g.peerState==="dead"&&(O=`peer unreachable (killed). Last heartbeat ${v.toFixed(0)}ms ago. φ = ${j.toFixed(2)} -> ${I}`)}else g.peerState==="running"&&C!=null?O=`${c.current}
φ = ${j.toFixed(2)} -> ${Er(j)}`:C==null&&(g.peerState==="dead"?O="peer unreachable. No heartbeats received.":g.peerState==="running"?O="peer running; waiting for first heartbeat...":O='idle. Click "Start heartbeats" to begin.');const q=h.useCallback(()=>{n.current.reset(),l.current=[],g.clearLastBeat(),c.current="Detector reset.",a()},[g,a]),R=Sa,D=yo-$a,B=Na,V=vo-Ca,T=D-R,_=V-B,b=v=>V-Math.min(v,pn)/pn*_,x=h.useMemo(()=>Uc(l.current,w),[w,l.current.length]),f=$.intervals,u=h.useMemo(()=>{if(f.length===0)return{bins:[],min:0,max:0};let v=1/0,I=-1/0;for(const k of f)k<v&&(v=k),k>I&&(I=k);v===I&&(v-=1,I+=1);const S=Math.min(12,Math.max(4,Math.ceil(Math.sqrt(f.length)))),H=new Array(S).fill(0),M=I-v;for(const k of f){let P=Math.floor((k-v)/M*S);P>=S&&(P=S-1),P<0&&(P=0),H[P]+=1}return{bins:H,min:v,max:I}},[f]),y=g.peerState==="dead"?"#555":g.peerState==="paused"?"#8a95a3":Ir(j);return e.jsxs("div",{className:"phi-widget",children:[e.jsx("style",{children:Hc}),e.jsxs("h2",{children:[e.jsx("span",{children:"Phi-Accrual Failure Detector"}),e.jsx("span",{style:{display:"flex",gap:8},children:e.jsx("button",{onClick:q,children:"Reset"})})]}),e.jsxs("p",{className:"sub",children:["Chapter 9, Petrov: “Database Internals”.  φ = −log",e.jsx("sub",{children:"10"})," P(t − t",e.jsx("sub",{children:"last"}),") under a normal approximation of the inter-arrival window. Thresholds: φ ≥ 1 mild, φ ≥ 3 suspect, φ ≥ 8 declared dead."]}),e.jsxs("div",{className:"phi-toolbar",children:[e.jsx("label",{children:"Interval"}),e.jsx("input",{type:"range",min:200,max:3e3,step:100,value:t,onChange:v=>s(parseInt(v.target.value,10))}),e.jsxs("span",{style:{fontFamily:"ui-monospace, monospace",minWidth:56},children:[t,"ms"]}),e.jsx("label",{style:{marginLeft:16},children:"Window"}),e.jsxs("select",{value:r,onChange:v=>o(parseInt(v.target.value,10)),children:[e.jsx("option",{value:20,children:"20"}),e.jsx("option",{value:50,children:"50"}),e.jsx("option",{value:100,children:"100"}),e.jsx("option",{value:200,children:"200"})]}),e.jsx("span",{className:"spacer"}),g.peerState!=="running"&&g.peerState!=="dead"&&e.jsx("button",{className:"primary",onClick:g.start,children:"Start heartbeats"}),g.peerState==="running"&&e.jsx("button",{onClick:g.pause,children:"Pause heartbeats"}),g.peerState!=="dead"&&e.jsx("button",{className:"danger",onClick:g.kill,children:"Kill peer"}),g.peerState==="dead"&&e.jsx("button",{className:"primary",onClick:g.revive,children:"Revive peer"})]}),e.jsxs("div",{className:"phi-main",children:[e.jsxs("div",{className:"phi-card",children:[e.jsxs("h3",{children:[e.jsx("span",{children:"φ over time (last 60s)"}),e.jsx("span",{className:"muted",children:"~10Hz sampling"})]}),e.jsxs("svg",{width:yo,height:vo,children:[e.jsx("rect",{x:R,y:B,width:T,height:_,fill:"#0a0e13",stroke:"#1e252e"}),[0,1,3,8,12].map(v=>e.jsxs("g",{children:[e.jsx("line",{x1:R,y1:b(v),x2:D,y2:b(v),stroke:v===1||v===3||v===8?"#3a4250":"#1a2028",strokeDasharray:v===1||v===3||v===8?"4 4":void 0,strokeWidth:v===8?1.2:1}),e.jsx("text",{x:R-6,y:b(v)+3,textAnchor:"end",fill:v===8?"#ff5757":v===3?"#e88b3a":v===1?"#e0c04b":"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, monospace",children:v})]},v)),[60,45,30,15,0].map(v=>{const I=R+(ds-v*1e3)/ds*T;return e.jsxs("g",{children:[e.jsx("line",{x1:I,y1:B,x2:I,y2:V,stroke:"#1a2028"}),e.jsxs("text",{x:I,y:V+14,textAnchor:"middle",fill:"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, monospace",children:["-",v,"s"]})]},v)}),$.arrivals.map((v,I)=>{const S=w-ds;if(v<S)return null;const H=R+(v-S)/ds*T;return e.jsx("line",{x1:H,y1:V,x2:H,y2:V-6,stroke:"#3fb77a",strokeWidth:1.2},`hb-${I}`)}),e.jsx("path",{d:x,fill:"none",stroke:Ir(j),strokeWidth:2}),l.current.length>0&&e.jsx("circle",{cx:D-1,cy:b(j),r:4,fill:Ir(j),stroke:"#0a0e13",strokeWidth:1.5}),e.jsx("text",{x:8,y:B+_/2,transform:`rotate(-90, 8, ${B+_/2})`,textAnchor:"middle",fill:"#8a95a3",fontSize:"11",children:"φ"})]}),e.jsxs("div",{className:"phi-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#3fb77a"}})," healthy (φ < 1)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#e0c04b"}})," mild (φ ≥ 1)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#e88b3a"}})," suspect (φ ≥ 3)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#ff5757"}})," dead (φ ≥ 8)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"dot",style:{background:"#3fb77a",height:6,width:2,borderRadius:0}})," heartbeat arrival"]})]})]}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12},children:[e.jsxs("div",{className:"phi-card",children:[e.jsxs("h3",{children:[e.jsx("span",{children:"Peer"}),e.jsx("span",{className:"muted",children:g.peerState})]}),e.jsxs("div",{className:"phi-peer",children:[e.jsxs("div",{className:`phi-peer-node ${g.peerState==="dead"?"dead":""}`,style:{background:g.peerState==="dead"?void 0:p},children:["P",g.peerState==="dead"&&e.jsxs("svg",{width:"56",height:"56",style:{position:"absolute",inset:0},children:[e.jsx("line",{x1:"14",y1:"14",x2:"42",y2:"42",stroke:"#ff6b6b",strokeWidth:"3"}),e.jsx("line",{x1:"42",y1:"14",x2:"14",y2:"42",stroke:"#ff6b6b",strokeWidth:"3"})]})]}),e.jsxs("div",{className:"phi-peer-meta",children:[e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"interval"})," ",t,"ms ± 20%"]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"last beat"})," ",C!=null?`${(w-C).toFixed(0)}ms ago`:"—"]}),e.jsxs("div",{children:[e.jsx("span",{className:"k",children:"samples"})," ",$.sampleCount," / ",$.windowSize]})]})]})]}),e.jsxs("div",{className:"phi-card",children:[e.jsxs("h3",{children:[e.jsx("span",{children:"Current φ"}),e.jsx("span",{className:"muted",children:Er(j)})]}),e.jsxs("div",{className:"phi-value",children:[e.jsx("span",{className:"phi-dot",style:{background:y,color:y}}),e.jsx("span",{className:"phi-number",style:{color:Ir(j)},children:j.toFixed(2)}),e.jsx("span",{className:"phi-state",children:Er(j)})]}),e.jsxs("div",{style:{fontSize:11,color:"#8a95a3",fontFamily:"ui-monospace, monospace"},children:["mean ",$.mean>0?$.mean.toFixed(0)+"ms":"—"," ","· stddev ",$.stddev>0?$.stddev.toFixed(1)+"ms":"—"]})]}),e.jsxs("div",{className:"phi-card",children:[e.jsxs("h3",{children:[e.jsx("span",{children:"Inter-arrival window"}),e.jsxs("span",{className:"muted",children:[f.length," samples"]})]}),e.jsxs("svg",{width:Ws,height:vs,children:[e.jsx("rect",{x:Bt,y:rs,width:Ws-Bt-Tn,height:vs-rs-hi,fill:"#0a0e13",stroke:"#1e252e"}),u.bins.length>0&&(()=>{const v=Ws-Bt-Tn,I=vs-rs-hi,S=Math.max(...u.bins),H=u.bins.length,M=v/H;return e.jsxs("g",{children:[u.bins.map((k,P)=>{const N=S>0?k/S*(I-4):0;return e.jsx("rect",{x:Bt+P*M+1,y:rs+(I-N),width:Math.max(0,M-2),height:N,fill:p,opacity:.85},P)}),$.mean>0&&u.max>u.min&&e.jsx("line",{x1:Bt+($.mean-u.min)/(u.max-u.min)*v,y1:rs,x2:Bt+($.mean-u.min)/(u.max-u.min)*v,y2:rs+I,stroke:"#f5c542",strokeWidth:"1.5",strokeDasharray:"3 3"}),e.jsxs("text",{x:Bt,y:vs-6,fill:"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, monospace",children:[u.min.toFixed(0),"ms"]}),e.jsxs("text",{x:Ws-Tn,y:vs-6,textAnchor:"end",fill:"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, monospace",children:[u.max.toFixed(0),"ms"]}),e.jsx("text",{x:Bt-4,y:rs+8,textAnchor:"end",fill:"#8a95a3",fontSize:"10",fontFamily:"ui-monospace, monospace",children:S})]})})(),u.bins.length===0&&e.jsx("text",{x:Ws/2,y:vs/2,textAnchor:"middle",fill:"#555",fontSize:"11",children:"(no samples yet)"})]})]})]})]}),e.jsx("div",{className:"phi-status",children:O})]})}

export default Vc;
export { Vc as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Vc, {}));
  return () => root.unmount();
}
