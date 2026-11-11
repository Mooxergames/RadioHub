import {test} from 'node:test';
import assert from 'node:assert/strict';
import {radioRequest,canonicalRadio} from '../src/utils/chat-radio';
import {ChatListeningRegistry} from '../src/services/chat-listening';
const id='507f1f77bcf86cd799439014';
test('radio shares carry a canonical station and never trust supplied stream URLs or titles',()=>{
 const request=radioRequest(JSON.stringify({version:1,stationId:id,intent:'together',name:'Forged',url:'https://evil.test/live',caption:'Join me'}));assert.ok(request);
 const radio=canonicalRadio(request,{_id:id,name:'Real Radio',country:'Austria',tags:'jazz,blues',favicon:'https://example.test/radio.png',url:'https://stream.test'});
 assert.equal(radio.genre,'jazz');assert.equal(radio.name,'Real Radio');assert.equal(radio.caption,'Join me');assert.equal('url' in radio,false);
 for(const content of ['broken',JSON.stringify({version:1,stationId:'https://evil.test',intent:'gift'}),JSON.stringify({version:1,stationId:id,intent:'x'}),JSON.stringify({version:1,stationId:id,intent:'gift',caption:'x'.repeat(301)})])assert.equal(radioRequest(content),null);
});
test('custom radio invitations require a nonempty message and preserve it',()=>{assert.equal(radioRequest(JSON.stringify({version:1,stationId:id,intent:'custom',caption:'  '})),null);const request=radioRequest(JSON.stringify({version:1,stationId:id,intent:'custom',caption:'Bu yayın senin için'}));assert.ok(request);assert.equal(canonicalRadio(request,{_id:id,name:'Radio'}).caption,'Bu yayın senin için');});
test('listening expires, is conversation-scoped and rejects out-of-order restarts',()=>{
 const registry=new ChatListeningRegistry();assert.equal(registry.update('a','b',id,'device-one',1,true,1000),true);
 assert.equal(registry.between('a','b',1001).length,1);assert.equal(registry.between('c','b',1001).length,0);
 registry.update('a','b',id,'device-one',3,false,2000);assert.equal(registry.update('a','b',id,'device-one',2,true,2100),false);assert.equal(registry.between('a','b',2101).length,0);
 registry.update('b','a',id,'device-two',1,true,3000);assert.equal(registry.between('a','b',39000).length,0);
});
test('listening bounds each account to five active devices',()=>{const registry=new ChatListeningRegistry();for(let i=0;i<12;i++)registry.update('a','b',`${i}`,'device-'+i,1,true,1000);assert.equal(registry.between('a','b',1001).length,5);});

test('shared station identity follows a pin even when listeners opened different messages',()=>{
 const registry=new ChatListeningRegistry();registry.update('a','b','message-one','device-one',1,true,1000,id);registry.update('b','a','message-two','device-two',1,true,1000,id);
 const entries=registry.between('a','b',1001);assert.equal(entries.length,2);assert.ok(entries.every(entry=>entry.stationId===id));
 registry.update('a','b','message-one','device-one',2,false,1100,id);assert.equal(registry.between('a','b',1101).length,1);
});
