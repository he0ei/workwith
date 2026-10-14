import {API_BASE} from './config.js';
export class SharedStore{
 constructor(fetcher=(...args)=>fetch(...args),storage=sessionStorage){this.fetcher=fetcher;this.storage=storage;this.token=storage.getItem('workwith-session')||'';}
 async request(path,body){
  const r=await this.fetcher(API_BASE+'/api/'+path,{method:body===undefined?'GET':'POST',credentials:'include',cache:'no-store',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.token?{Authorization:'Bearer '+this.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await r.json();if(!r.ok){const error=Error(value.error||'서버 연결에 실패했습니다.');error.status=r.status;throw error;}return value;
 }
 async login(user,password){const r=await this.request('login',{user,password});this.token=r.token;this.storage.setItem('workwith-session',r.token);return this.request('state');}
 async logout(){try{await this.request('logout',{});}finally{this.token='';this.storage.removeItem('workwith-session');}}
 read(){return this.request('state');}
 version(){return this.request('version');}
 change(action,revision,baseVersion){return this.request('change',{action,revision,baseVersion});}
}
