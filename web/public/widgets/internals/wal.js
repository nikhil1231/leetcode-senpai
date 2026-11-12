import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
class Jl{constructor({pageCount:t=4,bufferPoolSize:s=3}={}){this.pageCount=t,this.bufferPoolSize=s,this.disk=Array.from({length:t},(r,o)=>`P${o}:v0`),this.buffer=[],this.log=[],this.lastLSN=0,this.activeTxns=new Map,this._nextTxn=1,this._clock=0}_nextLSN(){return this.lastLSN+=1,this.lastLSN}_tick(){return this._clock+=1,this._clock}_appendLog(t){return this.log.push(t),t}_findBuffer(t){return this.buffer.find(s=>s.pageId===t)}_loadPage(t){let s=this._findBuffer(t);if(s)return s.lastUsed=this._tick(),s;if(this.buffer.length>=this.bufferPoolSize){let r=-1,o=1/0;for(let i=0;i<this.buffer.length;i++){const a=this.buffer[i];a.pinned||a.dirty||a.lastUsed<o&&(o=a.lastUsed,r=i)}if(r===-1){for(let a=0;a<this.buffer.length;a++){const l=this.buffer[a];l.pinned||l.lastUsed<o&&(o=l.lastUsed,r=a)}if(r===-1)throw new Error("Buffer pool exhausted: every page is pinned. Increase bufferPoolSize.");const i=this.buffer[r];i.dirty&&(this.disk[i.pageId]=i.value,i.dirty=!1)}this.buffer.splice(r,1)}return s={pageId:t,value:this.disk[t],dirty:!1,pinned:!1,lastUsed:this._tick()},this.buffer.push(s),s}begin(){const t=this._nextTxn++;return this._appendLog({lsn:this._nextLSN(),type:"begin",txnId:t}),this.activeTxns.set(t,{txnId:t,writes:[]}),t}write(t,s,r){if(!this.activeTxns.has(t))throw new Error(`write: txn ${t} is not active`);if(s<0||s>=this.pageCount)throw new Error(`write: pageId ${s} out of range`);const o=this._loadPage(s),i=o.value,a=String(r),l=this._appendLog({lsn:this._nextLSN(),type:"update",txnId:t,pageId:s,before:i,after:a});return o.value=a,o.dirty=!0,o.lastUsed=this._tick(),this.activeTxns.get(t).writes.push({pageId:s,before:i,after:a,lsn:l.lsn}),l}commit(t){if(!this.activeTxns.has(t))throw new Error(`commit: txn ${t} is not active`);const s=this._appendLog({lsn:this._nextLSN(),type:"commit",txnId:t});return this.activeTxns.delete(t),s}abort(t){const s=this.activeTxns.get(t);if(!s)throw new Error(`abort: txn ${t} is not active`);for(let o=s.writes.length-1;o>=0;o--){const i=s.writes[o],a=this._findBuffer(i.pageId);if(a)a.value=i.before,a.dirty=!0,a.lastUsed=this._tick();else{const l=this._loadPage(i.pageId);l.value=i.before,l.dirty=!0}}const r=this._appendLog({lsn:this._nextLSN(),type:"abort",txnId:t});return this.activeTxns.delete(t),r}flushPage(t){const s=this._findBuffer(t);if(!s)throw new Error(`flushPage: page ${t} not in buffer`);this.disk[t]=s.value,s.dirty=!1}crash(){this.buffer=[],this.activeTxns=new Map}recover(){const t=[],s=[],r=new Map;for(const c of this.log)switch(c.type){case"begin":r.set(c.txnId,"active"),s.push({lsn:c.lsn,description:`T${c.txnId} BEGIN — mark active`,txnId:c.txnId,status:"active"});break;case"commit":r.set(c.txnId,"committed"),s.push({lsn:c.lsn,description:`T${c.txnId} COMMIT — remove from active set`,txnId:c.txnId,status:"committed"});break;case"abort":r.set(c.txnId,"aborted"),s.push({lsn:c.lsn,description:`T${c.txnId} ABORT — already rolled back`,txnId:c.txnId,status:"aborted"});break;case"update":s.push({lsn:c.lsn,description:`T${c.txnId} update P${c.pageId} — noted`,txnId:c.txnId});break}const o=[];for(const[c,p]of r.entries())p==="active"&&o.push(c);t.push({name:"Analysis",summary:o.length===0?"No in-progress transactions at crash time.":`In-progress transactions at crash: ${o.map(c=>`T${c}`).join(", ")}`,actions:s,activeAtCrash:[...o]});const i=[],a=[...this.disk];for(const c of this.log){if(c.type!=="update")continue;const p=a[c.pageId];a[c.pageId]=c.after,i.push({lsn:c.lsn,description:`T${c.txnId}: P${c.pageId} '${p}' → '${c.after}'`,txnId:c.txnId,pageId:c.pageId,before:p,after:c.after,disk:[...a]})}this.disk=[...a],t.push({name:"Redo",summary:`Replayed ${i.length} update record(s) from the log onto disk.`,actions:i});const l=[],d=new Set(o);for(let c=this.log.length-1;c>=0;c--){const p=this.log[c];if(p.type!=="update"||!d.has(p.txnId))continue;const m=a[p.pageId];a[p.pageId]=p.before,l.push({lsn:p.lsn,description:`T${p.txnId}: undo P${p.pageId} '${m}' → '${p.before}'`,txnId:p.txnId,pageId:p.pageId,before:m,after:p.before,disk:[...a]})}for(const c of o){const p=this._appendLog({lsn:this._nextLSN(),type:"abort",txnId:c});l.push({lsn:p.lsn,description:`T${c}: ABORT appended (rollback complete)`,txnId:c,disk:[...a],synthetic:!0})}return this.disk=[...a],t.push({name:"Undo",summary:o.length===0?"Nothing to undo.":`Rolled back ${o.length} uncommitted transaction(s).`,actions:l}),this.buffer=[],this.activeTxns=new Map,{phases:t,finalDisk:[...this.disk],activeAtCrash:o}}snapshot(){return{disk:[...this.disk],buffer:this.buffer.map(t=>({pageId:t.pageId,value:t.value,dirty:t.dirty,pinned:t.pinned})),log:this.log.map(t=>({...t})),activeTxns:Array.from(this.activeTxns.values()).map(t=>({txnId:t.txnId,writes:t.writes.map(s=>({...s}))})),lastLSN:this.lastLSN,pageCount:this.pageCount,bufferPoolSize:this.bufferPoolSize}}}
const Ql="#0f1419",ri="#1a1f2e",Fs="#141a27",kt="#2a2f3e",Wt="#e6e6e6",ce="#8a93a6",$n="#4a7cff",Ds="#f5c451",Nn="#f66",qs="#5cd894",Zl="#f5c451",ec="#14253d",tc="#4a7cff",sc="#2a1f47",rc="#8a6cff",nc="#14363d",ni=["#5cd894","#f5c451","#e07aff","#4ac9ff","#ff8a4a","#c1e04a"],Cn=n=>ni[(n-1)%ni.length],_n=700,Rn=900;
function oc(n){switch(n.type){case"begin":return`BEGIN T${n.txnId}`;case"update":return`UPDATE T${n.txnId} P${n.pageId}: '${n.before}' → '${n.after}'`;case"commit":return`COMMIT T${n.txnId}`;case"abort":return`ABORT T${n.txnId}`;default:return JSON.stringify(n)}}
function ic(){const[n,t]=h.useState(4),[s,r]=h.useState(3),o=h.useRef(null),[i,a]=h.useState(null),[l,d]=h.useState(""),[c,p]=h.useState("0"),[m,g]=h.useState("hello"),[w,C]=h.useState(""),[j,$]=h.useState(""),[O,q]=h.useState("0"),[R,D]=h.useState("Ready. Begin a transaction, then Write, then Commit — or Crash to test Recovery."),[B,V]=h.useState(!1),[T,_]=h.useState(!1),[b,x]=h.useState(null),[f,u]=h.useState(-1),[y,v]=h.useState(-1),[I,S]=h.useState(null),[H,M]=h.useState(null),k=(W=n,L=s)=>{const G=new Jl({pageCount:W,bufferPoolSize:L});o.current=G,a(G.snapshot()),V(!1),_(!1),x(null),u(-1),v(-1),S(null),M(null),D("Fresh database. Try Begin → Write → Commit, or Crash to watch Recovery.")};h.useEffect(()=>{k(n,s)},[]);const P=()=>{o.current&&a(o.current.snapshot())},N=W=>{M(W),setTimeout(()=>M(L=>L===W?null:L),500)},z=()=>k(n,s),E=()=>{if(!(B||T))try{const W=o.current.begin();P();const L=o.current.snapshot().log.slice(-1)[0];L&&N(L.lsn),d(String(W)),C(String(W)),$(String(W)),D(`Began transaction T${W} (logged BEGIN).`)}catch(W){D(`Error: ${W.message}`)}},J=()=>{if(B||T)return;const W=parseInt(l,10),L=parseInt(c,10);if(Number.isNaN(W)||Number.isNaN(L)){D("Enter a numeric txnId and pageId.");return}try{const G=o.current.write(W,L,m);P(),N(G.lsn),D(`T${W} wrote P${L} = '${m}' → WAL first (LSN ${G.lsn}), then buffer dirtied.`)}catch(G){D(`Error: ${G.message}`)}},Y=()=>{if(B||T)return;const W=parseInt(w,10);if(Number.isNaN(W)){D("Enter a numeric txnId.");return}try{const L=o.current.commit(W);P(),N(L.lsn),D(`T${W} COMMIT logged (LSN ${L.lsn}). Under No-Force, dirty pages stay dirty in the buffer.`)}catch(L){D(`Error: ${L.message}`)}},se=()=>{if(B||T)return;const W=parseInt(j,10);if(Number.isNaN(W)){D("Enter a numeric txnId.");return}try{const L=o.current.abort(W);P(),N(L.lsn),D(`T${W} aborted: in-memory pages reverted to before-images, ABORT logged (LSN ${L.lsn}).`)}catch(L){D(`Error: ${L.message}`)}},A=()=>{if(B||T)return;const W=parseInt(O,10);if(Number.isNaN(W)){D("Enter a numeric pageId.");return}try{o.current.flushPage(W),P(),D(`Flushed P${W} to disk. (Steal policy: we may do this for any dirty page, even uncommitted.)`)}catch(L){D(`Error: ${L.message}`)}},K=()=>{B||T||(o.current.crash(),P(),V(!0),D("CRASH! Buffer pool discarded; disk + WAL survive. Click Recover to run ARIES."))},Q=()=>{if(!B||T)return;const W=o.current.recover();x(W),_(!0),u(-1),v(-1),S([...i.disk]),D("Starting recovery: Analysis → Redo → Undo."),X(W)},X=W=>{let L=0;for(let G=0;G<W.phases.length;G++){const te=W.phases[G];setTimeout(()=>{u(G),v(-1),D(`Phase ${G+1}/${W.phases.length} — ${te.name}: ${te.summary}`)},L*_n+(G===0?0:Rn*G)),L+=1;for(let re=0;re<te.actions.length;re++){const ie=te.actions[re],ke=L*_n+Rn*G+0;setTimeout(()=>{u(G),v(re),ie.disk&&S([...ie.disk]),D(`[${te.name}] ${ie.description}`)},ke),L+=1}}setTimeout(()=>{S(null),u(-1),v(-1),_(!1),V(!1),P(),D("Recovery complete. Disk is consistent: committed work preserved, uncommitted work rolled back.")},L*_n+Rn*W.phases.length)};if(!i)return null;const ee=I??i.disk,F=[];for(let W=0;W<i.bufferPoolSize;W++)F.push(i.buffer[W]||null);const U=W=>Cn(W.txnId),Z=(()=>{if(!b||f<0||y<0)return null;const W=b.phases[f];if(!W)return null;const L=W.actions[y];return L?L.lsn:null})();return e.jsxs("div",{style:{background:Ql,color:Wt,padding:16,borderRadius:8},children:[e.jsx("style",{children:`
        .wal-btn {
          background: ${ri};
          color: ${Wt};
          border: 1px solid ${kt};
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-family: inherit;
        }
        .wal-btn:hover:not(:disabled) { border-color: ${$n}; }
        .wal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .wal-btn.primary { background: ${$n}; border-color: ${$n}; color: #fff; }
        .wal-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
        .wal-btn.danger { background: ${Nn}; border-color: ${Nn}; color: #fff; }
        .wal-btn.danger:hover:not(:disabled) { filter: brightness(1.1); }
        .wal-btn.good { background: ${qs}; border-color: ${qs}; color: #07241a; font-weight: 600; }
        .wal-btn.good:hover:not(:disabled) { filter: brightness(1.1); }
        .wal-input {
          background: ${Fs};
          color: ${Wt};
          border: 1px solid ${kt};
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 13px;
          font-family: inherit;
          width: 70px;
        }
        .wal-input.wide { width: 120px; }
        .wal-select {
          background: ${Fs};
          color: ${Wt};
          border: 1px solid ${kt};
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 13px;
          font-family: inherit;
        }
        .wal-panel {
          background: ${ri};
          border: 1px solid ${kt};
          border-radius: 8px;
          padding: 12px;
        }
        .wal-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .wal-slot {
          border: 1px solid ${kt};
          border-radius: 6px;
          padding: 8px 10px;
          min-height: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          transition: background 0.3s, border-color 0.3s;
        }
        .wal-slot.disk { background: ${ec}; border-color: ${tc}; }
        .wal-slot.buffer { background: ${sc}; border-color: ${rc}; }
        .wal-slot.empty { background: ${Fs}; border-style: dashed; color: ${ce}; }
        .wal-slot.active { box-shadow: 0 0 0 2px ${Ds}; }
        .wal-log-row {
          border: 1px solid ${kt};
          border-radius: 4px;
          padding: 4px 8px;
          margin-bottom: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          background: ${nc};
          transition: background 0.3s, box-shadow 0.3s;
        }
        .wal-log-row.pulse { box-shadow: 0 0 0 2px ${qs}; }
        .wal-log-row.active { box-shadow: 0 0 0 2px ${Ds}; background: #1a2c32; }
        .wal-log-row.dim { opacity: 0.35; }
        .wal-phase-header {
          padding: 6px 10px;
          margin-bottom: 6px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
        }
        .wal-pill {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 8px;
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          border: 1px solid currentColor;
        }
      `}),e.jsx("h2",{style:{margin:"0 0 6px 0",fontSize:18},children:"WAL + Recovery Visualizer"}),e.jsxs("div",{style:{color:ce,fontSize:12,marginBottom:12},children:["Petrov ch.5 — Buffer pool, write-ahead log, ARIES-style Analysis / Redo / Undo. Policy: ",e.jsx("strong",{children:"Steal + No-Force"}),", so recovery needs both redo and undo."]}),e.jsxs("div",{className:"wal-row",style:{marginBottom:10},children:[e.jsxs("label",{style:{fontSize:13},children:["Pages: ",e.jsx("select",{className:"wal-select",value:n,onChange:W=>{const L=parseInt(W.target.value,10);t(L),k(L,s)},children:[2,3,4,5,6].map(W=>e.jsx("option",{value:W,children:W},W))})]}),e.jsxs("label",{style:{fontSize:13},children:["Buffer pool: ",e.jsx("select",{className:"wal-select",value:s,onChange:W=>{const L=parseInt(W.target.value,10);r(L),k(n,L)},children:[1,2,3,4].map(W=>e.jsx("option",{value:W,children:W},W))})]}),e.jsx("button",{className:"wal-btn",onClick:z,children:"Reset"}),e.jsx("span",{style:{flex:1}}),e.jsxs("span",{style:{color:ce,fontSize:12},children:["Last LSN: ",e.jsx("strong",{style:{color:Wt},children:i.lastLSN})]})]}),e.jsxs("div",{className:"wal-panel",style:{marginBottom:10},children:[e.jsxs("div",{className:"wal-row",children:[e.jsx("button",{className:"wal-btn primary",onClick:E,disabled:B||T,children:"Begin"}),e.jsx("span",{style:{color:ce},children:"|"}),e.jsx("span",{style:{fontSize:12,color:ce},children:"Write"}),e.jsx("input",{className:"wal-input",placeholder:"txn",value:l,onChange:W=>d(W.target.value)}),e.jsx("input",{className:"wal-input",placeholder:"page",value:c,onChange:W=>p(W.target.value)}),e.jsx("input",{className:"wal-input wide",placeholder:"value",value:m,onChange:W=>g(W.target.value)}),e.jsx("button",{className:"wal-btn",onClick:J,disabled:B||T,children:"Write"}),e.jsx("span",{style:{color:ce},children:"|"}),e.jsx("input",{className:"wal-input",placeholder:"txn",value:w,onChange:W=>C(W.target.value)}),e.jsx("button",{className:"wal-btn good",onClick:Y,disabled:B||T,children:"Commit"}),e.jsx("input",{className:"wal-input",placeholder:"txn",value:j,onChange:W=>$(W.target.value)}),e.jsx("button",{className:"wal-btn",onClick:se,disabled:B||T,children:"Abort"}),e.jsx("span",{style:{color:ce},children:"|"}),e.jsx("input",{className:"wal-input",placeholder:"page",value:O,onChange:W=>q(W.target.value)}),e.jsx("button",{className:"wal-btn",onClick:A,disabled:B||T,children:"Flush Page"})]}),e.jsxs("div",{className:"wal-row",style:{marginTop:8},children:[e.jsx("button",{className:"wal-btn danger",onClick:K,disabled:B||T,children:"Crash"}),e.jsx("button",{className:"wal-btn primary",onClick:Q,disabled:!B||T,children:"Recover (ARIES)"}),B&&!T&&e.jsx("span",{style:{color:Nn,fontSize:12,fontWeight:600},children:"⚠ Crashed — buffer pool lost. Disk + log intact."}),T&&e.jsx("span",{style:{color:Ds,fontSize:12,fontWeight:600},children:"⏳ Running recovery…"})]})]}),e.jsx("div",{style:{background:Fs,border:`1px solid ${kt}`,borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:13,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",minHeight:20},children:R}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1.3fr",gap:10,marginBottom:10},children:[e.jsxs("div",{className:"wal-panel",children:[e.jsx("div",{style:{fontSize:12,color:ce,marginBottom:6,letterSpacing:1},children:"DISK (persistent)"}),ee.map((W,L)=>{var G,te;return e.jsxs("div",{className:`wal-slot disk ${b&&f>=0&&y>=0&&((te=(G=b.phases[f])==null?void 0:G.actions[y])==null?void 0:te.pageId)===L?"active":""}`,style:{marginBottom:6},children:[e.jsxs("span",{style:{color:ce,fontSize:11},children:["P",L]}),e.jsx("span",{children:W})]},L)})]}),e.jsxs("div",{className:"wal-panel",children:[e.jsxs("div",{style:{fontSize:12,color:ce,marginBottom:6,letterSpacing:1},children:["BUFFER POOL (volatile, size ",i.bufferPoolSize,")"]}),F.map((W,L)=>W?e.jsxs("div",{className:"wal-slot buffer",style:{marginBottom:6},children:[e.jsxs("span",{style:{color:ce,fontSize:11},children:["slot ",L," — P",W.pageId,W.dirty&&e.jsx("span",{style:{color:Zl,marginLeft:6,fontWeight:700},children:"★ dirty"}),W.pinned&&e.jsx("span",{style:{color:qs,marginLeft:6,fontWeight:700},children:"📌 pinned"})]}),e.jsx("span",{children:W.value})]},L):e.jsxs("div",{className:"wal-slot empty",style:{marginBottom:6},children:["slot ",L," — empty"]},L))]}),e.jsxs("div",{className:"wal-panel",children:[e.jsx("div",{style:{fontSize:12,color:ce,marginBottom:6,letterSpacing:1},children:"WRITE-AHEAD LOG (append-only)"}),e.jsxs("div",{style:{maxHeight:360,overflowY:"auto",paddingRight:4},children:[i.log.length===0&&e.jsx("div",{style:{color:ce,fontSize:12,fontStyle:"italic"},children:"(no records yet)"}),i.log.map(W=>{let L="wal-log-row";return(T||b)&&Z===W.lsn&&(L+=" active"),H===W.lsn&&(L+=" pulse"),e.jsxs("div",{className:L,style:{borderLeft:`4px solid ${U(W)}`},children:[e.jsxs("span",{style:{color:ce},children:["LSN ",W.lsn]}),"  ",e.jsx("span",{style:{color:U(W),fontWeight:600},children:oc(W)})]},W.lsn)})]})]})]}),e.jsxs("div",{className:"wal-panel",style:{marginBottom:10},children:[e.jsx("div",{style:{fontSize:12,color:ce,marginBottom:6,letterSpacing:1},children:"ACTIVE TRANSACTIONS"}),i.activeTxns.length===0?e.jsx("div",{style:{color:ce,fontSize:12,fontStyle:"italic"},children:"(none — all txns committed or aborted)"}):e.jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:8},children:i.activeTxns.map(W=>e.jsxs("div",{style:{border:`2px solid ${Cn(W.txnId)}`,borderRadius:6,padding:"6px 10px",background:Fs,fontSize:12,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",minWidth:140},children:[e.jsxs("div",{style:{color:Cn(W.txnId),fontWeight:700,marginBottom:4},children:["T",W.txnId]}),W.writes.length===0?e.jsx("div",{style:{color:ce},children:"no writes yet"}):W.writes.map((L,G)=>e.jsxs("div",{style:{color:Wt},children:["P",L.pageId,": '",L.before,"' → '",L.after,"'"]},G))]},W.txnId))})]}),b&&e.jsxs("div",{className:"wal-panel",style:{marginBottom:10},children:[e.jsx("div",{style:{fontSize:12,color:ce,marginBottom:8,letterSpacing:1},children:"RECOVERY (ARIES: Analysis → Redo → Undo)"}),b.phases.map((W,L)=>{const G=f===L,te=f>L||!T&&!!b,re=W.name==="Analysis"?"#2a3e4a":W.name==="Redo"?"#2a4a3e":"#4a2a3e";return e.jsxs("div",{style:{marginBottom:10},children:[e.jsxs("div",{className:"wal-phase-header",style:{background:re,border:`1px solid ${G?Ds:te?qs:kt}`,opacity:G||te?1:.5},children:["Phase ",L+1,": ",W.name,e.jsx("span",{style:{color:ce,fontWeight:400,marginLeft:10,fontSize:12},children:W.summary})]}),e.jsxs("div",{style:{paddingLeft:12,borderLeft:`2px solid ${kt}`,marginLeft:4},children:[W.actions.length===0&&e.jsx("div",{style:{color:ce,fontSize:12,fontStyle:"italic"},children:"(no actions)"}),W.actions.map((ie,ke)=>{const Mt=G&&y===ke,Dt=L<f||G&&ke<y||!T&&!!b;return e.jsxs("div",{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",fontSize:12,padding:"2px 6px",borderRadius:3,margin:"2px 0",background:Mt?"#3a3418":"transparent",color:Mt?Ds:Dt?Wt:ce,opacity:Mt||Dt?1:.6},children:[e.jsxs("span",{style:{color:ce},children:["LSN ",ie.lsn]})," ",ie.description]},ke)})]})]},L)})]}),e.jsxs("div",{style:{fontSize:11,color:ce,padding:8,border:`1px dashed ${kt}`,borderRadius:6,lineHeight:1.5},children:[e.jsx("strong",{style:{color:Wt},children:"Book asides:"})," This visualizer is single-threaded and omits concurrent txns on the same page, lock management, MVCC, OCC, and checkpoints. In a real system, isolation between concurrent txns would be enforced via locks (2PL), timestamps, or MVCC snapshots; ARIES's Analysis phase normally starts from the most recent checkpoint (fuzzy checkpoint), not LSN 0; and Undo writes compensation log records (CLRs) so a crash during recovery never repeats work. Our log stores whole-page before/after images — real systems typically use physical-redo + logical-undo for better concurrency and smaller records."]})]})}

export default ic;
export { ic as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(ic, {}));
  return () => root.unmount();
}
