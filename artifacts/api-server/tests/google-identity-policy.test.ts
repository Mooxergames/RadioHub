import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleIdentity, canLinkGoogleAccount} from '../src/auth/google-identity-policy';

test('unverified or missing Google identity fields cannot establish a session', () => {
  for (const email_verified of [false, undefined, 'true']) {
    assert.throws(() => googleIdentity({sub: 'sub-1', email: 'a@gmail.com', email_verified}));
  }
  assert.throws(() => googleIdentity({email: 'a@gmail.com', email_verified: true}));
});
test('authoritative Gmail and Workspace emails can link an unlinked account', () => {
  for (const input of [{email:'A@GMAIL.COM'}, {email:'a@company.test',hd:'company.test'}]) {
    const identity = googleIdentity({...input,sub:'sub-1',email_verified:true});
    assert.equal(canLinkGoogleAccount(null,identity),true);
    assert.equal(canLinkGoogleAccount('another-google-account',identity),false);
  }
});
test('third-party mail cannot auto-link an existing password account', () => {
  const identity=googleIdentity({sub:'sub-1',email:'a@example.test',email_verified:true});
  assert.equal(canLinkGoogleAccount(null,identity),false);
  assert.equal(canLinkGoogleAccount('sub-1',identity),true);
});
