import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const guardUrl = new URL('../src/utils/safe-fetch.ts', import.meta.url).href;
const probeUrl = new URL('../src/utils/station-stream-probe.ts', import.meta.url).href;

for (const protocol of ['http', 'https']) {
  for (const family of [4, 6]) {
    for (const code of ['ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED']) {
      test(`${protocol}/IPv${family}: immediate ${code} stays inside the availability probe`, () => {
        // A separate process catches otherwise fatal TLS error events. Inject
        // the OS connect result at Node's TCP boundary: no external network,
        // DNS, TLS validation bypass, or production runtime changes are used.
        const child = spawnSync(process.execPath, [
          '--import', 'tsx', '--experimental-test-module-mocks', '--input-type=module', '-e', `
          import assert from 'node:assert/strict';
          import { mock } from 'node:test';
          const family = ${family};
          const pinnedIp = family === 6 ? '2001:db8::1' : '192.0.2.1';
          let validations = 0;
          let connections = 0;
          mock.module(${JSON.stringify(guardUrl)}, { namedExports: {
            INTERNAL_SERVICE_PORTS: new Set([5432]),
            validateOutboundUrl: async (raw, options) => {
              assert.ok(options.blockedPorts.has(5432));
              validations++;
              return { ok: true, url: new URL(raw), pinnedIp, family };
            },
          }});
          const { TCP } = process.binding('tcp_wrap');
          const connectMethod = family === 6 ? 'connect6' : 'connect';
          TCP.prototype[connectMethod] = function (_request, address, port) {
            assert.equal(address, pinnedIp);
            assert.equal(port, ${protocol === 'https' ? 443 : 80});
            connections++;
            return process.binding('uv')['UV_${code}'];
          };
          const { probeStreamAvailability } = await import(${JSON.stringify(probeUrl)});
          const result = await probeStreamAvailability('${protocol}://source.invalid/live', { timeoutMs: 1000 });
          assert.equal(result.outcome, 'inconclusive');
          assert.equal(result.reason, '${code === 'ECONNREFUSED' ? 'connection-refused' : 'network-error'}');
          assert.equal(result.bytesRead, 0);
          assert.equal(validations, 1);
          assert.equal(connections, 1);
          await new Promise(resolve => setImmediate(resolve));
          console.log('probe survived');
        `], { cwd, encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024 });
        assert.equal(child.error, undefined, child.error?.message);
        assert.equal(child.signal, null, child.stderr);
        assert.equal(child.status, 0, child.stderr);
        assert.match(child.stdout, /probe survived/);
      });
    }
  }
}
