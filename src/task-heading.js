// Conservative wording changes only. Full context stays in the meeting source.
const actions='기획|작성|검토|정리|제작|개선|확인|공유|설명|준비|분석|조사|설계|개발|수정|등록|발송|배포|학습|파악|수집|반영|진행|협의|논의|발표|예약|점검|테스트|구성';
export function compactTaskTitle(value){
 let title=String(value??'').trim().replace(/[.!。]+$/u,'').replace(/^(?:이번\s*주|다음\s*주|금주|차주)(?:에는|에|까지)?\s+/u,'');
 title=title.replace(/서비스\s*소개서/gu,'서비스 소개서');
 title=title.replace(/\s+(?:더\s*)?(?:신뢰감(?:이)?\s*있는|신뢰할\s*수\s*있는|직관적인|깔끔한|전문적인|세련된|설득력\s*있는|이해하기\s*쉬운|고급스러운)\s*방향으로\s*(?=개선|수정|제작|구성|정리)/gu,' ');
 title=title.replace(/\s*\([^()]*?(?:확인 필요|검토 필요|완료하기|발송 예정)[^()]*\)\s*$/u,'');
 title=title.replace(new RegExp('('+actions+')(?:을|를)\\s*(?:진행|수행|실시)(?:한다|하기|합니다|할 예정)$','u'),'$1');
 title=title.replace(new RegExp('('+actions+')\\s*(?:해야\\s*한다|하기로\\s*(?:했다|한다|함)|할\\s*예정(?:이다)?|한다|합니다|하기|함)(?=$|[ ,])','gu'),'$1');
 title=title.replace(new RegExp('('+actions+')하고\\s*','gu'),'$1 및 ');
 title=title.replace(/살펴보고\s*/gu,'검토 및 ').replace(/살펴본다$/u,'검토').replace(/만들기$|만든다$/u,'제작');
 title=title.replace(new RegExp('(?:을|를)\\s+(?=(?:'+actions+')(?:$|\\s|,))','gu'),' ');
 return title.replace(/\s+/gu,' ').trim();
}
