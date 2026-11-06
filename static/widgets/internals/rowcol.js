import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const ba=64,As={id:4,name:16,age:4,city:12,salary:8};
function ac(n=Object.keys(As)){return n.reduce((t,s)=>t+(As[s]||0),0)}
function oi(n,t=ba,s="b"){const r=[];let o={id:`${s}0`,bytesUsed:0,entries:[]};for(const i of n)o.bytesUsed+i.bytes>t&&(r.push(o),o={id:`${s}${r.length}`,bytesUsed:0,entries:[]}),o.entries.push(i),o.bytesUsed+=i.bytes;return o.entries.length>0&&r.push(o),r}
function lc(n,t){if(!t||!t.column||!t.op)return!0;const s=n[t.column],r=t.value;if(s===void 0)return!1;switch(t.op){case"=":return String(s)===String(r);case"!=":return String(s)!==String(r);case"<":return Number(s)<Number(r);case"<=":return Number(s)<=Number(r);case">":return Number(s)>Number(r);case">=":return Number(s)>=Number(r);default:return!0}}
class cc{constructor({columns:t=["id","name","age","city","salary"],mode:s="row",blockSize:r=ba}={}){this.columns=t.slice(),this.mode=s,this.blockSize=r,this.rows=[]}insert(t){const s={};for(const r of this.columns)s[r]=t[r]??null;return this.rows.push(s),s}deleteRow(t){const s=this.rows.length;return this.rows=this.rows.filter(r=>String(r.id)!==String(t)),s-this.rows.length}setMode(t){if(t!=="row"&&t!=="column")throw new Error(`unknown mode: ${t}`);this.mode=t}_rowLayoutBlocks(){const t=[];for(const s of this.rows)for(const r of this.columns)t.push({bytes:As[r]||0,label:`r${s.id}.${r}`,rowId:s.id,column:r});return oi(t,this.blockSize,"R")}_columnLayout(){const t={},s=[];for(const r of this.columns){const o=this.rows.map(a=>({bytes:As[r]||0,label:`${r}[${a.id}]`,rowId:a.id,column:r})),i=oi(o,this.blockSize,`${r[0].toUpperCase()}_`);for(const a of i)a.column=r;t[r]=i,s.push(...i)}return{blocks:s,byColumn:t}}scan(t,s){const r=t&&t.length?t.slice():this.columns.slice(),o=new Set(r);s&&s.column&&o.add(s.column);const i=[];for(const m of this.rows){if(!lc(m,s))continue;const g={};for(const w of r)g[w]=m[w];i.push(g)}const a=i.length;let l=[],d=0,c=0,p=[];if(this.mode==="row"){const m=this._rowLayoutBlocks();l=m.map(g=>g.id),c=m.length,d=c*this.blockSize,p=this.columns.slice()}else{const{byColumn:m}=this._columnLayout();p=Array.from(o);for(const g of p){const w=m[g]||[];for(const C of w)l.push(C.id);c+=w.length}d=c*this.blockSize}return{bytesRead:d,rowsMatched:a,blocksRead:c,result:i,touchedBlockIds:l,mode:this.mode,columnsTouched:p}}compareModes(t,s){const r=this.mode;try{this.mode="row";const o=this.scan(t,s);this.mode="column";const i=this.scan(t,s);return{row:o,column:i}}finally{this.mode=r}}snapshot(){let t;if(this.mode==="row")t=[this._rowLayoutBlocks()];else{const{byColumn:s}=this._columnLayout();t=this.columns.map(r=>s[r]||[])}return{mode:this.mode,columns:this.columns.slice(),rows:this.rows.map(s=>({...s})),rowBytes:ac(this.columns),blockSize:this.blockSize,fieldBytes:{...As},diskLayoutBlocks:t}}}
const dc=`
.rcw-root {
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
.rcw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.rcw-title { font-weight: 600; font-size: 15px; }
.rcw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }

.rcw-body {
  flex: 1;
  overflow: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rcw-section {
  background: #141925;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  padding: 12px 14px;
}
.rcw-section h3 {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: #d1d5db;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rcw-muted { color: #8a93a8; font-weight: 400; font-size: 12px; }

.rcw-table {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.rcw-table th, .rcw-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #222838;
  text-align: left;
}
.rcw-table th { color: #8a93a8; font-weight: 600; background: #0f1419; }
.rcw-table td { color: #e6e6e6; }
.rcw-table tr:last-child td { border-bottom: none; }
.rcw-table input {
  width: 90%;
  background: #0f1419;
  color: #e6e6e6;
  border: 1px solid #2a2f3e;
  border-radius: 4px;
  padding: 3px 6px;
  font: inherit;
}
.rcw-del-btn {
  background: transparent;
  color: #c13c3c;
  border: 1px solid #2a2f3e;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font: inherit;
}
.rcw-del-btn:hover { border-color: #c13c3c; }

.rcw-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.rcw-input, .rcw-select {
  padding: 5px 8px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 5px;
  color: #e6e6e6;
  font-size: 12px;
  font-family: inherit;
}
.rcw-input { width: 110px; }
.rcw-input:focus, .rcw-select:focus { outline: none; border-color: #4a7cff; }
.rcw-btn {
  padding: 5px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rcw-btn:hover { background: #3b6ae8; }
.rcw-btn.rcw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.rcw-btn.rcw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.rcw-btn.rcw-ghost.rcw-active {
  border-color: #4a7cff;
  color: #e6e6e6;
  background: #1c2438;
}

.rcw-toggle {
  display: inline-flex;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  overflow: hidden;
}
.rcw-toggle button {
  padding: 6px 14px;
  background: transparent;
  border: none;
  color: #8a93a8;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.rcw-toggle button.rcw-on {
  background: #4a7cff;
  color: white;
}

.rcw-cols {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.rcw-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #e6e6e6;
}

/* Block grid */
.rcw-disk-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.rcw-disk-label {
  min-width: 80px;
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding-top: 6px;
}
.rcw-blocks {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rcw-block {
  min-width: 140px;
  max-width: 180px;
  background: #1a2030;
  border: 1px solid #2a3550;
  border-radius: 6px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #c9d1e0;
  transition: background 400ms ease, border-color 400ms ease,
              box-shadow 400ms ease;
}
.rcw-block-head {
  display: flex;
  justify-content: space-between;
  color: #8a93a8;
  font-size: 10px;
  margin-bottom: 4px;
}
.rcw-block-entry {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rcw-block.rcw-touched {
  background: #3a2a1a;
  border-color: #ffd24a;
  box-shadow: 0 0 10px rgba(255, 210, 74, 0.45);
  animation: rcw-flash 700ms ease;
}
.rcw-block.rcw-unused {
  opacity: 0.35;
}
@keyframes rcw-flash {
  0%   { background: #5a4420; }
  100% { background: #3a2a1a; }
}

/* Comparison panel */
.rcw-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.rcw-compare-card {
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  padding: 10px 12px;
}
.rcw-compare-card.rcw-winner {
  border-color: #4a9f6f;
  box-shadow: 0 0 12px rgba(74, 159, 111, 0.3);
}
.rcw-compare-card.rcw-loser {
  border-color: #c13c3c;
  opacity: 0.85;
}
.rcw-compare-title {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rcw-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.rcw-badge.rcw-win { background: #1e4a34; color: #7fd6a4; }
.rcw-badge.rcw-lose { background: #4a2020; color: #ff9a9a; }
.rcw-compare-detail {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #c9d1e0;
  line-height: 1.7;
}

.rcw-status {
  background: #141925;
  border-top: 1px solid #2a2f3e;
  padding: 10px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #d1d5db;
  line-height: 1.6;
}
.rcw-status-row { display: block; }
.rcw-status b { color: #ffd24a; }

.rcw-result {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #7fd6a4;
  margin-top: 8px;
  max-height: 120px;
  overflow: auto;
  background: #0b0f17;
  border: 1px solid #222838;
  border-radius: 5px;
  padding: 8px 10px;
  white-space: pre-wrap;
}
`,pc=["id","name","age","city","salary"],hc=[{id:1,name:"Alice",age:30,city:"SF",salary:12e4},{id:2,name:"Bob",age:42,city:"NYC",salary:14e4},{id:3,name:"Cara",age:28,city:"SF",salary:95e3},{id:4,name:"Dan",age:35,city:"LA",salary:11e4},{id:5,name:"Eve",age:50,city:"SF",salary:2e5},{id:6,name:"Frank",age:46,city:"NYC",salary:18e4},{id:7,name:"Grace",age:33,city:"SF",salary:13e4},{id:8,name:"Hank",age:60,city:"LA",salary:22e4}],uc=["=","!=","<","<=",">",">="];
function mc(){const n=h.useRef(null);if(n.current===null){const M=new cc({columns:pc});hc.forEach(k=>M.insert(k)),n.current=M}const[t,s]=h.useState("row"),[r,o]=h.useState(()=>n.current.snapshot()),[i,a]=h.useState(["salary"]),[l,d]=h.useState("city"),[c,p]=h.useState("="),[m,g]=h.useState("SF"),[w,C]=h.useState(!0),[j,$]=h.useState(null),[O,q]=h.useState(new Set),R=h.useRef(null),[D,B]=h.useState({id:"",name:"",age:"",city:"",salary:""});function V(){o(n.current.snapshot())}function T(M){n.current.setMode(M),s(M),V(),q(new Set),$(null)}function _(){const M=Number(D.id);Number.isFinite(M)&&(n.current.insert({id:M,name:D.name||"",age:Number(D.age)||0,city:D.city||"",salary:Number(D.salary)||0}),B({id:"",name:"",age:"",city:"",salary:""}),V())}function b(M){n.current.deleteRow(M),V()}function x(M){a(k=>k.includes(M)?k.filter(P=>P!==M):[...k,M])}function f(){const M=w?{column:l,op:c,value:u(l,m)}:null,k=i.length?i:r.columns,P=n.current.compareModes(k,M),N=n.current.mode==="row"?P.row:P.column;R.current&&clearTimeout(R.current),q(new Set(N.touchedBlockIds)),R.current=setTimeout(()=>q(new Set),1500),$({predicate:M,projection:k,current:N,row:P.row,column:P.column})}function u(M,k){if(M==="age"||M==="salary"||M==="id"){const P=Number(k);return Number.isFinite(P)?P:k}return k}const y=r.rows,v=r.columns,I=h.useMemo(()=>r.mode==="row"?[{label:"rows",blocks:r.diskLayoutBlocks[0]||[]}]:v.map((M,k)=>({label:M,blocks:r.diskLayoutBlocks[k]||[]})),[r,v]),S=h.useMemo(()=>{if(!j)return"Ready. Pick a projection + predicate, then Run Query to compare row vs column I/O.";const{predicate:M,projection:k,row:P,column:N}=j,z=M?`WHERE ${M.column} ${M.op} ${JSON.stringify(M.value)}`:"";return{select:`${`SELECT ${k.join(", ")}`} ${z}`.trim(),rowLine:`Row mode: scanned ${y.length} rows × ${r.rowBytes} bytes = ${P.blocksRead} blocks × ${r.blockSize} = ${P.bytesRead} bytes (matched ${P.rowsMatched})`,colLine:`Column mode: scanned ${N.columnsTouched.join(" + ")} = ${N.blocksRead} blocks × ${r.blockSize} = ${N.bytesRead} bytes (matched ${N.rowsMatched})`}},[j,y.length,r]),H=h.useMemo(()=>j?j.row.bytesRead===j.column.bytesRead?"tie":j.row.bytesRead<j.column.bytesRead?"row":"column":null,[j]);return e.jsxs("div",{className:"rcw-root",children:[e.jsx("style",{children:dc}),e.jsxs("div",{className:"rcw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"rcw-title",children:"Row vs Column storage — Ch 1"}),e.jsxs("div",{className:"rcw-sub",children:["Petrov, ",e.jsx("i",{children:"Database Internals"}),', ch.1 — "Column- Versus Row-Oriented DBMS". I/O is block-granular (',r.blockSize," B blocks); column layout wins when you project few columns."]})]}),e.jsxs("div",{className:"rcw-toggle",role:"tablist",children:[e.jsx("button",{className:t==="row"?"rcw-on":"",onClick:()=>T("row"),children:"Row-oriented"}),e.jsx("button",{className:t==="column"?"rcw-on":"",onClick:()=>T("column"),children:"Column-oriented"})]})]}),e.jsxs("div",{className:"rcw-body",children:[e.jsxs("div",{className:"rcw-section",children:[e.jsxs("h3",{children:["Table (users)",e.jsxs("span",{className:"rcw-muted",children:[y.length," rows · row width = ",r.rowBytes," B · field widths: ",v.map(M=>`${M}=${As[M]||0}B`).join(" · ")]})]}),e.jsxs("table",{className:"rcw-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[v.map(M=>e.jsx("th",{children:M},M)),e.jsx("th",{style:{width:60}})]})}),e.jsxs("tbody",{children:[y.map(M=>e.jsxs("tr",{children:[v.map(k=>e.jsx("td",{children:String(M[k])},k)),e.jsx("td",{children:e.jsx("button",{className:"rcw-del-btn",onClick:()=>b(M.id),title:`Delete row ${M.id}`,children:"del"})})]},M.id)),e.jsxs("tr",{children:[v.map(M=>e.jsx("td",{children:e.jsx("input",{placeholder:M,value:D[M]??"",onChange:k=>B(P=>({...P,[M]:k.target.value}))})},M)),e.jsx("td",{children:e.jsx("button",{className:"rcw-btn",onClick:_,children:"add"})})]})]})]})]}),e.jsxs("div",{className:"rcw-section",children:[e.jsxs("h3",{children:["Disk layout — ",t==="row"?"row-oriented":"column-oriented",e.jsx("span",{className:"rcw-muted",children:t==="row"?"one block sequence; each block mixes columns":"one block sequence per column; projection touches only the needed columns"})]}),I.map(({label:M,blocks:k})=>e.jsxs("div",{className:"rcw-disk-row",children:[e.jsx("div",{className:"rcw-disk-label",children:M}),e.jsxs("div",{className:"rcw-blocks",children:[k.length===0&&e.jsx("div",{className:"rcw-muted",style:{padding:"6px 2px"},children:"(empty)"}),k.map(P=>{const N=O.has(P.id),z=!!j,E="rcw-block"+(N?" rcw-touched":"")+(z&&!N?" rcw-unused":"");return e.jsxs("div",{className:E,title:`${P.id}: ${P.bytesUsed}/${r.blockSize}B`,children:[e.jsxs("div",{className:"rcw-block-head",children:[e.jsxs("span",{children:[P.id,P.column?` · ${P.column}`:""]}),e.jsxs("span",{children:[P.bytesUsed,"/",r.blockSize,"B"]})]}),P.entries.map((J,Y)=>e.jsxs("div",{className:"rcw-block-entry",children:[J.label," ",e.jsxs("span",{style:{color:"#6a7389"},children:["(",J.bytes,"B)"]})]},Y))]},P.id)})]})]},M))]}),e.jsxs("div",{className:"rcw-section",children:[e.jsxs("h3",{children:["Query",e.jsx("span",{className:"rcw-muted",children:"projection + optional predicate · full table scan"})]}),e.jsxs("div",{className:"rcw-row",style:{marginBottom:10},children:[e.jsx("span",{className:"rcw-muted",children:"SELECT"}),e.jsx("div",{className:"rcw-cols",children:v.map(M=>e.jsxs("label",{className:"rcw-check",children:[e.jsx("input",{type:"checkbox",checked:i.includes(M),onChange:()=>x(M)}),M]},M))})]}),e.jsxs("div",{className:"rcw-row",children:[e.jsxs("label",{className:"rcw-check",children:[e.jsx("input",{type:"checkbox",checked:w,onChange:M=>C(M.target.checked)}),"WHERE"]}),e.jsx("select",{className:"rcw-select",value:l,onChange:M=>d(M.target.value),disabled:!w,children:v.map(M=>e.jsx("option",{value:M,children:M},M))}),e.jsx("select",{className:"rcw-select",value:c,onChange:M=>p(M.target.value),disabled:!w,children:uc.map(M=>e.jsx("option",{value:M,children:M},M))}),e.jsx("input",{className:"rcw-input",value:m,onChange:M=>g(M.target.value),disabled:!w,placeholder:"value"}),e.jsx("button",{className:"rcw-btn",onClick:f,children:"Run Query"})]}),j&&e.jsx("div",{className:"rcw-result",children:`${j.current.rowsMatched} row(s) · ${j.current.bytesRead} bytes · ${j.current.blocksRead} blocks
`+(j.current.result.length?j.current.result.map(M=>JSON.stringify(M)).join(`
`):"(no rows matched)")})]}),j&&e.jsxs("div",{className:"rcw-section",children:[e.jsxs("h3",{children:["Cost comparison — same query, both layouts",e.jsx("span",{className:"rcw-muted",children:H==="tie"?"both layouts read the same number of bytes":`${H}-oriented wins`})]}),e.jsxs("div",{className:"rcw-compare",children:[e.jsx(ii,{title:"Row-oriented",mode:"row",cost:j.row,blockSize:r.blockSize,winner:H,other:j.column}),e.jsx(ii,{title:"Column-oriented",mode:"column",cost:j.column,blockSize:r.blockSize,winner:H,other:j.row})]})]})]}),e.jsx("div",{className:"rcw-status",children:typeof S=="string"?S:e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"rcw-status-row",children:["Query: ",e.jsx("b",{children:S.select})]}),e.jsx("span",{className:"rcw-status-row",children:S.rowLine}),e.jsx("span",{className:"rcw-status-row",children:S.colLine})]})})]})}
function ii({title:n,mode:t,cost:s,blockSize:r,winner:o,other:i}){const a=o===t,l=o&&o!=="tie"&&!a,d="rcw-compare-card"+(a?" rcw-winner":"")+(l?" rcw-loser":""),c=i&&s.bytesRead>0?(i.bytesRead/s.bytesRead).toFixed(2):null;return e.jsxs("div",{className:d,children:[e.jsxs("div",{className:"rcw-compare-title",children:[e.jsx("span",{children:n}),a&&e.jsx("span",{className:"rcw-badge rcw-win",children:"WINNER"}),l&&e.jsx("span",{className:"rcw-badge rcw-lose",children:"slower"})]}),e.jsxs("div",{className:"rcw-compare-detail",children:[e.jsxs("div",{children:[s.blocksRead," blocks × ",r," B = ",e.jsxs("b",{children:[s.bytesRead," bytes"]})]}),e.jsxs("div",{children:["touched: ",s.columnsTouched.join(", ")]}),e.jsxs("div",{children:["rows matched: ",s.rowsMatched]}),a&&c&&c!=="1.00"&&e.jsxs("div",{style:{color:"#7fd6a4"},children:[c,"× less I/O than the other layout"]})]})]})}

export default mc;
export { mc as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(mc, {}));
  return () => root.unmount();
}
