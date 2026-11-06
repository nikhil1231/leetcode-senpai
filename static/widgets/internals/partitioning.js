import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function ln(n,t=0){const s=String(n);let r=t>>>0;const o=3432918353,i=461845907,a=s.length;let l=0;for(;l+4<=a;){let c=s.charCodeAt(l)&255|(s.charCodeAt(l+1)&255)<<8|(s.charCodeAt(l+2)&255)<<16|(s.charCodeAt(l+3)&255)<<24;l+=4,c=Math.imul(c,o),c=c<<15|c>>>17,c=Math.imul(c,i),r^=c,r=r<<13|r>>>19,r=Math.imul(r,5)+3864292196|0}let d=0;switch(a-l){case 3:d^=(s.charCodeAt(l+2)&255)<<16;case 2:d^=(s.charCodeAt(l+1)&255)<<8;case 1:d^=s.charCodeAt(l)&255,d=Math.imul(d,o),d=d<<15|d>>>17,d=Math.imul(d,i),r^=d}return r^=a,r^=r>>>16,r=Math.imul(r,2246822507),r^=r>>>13,r=Math.imul(r,3266489909),r^=r>>>16,r>>>0}
function Wd(n){return"0x"+ln(n).toString(16).padStart(8,"0")}
const Ia="~";
function Bd(n){const t=[];for(let s=0;s<n;s++){const r=Math.floor(s*26/n);t.push(String.fromCharCode(65+r))}return t.push(Ia),t}
function Hd(n,t,s){return!(n<t||n>=s)}
function Kd(n){if(n.length===0)return null;const t=[...n].sort();return t[Math.floor(t.length/2)]}
function Ud(n){let t=n>>>0;return function(){t=t+1831565813>>>0;let s=t;return s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296}}
function Vd(n,t,s){if(t<=0)return 0;const r=n();if(s<=0)return Math.floor(r*t);const o=1+s*2,i=Math.pow(r,o),a=Math.floor(i*t);return Math.min(t-1,Math.max(0,a))}
class jo{constructor({nodeCount:t=4,partitionCount:s=16,strategy:r="hash",rebalance:o="fixed"}={}){if(r!=="hash"&&r!=="range")throw new Error(`unknown strategy '${r}'`);if(!["fixed","dynamic","proportional"].includes(o))throw new Error(`unknown rebalance '${o}'`);this.strategy=r,this.rebalanceStrategy=o,this._nextNodeId=0,this._nextPartitionId=0,this.nodes=[];for(let i=0;i<t;i++)this._addNodeStruct();this.partitions=[],r==="hash"?this._initHashPartitions(s):this._initRangePartitions(s),this._assignPartitionsRoundRobin()}_addNodeStruct(){const t=`n${this._nextNodeId++}`;return this.nodes.push({id:t,partitionIds:[]}),t}_newPartition({range:t=null,hashRange:s=null}){const o={id:this._nextPartitionId++,range:t,hashRange:s,keys:new Map,ownerNodeId:null,qps:0};return this.partitions.push(o),o}_initHashPartitions(t){const s=Math.pow(2,32);for(let r=0;r<t;r++){const o=Math.floor(r*s/t),i=r===t-1?s:Math.floor((r+1)*s/t);this._newPartition({hashRange:{lo:o,hi:i}})}}_initRangePartitions(t){const s=Bd(t);for(let r=0;r<t;r++)this._newPartition({range:{lo:s[r],hi:s[r+1]}})}_assignPartitionsRoundRobin(){for(const t of this.nodes)t.partitionIds=[];for(let t=0;t<this.partitions.length;t++){const s=this.nodes[t%this.nodes.length];this.partitions[t].ownerNodeId=s.id,s.partitionIds.push(this.partitions[t].id)}}_partitionForKey(t){if(this.strategy==="hash"){const s=ln(t);for(const r of this.partitions)if(s>=r.hashRange.lo&&s<r.hashRange.hi)return r;return this.partitions[this.partitions.length-1]}for(const s of this.partitions)if(Hd(t,s.range.lo,s.range.hi))return s;return this.partitions[this.partitions.length-1]}routeInfo(t){const s=this._partitionForKey(t),r={key:String(t),partitionId:s.id,nodeId:s.ownerNodeId};return this.strategy==="hash"?(r.hash=ln(t),r.hashHex=Wd(t)):r.range=s.range,r}put(t,s){const r=this._partitionForKey(t);return r.keys.set(String(t),s),{partitionId:r.id,nodeId:r.ownerNodeId}}get(t){const s=this._partitionForKey(t);return{value:s.keys.get(String(t)),partitionId:s.id,nodeId:s.ownerNodeId}}rangeScan(t,s){const r=[],o=[];if(this.strategy==="hash")for(const i of this.partitions){o.push(i.id);for(const[a,l]of i.keys)a>=t&&a<s&&r.push({key:a,value:l,partitionId:i.id})}else for(const i of this.partitions)if(i.range.lo<s&&i.range.hi>t){o.push(i.id);for(const[a,l]of i.keys)a>=t&&a<s&&r.push({key:a,value:l,partitionId:i.id})}return r.sort((i,a)=>i.key<a.key?-1:i.key>a.key?1:0),{scannedPartitions:o,results:r}}addNode(){const t=this._addNodeStruct();if(this.rebalanceStrategy==="proportional"){const s=Math.max(1,Math.round(this.partitions.length/(this.nodes.length-1)));this.strategy==="hash"?this._splitNRandomHashPartitions(s):this._splitNLargestRangePartitions(s)}return t}removeNode(t){const s=this.nodes.findIndex(o=>o.id===t);if(s===-1||this.nodes.length<=1)return!1;const r=this.nodes.splice(s,1)[0];for(let o=0;o<r.partitionIds.length;o++){const i=this.partitions.find(l=>l.id===r.partitionIds[o]),a=this.nodes[o%this.nodes.length];i.ownerNodeId=a.id,a.partitionIds.push(i.id)}return!0}rebalance(){return this.rebalanceStrategy==="fixed"?this._rebalanceFixed():this.rebalanceStrategy==="dynamic"?this._rebalanceDynamic():this._rebalanceProportional()}_rebalanceFixed(){const t=[],s=this.nodes.length;if(s===0)return{moves:t};const r=[...this.partitions].sort((o,i)=>o.id-i.id);for(const o of this.nodes)o.partitionIds=[];for(let o=0;o<r.length;o++){const i=this.nodes[o%s],a=r[o].ownerNodeId;a!==i.id&&t.push({partitionId:r[o].id,from:a,to:i.id}),r[o].ownerNodeId=i.id,i.partitionIds.push(r[o].id)}return{moves:t}}_rebalanceDynamic(){const t=[];if(this.strategy==="range"){const r=this._avgQps(),o=Math.max(4,this._avgKeyCount()*2),i=[...this.partitions];for(const a of i){const l=a.keys.size>o,d=r>0&&a.qps>2*r;if(l||d){const c=this._splitRangePartitionAtMedian(a);c&&t.push({partitionId:c.id,from:null,to:null,splitFrom:a.id})}}}const s=this._rebalanceFixed().moves;for(const r of t){const o=this.partitions.find(i=>i.id===r.partitionId);r.to=o.ownerNodeId}return{moves:[...t,...s]}}_rebalanceProportional(){return this._rebalanceFixed()}_splitRangePartitionAtMedian(t){if(this.strategy!=="range")return null;if(t.keys.size<2){const a=String.fromCharCode(Math.floor((t.range.lo.charCodeAt(0)+(t.range.hi===Ia?91:t.range.hi.charCodeAt(0)))/2));if(a<=t.range.lo||a>=t.range.hi)return null;const l=this._newPartition({range:{lo:a,hi:t.range.hi}});return l.ownerNodeId=t.ownerNodeId,t.range={lo:t.range.lo,hi:a},l}const s=Kd([...t.keys.keys()]);if(!s||s===t.range.lo)return null;const r=this._newPartition({range:{lo:s,hi:t.range.hi}});r.ownerNodeId=t.ownerNodeId;const o=[...t.keys.entries()];t.keys=new Map;for(const[a,l]of o)a<s?t.keys.set(a,l):r.keys.set(a,l);const i=t.keys.size/Math.max(1,t.keys.size+r.keys.size);return r.qps=Math.round(t.qps*(1-i)),t.qps=Math.round(t.qps*i),t.range={lo:t.range.lo,hi:s},r}_splitNRandomHashPartitions(t){const s=[...this.partitions].sort((r,o)=>o.keys.size-r.keys.size);for(let r=0;r<Math.min(t,s.length);r++){const o=s[r],i=Math.floor((o.hashRange.lo+o.hashRange.hi)/2);if(i<=o.hashRange.lo||i>=o.hashRange.hi)continue;const a=this._newPartition({hashRange:{lo:i,hi:o.hashRange.hi}});a.ownerNodeId=o.ownerNodeId;const l=[...o.keys.entries()];o.keys=new Map;for(const[d,c]of l)ln(d)<i?o.keys.set(d,c):a.keys.set(d,c);o.hashRange={lo:o.hashRange.lo,hi:i}}}_splitNLargestRangePartitions(t){const s=[...this.partitions].sort((r,o)=>o.keys.size-r.keys.size);for(let r=0;r<Math.min(t,s.length);r++)this._splitRangePartitionAtMedian(s[r])}simulateTraffic(t=200,s=0){const r=this._demoKeyPool(),o=Ud(1337);for(const i of this.partitions)i.qps=0;for(let i=0;i<t;i++){const a=Vd(o,r.length,s),l=r[a],d=this._partitionForKey(l);d.qps++}return this.partitions.map(i=>({partitionId:i.id,qps:i.qps}))}_demoKeyPool(){const t=["celebrity","user123","user456","trending","hotkey"];for(let s=0;s<45;s++){const r=String.fromCharCode(65+s%26),o=String.fromCharCode(65+s*7%26);t.push(`${r}${o}${s}`)}return t}_avgQps(){if(this.partitions.length===0)return 0;let t=0;for(const s of this.partitions)t+=s.qps;return t/this.partitions.length}_avgKeyCount(){if(this.partitions.length===0)return 0;let t=0;for(const s of this.partitions)t+=s.keys.size;return t/this.partitions.length}_totalQps(){let t=0;for(const s of this.partitions)t+=s.qps;return t}hotspots(){const t=this._avgQps();return t<=0?[]:this.partitions.filter(s=>s.qps>2*t).map(s=>s.id)}snapshot(){const t=this._totalQps();return{nodes:this.nodes.map(s=>({id:s.id,partitionIds:[...s.partitionIds]})),partitions:this.partitions.map(s=>({id:s.id,range:s.range?{...s.range}:null,hashRange:s.hashRange?{...s.hashRange}:null,keys:[...s.keys.keys()],ownerNodeId:s.ownerNodeId,keyCount:s.keys.size,qpsEstimate:s.qps,qpsShare:t>0?s.qps/t:0})),currentStrategy:this.strategy,rebalanceStrategy:this.rebalanceStrategy,hotspots:this.hotspots(),totalQps:t}}}
function Gd(n,t,s,r=16){const o=new jo({strategy:"hash",partitionCount:r,nodeCount:4}),i=new jo({strategy:"range",partitionCount:r,nodeCount:4});for(const d of n)o.put(d,1),i.put(d,1);const a=o.rangeScan(t,s),l=i.rangeScan(t,s);return{hash:{scanned:a.scannedPartitions.length,hits:a.results.length},range:{scanned:l.scannedPartitions.length,hits:l.results.length}}}
const rt="#0f1419",Us="#1a1f2e",ye="#2a2f3e",ut="#e6e6e6",ve="#8a93a6",Ct="#4a7cff",$i="#f5c451",Ft="#f66",zo="#5cd894";
function gn(n){const t=[Ct,zo,"#b084f9","#ff9f5a","#52c8d7","#e870b8"],s=parseInt(String(n).replace(/^n/,""),10)||0;return t[s%t.length]}
function Yd({lo:n,hi:t}){const s=r=>r.toString(16).padStart(8,"0");return`0x${s(n)}..0x${s(t)}`}
function Xd({partitions:n,highlighted:t,width:s=780,height:r=70}){const l=s/61,d=c=>(c.charCodeAt(0)-65)*l;return e.jsxs("svg",{width:s,height:r,style:{display:"block"},children:[e.jsx("line",{x1:0,y1:40,x2:s,y2:40,stroke:ye,strokeWidth:1}),Array.from({length:27},(c,p)=>{const m=String.fromCharCode(65+p);return p%2!==0?null:e.jsxs("g",{children:[e.jsx("line",{x1:d(m),y1:38,x2:d(m),y2:46,stroke:ve,strokeWidth:.5}),e.jsx("text",{x:d(m),y:58,fontSize:10,fill:ve,textAnchor:"middle",fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:m==="~"?"z+":m})]},m)}),n.map(c=>{const p=d(c.range.lo),m=d(c.range.hi),g=gn(c.ownerNodeId),w=t.has(c.id);return e.jsxs("g",{children:[e.jsx("rect",{x:p,y:20,width:Math.max(2,m-p),height:20,fill:g,fillOpacity:.8,stroke:w?Ft:"#fff3",strokeWidth:w?2:1}),e.jsxs("text",{x:(p+m)/2,y:34,textAnchor:"middle",fontSize:10,fill:rt,fontWeight:700,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:["P",c.id]})]},c.id)})]})}
function Jd({partitions:n,highlighted:t,size:s=220}){const r=s/2,o=s/2,i=s/2-10,a=i-22,l=Math.pow(2,32),d=(p,m)=>{const g=p*2*Math.PI-Math.PI/2;return{x:r+m*Math.cos(g),y:o+m*Math.sin(g)}},c=(p,m)=>{const g=d(p,i),w=d(m,i),C=d(m,a),j=d(p,a),$=m-p>.5?1:0;return[`M ${g.x} ${g.y}`,`A ${i} ${i} 0 ${$} 1 ${w.x} ${w.y}`,`L ${C.x} ${C.y}`,`A ${a} ${a} 0 ${$} 0 ${j.x} ${j.y}`,"Z"].join(" ")};return e.jsxs("svg",{width:s,height:s,style:{display:"block"},children:[e.jsx("circle",{cx:r,cy:o,r:i+2,fill:"none",stroke:ye}),n.map(p=>{const m=p.hashRange.lo/l,g=p.hashRange.hi/l,w=gn(p.ownerNodeId),C=t.has(p.id),j=(m+g)/2,$=d(j,(i+a)/2);return e.jsxs("g",{children:[e.jsx("path",{d:c(m,g),fill:w,fillOpacity:.8,stroke:C?Ft:"#fff3",strokeWidth:C?2:1}),e.jsxs("text",{x:$.x,y:$.y+3,fontSize:9,textAnchor:"middle",fill:rt,fontWeight:700,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:["P",p.id]})]},p.id)}),e.jsx("text",{x:r,y:o-4,textAnchor:"middle",fontSize:10,fill:ve,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:"hash ring"}),e.jsx("text",{x:r,y:o+10,textAnchor:"middle",fontSize:9,fill:ve,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:"0..2³²"})]})}
function Qd({p:n,maxQps:t,hot:s,flashing:r}){const o=t>0?n.qpsEstimate/t:0;return e.jsxs("div",{className:"pt-card"+(s?" pt-card-hot":"")+(r?" pt-card-flash":""),children:[e.jsxs("div",{className:"pt-card-head",children:[e.jsxs("span",{className:"pt-card-id",children:["P",n.id]}),e.jsxs("span",{className:"pt-card-count",children:[n.keyCount," keys"]})]}),e.jsx("div",{className:"pt-card-range",children:n.range?`${n.range.lo} .. ${n.range.hi==="~"?"z+":n.range.hi}`:Yd(n.hashRange)}),e.jsxs("div",{className:"pt-qps-wrap",children:[e.jsx("div",{className:"pt-qps-bar"+(s?" pt-qps-hot":""),style:{width:`${Math.round(o*100)}%`}}),e.jsxs("span",{className:"pt-qps-label",children:[n.qpsEstimate," qps"]})]})]})}
function Zd({node:n,partitions:t,maxQps:s,hotSet:r,flashSet:o}){const i=gn(n.id);return e.jsxs("div",{className:"pt-node",style:{borderTop:`3px solid ${i}`},children:[e.jsxs("div",{className:"pt-node-head",children:[e.jsx("span",{className:"pt-node-id",style:{color:i},children:n.id}),e.jsxs("span",{className:"pt-node-sub",children:[t.length," partitions"]})]}),e.jsx("div",{className:"pt-node-body",children:t.length===0?e.jsx("div",{className:"pt-empty",children:"(no partitions)"}):t.map(a=>e.jsx(Qd,{p:a,maxQps:s,hot:r.has(a.id),flashing:o.has(a.id)},a.id))})]})}
function ep(){const[n,t]=h.useState("hash"),[s,r]=h.useState("fixed"),[o,i]=h.useState(4),[a,l]=h.useState(16),d=h.useRef(null),[c,p]=h.useState(null),[m,g]=h.useState("Pick a strategy, put some keys, then simulate traffic or rebalance."),[w,C]=h.useState("user123"),[j,$]=h.useState("alice"),[O,q]=h.useState("A"),[R,D]=h.useState("F"),[B,V]=h.useState(0),[T,_]=h.useState(500),[b,x]=h.useState(null),[f,u]=h.useState(new Set),[y,v]=h.useState(null),I=(L=n,G=a,te=o,re=s)=>{d.current=new jo({strategy:L,partitionCount:G,nodeCount:te,rebalance:re}),p(d.current.snapshot()),x(null),v(null)};h.useEffect(()=>{I()},[]);const S=()=>p(d.current.snapshot()),H=(L,G=800)=>{u(new Set(L)),setTimeout(()=>u(new Set),G)},M=L=>{t(L),I(L,a,o,s),g(L==="hash"?"Switched to hash partitioning: hash(key) → partition. Range scans hit every partition.":"Switched to range partitioning: keys partitioned by lex range. Range scans stay local; sequential writes risk hotspots.")},k=L=>{r(L),I(n,a,o,L),g(L==="fixed"?"Rebalance = FIXED: partitions never split; adding a node just moves some over.":L==="dynamic"?"Rebalance = DYNAMIC: hot/large range-partitions split at the median (hash mode degrades to fixed).":"Rebalance = PROPORTIONAL: each new node brings its own set of fresh partitions (Cassandra-style).")},P=L=>{const G=Number(L);l(G),I(n,G,o,s)},N=L=>{const G=Number(L);i(G),I(n,a,G,s)},z=()=>{if(!w)return;const L=d.current,G=L.routeInfo(w);L.put(w,j),g(n==="hash"?`Hash partitioning: put(k='${w}') → murmur=${G.hashHex} → partition ${G.partitionId} → node ${G.nodeId}`:`Range partitioning: put(k='${w}') → range [${G.range.lo}..${G.range.hi==="~"?"z+":G.range.hi}) → partition ${G.partitionId} → node ${G.nodeId}`),H([G.partitionId]),S()},E=()=>{if(!w)return;const G=d.current.get(w);g(`get('${w}') → partition ${G.partitionId} on ${G.nodeId} ⇒ ${G.value===void 0?"(not found)":JSON.stringify(G.value)}`),H([G.partitionId])},J=()=>{if(!O||!R)return;const L=d.current,G=L.rangeScan(O,R);x(new Set(G.scannedPartitions)),H(G.scannedPartitions,1200);const te=L.partitions.length,re=n==="range"?` (hash would scan all ${te})`:" (range would scan only the overlapping few)";g(`Range scan [${O}..${R}): scanned ${G.scannedPartitions.length} partition${G.scannedPartitions.length===1?"":"s"}, ${G.results.length} result${G.results.length===1?"":"s"}${re}.`)},Y=()=>{const L=d.current;L.simulateTraffic(T,B);const G=L.snapshot();p(G);const te=G.totalQps||1;if(G.hotspots.length>0){const re=G.partitions.find(Mt=>Mt.id===G.hotspots[0]),ie=re&&re.keys[0],ke=re?`${Math.round(re.qpsEstimate/te*100)}%`:"";g(`Traffic(${T}, skew=${B.toFixed(2)}): ${G.hotspots.length} hotspot(s). Hottest: partition ${re.id}${ie?` (key='${ie}')`:""} at ${ke} of total QPS.`)}else g(`Traffic(${T}, skew=${B.toFixed(2)}): load spread evenly, no hotspot.`)},se=()=>{const G=d.current.addNode();g(`Added node ${G}. Rebalance to redistribute partitions.`),S()},A=()=>{const L=d.current;if(L.nodes.length<=1){g("Need at least one node.");return}const G=L.nodes[L.nodes.length-1].id;L.removeNode(G),g(`Removed node ${G}; its partitions were reassigned round-robin.`),S()},K=()=>{const L=d.current,G=L.partitions.length,{moves:te}=L.rebalance(),re=L.partitions.length;p(L.snapshot());const ie=re-G,ke=Math.round(re/Math.max(1,L.nodes.length)),Mt=te.map(Dt=>Dt.partitionId);H(Mt,1500),g(s==="fixed"?`Rebalance (fixed): moved ${te.length} partitions; layout ≈ ${ke} per node.`:s==="dynamic"?`Rebalance (dynamic): ${ie>0?`split ${ie} hot partition(s); `:""}moved ${te.length} ownership(s); now ${re} partitions.`:`Rebalance (proportional): new partitions were created with the new node; moved ${te.length} ownerships.`)},Q=()=>{I(n,a,o,s);const L=d.current,G=["A","B","C","D"];for(let te=0;te<40;te++){const re=`${G[te%1]}k${String(te).padStart(3,"0")}`;L.put(re,te)}L.simulateTraffic(400,0),p(L.snapshot()),g(n==="range"?"Seeded 40 sequential keys (all starting with 'A') under range partitioning — watch partition 0 become a hotspot.":"Seeded 40 sequential 'A'-prefixed keys under hash partitioning — the hash spreads them across all partitions.")},X=()=>{I(n,a,o,s);const L=d.current;L.put("celebrity","mega-fan"),L.put("user123","alice"),L.put("user456","bob"),L.simulateTraffic(600,1),p(L.snapshot());const G=L.snapshot(),te=G.partitions.find(re=>G.hotspots.includes(re.id));g(te?`Celebrity workload + skew=1.0 → partition ${te.id} at ${Math.round(te.qpsEstimate/Math.max(1,G.totalQps)*100)}% of QPS. Hashing doesn't help: a single hot KEY needs per-key mitigation.`:"Celebrity workload seeded; increase skew to see the hotspot.")},ee=()=>{const L=[];for(let te=0;te<40;te++)L.push(`A${String(te).padStart(3,"0")}`);for(let te=0;te<20;te++){const re=String.fromCharCode(65+te%26);L.push(`${re}${te}`)}const G=Gd(L,"A","F",a);v({keys:L.length,scanLo:"A",scanHi:"F",partitions:a,...G}),g(`Compare mode: scan [A..F) on ${L.length} keys × ${a} partitions — hash scans ${G.hash.scanned}, range scans ${G.range.scanned}.`)},F=h.useMemo(()=>c?c.partitions.reduce((L,G)=>Math.max(L,G.qpsEstimate),0):0,[c]),U=h.useMemo(()=>new Set((c==null?void 0:c.hotspots)||[]),[c]),Z=b||new Set;if(!c)return e.jsx("div",{style:{color:ut,padding:16},children:"Initializing cluster…"});const W=new Map(c.partitions.map(L=>[L.id,L]));return e.jsxs("div",{className:"pt-root",children:[e.jsx("style",{children:tp}),e.jsxs("div",{className:"pt-panel",children:[e.jsxs("div",{className:"pt-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"pt-title",children:"Partitioning Strategies — DDIA Ch 6"}),e.jsx("div",{className:"pt-subtitle",children:"Hash vs range partitioning · hotspots · rebalancing"})]}),e.jsxs("div",{className:"pt-title-controls",children:[e.jsxs("label",{className:"pt-label",children:["Strategy: ",e.jsxs("span",{className:"pt-toggle",children:[e.jsx("button",{className:"pt-toggle-opt"+(n==="hash"?" active":""),onClick:()=>M("hash"),children:"hash"}),e.jsx("button",{className:"pt-toggle-opt"+(n==="range"?" active":""),onClick:()=>M("range"),children:"range"})]})]}),e.jsxs("label",{className:"pt-label",children:["Partitions: ",e.jsxs("select",{value:a,onChange:L=>P(L.target.value),children:[e.jsx("option",{value:4,children:"4"}),e.jsx("option",{value:8,children:"8"}),e.jsx("option",{value:16,children:"16"}),e.jsx("option",{value:32,children:"32"})]})]}),e.jsxs("label",{className:"pt-label",children:["Nodes: ",e.jsxs("select",{value:o,onChange:L=>N(L.target.value),children:[e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:3,children:"3"}),e.jsx("option",{value:4,children:"4"}),e.jsx("option",{value:6,children:"6"})]})]}),e.jsxs("label",{className:"pt-label",children:["Rebalance: ",e.jsxs("select",{value:s,onChange:L=>k(L.target.value),children:[e.jsx("option",{value:"fixed",children:"fixed"}),e.jsx("option",{value:"dynamic",children:"dynamic"}),e.jsx("option",{value:"proportional",children:"proportional"})]})]})]})]}),e.jsxs("div",{className:"pt-controls",children:[e.jsxs("div",{className:"pt-ctrl-group",children:[e.jsx("input",{className:"pt-input",placeholder:"key",style:{width:100},value:w,onChange:L=>C(L.target.value)}),e.jsx("input",{className:"pt-input",placeholder:"value",style:{width:90},value:j,onChange:L=>$(L.target.value)}),e.jsx("button",{className:"pt-btn",onClick:z,children:"Put"}),e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:E,children:"Get"})]}),e.jsx("span",{className:"pt-sep"}),e.jsxs("div",{className:"pt-ctrl-group",children:[e.jsx("span",{className:"pt-lbl-mini",children:"scan"}),e.jsx("input",{className:"pt-input",placeholder:"lo",style:{width:50},value:O,onChange:L=>q(L.target.value)}),e.jsx("span",{className:"pt-lbl-mini",children:".."}),e.jsx("input",{className:"pt-input",placeholder:"hi",style:{width:50},value:R,onChange:L=>D(L.target.value)}),e.jsx("button",{className:"pt-btn pt-btn-good",onClick:J,children:"Range Scan"})]})]}),e.jsxs("div",{className:"pt-controls",children:[e.jsxs("div",{className:"pt-ctrl-group",children:[e.jsx("span",{className:"pt-lbl-mini",children:"traffic"}),e.jsx("input",{className:"pt-input",type:"number",style:{width:70},value:T,onChange:L=>_(Number(L.target.value)||0)}),e.jsx("span",{className:"pt-lbl-mini",children:"skew"}),e.jsx("input",{type:"range",min:0,max:1,step:.05,value:B,onChange:L=>V(Number(L.target.value)),style:{width:110}}),e.jsx("span",{className:"pt-lbl-mini pt-mono",children:B.toFixed(2)}),e.jsx("button",{className:"pt-btn",onClick:Y,children:"Generate Traffic"})]}),e.jsx("span",{className:"pt-sep"}),e.jsxs("div",{className:"pt-ctrl-group",children:[e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:se,children:"+ Node"}),e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:A,children:"− Node"}),e.jsx("button",{className:"pt-btn pt-btn-warn",onClick:K,children:"Rebalance"})]}),e.jsx("span",{className:"pt-sep"}),e.jsxs("div",{className:"pt-ctrl-group",children:[e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:Q,children:"Scenario: sequential keys"}),e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:X,children:"Scenario: celebrity key"}),e.jsx("button",{className:"pt-btn pt-btn-ghost",onClick:ee,children:"Compare hash vs range"})]})]}),e.jsxs("div",{className:"pt-topo",children:[n==="range"?e.jsx(Xd,{partitions:c.partitions,highlighted:new Set([...Z,...U])}):e.jsx(Jd,{partitions:c.partitions,highlighted:new Set([...Z,...U])}),e.jsxs("div",{className:"pt-topo-legend",children:[c.nodes.map(L=>e.jsxs("div",{className:"pt-legend-row",children:[e.jsx("span",{className:"pt-dot",style:{background:gn(L.id)}}),e.jsx("span",{className:"pt-mono",children:L.id}),e.jsxs("span",{className:"pt-mini",children:["(",L.partitionIds.length," parts)"]})]},L.id)),U.size>0&&e.jsxs("div",{className:"pt-legend-row",children:[e.jsx("span",{className:"pt-dot",style:{background:Ft,boxShadow:`0 0 6px ${Ft}`}}),e.jsx("span",{className:"pt-mono",children:"hotspot"})]})]})]}),e.jsx("div",{className:"pt-nodes",children:c.nodes.map(L=>{const G=L.partitionIds.map(te=>W.get(te)).filter(Boolean);return e.jsx(Zd,{node:L,partitions:G,maxQps:F,hotSet:U,flashSet:f},L.id)})}),y&&e.jsxs("div",{className:"pt-compare",children:[e.jsxs("div",{className:"pt-compare-title",children:["Compare (same workload: ",y.keys," keys, scan [",y.scanLo,"..",y.scanHi,"), ",y.partitions," partitions)"]}),e.jsxs("div",{className:"pt-compare-row",children:[e.jsxs("div",{className:"pt-compare-col",children:[e.jsx("span",{className:"pt-mono",style:{color:Ct},children:"hash"}),e.jsxs("div",{className:"pt-mini",children:["scan touched ",e.jsx("strong",{children:y.hash.scanned})," / ",y.partitions," partitions · ",e.jsx("strong",{children:y.hash.hits})," results"]}),e.jsx("div",{className:"pt-mini",children:"(range locality lost → scatter-gather)"})]}),e.jsxs("div",{className:"pt-compare-col",children:[e.jsx("span",{className:"pt-mono",style:{color:zo},children:"range"}),e.jsxs("div",{className:"pt-mini",children:["scan touched ",e.jsx("strong",{children:y.range.scanned})," /"," ",y.partitions," partitions ·"," ",e.jsx("strong",{children:y.range.hits})," results"]}),e.jsx("div",{className:"pt-mini",children:"(sorted keys → scan stays local)"})]})]})]}),e.jsxs("div",{className:"pt-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"strategy"}),"=",c.currentStrategy]}),e.jsxs("span",{children:[e.jsx("strong",{children:"rebalance"}),"=",c.rebalanceStrategy]}),e.jsxs("span",{children:[e.jsx("strong",{children:"nodes"}),"=",c.nodes.length]}),e.jsxs("span",{children:[e.jsx("strong",{children:"partitions"}),"=",c.partitions.length]}),e.jsxs("span",{children:[e.jsx("strong",{children:"total QPS"}),"=",c.totalQps]}),e.jsxs("span",{style:{color:c.hotspots.length>0?Ft:ve},children:[e.jsx("strong",{children:"hotspots"}),"=",c.hotspots.length]})]}),e.jsxs("div",{className:"pt-teach",children:[e.jsxs("div",{className:"pt-teach-col",children:[e.jsx("div",{className:"pt-teach-title",children:"Hash partitioning"}),e.jsxs("div",{className:"pt-teach-body",children:["hash(key) % N → partition. Load spreads uniformly but adjacent keys scatter; any range query becomes scatter/gather (all ",c.partitions.length,")."]})]}),e.jsxs("div",{className:"pt-teach-col",children:[e.jsx("div",{className:"pt-teach-title",children:"Range partitioning"}),e.jsx("div",{className:"pt-teach-body",children:"Keys in sorted ranges → cheap range scans, but sequential writes (e.g. timestamps) pile up on one partition."})]}),e.jsxs("div",{className:"pt-teach-col",children:[e.jsx("div",{className:"pt-teach-title",children:"Hotspots"}),e.jsx("div",{className:"pt-teach-body",children:"Even hashing can't save a single hot KEY (celebrity). Application must split the hot key (e.g. append a 2-digit suffix)."})]}),e.jsxs("div",{className:"pt-teach-col",children:[e.jsx("div",{className:"pt-teach-title",children:"Rebalance strategies"}),e.jsxs("div",{className:"pt-teach-body",children:[e.jsx("strong",{children:"fixed"})," (Riak/ES): many partitions, move wholesale."," ",e.jsx("strong",{children:"dynamic"})," (HBase): split hot partitions at median."," ",e.jsx("strong",{children:"proportional"})," (Cassandra): N partitions per node."]})]})]}),e.jsxs("div",{className:"pt-status",children:[e.jsx("span",{className:"pt-status-dot"}),e.jsx("span",{className:"pt-status-text",children:m})]})]})]})}
const tp=`
.pt-root {
  color: ${ut};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${rt};
}
.pt-panel {
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.pt-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${ye};
  flex-wrap: wrap;
}
.pt-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ut};
}
.pt-subtitle {
  font-size: 12px;
  color: ${ve};
  margin-top: 2px;
}
.pt-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.pt-label {
  color: ${ve};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.pt-label select {
  background: ${rt};
  border: 1px solid ${ye};
  color: ${ut};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.pt-toggle {
  display: inline-flex;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 5px;
  overflow: hidden;
}
.pt-toggle-opt {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: ${ve};
  font-size: 12px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-toggle-opt.active {
  background: ${Ct};
  color: white;
}
.pt-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${ye};
}
.pt-ctrl-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pt-btn {
  padding: 5px 12px;
  background: ${Ct};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.pt-btn:hover { filter: brightness(1.15); }
.pt-btn-good { background: ${zo}; color: ${rt}; }
.pt-btn-warn { background: ${$i}; color: ${rt}; }
.pt-btn-ghost {
  background: transparent;
  border: 1px solid ${ye};
  color: ${ut};
}
.pt-sep {
  width: 1px;
  height: 20px;
  background: ${ye};
}
.pt-lbl-mini {
  color: ${ve};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-mini {
  font-size: 11px;
  color: ${ve};
}
.pt-input {
  padding: 5px 8px;
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 4px;
  color: ${ut};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-input:focus {
  outline: none;
  border-color: ${Ct};
}
.pt-topo {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 12px 4px;
  border-bottom: 1px dashed ${ye};
}
.pt-topo-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
}
.pt-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: ${ve};
}
.pt-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.pt-nodes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${ye};
}
.pt-node {
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pt-node-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px dashed ${ye};
  padding-bottom: 4px;
}
.pt-node-id {
  font-weight: 700;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-node-sub {
  font-size: 10px;
  color: ${ve};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-node-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 280px;
  overflow-y: auto;
}
.pt-empty {
  color: ${ve};
  font-size: 11px;
  font-style: italic;
}
.pt-card {
  background: ${Us};
  border: 1px solid ${ye};
  border-radius: 5px;
  padding: 5px 7px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
}
.pt-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.pt-card-id {
  color: ${ut};
  font-weight: 700;
}
.pt-card-count {
  color: ${ve};
  font-size: 10px;
}
.pt-card-range {
  color: ${ve};
  font-size: 10px;
  margin-top: 1px;
  word-break: break-all;
}
.pt-qps-wrap {
  position: relative;
  height: 9px;
  background: ${ye};
  border-radius: 3px;
  margin-top: 4px;
  overflow: visible;
}
.pt-qps-bar {
  height: 100%;
  background: ${Ct};
  border-radius: 3px;
  transition: width 0.4s;
}
.pt-qps-hot {
  background: ${Ft};
}
.pt-qps-label {
  position: absolute;
  right: 2px;
  top: -1px;
  color: ${ve};
  font-size: 9px;
}
.pt-card-hot {
  border-color: ${Ft};
  animation: pt-pulse 1.3s ease-in-out infinite;
}
@keyframes pt-pulse {
  0%, 100% { box-shadow: 0 0 0 0 ${Ft}00; }
  50% { box-shadow: 0 0 0 3px ${Ft}55; }
}
.pt-card-flash {
  animation: pt-flash 0.8s ease-in-out;
  transform: translateX(0);
}
@keyframes pt-flash {
  0% { background: ${$i}; transform: scale(1.04); }
  100% { background: ${Us}; transform: scale(1); }
}
.pt-compare {
  margin-top: 12px;
  padding: 10px 12px;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 6px;
}
.pt-compare-title {
  color: ${ve};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 6px;
}
.pt-compare-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pt-compare-col {
  background: ${Us};
  padding: 8px 10px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pt-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${rt};
  border: 1px solid ${ye};
  border-radius: 6px;
  font-size: 12px;
  color: ${ve};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-stats strong { color: ${ut}; font-weight: 600; margin-right: 2px; }
.pt-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.pt-teach-col {
  background: ${rt};
  border: 1px solid ${ye};
  border-left: 3px solid ${Ct};
  border-radius: 4px;
  padding: 8px 10px;
}
.pt-teach-title {
  font-size: 12px;
  font-weight: 700;
  color: ${ut};
  margin-bottom: 4px;
}
.pt-teach-body {
  font-size: 11px;
  color: ${ve};
  line-height: 1.5;
}
.pt-teach-body strong { color: ${ut}; }
.pt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  background: ${rt};
  border-left: 3px solid ${Ct};
  border-radius: 4px;
  font-size: 12px;
  color: ${ut};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pt-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Ct};
  box-shadow: 0 0 8px ${Ct};
  flex-shrink: 0;
}
`;

export default ep;
export { ep as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ep, {}));
  return () => root.unmount();
}
