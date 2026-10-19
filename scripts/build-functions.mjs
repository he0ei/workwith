import {mkdir,readFile,writeFile} from 'node:fs/promises';
const shared=new URL('../supabase/functions/_shared/',import.meta.url);await mkdir(shared,{recursive:true});
await writeFile(new URL('attachments.js',shared),await readFile(new URL('../src/attachments.js',import.meta.url)));
await writeFile(new URL('model.js',shared),await readFile(new URL('../src/model.js',import.meta.url)));
await writeFile(new URL('workspace.js',shared),(await readFile(new URL('../server/workspace.js',import.meta.url),'utf8')).replace("'../src/model.js'","'./model.js'"));
await writeFile(new URL('link-access.js',shared),(await readFile(new URL('../server/link-access.js',import.meta.url),'utf8')).replaceAll("'../src/","'./"));
await writeFile(new URL('supabase-handler.js',shared),await readFile(new URL('../server/supabase-handler.js',import.meta.url)));
console.log('Supabase Edge Function shared modules generated from the canonical model.');

const attachments=(await readFile(new URL('../src/attachments.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const model=(await readFile(new URL('../src/model.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const core=(await readFile(new URL('../server/workspace.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const linkHandler=(await readFile(new URL('../server/link-access.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const handler=(await readFile(new URL('../server/supabase-handler.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
await writeFile(new URL('dashboard.ts',shared),attachments+'\n'+model+'\n'+core+'\n'+linkHandler+'\n'+handler+"\nDeno.serve(request=>handle(request,{APP_ORIGIN:'https://he0ei.github.io',SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),WORKSPACE_LINK_SHA256:Deno.env.get('WORKSPACE_LINK_SHA256')??''}));\n");
