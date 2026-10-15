import {validAttachment} from './attachments.js';
import {renderPdf} from './pdf-preview.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createFilePreview(dialog,{load,urls=URL,makeLink=()=>document.createElement('a'),pdfRenderer=renderPdf}={}){
 let objectURL='',attachment=null,generation=0,cleanPdf=null;
 function clear(){generation++;cleanPdf?.();cleanPdf=null;if(objectURL)urls.revokeObjectURL(objectURL);objectURL='';attachment=null;}
 dialog?.addEventListener('close',clear);
 dialog?.addEventListener('click',e=>{if(e.target.closest('[data-preview-close]'))dialog.close();if(e.target.closest('[data-preview-download]')&&objectURL){const link=makeLink();link.href=objectURL;link.download=attachment.name;link.click();}});
 return {close(){dialog?.close();clear();},async show(file){
  if(!dialog||!validAttachment(file))throw Error('미리보기 파일 정보를 확인하세요.');
  clear();const current=generation;attachment=file;
  const head=`<header class="preview-header"><div><small>결과물 미리보기</small><h2 id="preview-title">${escape(file.name)}</h2></div><button type="button" class="icon-btn" data-preview-close aria-label="미리보기 닫기">×</button></header>`;
  dialog.innerHTML=head+'<div class="preview-body" role="status">파일을 불러오고 있어요.</div>';if(!dialog.open)dialog.showModal();
  try{const blob=await load(file);if(current!==generation)return;objectURL=urls.createObjectURL(new Blob([blob],{type:file.type}));
   dialog.innerHTML=head+`<div class="preview-body">${file.type==='application/pdf'?'<div class="pdf-host" data-pdf-host>PDF를 불러오고 있어요.</div>':`<img src="${objectURL}" alt="${escape(file.name)}">`}</div><footer class="preview-footer"><p>미리보기가 표시되지 않으면 다운로드해서 확인하세요.</p><button type="button" class="primary" data-preview-download>다운로드</button></footer>`;
   if(file.type==='application/pdf'){const cleanup=await pdfRenderer(blob,dialog.querySelector('[data-pdf-host]'));if(current!==generation)cleanup?.();else cleanPdf=cleanup;}
  }catch(err){if(current===generation)dialog.innerHTML=head+'<div class="preview-body" role="alert">'+escape(err.message)+'</div>'+(objectURL?'<footer class="preview-footer"><button type="button" class="primary" data-preview-download>다운로드</button></footer>':'');}
 }};
}
