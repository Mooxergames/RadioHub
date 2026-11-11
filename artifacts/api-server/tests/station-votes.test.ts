import {mock,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {AddressInfo} from 'node:net';

// Deterministic transactional adapter: no application/production database access.
let votes=823554;
const identities=new Set<string>();
let fail=false;
let queue=Promise.resolve();
let rollbacks=0;
const queries:string[]=[];
const pool={
  async connect(){
    let unlock!:()=>void;
    const previous=queue;queue=new Promise<void>(r=>{unlock=r;});await previous;
    const snapshot={votes,identities:new Set(identities)};
    return {release:unlock,async query(sql:string,args:any[]=[]):Promise<any>{
      queries.push(sql);
      if(sql==='ROLLBACK'){votes=snapshot.votes;identities.clear();snapshot.identities.forEach(x=>identities.add(x));rollbacks++;return {rows:[]};}
      if(sql.includes('INSERT INTO station_votes')){
        const key=`${args[0]}:${args[1]}`;if(identities.has(key))return{rowCount:0,rows:[]};
        identities.add(key);return{rowCount:1,rows:[{station_id:args[0]}]};
      }
      if(sql.includes('UPDATE stations SET votes')){if(fail)throw Error('SQL failure');votes++;return{rowCount:1,rows:[]};}
      if(sql.startsWith('SELECT votes'))return{rowCount:1,rows:[{votes}]};
      return{rows:[]};
    }};
  },
  async query(_sql:string,args:any[]){return {rows:[{votes,hasVoted:identities.has(`${args[0]}:${args[1]}`)}]};},
};
mock.module('../src/postgres-runtime',{namedExports:{getPostgresPool:()=>pool}});
mock.module('../src/data/station-identity-store',{namedExports:{lockStationIdentity:async(id:string)=>id==='missing'?null:id==='alias'?'station':id,resolveStationId:async(id:string)=>id==='missing'?null:id==='alias'?'station':id}});
const store=await import('../src/data/station-vote-store');
const {registerStationVoteRoutes}=await import('../src/routes/station-vote-routes');

test('100 concurrent requests add exactly one vote; another account adds one; aliases share identity',async()=>{
 const results=await Promise.all(Array.from({length:100},()=>store.voteForStation('station','account-a')));
 assert.equal(votes,823555);assert.equal(results.filter(r=>!r?.alreadyVoted).length,1);
 assert.equal((await store.voteForStation('alias','account-a'))?.alreadyVoted,true);
 assert.equal((await store.voteForStation('station','account-b'))?.votes,823556);
 assert.deepEqual(await store.stationVoteState('station','account-a'),{votes:823556,hasVoted:true});
 assert.equal(await store.voteForStation('missing','account-a'),null);
});
test('failed increment rolls back identity so retry can succeed',async()=>{
 fail=true;await assert.rejects(store.voteForStation('station','account-c'),/SQL failure/);fail=false;
 assert.equal(rollbacks,1);assert.equal(identities.has('station:account-c'),false);
 assert.equal((await store.voteForStation('station','account-c'))?.alreadyVoted,false);
 assert.ok(queries.some(sql=>sql.includes('ON CONFLICT (station_id,user_id) DO NOTHING')));
});
test('HTTP rejects anonymous and spoofed body identity; duplicate is acknowledged without increment',async()=>{
 const app=express();app.use(express.json());
 registerStationVoteRoutes(app,async req=>req.headers.authorization==='Bearer fixture'?'http-account':undefined);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stations/station/vote`;
 try{
  assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'spoofed'})})).status,401);
  const before=votes;
  const first=await fetch(base,{method:'POST',headers:{authorization:'Bearer fixture'}});assert.equal(first.status,200);
  assert.equal((await first.json()).alreadyVoted,false);
  const second=await fetch(base,{method:'POST',headers:{authorization:'Bearer fixture'}});
  assert.equal((await second.json()).alreadyVoted,true);assert.equal(votes,before+1);
  const state=await fetch(base,{headers:{authorization:'Bearer fixture'}});
  assert.equal(state.headers.get('cache-control'),'private, no-store');assert.equal((await state.json()).hasVoted,true);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
