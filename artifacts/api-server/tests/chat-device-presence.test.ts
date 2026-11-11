import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatService } from '../src/services/chat-service';
const socket = () => ({ readyState: 1, bufferedAmount: 0, send() {}, close() {} } as any);
test('closing mobile preserves a separate web conversation and notification suppression', () => {
  const web = chatService.addClient('fixture',socket()), mobile = chatService.addClient('fixture',socket());
  chatService.setActiveConversation('fixture','friend-a',web);
  chatService.setActiveConversation('fixture','friend-b',mobile);
  assert.equal(chatService.isViewingConversation('fixture','friend-a'),true);
  assert.equal(chatService.isViewingConversation('fixture','friend-b'),true);
  chatService.removeClient('fixture',mobile);
  assert.equal(chatService.isOnline('fixture'),true);
  assert.equal(chatService.isViewingConversation('fixture','friend-a'),true);
  assert.equal(chatService.isViewingConversation('fixture','friend-b'),false);
  chatService.removeClient('fixture',web);
  assert.equal(chatService.isOnline('fixture'),false);
  assert.equal(chatService.isViewingConversation('fixture','friend-a'),false);
});
test('evicting a sixth connection clears the evicted device active partner', () => {
  const clients=Array.from({length:6},(_,i)=>{ const c=chatService.addClient('limit-fixture',socket());chatService.setActiveConversation('limit-fixture',`friend-${i}`,c);return c; });
  assert.equal(chatService.isViewingConversation('limit-fixture','friend-0'),false);
  assert.equal(chatService.isViewingConversation('limit-fixture','friend-5'),true);
  clients.forEach(c=>chatService.removeClient('limit-fixture',c));
});
