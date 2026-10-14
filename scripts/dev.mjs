import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {localDB} from './local-db.mjs';
import worker from '../worker/index.js';
const root=resolve(new URL('../',import.meta.url).pathname);
await mkdir(resolve(root,'.wrangler/local'),{recursive:true});
const DB=localDB(resolve(root,'.wrangler/local/workwith.sqlite'));
DB.sqlite.exec(await readFile(resolve(root,'migrations/0001_shared.sql'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const env={DB,SETUP_TOKEN:process.env.SETUP_TOKEN,ASSETS:{async fetch(request){
 const url=new URL(request.url),file=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(root+'/')||!types[extname(file)])return new Response('Not found',{status:404});
 try{return new Response(await readFile(file),{headers:{'Content-Type':types[extname(file)],'Cache-Control':'no-store'}});}catch{return new Response('Not found',{status:404});}
}}};
createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const payload=Buffer.concat(chunks);const request=new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(payload.length?{body:payload}:{} )});const result=await worker.fetch(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500).end('Local server error');}}).listen(4173,'127.0.0.1',()=>console.log('Local D1-compatible development server: http://localhost:4173 (SQLite, not production D1)'));
