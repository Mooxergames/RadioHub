import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('production build contexts include the frontend manifest that owns the workspace patch', () => {
  const workspace = read('pnpm-workspace.yaml');
  const frontend = JSON.parse(read('artifacts/megaradio/package.json'));
  assert.match(workspace, /patchedDependencies:\s+['"]?@radix-ui\/react-select@/);
  assert.ok(frontend.devDependencies['@radix-ui/react-select']);

  for (const service of ['api', 'web', 'proxy']) {
    const docker = read(`Dockerfile.${service}`);
    const install = docker.search(/^RUN pnpm install --frozen-lockfile\b/m);
    assert.ok(install >= 0, `${service} must install from the frozen workspace lockfile`);
    const context = docker.slice(0, install);
    assert.match(context, /^COPY patches \.\/patches\s*$/m);
    assert.match(
      context,
      /^COPY artifacts\/megaradio\/package\.json\s+\.\/artifacts\/megaradio\/\s*$/m,
      `${service} legacy deploy needs the frontend manifest to resolve the Radix patch`,
    );
  }
});

for (const service of ['api', 'web', 'proxy']) {
  test(`${service} frozen install includes manifest-only applications without their sources`, () => {
    const docker = read(`Dockerfile.${service}`);
    const install = docker.search(/^RUN pnpm install --frozen-lockfile\b/m);
    assert.ok(install >= 0);
    const context = docker.slice(0, install);
    const ignored = read('.dockerignore');
    for (const app of ['mockup-sandbox', 'megaradio-investor-deck']) {
      assert.match(context, new RegExp(`^COPY artifacts/${app}/package\\.json\\s+\\./artifacts/${app}/\\s*$`, 'm'));
      assert.ok(ignored.includes(`artifacts/${app}/*\n!artifacts/${app}/package.json`), `${app} must expose only its manifest`);
      assert.doesNotMatch(ignored, new RegExp(`^artifacts/${app}$`, 'm'), 'an excluded parent prevents the manifest exception');
    }
  });
}
