const encoder=new TextEncoder();
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
export async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256)),x=>x.toString(16).padStart(2,'0')).join('');
}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function session(request,db){
 const bearer=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)workwith_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const token=bearer||cookie;if(!token)return null;
 return db.prepare('SELECT user_id,hash FROM sessions WHERE hash=? AND expires>?').bind(await digest(token),Date.now()).first();
}
export async function rateLimit(request,db){
 const hour=Math.floor(Date.now()/3600000),key=await digest((request.headers.get('CF-Connecting-IP')||'local')+':'+hour);
 await db.prepare('INSERT INTO login_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,(hour+1)*3600000).run();
 const row=await db.prepare('SELECT count FROM login_attempts WHERE key=?').bind(key).first();
 return row.count<=20;
}
export const cookie=(token='',maxAge=28800)=>`workwith_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
