// Recognize an opening delivery subject, not every implementation step in a message.
// Keep the original body untouched; it is archived by the existing registration path.
export function deliveryIntake(body){
 const lines=String(body??'').normalize('NFKC').replace(/[\u2028\u2029]/gu,'\n').split(/\r\n?|\n/u).map(l=>l.trim().replace(/\\+$/u,'').trim()).filter(Boolean);
 let first=lines[0]||'';
 if(/^안녕하세요[.!。]?$/u.test(first))first=lines[1]||'';
 first=first.replace(/^(?:제목\s*[:：]\s*|안녕하세요[.!。]\s*)/u,'');
 const match=first.match(/^(.{2,120}?)\s+(?:(?:작업|제작|수정|개선)\s*본|결과물|산출물|시안|초안|최종본|파일)\s*(?:을|를)?\s*(?:전달(?:드립니다|합니다|드려요)|공유(?:드립니다|합니다|드려요)|보내(?:드립니다|드려요|요))(?:[.!。\s]|$)/u);
 if(!match)return null;
 let subject=match[1].replace(/마이\s*맘|my\s*mam(?![a-z0-9])/giu,'MY MAM').replace(/랜딩\s*페이지/gu,'랜딩페이지').replace(/상세\s*페이지/gu,'상세페이지').replace(/\s+/gu,' ').trim();
 if(/^(?:참고|예시|샘플)\s*(?:용|자료)/u.test(subject)||!/(?:랜딩페이지|상세페이지|소개서|제안서|기획안|디자인|웹\s*사이트|홈페이지|배너|영상|콘텐츠|리포트|보고서)/u.test(subject))return null;
 subject=subject.replace(/\s+(?:제작|작업|개선|수정)$/u,'').trim();
 return {subject,title:(subject+' 제작').slice(0,200),archiveTitle:(subject+' 전달 기록').slice(0,200),source:String(body).slice(0,8000)};
}
