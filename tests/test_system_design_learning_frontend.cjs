// Small browser-independent checks for the learning UI and recovery boundaries.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness(saved={}) {
 const storage=new Map(Object.entries(saved)),events={},timers=new Set();let counter=0;
 const root={querySelectorAll(){return [];},innerHTML:''};
 const context={crypto:webcrypto,performance:{now:()=>1000},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
   setInterval:()=>{const n=++counter;timers.add(n);return n;},clearInterval:n=>timers.delete(n),
   document:{visibilityState:'visible',body:{classList:{contains:()=>true}},addEventListener:(k,v)=>{events[k]=v;}},
   window:{H:{$:s=>s==='#tab-design'?root:null,api:()=>{throw new Error('Unexpected request');},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')},addEventListener:(k,v)=>{events[k]=v;},SystemDesign:{diagram:()=>'',repaint(){}}}};
 vm.createContext(context);
 for(const f of ['sd-map.js','system-design-learning.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../static',f),'utf8'),context);
 return {ui:context.window.DesignLearning,storage,events,timers,root,context};
}
function catalog(scope='alice') {
 const lesson={id:'request-flow',title:'Follow a request',category:'foundations',objectives:['Trace a write'],objective_progress:[{title:'Trace a write',status:'not_checked'}],
   minutes:6,status:'not_started',completed:false,passed:false,latest_score:null,best_score:null,needs_review:false,due:0,mistakes:0,
   accuracy:null,independent_attempts:0,supported_attempts:0,calibration:'not_assessed'};
 return {storage_scope:scope,course:{categories:[{id:'foundations',title:'Foundations',description:'Start here',total:1,completed:0,lessons:[lesson]}],lessons:[lesson],next_lesson:'request-flow',history:[],
   totals:{completed:0,lessons:32,passed:0,due:0,independent_attempts:0,independent_correct:0,supported_attempts:0,quickfire_questions:96,quickfire_attempts:0}}};
}
test('curriculum rows link to their lesson and line up without knowledge data',()=>{
 const h=harness(),c=catalog();h.ui.setCatalog(c,'curriculum');
 const html=h.ui.render('curriculum',c);
 assert.match(html,/href="#\/system-design\/lesson\/request-flow"/);
 assert.match(html,/Not started/);
 assert.doesNotMatch(html,/sd-ladder|sd-ring|has-layers/);
});
test('layer progress: a ladder per area with the current pass marked, a ring per layer per lesson',()=>{
 const h=harness(),c=catalog();
 c.known={'request-flow':{held:1,seen:4,total:12,state:'started',layers:{1:{total:3,seen:3,held:1},2:{total:5,seen:1,held:0},3:{total:4,seen:0,held:0}}}};
 h.ui.setCatalog(c,'curriculum');const html=h.ui.render('curriculum',c);
 assert.equal((html.match(/class="sd-step(?: is-[a-z]+)*"/g)||[]).length,3);
 assert.match(html,/sd-step is-done">.*?1 · Map ✓/s);
 assert.match(html,/sd-step is-now">.*?2 · Interview-ready <b>now<\/b>/s);
 assert.match(html,/Revisit the map →/);assert.match(html,/href="#\/system-design\/map\/foundations"/);
 assert.match(html,/--seen:100%;--held:33%/);assert.match(html,/--seen:20%;--held:0%/);
 assert.match(html,/aria-label="Map: 3 of 3 ideas covered, 1 you'd recall today"/);
 assert.match(html,/class="sd-lesson-head hub-learn-row"/);
 assert.doesNotMatch(html,/NaN|undefined/);
});
test('unknown topic performance is visibly unassessed with no invented accuracy',()=>{
 const h=harness(),c=catalog();h.ui.setCatalog(c,'progress');
 const html=h.ui.render('progress',c);
 assert.match(html,/Not yet assessed/);assert.doesNotMatch(html,/NaN|undefined|Infinity/);
 assert.match(html,/No recorded checks yet/);
});
test('resume checkpoint is account scoped and older than one day is ignored',()=>{
 const key='sd-learning:v1:alice',saved=JSON.stringify({at:Date.now(),round:{settings:{},answers:[]}});
 const h=harness({[key]:saved});let c=catalog();h.ui.setCatalog(c,'quickfire');
 assert.match(h.ui.render('quickfire',c),/unfinished round/);
 c=catalog('bob');h.ui.setCatalog(c,'quickfire');
 assert.doesNotMatch(h.ui.render('quickfire',c),/unfinished round/);
 const old=harness({[key]:JSON.stringify({at:Date.now()-86400001,round:{}})});
 old.ui.setCatalog(catalog(),'quickfire');
 assert.doesNotMatch(old.ui.render('quickfire',catalog()),/unfinished round/);
});
test('learning works when browser storage is unavailable',()=>{
 const h=harness();h.context.sessionStorage.getItem=()=>{throw new Error('blocked');};
 h.context.sessionStorage.setItem=()=>{throw new Error('blocked');};
 h.ui.setCatalog(catalog(),'quickfire');
 assert.match(h.ui.render('quickfire',catalog()),/Start Quickfire/);
 assert.doesNotThrow(()=>h.ui.stop());
});
test('authored titles and user-facing content are escaped before rendering',()=>{
 const h=harness(),c=catalog();c.course.lessons[0].title='<img src=x onerror=alert(1)>';
 h.ui.setCatalog(c,'curriculum');const html=h.ui.render('curriculum',c);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
});
