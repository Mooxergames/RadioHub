import test from 'node:test';
import assert from 'node:assert/strict';
import { adminProfileDiscovery } from '../src/utils/admin-profile-discovery';
test('admin detail exposes only valid self-declared fields, without preference secrets',()=>{
  assert.deepEqual(adminProfileDiscovery({preferences:{profileGender:'female',profileCountryCode:'AT',language:'tr',privatePreference:'not exposed'}}),{profileGender:'female',profileCountryCode:'AT'});
  assert.deepEqual(adminProfileDiscovery({preferences:{profileGender:'guessed',profileCountryCode:'Global'}}),{profileGender:null,profileCountryCode:null});
  assert.deepEqual(adminProfileDiscovery({}),{profileGender:null,profileCountryCode:null});
});
