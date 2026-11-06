import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
function sr(n){const t=String(n);let s=2166136261;for(let r=0;r<t.length;r++)s^=t.charCodeAt(r),s=s+((s<<1)+(s<<4)+(s<<7)+(s<<8)+(s<<24))>>>0;return s>>>0}
const Kr=[{user_id:1,name:"alice",country:"US"},{user_id:2,name:"bob",country:"DE"},{user_id:3,name:"carol",country:"US"},{user_id:4,name:"dave",country:"JP"},{user_id:5,name:"eve",country:"DE"},{user_id:6,name:"frank",country:"US"},{user_id:7,name:"grace",country:"US"},{user_id:8,name:"heidi",country:"JP"}],Ur=[{product_id:101,name:"widget",price:9},{product_id:102,name:"gadget",price:19},{product_id:103,name:"gizmo",price:29},{product_id:104,name:"doohickey",price:5}],rr=[{order_id:9001,user_id:1,product_id:101,amount:90},{order_id:9002,user_id:2,product_id:102,amount:38},{order_id:9003,user_id:1,product_id:103,amount:29},{order_id:9004,user_id:3,product_id:101,amount:9},{order_id:9005,user_id:4,product_id:104,amount:5},{order_id:9006,user_id:5,product_id:102,amount:19},{order_id:9007,user_id:6,product_id:101,amount:27},{order_id:9008,user_id:7,product_id:103,amount:58},{order_id:9009,user_id:2,product_id:104,amount:10},{order_id:9010,user_id:8,product_id:102,amount:19},{order_id:9011,user_id:1,product_id:101,amount:9},{order_id:9012,user_id:3,product_id:103,amount:29}],le={localLookup:2,localScan:5,networkHop:4,crossShardHop:3,write:3};
class Vi{constructor({strategy:t="federation",shardCount:s=4}={}){this.strategy=t,this.shardCount=s,this.stats={queries:0,totalShardsHit:0,writeAmplification:0},this.lastQuery=null,this._build()}_build(){if(this.tables=[],this.strategy==="federation")this.tables.push({name:"users",shard:"userdb",rows:[...Kr]}),this.tables.push({name:"products",shard:"productdb",rows:[...Ur]}),this.tables.push({name:"orders",shard:"orderdb",rows:[...rr]});else if(this.strategy==="horizontal"){for(let t=0;t<this.shardCount;t++)this.tables.push({name:"users",shard:`shard-${t}`,rows:[]}),this.tables.push({name:"orders",shard:`shard-${t}`,rows:[]}),this.tables.push({name:"products",shard:`shard-${t}`,rows:[...Ur]});for(const t of Kr){const s=sr(t.user_id)%this.shardCount;this._findTable("users",`shard-${s}`).rows.push({...t})}for(const t of rr){const s=sr(t.user_id)%this.shardCount;this._findTable("orders",`shard-${s}`).rows.push({...t})}}else if(this.strategy==="denormalized"){this.tables.push({name:"users",shard:"primary",rows:[...Kr]}),this.tables.push({name:"products",shard:"primary",rows:[...Ur]}),this.tables.push({name:"orders",shard:"primary",rows:[...rr]});const t=new Map(Kr.map(a=>[a.user_id,a])),s=new Map(Ur.map(a=>[a.product_id,a])),r=rr.map(a=>{var l,d,c;return{order_id:a.order_id,user_id:a.user_id,user_name:(l=t.get(a.user_id))==null?void 0:l.name,product_id:a.product_id,product_name:(d=s.get(a.product_id))==null?void 0:d.name,product_price:(c=s.get(a.product_id))==null?void 0:c.price,amount:a.amount}});this.tables.push({name:"orders_wide",shard:"read-db",rows:r});const o=new Map;for(const a of rr)o.set(a.user_id,(o.get(a.user_id)||0)+a.amount);const i=[...o.entries()].map(([a,l])=>{var d;return{user_id:a,user_name:(d=t.get(a))==null?void 0:d.name,total:l}}).sort((a,l)=>l.total-a.total);this.tables.push({name:"user_spenders",shard:"read-db",rows:i})}else throw new Error(`unknown strategy: ${this.strategy}`)}_findTable(t,s){return this.tables.find(r=>r.name===t&&r.shard===s)}_tablesForName(t){return this.tables.filter(s=>s.name===t)}setStrategy(t,s){this.strategy=t,typeof s=="number"&&(this.shardCount=s),this.stats={queries:0,totalShardsHit:0,writeAmplification:0},this.lastQuery=null,this._build()}_parse(t){var o,i;const s=String(t).trim().replace(/;$/,"").replace(/\s+/g," ");s.toUpperCase();let r=s.match(/^UPDATE\s+(\w+)\s+SET\s+(\w+)\s*=\s*('[^']*'|\d+)(?:\s+WHERE\s+(\w+)\s*=\s*('[^']*'|\d+))?$/i);if(r)return{kind:"update",table:r[1].toLowerCase(),setCol:r[2].toLowerCase(),setVal:Vr(r[3]),whereCol:(o=r[4])==null?void 0:o.toLowerCase(),whereVal:r[5]!==void 0?Vr(r[5]):void 0};if(r=s.match(/^INSERT\s+INTO\s+(\w+)/i),r)return{kind:"insert",table:r[1].toLowerCase()};if(/\bGROUP\s+BY\b/i.test(s)&&/\bFROM\s+ORDERS\b/i.test(s))return{kind:"aggregateOrders"};if(/\bJOIN\b/i.test(s)){const a=s.match(/WHERE\s+\w+\.?(\w+)\s*=\s*('[^']*'|\d+)/i);return{kind:"join",whereCol:a?a[1].toLowerCase():void 0,whereVal:a?Vr(a[2]):void 0}}if(r=s.match(/^SELECT\s+.*?\s+FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*('[^']*'|\d+))?$/i),r)return{kind:"select",table:r[1].toLowerCase(),whereCol:(i=r[2])==null?void 0:i.toLowerCase(),whereVal:r[3]!==void 0?Vr(r[3]):void 0};throw new Error("Could not parse SQL (this widget only understands a tiny subset).")}query(t){const s=this._parse(t);let r;if(s.kind==="select")r=this._runSelect(s);else if(s.kind==="join")r=this._runJoin(s);else if(s.kind==="aggregateOrders")r=this._runAggregate(s);else if(s.kind==="insert")r=this._runInsert(s);else if(s.kind==="update")r=this._runUpdate(s);else throw new Error("unhandled ast");return this.stats.queries+=1,this.stats.totalShardsHit+=r.shardsHit.length,r.writeAmplification&&r.writeAmplification>1&&(this.stats.writeAmplification+=r.writeAmplification-1),this.lastQuery={sql:t,...r},r}write(t,s){const r=this._tablesForName(t),o=new Set;for(const a of r){for(const l of s)a.rows.push({...l});o.add(a.shard)}const i=o.size;return this.stats.queries+=1,this.stats.totalShardsHit+=i,i>1&&(this.stats.writeAmplification+=i-1),{shardsHit:[...o],rowsScanned:0,crossShardJoin:!1,latencyMsEst:i*le.write,writeAmplification:i}}snapshot(){return{strategy:this.strategy,shardCount:this.shardCount,tables:this.tables.map(t=>({name:t.name,shard:t.shard,rows:t.rows.length,sample:t.rows.slice(0,4)})),stats:{...this.stats},lastQuery:this.lastQuery?{sql:this.lastQuery.sql,shardsHit:[...this.lastQuery.shardsHit],tablesHit:[...this.lastQuery.tablesHit||[]],rowsScanned:this.lastQuery.rowsScanned,crossShardJoin:this.lastQuery.crossShardJoin,latencyMsEst:this.lastQuery.latencyMsEst,writeAmplification:this.lastQuery.writeAmplification||1,narrate:this.lastQuery.narrate,resultCount:this.lastQuery.resultCount}:null}}_runSelect(t){const s=this._tablesForName(t.table);if(s.length===0)throw new Error(`unknown table: ${t.table}`);const r=new Set,o=new Set;let i=0,a=0;if(this.strategy==="federation"){const[d]=s;return r.add(d.shard),o.add(`${d.name}@${d.shard}`),i+=d.rows.length,a+=Gr(d.rows,t.whereCol,t.whereVal),Ae({shardsHit:[...r],tablesHit:[...o],rowsScanned:i,crossShardJoin:!1,latencyMsEst:t.whereCol?le.localLookup:le.localScan,resultCount:a,narrate:`federation: routed to ${d.shard}.${d.name}, indexed=${!!t.whereCol}`})}if(this.strategy==="horizontal"){const d=t.table==="users"||t.table==="orders"?"user_id":null,c=[];if(t.table==="products")c.push(s[0]);else if(t.whereCol===d&&t.whereVal!==void 0){const m=sr(t.whereVal)%this.shardCount;c.push(this._findTable(t.table,`shard-${m}`))}else for(const m of s)c.push(m);for(const m of c)r.add(m.shard),o.add(`${m.name}@${m.shard}`),i+=m.rows.length,a+=Gr(m.rows,t.whereCol,t.whereVal);const p=c.length===1?t.whereCol?le.localLookup:le.localScan:le.localScan+c.length*le.crossShardHop;return Ae({shardsHit:[...r],tablesHit:[...o],rowsScanned:i,crossShardJoin:c.length>1,latencyMsEst:p,resultCount:a,narrate:c.length===1?`horizontal: single-shard ${c[0].shard} on shard key ${d}=${t.whereVal}`:`horizontal: predicate not on shard key → fan out to all ${c.length} shards`})}const[l]=s;return r.add(l.shard),o.add(`${l.name}@${l.shard}`),i+=l.rows.length,a+=Gr(l.rows,t.whereCol,t.whereVal),Ae({shardsHit:[...r],tablesHit:[...o],rowsScanned:i,crossShardJoin:!1,latencyMsEst:t.whereCol?le.localLookup:le.localScan,resultCount:a,narrate:`denormalized: direct read on ${l.shard}.${l.name}`})}_runJoin(t){const s=new Set,r=new Set;let o=0,i=0;if(this.strategy==="federation"){const l=this._findTable("users","userdb"),d=this._findTable("orders","orderdb");return s.add("orderdb"),s.add("userdb"),r.add("orders@orderdb"),r.add("users@userdb"),o+=d.rows.length+l.rows.length,i=eo(d.rows,l.rows,t),Ae({shardsHit:[...s],tablesHit:[...r],rowsScanned:o,crossShardJoin:!0,latencyMsEst:le.localScan+le.networkHop+le.localScan,resultCount:i,narrate:"federation: join crosses dbs → fetch order rows from orderdb, then batch-fetch users from userdb (2 RTTs)"})}if(this.strategy==="horizontal"){if(t.whereCol==="user_id"&&t.whereVal!==void 0){const l=sr(t.whereVal)%this.shardCount,d=this._findTable("users",`shard-${l}`),c=this._findTable("orders",`shard-${l}`);return s.add(`shard-${l}`),r.add(`users@shard-${l}`),r.add(`orders@shard-${l}`),o+=d.rows.length+c.rows.length,i=eo(c.rows,d.rows,t),Ae({shardsHit:[...s],tablesHit:[...r],rowsScanned:o,crossShardJoin:!1,latencyMsEst:le.localLookup,resultCount:i,narrate:`horizontal: join stays inside shard-${l} (users/orders co-located on user_id)`})}for(let l=0;l<this.shardCount;l++){const d=this._findTable("users",`shard-${l}`),c=this._findTable("orders",`shard-${l}`);s.add(`shard-${l}`),r.add(`users@shard-${l}`),r.add(`orders@shard-${l}`),o+=d.rows.length+c.rows.length,i+=eo(c.rows,d.rows,t)}return Ae({shardsHit:[...s],tablesHit:[...r],rowsScanned:o,crossShardJoin:!0,latencyMsEst:le.localScan+this.shardCount*le.crossShardHop,resultCount:i,narrate:"horizontal: join predicate not anchored to shard key → scatter to every shard and merge"})}const a=this._findTable("orders_wide","read-db");return s.add("read-db"),r.add("orders_wide@read-db"),o+=a.rows.length,i=Gr(a.rows,t.whereCol,t.whereVal),Ae({shardsHit:[...s],tablesHit:[...r],rowsScanned:o,crossShardJoin:!1,latencyMsEst:le.localLookup,resultCount:i,narrate:"denormalized: user+product columns are duplicated into orders_wide → no join needed"})}_runAggregate(){if(this.strategy==="federation"){const s=this._findTable("orders","orderdb");return Ae({shardsHit:["orderdb"],tablesHit:["orders@orderdb"],rowsScanned:s.rows.length,crossShardJoin:!1,latencyMsEst:le.localScan*2,resultCount:Math.min(10,new Set(s.rows.map(r=>r.user_id)).size),narrate:"federation: one big scan over orderdb.orders"})}if(this.strategy==="horizontal"){const s=[],r=[];let o=0;for(let i=0;i<this.shardCount;i++){const a=this._findTable("orders",`shard-${i}`);s.push(`shard-${i}`),r.push(`orders@shard-${i}`),o+=a.rows.length}return Ae({shardsHit:s,tablesHit:r,rowsScanned:o,crossShardJoin:!0,latencyMsEst:le.localScan+this.shardCount*le.crossShardHop,resultCount:10,narrate:"horizontal: partial top-10 per shard then merge-sort at coordinator (classic scatter-gather aggregate)"})}const t=this._findTable("user_spenders","read-db");return Ae({shardsHit:["read-db"],tablesHit:["user_spenders@read-db"],rowsScanned:t.rows.length,crossShardJoin:!1,latencyMsEst:le.localLookup,resultCount:Math.min(10,t.rows.length),narrate:"denormalized: point-read on user_spenders (pre-aggregated by an upstream pipeline)"})}_runInsert(t){const s=this._tablesForName(t.table);if(s.length===0)throw new Error(`unknown table: ${t.table}`);const r=new Set,o=new Set;for(const l of s)r.add(l.shard),o.add(`${l.name}@${l.shard}`);let i=0;this.strategy==="denormalized"&&t.table==="orders"&&(r.add("read-db"),o.add("orders_wide@read-db"),o.add("user_spenders@read-db"),i+=2);const a=r.size;return Ae({shardsHit:[...r],tablesHit:[...o],rowsScanned:0,crossShardJoin:!1,latencyMsEst:a*le.write,resultCount:1,writeAmplification:o.size+i>0?o.size:1,narrate:this.strategy==="denormalized"&&t.table==="orders"?`denormalized: insert fans out to orders(primary) + orders_wide + user_spenders (${o.size} writes)`:`insert into ${t.table} touches ${o.size} table copy/copies`})}_runUpdate(t){const s=this._tablesForName(t.table);if(s.length===0)throw new Error(`unknown table: ${t.table}`);if(this.strategy==="federation"){const[i]=s;return Ae({shardsHit:[i.shard],tablesHit:[`${i.name}@${i.shard}`],rowsScanned:0,crossShardJoin:!1,latencyMsEst:le.write,resultCount:1,writeAmplification:1,narrate:`federation: single-db update on ${i.shard}.${i.name}`})}if(this.strategy==="horizontal"){if(t.table==="products"){const l=s.map(c=>c.shard),d=s.map(c=>`${c.name}@${c.shard}`);return Ae({shardsHit:l,tablesHit:d,rowsScanned:0,crossShardJoin:!1,latencyMsEst:l.length*le.write,resultCount:1,writeAmplification:l.length,narrate:`horizontal: products is replicated to every shard → update fans out to ${l.length} copies`})}if(t.whereCol==="user_id"&&t.whereVal!==void 0){const l=sr(t.whereVal)%this.shardCount;return Ae({shardsHit:[`shard-${l}`],tablesHit:[`${t.table}@shard-${l}`],rowsScanned:0,crossShardJoin:!1,latencyMsEst:le.write,resultCount:1,writeAmplification:1,narrate:`horizontal: single-shard update (shard-${l}) on shard key user_id=${t.whereVal}`})}const i=s.map(l=>l.shard),a=s.map(l=>`${l.name}@${l.shard}`);return Ae({shardsHit:i,tablesHit:a,rowsScanned:0,crossShardJoin:!1,latencyMsEst:i.length*le.write,resultCount:1,writeAmplification:i.length,narrate:`horizontal: no shard key in WHERE → broadcast update to ${i.length} shards`})}const r=new Set,o=new Set;return r.add("primary"),o.add(`${t.table}@primary`),t.table==="products"&&(r.add("read-db"),o.add("orders_wide@read-db")),t.table==="users"&&(r.add("read-db"),o.add("orders_wide@read-db"),o.add("user_spenders@read-db")),Ae({shardsHit:[...r],tablesHit:[...o],rowsScanned:0,crossShardJoin:!1,latencyMsEst:o.size*le.write,resultCount:1,writeAmplification:o.size,narrate:t.table==="products"?`denormalized: product columns are copied into orders_wide → update amplifies to ${o.size} tables`:t.table==="users"?`denormalized: user_name is duplicated → update touches primary + read-db copies (${o.size} tables)`:`denormalized: update on ${t.table} (${o.size} table)`})}}
function Vr(n){if(n===void 0)return;if(typeof n!="string")return n;if(n.startsWith("'")&&n.endsWith("'"))return n.slice(1,-1);const t=Number(n);return Number.isFinite(t)?t:n}
function Gr(n,t,s){return t?n.filter(r=>String(r[t])===String(s)).length:n.length}
function eo(n,t,s){const r=new Map(t.map(i=>[i.user_id,i]));let o=0;for(const i of n)r.has(i.user_id)&&(s.whereCol&&s.whereVal!==void 0&&(s.whereCol==="user_id"&&String(i.user_id)!==String(s.whereVal)||s.whereCol==="product_id"&&String(i.product_id)!==String(s.whereVal))||(o+=1));return o}
function Ae(n){return{shardsHit:n.shardsHit||[],tablesHit:n.tablesHit||[],rowsScanned:n.rowsScanned||0,crossShardJoin:!!n.crossShardJoin,latencyMsEst:Math.max(1,Math.round(n.latencyMsEst||1)),resultCount:n.resultCount??0,writeAmplification:n.writeAmplification||1,narrate:n.narrate||""}}
const Gi=[{id:"userProfile",label:"User's profile",sql:"SELECT * FROM users WHERE user_id = 1",hint:"Point lookup on a single user."},{id:"userOrders",label:"User's orders (indexed join)",sql:"SELECT o.*, u.name FROM orders o JOIN users u ON o.user_id = u.user_id WHERE user_id = 1",hint:"Join that is co-located under horizontal sharding (users/orders by user_id)."},{id:"ordersForProduct",label:"Total orders for product X",sql:"SELECT * FROM orders WHERE product_id = 101",hint:"Predicate NOT on the shard key under horizontal → scatter/gather."},{id:"topSpenders",label:"Top 10 spenders across all users",sql:"SELECT user_id, SUM(amount) FROM orders GROUP BY user_id ORDER BY SUM(amount) DESC LIMIT 10",hint:"Cross-shard aggregate. Denormalized has a pre-built user_spenders table."},{id:"updatePrice",label:"Update a product price",sql:"UPDATE products SET price = 99 WHERE product_id = 101",hint:"Write amplification: denormalized writes must update orders_wide too."}],nt="#0f1419",is="#1a1f2e",je="#2a2f3e",ze="#e6e6e6",Ce="#8a93a6",_t="#4a7cff",Cr="#f5c451",ur="#f66",vn="#5cd894",Da="#b084f9",nr={federation:_t,horizontal:vn,denormalized:Da};
function to(n){const t=[_t,vn,Da,"#ff9f5a","#52c8d7","#e870b8",Cr,"#6be0a2"];let s=0;for(let r=0;r<n.length;r++)s=s*31+n.charCodeAt(r)>>>0;return t[s%t.length]}
const Eh=[{name:"users",cols:[["user_id","int PK"],["name","text"],["country","text"]]},{name:"products",cols:[["product_id","int PK"],["name","text"],["price","int"]]},{name:"orders",cols:[["order_id","int PK"],["user_id","int → users"],["product_id","int → products"],["amount","int"]]}];
function zh(){const[n,t]=h.useState("federation"),[s,r]=h.useState(4),[o,i]=h.useState(Gi[0].sql),[a,l]=h.useState("Pick a strategy, pick a preset, and hit Run to see which shards the query touches."),[d,c]=h.useState(null),[p,m]=h.useState(0),g=h.useRef(null),[w,C]=h.useState(null);h.useEffect(()=>{g.current=new Vi({strategy:n,shardCount:s}),C(g.current.snapshot()),c(null)},[n,s]);const j=_=>{t(_),l(_==="federation"?"Federation: split by feature. Each table lives in its own DB. Joins across features = multiple round-trips.":_==="horizontal"?"Horizontal: one table spread across N shards by user_id. Queries on the shard key stay local; others fan out.":"Denormalized: duplicate columns to avoid joins. Reads are flat and fast; every write fans out to all copies.")},$=()=>{const _=g.current;if(_)try{c(null),_.query(o),C(_.snapshot()),m(x=>x+1);const b=_.lastQuery;l(b.narrate||"query executed")}catch(b){c(b.message),l(`parse error: ${b.message}`)}},O=()=>{g.current=new Vi({strategy:n,shardCount:s}),C(g.current.snapshot()),c(null),l("Store reset. Stats cleared.")},q=_=>{i(_.sql),l(_.hint)};if(!w)return e.jsx("div",{style:{color:ze,padding:16},children:"building schema…"});const R=w.lastQuery,D=new Set((R==null?void 0:R.shardsHit)||[]),B=new Set((R==null?void 0:R.tablesHit)||[]),V=new Map;for(const _ of w.tables)V.has(_.shard)||V.set(_.shard,[]),V.get(_.shard).push(_);const T=[...V.keys()];return e.jsxs("div",{className:"sq-root",children:[e.jsx("style",{children:Oh}),e.jsxs("div",{className:"sq-panel",children:[e.jsxs("div",{className:"sq-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"sq-title",children:"SQL Sharding Strategies — System Design Primer"}),e.jsx("div",{className:"sq-subtitle",children:"Federation vs Horizontal vs Denormalized · application-level schema trade-offs"})]}),e.jsxs("div",{className:"sq-title-controls",children:[e.jsx("span",{className:"sq-label",children:"Strategy:"}),e.jsx("span",{className:"sq-toggle",children:["federation","horizontal","denormalized"].map(_=>e.jsx("button",{className:"sq-toggle-opt"+(n===_?" active":""),style:{background:n===_?nr[_]:"transparent",color:n===_?nt:Ce},onClick:()=>j(_),children:_},_))}),n==="horizontal"&&e.jsxs("label",{className:"sq-label",children:["Shards: ",e.jsxs("select",{value:s,onChange:_=>r(Number(_.target.value)),children:[e.jsx("option",{value:2,children:"2"}),e.jsx("option",{value:4,children:"4"}),e.jsx("option",{value:8,children:"8"})]})]}),e.jsx("button",{className:"sq-btn sq-btn-ghost",onClick:O,children:"Reset stats"})]})]}),e.jsxs("div",{className:"sq-columns",children:[e.jsxs("div",{className:"sq-col",children:[e.jsx("div",{className:"sq-col-title",children:"1. Logical schema"}),e.jsx("div",{className:"sq-col-sub",children:"normalized · the way the app thinks"}),Eh.map(_=>e.jsxs("div",{className:"sq-logical-tbl",children:[e.jsx("div",{className:"sq-logical-hd",children:_.name}),_.cols.map(([b,x])=>e.jsxs("div",{className:"sq-logical-col",children:[e.jsx("span",{className:"sq-mono",children:b}),e.jsx("span",{className:"sq-col-type",children:x})]},b))]},_.name)),e.jsxs("div",{className:"sq-fk-note",children:["orders.user_id → users.user_id",e.jsx("br",{}),"orders.product_id → products.product_id"]})]}),e.jsxs("div",{className:"sq-col",children:[e.jsxs("div",{className:"sq-col-title",children:["2. Physical layout  ",e.jsx("span",{className:"sq-strategy-pill",style:{background:nr[n],color:nt},children:n})]}),e.jsxs("div",{className:"sq-col-sub",children:[n==="federation"&&"one DB per feature · joins across features = cross-DB round-trips",n==="horizontal"&&`${s} shards · users & orders co-located by user_id · products replicated`,n==="denormalized"&&"primary normalized copies + read-db with flattened orders_wide & user_spenders"]}),e.jsx("div",{className:"sq-shards",children:T.map(_=>{const b=V.get(_),x=D.has(_);return e.jsxs("div",{className:"sq-shard"+(x?" sq-shard-hit":""),style:{borderTop:`3px solid ${to(_)}`},children:[e.jsxs("div",{className:"sq-shard-hd",children:[e.jsx("span",{className:"sq-shard-name",style:{color:to(_)},children:_}),e.jsxs("span",{className:"sq-shard-sub",children:[b.length," table",b.length===1?"":"s"]})]}),b.map(f=>{const u=`${f.name}@${f.shard}`,y=B.has(u);return e.jsxs("div",{className:"sq-tbl"+(y?" sq-tbl-hit":""),"data-flash":y?p:0,children:[e.jsxs("div",{className:"sq-tbl-hd",children:[e.jsx("span",{className:"sq-tbl-name",children:f.name}),e.jsxs("span",{className:"sq-tbl-rows",children:[f.rows," rows"]})]}),f.sample.length>0&&e.jsxs("div",{className:"sq-tbl-sample",children:[f.sample.slice(0,3).map((v,I)=>e.jsx("div",{className:"sq-tbl-row",children:Ph(v)},I)),f.rows>f.sample.length&&e.jsxs("div",{className:"sq-tbl-more",children:["… +",f.rows-f.sample.length]})]})]},u)})]},_)})})]}),e.jsxs("div",{className:"sq-col",children:[e.jsx("div",{className:"sq-col-title",children:"3. Query runner"}),e.jsx("div",{className:"sq-col-sub",children:"tiny SQL parser · per-query fan-out"}),e.jsx("div",{className:"sq-presets",children:Gi.map(_=>e.jsx("button",{className:"sq-preset",onClick:()=>q(_),title:_.hint,children:_.label},_.id))}),e.jsx("textarea",{className:"sq-sql",value:o,onChange:_=>i(_.target.value),spellCheck:!1,rows:4}),e.jsxs("div",{className:"sq-run-row",children:[e.jsx("button",{className:"sq-btn sq-btn-run",onClick:$,children:"Run Query ▶"}),d&&e.jsx("span",{className:"sq-err",children:d})]}),R&&e.jsxs("div",{className:"sq-lastq",children:[e.jsx("div",{className:"sq-lastq-hd",children:"last query"}),e.jsx("div",{className:"sq-mini sq-mono sq-lastq-sql",children:R.sql}),e.jsxs("div",{className:"sq-lastq-grid",children:[e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"shards hit"}),e.jsx("span",{className:"sq-v",children:R.shardsHit.length})]}),e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"tables hit"}),e.jsx("span",{className:"sq-v",children:R.tablesHit.length})]}),e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"rows scanned"}),e.jsx("span",{className:"sq-v",children:R.rowsScanned})]}),e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"cross-shard join"}),e.jsx("span",{className:"sq-v",style:{color:R.crossShardJoin?ur:vn},children:R.crossShardJoin?"yes":"no"})]}),e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"latency est"}),e.jsxs("span",{className:"sq-v",children:[R.latencyMsEst," ms"]})]}),e.jsxs("div",{children:[e.jsx("span",{className:"sq-k",children:"write amp"}),e.jsxs("span",{className:"sq-v",style:{color:R.writeAmplification>1?Cr:Ce},children:["×",R.writeAmplification]})]})]}),e.jsx("div",{className:"sq-lastq-shards",children:R.shardsHit.map(_=>e.jsx("span",{className:"sq-chip",style:{background:to(_),color:nt},children:_},_))})]})]})]}),e.jsxs("div",{className:"sq-stats",children:[e.jsxs("span",{children:[e.jsx("strong",{children:"strategy"}),"=",w.strategy]}),e.jsxs("span",{children:[e.jsx("strong",{children:"physical tables"}),"=",w.tables.length]}),e.jsxs("span",{children:[e.jsx("strong",{children:"shards/dbs"}),"=",T.length]}),e.jsxs("span",{children:[e.jsx("strong",{children:"queries run"}),"=",w.stats.queries]}),e.jsxs("span",{children:[e.jsx("strong",{children:"Σ shards touched"}),"=",w.stats.totalShardsHit]}),e.jsxs("span",{style:{color:w.stats.writeAmplification>0?Cr:Ce},children:[e.jsx("strong",{children:"extra writes (amplification)"}),"=",w.stats.writeAmplification]})]}),e.jsxs("div",{className:"sq-teach",children:[e.jsxs("div",{className:"sq-teach-col",style:{borderLeftColor:nr.federation},children:[e.jsx("div",{className:"sq-teach-title",children:"Federation"}),e.jsxs("div",{className:"sq-teach-body",children:["Split by ",e.jsx("strong",{children:"feature"}),": users/products/orders each in its own DB.",e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Good for:"})," clean service boundaries, small teams owning one feature each, scaling writes per feature."]}),e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Bad for:"})," anything that joins across features — every cross-feature query becomes multi-RTT."]})]})]}),e.jsxs("div",{className:"sq-teach-col",style:{borderLeftColor:nr.horizontal},children:[e.jsx("div",{className:"sq-teach-title",children:"Horizontal sharding"}),e.jsxs("div",{className:"sq-teach-body",children:["Split ",e.jsx("strong",{children:"rows"})," of a table across N shards by a shard key (e.g. user_id).",e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Good for:"})," queries anchored to the shard key (huge user table, per-user feed). Co-locate related tables on the same key."]}),e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Bad for:"})," queries not anchored to the shard key → scatter-gather; global uniqueness & global ORDER BY are painful."]})]})]}),e.jsxs("div",{className:"sq-teach-col",style:{borderLeftColor:nr.denormalized},children:[e.jsx("div",{className:"sq-teach-title",children:"Denormalization"}),e.jsxs("div",{className:"sq-teach-body",children:[e.jsx("strong",{children:"Duplicate"})," hot columns into read-optimized tables to avoid joins.",e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Good for:"})," read-heavy hot paths (feeds, product cards, leaderboards) where point-lookups must be cheap."]}),e.jsxs("div",{className:"sq-teach-sub",children:[e.jsx("strong",{children:"Bad for:"})," write-heavy workloads: one logical write fans out; the copies can drift if the pipeline breaks."]})]})]})]}),e.jsxs("div",{className:"sq-status",children:[e.jsx("span",{className:"sq-status-dot"}),e.jsx("span",{className:"sq-status-text",children:a})]})]})]})}
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

export default zh;
export { zh as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(zh, {}));
  return () => root.unmount();
}
