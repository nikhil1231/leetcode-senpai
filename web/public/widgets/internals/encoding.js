import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class _r{constructor(){this.bytes=[],this.annotated=[]}len(){return this.bytes.length}push(t){this.bytes.push(t&255)}pushMany(t){for(const s of t)this.push(s)}region(t,s,r){const o=this.bytes.length;s();const i=this.bytes.length;this.annotated.push({range:[o,i],label:t,bytes:this.bytes.slice(o,i),...r||{}})}toHex(){return this.bytes.map(t=>t.toString(16).padStart(2,"0")).join(" ")}finish(){return{bytes:this.bytes.length,hex:this.toHex(),raw:this.bytes.slice(),annotated:this.annotated}}}
function gs(n){if(typeof TextEncoder<"u")return Array.from(new TextEncoder().encode(n));const t=[];for(let s=0;s<n.length;s++){const r=n.charCodeAt(s);r<128?t.push(r):r<2048?(t.push(192|r>>6),t.push(128|r&63)):(t.push(224|r>>12),t.push(128|r>>6&63),t.push(128|r&63))}return t}
function ms(n){const t=[];let s=Number(n);if(s<0)throw new Error("varint: negative not allowed, use zigzag");do{let r=s&127;s=Math.floor(s/128),s>0&&(r|=128),t.push(r)}while(s>0);return t}
function Tt(n){let t=Number(n);const s=t>=0?2*t:-2*t-1;return ms(s)}
function xd(n){const t=new _r,s=(o,i)=>{t.region(i,()=>{for(const a of gs(o))t.push(a)})};s("{","object start");const r=Object.keys(n);return r.forEach((o,i)=>{const a=JSON.stringify(o);s(a,`field name "${o}"`),s(":","key/value sep");const l=n[o],d=JSON.stringify(l);s(d,`value for "${o}" (${typeof l=="object"?Array.isArray(l)?"array":"object":typeof l})`),i<r.length-1&&s(",","field sep")}),s("}","object end"),t.finish()}
function An(n,t,s){const r=gs(t);n.region(s,()=>{if(r.length<=31)n.push(160|r.length);else if(r.length<=255)n.push(217),n.push(r.length);else throw new Error("mp: string too long for demo");for(const o of r)n.push(o)})}
function gd(n,t,s){n.region(s,()=>{if(t>=0&&t<=127)n.push(t);else if(t<=65535)n.push(205),n.push(t>>8&255),n.push(t&255);else if(t<=4294967295)n.push(206),n.push(t>>>24&255),n.push(t>>>16&255),n.push(t>>>8&255),n.push(t&255);else throw new Error("mp: int too big for demo")})}
function yi(n,t,s){if(t>=0)return gd(n,t,s);throw new Error("mp: negative ints not implemented in demo")}
function bd(n,t,s,r){n.region(`${s} [array len=${t.length}]`,()=>{if(t.length>15)throw new Error("mp: array > 15 not supported in demo");n.push(144|t.length)}),t.forEach((o,i)=>r(o,i))}
function yd(n){const t=new _r,s=Object.keys(n);if(s.length>15)throw new Error("mp: map > 15 not supported in demo");t.region(`map header (${s.length} entries)`,()=>{t.push(128|s.length)});for(const r of s){An(t,r,`key name "${r}"`);const o=n[r];if(typeof o=="string")An(t,o,`value "${o}"`);else if(typeof o=="number")yi(t,o,`value ${o}`);else if(typeof o=="boolean")t.region(`value ${o}`,()=>t.push(o?195:194));else if(Array.isArray(o))bd(t,o,`value for "${r}"`,i=>{if(typeof i=="string")An(t,i,`item "${i}"`);else if(typeof i=="number")yi(t,i,`item ${i}`);else throw new Error("mp: unsupported list element")});else throw new Error("mp: unsupported value type")}return t.finish()}
const Lt={STOP:0,BOOL_TRUE:1,BOOL_FALSE:2,I64:6,BINARY:8,LIST:9};
function vd(n){if(n==="string")return Lt.BINARY;if(n==="int64")return Lt.I64;if(n==="bool")return Lt.BOOL_TRUE;if(n==="list<string>")return Lt.LIST;throw new Error("thrift: unsupported type "+n)}
function vi(n,t,s){const r=gs(t);n.region(`${s} len=${r.length}`,()=>{for(const o of ms(r.length))n.push(o)}),n.region(`${s} utf-8 "${t}"`,()=>{for(const o of r)n.push(o)})}
function wd(n,t){const s=new _r;let r=0;for(const o of t.fields){const i=n[o.name];if(i==null)continue;if(o.type==="bool"){const d=i?Lt.BOOL_TRUE:Lt.BOOL_FALSE,c=o.tag-r;s.region(`field ${o.tag} (${o.name}) hdr: delta=${c} type=bool(${i})`,()=>{if(c>0&&c<=15)s.push(c<<4|d);else{s.push(d);for(const p of Tt(o.tag))s.push(p)}}),r=o.tag;continue}const a=vd(o.type),l=o.tag-r;if(s.region(`field ${o.tag} (${o.name}) hdr: delta=${l>0&&l<=15?l:"explicit"} type=${o.type}`,()=>{if(l>0&&l<=15)s.push(l<<4|a);else{s.push(a);for(const d of Tt(o.tag))s.push(d)}}),r=o.tag,o.type==="string")vi(s,i,`"${o.name}"`);else if(o.type==="int64")s.region(`"${o.name}" = ${i} (zigzag varint)`,()=>{for(const d of Tt(i))s.push(d)});else if(o.type==="list<string>"){const d=i;s.region(`list<string> header (n=${d.length}, elem=binary)`,()=>{if(d.length<=14)s.push(d.length<<4|Lt.BINARY);else{s.push(240|Lt.BINARY);for(const c of ms(d.length))s.push(c)}}),d.forEach((c,p)=>vi(s,c,`item[${p}] "${c}"`))}}return s.region("stop (0x00)",()=>s.push(Lt.STOP)),s.finish()}
function Pr(n,t){return ms(n<<3|t)}
function kd(n,t){const s=new _r;for(const r of t.fields){const o=n[r.name];if(o!=null)if(r.type==="string"){s.region(`field ${r.tag} (${r.name}) key: tag=${r.tag} wire=2 (len-delim)`,()=>{for(const a of Pr(r.tag,2))s.push(a)});const i=gs(o);s.region(`len=${i.length}`,()=>{for(const a of ms(i.length))s.push(a)}),s.region(`"${o}" utf-8`,()=>{for(const a of i)s.push(a)})}else if(r.type==="int64")s.region(`field ${r.tag} (${r.name}) key: tag=${r.tag} wire=0 (varint)`,()=>{for(const i of Pr(r.tag,0))s.push(i)}),s.region(`value ${o} (varint)`,()=>{for(const i of ms(o))s.push(i)});else if(r.type==="bool")s.region(`field ${r.tag} (${r.name}) key: tag=${r.tag} wire=0`,()=>{for(const i of Pr(r.tag,0))s.push(i)}),s.region(`value ${o}`,()=>s.push(o?1:0));else if(r.type==="list<string>")o.forEach((a,l)=>{s.region(`repeated field ${r.tag} (${r.name}) [${l}] key`,()=>{for(const c of Pr(r.tag,2))s.push(c)});const d=gs(a);s.region(`len=${d.length}`,()=>{for(const c of ms(d.length))s.push(c)}),s.region(`"${a}"`,()=>{for(const c of d)s.push(c)})});else throw new Error("pb: unsupported type "+r.type)}return s.finish()}
function jd(n,t){const s=new _r,r=$d(t)&255||1;s.region(`schema id=0x${r.toString(16).padStart(2,"0")} (registry framing)`,()=>{s.push(r)});for(const o of t.fields){const i=n[o.name],a=Object.prototype.hasOwnProperty.call(o,"default");if(o.required!==!0){if(i==null){s.region(`"${o.name}" union branch: null`,()=>{for(const c of Tt(0))s.push(c)});continue}s.region(`"${o.name}" union branch: ${o.type}`,()=>{for(const c of Tt(1))s.push(c)})}else if(i==null&&!a)throw new Error(`avro: required field "${o.name}" missing`);const d=i??o.default;Sd(s,o.type,d,o.name)}return s.finish()}
function Sd(n,t,s,r){if(t==="string"){const o=gs(s);n.region(`"${r}" len=${o.length} (zigzag varint)`,()=>{for(const i of Tt(o.length))n.push(i)}),n.region(`"${r}" utf-8 "${s}"`,()=>{for(const i of o)n.push(i)})}else if(t==="int64")n.region(`"${r}" = ${s} (zigzag varint)`,()=>{for(const o of Tt(s))n.push(o)});else if(t==="bool")n.region(`"${r}" = ${s}`,()=>n.push(s?1:0));else if(t==="list<string>"){const o=s||[];n.region(`"${r}" array block count=${o.length}`,()=>{for(const i of Tt(o.length))n.push(i)}),o.forEach((i,a)=>{const l=gs(i);n.region(`  [${a}] len=${l.length}`,()=>{for(const d of Tt(l.length))n.push(d)}),n.region(`  [${a}] "${i}"`,()=>{for(const d of l)n.push(d)})}),n.region(`"${r}" array end-block (0)`,()=>{for(const i of Tt(0))n.push(i)})}else throw new Error("avro: unsupported type "+t)}
function $d(n){let t=0;const s=JSON.stringify(n);for(let r=0;r<s.length;r++)t=t*131+s.charCodeAt(r)|0;return t&255}
function Nd(n,t){const s=[];let r=!0,o=!0;const i=new Map,a=new Map;for(const c of n.fields)i.set(c.tag,c),a.set(c.name,c);const l=new Map,d=new Map;for(const c of t.fields)l.set(c.tag,c),d.set(c.name,c);for(const c of t.fields)if(!i.has(c.tag)&&!a.has(c.name)){const p=Object.prototype.hasOwnProperty.call(c,"default"),m=c.required!==!0;c.required===!0&&!p?(r=!1,s.push({type:"added",field:c.name,severity:"error",explanation:`Added required field "${c.name}" (tag ${c.tag}) without a default. Backward ❌: new readers can't fill missing field from old data.`})):s.push({type:"added",field:c.name,severity:"ok",explanation:`Added field "${c.name}" (tag ${c.tag}) as ${m?"optional":"required with default"}. Backward ✅ (reader substitutes ${p?`default ${JSON.stringify(c.default)}`:"null"}). Forward ✅ (old readers ignore unknown tag ${c.tag}).`})}for(const c of n.fields)!l.has(c.tag)&&!d.has(c.name)&&(c.required===!0?(r=!1,o=!1,s.push({type:"removed",field:c.name,severity:"error",explanation:`Removed required field "${c.name}" (tag ${c.tag}). Backward ❌ (new code can't produce a required field). Forward ❌ (old readers expect the field to be present).`})):s.push({type:"removed",field:c.name,severity:"ok",explanation:`Removed optional field "${c.name}" (tag ${c.tag}). Safe both directions. Never reuse tag ${c.tag}.`}));for(const c of t.fields){const p=i.get(c.tag);if(!p)continue;p.name!==c.name&&s.push({type:"renamed",field:`${p.name} → ${c.name}`,severity:"warn",explanation:`Renamed field tag ${c.tag}: "${p.name}" → "${c.name}". Thrift/Protobuf: OK (tags are the identity). Avro: ❌ unless you add "${p.name}" to aliases of the new field.`}),p.type!==c.type&&(s.push({type:"typeChanged",field:c.name,severity:"warn",explanation:`Type changed for tag ${c.tag}: ${p.type} → ${c.type}. May lose precision / truncate (e.g. i64→i32). Check the spec.`}),o=!1);const m=p.required===!0,g=c.required===!0;m!==g&&(!m&&g?(o=!1,s.push({type:"typeChanged",field:c.name,severity:"warn",explanation:`"${c.name}" changed from optional to required. Forward ❌: old writers may omit it; new readers will reject.`})):s.push({type:"typeChanged",field:c.name,severity:"ok",explanation:`"${c.name}" relaxed from required to optional. Safe both directions.`}))}for(const c of t.fields){const p=a.get(c.name);p&&p.tag!==c.tag&&!i.has(c.tag)&&(r=!1,o=!1,s.push({type:"typeChanged",field:c.name,severity:"error",explanation:`Field "${c.name}" changed tag ${p.tag} → ${c.tag}. This breaks both directions (tag is the wire identity).`}))}return{backwardCompat:r,forwardCompat:o,issues:s}}
const Cd="#0f1419",In="#161b22",jt="#2a3038",ws="#e6e6e6",St="#8a95a3",wi="#5cd894",_d="#f5c451",br="#f66",Or=["#2c5aa0","#7d4fc7","#c77d4f","#4fc78b","#c74f7d","#4fb3c7","#c7b44f","#8a95a3"],Rd=`
.enc-widget {
  background: ${Cd};
  color: ${ws};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid ${jt};
  border-radius: 8px;
  padding: 16px;
  max-width: 1180px;
}
.enc-widget h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
}
.enc-widget .sub {
  font-size: 12px;
  color: ${St};
  margin: 0 0 12px 0;
}
.enc-widget h3 {
  margin: 16px 0 6px 0;
  font-size: 14px;
  color: ${ws};
}
.enc-widget h4 {
  margin: 0 0 6px 0;
  font-size: 13px;
  color: ${ws};
}
.enc-widget label {
  font-size: 12px;
  color: ${St};
}
.enc-widget textarea, .enc-widget input, .enc-widget select {
  background: #0a0e13;
  color: ${ws};
  border: 1px solid ${jt};
  border-radius: 4px;
  padding: 4px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  box-sizing: border-box;
}
.enc-widget textarea { width: 100%; min-height: 80px; resize: vertical; }
.enc-widget button {
  background: #1a1f26;
  color: ${ws};
  border: 1px solid #3a4250;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.enc-widget button:hover { background: #232a33; }
.enc-widget button.primary {
  background: #2c5aa0;
  border-color: #3c6ab0;
}
.enc-widget button.primary:hover { background: #3467b0; }
.enc-widget button.danger {
  background: #4a1f22;
  border-color: #7d2c30;
}
.enc-widget button.small {
  padding: 2px 6px;
  font-size: 11px;
}

.enc-record-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 8px;
}

.enc-schema-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.enc-schema-table th, .enc-schema-table td {
  padding: 4px 6px;
  border-bottom: 1px solid ${jt};
  text-align: left;
}
.enc-schema-table th {
  color: ${St};
  font-weight: 500;
  font-size: 11px;
}
.enc-schema-table input[type="text"] { width: 96%; }
.enc-schema-table input[type="number"] { width: 48px; }
.enc-schema-table td.center { text-align: center; }

.enc-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 8px;
}
.enc-card {
  background: ${In};
  border: 1px solid ${jt};
  border-radius: 6px;
  padding: 8px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.enc-card .name { font-size: 12px; color: ${St}; }
.enc-card .count {
  font-size: 22px;
  font-weight: 700;
  color: ${ws};
  line-height: 1.1;
}
.enc-card .count-sub {
  font-size: 10px;
  color: ${St};
  margin-top: -2px;
}
.enc-strip {
  display: flex;
  height: 10px;
  border-radius: 2px;
  overflow: hidden;
  background: #0a0e13;
  border: 1px solid ${jt};
}
.enc-strip > div { height: 100%; flex-shrink: 0; }

.enc-hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  background: #0a0e13;
  border: 1px solid ${jt};
  border-radius: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  white-space: normal;
  word-break: normal;
}
.enc-hex-byte {
  display: inline-block;
  padding: 0 2px;
  border-radius: 2px;
  margin: 0 1px 1px 0;
  cursor: help;
  color: #fff;
}
.enc-card .tip {
  min-height: 32px;
  font-size: 11px;
  color: ${St};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.35;
}

.enc-status {
  margin-top: 12px;
  background: ${In};
  border: 1px solid ${jt};
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #cfd6e0;
  white-space: pre-wrap;
}
.enc-status.err { color: ${br}; }

.enc-evo {
  display: grid;
  grid-template-columns: 1fr 1fr 280px;
  gap: 12px;
  margin-top: 8px;
}
.enc-evo-col {
  background: ${In};
  border: 1px solid ${jt};
  border-radius: 6px;
  padding: 8px;
}
.enc-matrix {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.enc-matrix .row {
  display: flex;
  justify-content: space-between;
  padding: 4px 6px;
  background: #0a0e13;
  border: 1px solid ${jt};
  border-radius: 4px;
  font-size: 12px;
}
.enc-matrix .row.ok { border-color: #2f7b50; }
.enc-matrix .row.err { border-color: #7d2c30; }
.enc-matrix .label { color: ${St}; }
.enc-matrix .val { font-weight: 600; }
.enc-matrix .val.ok { color: ${wi}; }
.enc-matrix .val.err { color: ${br}; }
.enc-issues { margin-top: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.enc-issue {
  padding: 6px 8px;
  border-radius: 4px;
  border-left: 3px solid ${St};
  background: #0a0e13;
  border: 1px solid ${jt};
  line-height: 1.4;
}
.enc-issue.ok   { border-left-color: ${wi}; }
.enc-issue.warn { border-left-color: ${_d}; }
.enc-issue.error { border-left-color: ${br}; }
.enc-issue .head { font-weight: 600; font-size: 11px; text-transform: uppercase; color: ${St}; }

.enc-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.enc-note {
  font-size: 11px;
  color: ${St};
  margin-top: 6px;
  line-height: 1.4;
}
`,ki={userName:"Martin",favoriteNumber:1337,interests:["daydreaming","hacking"]},En={name:"Person",fields:[{tag:1,name:"userName",type:"string",required:!0},{tag:2,name:"favoriteNumber",type:"int64",required:!1,default:0},{tag:3,name:"interests",type:"list<string>",required:!1}]},ji={name:"Person",fields:[{tag:1,name:"userName",type:"string",required:!0},{tag:2,name:"favoriteNumber",type:"int64",required:!1,default:0},{tag:3,name:"interests",type:"list<string>",required:!1},{tag:4,name:"email",type:"string",required:!1,default:""}]},Td=["string","int64","bool","list<string>"];
function Md(n){return JSON.stringify(n,null,2)}
function Ad(n){try{const t=JSON.parse(n);return t&&typeof t=="object"&&!Array.isArray(t)?{ok:!0,value:t}:{ok:!1,error:"expected a JSON object at the top level"}}catch(t){return{ok:!1,error:String(t.message||t)}}}
function Hs(n){try{return{ok:!0,out:n()}}catch(t){return{ok:!1,error:String(t.message||t)}}}
function Id(n,t){for(let s=0;s<n.length;s++){const[r,o]=n[s].range;if(t>=r&&t<o)return{anno:n[s],regionIdx:s}}return null}
function Ks({title:n,result:t,error:s}){if(s)return e.jsxs("div",{className:"enc-card",children:[e.jsx("div",{className:"name",children:n}),e.jsx("div",{className:"count",style:{color:br},children:"—"}),e.jsx("div",{className:"tip",style:{color:br},children:s})]});const{bytes:r,annotated:o,raw:i}=t,a=o.map((l,d)=>{const[c,p]=l.range,m=(p-c)/Math.max(1,r)*100;return e.jsx("div",{title:`${l.label} [${c}..${p-1}]`,style:{width:`${m}%`,background:Or[d%Or.length]}},d)});return e.jsxs("div",{className:"enc-card",children:[e.jsx("div",{className:"name",children:n}),e.jsx("div",{className:"count",children:r}),e.jsx("div",{className:"count-sub",children:"bytes"}),e.jsx("div",{className:"enc-strip",children:a}),e.jsx("div",{className:"enc-hex",children:i.map((l,d)=>{const c=Id(o,d),p=c?Or[c.regionIdx%Or.length]:"#2a3038",m=c?c.anno.label:"(unlabelled)",g=l.toString(16).padStart(2,"0");return e.jsx("span",{className:"enc-hex-byte",style:{background:p},title:`byte ${d} = 0x${g} (${l}) — ${m}`,children:g},d)})})]})}
function zn({schema:n,setSchema:t,label:s}){const r=(a,l)=>{const d={...n,fields:n.fields.map((c,p)=>p===a?{...c,...l}:c)};t(d)},o=a=>{t({...n,fields:n.fields.filter((l,d)=>d!==a)})},i=()=>{const a=n.fields.reduce((l,d)=>Math.max(l,d.tag),0);t({...n,fields:[...n.fields,{tag:a+1,name:`field${a+1}`,type:"string",required:!1,default:""}]})};return e.jsxs("div",{children:[e.jsx("h4",{children:s}),e.jsxs("table",{className:"enc-schema-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"tag"}),e.jsx("th",{children:"name"}),e.jsx("th",{children:"type"}),e.jsx("th",{className:"center",children:"req?"}),e.jsx("th",{children:"default"}),e.jsx("th",{})]})}),e.jsx("tbody",{children:n.fields.map((a,l)=>e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("input",{type:"number",value:a.tag,min:1,onChange:d=>r(l,{tag:parseInt(d.target.value,10)||1})})}),e.jsx("td",{children:e.jsx("input",{type:"text",value:a.name,onChange:d=>r(l,{name:d.target.value})})}),e.jsx("td",{children:e.jsx("select",{value:a.type,onChange:d=>r(l,{type:d.target.value}),children:Td.map(d=>e.jsx("option",{value:d,children:d},d))})}),e.jsx("td",{className:"center",children:e.jsx("input",{type:"checkbox",checked:!!a.required,onChange:d=>r(l,{required:d.target.checked})})}),e.jsx("td",{children:e.jsx("input",{type:"text",value:a.default===void 0?"":String(a.default),onChange:d=>r(l,{default:d.target.value}),placeholder:"(none)"})}),e.jsx("td",{children:e.jsx("button",{className:"small danger",onClick:()=>o(l),children:"×"})})]},l))})]}),e.jsx("div",{style:{marginTop:6},children:e.jsx("button",{className:"small",onClick:i,children:"+ add field"})})]})}
function Ed(){const[n,t]=h.useState(Md(ki)),s=h.useMemo(()=>Ad(n),[n]),r=s.ok?s.value:ki,[o,i]=h.useState(En),[a,l]=h.useState(En),[d,c]=h.useState(ji),p=Hs(()=>xd(r)),m=Hs(()=>yd(r)),g=Hs(()=>wd(r,o)),w=Hs(()=>kd(r,o)),C=Hs(()=>jd(r,o)),j=h.useMemo(()=>{const V=[];return p.ok&&V.push(`JSON: ${p.out.bytes} bytes`),m.ok&&V.push(`MessagePack: ${m.out.bytes} bytes`),g.ok&&V.push(`Thrift: ${g.out.bytes} bytes`),w.ok&&V.push(`Protobuf: ${w.out.bytes} bytes`),C.ok&&V.push(`Avro: ${C.out.bytes} bytes`),V.join(". ")+"."},[p,m,g,w,C]),$=h.useMemo(()=>Nd(a,d),[a,d]),O=()=>{const V=d.fields.reduce((T,_)=>Math.max(T,_.tag),0);c({...d,fields:[...d.fields,{tag:V+1,name:"email",type:"string",required:!1,default:""}]})},q=()=>{d.fields.length<=1||c({...d,fields:d.fields.slice(0,-1)})},R=()=>{const V=d.fields.findIndex(T=>T.required);V<0||c({...d,fields:d.fields.filter((T,_)=>_!==V)})},D=()=>{if(!d.fields.length)return;const V=d.fields[0],T={...V,name:V.name+"_v2"};c({...d,fields:[T,...d.fields.slice(1)]})},B=()=>{l(En),c(ji)};return e.jsxs("div",{className:"enc-widget",children:[e.jsx("style",{children:Rd}),e.jsx("h2",{children:"Encoding & Evolution — DDIA Ch 4"}),e.jsx("p",{className:"sub",children:"Five encodings of the same record, byte-by-byte. Edit the record and the schema and watch what each format produces. Below, explore how schema evolution affects backward and forward compatibility."}),e.jsxs("div",{className:"enc-record-row",children:[e.jsxs("div",{children:[e.jsx("h3",{children:"Record (JSON object)"}),e.jsx("textarea",{value:n,onChange:V=>t(V.target.value),spellCheck:!1}),!s.ok&&e.jsxs("div",{className:"enc-status err",children:["parse error: ",s.error]}),e.jsx("div",{className:"enc-note",children:"This is the in-memory record. All five encoders take it and the schema below and produce the exact byte sequence they would send over the wire."})]}),e.jsxs("div",{children:[e.jsx("h3",{children:"Schema (for Thrift / Protobuf / Avro)"}),e.jsx(zn,{schema:o,setSchema:i,label:"fields"}),e.jsx("div",{className:"enc-note",children:"JSON and MessagePack do not need a schema. Thrift & Protobuf use field tags. Avro relies on writer/reader schemas matching by name."})]})]}),e.jsx("h3",{children:"Byte-level encodings"}),e.jsxs("div",{className:"enc-cards",children:[e.jsx(Ks,{title:"JSON",result:p.out,error:p.error}),e.jsx(Ks,{title:"MessagePack",result:m.out,error:m.error}),e.jsx(Ks,{title:"Thrift Compact",result:g.out,error:g.error}),e.jsx(Ks,{title:"Protobuf",result:w.out,error:w.error}),e.jsx(Ks,{title:"Avro",result:C.out,error:C.error})]}),e.jsx("div",{className:"enc-status",children:j}),e.jsx("div",{className:"enc-note",children:"Hover over each hex byte for its meaning (tag, length, varint, etc.). Colours delimit logical regions. Qualitatively you should see JSON ≫ MessagePack > Thrift/Protobuf/Avro, matching DDIA Figures 4-1 through 4-5."}),e.jsx("h3",{style:{marginTop:20},children:"Schema evolution"}),e.jsxs("div",{className:"enc-evo",children:[e.jsx("div",{className:"enc-evo-col",children:e.jsx(zn,{schema:a,setSchema:l,label:"Writer schema v1"})}),e.jsxs("div",{className:"enc-evo-col",children:[e.jsx(zn,{schema:d,setSchema:c,label:"Reader schema v2"}),e.jsxs("div",{className:"enc-actions",children:[e.jsx("button",{className:"small",onClick:O,children:"+ add nullable field"}),e.jsx("button",{className:"small",onClick:q,children:"− remove last field"}),e.jsx("button",{className:"small",onClick:R,children:"− remove required field"}),e.jsx("button",{className:"small",onClick:D,children:"↻ rename first field"}),e.jsx("button",{className:"small",onClick:B,children:"reset"})]})]}),e.jsxs("div",{className:"enc-evo-col",children:[e.jsx("h4",{children:"Compatibility matrix"}),e.jsxs("div",{className:"enc-matrix",children:[e.jsxs("div",{className:`row ${$.backwardCompat?"ok":"err"}`,children:[e.jsx("span",{className:"label",children:"Backward (new reader reads old data)"}),e.jsx("span",{className:`val ${$.backwardCompat?"ok":"err"}`,children:$.backwardCompat?"✅":"❌"})]}),e.jsxs("div",{className:`row ${$.forwardCompat?"ok":"err"}`,children:[e.jsx("span",{className:"label",children:"Forward (old reader reads new data)"}),e.jsx("span",{className:`val ${$.forwardCompat?"ok":"err"}`,children:$.forwardCompat?"✅":"❌"})]})]}),e.jsxs("div",{className:"enc-issues",children:[$.issues.length===0&&e.jsxs("div",{className:"enc-issue ok",children:[e.jsx("div",{className:"head",children:"no changes"}),"Schemas are identical. Both directions safe."]}),$.issues.map((V,T)=>e.jsxs("div",{className:`enc-issue ${V.severity}`,children:[e.jsxs("div",{className:"head",children:[V.type," · ",V.field]}),V.explanation]},T))]})]})]}),e.jsxs("div",{className:"enc-note",style:{marginTop:12},children:[e.jsx("strong",{children:"Simplifications:"})," MessagePack implements only the small subset needed (fixmap / fixstr / fixarray / small uints). Thrift uses CompactProtocol semantics (type+tag-delta header byte, zig-zag varints, stop byte). Protobuf uses faithful wire types (varint / length-delimited); repeated strings are non-packed. Avro has no tags — values are in schema order — and we prepend 1 byte of schema-id framing (Confluent-style). Byte counts qualitatively match DDIA Figures 4-1..4-5."]})]})}

export default Ed;
export { Ed as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Ed, {}));
  return () => root.unmount();
}
