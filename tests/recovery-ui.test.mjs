import {test} from 'node:test';
import assert from 'node:assert/strict';
import {start} from '../src/app.js';
test('recovery URL is cleared before verification and renders reset form without reading workspace',async()=>{
 const app={innerHTML:''},events=[];globalThis.location={protocol:'https:',pathname:'/workwith/',search:'',hash:'#type=recovery&access_token=synthetic'};
 globalThis.document={querySelector:s=>s==='#app'?app:null,addEventListener(){}};globalThis.window={addEventListener(){},history:{replaceState(_s,_t,url){events.push('clear');assert.equal(url,'/workwith/');}}};
 await start({configured:()=>true,importRecovery:async()=>{events.push('verify');return true;},read:()=>{throw Error('must not read before reset');}});assert.deepEqual(events,['clear','verify']);assert.match(app.innerHTML,/新|새 비밀번호 설정/);assert.match(app.innerHTML,/autocomplete="new-password"/);assert.ok(!app.innerHTML.includes('synthetic'));
});
