import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './prepare-pdf.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm'};
createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root, '.'+ (pathname==='/'?'/index.html':pathname));
  if (!path.startsWith(root) || !['.html','.js','.css'].includes(extname(path))&&!pathname.startsWith('/src/vendor/pdfjs/')) {res.writeHead(403).end();return;}
  const file=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(file);
 } catch {res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Local HTTP preview ready'));
