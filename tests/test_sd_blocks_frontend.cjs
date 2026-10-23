// Lesson block rendering: escaping, Markdown structure and every block type renders.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load() {
 const context={window:{},CSS:{escape:s=>s}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/sd-blocks.js'),'utf8'),context);
 return context.window.SDBlocks;
}
test('markdown escapes HTML and renders tables, callouts and code',()=>{
 const B=load();
 const html=B.md('Hi <script>x</script> **bold** `a<b`\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> [!mistake] Careful\n> Body\n\n```sql\nSELECT 1\n```');
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/<strong>bold<\/strong>/);assert.match(html,/<code>a&lt;b<\/code>/);
 assert.match(html,/<table/);assert.match(html,/sd-callout is-mistake/);assert.match(html,/tok-k">SELECT/);
});
test('every block type renders without throwing and escapes authored text',()=>{
 const B=load(), evil='<img src=x onerror=1>';
 const blocks=[
  {type:'md',text:'## Heading\nText'},
  {type:'predict',key:'b1',prompt:evil,choices:['a','b'],answer:0,reveal:'r'},
  {type:'sort',key:'b2',prompt:'p',buckets:['x','y'],items:[{text:evil,bucket:0},{text:'t',bucket:1}]},
  {type:'order',key:'b3',prompt:'p',items:['a','b','c']},
  {type:'calc',key:'b4',prompt:'p',answer:10,unit:'ms',steps:'s'},
  {type:'bug',key:'b5',prompt:'p',code:'a\nb',bug:[2],explain:'e'},
  {type:'faded',key:'b6',prompt:'p',text:'x [[a|b]] y [[#3]]'},
  {type:'recall',key:'b7',prompt:'p',points:['one'],model:'m'},
  {type:'incident',key:'b8',title:'t',start:'s',nodes:{s:{text:'go',options:[{label:'l',next:'e'}]},e:{text:'end',verdict:'good'}}},
  {type:'arch',key:'b9',nodes:[{id:'a',label:evil,x:0,y:0},{id:'b',label:'B',x:1,y:0}],edges:[['a','b','x']]},
  {type:'interview',key:'b10',say:'s',followups:[{q:'q',a:'a'}],weak:'w',strong:'s'},
  {type:'timeline',key:'b11',lanes:['A','B'],state:{X:'1'},steps:[{lane:'A',to:'B',text:evil,set:{X:'2'}}]},
  {type:'sim',key:'b12',name:'queue'},
 ];
 const html=B.render({blocks});
 assert.doesNotMatch(html,/<img src=x/);
 assert.equal((html.match(/class="sd-block /g)||[]).length,12);
 assert.deepEqual([...B.outline({blocks})],['Heading']);
});
