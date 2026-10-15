export const ATTACHMENT_BUCKET='workwith-artifacts';
export const MAX_ATTACHMENT_BYTES=5*1024*1024;
export const ATTACHMENT_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function validAttachment(a){return Boolean(a&&a.bucket===ATTACHMENT_BUCKET&&typeof a.name==='string'&&a.name.length>0&&a.name.length<=200&&!/[\x00-\x1f]/.test(a.name)&&Number.isInteger(a.size)&&a.size>0&&a.size<=MAX_ATTACHMENT_BYTES&&ATTACHMENT_TYPES[a.type]&&new RegExp('^'+uuid+'/'+uuid+'\\.'+ATTACHMENT_TYPES[a.type]+'$','i').test(a.path));}
export async function attachmentBytes(file){
 if(!file||!ATTACHMENT_TYPES[file.type])throw Error('JPG·PNG·WebP 이미지 또는 PDF만 첨부할 수 있습니다.');
 if(!file.name||file.name.length>200||/[\x00-\x1f]/.test(file.name))throw Error('파일 이름을 확인하세요.');
 if(!Number.isInteger(file.size)||file.size<=0||file.size>MAX_ATTACHMENT_BYTES)throw Error('첨부 파일은 0바이트 초과, 5MB 이하만 가능합니다.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const prefix=(...values)=>values.every((v,i)=>bytes[i]===v);
 const valid=file.type==='image/jpeg'?prefix(255,216,255):file.type==='image/png'?prefix(137,80,78,71,13,10,26,10):file.type==='image/webp'?prefix(82,73,70,70)&&[87,69,66,80].every((v,i)=>bytes[i+8]===v):prefix(37,80,68,70,45);
 if(bytes.byteLength!==file.size||!valid)throw Error('파일 내용이 선택한 형식과 일치하지 않습니다.');
 return bytes;
}
