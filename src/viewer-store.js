// Read-only store for the no-login viewer site: the same screens as the team app,
// fed by the viewer link's own server (/v/<token>/api/...). It never writes.
export class ViewerStore{
 constructor(fetcher=(...args)=>fetch(...args),page=location){
  this.fetcher=fetcher;this.preview=true;this.viewer=true;
  const link=page.pathname.match(/^\/v\/[A-Za-z0-9_-]{43}\//);this.base=link?link[0]:'./';
 }
 configured(){return true;}
 async read(){
  const r=await this.fetcher(this.base+'api/state',{cache:'no-store'});
  if(!r.ok)throw Error('업무 현황을 불러오지 못했습니다. 받은 링크 그대로 다시 열어 주세요.');
  const {state}=await r.json();return {state,versions:{},user:'ceo',passwordChangeRequired:false};
 }
 async version(){return {revision:-1};}
 async change(){throw Error('읽기 전용 화면에서는 저장할 수 없습니다.');}
 async downloadAttachment(attachment){
  const r=await this.fetcher(this.base+'api/file?bucket='+encodeURIComponent(attachment.bucket)+'&path='+encodeURIComponent(attachment.path),{cache:'no-store'});
  if(!r.ok)throw Error('첨부 파일을 열 수 없습니다.');return r.blob();
 }
 clearSession(){}
 async logout(){}
}
