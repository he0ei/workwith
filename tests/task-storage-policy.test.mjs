import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {postgres,ids} from './postgres-helper.mjs';
test('task file RLS follows current visibility, protects private files and revokes old uploader access',async()=>{
 const pg=await postgres();await pg.db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 await pg.db.exec(await readFile(new URL('../supabase/migrations/202610150002_task_storage.sql',import.meta.url),'utf8'));
 const bucket=(await pg.db.query('select * from storage.buckets')).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);
 const path=ids.sy+'/task-id/file.pdf',query=(user,sql,args=[])=>pg.as('authenticated',user,()=>pg.db.query(sql,args));
 await query('sy','insert into storage.objects values($1,$2)',['workwith-task-files',path]);
 assert.equal((await query('sj','select * from storage.objects')).rows.length,0);assert.equal((await query('sy','select * from storage.objects')).rows.length,1);
 await pg.db.query('insert into public.workwith_records(entity,id,payload,version) values($1,$2,$3,1)',['tasks','task-id',JSON.stringify({id:'task-id',owner:'sj',visibility:'shared',attachment:{bucket:'workwith-task-files',path}})]);
 assert.equal((await query('jh','select * from storage.objects')).rows.length,1);
 await pg.db.query("update public.workwith_records set payload=jsonb_set(payload,'{visibility}','\"private\"') where id='task-id'");
 assert.equal((await query('sj','select * from storage.objects')).rows.length,1);for(const person of ['sy','jh','outsider'])assert.equal((await query(person,'select * from storage.objects')).rows.length,0);
 assert.equal((await query('sy','delete from storage.objects returning *')).rows.length,0);assert.equal((await pg.as('anon',null,()=>pg.db.query('select * from storage.objects'))).rows.length,0);
 await assert.rejects(query('jh','insert into storage.objects values($1,$2)',['workwith-task-files',ids.sy+'/task-id/forged.pdf']));
 assert.equal((await query('sj','delete from storage.objects returning *')).rows.length,1);await pg.close();
});
