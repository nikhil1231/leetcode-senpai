// Section routing has no storage or network dependencies.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(hash='') {
  const nodes=new Map(), listeners={}, opened=[], tabs=[], routes=[];
  let context;
  function node(key) {
    if(nodes.has(key))return nodes.get(key);
    const classes=new Set(),attrs={},events={};
    const n={dataset:{},textContent:'',events,attrs,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);}},
      setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},
      addEventListener(k,fn){events[k]=fn;},focus(){context.document.activeElement=n;},
      querySelector:selector=>selector==='.is-selected'?options.find(x=>x.classList.contains('is-selected')):node(key+' '+selector),
      querySelectorAll:selector=>selector==='[data-section]'?options:selector==='[data-design-view]'?views:[],
    };
    nodes.set(key,n);return n;
  }
  const options=['leetcode','system-design'].map(k=>{const n=node('option '+k);n.dataset.section=k;return n;});
  const views=['home','cases','skills','lessons','progress'].map(k=>{const n=node('view '+k);n.dataset.designView=k;return n;});
  node('#section-menu').classList.add('hidden');
  const location={hash};
  const history={pushState(a,b,url){routes.push(url);location.hash=url;},replaceState(a,b,url){location.hash=url;}};
  context={location,history,activeSession:{session_id:'keep-running'},setDashboardLocked(){},currentActiveTab(){return 'today';},
    goTab(tab){tabs.push(tab);},document:{body:node('body'),querySelectorAll:()=>[node('#tab-today'),node('#tab-design')],addEventListener(k,fn){listeners[k]=fn;}},
    window:{H:{$:node},SystemDesign:{onTab(){},openView(...args){opened.push(args);}},addEventListener(k,fn){listeners[k]=fn;}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../static/sections.js'),'utf8'),context);
  return {node,options,views,listeners,opened,tabs,routes,context,sections:context.window.AppSections};
}
test('switching sections replaces the shell without changing the active coding session',()=>{
  const h=harness();h.sections.select('system-design');
  assert.equal(h.node('body').classList.contains('section-design'),true);
  assert.equal(h.node('#tabs').classList.contains('hidden'),true);
  assert.equal(h.node('#design-nav').classList.contains('hidden'),false);
  assert.equal(h.context.location.hash,'#/system-design');
  assert.equal(h.context.activeSession.session_id,'keep-running');
  h.sections.select('leetcode');
  assert.equal(h.node('body').classList.contains('section-design'),false);
  assert.deepEqual(h.tabs,['today']);
});
test('a deep link and browser back restore the correct learning space',()=>{
  const h=harness('#/system-design/lessons');
  assert.equal(h.opened[0][0],'lessons');
  h.sections.select('system-design','cases');
  assert.equal(h.context.location.hash,'#/system-design/cases');
  h.context.location.hash='#/system-design/lessons';h.listeners.popstate();
  assert.equal(h.opened.at(-1)[0],'lessons');
  h.context.location.hash='#/leetcode';h.listeners.popstate();
  assert.equal(h.node('body').classList.contains('section-design'),false);
});
test('workspace navigation stays associated with cases and exercises with drills',()=>{
  const h=harness();h.sections.setView('workspace');
  assert.equal(h.views[1].attrs['aria-current'],'page');
  h.sections.setView('exercise');
  assert.equal(h.views[1].attrs['aria-current'],undefined);
  assert.equal(h.views[2].attrs['aria-current'],'page');
});
test('the section menu supports arrows, Escape and focus return',()=>{
  const h=harness();h.node('#section-trigger').events.click();
  assert.equal(h.node('#section-menu').classList.contains('hidden'),false);
  assert.equal(h.context.document.activeElement,h.options[0]);
  h.listeners.keydown({key:'ArrowDown',preventDefault(){}});
  assert.equal(h.context.document.activeElement,h.options[1]);
  h.listeners.keydown({key:'Escape',preventDefault(){}});
  assert.equal(h.node('#section-menu').classList.contains('hidden'),true);
  assert.equal(h.context.document.activeElement,h.node('#section-trigger'));
  assert.equal(h.node('#section-trigger').attrs['aria-expanded'],'false');
});

test('returning to LeetCode restores the tab the learner left',()=>{
  const h=harness();h.context.currentActiveTab=()=> 'settings';
  h.sections.select('system-design');h.sections.select('leetcode');
  assert.deepEqual(h.tabs,['settings']);
});
