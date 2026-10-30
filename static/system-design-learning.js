// Curriculum, recorded lesson checks, and refresh-safe System Design Quickfire.
(function () {
  'use strict';
  const {$, api, escapeHtml: esc} = window.H;
  const B = () => window.SDBlocks;
  const rich = t => B() ? B().inline(t) : esc(t);
  const call = (path, method='GET', body) => api('/system-design'+path, method, body);
  const id = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
  const btn = (text, action, attrs='', primary=false) => `<button type="button" class="button ${primary?'is-primary':''}" data-course="${action}" ${attrs}>${esc(text)}</button>`;
  const intro = (label,title,text) => `<div class="sd-page-intro"><span class="sd-eyebrow">${esc(label)}</span><h2 id="sd-heading" tabindex="-1">${esc(title)}</h2><p>${esc(text)}</p></div>`;
  const stamp = t => new Date(t*1000).toLocaleString();
  let catalog, lesson=null, quiz=null, round=null, pendingRound=null, busy=false, error='', view='curriculum';
  let filter='all', category='', search='', selectedAnswer='', tickAt=0, elapsed=0, clock=null, scope=null;
  let quizRequest=null, quizLesson=null, lessonEpoch=0, confidence='', lessonState=null, blockCache=null;
  const defaults = () => ({category:'',lesson_id:'',difficulty:'mixed',mode:'adaptive',length:5});
  let settings=defaults();
  const storageKey = () => `sd-learning:v1:${scope}`;
  const quizKey = key => `sd-quiz:v1:${scope}:${key}`;
  function readStorage(key) {try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}}
  function writeStorage(key,value) {try{value===null?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value));}catch{/* Server answers remain saved. */}}
  function checkpoint() {if(round&&!round.finished){if(view==='quickfire'){round.elapsed=elapsed;round.selectedAnswer=selectedAnswer;}writeStorage(storageKey(),{at:Date.now(),round});}}
  function tick() {
    const now=performance.now();
    if(tickAt && document.visibilityState!=='hidden')elapsed+=(now-tickAt)/1000;
    tickAt=now;
  }
  function stop() {if(clock)tick();clearInterval(clock);clock=null;tickAt=0;checkpoint();}
  function startClock() {
    stop();
    const questionOpen=(view==='lesson'&&quiz&&!quiz.completed_at) || (view==='quickfire'&&round?.item&&!round.item.result&&!round.finished);
    if(!questionOpen || !document.body.classList.contains('section-design'))return;
    tickAt=performance.now();clock=setInterval(()=>{tick();checkpoint();},1000);
  }
  function progress(completed,total) {return `<div class="sd-course-bar" role="progressbar" aria-label="Lessons completed" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${total}"><span style="width:${total?100*completed/total:0}%"></span></div>`;}
  function statsHtml() {
    const t=catalog.course.totals, independent=t.independent_attempts;
    return `<div class="sd-course-stats"><div><strong>${t.completed}<small> / ${t.lessons}</small></strong><span>Lessons completed</span></div><div><strong>${t.passed}</strong><span>Lesson checks passed</span></div><div><strong>${independent?Math.round(100*t.independent_correct/independent)+'%':'—'}</strong><span>Independent Quickfire · ${independent} attempts</span></div><div><strong>${t.due}</strong><span>Checks due for review</span></div></div>`;
  }
  const statusText = l => l.status==='completed'?'Completed':l.status==='in_progress'?'In progress':'Not started';
  function lessonRow(l,index) {
    return `<article class="sd-curriculum-topic"><div class="sd-topic-main"><span class="sd-row-number">${String(index+1).padStart(2,'0')}</span><div><a class="sd-topic-link" href="#/system-design/lesson/${l.id}">${esc(l.title)}</a><div class="sd-topic-meta"><span class="sd-status ${l.completed?'is-done':''}">${statusText(l)}</span>${l.passed?'<span class="sd-status is-done">Check passed</span>':''}${l.needs_review?'<span class="sd-status is-review">Needs review</span>':''}<span>${l.minutes} min${l.activities_total?` · ${l.activities_done}/${l.activities_total} activities`:''} · ${l.latest_score===null?'Check not finished':`Latest check ${l.latest_score}/${l.latest_total||3}`}</span></div></div></div><details class="sd-objectives"><summary>Learning objectives & practice</summary><ul>${l.objective_progress.map(o=>`<li>${esc(o.title)} <span class="sd-objective-status">${o.status==='passed'?'✓ Check passed':o.status==='review'?'↻ Review':'○ Not checked'}</span></li>`).join('')}</ul><p class="sd-muted">Quickfire: ${l.accuracy===null?'not yet assessed':`${l.accuracy}% across ${l.independent_attempts} independent attempts`} · ${l.due} reviews due</p><div class="sd-actions">${btn('Study lesson','lesson',`data-id="${l.id}"`,true)}${btn('Practise topic','topic-fire',`data-id="${l.id}"`)}</div></details></article>`;
  }
  function matches(l) {
    return (!category || l.category===category) && (!search || (l.title+' '+l.objectives.join(' ')).toLowerCase().includes(search.toLowerCase())) &&
      (filter==='all' || filter==='unfinished'&&!l.completed || filter==='review'&&l.needs_review || filter==='completed'&&l.completed);
  }
  function mapHtml() {
    const t=catalog.course.totals;
    return intro(view==='lessons'?'LESSON LIBRARY':'YOUR LEARNING MAP',view==='lessons'?'Learn one concept at a time.':'From your first request to a complete design.',`A guided course in ${catalog.course.categories.length} stages, from foundations to full interview walkthroughs. Follow the suggested order or explore any topic; your activities, lesson checks and practice are recorded.`) + statsHtml()+
      `<div class="sd-course-toolbar"><label>Show<select id="sd-course-filter" class="select">${[['all','All lessons'],['unfinished','Unfinished'],['review','Needs review'],['completed','Completed']].map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Category<select id="sd-course-category" class="select"><option value="">All categories</option>${catalog.course.categories.map(c=>`<option value="${c.id}" ${category===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><label class="sd-course-search">Find a concept<input class="input" id="sd-course-search" type="search" value="${esc(search)}" placeholder="e.g. cache, retries, ownership"></label>${catalog.course.next_lesson?btn('Continue learning →','lesson',`data-id="${catalog.course.next_lesson}"`,true):''}</div>
      <p class="sd-muted">${t.completed} of ${t.lessons} lessons completed. Completion tracks study and attempted checks; later independent practice tracks retention.</p>
      <div class="sd-actions sd-map-controls">${btn('Expand all categories','expand-map')}${btn('Collapse all categories','collapse-map')}</div><div id="sd-course-results">${mapResults()}</div>`;
  }
  function mapResults() {
    let number=0;
    const html=catalog.course.categories.map((c,i)=>{
      const numbered=c.lessons.map(l=>({l,n:number++})).filter(({l})=>matches(l));
      if(!numbered.length)return '';
      const current=catalog.course.lessons.find(l=>l.id===catalog.course.next_lesson)?.category;
      return `<details class="sd-course-category" ${filter!=='all'||category||search||c.id===current?'open':''}><summary><span class="sd-course-stage">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.description)}</small></span><span class="sd-category-total">${c.completed}/${c.total} completed</span>${progress(c.completed,c.total)}</summary><div>${numbered.map(({l,n})=>lessonRow(l,n)).join('')}</div></details>`;
    }).join('');
    return html || '<div class="sd-panel">No lessons match these filters. Try another category or show all lessons.</div>';
  }
  function feedback(a) {
    const picked=String(a.answer||'').split(',').filter(Boolean), whys=a.whys||{};
    const wrongWhy=(a.format||'choice')!=='order'&&!a.correct?picked.filter(k=>whys[k]&&!(a.correct_answer.ids||[a.correct_answer.id]).includes(k)).map(k=>whys[k]):[];
    const confident=!a.correct&&!a.revealed&&a.confidence==='sure';
    return `<div class="sd-answer-feedback ${a.correct&&!a.revealed?'is-correct':''}" role="status"><strong>${a.revealed?'Answer revealed':a.correct?'Correct':'Review this distinction'}${a.guessed?' · guessed':''}</strong>${confident?'<p class="sd-confident-miss">You were sure, and it was wrong. These are the mistakes most worth fixing: they come back sooner.</p>':''}${wrongWhy.map(w=>`<p class="sd-why-wrong"><b>Why your choice fails:</b> ${rich(w)}</p>`).join('')}<p>${rich(a.explanation)}</p><p><b>Correct answer:</b> ${rich(a.correct_answer.text)}${a.format==='numeric'&&a.answer?` · you said ${esc(a.answer)} ${esc(a.unit||'')}`:''}</p><p class="sd-muted">${a.revealed?'Revealed answer':a.assisted?'Supported practice':'Independent practice'}${a.guessed?' · comes back sooner':''} · Saved</p></div>`;
  }
  function confidenceHtml(a) {
    if(a)return '';
    return `<div class="sd-confidence" role="group" aria-label="Confidence"><span>Before you check:</span><button type="button" class="sd-conf ${confidence==='sure'?'is-on':''}" data-conf="sure">I’m sure</button><button type="button" class="sd-conf ${confidence==='unsure'?'is-on':''}" data-conf="unsure">Not sure</button></div>`;
  }
  function choices(q,a) {
    const fmt=q.format||'choice', mine=String(a?.answer??selectedAnswer).split(',').filter(Boolean), right=a?(a.correct_answer.ids||[a.correct_answer.id]):[];
    const whys=a?.whys||{};
    if(fmt==='numeric') return `<div class="sd-numeric"><input class="input" id="sd-numeric-answer" inputmode="decimal" autocomplete="off" placeholder="Your answer" value="${esc(a?.answer??selectedAnswer)}" ${a?'disabled':''}><span>${esc(q.unit||'')}</span></div>${a?`<p class="sd-muted">Accepted within a small tolerance of ${rich(a.correct_answer.text)}.</p>`:''}`;
    if(fmt==='order') {
      const ids=a?String(a.answer||'').split(',').filter(Boolean):(selectedAnswer?selectedAnswer.split(','):q.choices.map(c=>c.id));
      const by=Object.fromEntries(q.choices.map(c=>[c.id,c]));
      const list=(a&&!ids.length?q.choices.map(c=>c.id):ids);
      return `<ol class="sd-order sd-answer-order" data-order>${list.map((k,i)=>`<li data-id="${k}" class="${a?(a.correct_answer.ids[i]===k?'is-right':'is-wrong'):''}"><span class="sd-order-text">${rich(by[k].text)}</span>${a?'':`<span class="sd-order-moves"><button type="button" data-move="up" aria-label="Move up">↑</button><button type="button" data-move="down" aria-label="Move down">↓</button></span>`}</li>`).join('')}</ol>`;
    }
    const type=fmt==='multi'?'checkbox':'radio';
    return `<fieldset class="sd-answer-options"><legend class="sr-only">Choose your answer</legend>${q.choices.map((c,i)=>`<label class="sd-choice ${a&&right.includes(c.id)?'sd-choice-correct':''} ${a&&mine.includes(c.id)&&!right.includes(c.id)?'sd-choice-wrong':''} ${a&&mine.includes(c.id)?'sd-choice-picked':''}"><input type="${type}" name="sd-course-answer" value="${c.id}" ${mine.includes(c.id)?'checked':''} ${a?'disabled':''}><span class="sd-choice-letter">${i+1}</span><span>${rich(c.text)}${a&&whys[c.id]&&(mine.includes(c.id)||right.includes(c.id))?`<small class="sd-choice-why">${rich(whys[c.id])}</small>`:''}</span></label>`).join('')}</fieldset>`;
  }
  const formatLabel = q => ({choice:'CHOOSE ONE',multi:'SELECT ALL THAT APPLY',numeric:'ESTIMATE',order:'PUT IN ORDER'})[q.format||'choice'];
  function checkHtml(state) {
    const current=quiz?.questions.find(q=>!quiz.answers[q.id]);
    const n=quiz?quiz.questions.length:lesson.quiz_ids.length;
    const score=quiz?Object.values(quiz.answers).filter(a=>a.correct&&!a.revealed).length:0;
    return `<section class="sd-panel sd-knowledge-check sd-rich-check" id="sd-check"><span class="sd-eyebrow">CHECK YOUR UNDERSTANDING</span><h3>${n} questions on this lesson</h3><p class="sd-muted">Answer from memory, and say how sure you are first. Confident mistakes and guesses come back sooner. Spaced Quickfire on later days checks what stuck.</p>${!quiz?btn('Start lesson check →','start-quiz','',true):quiz.completed_at?`<div class="sd-quiz-score"><strong>${score}/${n}</strong><span>${score===n?'Check passed':'Check completed · review the explanations'}</span></div>${!state.read?'<p class="sd-muted">Mark the lesson as read to finish it on your map.</p>':''}${quiz.questions.map((q,i)=>`<details class="sd-quiz-review"><summary>Question ${i+1} · ${quiz.answers[q.id].correct&&!quiz.answers[q.id].revealed?'correct':'review'}</summary><div class="sd-q-prompt">${B().md(q.prompt)}</div>${choices(q,quiz.answers[q.id])}${feedback(quiz.answers[q.id])}</details>`).join('')}<div class="sd-actions">${btn('Retake check','start-quiz')}${lesson.next_id?btn('Next lesson →','lesson',`data-id="${lesson.next_id}"`,true):btn('View progress','navigate','data-view="progress"',true)}</div>`:`<div class="sd-check-progress">${quiz.questions.map(q=>`<i class="${quiz.answers[q.id]?(quiz.answers[q.id].correct&&!quiz.answers[q.id].revealed?'is-right':'is-wrong'):q===current?'is-current':''}"></i>`).join('')}</div><p class="sd-eyebrow">QUESTION ${Object.keys(quiz.answers).length+1} OF ${n} · ${esc(formatLabel(current))}</p><div class="sd-q-prompt">${B().md(current.prompt)}</div>${choices(current,null)}${confidenceHtml(null)}<div class="sd-actions">${btn('Check answer','quiz-answer','',true)}${btn('Reveal answer','quiz-reveal')}</div>${Object.keys(quiz.answers).length?`<details open><summary>Previous answer</summary>${feedback(Object.values(quiz.answers).at(-1))}</details>`:''}`}</section>`;
  }
  function richLessonHtml() {
    const state=catalog.course.lessons.find(l=>l.id===lesson.id);
    const cat=catalog.course.categories.find(c=>c.id===lesson.category);
    const number=catalog.course.lessons.findIndex(l=>l.id===lesson.id)+1;
    const done=Object.values(lessonState?.activities||{}).filter(a=>a.done).length;
    return `<div class="sd-breadcrumb">${btn('← Curriculum','navigate','data-view="curriculum"')}<span>/ ${esc(cat.title)}</span></div>`+
      `<div class="sd-page-intro sd-rich-intro"><span class="sd-eyebrow">LESSON ${number} · ${lesson.minutes} MIN · ${lesson.interactive} ACTIVITIES</span><h2 id="sd-heading" tabindex="-1">${esc(lesson.title)}</h2><p>${rich(lesson.principle)}</p></div>`+
      `<div class="sd-rich-layout"><article class="sd-rich"><details class="sd-goals"><summary>By the end you can</summary><ul>${lesson.objectives.map(o=>`<li>${rich(o)}</li>`).join('')}</ul></details><div id="sd-lesson-blocks"></div>${checkHtml(state)}<footer class="sd-lesson-foot"><details><summary>Further reading</summary><ul>${lesson.sources.map(([title,url])=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></li>`).join('')}</ul></details><div class="sd-actions">${btn(state.read?'Read ✓':'Mark as read','read',state.read?'disabled':'',!state.read)}${btn('Practise this topic','topic-fire',`data-id="${lesson.id}"`)}${lesson.case_id?btn('Try the related design case','case',`data-case="${lesson.case_id}"`):''}${lesson.next_id?btn('Next lesson →','lesson',`data-id="${lesson.next_id}"`):''}</div></footer></article>`+
      `<aside class="sd-rich-rail"><div class="sd-rail-card"><span class="sd-eyebrow">PROGRESS</span><div class="sd-rail-progress"><b id="sd-activity-count">${done}</b>/<span>${lesson.interactive}</span> activities</div><div class="sd-course-bar"><span id="sd-activity-bar" style="width:${lesson.interactive?100*done/lesson.interactive:0}%"></span></div><p class="sd-muted">Check: ${state.latest_score===null?'not taken':`${state.latest_score}/${state.latest_total}`}${state.passed?' · passed':''}</p></div><nav id="sd-lesson-rail"></nav><div class="sd-rail-card sd-rail-actions">${btn(state.read?'Read ✓':'Mark as read','read',state.read?'disabled':'',!state.read)}${btn('Practise topic','topic-fire',`data-id="${lesson.id}"`)}</div></aside></div>`;
  }
  function lessonHtml() {
    if(!lesson)return '<div class="sd-panel">Open a lesson from the curriculum.</div>';
    if(lesson.blocks && B())return richLessonHtml();
    const state=catalog.course.lessons.find(l=>l.id===lesson.id);
    const pre=catalog.course.lessons.find(l=>l.id===lesson.prerequisite);
    const current=quiz?.questions.find(q=>!quiz.answers[q.id]);
    return `<div class="sd-breadcrumb">${btn('← Curriculum','navigate','data-view="curriculum"')}<span>/ ${esc(catalog.course.categories.find(c=>c.id===lesson.category).title)}</span></div>`+
      intro('LESSON · '+lesson.minutes+' MIN',lesson.title,lesson.principle)+
      `<div class="sd-learning-layout"><article class="sd-panel sd-reading"><h3>What you’ll learn</h3><ul>${lesson.objectives.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>${pre?`<p class="sd-muted">Suggested first: <a href="#/system-design/lesson/${pre.id}">${esc(pre.title)}</a>${pre.completed?' · completed':''}. You can study in any order.</p>`:''}<h3>A worked example</h3><p>${esc(lesson.worked)}</p>${lesson.diagram?`<div class="sd-learning-diagram">${window.SystemDesign.diagram(lesson.diagram)}</div>`:''}<h3>The trade-off</h3><p>${esc(lesson.tradeoff)}</p><div class="sd-misconception"><b>A common misconception</b><p>${esc(lesson.mistake)}</p></div><details><summary>Further reading</summary><ul>${lesson.sources.map(([title,url])=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></li>`).join('')}</ul></details><div class="sd-actions">${btn(state.read?'Read ✓':'Mark as read','read',state.read?'disabled':'',!state.read)}${btn('Practise this topic','topic-fire',`data-id="${lesson.id}"`)}${lesson.case_id?btn('Try the related design case','case',`data-case="${lesson.case_id}"`):''}</div></article>
      <aside class="sd-panel sd-knowledge-check"><span class="sd-eyebrow">CHECK YOUR UNDERSTANDING</span><h3>${quiz?quiz.questions.length:(lesson.quiz_ids||[]).length||3} questions</h3><p class="sd-muted">These checks follow the lesson, so they count as supported learning. Try Quickfire again on a later day to check retention.</p>${!quiz?`<p>Answer before opening each explanation. All attempts are saved.</p>${btn('Start lesson check →','start-quiz','',true)}`:quiz.completed_at?`<div class="sd-quiz-score"><strong>${Object.values(quiz.answers).filter(a=>a.correct&&!a.revealed).length}/${quiz.questions.length}</strong><span>${Object.values(quiz.answers).every(a=>a.correct&&!a.revealed)?'Check passed':'Check completed · review the explanations'}</span></div>${!state.read?'<p class="sd-muted">Mark the lesson as read to finish it on your map.</p>':''}${quiz.questions.map((q,i)=>`<details class="sd-quiz-review"><summary>Question ${i+1} · ${quiz.answers[q.id].correct?'correct':'review'}</summary><div class="sd-q-prompt">${B()?B().md(q.prompt):esc(q.prompt)}</div>${feedback(quiz.answers[q.id])}</details>`).join('')}<div class="sd-actions">${btn('Retake check','start-quiz')}${lesson.next_id?btn('Next lesson →','lesson',`data-id="${lesson.next_id}"`,true):btn('View progress','navigate','data-view="progress"',true)}</div>`:`<p class="sd-eyebrow">QUESTION ${Object.keys(quiz.answers).length+1} OF ${quiz.questions.length} · ${esc(formatLabel(current))}</p><div class="sd-q-prompt">${B()?B().md(current.prompt):esc(current.prompt)}</div>${choices(current,null)}${confidenceHtml(null)}<div class="sd-actions">${btn('Check answer','quiz-answer','',true)}${btn('Reveal answer','quiz-reveal')}</div>${Object.keys(quiz.answers).length?`<details open><summary>Previous answer</summary>${feedback(Object.values(quiz.answers).at(-1))}</details>`:''}`}</aside></div>`;
  }
  function comboHtml() {
    let n=0;
    for(let i=round.answers.length-1;i>=0;i--){const a=round.answers[i];if(a.correct&&!a.revealed&&!a.guessed)n++;else break;}
    const best=round.best||0, record=n>best&&best>0;
    return `<span class="sd-combo ${n>=3?'is-hot':''} ${record?'is-record':''}" aria-label="Clean answers in a row">Streak <b>${n}</b>${record?' · new best!':best?` · best ${best}`:''}</span>`;
  }
  function selectOptions(pairs,value) {return pairs.map(([k,v])=>`<option value="${k}" ${String(value)===String(k)?'selected':''}>${esc(v)}</option>`).join('');}
  function quickfireHtml() {
    if(round?.item && !round.finished) {
      const q=round.item.question,a=round.item.result,l=catalog.course.lessons.find(l=>l.id===q.lesson_id);
      return intro('SYSTEM DESIGN QUICKFIRE',round.length?`Question ${round.answers.length+(a?0:1)} of ${round.length}`:'Continuous practice','Choose an answer, understand the explanation, and keep building your instincts.')+
        `<div class="sd-quickfire-meta"><span>${esc(l.title)}</span><span>${round.answers.filter(a=>a.correct&&!a.revealed).length} correct / ${round.answers.length} answered</span>${comboHtml()}${btn('Stop round','stop-round')}</div><article class="sd-panel sd-fire-question"><span class="sd-eyebrow">${q.difficulty==='standard'?'ADVANCED':'CORE'} · ${a?'ANSWER SAVED':esc(formatLabel(q))}</span><div class="sd-q-prompt sd-q-big">${B()?B().md(q.prompt):esc(q.prompt)}</div>${choices(q,a)}${confidenceHtml(a)}${a?feedback(a):''}<div class="sd-actions">${a?btn(round.length&&round.answers.length>=round.length?'Finish round →':'Next question →','next-fire','',true):btn('Check answer →','fire-answer','',true)}${!a?btn('Reveal answer','fire-reveal'):a.correct&&!a.guessed?btn('I guessed','guess'):''}${btn('Read the lesson','lesson',`data-id="${q.lesson_id}"`)}</div><p class="sd-muted">Number keys choose · S / U mark sure or unsure · Enter checks or continues · Esc stops.</p></article>`;
    }
    if(round?.finished) {
      const n=round.answers.length,correct=round.answers.filter(a=>a.correct&&!a.revealed).length;
      const missed=[...new Set(round.answers.filter(a=>!a.correct||a.revealed||a.guessed).map(a=>a.lesson_id))];
      return intro('ROUND COMPLETE',`${correct} correct out of ${n}.`,'Your answers are saved. Revealed and guessed answers return sooner; supported work stays labelled.')+
        `<div data-round-slip></div><article class="sd-panel"><h3>${missed.length?'Worth another look':'Keep the reasoning fresh'}</h3>${missed.length?missed.map(k=>`<p>${btn(catalog.course.lessons.find(l=>l.id===k).title,'lesson',`data-id="${k}"`)}</p>`).join(''):'<p>Try another topic or return on a later day for an independent check.</p>'}<div class="sd-actions">${btn('Another round','new-round','',true)}${btn('Your progress','navigate','data-view="progress"')}</div></article>`;
    }
    if(round&&!round.item&&!round.finished)return intro('QUICKFIRE','Loading your next question.','If the connection failed, retry to recover the same question.')+btn('Retry loading question','next-fire','',true);
    return intro('QUICK DECISIONS, CLEAR REASONS','System Design Quickfire','Short multiple-choice questions about components, products, trade-offs, capacity, and failures. No timer pressure.')+
      (pendingRound?`<div class="sd-panel sd-resume"><h3>You have an unfinished round.</h3><p>Your question and saved results can be recovered.</p><div class="sd-actions">${btn('Resume round','resume','',true)}${btn('Discard round','discard')}</div></div>`:'')+
      `<div class="sd-panel"><div class="sd-fire-controls"><label>Category<select class="select" id="sd-fire-category">${selectOptions([['','All categories'],...catalog.course.categories.map(c=>[c.id,c.title])],settings.category)}</select></label><label>Topic<select class="select" id="sd-fire-topic">${selectOptions([['','All topics'],...catalog.course.lessons.filter(l=>!settings.category||l.category===settings.category).map(l=>[l.id,l.title])],settings.lesson_id)}</select></label><label>Difficulty<select class="select" id="sd-fire-difficulty">${selectOptions([['mixed','Mixed'],['beginner','Core'],['standard','Advanced']],settings.difficulty)}</select></label><label>Practice<select class="select" id="sd-fire-mode">${selectOptions([['adaptive','Adaptive mix'],['mistakes','Review mistakes'],['learned','Learned topics']],settings.mode)}</select></label><label>Round length<select class="select" id="sd-fire-length">${selectOptions([[5,'5 questions'],[10,'10 questions'],[0,'Continuous']],settings.length)}</select></label></div><div class="sd-actions">${btn('Start Quickfire →','start-fire','',true)}</div><p class="sd-muted">${catalog.course.totals.quickfire_questions} authored questions. Due reviews and mistakes are prioritised; recent questions are spaced out.</p></div>`;
  }
  function progressHtml() {
    const lessons=catalog.course.lessons, attention=lessons.filter(l=>l.needs_review), history=catalog.course.history;
    const label={not_assessed:'Not yet assessed',more_practice:'More practice needed',needs_work:'Needs work',developing_strength:'Developing strength'};
    const L=window.DesignLedger, slots=L?['knowledge','records','activity','heatmap'].map(p=>L.slot(p)).join(''):'';
    return intro('YOUR LEARNING RECORD','Know what to focus on.','Course coverage, supported learning, independent practice, and design observations each tell a different part of the story.')+slots+statsHtml()+
      `<div class="sd-panel"><h3>${attention.length?'Your next focus':'Your next step'}</h3>${attention.length?`<div class="sd-focus-list">${attention.slice(0,6).map(l=>`<div><strong>${esc(l.title)}</strong><p class="sd-muted">${l.due} due · ${l.mistakes} latest answers to revisit</p><div class="sd-actions">${btn('Review lesson','lesson',`data-id="${l.id}"`)}${btn('Practise topic','topic-fire',`data-id="${l.id}"`)}</div></div>`).join('')}</div>`:`<p>${catalog.course.totals.quickfire_attempts?'No outstanding mistakes recorded. Continue the curriculum or revisit a topic later.':'Start a lesson, then try its checks. Your results will appear here.'}</p>${btn('Open curriculum','navigate','data-view="curriculum"',true)}`}</div>
      <div class="sd-panel"><h3>Topic performance</h3><p class="sd-muted">Accuracy uses the first independent answer per question per UTC day. Guesses count as uncertain; supported and revealed answers are shown separately. A strength/weakness label needs at least three independent attempts; its signal uses the latest five.</p><div class="sd-scroll"><table class="sd-evidence"><thead><tr><th>Topic</th><th>Study</th><th>Latest / best check</th><th>Independent Quickfire</th><th>Supported</th><th>Focus</th></tr></thead><tbody>${lessons.map(l=>`<tr><td><a href="#/system-design/lesson/${l.id}">${esc(l.title)}</a></td><td>${statusText(l)}</td><td>${l.latest_score===null?'—':`${l.latest_score}/3 · ${l.best_score}/3`}</td><td>${l.accuracy===null?'—':`${l.accuracy}% · ${l.independent_attempts} attempts`}</td><td>${l.supported_attempts}</td><td>${label[l.calibration]}${l.due?` · ${l.due} due`:''}</td></tr>`).join('')}</tbody></table></div></div>
      <details class="sd-panel"><summary>Recent checks and answers (${history.length}${history.length===100?' most recent':''})</summary>${history.length?`<div class="sd-history">${history.map(a=>`<details><summary><span>${esc(catalog.course.lessons.find(l=>l.id===a.lesson_id)?.title||a.lesson_id)}</span><span>${a.source==='quiz'?'Lesson check':'Quickfire'} · ${a.revealed?'revealed':a.correct?'correct':'incorrect'}${a.guessed?' · guessed':''}</span><small>${esc(stamp(a.answered_at))}</small></summary><p>${esc(a.question_title)}</p><p>Your answer: ${esc(a.choices?.find(c=>c.id===a.answer)?.text||'Revealed')}</p>${feedback(a)}</details>`).join('')}</div>`:'<p>No recorded checks yet.</p>'}</details>`;
  }
  function render(nextView,nextCatalog) {
    view=nextView;catalog=nextCatalog;
    const body=view==='lesson'?lessonHtml():view==='quickfire'?quickfireHtml():view==='progress'?progressHtml():mapHtml();
    return `<div id="sd-learning-error" class="sd-error" role="alert" ${error?'':'hidden'}>${esc(error)}</div>`+body;
  }
  async function refresh() {catalog=await call('');window.SystemDesign.setCatalog(catalog);window.DesignLedger?.invalidate();}
  async function go(v) {stop();await window.SystemDesign.openView(v);}
  async function openLesson(key) {
    const ticket=++lessonEpoch;
    const data=await call('/course/lessons/'+encodeURIComponent(key)+'/open','POST',{});
    let recovered=null;
    const saved=readStorage(quizKey(data.lesson.id));
    if(saved?.id) {
      try {recovered=await call('/course/quizzes/'+saved.id);}
      catch(e){if(e.status!==404)throw e;writeStorage(quizKey(data.lesson.id),null);}
    }
    if(ticket!==lessonEpoch)return;
    lesson=data.lesson;lessonState=data.state;quiz=recovered;selectedAnswer='';confidence='';elapsed=0;
  }
  function saveQuiz() {if(lesson&&quiz)writeStorage(quizKey(lesson.id),{id:quiz.id});}
  function choose(value) {selectedAnswer=value;checkpoint();}
  async function nextFire() {
    if(round.length&&round.answers.length>=round.length) {round.finished=true;writeStorage(storageKey(),null);await refresh();return;}
    round.nextRequest=round.nextRequest||id();checkpoint();
    const {length,...filters}=round.settings;
    const item=await call('/quickfire/next','POST',{...filters,request_id:round.nextRequest,recent:round.recent.slice(-100)});
    if(item.empty) {
      error=item.message;
      if(round.answers.length)round.finished=true;else round=null;
      writeStorage(storageKey(),null);return;
    }
    round.item=item;round.nextRequest=null;round.recent.push(item.question.id);selectedAnswer='';confidence='';elapsed=0;checkpoint();
  }
  function recordRoundAnswer() {
    const item=round.item;
    if(!item?.result)return;
    const a={...item.result,id:item.id,lesson_id:item.question.lesson_id};
    const index=round.answers.findIndex(r=>r.id===item.id);
    if(index<0)round.answers.push(a);else round.answers[index]=a;
  }
  function captureSettings() {
    const value=(selector,fallback)=>$(selector)?.value??fallback;
    settings={category:value('#sd-fire-category',settings.category),lesson_id:value('#sd-fire-topic',settings.lesson_id),difficulty:value('#sd-fire-difficulty',settings.difficulty),mode:value('#sd-fire-mode',settings.mode),length:Number(value('#sd-fire-length',settings.length))};
  }
  async function act(action,node) {
    if(busy)return;
    if(action==='expand-map'||action==='collapse-map') {
      $('#tab-design').querySelectorAll('.sd-course-category').forEach(n=>{n.open=action==='expand-map';});return;
    }
    busy=true;error='';stop();
    const root=$('#tab-design');root.querySelectorAll('button,input,select').forEach(n=>{if(!n.closest('.sd-blocks-live'))n.disabled=true;});
    try {
      if(action==='navigate')await go(node.dataset.view);
      if(action==='lesson')await go('lesson/'+node.dataset.id);
      if(action==='case')await window.SystemDesign.openCase(node.dataset.case);
      if(action==='read') {await call('/course/lessons/'+lesson.id+'/read','POST',{});await refresh();}
      if(action==='start-quiz') {
        if(quizLesson!==lesson.id){quizRequest=null;quizLesson=lesson.id;}
        quizRequest=quizRequest||id();
        quiz=await call('/course/quizzes','POST',{request_id:quizRequest,lesson_id:lesson.id});quizRequest=null;saveQuiz();selectedAnswer='';elapsed=0;
      }
      if(action==='quiz-answer'||action==='quiz-reveal') {
        const q=quiz.questions.find(q=>!quiz.answers[q.id]);
        quiz=await call('/course/quizzes/'+quiz.id+'/answer','POST',{question_id:q.id,answer:selectedAnswer,reveal:action==='quiz-reveal',confidence,elapsed_sec:Math.floor(elapsed)});
        saveQuiz();selectedAnswer='';confidence='';elapsed=0;await refresh();
      }
      if(action==='topic-fire') {
        settings={...defaults(),lesson_id:node.dataset.id};round=null;pendingRound=null;writeStorage(storageKey(),null);await go('quickfire');
      }
      if(action==='start-fire') {
        captureSettings();round={settings:{...settings},length:settings.length,answers:[],recent:[],item:null,nextRequest:id(),startedAt:Math.floor(Date.now()/1000)};pendingRound=null;
        round.best=(await window.DesignLedger?.load().catch(()=>null))?.records?.find(r=>r.key==='combo')?.value||0;
        await nextFire();
      }
      if(action==='resume') {
        round=pendingRound;pendingRound=null;selectedAnswer=round.selectedAnswer||'';elapsed=round.elapsed||0;
        if(round.item) {round.item=await call('/quickfire/'+round.item.id);recordRoundAnswer();checkpoint();}
        else await nextFire();
      }
      if(action==='discard'||action==='new-round') {round=null;pendingRound=null;writeStorage(storageKey(),null);}
      if(action==='next-fire')await nextFire();
      if(action==='stop-round') {round.finished=true;writeStorage(storageKey(),null);await refresh();}
      if(action==='fire-answer'||action==='fire-reveal') {
        round.item=await call('/quickfire/'+round.item.id+'/answer','POST',{question_id:round.item.question.id,answer:selectedAnswer,reveal:action==='fire-reveal',confidence,elapsed_sec:Math.floor(elapsed)});confidence='';
        recordRoundAnswer();checkpoint();await refresh();
      }
      if(action==='guess') {round.item=await call('/quickfire/'+round.item.id+'/guess','POST',{});recordRoundAnswer();checkpoint();await refresh();}
    } catch(e) {error=e.message;checkpoint();}
    finally {busy=false;window.SystemDesign.repaint();}
  }
  function mountBlocks(root) {
    const slot=root.querySelector('#sd-lesson-blocks');
    if(!slot||!lesson?.blocks||!B())return;
    if(window.DesignLesson) {
      const id=lesson.id;
      window.DesignLesson.mount(slot,root.querySelector('#sd-lesson-rail'),lesson,{saved:lessonState?.activities||{},
        recall:(block,text)=>call('/course/lessons/'+id+'/recall','POST',{block:block.key,text}),
        pitch:(block,text,followup)=>call('/course/lessons/'+id+'/pitch','POST',{block:block.key,text,followup}),
        done:(key,correct)=>recordActivity(id,key,correct)});
      return;
    }
    if(blockCache?.id!==lesson.id) {
      blockCache?.handle?.destroy();
      const node=document.createElement('div');node.className='sd-blocks-live';
      node.innerHTML=B().render(lesson);
      const id=lesson.id;
      const handle=B().wire(node,lesson,{saved:lessonState?.activities||{},
        recall:(block,text)=>call('/course/lessons/'+id+'/recall','POST',{block:block.key,text}),
        done(key,correct){
          call('/course/lessons/'+id+'/activity','POST',{block:key,correct}).then(s=>{
            if(lesson?.id!==id)return;lessonState=s;
            const n=Object.values(s.activities||{}).filter(a=>a.done).length;
            const count=$('#sd-activity-count');if(count)count.textContent=n;
            const bar=$('#sd-activity-bar');if(bar)bar.style.width=(100*n/(lesson.interactive||1))+'%';
          }).catch(e=>{error=e.message;const el=$('#sd-learning-error');if(el){el.textContent=error;el.hidden=false;}});
        }});
      blockCache={id,node,handle};
    }
    slot.replaceWith(blockCache.node);
  }
  function recordActivity(id,key,correct) {
    return call('/course/lessons/'+id+'/activity','POST',{block:key,correct}).then(s=>{
      if(lesson?.id!==id)return;lessonState=s;
      const n=Object.values(s.activities||{}).filter(a=>a.done).length;
      const count=$('#sd-activity-count');if(count)count.textContent=n;
      const bar=$('#sd-activity-bar');if(bar)bar.style.width=(100*n/(lesson.interactive||1))+'%';
    }).catch(e=>{error=e.message;const el=$('#sd-learning-error');if(el){el.textContent=error;el.hidden=false;}});
  }
  function wire(root) {
    mountBlocks(root);
    if(view==='quickfire'&&round?.finished&&round.answers.length)window.DesignLedger?.slip(root.querySelector('[data-round-slip]'),round.startedAt||Math.min(...round.answers.map(a=>a.answered_at)));
    root.querySelectorAll('[data-course]').forEach(n=>n.addEventListener('click',()=>act(n.dataset.course,n)));
    root.querySelectorAll('input[name="sd-course-answer"]').forEach(n=>n.addEventListener('change',()=>{
      if(n.type==='checkbox')choose([...root.querySelectorAll('input[name="sd-course-answer"]:checked')].map(c=>c.value).join(','));
      else choose(n.value);
    }));
    root.querySelector('#sd-numeric-answer')?.addEventListener('input',e=>choose(e.target.value.trim()));
    const order=root.querySelector('[data-order]');
    if(order&&!order.querySelector('.is-right,.is-wrong')) {
      const sync=()=>choose([...order.querySelectorAll('li')].map(li=>li.dataset.id).join(','));
      if(!selectedAnswer)sync();
      order.addEventListener('click',e=>{
        const b=e.target.closest('[data-move]');if(!b)return;const li=b.closest('li');
        if(b.dataset.move==='up'&&li.previousElementSibling)order.insertBefore(li,li.previousElementSibling);
        if(b.dataset.move==='down'&&li.nextElementSibling)order.insertBefore(li.nextElementSibling,li);
        sync();
      });
    }
    root.querySelectorAll('[data-conf]').forEach(n=>n.addEventListener('click',()=>{
      confidence=confidence===n.dataset.conf?'':n.dataset.conf;
      root.querySelectorAll('[data-conf]').forEach(o=>o.classList.toggle('is-on',o.dataset.conf===confidence));
    }));
    root.querySelectorAll('[data-jump]').forEach(n=>n.addEventListener('click',e=>{e.preventDefault();document.getElementById(n.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'});}));
    const results=()=>{
      $('#sd-course-results').innerHTML=mapResults();wireButtons($('#sd-course-results'));
    };
    $('#sd-course-filter')?.addEventListener('change',e=>{filter=e.target.value;results();});
    $('#sd-course-category')?.addEventListener('change',e=>{category=e.target.value;results();});
    $('#sd-course-search')?.addEventListener('input',e=>{search=e.target.value;results();});
    $('#sd-fire-category')?.addEventListener('change',()=>{captureSettings();settings.lesson_id='';window.SystemDesign.repaint();});
    startClock();
  }
  function wireButtons(root) {root.querySelectorAll('[data-course]').forEach(n=>n.addEventListener('click',()=>act(n.dataset.course,n)));}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop();else startClock();});
  window.addEventListener('beforeunload',checkpoint);
  document.addEventListener('keydown',event=>{
    if(view!=='quickfire'||!round?.item||round.finished||busy||!document.body.classList.contains('section-design')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&event.target.type!=='radio')return;
    if(/^[1-5]$/.test(event.key)&&!round.item.result) {
      const choices=[...$('#tab-design').querySelectorAll('input[name="sd-course-answer"]')],n=choices[Number(event.key)-1];
      if(n){event.preventDefault();n.checked=n.type==='checkbox'?!n.checked:true;n.dispatchEvent(new Event('change'));}
    }
    if((event.key==='s'||event.key==='u')&&!round.item.result){const c=$('#tab-design').querySelector(`[data-conf="${event.key==='s'?'sure':'unsure'}"]`);if(c){event.preventDefault();c.click();}}
    if(event.target.closest?.('button,a,summary'))return;
    if(event.key==='Enter') {event.preventDefault();act(round.item.result?'next-fire':'fire-answer',{});}
    if(event.key==='Escape') {event.preventDefault();act('stop-round',{});}
  });
  window.DesignLearning={render,wire,openLesson,stop,startClock,isBusy:()=>busy,statsHtml,progressHtml,
    route:()=>lesson?'lesson/'+lesson.id:'lessons',
    setCatalog(value,nextView=view){
      if(nextView!==view) {
        stop();
        if(nextView==='quickfire'&&round){elapsed=round.elapsed||0;selectedAnswer=round.selectedAnswer||'';}
      }
      if(scope!==value.storage_scope) {
        stop();scope=value.storage_scope;lesson=null;quiz=null;round=null;selectedAnswer='';elapsed=0;settings=defaults();
        const saved=readStorage(storageKey());pendingRound=saved&&Date.now()-saved.at<86400000?saved.round:null;
      }
      catalog=value;view=nextView;
    },
    overview(cat) {
      catalog=cat;const next=cat.course.lessons.find(l=>l.id===cat.course.next_lesson);
      return `<section class="sd-panel sd-learning-start"><div><span class="sd-eyebrow">YOUR GUIDED LEARNING PATH</span><h3>${next?esc(next.title):'Your course is complete. Keep practising.'}</h3><p>${next?'Build the foundations before tackling a full design. Your place and checks are saved.':'Use Quickfire and design cases to apply what you learned.'}</p></div><div class="sd-actions">${next?btn(cat.course.totals.completed?'Continue learning →':'Start with the basics →','lesson',`data-id="${next.id}"`,true):''}${btn('View curriculum','navigate','data-view="curriculum"')}${btn('Quickfire','navigate','data-view="quickfire"')}</div>${progress(cat.course.totals.completed,cat.course.totals.lessons)}</section>`;
    }};
})();
