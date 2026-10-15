// PDF.js is shipped locally; file bytes never go to an external viewer.
export async function renderPdf(blob,container,{loadLibrary=()=>import('./vendor/pdfjs/pdf.js')}={}){
 const pdfjs=await loadLibrary();const base=new URL('./vendor/pdfjs/',import.meta.url);
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.js',base).href;
 let closed=false,busy=false,pageNumber=1,renderTask=null;
 const loading=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false,useSystemFonts:true,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',base).href,wasmUrl:new URL('wasm/',base).href});
 let pdf;try{pdf=await loading.promise;}catch(err){await loading.destroy().catch(()=>{});throw Error('PDF를 표시하지 못했어요. 다운로드해서 확인해 주세요.');}
 if(!container.isConnected){await loading.destroy();return ()=>{};}
 container.innerHTML='<div class="pdf-controls"><button type="button" data-pdf-prev aria-label="이전 페이지">←</button><span role="status" data-pdf-count></span><button type="button" data-pdf-next aria-label="다음 페이지">→</button></div><div class="pdf-page"><canvas aria-label="PDF 문서 페이지"></canvas></div>';
 const canvas=container.querySelector('canvas'),previous=container.querySelector('[data-pdf-prev]'),next=container.querySelector('[data-pdf-next]'),count=container.querySelector('[data-pdf-count]');
 async function render(){if(closed||busy)return;busy=true;previous.disabled=next.disabled=true;try{const page=await pdf.getPage(pageNumber);if(closed)return;const viewport=page.getViewport({scale:Math.min(1.5,Math.max(280,container.clientWidth-40)/page.getViewport({scale:1}).width)});canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;count.textContent=pageNumber+' / '+pdf.numPages+' 페이지';}catch(err){if(!closed)count.textContent='페이지를 표시하지 못했어요. 다운로드해서 확인해 주세요.';}finally{busy=false;if(!closed){previous.disabled=pageNumber<=1;next.disabled=pageNumber>=pdf.numPages;}}}
 previous.addEventListener('click',()=>{if(!busy&&pageNumber>1){pageNumber--;return render();}});next.addEventListener('click',()=>{if(!busy&&pageNumber<pdf.numPages){pageNumber++;return render();}});
 await render();return ()=>{closed=true;renderTask?.cancel();loading.destroy().catch(()=>{});};
}
