import {test, before, after, mock} from 'node:test';
import assert from 'node:assert/strict';
import passport from 'passport';
let existing: any = null;
let writes: any[] = [];
const noop = async () => undefined;
mock.module('../src/data/postgres-user-store', {namedExports: {
  userStore:'postgres', newPublicUserId:()=> 'fixture-user', pgDeleteUser:noop,
  pgFindUserById:noop, pgUserSlugExists:async()=>false,
  pgFindUserByIdentity:async(query:any)=> existing && (query.googleId ? existing.googleId === query.googleId : existing.email === query.email) ? {...existing} : null,
  pgUpdateUser:async(id:any,patch:any)=> {writes.push(patch);},
  pgCreateUser:async(input:any)=> {writes.push(input);return {...input,_id:input.id};},
}});
const previous = {id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET};
let verify: any;
before(async()=> {
  process.env.GOOGLE_CLIENT_ID='fixture-client'; process.env.GOOGLE_CLIENT_SECRET='fixture-secret';
  await import('../src/auth/passport-config');
  verify=(passport as any)._strategy('google')._verify;
});
after(()=> {
  for(const [key,value] of [['GOOGLE_CLIENT_ID',previous.id],['GOOGLE_CLIENT_SECRET',previous.secret]]) {
    if(value===undefined) delete process.env[key!]; else process.env[key!]=value;
  }
});
async function login(email:string,verified=true) {
  writes=[];
  return new Promise<any>(resolve=>void verify('unused','unused', {id:'google-sub',displayName:'Fixture',emails:[{value:email}],_json:{email,email_verified:verified}},(error:any,user:any)=>resolve({error,user})));
}
test('web Google creates a new verified account in the shared user store',async()=> {
  existing=null;
  const result=await login('new@gmail.com');
  assert.equal(result.user.googleId,'google-sub'); assert.equal(writes.length,1);
});
test('web Google links authoritative mail but cannot overwrite a different Google identity',async()=> {
  existing={_id:'existing',email:'a@gmail.com',status:'active'};
  assert.equal((await login(existing.email)).user.googleId,'google-sub');
  existing.googleId='other-sub';
  assert.equal((await login(existing.email)).user,false); assert.equal(writes.length,0);
});
test('web Google rejects suspended users, unverified mail and unsafe third-party linking',async()=> {
  existing={_id:'existing',googleId:'google-sub',email:'a@gmail.com',status:'suspended'};
  assert.equal((await login(existing.email)).user,false); assert.equal(writes.length,0);
  existing={_id:'existing',email:'a@example.test',status:'active'};
  assert.equal((await login(existing.email)).user,false); assert.equal(writes.length,0);
  existing=null;
  assert.ok((await login('a@gmail.com',false)).error); assert.equal(writes.length,0);
});
