import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Gc=2166136261,Yc=16777619;
function ui(n){let t=Gc;for(let s=0;s<n.length;s++)t^=n.charCodeAt(s),t=Math.imul(t,Yc);return t>>>0}
function mi(n){return"0x"+("00000000"+n.toString(16)).slice(-8).slice(-4)}
function fi(n){return"0x"+("00000000"+n.toString(16)).slice(-8)}
function Xc(n,t){let s=1;for(;s<t;)s*=n;return s}
function Jc(n,t,s){const r=Math.ceil(t/s),o=Math.floor(n/r);return Math.min(o,s-1)}
function Qc(n,t,s){const r=Math.ceil(t/s),o=n*r,i=Math.min(t-1,o+r-1);return{lo:o,hi:i}}
class xi{constructor({name:t,keySpace:s=16,leavesPerLevel:r=4}={}){this.name=t||"R",this.keySpace=s,this.branch=Math.max(2,r),this.numLeaves=Xc(this.branch,s),this.entries=new Map,this._clock=0}_tick(){return this._clock+=1,this._clock}put(t,s,r){const o=Number(t);if(!Number.isFinite(o)||o<0||o>=this.keySpace)throw new Error(`key ${t} outside [0, ${this.keySpace-1}] for replica ${this.name}`);const i=r===void 0?this._tick():r;return this.entries.set(o,{value:s,ts:i,tombstone:!1}),i}delete(t,s){const r=Number(t);if(!Number.isFinite(r)||r<0||r>=this.keySpace)throw new Error(`key ${t} outside [0, ${this.keySpace-1}] for replica ${this.name}`);const o=s===void 0?this._tick():s;return this.entries.set(r,{value:null,ts:o,tombstone:!0}),o}get(t){const s=Number(t),r=this.entries.get(s);if(r)return r.tombstone?null:r.value}applyRecord(t,s){const r=this.entries.get(t);return r&&r.ts>=s.ts?!1:(this.entries.set(t,{...s}),s.ts>this._clock&&(this._clock=s.ts),!0)}estimateFullRangeBytes(){let t=0;for(const[s,r]of this.entries.entries())t+=4,t+=4,r.tombstone?t+=1:t+=String(r.value).length;return t}buildMerkle(){const t=this.numLeaves,s=this.branch,r=Array.from({length:t},()=>[]);for(const[d,c]of this.entries.entries()){const p=Jc(d,this.keySpace,t);r[p].push({key:d,...c})}for(const d of r)d.sort((c,p)=>c.key-p.key);const o=r.map((d,c)=>{const p=Qc(c,this.keySpace,t),m=d.map(w=>`${w.key}=${w.tombstone?`TOMB@${w.ts}`:`${w.value}@${w.ts}`}`).join("|"),g=ui(`L${c}[${p.lo}-${p.hi}]{${m}}`);return{type:"leaf",index:c,range:p,keys:d,hash:g,hashHex:mi(g),hashFull:fi(g),children:[],nodeId:""}});let i=o,a=0;for(;i.length>1;){const d=[];for(let c=0;c<i.length;c+=s){const p=i.slice(c,c+s),m=p.map(w=>w.hashFull).join("|"),g=ui(`N${a}:${m}`);d.push({type:"internal",depth:a+1,hash:g,hashHex:mi(g),hashFull:fi(g),children:p,nodeId:""})}i=d,a+=1}const l=i[0];return(function d(c,p){if(c.nodeId=p,c.children)for(let m=0;m<c.children.length;m++)d(c.children[m],p+"/"+m)})(l,"R"),{root:l,leaves:o,numLeaves:t,branch:s,keySpace:this.keySpace}}}
function wo(n,t){if(n.keySpace!==t.keySpace)throw new Error("replicas have mismatched key spaces");const s=n.buildMerkle(),r=t.buildMerkle();if(s.numLeaves!==r.numLeaves||s.branch!==r.branch)throw new Error("replicas have mismatched Merkle shapes");const o=[],i=[],a=[];let l=0,d=0;const c=4;function p(g,w){if(l+=1,d+=c*2,o.push({depth:g.type==="leaf"?0:g.depth,aHash:g.hashFull,bHash:w.hashFull,matched:g.hash===w.hash,isLeaf:g.type==="leaf",range:g.type==="leaf"?g.range:null,indexA:g.type==="leaf"?g.index:null}),g.hash!==w.hash){if(g.type==="leaf"){i.push({...g.range,index:g.index}),a.push({leafA:g,leafB:w});return}for(let C=0;C<g.children.length;C++)p(g.children[C],w.children[C])}}p(s.root,r.root);const m=n.estimateFullRangeBytes()+t.estimateFullRangeBytes();return{treeA:s,treeB:r,descents:o,divergentLeafRanges:i,divergentLeafPairs:a,nodesCompared:l,hashBytesCompared:d,fullBytes:m,rootsMatch:s.root.hash===r.root.hash,rootAHex:s.root.hashHex,rootBHex:r.root.hashHex}}
function Zc(n,t,s="last-write-wins",r="both"){const o=wo(n,t),i=[];for(const{leafA:a,leafB:l}of o.divergentLeafPairs){const d=new Set;for(const c of a.keys)d.add(c.key);for(const c of l.keys)d.add(c.key);for(const c of d){const p=n.entries.get(c),m=t.entries.get(c);if(s==="last-write-wins"){const g=p?p.ts:-1,w=m?m.ts:-1;let C=null;if(g>w)C="A";else if(w>g)C="B";else if(g>=0&&w>=0){if((p.value??"")===(m.value??"")&&p.tombstone===m.tombstone)continue;C=n.name<=t.name?"A":"B"}else if(g>=0)C="A";else if(w>=0)C="B";else continue;if(C==="A"&&(r==="A->B"||r==="both")){const j=t.entries.get(c);j&&j.ts===p.ts&&j.value===p.value&&j.tombstone===p.tombstone||(t.entries.set(c,{...p}),p.ts>t._clock&&(t._clock=p.ts),i.push({key:c,from:n.name,to:t.name,record:{...p}}))}else if(C==="B"&&(r==="B->A"||r==="both")){const j=n.entries.get(c);j&&j.ts===m.ts&&j.value===m.value&&j.tombstone===m.tombstone||(n.entries.set(c,{...m}),m.ts>n._clock&&(n._clock=m.ts),i.push({key:c,from:t.name,to:n.name,record:{...m}}))}}else p&&!m&&(r==="A->B"||r==="both")?t.applyRecord(c,p)&&i.push({key:c,from:n.name,to:t.name,record:{...p}}):m&&!p&&(r==="B->A"||r==="both")?n.applyRecord(c,m)&&i.push({key:c,from:t.name,to:n.name,record:{...m}}):p&&m&&p.value!==m.value&&(r==="A->B"||r==="both")&&t.applyRecord(c,p)&&i.push({key:c,from:n.name,to:t.name,record:{...p}})}}return{transferred:i,diff:o}}
const Nt="#0f1419",Mn="#1a1f2e",Le="#2a2f3e",zt="#e6e6e6",Qe="#8a93a6",ls="#4a7cff",ko="#f5c451",jr="#f66",us="#5cd894",_a="#4a5068",zr=260,ed=450;
function Ra(n){if(n==null)return"";const t=String(n);return t.length>8?t.slice(0,8)+"…":t}
function td(n,t,s){const r=[];(function p(m,g){if(r[g]||(r[g]=[]),r[g].push(m),m.children)for(const w of m.children)p(w,g+1)})(n.root,0);const o=r.length-1,i=s/Math.max(1,o+1),a=n.numLeaves,l=t/a;function d(p,m,g){const w=(m+g/2)*l;if(p._x=w,p.children&&p.children.length){const C=g/p.children.length;for(let j=0;j<p.children.length;j++)d(p.children[j],m+j*C,C)}}d(n.root,0,a);function c(p,m){if(p._y=m*i+i/2,p.children)for(const g of p.children)c(g,m+1)}return c(n.root,0),{levels:r,rowH:i,colW:l,width:t,height:s}}
function sd(n){const t=[];return(function s(r){if(t.push(r),r.children)for(const o of r.children)s(o)})(n.root),t}
function rd(n){return n==="match"?us:n==="differ"?jr:n==="visiting"?ko:_a}
function nd({tree:n,statuses:t,highlightedLeafRanges:s,width:r=360,height:o=220,label:i,labelColor:a}){const l=h.useMemo(()=>n?sd(n):[],[n]);h.useMemo(()=>n?td(n,r,o):null,[n,r,o]);const d=h.useMemo(()=>new Set((s==null?void 0:s.map(p=>p.index))||[]),[s]);if(!n)return e.jsx("div",{className:"mk-svg-placeholder",style:{width:r,height:o},children:e.jsx("span",{style:{color:Qe,fontSize:12},children:'(click "Build Merkle")'})});const c=[];for(const p of l)if(p.children)for(const m of p.children)c.push({x1:p._x,y1:p._y,x2:m._x,y2:m._y,key:`${p.hashFull}-${m.hashFull}-${m._x}-${m._y}`});return e.jsxs("svg",{width:r,height:o,style:{display:"block",background:Nt,borderRadius:6},children:[e.jsx("text",{x:8,y:14,fill:a||Qe,fontSize:11,fontWeight:700,children:i}),c.map(p=>e.jsx("line",{x1:p.x1,y1:p.y1,x2:p.x2,y2:p.y2,stroke:Le,strokeWidth:1},p.key)),l.map(p=>{const m=(t==null?void 0:t.get(p.nodeId))||"unchecked",g=rd(m),w=p.type==="leaf",C=w?9:11,j=w&&d.has(p.index);return e.jsxs("g",{children:[j&&e.jsx("circle",{cx:p._x,cy:p._y,r:C+5,fill:"none",stroke:jr,strokeWidth:1.5,strokeDasharray:"3 2",opacity:.8,children:e.jsx("animate",{attributeName:"r",from:C+3,to:C+8,dur:"1.2s",repeatCount:"indefinite"})}),e.jsx("circle",{cx:p._x,cy:p._y,r:C,fill:g,stroke:w?Le:"#fff3",strokeWidth:1.5}),e.jsx("text",{x:p._x,y:p._y+3,textAnchor:"middle",fontSize:8,fill:m==="unchecked"?zt:Nt,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontWeight:700,children:p.hashHex.slice(2)}),w&&e.jsx("text",{x:p._x,y:p._y+C+10,textAnchor:"middle",fontSize:8,fill:Qe,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:p.range.lo===p.range.hi?`${p.range.lo}`:`${p.range.lo}-${p.range.hi}`})]},p.hashFull+p._x+","+p._y)})]})}
function gi({replica:n,label:t,labelColor:s,tree:r,statuses:o,highlightedLeafRanges:i,flyingKeys:a,onPut:l,onDelete:d}){const[c,p]=h.useState(""),[m,g]=h.useState(""),w=n?Array.from(n.entries.entries()).sort(($,O)=>$[0]-O[0]).map(([$,O])=>({key:$,...O})):[],C=()=>{c!==""&&(l(c,m),p(""),g(""))},j=()=>{c!==""&&(d(c),p(""))};return e.jsxs("div",{className:"mk-replica",children:[e.jsxs("div",{className:"mk-replica-header",style:{color:s},children:[t,e.jsxs("span",{className:"mk-replica-sub",children:["keys=",w.length," / space=",n==null?void 0:n.keySpace," / clock=",n==null?void 0:n._clock]})]}),e.jsx("div",{className:"mk-kv-table",children:w.length===0?e.jsx("span",{className:"mk-empty",children:"(empty)"}):w.map($=>{const O=a&&a.has($.key);return e.jsxs("span",{className:"mk-kv-row"+($.tombstone?" mk-kv-tomb":"")+(O?" mk-kv-flying":""),children:[e.jsx("span",{className:"mk-kv-k",children:$.key}),e.jsx("span",{className:"mk-kv-arrow",children:"→"}),$.tombstone?e.jsx("span",{className:"mk-kv-x",children:"×"}):e.jsx("span",{className:"mk-kv-v",children:Ra($.value)}),e.jsxs("span",{className:"mk-kv-ts",children:["@",$.ts]})]},$.key)})}),e.jsxs("div",{className:"mk-replica-input",children:[e.jsx("input",{className:"mk-input",placeholder:"key",value:c,style:{width:56},onChange:$=>p($.target.value)}),e.jsx("input",{className:"mk-input",placeholder:"value",value:m,style:{width:90},onChange:$=>g($.target.value)}),e.jsx("button",{className:"mk-btn mk-btn-sm",onClick:C,children:"Put"}),e.jsx("button",{className:"mk-btn mk-btn-sm mk-btn-danger",onClick:j,children:"Delete"})]}),e.jsx("div",{className:"mk-tree-wrap",children:e.jsx(nd,{tree:r,statuses:o,highlightedLeafRanges:i,label:`${t} Merkle`,labelColor:s})})]})}
function od(){const[n,t]=h.useState(16),[s,r]=h.useState(4),o=h.useRef(null),i=h.useRef(null),[,a]=h.useState(0),l=()=>a(X=>X+1),[d,c]=h.useState(null),[p,m]=h.useState(null),[g,w]=h.useState(new Map),[C,j]=h.useState([]),[$,O]=h.useState(new Set),[q,R]=h.useState(new Set),[D,B]=h.useState("Empty replicas. Put some keys on each side, then click Build Merkle → Compare."),[V,T]=h.useState(null),[_,b]=h.useState(null),x=h.useRef([]),f=()=>{for(const X of x.current)clearTimeout(X);x.current=[]},u=(X,ee)=>{const F=setTimeout(X,ee);return x.current.push(F),F},y=(X=n,ee=s)=>{o.current=new xi({name:"A",keySpace:X,leavesPerLevel:ee}),i.current=new xi({name:"B",keySpace:X,leavesPerLevel:ee}),c(null),m(null),w(new Map),j([]),O(new Set),R(new Set),T(null),b(null)};h.useEffect(()=>{y(n,s)},[]);const v=()=>{const X=o.current,ee=i.current;if(!X||!ee)return null;const F=X.buildMerkle(),U=ee.buildMerkle();return c(F),m(U),w(new Map),j([]),{tA:F,tB:U}},I=()=>{f();const X=v();X&&B(`Built trees. Replica A root = ${X.tA.root.hashHex}, Replica B root = ${X.tB.root.hashHex}.`)},S=(X,ee)=>P("A",X,ee),H=(X,ee)=>P("B",X,ee),M=X=>N("A",X),k=X=>N("B",X),P=(X,ee,F)=>{const U=X==="A"?o.current:i.current;try{const Z=Number(ee);U.put(Z,F??""),B(`Replica ${X}: put(${Z}, '${Ra(F??"")}')`),c(null),m(null),w(new Map),j([]),T(null),b(null),l()}catch(Z){B(`Error: ${Z.message}`)}},N=(X,ee)=>{const F=X==="A"?o.current:i.current;try{const U=Number(ee);F.delete(U),B(`Replica ${X}: delete(${U})`),c(null),m(null),w(new Map),j([]),T(null),b(null),l()}catch(U){B(`Error: ${U.message}`)}},z=()=>{f();const X=v();if(!X)return;const{tA:ee,tB:F}=X,U=wo(o.current,i.current);T(U),j([]);const Z=[];(function L(G,te){if(Z.push({a:G,b:te}),G.hash!==te.hash&&G.type!=="leaf")for(let re=0;re<G.children.length;re++)L(G.children[re],te.children[re])})(ee.root,F.root);const W=[];Z.forEach((L,G)=>{const te=L.a.nodeId;u(()=>{w(re=>{const ie=new Map(re);return ie.set(te,"visiting"),ie})},G*zr),u(()=>{const re=L.a.hash===L.b.hash;w(ie=>{const ke=new Map(ie);return ke.set(te,re?"match":"differ"),ke}),!re&&L.a.type==="leaf"&&(W.push({...L.a.range,index:L.a.index}),j(ie=>[...ie,{...L.a.range,index:L.a.index}]))},G*zr+zr*.6)}),u(()=>{if(U.rootsMatch)B(`Replica A root = ${U.rootAHex}, Replica B root = ${U.rootBHex} → no divergence.`);else{const L=U.descents.filter(G=>!G.matched&&!G.isLeaf).length;B(`Roots differ (${U.rootAHex} vs ${U.rootBHex}); descended into ${L} subtree${L===1?"":"s"}; found ${U.divergentLeafRanges.length} divergent leaf range${U.divergentLeafRanges.length===1?"":"s"}.`)}},Z.length*zr+200)},E=X=>{f(),v();const ee=wo(o.current,i.current);if(ee.rootsMatch){B(`Roots already equal (${ee.rootAHex}). Nothing to sync.`);return}const F=Zc(o.current,i.current,"last-write-wins",X);b(F);const U=o.current.buildMerkle(),Z=i.current.buildMerkle();if(c(U),m(Z),w(new Map),j([]),F.transferred.length===0){B(`Sync ${X}: no keys required transfer (strategy pruned them).`);return}const W=new Set,L=new Set;for(const re of F.transferred)re.to===i.current.name?W.add(re.key):L.add(re.key);O(L),R(W),u(()=>{O(new Set),R(new Set)},ed+300);const G=F.transferred.map(re=>`${re.key}(${re.from}→${re.to})`).join(", ");B(`Syncing ${X==="A->B"?"A→B":X==="B->A"?"B→A":"A↔B"}: transferred keys [${G}].`)},J=()=>{f(),y(n,s),B("Reset. Both replicas empty.")},Y=X=>{const ee=Number(X);t(ee),y(ee,s),B(`Key space set to ${ee}. Replicas reset.`)},se=X=>{const ee=Number(X);r(ee),y(n,ee),B(`Branching factor set to ${ee}. Replicas reset. Tree will have ${(()=>{let F=1;for(;F<n;)F*=ee;return F})()} leaves.`)},A=()=>{f(),y(n,s);const X=o.current,ee=i.current,F=[];for(let L=0;L<n;L+=Math.max(2,Math.floor(n/6)))F.push({k:L,v:`v${L}`});F.forEach((L,G)=>{X.entries.set(L.k,{value:L.v,ts:G+1,tombstone:!1}),ee.entries.set(L.k,{value:L.v,ts:G+1,tombstone:!1})}),X._clock=F.length,ee._clock=F.length;const U=Math.floor(n*.25),Z=Math.floor(n*.75),W=Math.floor(n*.5);X.put(U,"onlyA"),ee.put(Z,"onlyB"),X.put(W,"aWins"),ee.put(W,"bOld",1),B(`Seeded: ${F.length} shared keys; A unique={${U}}, B unique={${Z}}, conflict on key ${W}.`),c(null),m(null),w(new Map),j([]),T(null),b(null),l()},K=h.useMemo(()=>{let X=1;for(;X<n;)X*=s;return X},[n,s]),Q=V?{merkle:V.hashBytesCompared,full:V.fullBytes}:null;return e.jsxs("div",{className:"mk-root",children:[e.jsx("style",{children:id}),e.jsxs("div",{className:"mk-panel",children:[e.jsxs("div",{className:"mk-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"mk-title",children:"Merkle Tree Anti-Entropy Visualizer"}),e.jsx("div",{className:"mk-subtitle",children:'Chapter 12, Petrov: "Database Internals" — compare replica hashes top-down, repair only the divergent subtrees.'})]}),e.jsxs("div",{className:"mk-title-controls",children:[e.jsxs("label",{className:"mk-label",children:["Key space: ",e.jsxs("select",{value:n,onChange:X=>Y(X.target.value),children:[e.jsx("option",{value:8,children:"8"}),e.jsx("option",{value:16,children:"16"}),e.jsx("option",{value:32,children:"32"}),e.jsx("option",{value:64,children:"64"})]})]}),e.jsxs("label",{className:"mk-label",children:["Branching: ",e.jsxs("select",{value:s,onChange:X=>se(X.target.value),children:[e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:4,children:"4"})]})]}),e.jsx("button",{className:"mk-btn mk-btn-ghost",onClick:J,children:"Reset"})]})]}),e.jsxs("div",{className:"mk-controls",children:[e.jsx("button",{className:"mk-btn",onClick:I,children:"Build Merkle"}),e.jsx("button",{className:"mk-btn mk-btn-good",onClick:z,children:"Compare"}),e.jsx("button",{className:"mk-btn mk-btn-ghost",onClick:()=>E("A->B"),children:"Sync A → B"}),e.jsx("button",{className:"mk-btn mk-btn-ghost",onClick:()=>E("B->A"),children:"Sync B → A"}),e.jsx("span",{className:"mk-sep"}),e.jsx("button",{className:"mk-btn mk-btn-ghost",onClick:A,children:"Seed divergent state"}),e.jsxs("span",{className:"mk-hint",children:[K," leaves · range per leaf ="," ",Math.ceil(n/K)," key(s)"]})]}),e.jsxs("div",{className:"mk-replicas",children:[e.jsx(gi,{replica:o.current,label:"Replica A",labelColor:ls,tree:d,statuses:g,highlightedLeafRanges:C,flyingKeys:$,onPut:S,onDelete:M}),e.jsxs("div",{className:"mk-middle",children:[e.jsx("div",{className:"mk-middle-arrow",children:"⇄"}),e.jsxs("div",{className:"mk-middle-legend",children:[e.jsxs("div",{children:[e.jsx("span",{className:"mk-dot",style:{background:us}}),"match"]}),e.jsxs("div",{children:[e.jsx("span",{className:"mk-dot",style:{background:jr}}),"differ"]}),e.jsxs("div",{children:[e.jsx("span",{className:"mk-dot",style:{background:ko}}),"visiting"]}),e.jsxs("div",{children:[e.jsx("span",{className:"mk-dot",style:{background:_a}}),"unchecked"]})]})]}),e.jsx(gi,{replica:i.current,label:"Replica B",labelColor:us,tree:p,statuses:g,highlightedLeafRanges:C,flyingKeys:q,onPut:H,onDelete:k})]}),e.jsxs("div",{className:"mk-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"tree shape"}),"=",K," leaves, branching"," ",s]}),Q&&e.jsxs(e.Fragment,{children:[e.jsxs("span",{children:[e.jsx("strong",{children:"bytes compared (Merkle)"}),"=",Q.merkle]}),e.jsxs("span",{children:[e.jsx("strong",{children:"bytes for full-range compare"}),"=",Q.full]}),e.jsxs("span",{style:{color:Q.merkle<Q.full?us:ko},children:[e.jsx("strong",{children:"saving"}),"="," ",Q.full===0?"n/a":`${((1-Q.merkle/Q.full)*100).toFixed(0)}%`]})]}),V&&e.jsxs("span",{children:[e.jsx("strong",{children:"nodes compared"}),"=",V.nodesCompared]}),_&&e.jsxs("span",{children:[e.jsx("strong",{children:"transferred"}),"=",_.transferred.length," key(s)"]})]}),e.jsxs("div",{className:"mk-status",children:[e.jsx("span",{className:"mk-status-dot"}),e.jsx("span",{className:"mk-status-text",children:D})]})]})]})}
const id=`
.mk-root {
  color: ${zt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Nt};
}
.mk-panel {
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1200px;
  margin: 0 auto;
}
.mk-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Le};
}
.mk-title {
  font-size: 18px;
  font-weight: 600;
  color: ${zt};
}
.mk-subtitle {
  font-size: 12px;
  color: ${Qe};
  margin-top: 2px;
  max-width: 640px;
}
.mk-title-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.mk-label {
  color: ${Qe};
  font-size: 13px;
}
.mk-label select {
  background: ${Nt};
  border: 1px solid ${Le};
  color: ${zt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.mk-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid ${Le};
}
.mk-btn {
  padding: 6px 14px;
  background: ${ls};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.mk-btn:hover { filter: brightness(1.15); }
.mk-btn-sm { padding: 4px 10px; font-size: 12px; }
.mk-btn-good { background: ${us}; color: ${Nt}; }
.mk-btn-danger { background: ${jr}; }
.mk-btn-ghost {
  background: transparent;
  border: 1px solid ${Le};
  color: ${zt};
}
.mk-sep {
  width: 1px;
  height: 22px;
  background: ${Le};
  margin: 0 4px;
}
.mk-hint {
  margin-left: auto;
  color: ${Qe};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-replicas {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px dashed ${Le};
}
.mk-replica {
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.mk-replica-header {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.mk-replica-sub {
  color: ${Qe};
  font-size: 11px;
  font-weight: 400;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-kv-table {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 28px;
  padding: 6px 8px;
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 5px;
  max-height: 96px;
  overflow-y: auto;
}
.mk-kv-row {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  padding: 2px 6px;
  background: rgba(74, 124, 255, 0.08);
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: background 0.3s, box-shadow 0.3s;
}
.mk-kv-tomb {
  background: rgba(255, 102, 102, 0.15);
}
.mk-kv-flying {
  animation: mk-flash 0.9s ease-in-out 2;
  box-shadow: 0 0 0 2px ${us}aa, 0 0 10px ${us}77;
}
@keyframes mk-flash {
  0%, 100% { background: rgba(92, 216, 148, 0.35); }
  50% { background: rgba(92, 216, 148, 0.15); }
}
.mk-kv-k { color: ${ls}; font-weight: 700; }
.mk-kv-arrow { color: ${Qe}; }
.mk-kv-v { color: ${zt}; }
.mk-kv-x { color: ${jr}; font-weight: 800; }
.mk-kv-ts {
  color: ${Qe};
  font-size: 9px;
  margin-left: 2px;
}
.mk-empty {
  color: ${Qe};
  font-size: 11px;
  font-style: italic;
}
.mk-replica-input {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.mk-input {
  padding: 5px 8px;
  background: ${Mn};
  border: 1px solid ${Le};
  border-radius: 4px;
  color: ${zt};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-input:focus {
  outline: none;
  border-color: ${ls};
}
.mk-tree-wrap {
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 6px;
  overflow: hidden;
}
.mk-svg-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${Nt};
  border: 1px dashed ${Le};
  border-radius: 6px;
}
.mk-middle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 80px;
  gap: 12px;
  min-width: 86px;
}
.mk-middle-arrow {
  font-size: 26px;
  color: ${Qe};
}
.mk-middle-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: ${Qe};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-middle-legend > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mk-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.mk-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${Nt};
  border: 1px solid ${Le};
  border-radius: 6px;
  font-size: 12px;
  color: ${Qe};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-stats strong { color: ${zt}; font-weight: 600; margin-right: 2px; }
.mk-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${Nt};
  border-left: 3px solid ${ls};
  border-radius: 4px;
  font-size: 12px;
  color: ${zt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mk-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${ls};
  box-shadow: 0 0 8px ${ls};
  flex-shrink: 0;
}
`;

export default od;
export { od as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(od, {}));
  return () => root.unmount();
}
