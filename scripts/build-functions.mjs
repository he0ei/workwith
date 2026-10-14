import {mkdir,readFile,writeFile} from 'node:fs/promises';
const shared=new URL('../supabase/functions/_shared/',import.meta.url);await mkdir(shared,{recursive:true});
await writeFile(new URL('model.js',shared),await readFile(new URL('../src/model.js',import.meta.url)));
await writeFile(new URL('workspace.js',shared),(await readFile(new URL('../server/workspace.js',import.meta.url),'utf8')).replace("'../src/model.js'","'./model.js'"));
await writeFile(new URL('supabase-handler.js',shared),await readFile(new URL('../server/supabase-handler.js',import.meta.url)));
console.log('Supabase Edge Function shared modules generated from the canonical model.');
