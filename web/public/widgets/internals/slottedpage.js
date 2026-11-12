import { r as h, j as e, R as ReactDOM } from '../shared/vendor-react.js';

// Statements are in their original bundle order; definitions the extraction dropped were restored from it.
const Jt="#0f1419";
const Il="#1a1f2e";
const at="#2a2f3e";
const wt="#e6e6e6";
const _e="#8a93a6";
const qt="#4a7cff";
const Mr="#f66";
const Ot="#5cd894";
const Dl="#14253d";
const ql="#4a7cff";
const bo=400;
const dr=300;
const Kl=`
.lsm-root {
  color: ${wt};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
  background: ${Jt};
}
.lsm-panel {
  background: ${Il};
  border: 1px solid ${at};
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 1100px;
  margin: 0 auto;
}
.lsm-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${at};
}
.lsm-title {
  font-size: 18px;
  font-weight: 600;
  color: ${wt};
}
.lsm-subtitle {
  font-size: 12px;
  color: ${_e};
  margin-top: 2px;
}
.lsm-title-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.lsm-label {
  color: ${_e};
  font-size: 13px;
}
.lsm-label select {
  background: ${Jt};
  border: 1px solid ${at};
  color: ${wt};
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.lsm-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid ${at};
}
.lsm-input {
  padding: 6px 10px;
  background: ${Jt};
  border: 1px solid ${at};
  border-radius: 5px;
  color: ${wt};
  font-size: 13px;
  font-family: inherit;
}
.lsm-input:focus {
  outline: none;
  border-color: ${qt};
}
.lsm-btn {
  padding: 6px 14px;
  background: ${qt};
  border: none;
  border-radius: 5px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  transition: filter 0.15s;
}
.lsm-btn:hover { filter: brightness(1.15); }
.lsm-btn-danger { background: ${Mr}; }
.lsm-btn-good { background: ${Ot}; color: ${Jt}; }
.lsm-btn-ghost {
  background: transparent;
  border: 1px solid ${at};
  color: ${wt};
}
.lsm-sep {
  width: 1px;
  height: 22px;
  background: ${at};
  margin: 0 4px;
}
.lsm-quick {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid ${at};
}
.lsm-quick-label {
  color: ${_e};
  font-size: 12px;
  margin-right: 4px;
}
.lsm-chip {
  padding: 3px 10px;
  background: ${Jt};
  border: 1px solid ${at};
  color: ${wt};
  border-radius: 999px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.lsm-chip:hover {
  border-color: ${qt};
  color: ${qt};
}
.lsm-section {
  padding: 12px 0;
  border-bottom: 1px dashed ${at};
}
.lsm-section:last-of-type {
  border-bottom: none;
}
.lsm-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${_e};
  margin-bottom: 6px;
  font-weight: 600;
}
.lsm-section-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: ${_e};
  margin-left: 8px;
}
.lsm-memtable {
  background: ${Dl};
  border: 1.5px solid ${ql};
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  transition: all 0.3s ease;
  position: relative;
}
.lsm-memtable.lsm-collapse {
  transform: translateY(18px) scale(0.96);
  opacity: 0.4;
}
.lsm-memtable.lsm-mt-hit {
  border-color: ${Ot};
  box-shadow: 0 0 0 2px ${Ot}77;
}
.lsm-memtable.lsm-mt-miss {
  border-color: ${_e};
  box-shadow: 0 0 0 1px ${_e}55;
}
.lsm-fill {
  margin-left: auto;
  font-size: 11px;
  color: ${_e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-level {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 56px;
  align-items: stretch;
}
.lsm-sst {
  border-radius: 6px;
  padding: 8px 10px;
  min-width: 140px;
  max-width: 240px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: box-shadow 0.2s, border-color 0.2s, opacity 0.3s, transform 0.3s;
  position: relative;
}
.lsm-sst-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
  gap: 6px;
}
.lsm-sst-id {
  font-weight: 700;
  color: ${wt};
  font-size: 11px;
}
.lsm-sst-range {
  color: ${_e};
  font-size: 10px;
}
.lsm-sst-keys {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lsm-kv {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  font-size: 11px;
}
.lsm-kv-mt {
  background: rgba(74,124,255,0.16);
}
.lsm-k {
  color: ${qt};
  font-weight: 600;
}
.lsm-arrow { color: ${_e}; }
.lsm-v { color: ${wt}; }
.lsm-tomb {
  color: ${Mr};
  text-decoration: line-through;
  text-decoration-color: ${Mr};
}
.lsm-x {
  color: ${Mr};
  font-weight: 700;
  margin-left: 2px;
}
.lsm-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  animation: lsm-badge-pop 0.25s ease-out;
}
@keyframes lsm-badge-pop {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.lsm-fade-in {
  animation: lsm-fade-in ${dr}ms ease-out both;
}
@keyframes lsm-fade-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.lsm-pulse {
  animation: lsm-pulse ${bo}ms ease-in-out;
}
@keyframes lsm-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.04); }
  100% { transform: scale(1); opacity: 0.2; }
}
.lsm-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 10px 12px;
  margin-top: 12px;
  background: ${Jt};
  border: 1px solid ${at};
  border-radius: 6px;
  font-size: 12px;
  color: ${_e};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-stats strong { color: ${wt}; font-weight: 600; margin-right: 2px; }
.lsm-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: ${Jt};
  border-left: 3px solid ${qt};
  border-radius: 4px;
  font-size: 12px;
  color: ${wt};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lsm-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${qt};
  box-shadow: 0 0 8px ${qt};
  flex-shrink: 0;
}
`,Ls=16,ts=4;
function ti(n,t){const s=si(String(n)),r=si(String(t));return 2+s+2+r}
function si(n){if(typeof TextEncoder<"u")return new TextEncoder().encode(n).length;let t=0;for(let s=0;s<n.length;s++){const r=n.charCodeAt(s);r<128?t+=1:r<2048?t+=2:r>=55296&&r<=56319?(t+=4,s++):t+=3}return t}
class bs{constructor({pageSize:t=256,pageId:s=1}={}){if(t<Ls+ts+8)throw new Error("pageSize too small for even one cell");this.pageSize=t,this.pageId=s,this.pointers=[],this.cells=new Map,this.freeStart=Ls,this.freeEnd=t,this.fragmentedBytes=0,this._nextSlotId=0}insert(t,s){const r=ti(t,s),o=ts+r,i=this.freeEnd-this.freeStart;if(o>i)return{error:"no space",needed:o,available:i,fragmented:this.fragmentedBytes};const a=this.freeEnd-r;this.freeEnd=a,this.freeStart+=ts;const l=this._nextSlotId++,d={id:l,offset:a,size:r,tombstone:!1};return this.pointers.push(d),this.cells.set(l,{offset:a,size:r,key:String(t),value:String(s),tombstone:!1}),{slotId:l,offset:a,size:r,cellBytes:r,pointerBytes:ts}}delete(t){const s=this.pointers.find(o=>o.id===t);if(!s)return{error:"no such slot",slotId:t};if(s.tombstone)return{error:"already tombstoned",slotId:t};s.tombstone=!0;const r=this.cells.get(t);return r&&(r.tombstone=!0),this.fragmentedBytes+=s.size,{slotId:t,reclaimable:s.size,fragmentedBytes:this.fragmentedBytes}}get(t){const s=this.pointers.find(o=>o.id===t);if(!s)return{error:"no such slot",slotId:t};if(s.tombstone)return{error:"tombstoned",slotId:t};const r=this.cells.get(t);return{slotId:t,offset:s.offset,size:s.size,key:r?r.key:void 0,value:r?r.value:void 0}}compact(){const t=this.freeEnd-this.freeStart,s=this.fragmentedBytes;let r=this.pageSize,o=0;for(const a of this.pointers){if(a.tombstone){a.offset=0,a.size=0,this.cells.delete(a.id);continue}const l=this.cells.get(a.id),d=a.size,c=r-d;c!==a.offset&&o++,a.offset=c,l&&(l.offset=c),r=c}this.freeEnd=r,this.fragmentedBytes=0;const i=this.freeEnd-this.freeStart;return{reclaimed:s,moved:o,freeBefore:t,freeAfter:i}}snapshot(){const t=this.pointers.map((l,d)=>({id:l.id,slotIndex:d,offset:l.offset,size:l.size,tombstone:l.tombstone})),s=[];for(const l of this.pointers){if(l.size===0)continue;const d=this.cells.get(l.id);d&&s.push({id:l.id,offset:d.offset,size:d.size,key:d.key,value:d.value,tombstone:l.tombstone})}s.sort((l,d)=>l.offset-d.offset);const r=this.pointers.length*ts,o=this.pointers.reduce((l,d)=>l+(d.tombstone?0:d.size),0),i=Ls+r+o,a=this.freeEnd-this.freeStart;return{pageSize:this.pageSize,header:{size:Ls,pageId:this.pageId,cellCount:this.pointers.length,freeSpacePointer:this.freeStart},pointerSize:ts,pointerArrayBytes:r,pointers:t,cells:s,freeStart:this.freeStart,freeEnd:this.freeEnd,usedBytes:i,freeBytes:a,fragmentedBytes:this.fragmentedBytes,liveCellBytes:o}}static estimateCellBytes(t,s){return ti(t,s)}static get HEADER_SIZE(){return Ls}static get POINTER_SIZE(){return ts}}
const Ul=`
.spw-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e6e6e6;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
}
.spw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a2f3e;
}
.spw-title { font-weight: 600; font-size: 15px; }
.spw-sub { font-size: 12px; color: #8a93a8; margin-top: 2px; }
.spw-head-right { display: flex; gap: 8px; align-items: center; }

.spw-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #141925;
  border-bottom: 1px solid #2a2f3e;
  flex-wrap: wrap;
}
.spw-input, .spw-select {
  padding: 6px 10px;
  background: #0f1419;
  border: 1px solid #2a2f3e;
  border-radius: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-family: inherit;
}
.spw-input { width: 110px; }
.spw-input.spw-input-val { width: 140px; }
.spw-input.spw-input-slot { width: 70px; }
.spw-input:focus, .spw-select:focus {
  outline: none; border-color: #4a7cff;
}
.spw-btn {
  padding: 6px 12px;
  background: #4a7cff;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.spw-btn:hover { background: #3b6ae8; }
.spw-btn.spw-ghost {
  background: transparent;
  border: 1px solid #2a2f3e;
  color: #d1d5db;
}
.spw-btn.spw-ghost:hover { border-color: #4a7cff; color: #e6e6e6; }
.spw-btn.spw-danger { background: #c13c3c; }
.spw-btn.spw-danger:hover { background: #a73232; }
.spw-btn.spw-warn { background: #d08a2a; }
.spw-btn.spw-warn:hover { background: #b77620; }
.spw-label { font-size: 12px; color: #8a93a8; margin-right: 4px; }

.spw-canvas-wrap {
  flex: 1;
  min-height: 320px;
  overflow: auto;
  background: radial-gradient(ellipse at top, #141925 0%, #0f1419 70%);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* The main horizontal byte bar */
.spw-page {
  position: relative;
  height: 88px;
  background: #0a0d13;
  border: 1px solid #2a2f3e;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(255,255,255,0.02) inset;
}
.spw-region {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6e6e6;
  overflow: hidden;
  transition: left 600ms cubic-bezier(.2,.7,.2,1),
              width 600ms cubic-bezier(.2,.7,.2,1),
              background-color 400ms ease,
              opacity 400ms ease;
}
.spw-region-header {
  background: #3a4152;
  border-right: 1px solid #1a1f2e;
  color: #c9cfde;
}
.spw-region-pointers {
  background: #2a3b66;
  border-right: 1px dashed #4a5f8f;
}
.spw-region-free {
  background: repeating-linear-gradient(
    45deg,
    rgba(255,255,255,0.02),
    rgba(255,255,255,0.02) 6px,
    rgba(255,255,255,0.06) 6px,
    rgba(255,255,255,0.06) 12px
  );
  border-left: 1px dashed #4a5f8f;
  border-right: 1px dashed #4a9f6f;
  color: #6a7389;
  font-style: italic;
}
.spw-region-cells {
  background: transparent;
}
.spw-region-label {
  padding: 0 6px;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

/* Individual pointer slot inside the pointer region */
.spw-ptr {
  position: absolute;
  top: 8px;
  bottom: 8px;
  background: #4a7cff;
  border: 1px solid #6a93ff;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #eef2ff;
  transition: left 600ms cubic-bezier(.2,.7,.2,1),
              width 600ms cubic-bezier(.2,.7,.2,1),
              background-color 400ms ease,
              opacity 400ms ease;
  overflow: hidden;
}
.spw-ptr.spw-ptr-tomb {
  background: #8a2a2a;
  border-color: #c13c3c;
  color: #ffd1d1;
  text-decoration: line-through;
}
.spw-ptr.spw-ptr-new {
  animation: spw-ptr-in 500ms ease-out;
}
.spw-ptr.spw-ptr-just-deleted {
  animation: spw-ptr-red-flash 700ms ease-in-out;
}
@keyframes spw-ptr-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spw-ptr-red-flash {
  0%, 100% { box-shadow: 0 0 0 rgba(193,60,60,0); }
  50%      { box-shadow: 0 0 10px rgba(193,60,60,0.8); }
}

/* Individual cell rectangle inside the cell region */
.spw-cell {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: #2f6a3f;
  border: 1px solid #4a9f6f;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6ffe6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: left 600ms cubic-bezier(.2,.7,.2,1),
              width 600ms cubic-bezier(.2,.7,.2,1),
              opacity 400ms ease,
              background-color 400ms ease;
}
.spw-cell.spw-cell-tomb {
  background: #2a2a2a;
  border-color: #5a5a5a;
  color: #8a7f7f;
  opacity: 0.55;
  text-decoration: line-through;
}
.spw-cell.spw-cell-new {
  animation: spw-cell-in 500ms ease-out;
}
@keyframes spw-cell-in {
  from { opacity: 0; transform: translateY(8px) scale(0.9); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Byte ruler under the page */
.spw-ruler {
  position: relative;
  height: 16px;
  margin-top: 4px;
  color: #6a7389;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.spw-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
}

/* Legend + slot list */
.spw-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #8a93a8;
}
.spw-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: -2px;
  border: 1px solid rgba(255,255,255,0.15);
}
.spw-slot-table {
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  width: 100%;
}
.spw-slot-table th, .spw-slot-table td {
  padding: 4px 10px;
  border-bottom: 1px solid #2a2f3e;
  text-align: left;
}
.spw-slot-table th { color: #8a93a8; font-weight: 500; }
.spw-slot-table tr.spw-row-tomb td { color: #8a6a6a; text-decoration: line-through; }

.spw-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #141925;
  border-top: 1px solid #2a2f3e;
  font-size: 13px;
  gap: 16px;
  flex-wrap: wrap;
}
.spw-status { color: #d1d5db; flex: 1; min-width: 0; }
.spw-stats {
  color: #8a93a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.spw-stats b { color: #e6e6e6; }
.spw-stats .spw-frag { color: #ff9a6a; }
.spw-stats .spw-frag b { color: #ffb88a; }
`,Vl=[128,256,512],Gl=[{key:"id1",value:"Tom"},{key:"id2",value:"Leslie"},{key:"id3",value:"Ron"},{key:"id4",value:"Alicia"},{key:"id5",value:"Parvati"},{key:"k",value:"longer-value-string"}];
function He(n,t){return n/t*100}
function Yl(n){const s=n/5,r=Math.max(16,Math.round(s/16)*16),o=[];for(let i=0;i<=n;i+=r)o.push(i);return o[o.length-1]!==n&&o.push(n),o}
function Xl(){const[n,t]=h.useState(256),s=h.useRef(new bs({pageSize:256})),[r,o]=h.useState(()=>s.current.snapshot()),[i,a]=h.useState("Empty page. Insert a (key, value) to lay down the first cell. (Book: Petrov, Database Internals, ch.3 — Slotted Pages.)"),[l,d]=h.useState(""),[c,p]=h.useState(""),[m,g]=h.useState(""),[w,C]=h.useState({newId:null,justDeletedId:null,compactingIds:new Set}),j=h.useRef(null);function $(A){j.current&&clearTimeout(j.current),C(A),j.current=setTimeout(()=>{C({newId:null,justDeletedId:null,compactingIds:new Set})},900)}h.useEffect(()=>()=>j.current&&clearTimeout(j.current),[]);function O(A){s.current=new bs({pageSize:A}),o(s.current.snapshot()),$({newId:null,justDeletedId:null,compactingIds:new Set}),a(`Reset page with pageSize=${A} B. Header=${bs.HEADER_SIZE} B, pointer=${bs.POINTER_SIZE} B each.`)}function q(A){const K=Number(A.target.value);t(K),O(K)}function R(A,K){if(!A||!String(A).length){a("Insert needs a non-empty key.");return}const Q=String(A),X=String(K??""),ee=s.current.insert(Q,X);if(ee.error){o(s.current.snapshot()),a(`Insert(${Q}) failed: ${ee.error}. Needed ${ee.needed} B (4 for pointer + ${ee.needed-4} for cell), only ${ee.available} B free. `+(ee.fragmented>0?`${ee.fragmented} B fragmented — try Compact.`:"Try a larger pageSize or delete something."));return}o(s.current.snapshot()),$({newId:ee.slotId,justDeletedId:null,compactingIds:new Set}),a(`Inserted slot=${ee.slotId}: cell laid at offset ${ee.offset} (${ee.size} B) + pointer ${bs.POINTER_SIZE} B. Cells grow ← from the end.`)}function D(A){if(!Number.isFinite(A)){a("Delete needs a numeric slot id.");return}const K=s.current.delete(A);if(o(s.current.snapshot()),K.error){a(`Delete(slot=${A}) failed: ${K.error}.`);return}$({newId:null,justDeletedId:A,compactingIds:new Set}),a(`Tombstoned slot=${A}. Pointer turns red; cell bytes stay (${K.reclaimable} B now fragmented). Cell will be reclaimed by Compact.`)}function B(){const A=s.current.snapshot(),K=new Set(A.pointers.filter(U=>!U.tombstone).map(U=>U.id)),Q=new Map;for(const U of A.cells)Q.set(U.id,U.offset);const X=s.current.compact(),ee=s.current.snapshot();o(ee);const F=new Set;for(const U of ee.cells)K.has(U.id)&&Q.get(U.id)!==U.offset&&F.add(U.id);$({newId:null,justDeletedId:null,compactingIds:F}),X.reclaimed===0?a(`Compact: nothing to reclaim. Free space unchanged (${X.freeAfter} B).`):a(`Compact: reclaimed ${X.reclaimed} B of fragmentation; ${F.size} cell(s) shifted right to close gaps. Free: ${X.freeBefore} B → ${X.freeAfter} B.`)}function V(){R(l.trim(),c),d(""),p("")}function T(){const A=Number(m);D(A),g("")}function _(A){A.key==="Enter"&&V()}const{header:b,pointers:x,cells:f,freeStart:u,freeEnd:y,usedBytes:v,freeBytes:I,fragmentedBytes:S}=r,H=0,M=b.size,k=b.size,P=Math.max(0,u-b.size),N=u,z=Math.max(0,y-u),E=y,J=Math.max(0,n-y),Y=h.useMemo(()=>Yl(n),[n]),se=x.length===0;return e.jsxs("div",{className:"spw-root",children:[e.jsx("style",{children:Ul}),e.jsxs("div",{className:"spw-head",children:[e.jsxs("div",{children:[e.jsx("div",{className:"spw-title",children:"Slotted Page — Chapter 3, Petrov"}),e.jsxs("div",{className:"spw-sub",children:["Variable-size records in a single page: header + pointer array growing →, cells growing ←, free space in the middle. Delete tombstones; ",e.jsx("i",{children:"compact"})," reclaims."]})]}),e.jsxs("div",{className:"spw-head-right",children:[e.jsx("label",{className:"spw-label",children:"Page size (B):"}),e.jsx("select",{className:"spw-select",value:n,onChange:q,children:Vl.map(A=>e.jsx("option",{value:A,children:A},A))}),e.jsx("button",{className:"spw-btn spw-danger",onClick:()=>O(n),children:"Reset"})]})]}),e.jsxs("div",{className:"spw-bar",children:[e.jsx("input",{className:"spw-input",placeholder:"key",value:l,onChange:A=>d(A.target.value),onKeyDown:_}),e.jsx("input",{className:"spw-input spw-input-val",placeholder:"value",value:c,onChange:A=>p(A.target.value),onKeyDown:_}),e.jsx("button",{className:"spw-btn",onClick:V,children:"Insert"}),e.jsx("span",{style:{width:8}}),e.jsx("input",{className:"spw-input spw-input-slot",placeholder:"slot id",value:m,onChange:A=>g(A.target.value)}),e.jsx("button",{className:"spw-btn spw-ghost",onClick:T,children:"Delete"}),e.jsx("button",{className:"spw-btn spw-warn",onClick:B,children:"Compact"}),e.jsx("span",{style:{width:12}}),e.jsx("span",{className:"spw-label",children:"Quick-insert:"}),Gl.map(A=>e.jsxs("button",{className:"spw-btn spw-ghost",onClick:()=>R(A.key,A.value),title:`insert("${A.key}", "${A.value}")`,children:[A.key,"=",A.value.length>10?A.value.slice(0,9)+"…":A.value]},A.key+"="+A.value))]}),e.jsxs("div",{className:"spw-canvas-wrap",children:[e.jsxs("div",{className:"spw-page","aria-label":"slotted page byte layout",children:[e.jsx("div",{className:"spw-region spw-region-header",style:{left:He(H,n)+"%",width:He(M,n)+"%"},children:e.jsxs("span",{className:"spw-region-label",children:["header ",M,"B"]})}),e.jsxs("div",{className:"spw-region spw-region-pointers",style:{left:He(k,n)+"%",width:He(P,n)+"%"},children:[P>=20&&e.jsxs("span",{className:"spw-region-label",children:["pointers ",P,"B"]}),x.map((A,K)=>{const Q=b.size+K*r.pointerSize,X=He(Q,n),ee=He(r.pointerSize,n),F=["spw-ptr"];return A.tombstone&&F.push("spw-ptr-tomb"),w.newId===A.id&&F.push("spw-ptr-new"),w.justDeletedId===A.id&&F.push("spw-ptr-just-deleted"),e.jsx("div",{className:F.join(" "),style:{left:`calc(${X}% - ${He(k,n)}%)`,width:ee+"%"},title:A.tombstone?`slot ${A.id}: tombstoned`:`slot ${A.id} → offset ${A.offset}, size ${A.size} B`,children:A.id},A.id)})]}),e.jsx("div",{className:"spw-region spw-region-free",style:{left:He(N,n)+"%",width:He(z,n)+"%"},children:z>=14&&e.jsxs("span",{className:"spw-region-label",children:["free ",z,"B"]})}),e.jsx("div",{className:"spw-region spw-region-cells",style:{left:He(E,n)+"%",width:He(J,n)+"%"}}),f.map(A=>{const K=He(A.offset,n),Q=He(A.size,n),X=["spw-cell"];A.tombstone&&X.push("spw-cell-tomb"),w.newId===A.id&&X.push("spw-cell-new");const ee=`${A.key}=${A.value}`;return e.jsx("div",{className:X.join(" "),style:{left:K+"%",width:Q+"%"},title:`slot ${A.id}${A.tombstone?" (tombstoned)":""}: offset=${A.offset}, size=${A.size}B, key="${A.key}", value="${A.value}"`,children:A.size>=14?ee:A.key},A.id)})]}),e.jsx("div",{className:"spw-ruler",children:Y.map(A=>e.jsx("span",{className:"spw-tick",style:{left:He(A,n)+"%"},children:A},A))}),e.jsxs("div",{className:"spw-legend",children:[e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#3a4152"}}),"header (fixed ",bs.HEADER_SIZE," B)"]}),e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#2a3b66"}}),"pointer array"]}),e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#4a7cff"}}),"live pointer"]}),e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#8a2a2a"}}),"tombstoned pointer"]}),e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#2f6a3f"}}),"live cell"]}),e.jsxs("span",{children:[e.jsx("span",{className:"spw-swatch",style:{background:"#2a2a2a"}}),"fragmented (tombstoned cell)"]})]}),!se&&e.jsx("div",{children:e.jsxs("table",{className:"spw-slot-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"slot"}),e.jsx("th",{children:"state"}),e.jsx("th",{children:"offset"}),e.jsx("th",{children:"size"}),e.jsx("th",{children:"key"}),e.jsx("th",{children:"value"})]})}),e.jsx("tbody",{children:x.map(A=>{const K=f.find(Q=>Q.id===A.id);return e.jsxs("tr",{className:A.tombstone?"spw-row-tomb":"",children:[e.jsx("td",{children:A.id}),e.jsx("td",{children:A.tombstone?"tombstone":A.size===0?"compacted":"live"}),e.jsx("td",{children:A.offset}),e.jsx("td",{children:A.size}),e.jsx("td",{children:K?K.key:"—"}),e.jsx("td",{children:K?K.value:"—"})]},A.id)})})]})})]}),e.jsxs("div",{className:"spw-footer",children:[e.jsxs("div",{className:"spw-status",children:["Status: ",i]}),e.jsxs("div",{className:"spw-stats",children:["slots=",e.jsx("b",{children:x.length}),"   used=",e.jsx("b",{children:v}),"B   free=",e.jsx("b",{children:I}),"B  ",e.jsxs("span",{className:"spw-frag",children:["frag=",e.jsx("b",{children:S}),"B"]}),"   pageSize=",e.jsx("b",{children:n}),"B"]})]})]})}

export default Xl;
export { Xl as Component };
export function mount(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error("Mount target not found: " + container);
  const root = ReactDOM.createRoot(el);
  root.render(e.jsx(Xl, {}));
  return () => root.unmount();
}
