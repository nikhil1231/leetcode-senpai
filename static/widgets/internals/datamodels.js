import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const os="#0f1419";
const gp="#1a1f2e";
const Xe="#2a2f3e";
const Pt="#e6e6e6";
const mt="#8a93a6";
const ot="#4a7cff";
const _p=`
.sw-root {
  color: ${Pt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${os};
}
.sw-panel {
  background: ${gp};
  border: 1px solid ${Xe};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1100px;
  margin: 0 auto;
}
.sw-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid ${Xe};
}
.sw-title {
  font-size: 18px;
  font-weight: 600;
  color: ${Pt};
}
.sw-subtitle {
  font-size: 12px;
  color: ${mt};
  margin-top: 2px;
}
.sw-title-controls { display: flex; gap: 8px; }
.sw-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${Xe};
}
.sw-group-label {
  color: ${mt};
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  margin-right: 2px;
}
.sw-label {
  color: ${mt};
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}
.sw-label select, .sw-input {
  background: ${os};
  border: 1px solid ${Xe};
  color: ${Pt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
}
.sw-input:focus, .sw-label select:focus {
  outline: none;
  border-color: ${ot};
}
.sw-unit {
  color: ${mt};
  font-size: 11px;
  margin-left: 3px;
}
.sw-btn {
  padding: 5px 12px;
  background: ${ot};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.sw-btn:hover { filter: brightness(1.15); }
.sw-btn-ghost {
  background: transparent;
  border: 1px solid ${Xe};
  color: ${Pt};
}
.sw-sep {
  width: 1px;
  height: 22px;
  background: ${Xe};
  margin: 0 4px;
}
.sw-chip {
  padding: 4px 12px;
  background: ${os};
  border: 1px solid ${Xe};
  color: ${Pt};
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.sw-chip:hover {
  border-color: ${ot};
  color: ${ot};
}
.sw-section {
  padding: 12px 0;
  border-bottom: 1px dashed ${Xe};
}
.sw-section:last-of-type { border-bottom: none; }
.sw-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${mt};
  margin-bottom: 8px;
  font-weight: 600;
}
.sw-section-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: ${mt};
  margin-left: 8px;
}
.sw-timeline-wrap {
  overflow-x: auto;
  border: 1px solid ${Xe};
  border-radius: 6px;
  background: ${os};
}
.sw-timeline {
  display: block;
  cursor: crosshair;
}
.sw-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 11px;
  color: ${mt};
}
.sw-legend-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.sw-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.sw-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${os};
  border: 1px solid ${Xe};
  border-radius: 6px;
  font-size: 12px;
  color: ${mt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sw-stats strong { color: ${Pt}; font-weight: 600; margin-right: 2px; }
.sw-log {
  margin-top: 8px;
  padding: 8px 12px;
  background: ${os};
  border: 1px solid ${Xe};
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  max-height: 120px;
  overflow-y: auto;
}
.sw-log-line {
  color: ${Pt};
  padding: 2px 0;
  line-height: 1.4;
  border-bottom: 1px dotted ${Xe};
}
.sw-log-line:last-child { border-bottom: none; }
.sw-log-muted { color: ${mt}; }
.sw-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${os};
  border-left: 3px solid ${ot};
  border-radius: 4px;
  font-size: 12px;
  color: ${Pt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sw-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${ot};
  box-shadow: 0 0 8px ${ot};
  flex-shrink: 0;
}
`,he={users:[{user_id:251,first_name:"Bill",last_name:"Gates",region_id:"us:wa",industry_id:131},{user_id:252,first_name:"Barack",last_name:"Obama",region_id:"us:il",industry_id:140},{user_id:253,first_name:"Melinda",last_name:"Gates",region_id:"us:wa",industry_id:131},{user_id:254,first_name:"Satya",last_name:"Nadella",region_id:"us:wa",industry_id:131}],regions:[{region_id:"us:wa",name:"Greater Seattle Area",country:"US"},{region_id:"us:il",name:"Greater Chicago Area",country:"US"}],positions:[{position_id:1,user_id:251,job_title:"Co-founder, Chairman",org:"Microsoft",start:1975,end:2014},{position_id:2,user_id:251,job_title:"Co-chair",org:"Bill & Melinda Gates Foundation",start:2e3,end:null},{position_id:3,user_id:252,job_title:"President",org:"United States",start:2009,end:2017},{position_id:4,user_id:252,job_title:"Senator",org:"United States",start:2005,end:2008},{position_id:5,user_id:253,job_title:"Co-chair",org:"Bill & Melinda Gates Foundation",start:2e3,end:null},{position_id:6,user_id:253,job_title:"Product Manager",org:"Microsoft",start:1987,end:1996},{position_id:7,user_id:254,job_title:"CEO",org:"Microsoft",start:2014,end:null},{position_id:8,user_id:254,job_title:"VP, Cloud",org:"Microsoft",start:2011,end:2014}],education:[{edu_id:1,user_id:251,school:"Harvard University",degree:null},{edu_id:2,user_id:251,school:"Lakeside School, Seattle",degree:null},{edu_id:3,user_id:252,school:"Columbia University",degree:"BA"},{edu_id:4,user_id:252,school:"Harvard Law School",degree:"JD"},{edu_id:5,user_id:253,school:"Duke University",degree:"BA"},{edu_id:6,user_id:254,school:"University of Chicago",degree:"MBA"}],contacts:[{contact_id:1,user_id:251,type:"blog",detail:"https://thegatesnotes.com"},{contact_id:2,user_id:251,type:"twitter",detail:"@BillGates"},{contact_id:3,user_id:252,type:"twitter",detail:"@BarackObama"},{contact_id:4,user_id:253,type:"twitter",detail:"@melindagates"},{contact_id:5,user_id:254,type:"twitter",detail:"@satyanadella"}]};
function Rp(){return he.users.map(n=>{const t=he.regions.find(s=>s.region_id===n.region_id)||null;return{user_id:n.user_id,first_name:n.first_name,last_name:n.last_name,region:t,positions:he.positions.filter(s=>s.user_id===n.user_id).map(s=>({job_title:s.job_title,org:s.org,start:s.start,end:s.end})),education:he.education.filter(s=>s.user_id===n.user_id).map(s=>({school:s.school,degree:s.degree})),contacts:he.contacts.filter(s=>s.user_id===n.user_id).map(s=>({type:s.type,detail:s.detail}))}})}
const Me=Rp();
function Tp(){const n=[],t=[];let s=1;for(const a of he.users)n.push({id:`u${a.user_id}`,labels:["User","Person"],props:{name:`${a.first_name} ${a.last_name}`,first_name:a.first_name,user_id:a.user_id}});const r=new Set;for(const a of he.regions)n.push({id:`r${a.region_id.replace(":","_")}`,labels:["Region","Location"],props:{name:a.name,region_id:a.region_id,country:a.country}}),r.has(a.country)||(r.add(a.country),n.push({id:`c${a.country}`,labels:["Country","Location"],props:{name:a.country}})),t.push({id:s++,from:`r${a.region_id.replace(":","_")}`,to:`c${a.country}`,label:"WITHIN",props:{}});const o=new Set;for(const a of he.positions)o.has(a.org)||(o.add(a.org),n.push({id:`o${a.org.replace(/[^A-Za-z0-9]/g,"_")}`,labels:["Organization"],props:{name:a.org}}));const i=new Set;for(const a of he.education)i.has(a.school)||(i.add(a.school),n.push({id:`s${a.school.replace(/[^A-Za-z0-9]/g,"_")}`,labels:["School"],props:{name:a.school}}));for(const a of he.users)t.push({id:s++,from:`u${a.user_id}`,to:`r${a.region_id.replace(":","_")}`,label:"LIVES_IN",props:{}});for(const a of he.positions)t.push({id:s++,from:`u${a.user_id}`,to:`o${a.org.replace(/[^A-Za-z0-9]/g,"_")}`,label:"WORKED_AT",props:{job_title:a.job_title,start:a.start,end:a.end}});for(const a of he.education)t.push({id:s++,from:`u${a.user_id}`,to:`s${a.school.replace(/[^A-Za-z0-9]/g,"_")}`,label:"STUDIED_AT",props:{degree:a.degree}});return{nodes:n,edges:t}}
const it=Tp(),Vs={billsPositions:{label:"Bill's positions (one-to-many)",sql:"SELECT org FROM positions WHERE user_id=251",doc:"users[user_id=251].positions[].org",cypher:"MATCH (u:User {name:'Bill Gates'})-[:WORKED_AT]->(o) RETURN o.name"},microsoftPeople:{label:"People at Microsoft (many-to-many)",sql:"SELECT first_name FROM users JOIN positions ON users.user_id=positions.user_id WHERE org='Microsoft'",doc:"users[positions.org=Microsoft].first_name",cypher:"MATCH (u:User)-[:WORKED_AT]->(o:Organization {name:'Microsoft'}) RETURN u.first_name"},sameRegion:{label:"People in Bill's region (indirect join)",sql:"SELECT first_name FROM users WHERE region_id=(SELECT region_id FROM users WHERE first_name='Bill')",doc:"users[region.name=users[first_name=Bill].region.name].first_name",cypher:"MATCH (bill:User {first_name:'Bill'})-[:LIVES_IN]->(r)<-[:LIVES_IN]-(p:User) RETURN p.first_name"}};
function Oo(){return{rowsScanned:0,docsScanned:0,edgesTraversed:0}}
function Mp(n){const t=n.match(/^SELECT\s+([A-Za-z_*]+)\s+FROM\s+([A-Za-z_]+)\s+WHERE\s+([A-Za-z_]+)\s*=\s*(.+)$/i);return t?{type:"simple",select:t[1],table:t[2],whereCol:t[3],whereVal:Lo(t[4])}:null}
function Ap(n){const t=n.match(/^SELECT\s+([A-Za-z_*]+)\s+FROM\s+([A-Za-z_]+)\s+JOIN\s+([A-Za-z_]+)\s+ON\s+[A-Za-z_.]+\s*=\s*[A-Za-z_.]+\s+WHERE\s+([A-Za-z_]+)\s*=\s*(.+)$/i);return t?{type:"join",select:t[1],table1:t[2],table2:t[3],whereCol:t[4],whereVal:Lo(t[5])}:null}
function Ip(n){const t=n.match(/^SELECT\s+([A-Za-z_*]+)\s+FROM\s+users\s+WHERE\s+([A-Za-z_]+)\s*=\s*\(\s*SELECT\s+([A-Za-z_]+)\s+FROM\s+users\s+WHERE\s+([A-Za-z_]+)\s*=\s*(.+?)\s*\)\s*$/i);return!t||t[2].toLowerCase()!==t[3].toLowerCase()?null:{type:"subquery",select:t[1],outerOn:t[2],innerCol:t[4],innerVal:Lo(t[5])}}
function Lo(n){const t=n.trim().replace(/;$/,"").trim();return/^'.*'$/.test(t)||/^".*"$/.test(t)?t.slice(1,-1):/^-?\d+$/.test(t)?parseInt(t,10):t}
function Ai(n){const t=String(n||"").trim().replace(/;$/,"").trim(),s=Oo(),r=[],o={users:new Set,positions:new Set,education:new Set,contacts:new Set,regions:new Set};if(!t)return{result:[],cost:s,trace:["(empty query)"],touched:o,error:"empty query"};let i=Ip(t)||Ap(t)||Mp(t);if(!i)return{result:[],cost:s,trace:["parse error — this toy SQL only supports the three preset shapes."],touched:o,error:"parse error"};if(i.type==="simple"){const c=he[i.table]||[];r.push(`scan ${i.table} (${c.length} rows)`),s.rowsScanned+=c.length;const p=[];for(const m of c)(o[i.table]||(o[i.table]=new Set)).add(m.position_id||m.user_id||m.region_id||m.edu_id||m.contact_id),m[i.whereCol]==i.whereVal&&p.push(i.select==="*"?m:m[i.select]);return{result:p,cost:s,trace:r,touched:o}}if(i.type==="join"){const c=he[i.table1]||[],p=he[i.table2]||[];r.push(`scan ${i.table2} (${p.length} rows) filter by ${i.whereCol}=${JSON.stringify(i.whereVal)}`),s.rowsScanned+=p.length;const m=new Set;for(const w of p)o[i.table2].add(w.position_id||w.user_id||w.edu_id||w.contact_id),w[i.whereCol]==i.whereVal&&m.add(w.user_id);r.push(`probe ${i.table1} by user_id for ${m.size} matches`),s.rowsScanned+=c.length;const g=[];for(const w of c)o[i.table1].add(w.user_id),m.has(w.user_id)&&g.push(i.select==="*"?w:w[i.select]);return{result:g,cost:s,trace:r,touched:o}}const a=he.users;r.push(`inner scan users (${a.length} rows) WHERE ${i.innerCol}=${JSON.stringify(i.innerVal)}`),s.rowsScanned+=a.length;let l=null;for(const c of a)o.users.add(c.user_id),c[i.innerCol]==i.innerVal&&(l=c[i.outerOn]);r.push(`outer scan users (${a.length} rows) WHERE ${i.outerOn}=${JSON.stringify(l)}`),s.rowsScanned+=a.length;const d=[];for(const c of a)o.users.add(c.user_id),c[i.outerOn]===l&&d.push(i.select==="*"?c:c[i.select]);return{result:d,cost:s,trace:r,touched:o}}
function st(n,t){const s=t.split(".");let r=n;for(const o of s){if(r==null)return;r=r[o]}return r}
function Gs(n,t){return String(n)===String(t)}
function Ii(n){const t=String(n||"").trim(),s=Oo(),r=[],o={docs:new Set};if(!t)return{result:[],cost:s,trace:["(empty path)"],touched:o,error:"empty path"};const i=t.match(/^users\[([A-Za-z_.]+)=users\[([A-Za-z_.]+)=([^\]]+)\]\.([A-Za-z_.]+)\]\.([A-Za-z_.]+)$/);if(i){const[,c,p,m,g,w]=i;r.push(`inner: scan documents (${Me.length}) where ${p}=${m}`),s.docsScanned+=Me.length;let C;for(const $ of Me)if(o.docs.add($.user_id),Gs(st($,p),m)){C=st($,g);break}if(C===void 0)return r.push("inner lookup returned nothing — stopping."),{result:[],cost:s,trace:r,touched:o};r.push(`outer: scan documents (${Me.length}) where ${c}=${JSON.stringify(C)}`),s.docsScanned+=Me.length;const j=[];for(const $ of Me)if(o.docs.add($.user_id),Gs(st($,c),C)){const O=st($,w);O!==void 0&&j.push(O)}return{result:j,cost:s,trace:r,touched:o}}const a=t.match(/^users\[([A-Za-z_.]+)=([^\]]+)\]\.([A-Za-z_.]+)\[\]\.([A-Za-z_.]+)$/);if(a){const[,c,p,m,g]=a;r.push(`scan documents (${Me.length}) where ${c}=${p}`),s.docsScanned+=Me.length;const w=[];for(const C of Me)if(o.docs.add(C.user_id),Gs(st(C,c),p)){const j=st(C,m);if(Array.isArray(j)){r.push(`doc user_id=${C.user_id} → dive into ${m}[] (${j.length} items)`);for(const $ of j){const O=st($,g);O!==void 0&&w.push(O)}}}return{result:w,cost:s,trace:r,touched:o}}const l=t.match(/^users\[([A-Za-z_]+)\.([A-Za-z_.]+)=([^\]]+)\]\.([A-Za-z_.]+)$/);if(l){const[,c,p,m,g]=l;r.push(`scan documents (${Me.length}) filter by ${c}[].${p}=${m}`),s.docsScanned+=Me.length;const w=[];for(const C of Me){o.docs.add(C.user_id);const j=st(C,c);if(Array.isArray(j)&&j.some(O=>Gs(st(O,p),m))){const O=st(C,g);O!==void 0&&w.push(O)}}return{result:w,cost:s,trace:r,touched:o}}const d=t.match(/^users\[([A-Za-z_.]+)=([^\]]+)\]\.([A-Za-z_.]+)$/);if(d){const[,c,p,m]=d;r.push(`scan documents (${Me.length}) where ${c}=${p}`),s.docsScanned+=Me.length;const g=[];for(const w of Me)if(o.docs.add(w.user_id),Gs(st(w,c),p)){const C=st(w,m);C!==void 0&&g.push(C)}return{result:g,cost:s,trace:r,touched:o}}return{result:[],cost:s,trace:["parse error — this toy dot-path supports only users[...].field shapes."],touched:o,error:"parse error"}}
function Ys(n){const t=n.match(/^\(([A-Za-z_]*)(?::([A-Za-z_]+))?(?:\s*\{([^}]*)\})?\)$/);if(!t)return null;const[,s,r,o]=t,i={};if(o){const a=/([A-Za-z_]+)\s*:\s*('[^']*'|"[^"]*"|[0-9]+)/g;let l;for(;(l=a.exec(o))!==null;){let d=l[2];/^'.*'$/.test(d)||/^".*"$/.test(d)?d=d.slice(1,-1):d=parseInt(d,10),i[l[1]]=d}}return{name:s||null,label:r||null,props:i}}
function Xs(n,t){if(t.label&&!n.labels.includes(t.label))return!1;for(const[s,r]of Object.entries(t.props))if(String(n.props[s])!==String(r))return!1;return!0}
function Ep(n){const t=n.replace(/\s+/g," ").trim(),s=t.match(/^MATCH\s+(\([^)]*\))\s*-\[:([A-Za-z_]+)\]->\s*(\([^)]*\))\s+RETURN\s+([A-Za-z_]+)\.([A-Za-z_]+)$/i);if(s)return{type:"pair",left:Ys(s[1]),rel:s[2],right:Ys(s[3]),returnName:s[4],returnProp:s[5]};const r=t.match(/^MATCH\s+(\([^)]*\))\s*-\[:([A-Za-z_]+)\]->\s*(\([^)]*\))\s*<-\[:([A-Za-z_]+)\]-\s*(\([^)]*\))\s+RETURN\s+([A-Za-z_]+)\.([A-Za-z_]+)$/i);return r?{type:"triple",left:Ys(r[1]),rel1:r[2],mid:Ys(r[3]),rel2:r[4],right:Ys(r[5]),returnName:r[6],returnProp:r[7]}:null}
function Ei(n){const t=String(n||"").trim(),s=Oo(),r=[],o={nodes:new Set,edges:new Set};if(!t)return{result:[],cost:s,trace:["(empty query)"],touched:o,error:"empty query"};const i=Ep(t);if(!i)return{result:[],cost:s,trace:["parse error — this toy Cypher only supports two pattern shapes."],touched:o,error:"parse error"};const{nodes:a,edges:l}=it;if(i.type==="pair"){const p=Object.keys(i.left.props).length,m=Object.keys(i.right.props).length,g=p>=m,w=g?i.left:i.right,C=g?i.right:i.left,j=a.filter(R=>Xs(R,w));for(const R of j)o.nodes.add(R.id);r.push(`anchor :${w.label||"*"} ${JSON.stringify(w.props)} → ${j.length} node(s)`);const $=[],O=g&&i.returnName===i.right.name||!g&&i.returnName===i.left.name,q=new Set;for(const R of j){const D=l.filter(B=>B.label===i.rel&&(g?B.from===R.id:B.to===R.id));s.edgesTraversed+=D.length;for(const B of D)o.edges.add(B.id);r.push(`from ${R.props.name}: traverse ${D.length} :${i.rel} edges`);for(const B of D){const V=g?B.to:B.from,T=a.find(_=>_.id===V);if(T&&(o.nodes.add(T.id),Xs(T,C))){const b=(i.returnName===i.left.name?g?R:T:i.returnName===i.right.name?g?T:R:T).props[i.returnProp];if(b===void 0)continue;const x=O?`${T.id}|${b}`:`${R.id}|${T.id}|${b}`;if(q.has(x))continue;q.add(x),$.push(b)}}}return{result:$,cost:s,trace:r,touched:o}}const d=a.filter(p=>Xs(p,i.left));for(const p of d)o.nodes.add(p.id);r.push(`anchor :${i.left.label||"*"} ${JSON.stringify(i.left.props)} → ${d.length} node(s)`);const c=[];for(const p of d){const m=l.filter(g=>g.label===i.rel1&&g.from===p.id);s.edgesTraversed+=m.length;for(const g of m)o.edges.add(g.id);r.push(`from ${p.props.name}: traverse ${m.length} :${i.rel1} edges`);for(const g of m){const w=a.find(j=>j.id===g.to);if(!w||!Xs(w,i.mid))continue;o.nodes.add(w.id);const C=l.filter(j=>j.label===i.rel2&&j.to===w.id);s.edgesTraversed+=C.length;for(const j of C)o.edges.add(j.id);r.push(`  via ${w.props.name}: traverse ${C.length} inbound :${i.rel2} edges`);for(const j of C){const $=a.find(R=>R.id===j.from);if(!$||!Xs($,i.right)||(o.nodes.add($.id),$.id===p.id))continue;const q=(i.returnName===i.left.name?p:i.returnName===i.right.name?$:i.returnName===i.mid.name?w:$).props[i.returnProp];q!==void 0&&c.push(q)}}}return{result:c,cost:s,trace:r,touched:o}}
const Kt="#0f1419",js="#1a1f2e",xe="#2a2f3e",ge="#e6e6e6",gt="#8a93a6",Be="#4a7cff",Qt="#f5c451",hr="#f66",Fo="#5cd894",hn="#b084f9",Is="#52c8d7";
function zp(n){return n==null?"—":typeof n=="string"?n:String(n)}
function qn(n){if(!n)return 0;let t=0;for(const s of Object.values(n))s instanceof Set&&(t+=s.size);return t}
function Js({name:n,rows:t,highlight:s,idKey:r}){if(!t||t.length===0)return null;const o=Object.keys(t[0]);return e.jsxs("div",{className:"dm-rel-table",children:[e.jsxs("div",{className:"dm-rel-title",children:[e.jsx("span",{className:"dm-mono",style:{color:Be},children:n}),e.jsxs("span",{className:"dm-mini",children:[t.length," rows"]})]}),e.jsx("div",{className:"dm-rel-scroll",children:e.jsxs("table",{className:"dm-tbl",children:[e.jsx("thead",{children:e.jsx("tr",{children:o.map(i=>e.jsx("th",{children:i},i))})}),e.jsx("tbody",{children:t.map(i=>{const a=i[r],l=s&&s.has(a);return e.jsx("tr",{className:l?"dm-tr-hot":"",children:o.map(d=>e.jsx("td",{children:zp(i[d])},d))},a)})})]})})]})}
function Pp({touched:n}){return e.jsxs("div",{className:"dm-col",children:[e.jsxs("div",{className:"dm-col-head",children:[e.jsx("div",{className:"dm-col-title",children:"Relational"}),e.jsx("div",{className:"dm-col-sub",children:"normalized tables + joins"})]}),e.jsxs("div",{className:"dm-col-body",children:[e.jsx(Js,{name:"users",rows:he.users,highlight:n==null?void 0:n.users,idKey:"user_id"}),e.jsx(Js,{name:"regions",rows:he.regions,highlight:n==null?void 0:n.regions,idKey:"region_id"}),e.jsx(Js,{name:"positions",rows:he.positions,highlight:n==null?void 0:n.positions,idKey:"position_id"}),e.jsx(Js,{name:"education",rows:he.education,highlight:n==null?void 0:n.education,idKey:"edu_id"}),e.jsx(Js,{name:"contacts",rows:he.contacts,highlight:n==null?void 0:n.contacts,idKey:"contact_id"})]})]})}
function So({value:n,indent:t=0,collapsed:s,toggleKey:r,expandedSet:o}){const i={paddingLeft:t*10};if(n===null)return e.jsx("span",{style:{color:gt},children:"null"});if(typeof n=="string")return e.jsxs("span",{style:{color:Fo},children:['"',n,'"']});if(typeof n=="number"||typeof n=="boolean")return e.jsx("span",{style:{color:Qt},children:String(n)});if(Array.isArray(n)){const c=`${r}[]`,p=o.has(c);return e.jsxs("span",{children:[e.jsxs("span",{className:"dm-json-toggle",onClick:()=>s(c),title:"toggle",children:[p?"▾":"▸"," ["]}),p&&e.jsx("div",{children:n.map((m,g)=>e.jsxs("div",{style:i,className:"dm-json-row",children:[e.jsx(So,{value:m,indent:t+1,collapsed:s,toggleKey:`${c}.${g}`,expandedSet:o}),g<n.length-1?",":""]},g))}),e.jsx("span",{style:i,children:"]"})]})}const a=Object.keys(n),l=`${r}{}`,d=o.has(l);return e.jsxs("span",{children:[e.jsxs("span",{className:"dm-json-toggle",onClick:()=>s(l),title:"toggle",children:[d?"▾":"▸"," ","{"]}),d&&e.jsx("div",{children:a.map((c,p)=>e.jsxs("div",{style:i,className:"dm-json-row",children:[e.jsxs("span",{style:{color:Be},children:['"',c,'"']}),e.jsx("span",{style:{color:gt},children:": "}),e.jsx(So,{value:n[c],indent:t+1,collapsed:s,toggleKey:`${l}.${c}`,expandedSet:o}),p<a.length-1?",":""]},c))}),e.jsx("span",{style:i,children:"}"})]})}
function Op({touched:n}){const t=n==null?void 0:n.docs,[s,r]=h.useState(()=>{const i=new Set;return Me.forEach(a=>{i.add(`d${a.user_id}{}`),i.add(`d${a.user_id}{}.positions[]`)}),i}),o=i=>{r(a=>{const l=new Set(a);return l.has(i)?l.delete(i):l.add(i),l})};return e.jsxs("div",{className:"dm-col",children:[e.jsxs("div",{className:"dm-col-head",children:[e.jsx("div",{className:"dm-col-title",children:"Document"}),e.jsx("div",{className:"dm-col-sub",children:"one nested JSON per user"})]}),e.jsx("div",{className:"dm-col-body",children:Me.map(i=>e.jsxs("div",{className:"dm-doc"+(t&&t.has(i.user_id)?" dm-doc-hot":""),children:[e.jsxs("div",{className:"dm-doc-head",children:[e.jsxs("span",{className:"dm-mono",style:{color:hn},children:["doc user_id=",i.user_id]}),e.jsxs("span",{className:"dm-mini",children:[i.first_name," ",i.last_name]})]}),e.jsx("div",{className:"dm-json",children:e.jsx(So,{value:i,collapsed:o,toggleKey:`d${i.user_id}`,expandedSet:s})})]},i.user_id))})]})}
function Lp(){const n={};return it.nodes.filter(l=>l.labels.includes("User")).forEach((l,d)=>{n[l.id]={x:90,y:60+d*60}}),it.nodes.filter(l=>l.labels.includes("Organization")).forEach((l,d)=>{n[l.id]={x:290,y:50+d*60}}),it.nodes.filter(l=>l.labels.includes("School")).forEach((l,d)=>{n[l.id]={x:470,y:40+d*55}}),it.nodes.filter(l=>l.labels.includes("Region")).forEach((l,d)=>{n[l.id]={x:630,y:80+d*60}}),it.nodes.filter(l=>l.labels.includes("Country")).forEach((l,d)=>{n[l.id]={x:780,y:110+d*60}}),n}
function Fp(n){return n.includes("User")?Be:n.includes("Organization")?Qt:n.includes("School")?hn:n.includes("Region")?Fo:n.includes("Country")?Is:gt}
function Dp({touched:n}){const t=h.useMemo(Lp,[]),s=870,r=Math.max(...Object.values(t).map(d=>d.y),320)+50,[o,i]=h.useState(null),a=n==null?void 0:n.nodes,l=n==null?void 0:n.edges;return e.jsxs("div",{className:"dm-col",children:[e.jsxs("div",{className:"dm-col-head",children:[e.jsx("div",{className:"dm-col-title",children:"Graph"}),e.jsx("div",{className:"dm-col-sub",children:"nodes + labeled edges"})]}),e.jsx("div",{className:"dm-col-body",children:e.jsxs("div",{className:"dm-graph-wrap",children:[e.jsxs("svg",{width:s,height:r,style:{display:"block"},children:[it.edges.map(d=>{const c=t[d.from],p=t[d.to];if(!c||!p)return null;const m=l&&l.has(d.id),g=m?"dm-arrow-hot":"dm-arrow";return e.jsxs("g",{onMouseEnter:()=>{var w,C;return i({kind:"edge",label:d.label,from:(w=it.nodes.find(j=>j.id===d.from))==null?void 0:w.props.name,to:(C=it.nodes.find(j=>j.id===d.to))==null?void 0:C.props.name,props:d.props})},onMouseLeave:()=>i(null),children:[e.jsx("line",{x1:c.x,y1:c.y,x2:p.x,y2:p.y,stroke:m?hr:Is,strokeWidth:m?2.2:1,strokeOpacity:m?1:.45,markerEnd:`url(#${g})`}),e.jsxs("text",{x:(c.x+p.x)/2,y:(c.y+p.y)/2-3,fontSize:9,fill:m?hr:gt,textAnchor:"middle",fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",style:{pointerEvents:"none"},children:[":",d.label]})]},d.id)}),it.nodes.map(d=>{const c=t[d.id];if(!c)return null;const p=Fp(d.labels),m=a&&a.has(d.id),g=d.props.name||d.id;return e.jsxs("g",{onMouseEnter:()=>i({kind:"node",label:d.labels.join(":"),name:g,props:d.props}),onMouseLeave:()=>i(null),style:{cursor:"pointer"},children:[e.jsx("circle",{cx:c.x,cy:c.y,r:m?15:12,fill:p,fillOpacity:m?1:.85,stroke:m?hr:"#0006",strokeWidth:m?2:1}),e.jsx("text",{x:c.x,y:c.y+26,fontSize:10,textAnchor:"middle",fill:ge,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",children:g.length>18?g.slice(0,16)+"…":g})]},d.id)}),e.jsxs("defs",{children:[e.jsx("marker",{id:"dm-arrow",markerWidth:"8",markerHeight:"8",refX:"10",refY:"4",orient:"auto",children:e.jsx("path",{d:"M 0 0 L 8 4 L 0 8 z",fill:Is,opacity:.6})}),e.jsx("marker",{id:"dm-arrow-hot",markerWidth:"9",markerHeight:"9",refX:"10",refY:"4.5",orient:"auto",children:e.jsx("path",{d:"M 0 0 L 9 4.5 L 0 9 z",fill:hr})})]})]}),e.jsx("div",{className:"dm-graph-hover",children:o?o.kind==="node"?e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"dm-mono",style:{color:Be},children:[":",o.label]})," ",e.jsx("strong",{children:o.name}),e.jsxs("span",{className:"dm-mini",children:[" — props: ",JSON.stringify(o.props)]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"dm-mono",style:{color:Is},children:["[:",o.label,"]"]})," ",o.from," → ",o.to,Object.keys(o.props).length>0&&e.jsxs("span",{className:"dm-mini",children:[" ",JSON.stringify(o.props)]})]}):e.jsx("span",{className:"dm-mini",children:"hover a node or edge…"})})]})})]})}
function qp(n,t){var i,a,l,d,c,p;if(!t)return"Pick a preset or type a query, then Run to see which model wins.";const s=((a=(i=t.sql)==null?void 0:i.cost)==null?void 0:a.rowsScanned)||0,r=((d=(l=t.doc)==null?void 0:l.cost)==null?void 0:d.docsScanned)||0,o=((p=(c=t.cypher)==null?void 0:c.cost)==null?void 0:p.edgesTraversed)||0;return n==="billsPositions"?`One-to-many fetch: "Bill's positions" is a tree walk from a single root. Document wins — ${r} doc scanned vs ${s} row reads across 2 relational tables. Graph also traverses only ${o} edges.`:n==="microsoftPeople"?`Many-to-many: "who worked at X" needs a join. Relational uses a JOIN (${s} row reads); document must scan every user and dive into each positions[] array (${r} docs). Graph anchors on the Organization node and walks ${o} :WORKED_AT edges — no scan.`:n==="sameRegion"?`Indirect lookup: "same region as Bill" is a join through a reference. Relational does two scans (${s} row reads) — subquery then filter. Document must scan TWICE (${r} docs) because region is nested, not indexed. Graph just pivots on the region vertex: ${o} edges.`:o>0&&o<=s&&o<=r?`Custom query → graph traversed ${o} edges, cheapest of the three (SQL scanned ${s} rows; document scanned ${r} docs). This is a many-to-many / join-heavy shape.`:r>0&&r<=s?`Custom query → document scanned ${r} docs; SQL scanned ${s} rows. Self-contained profile reads favor the document model.`:`SQL scanned ${s} rows; document scanned ${r} docs; graph traversed ${o} edges.`}
function Wp(n){if(!n)return"No query run yet.";const t=n.sql,s=n.doc,r=n.cypher,o=[];return t&&o.push(`SQL: ${t.query} → scanned ${t.cost.rowsScanned} rows, returned ${t.result.length}`),s&&o.push(`Document: ${s.query} → ${s.cost.docsScanned} doc scan(s), ${s.result.length} value(s) returned`),r&&o.push(`Cypher: ${r.query} → ${r.cost.edgesTraversed} edge(s) traversed, ${r.result.length} result(s)`),o.join("  ·  ")}
function Bp(){var R,D,B,V,T,_;const[n,t]=h.useState(Vs.billsPositions.sql),[s,r]=h.useState(Vs.billsPositions.doc),[o,i]=h.useState(Vs.billsPositions.cypher),[a,l]=h.useState("billsPositions"),[d,c]=h.useState(null),p=(b={})=>{const x=Ai(b.sql??n),f=Ii(b.doc??s),u=Ei(b.cypher??o);c({sql:{query:b.sql??n,...x},doc:{query:b.doc??s,...f},cypher:{query:b.cypher??o,...u}})},m=b=>{const x=Vs[b];t(x.sql),r(x.doc),i(x.cypher),l(b),p({sql:x.sql,doc:x.doc,cypher:x.cypher})},g=b=>{if(b==="sql"){const x=Ai(n);c(f=>({...f||{doc:null,cypher:null},sql:{query:n,...x}}))}else if(b==="doc"){const x=Ii(s);c(f=>({...f||{sql:null,cypher:null},doc:{query:s,...x}}))}else if(b==="cypher"){const x=Ei(o);c(f=>({...f||{sql:null,doc:null},cypher:{query:o,...x}}))}l(null)},w=(R=d==null?void 0:d.sql)==null?void 0:R.touched,C=(D=d==null?void 0:d.doc)==null?void 0:D.touched,j=(B=d==null?void 0:d.cypher)==null?void 0:B.touched,$=d==null?void 0:d.sql,O=d==null?void 0:d.doc,q=d==null?void 0:d.cypher;return e.jsxs("div",{className:"dm-root",children:[e.jsx("style",{children:Hp}),e.jsxs("div",{className:"dm-panel",children:[e.jsxs("div",{className:"dm-title-row",children:[e.jsxs("div",{children:[e.jsx("div",{className:"dm-title",children:"Data Models — DDIA Ch 2"}),e.jsx("div",{className:"dm-subtitle",children:"Same dataset, three representations · relational vs document vs graph · SQL / dot-path / Cypher"})]}),e.jsx("div",{className:"dm-title-controls",children:e.jsxs("div",{className:"dm-mini",children:[he.users.length," users · ",it.nodes.length," nodes ·"," ",it.edges.length," edges"]})})]}),e.jsxs("div",{className:"dm-qpanel",children:[e.jsxs("div",{className:"dm-qpresets",children:[e.jsx("span",{className:"dm-lbl-mini",children:"preset:"}),Object.entries(Vs).map(([b,x])=>e.jsx("button",{className:"dm-btn dm-btn-ghost"+(a===b?" active":""),onClick:()=>m(b),title:x.label,children:x.label.split(" (")[0]},b)),e.jsx("span",{className:"dm-sep"}),e.jsx("button",{className:"dm-btn dm-btn-good",onClick:()=>p(),children:"Run All"})]}),e.jsxs("div",{className:"dm-qinputs",children:[e.jsxs("div",{className:"dm-qrow",children:[e.jsx("span",{className:"dm-lbl-mini",style:{color:Be},children:"SQL"}),e.jsx("input",{className:"dm-input",value:n,onChange:b=>{t(b.target.value),l(null)},spellCheck:!1}),e.jsx("button",{className:"dm-btn",onClick:()=>g("sql"),children:"Run"})]}),e.jsxs("div",{className:"dm-qrow",children:[e.jsx("span",{className:"dm-lbl-mini",style:{color:hn},children:"dot-path"}),e.jsx("input",{className:"dm-input",value:s,onChange:b=>{r(b.target.value),l(null)},spellCheck:!1}),e.jsx("button",{className:"dm-btn",onClick:()=>g("doc"),children:"Run"})]}),e.jsxs("div",{className:"dm-qrow",children:[e.jsx("span",{className:"dm-lbl-mini",style:{color:Is},children:"Cypher"}),e.jsx("input",{className:"dm-input",value:o,onChange:b=>{i(b.target.value),l(null)},spellCheck:!1}),e.jsx("button",{className:"dm-btn",onClick:()=>g("cypher"),children:"Run"})]})]})]}),e.jsxs("div",{className:"dm-result-row",children:[e.jsx(Wn,{name:"Relational",color:Be,costLabel:`${((V=$==null?void 0:$.cost)==null?void 0:V.rowsScanned)??0} rows scanned`,result:$,touchedCount:qn(w)}),e.jsx(Wn,{name:"Document",color:hn,costLabel:`${((T=O==null?void 0:O.cost)==null?void 0:T.docsScanned)??0} docs scanned`,result:O,touchedCount:qn(C)}),e.jsx(Wn,{name:"Graph",color:Is,costLabel:`${((_=q==null?void 0:q.cost)==null?void 0:_.edgesTraversed)??0} edges traversed`,result:q,touchedCount:qn(j)})]}),e.jsxs("div",{className:"dm-cols",children:[e.jsx(Pp,{touched:w}),e.jsx(Op,{touched:C}),e.jsx(Dp,{touched:j})]}),e.jsxs("div",{className:"dm-tradeoff",children:[e.jsx("div",{className:"dm-tradeoff-title",children:"Tradeoff (this query)"}),e.jsx("div",{className:"dm-tradeoff-body",children:qp(a,d)})]}),e.jsxs("div",{className:"dm-teach",children:[e.jsxs("div",{className:"dm-teach-col",children:[e.jsx("div",{className:"dm-teach-title",children:"Relational (SQL)"}),e.jsxs("div",{className:"dm-teach-body",children:["Normalized tables + joins. Wins on ",e.jsx("strong",{children:"many-to-many"}),"; query optimizer picks the access path. Cost for one-to-many is N × joins. See Figure 2-1."]})]}),e.jsxs("div",{className:"dm-teach-col",children:[e.jsx("div",{className:"dm-teach-title",children:"Document (JSON)"}),e.jsxs("div",{className:"dm-teach-body",children:["Self-contained tree per entity. Wins on ",e.jsx("strong",{children:"one-to-many locality"}),' (fetch a profile in one read). Many-to-many is "awkward" — every cross-reference means scanning all docs. See Example 2-1.']})]}),e.jsxs("div",{className:"dm-teach-col",children:[e.jsx("div",{className:"dm-teach-title",children:"Graph (Cypher)"}),e.jsxs("div",{className:"dm-teach-body",children:["Nodes + labeled edges. Wins on ",e.jsx("strong",{children:"highly-interconnected"}),'/ variable-depth traversals. Single-edge hops cost O(degree). Book: "for highly interconnected data, the document model is awkward, the relational model is acceptable, and graph models are the most natural."']})]}),e.jsxs("div",{className:"dm-teach-col",children:[e.jsx("div",{className:"dm-teach-title",children:"Declarative vs imperative"}),e.jsxs("div",{className:"dm-teach-body",children:["All three query languages here are ",e.jsx("strong",{children:"declarative"}),": you describe the pattern, the engine picks the access path. CODASYL/IMS forced you to code the traversal by hand."]})]})]}),e.jsxs("div",{className:"dm-status",children:[e.jsx("span",{className:"dm-status-dot"}),e.jsx("span",{className:"dm-status-text",children:Wp(d)})]})]})]})}
function Wn({name:n,color:t,costLabel:s,result:r,touchedCount:o}){var l;const i=r==null?void 0:r.error,a=((l=r==null?void 0:r.result)==null?void 0:l.length)??0;return e.jsxs("div",{className:"dm-rb",style:{borderLeftColor:t},children:[e.jsxs("div",{className:"dm-rb-head",children:[e.jsx("span",{className:"dm-mono",style:{color:t},children:n}),e.jsxs("span",{className:"dm-mini",children:[s," · ",o," touched"]})]}),e.jsx("div",{className:"dm-rb-body",children:i?e.jsxs("span",{style:{color:hr},children:["⚠ ",i]}):r?e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"dm-rb-count",children:[a," result",a===1?"":"s"]}),a>0&&e.jsxs("span",{className:"dm-rb-values",children:[r.result.slice(0,6).map((d,c)=>e.jsx("span",{className:"dm-pill",children:typeof d=="object"?JSON.stringify(d):String(d)},c)),a>6&&e.jsx("span",{className:"dm-mini",children:"…"})]})]}):e.jsx("span",{className:"dm-mini",children:"—"})})]})}
const Hp=`
.dm-root {
  color: ${ge};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Kt};
}
.dm-panel {
  background: ${js};
  border: 1px solid ${xe};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1600px;
  margin: 0 auto;
}
.dm-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${xe};
  flex-wrap: wrap;
}
.dm-title {
  font-size: 18px;
  font-weight: 600;
  color: ${ge};
}
.dm-subtitle {
  font-size: 12px;
  color: ${gt};
  margin-top: 2px;
}
.dm-title-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.dm-qpanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid ${xe};
}
.dm-qpresets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dm-qinputs {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dm-qrow {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dm-lbl-mini {
  color: ${gt};
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-width: 64px;
}
.dm-input {
  flex: 1;
  padding: 5px 8px;
  background: ${Kt};
  border: 1px solid ${xe};
  border-radius: 4px;
  color: ${ge};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-input:focus { outline: none; border-color: ${Be}; }
.dm-btn {
  padding: 5px 12px;
  background: ${Be};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
  transition: filter 0.15s;
}
.dm-btn:hover { filter: brightness(1.15); }
.dm-btn-good { background: ${Fo}; color: ${Kt}; }
.dm-btn-ghost {
  background: transparent;
  border: 1px solid ${xe};
  color: ${ge};
}
.dm-btn-ghost.active {
  border-color: ${Be};
  background: ${Be}22;
  color: ${ge};
}
.dm-sep {
  width: 1px;
  height: 20px;
  background: ${xe};
  margin: 0 4px;
}
.dm-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
}
.dm-mini {
  font-size: 11px;
  color: ${gt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dm-result-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${xe};
}
.dm-rb {
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Be};
  border-radius: 5px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dm-rb-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}
.dm-rb-body {
  font-size: 12px;
  color: ${ge};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dm-rb-count { color: ${ge}; font-weight: 600; }
.dm-rb-values { display: flex; gap: 4px; flex-wrap: wrap; }
.dm-pill {
  background: ${js};
  border: 1px solid ${xe};
  padding: 1px 6px;
  border-radius: 9px;
  font-size: 11px;
  color: ${ge};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dm-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px dashed ${xe};
  min-height: 440px;
}
.dm-col {
  background: ${Kt};
  border: 1px solid ${xe};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.dm-col-head {
  padding: 8px 10px;
  border-bottom: 1px solid ${xe};
  background: ${js};
}
.dm-col-title { font-weight: 700; font-size: 13px; color: ${ge}; }
.dm-col-sub { font-size: 11px; color: ${gt}; margin-top: 1px; }
.dm-col-body {
  padding: 8px 10px;
  overflow: auto;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Relational */
.dm-rel-table { display: flex; flex-direction: column; gap: 3px; }
.dm-rel-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 2px;
}
.dm-rel-scroll {
  overflow-x: auto;
  border: 1px solid ${xe};
  border-radius: 4px;
}
.dm-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-tbl th, .dm-tbl td {
  padding: 3px 6px;
  text-align: left;
  border-bottom: 1px solid ${xe};
  white-space: nowrap;
}
.dm-tbl th {
  color: ${gt};
  background: ${js};
  font-weight: 600;
}
.dm-tbl td { color: ${ge}; }
.dm-tbl tr.dm-tr-hot td {
  background: ${Qt}22;
  border-bottom-color: ${Qt}66;
  color: ${ge};
}

/* Document */
.dm-doc {
  border: 1px solid ${xe};
  border-radius: 4px;
  padding: 6px 8px;
  background: ${js};
  transition: border-color 0.2s, box-shadow 0.2s;
}
.dm-doc-hot {
  border-color: ${Qt};
  box-shadow: 0 0 0 1px ${Qt}44;
}
.dm-doc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
  padding-bottom: 3px;
  border-bottom: 1px dashed ${xe};
}
.dm-json {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: ${ge};
  line-height: 1.5;
}
.dm-json-row { padding-left: 8px; }
.dm-json-toggle {
  cursor: pointer;
  color: ${gt};
  user-select: none;
}
.dm-json-toggle:hover { color: ${ge}; }

/* Graph */
.dm-graph-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
}
.dm-graph-hover {
  margin-top: 4px;
  padding: 5px 8px;
  background: ${js};
  border: 1px solid ${xe};
  border-radius: 4px;
  font-size: 11px;
  color: ${ge};
  min-height: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Tradeoff + teaching + status */
.dm-tradeoff {
  margin-top: 12px;
  padding: 10px 14px;
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Qt};
  border-radius: 5px;
}
.dm-tradeoff-title {
  font-size: 11px;
  color: ${Qt};
  font-weight: 700;
  margin-bottom: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.dm-tradeoff-body {
  font-size: 12px;
  color: ${ge};
  line-height: 1.55;
}
.dm-teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.dm-teach-col {
  background: ${Kt};
  border: 1px solid ${xe};
  border-left: 3px solid ${Be};
  border-radius: 4px;
  padding: 8px 10px;
}
.dm-teach-title {
  font-size: 12px;
  font-weight: 700;
  color: ${ge};
  margin-bottom: 4px;
}
.dm-teach-body {
  font-size: 11px;
  color: ${gt};
  line-height: 1.5;
}
.dm-teach-body strong { color: ${ge}; }
.dm-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  background: ${Kt};
  border-left: 3px solid ${Be};
  border-radius: 4px;
  font-size: 11px;
  color: ${ge};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.55;
  word-break: break-word;
}
.dm-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${Be};
  box-shadow: 0 0 8px ${Be};
  flex-shrink: 0;
}
`;

export default Bp;
export { Bp as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Bp, {}));
  return () => root.unmount();
}
