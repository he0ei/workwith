import {mkdir,copyFile,cp} from 'node:fs/promises';
const source=new URL('../node_modules/pdfjs-dist/',import.meta.url),target=new URL('../src/vendor/pdfjs/',import.meta.url);
await mkdir(target,{recursive:true});
for(const [from,to]of [['build/pdf.mjs','pdf.js'],['build/pdf.worker.mjs','pdf.worker.js'],['LICENSE','LICENSE']])await copyFile(new URL(from,source),new URL(to,target));
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(new URL(folder+'/',source),new URL(folder+'/',target),{recursive:true});
