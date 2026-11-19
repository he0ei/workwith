import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installDateRangeSelect,dateRange} from '../src/date-range-select.js';

// Two week rows, 700px wide: each day is 100px.
function board(start,top){return {dataset:{weekTimeline:start,monthWeek:'true'},top,getBoundingClientRect:()=>({left:0,right:700,width:700})};}
function setup(canStart=()=>true){
 const rows=[board('2026-11-15',0),board('2026-11-22',100)],listeners={},selected=[],headers=['2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-22','2026-11-23'].map(d=>({dataset:{planDate:d},cls:new Set(),classList:{toggle(c,on){on?this.owner.cls.add(c):this.owner.cls.delete(c);}}}));headers.forEach(h=>h.classList.owner=h);
 const at=(x,y)=>{const b=rows.find(r=>y>=r.top&&y<r.top+100);return {closest:s=>s==='[data-month-week]'?b:null};};
 const root={addEventListener:(n,f)=>listeners[n]=f,elementFromPoint:at,querySelectorAll:()=>headers};
 const api=installDateRangeSelect(root,{canStart,select:r=>selected.push(r)});
 const target=(x,y,extra=null)=>({closest:s=>s==='[data-month-week]'?at(x,y).closest(s):s.includes('data-schedule-bar')?extra:null,setPointerCapture(){},hasPointerCapture:()=>false});
 const down=(x,y,o={})=>listeners.pointerdown({target:o.target||target(x,y,o.bar),button:0,pointerId:1,pointerType:o.type||'mouse',clientX:x,clientY:y});
 const move=(x,y)=>listeners.pointermove({pointerId:1,clientX:x,clientY:y,cancelable:true,preventDefault(){}});
 const up=(x,y)=>listeners.pointerup({pointerId:1,clientX:x,clientY:y});
 return {api,selected,headers,down,move,up};
}

test('dateRange orders dates either way',()=>{assert.deepEqual(dateRange('2026-11-20','2026-11-17'),{start:'2026-11-17',due:'2026-11-20'});assert.deepEqual(dateRange('2026-11-17','2026-11-17'),{start:'2026-11-17',due:'2026-11-17'});});

test('dragging across days, even into the next week row, selects that range and highlights it',()=>{
 const x=setup();x.down(150,50);x.move(350,50);
 assert.deepEqual([...x.headers.filter(h=>h.cls.has('range-selected'))].map(h=>h.dataset.planDate),['2026-11-16','2026-11-17','2026-11-18']);
 x.move(150,150);x.up(150,150);
 assert.deepEqual(x.selected,[{start:'2026-11-16',due:'2026-11-23'}]);assert.ok(x.headers.every(h=>!h.cls.has('range-selected')));assert.equal(x.api.consumeClick(),true);
 const back=setup();back.down(350,50);back.move(50,50);back.up(50,50);assert.deepEqual(back.selected,[{start:'2026-11-15',due:'2026-11-18'}]);
});

test('a plain click, a bar, touch input or a blocked state never opens a range',()=>{
 let x=setup();x.down(150,50);x.up(150,50);assert.deepEqual(x.selected,[]);assert.equal(x.api.consumeClick(),false);
 x=setup();x.down(150,50,{bar:{}});x.move(350,50);x.up(350,50);assert.deepEqual(x.selected,[]);
 x=setup();x.down(150,50,{type:'touch'});x.move(350,50);x.up(350,50);assert.deepEqual(x.selected,[]);
 x=setup(()=>false);x.down(150,50);x.move(350,50);x.up(350,50);assert.deepEqual(x.selected,[]);
});
