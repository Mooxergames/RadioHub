import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatAudioExtension,validChatAudioPath} from '../src/utils/chat-audio';
test('voice uploads recognize recorder containers and reject markup or unsupported bytes',()=>{
 assert.equal(chatAudioExtension(Buffer.from([0x1a,0x45,0xdf,0xa3,...Array(8).fill(0)])),'webm');
 assert.equal(chatAudioExtension(Buffer.from('\0\0\0\x18ftypM4A ')),'m4a');
 assert.equal(chatAudioExtension(Buffer.from('OggS123456789')),'ogg');
 for(const data of ['<script>alert(1)</script>','<?php echo 1; ?>','not-a-voice-note','abc'])assert.equal(chatAudioExtension(Buffer.from(data)),null);
});
test('voice media references allow only server-generated uploads',()=>{
 assert.equal(validChatAudioPath('/uploads/chat/voice-123abc.webm'),true);
 for(const value of ['https://evil.test/voice-a.m4a','/uploads/chat/../voice-a.ogg','/uploads/chat/a.m4a','/uploads/chat/voice-a.html','/uploads/chat/voice-a.webm?x=1'])assert.equal(validChatAudioPath(value),false);
});
