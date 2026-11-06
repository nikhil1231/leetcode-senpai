import { r as h, j as e, R as ReactDOM, a as Qa } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function Qs(n){return n==="gcounter"?"G-Counter":n==="pncounter"?"PN-Counter":n==="orset"?"OR-Set":n}
function Kn(n){const t=String(n);let s=2166136261;for(let r=0;r<t.length;r++)s^=t.charCodeAt(r),s=Math.imul(s,16777619)>>>0;return s>>>0}
function th(n){return n==null?[]:String(n).toLowerCase().split(/[^a-z0-9']+/i).filter(s=>s.length>0).map(s=>[s,1])}
function sh(n,t){let s=0;for(const r of t)s+=Number(r)||0;return s}
const Un=["input","map","shuffle","reduce","output"];
class Vn{constructor({mapperCount:t=3,reducerCount:s=2}={}){if(t<1)throw new Error("mapperCount must be >= 1");if(s<1)throw new Error("reducerCount must be >= 1");this.mapperCount=t,this.reducerCount=s,this.mapFn=th,this.reduceFn=sh,this.inputLines=[],this.mappers=[],this.reducers=[],this.phase="input",this._shuffleQueue=[],this._shuffleIndex=0,this.stats={inputLines:0,mapEmissions:0,shuffleRecords:0,reduceOutputKeys:0,startedAt:0,finishedAt:0},this.lastEvent=null}setInput(t){if(!Array.isArray(t))throw new Error("setInput expects an array of strings");this.inputLines=t.map(s=>String(s))}setMapFn(t){if(typeof t!="function")throw new Error("setMapFn expects a function");this.mapFn=t}setReduceFn(t){if(typeof t!="function")throw new Error("setReduceFn expects a function");this.reduceFn=t}start(){this.mappers=[];for(let t=0;t<this.mapperCount;t++)this.mappers.push({id:`m${t}`,input:[],nextLine:0,emitted:[],done:!1});for(let t=0;t<this.inputLines.length;t++)this.mappers[t%this.mapperCount].input.push(this.inputLines[t]);this.reducers=[];for(let t=0;t<this.reducerCount;t++)this.reducers.push({id:`r${t}`,inbox:[],grouped:{},_sortedKeys:null,_nextKeyIdx:0,output:[],done:!1});this._shuffleQueue=[],this._shuffleIndex=0,this.stats={inputLines:this.inputLines.length,mapEmissions:0,shuffleRecords:0,reduceOutputKeys:0,startedAt:typeof performance<"u"?performance.now():Date.now(),finishedAt:0},this.phase=this.inputLines.length===0?"shuffle":"map",this.lastEvent={type:"start",text:`Start: ${this.inputLines.length} input lines split across ${this.mapperCount} mapper(s) round-robin.`}}stepMap(){if(this.phase!=="map"&&(this.phase==="input"&&this.start(),this.phase!=="map"))return null;const t=this.mappers.find(a=>!a.done&&a.nextLine<a.input.length);if(!t)return this._finishMapPhase(),null;const s=t.input[t.nextLine++];let r;try{r=this.mapFn(s)}catch{r=[]}Array.isArray(r)||(r=[]);const o=r.filter(a=>Array.isArray(a)&&a.length>=2).map(a=>[String(a[0]),a[1]]);for(const a of o)t.emitted.push(a);this.stats.mapEmissions+=o.length,t.nextLine>=t.input.length&&(t.done=!0);const i={type:"map",mapperId:t.id,line:s,emitted:o,text:`Map: ${t.id} processed ${JSON.stringify(s)} → [${o.map(([a,l])=>`('${a}',${JSON.stringify(l)})`).join(", ")}]`};return this.lastEvent=i,this.mappers.every(a=>a.done||a.input.length===0)&&this._finishMapPhase(),{mapperId:t.id,line:s,emitted:o}}finishMap(){if(this.phase==="input"&&this.start(),this.phase==="map")for(;this.phase==="map"&&this.stepMap()!==null;);}_finishMapPhase(){this._shuffleQueue=[];for(const t of this.mappers)for(const[s,r]of t.emitted){const o=Kn(s)%this.reducerCount;this._shuffleQueue.push({mapperId:t.id,reducerId:`r${o}`,reducerIndex:o,key:s,value:r})}this._shuffleIndex=0,this.phase="shuffle",this.lastEvent={type:"map-done",text:`Map phase complete: ${this.stats.mapEmissions} (k,v) emissions to shuffle.`}}stepShuffle(){if(this.phase==="map"&&this._finishMapPhase(),this.phase!=="shuffle")return null;if(this._shuffleIndex>=this._shuffleQueue.length)return this._finishShufflePhase(),null;const t=this._shuffleQueue[this._shuffleIndex++];this.reducers[t.reducerIndex].inbox.push([t.key,t.value]),this.stats.shuffleRecords+=1;const r={type:"shuffle",mapperId:t.mapperId,reducerId:t.reducerId,key:t.key,value:t.value,hash:Kn(t.key),text:`Shuffle: '${t.key}' hashes to ${t.reducerId} (hash=${Kn(t.key)} % ${this.reducerCount} = ${t.reducerIndex})`};return this.lastEvent=r,this._shuffleIndex>=this._shuffleQueue.length&&this._finishShufflePhase(),{mapperId:t.mapperId,reducerId:t.reducerId,key:t.key,value:t.value}}finishShuffle(){if(this.phase==="map"&&this._finishMapPhase(),this.phase==="shuffle")for(;this.phase==="shuffle"&&this.stepShuffle()!==null;);}_finishShufflePhase(){for(const t of this.reducers){t.inbox.sort((o,i)=>o[0]<i[0]?-1:o[0]>i[0]?1:0);const s=new Set,r=[];for(const[o,i]of t.inbox)s.has(o)||(s.add(o),r.push(o));t._sortedKeys=r,t._nextKeyIdx=0,r.length===0&&(t.done=!0)}this.phase="reduce",this.lastEvent={type:"shuffle-done",text:"Shuffle phase complete: sort-merge on each reducer so same keys are adjacent."}}stepReduce(){if(this.phase==="shuffle"&&this._finishShufflePhase(),this.phase!=="reduce")return null;const t=this.reducers.find(a=>!a.done);if(!t)return this._finishReducePhase(),null;const s=t._sortedKeys[t._nextKeyIdx++],r=[];for(const[a,l]of t.inbox)a===s&&r.push(l);t.grouped[s]=r.slice();let o;try{o=this.reduceFn(s,r)}catch{o=null}t.output.push([s,o]),this.stats.reduceOutputKeys+=1;const i={type:"reduce",reducerId:t.id,key:s,values:r.slice(),output:o,text:`Reduce: ${t.id} grouping '${s}' = [${r.join(",")}] → ${JSON.stringify(o)}`};return this.lastEvent=i,t._nextKeyIdx>=t._sortedKeys.length&&(t.done=!0),this.reducers.every(a=>a.done)&&this._finishReducePhase(),{reducerId:t.id,key:s,values:r.slice(),output:o}}finishReduce(){if(this.phase==="shuffle"&&this._finishShufflePhase(),this.phase==="reduce")for(;this.phase==="reduce"&&this.stepReduce()!==null;);}_finishReducePhase(){this.phase="output",this.stats.finishedAt=typeof performance<"u"?performance.now():Date.now(),this.lastEvent={type:"reduce-done",text:`Reduce phase complete: ${this.stats.reduceOutputKeys} output key(s).`}}snapshot(){const t={};if(this.phase==="output")for(const a of this.reducers)for(const[l,d]of a.output)t[l]=d;const s=this.stats.startedAt||0,r=this.stats.finishedAt||0,o=typeof performance<"u"?performance.now():Date.now(),i=Math.max(0,(r||o)-(s||o));return{phase:this.phase,mapperCount:this.mapperCount,reducerCount:this.reducerCount,inputLines:[...this.inputLines],mappers:this.mappers.map(a=>({id:a.id,input:[...a.input],progress:a.input.length===0?1:a.nextLine/a.input.length,nextLine:a.nextLine,emitted:a.emitted.map(([l,d])=>[l,d]),done:a.done})),reducers:this.reducers.map(a=>({id:a.id,inbox:a.inbox.map(([l,d])=>[l,d]),grouped:Object.fromEntries(Object.entries(a.grouped).map(([l,d])=>[l,[...d]])),output:a.output.map(([l,d])=>[l,d]),done:a.done})),shuffle:{total:this._shuffleQueue.length,delivered:this._shuffleIndex},stats:{...this.stats,latencyMs:Math.round(i)},finalOutput:t,lastEvent:this.lastEvent}}}
const Pe="#0f1419",Ts="#1a1f2e",Te="#2a2f3e",qe="#e6e6e6",Ue="#8a93a6",Ne="#4a7cff",Ea="#f5c451",rh="#f66",$t="#5cd894",Pi=[Ne,$t,"#b084f9","#ff9f5a","#52c8d7","#e870b8",Ea,rh];
function Co(n){return Pi[n%Pi.length]}
const nh=["the quick brown fox","the lazy dog sleeps","the fox jumps over the dog","quick quick brown","lazy fox the dog"].join(`
`),oh={input:"Input",map:"Map",shuffle:"Shuffle",reduce:"Reduce",output:"Output"};
function ih({phase:n}){return e.jsx("div",{className:"mr-phasebar",children:Un.map((t,s)=>{const r=t===n,o=Un.indexOf(n)>s;return e.jsxs(Qa.Fragment,{children:[e.jsx("div",{className:"mr-phase"+(r?" mr-phase-current":"")+(o?" mr-phase-done":""),children:oh[t]}),s<Un.length-1&&e.jsx("div",{className:"mr-phase-arrow",children:"→"})]},t)})})}
const Do=360,Wr=40,Br=Do-40,ah=900;
function lh({mappers:n,reducers:t,flyers:s,height:r}){const o=a=>r/(n.length+1)*(a+1),i=a=>r/(t.length+1)*(a+1);return e.jsxs("svg",{width:Do,height:r,style:{display:"block",background:"transparent"},children:[n.map((a,l)=>e.jsxs("g",{children:[e.jsx("circle",{cx:Wr,cy:o(l),r:7,fill:Ts,stroke:Ne,strokeWidth:2}),e.jsx("text",{x:Wr,y:o(l)+3,textAnchor:"middle",fontSize:9,fill:qe,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:a.id})]},a.id)),t.map((a,l)=>e.jsxs("g",{children:[e.jsx("circle",{cx:Br,cy:i(l),r:7,fill:Ts,stroke:Co(l),strokeWidth:2}),e.jsx("text",{x:Br,y:i(l)+3,textAnchor:"middle",fontSize:9,fill:qe,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:a.id})]},a.id)),n.map((a,l)=>t.map((d,c)=>e.jsx("line",{x1:Wr+7,y1:o(l),x2:Br-7,y2:i(c),stroke:Te,strokeWidth:.8,strokeDasharray:"2 3"},`${a.id}-${d.id}`))),s.map(a=>{const l=n.findIndex(O=>O.id===a.mapperId),d=t.findIndex(O=>O.id===a.reducerId);if(l<0||d<0)return null;const c=Wr+7,p=o(l),m=Br-7,g=i(d),w=Math.min(1,a.progress),C=c+(m-c)*w,j=p+(g-p)*w,$=Co(d);return e.jsxs("g",{opacity:1-Math.max(0,w-.85)/.15,children:[e.jsx("circle",{cx:C,cy:j,r:6,fill:$,opacity:.85}),e.jsx("text",{x:C+10,y:j+3,fontSize:9,fill:$,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:`${a.key}:${a.value}`})]},a.uid)})]})}
function ch({m:n,active:t,justEmitted:s}){return e.jsxs("div",{className:"mr-mapper"+(t?" mr-mapper-active":""),children:[e.jsxs("div",{className:"mr-mapper-head",children:[e.jsx("span",{className:"mr-mapper-id",children:n.id}),e.jsxs("span",{className:"mr-mini",children:[n.nextLine,"/",n.input.length," lines"]})]}),e.jsx("div",{className:"mr-mapper-lines",children:n.input.length===0?e.jsx("div",{className:"mr-empty",children:"(no input)"}):n.input.map((r,o)=>e.jsx("div",{className:"mr-line"+(o<n.nextLine?" mr-line-done":"")+(o===n.nextLine-1&&s?" mr-line-flash":""),children:r},o))}),e.jsxs("div",{className:"mr-mapper-emitted",children:[e.jsxs("div",{className:"mr-sub",children:["emitted ",n.emitted.length]}),e.jsxs("div",{className:"mr-pair-wrap",children:[n.emitted.slice(-10).map(([r,o],i)=>e.jsxs("span",{className:"mr-pair",children:["(",r,",",String(o),")"]},i)),n.emitted.length>10&&e.jsxs("span",{className:"mr-mini",children:["+",n.emitted.length-10," more"]})]})]})]})}
function dh({r:n,idx:t,active:s,flashKey:r}){const o=Co(t),i=new Set,a=[];for(const[l]of n.inbox)if(!i.has(l)){i.add(l);const d=n.inbox.filter(([m])=>m===l).map(([,m])=>m),c=Object.prototype.hasOwnProperty.call(n.grouped,l),p=n.output.find(([m])=>m===l);a.push({key:l,values:d,done:c,output:p?p[1]:null})}return e.jsxs("div",{className:"mr-reducer"+(s?" mr-reducer-active":""),style:{borderTop:`3px solid ${o}`},children:[e.jsxs("div",{className:"mr-reducer-head",children:[e.jsx("span",{className:"mr-reducer-id",style:{color:o},children:n.id}),e.jsxs("span",{className:"mr-mini",children:[n.inbox.length," recs · ",a.length," keys"]})]}),e.jsx("div",{className:"mr-reducer-body",children:a.length===0?e.jsx("div",{className:"mr-empty",children:"(inbox empty)"}):a.map(l=>e.jsxs("div",{className:"mr-group"+(l.done?" mr-group-done":"")+(r===l.key?" mr-group-flash":""),children:[e.jsx("span",{className:"mr-group-key",children:l.key}),e.jsxs("span",{className:"mr-group-vals",children:["[",l.values.join(","),"]"]}),l.done&&e.jsxs("span",{className:"mr-group-out",style:{color:o},children:["= ",JSON.stringify(l.output)]})]},l.key))})]})}
function ph(){const[n,t]=h.useState(nh),[s,r]=h.useState(3),[o,i]=h.useState(2),a=h.useRef(null),[l,d]=h.useState(null),[c,p]=h.useState("Press Run (or Step) to animate a word-count MapReduce job."),[m,g]=h.useState([]),w=h.useRef(0),[C,j]=h.useState(null),[$,O]=h.useState(null),[q,R]=h.useState(null),[D,B]=h.useState(!1),V=h.useRef(!1);h.useEffect(()=>{V.current=D},[D]);const T=()=>{const E=n.split(/\n/).map(Y=>Y.trim()).filter(Y=>Y.length>0),J=new Vn({mapperCount:s,reducerCount:o});J.setInput(E),J.start(),a.current=J,d(J.snapshot()),g([]),j(null),O(null),R(null)};h.useEffect(()=>{T()},[]),h.useEffect(()=>{if(m.length===0)return;let E;const J=()=>{g(Y=>{const se=performance.now(),A=[];for(const K of Y){const Q=(se-K.start)/ah;Q<1.05&&A.push({...K,progress:Q})}return A}),E=requestAnimationFrame(J)};return E=requestAnimationFrame(J),()=>cancelAnimationFrame(E)},[m.length]),h.useEffect(()=>{if(!D)return;let E=!1;const J=()=>{if(E||!V.current)return;if(!f()){B(!1);return}window.setTimeout(J,400)},Y=window.setTimeout(J,100);return()=>{E=!0,window.clearTimeout(Y)}},[D]);const _=(E,J,Y,se)=>{const A=++w.current;g(K=>[...K,{uid:A,mapperId:E,reducerId:J,key:Y,value:se,start:performance.now(),progress:0}])},b=E=>{j(E),window.setTimeout(()=>j(null),450)},x=(E,J)=>{O(E),R(J),window.setTimeout(()=>{O(null),R(null)},500)},f=()=>{const E=a.current;if(!E)return!1;E.phase==="input"&&E.start();let J=!1;if(E.phase==="map"){const Y=E.stepMap();Y&&(J=!0,b(Y.mapperId),p(E.lastEvent.text))}else if(E.phase==="shuffle"){const Y=E.stepShuffle();Y&&(J=!0,_(Y.mapperId,Y.reducerId,Y.key,Y.value),p(E.lastEvent.text))}else if(E.phase==="reduce"){const Y=E.stepReduce();Y&&(J=!0,x(Y.reducerId,Y.key),p(E.lastEvent.text))}else E.phase==="output"&&(J=!1,p(`Done. Output: ${Object.keys(E.snapshot().finalOutput).length} key(s), total latency ${E.snapshot().stats.latencyMs} ms.`));return d(E.snapshot()),J},u=()=>{const E=a.current;if(!E)return;E.phase==="input"&&E.start();const J=E.phase;if(J==="map"){for(;E.phase==="map";){const Y=E.stepMap();if(!Y)break;b(Y.mapperId)}p(`Map phase complete: ${E.stats.mapEmissions} (k,v) emissions.`)}else if(J==="shuffle"){for(;E.phase==="shuffle";){const Y=E.stepShuffle();if(!Y)break;_(Y.mapperId,Y.reducerId,Y.key,Y.value)}p(`Shuffle complete: ${E.stats.shuffleRecords} records routed by hash(key) % ${o}.`)}else if(J==="reduce"){for(;E.phase==="reduce";){const Y=E.stepReduce();if(!Y)break;x(Y.reducerId,Y.key)}p(`Reduce complete: ${E.stats.reduceOutputKeys} output keys.`)}d(E.snapshot())},y=()=>{B(!1),T(),p("Reset. Ready to run.")},v=()=>{D&&B(!1),f()},I=()=>{if(D){B(!1);return}B(!0)},S=E=>{t(E)},H=E=>{r(E),window.setTimeout(()=>{const J=n.split(/\n/).map(se=>se.trim()).filter(Boolean),Y=new Vn({mapperCount:E,reducerCount:o});Y.setInput(J),Y.start(),a.current=Y,d(Y.snapshot()),g([]),p(`Rebuilt job with ${E} mapper(s).`)},0)},M=E=>{i(E),window.setTimeout(()=>{const J=n.split(/\n/).map(se=>se.trim()).filter(Boolean),Y=new Vn({mapperCount:s,reducerCount:E});Y.setInput(J),Y.start(),a.current=Y,d(Y.snapshot()),g([]),p(`Rebuilt job with ${E} reducer(s).`)},0)},k=()=>{T(),p("Input applied. Ready to run.")},P=h.useMemo(()=>{const E=Math.max(s,o)*68+20;return Math.max(220,E)},[s,o]);if(!l)return e.jsx("div",{style:{color:qe,padding:16},children:"Initializing…"});const z=Object.keys(l.finalOutput).map(E=>[E,l.finalOutput[E]]).sort((E,J)=>(J[1]||0)-(E[1]||0)).slice(0,12);return e.jsxs("div",{className:"mr-root",children:[e.jsx("style",{children:hh}),e.jsxs("div",{className:"mr-panel",children:[e.jsxs("div",{className:"mr-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"mr-title",children:"MapReduce — DDIA Ch 10"}),e.jsx("div",{className:"mr-subtitle",children:"Word-count · animated map → shuffle → reduce"})]}),e.jsxs("div",{className:"mr-title-controls",children:[e.jsxs("label",{className:"mr-label",children:["Mappers: ",e.jsxs("select",{value:s,onChange:E=>H(Number(E.target.value)),children:[e.jsx("option",{value:1,children:"1"}),e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:3,children:"3"}),e.jsx("option",{value:4,children:"4"}),e.jsx("option",{value:5,children:"5"})]})]}),e.jsxs("label",{className:"mr-label",children:["Reducers: ",e.jsxs("select",{value:o,onChange:E=>M(Number(E.target.value)),children:[e.jsx("option",{value:1,children:"1"}),e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:3,children:"3"}),e.jsx("option",{value:4,children:"4"})]})]})]})]}),e.jsx(ih,{phase:l.phase}),e.jsxs("div",{className:"mr-controls",children:[e.jsxs("div",{className:"mr-input-col",children:[e.jsx("span",{className:"mr-lbl-mini",children:"Input text (one record per line)"}),e.jsx("textarea",{className:"mr-textarea",value:n,onChange:E=>S(E.target.value),rows:4,spellCheck:!1})]}),e.jsxs("div",{className:"mr-btn-col",children:[e.jsx("button",{className:"mr-btn",onClick:k,children:"Apply Input"}),e.jsx("button",{className:"mr-btn mr-btn-ghost",onClick:y,children:"Reset"}),e.jsx("button",{className:"mr-btn",onClick:v,children:"Step"}),e.jsx("button",{className:"mr-btn "+(D?"mr-btn-warn":"mr-btn-good"),onClick:I,children:D?"Pause":"Run"}),e.jsx("button",{className:"mr-btn mr-btn-ghost",onClick:u,children:"Step phase"})]})]}),e.jsxs("div",{className:"mr-main",style:{minHeight:P+40},children:[e.jsxs("div",{className:"mr-col mr-col-left",children:[e.jsxs("div",{className:"mr-col-title",children:["Mappers (",l.mappers.length,")"]}),e.jsx("div",{className:"mr-mapper-stack",children:l.mappers.map(E=>e.jsx(ch,{m:E,active:C===E.id,justEmitted:C===E.id},E.id))})]}),e.jsxs("div",{className:"mr-col mr-col-mid",children:[e.jsxs("div",{className:"mr-col-title",children:["Shuffle (hash % ",l.reducerCount,")"]}),e.jsx(lh,{mappers:l.mappers,reducers:l.reducers,flyers:m,height:P}),e.jsxs("div",{className:"mr-shuffle-stats",children:["delivered ",l.shuffle.delivered,"/",l.shuffle.total]})]}),e.jsxs("div",{className:"mr-col mr-col-right",children:[e.jsxs("div",{className:"mr-col-title",children:["Reducers (",l.reducers.length,")"]}),e.jsx("div",{className:"mr-reducer-stack",children:l.reducers.map((E,J)=>e.jsx(dh,{r:E,idx:J,active:$===E.id,flashKey:$===E.id?q:null},E.id))})]})]}),l.phase==="output"&&e.jsxs("div",{className:"mr-output-panel",children:[e.jsxs("div",{className:"mr-output-title",children:["Final output (top ",z.length," by count)"]}),e.jsx("div",{className:"mr-output-grid",children:z.map(([E,J])=>e.jsxs("div",{className:"mr-output-cell",children:[e.jsx("span",{className:"mr-mono mr-output-k",children:E}),e.jsx("span",{className:"mr-output-v",children:String(J)})]},E))})]}),e.jsxs("div",{className:"mr-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"input lines"}),"=",l.stats.inputLines]}),e.jsxs("span",{children:[e.jsx("strong",{children:"map emissions"}),"=",l.stats.mapEmissions]}),e.jsxs("span",{children:[e.jsx("strong",{children:"shuffle records"}),"=",l.stats.shuffleRecords]}),e.jsxs("span",{children:[e.jsx("strong",{children:"reduce output keys"}),"=",l.stats.reduceOutputKeys]}),e.jsxs("span",{children:[e.jsx("strong",{children:"latency"}),"=",l.stats.latencyMs," ms"]})]}),e.jsxs("div",{className:"mr-status",children:[e.jsx("span",{className:"mr-status-dot"}),e.jsx("span",{className:"mr-status-text",children:c})]}),e.jsxs("div",{className:"mr-footer",children:[e.jsx("strong",{children:"Why MapReduce:"})," embarrassingly parallel map + keyed reduce. Sort-merge enables grouping without random access. Partition-by-hash balances reducer load. Chained jobs (output of one MR as input of the next) build multi-step pipelines — Hadoop’s original programming model."]})]})]})}
const hh=`
.mr-root {
  color: ${qe};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Pe};
}
.mr-panel {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1300px;
  margin: 0 auto;
}
.mr-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Te};
  flex-wrap: wrap;
}
.mr-title {
  font-size: 18px;
  font-weight: 600;
  color: ${qe};
}
.mr-subtitle {
  font-size: 12px;
  color: ${Ue};
  margin-top: 2px;
}
.mr-title-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.mr-label {
  color: ${Ue};
  font-size: 12px;
}
.mr-label select {
  background: ${Pe};
  color: ${qe};
  border: 1px solid ${Te};
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
}

/* Phase bar */
.mr-phasebar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 10px 0;
  flex-wrap: wrap;
}
.mr-phase {
  padding: 4px 10px;
  border: 1px solid ${Te};
  border-radius: 999px;
  color: ${Ue};
  font-size: 12px;
  background: ${Pe};
}
.mr-phase-done {
  color: ${$t};
  border-color: ${$t}55;
  background: ${$t}15;
}
.mr-phase-current {
  color: ${qe};
  border-color: ${Ne};
  background: ${Ne}22;
  box-shadow: 0 0 0 2px ${Ne}33;
  font-weight: 600;
}
.mr-phase-arrow {
  color: ${Ue};
  font-size: 12px;
}

/* Controls */
.mr-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  margin: 10px 0 14px 0;
  align-items: stretch;
}
.mr-input-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mr-btn-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: flex-end;
  min-width: 120px;
}
.mr-lbl-mini {
  font-size: 11px;
  color: ${Ue};
}
.mr-textarea {
  background: ${Pe};
  color: ${qe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  resize: vertical;
  min-height: 80px;
  outline: none;
}
.mr-textarea:focus {
  border-color: ${Ne};
}
.mr-btn {
  background: ${Ne};
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.mr-btn:hover {
  filter: brightness(1.1);
}
.mr-btn-ghost {
  background: transparent;
  color: ${qe};
  border: 1px solid ${Te};
  font-weight: 500;
}
.mr-btn-good {
  background: ${$t};
  color: ${Pe};
}
.mr-btn-warn {
  background: ${Ea};
  color: ${Pe};
}

/* Main 3-col layout */
.mr-main {
  display: grid;
  grid-template-columns: 1fr ${Do}px 1fr;
  gap: 12px;
  align-items: stretch;
}
.mr-col {
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 10px;
  min-width: 0;
}
.mr-col-title {
  font-size: 12px;
  color: ${Ue};
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.mr-col-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mr-shuffle-stats {
  margin-top: 6px;
  font-size: 11px;
  color: ${Ue};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Mapper cards */
.mr-mapper-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mr-mapper {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.mr-mapper-active {
  border-color: ${Ne};
  box-shadow: 0 0 0 2px ${Ne}33;
}
.mr-mapper-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}
.mr-mapper-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${Ne};
  font-weight: 700;
}
.mr-mapper-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0;
}
.mr-line {
  padding: 2px 6px;
  border-radius: 4px;
  background: ${Pe};
  border: 1px solid ${Te};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: ${qe};
  word-break: break-word;
}
.mr-line-done {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: ${Ue};
}
.mr-line-flash {
  animation: mr-flash 500ms ease-out;
  border-color: ${Ne};
  opacity: 1;
  text-decoration: none;
}
@keyframes mr-flash {
  0% { background: ${Ne}66; transform: translateX(0); }
  60% { background: ${Ne}33; transform: translateX(2px); }
  100% { background: ${Pe}; transform: translateX(0); }
}
.mr-mapper-emitted {
  border-top: 1px dashed ${Te};
  padding-top: 6px;
  margin-top: 4px;
}
.mr-sub {
  font-size: 10px;
  color: ${Ue};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.mr-pair-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.mr-pair {
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: ${$t};
}

/* Reducer cards */
.mr-reducer-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mr-reducer {
  background: ${Ts};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px;
  transition: box-shadow 200ms ease;
}
.mr-reducer-active {
  box-shadow: 0 0 0 2px ${Ne}33;
}
.mr-reducer-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}
.mr-reducer-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
}
.mr-reducer-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 240px;
  overflow: auto;
}
.mr-group {
  display: flex;
  gap: 6px;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${Pe};
  border: 1px solid ${Te};
  flex-wrap: wrap;
}
.mr-group-done {
  border-color: ${$t}55;
}
.mr-group-flash {
  animation: mr-pop 500ms ease-out;
}
@keyframes mr-pop {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); background: ${Ne}33; }
}
.mr-group-key {
  color: ${qe};
  font-weight: 700;
}
.mr-group-vals {
  color: ${Ue};
}
.mr-group-out {
  font-weight: 700;
  margin-left: auto;
}

/* Output */
.mr-output-panel {
  margin-top: 12px;
  background: ${Pe};
  border: 1px solid ${$t}55;
  border-radius: 8px;
  padding: 10px 12px;
}
.mr-output-title {
  font-size: 12px;
  color: ${$t};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.mr-output-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
}
.mr-output-cell {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 8px;
  background: ${Ts};
  border-radius: 4px;
  border: 1px solid ${Te};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.mr-output-k {
  color: ${qe};
}
.mr-output-v {
  color: ${$t};
  font-weight: 700;
}

/* Stats */
.mr-stats {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 12px;
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${qe};
}
.mr-stats strong {
  color: ${Ue};
  font-weight: 500;
}

/* Status */
.mr-status {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${qe};
  background: ${Pe};
  border: 1px solid ${Te};
  border-radius: 8px;
  padding: 8px 10px;
  min-height: 28px;
}
.mr-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Ne};
  box-shadow: 0 0 6px ${Ne}88;
  margin-top: 4px;
  flex-shrink: 0;
}
.mr-status-text {
  word-break: break-word;
}

.mr-footer {
  margin-top: 12px;
  font-size: 12px;
  color: ${Ue};
  line-height: 1.5;
  padding: 10px 12px;
  background: ${Pe};
  border-left: 3px solid ${Ne};
  border-radius: 4px;
}
.mr-footer strong {
  color: ${qe};
}

.mr-mini {
  font-size: 10px;
  color: ${Ue};
}
.mr-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mr-empty {
  font-size: 11px;
  color: ${Ue};
  font-style: italic;
  padding: 4px 0;
}
`;

export default ph;
export { ph as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ph, {}));
  return () => root.unmount();
}
