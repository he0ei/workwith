// D1's used SQL methods adapted to SQLite for local development and integration tests.
import {DatabaseSync} from 'node:sqlite';
export function localDB(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
 const db={sqlite,prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){const meta=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(meta.changes)}};}};},async batch(statements){
  sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements){if(/^\s*SELECT/i.test(s.sql))results.push({results:sqlite.prepare(s.sql).all(...s.args),meta:{changes:0}});else{const m=sqlite.prepare(s.sql).run(...s.args);results.push({results:[],meta:{changes:Number(m.changes)}});}}sqlite.exec('COMMIT');return results;}catch(err){sqlite.exec('ROLLBACK');throw err;}
 }};return db;
}
