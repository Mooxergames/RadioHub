import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const forbidden = /^(?:mongodb(?:-|$)|mongoose$|bson$|connect-mongo$|@mongodb-js\/|@workspace\/legacy-migration$)/;
const manifests = [path.join(root, 'package.json'), path.join(root, 'scripts/package.json')];
for (const directory of ['artifacts', 'lib']) {
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const manifest = path.join(root, directory, entry.name, 'package.json');
    if (entry.isDirectory() && existsSync(manifest)) manifests.push(manifest);
  }
}

test('every workspace manifest is free of retired database packages, including development tools', () => {
  assert.ok(manifests.length >= 10);
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.deepEqual(Object.keys(manifest[group] || {}).filter(name => forbidden.test(name)), [], `${manifest.name}: ${group}`);
    }
  }
});

test('the lockfile and current CI no longer install or start the retired database', () => {
  const lockfile = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  assert.doesNotMatch(lockfile, /\b(?:mongodb|mongoose|bson|connect-mongo)@|@mongodb-js\/|lib\/legacy-migration/);
  const ci = readFileSync(path.join(root, '.github/workflows/postgres-migration.yml'), 'utf8');
  assert.doesNotMatch(ci, /\bmongo\b|MONGO_TEST_URI|build-postgres-bootstrap|PG_BOOTSTRAP_TEST_PACKAGE|Dockerfile\.migration/);
  assert.match(ci, /image: postgres:17-alpine/);
  assert.match(ci, /verify-postgres-production\.mjs/);
  assert.match(ci, /for service in api web proxy;/);
});

test('retired connection modules and importer launchers are absent', () => {
  for (const file of [
    'lib/legacy-migration/package.json', 'lib/legacy-migration/src/db-mongo.ts',
    'lib/legacy-migration/src/mongo-schemas.ts', '.migration-backup/package.json',
    'Dockerfile.migration', 'railway.migration.json',
    'artifacts/api-server/scripts/build-postgres-bootstrap.mjs',
    'artifacts/api-server/scripts/run-legacy-tests.mjs',
  ]) assert.equal(existsSync(path.join(root, file)), false, file);
  for (const service of ['api', 'web', 'proxy']) {
    assert.doesNotMatch(readFileSync(path.join(root, `Dockerfile.${service}`), 'utf8'), /legacy-migration/);
  }
});

test('the installed API can resolve PostgreSQL but not any retired database driver', () => {
  const require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
  assert.ok(require.resolve('pg'));
  for (const name of ['mongodb', 'mongoose', 'bson', 'connect-mongo']) {
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' }, name);
  }
});
