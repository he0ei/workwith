import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {postgres,ids} from './postgres-helper.mjs';
test('private artifact bucket limits and team Storage policies enforce member access',async t=>{
 const pg=await postgres();await pg.db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 await pg.db.exec(await readFile(new URL('../supabase/migrations/202610150001_artifact_storage.sql',import.meta.url),'utf8'));
 const bucket=(await pg.db.query('select * from storage.buckets')).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp','application/pdf']);
 const path=ids.sj+'/example.png';
 await t.test('member upload only in own folder',async()=>{await pg.as('authenticated','sj',()=>pg.db.query('insert into storage.objects values($1,$2)',['workwith-artifacts',path]));await assert.rejects(pg.as('authenticated','sy',()=>pg.db.query('insert into storage.objects values($1,$2)',['workwith-artifacts',ids.sj+'/forged.png'])));});
 await t.test('anonymous and nonmember access blocked',async()=>{for(const [role,user]of [['anon',null],['authenticated','outsider']]){assert.equal((await pg.as(role,user,()=>pg.db.query('select * from storage.objects'))).rows.length,0);await assert.rejects(pg.as(role,user,()=>pg.db.query('insert into storage.objects values($1,$2)',['workwith-artifacts',ids.outsider+'/x.png'])));}});
 await t.test('team reads shared artifacts; immutable path cannot be overwritten',async()=>{assert.equal((await pg.as('authenticated','sy',()=>pg.db.query('select * from storage.objects'))).rows.length,1);await pg.as('authenticated','sj',()=>pg.db.query("update storage.objects set name='changed'"));assert.equal((await pg.db.query('select name from storage.objects')).rows[0].name,path);});
 await t.test('team can clean files while another bucket stays inaccessible',async()=>{await pg.db.query("insert into storage.objects values('other-private','private.png')");assert.equal((await pg.as('authenticated','sy',()=>pg.db.query('delete from storage.objects returning *'))).rows.length,1);assert.equal((await pg.db.query('select * from storage.objects')).rows.length,1);});
 await pg.close();
});
