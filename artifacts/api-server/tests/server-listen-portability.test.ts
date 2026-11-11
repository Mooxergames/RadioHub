import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

for (const entry of ['index-api', 'index-web']) {
  test(`${entry} does not request unsupported TCP port sharing on macOS or Windows`, () => {
    const source = readFileSync(new URL(`../src/${entry}.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes("reusePort: process.platform !== 'win32' && process.platform !== 'darwin'"));
  });
}
