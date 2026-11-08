import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('document scroll layout', () => {
  it('lets the body grow with long pages instead of creating a viewport-height nested scroller', () => {
    const bodyRules = [...css.matchAll(/(?:^|\n)\s*body\s*\{([^}]*)\}/g)].map(match => match[1]);
    expect(bodyRules.length).toBeGreaterThan(0);
    expect(bodyRules.join('\n')).toMatch(/^\s*height:\s*auto\s*;/m);
    expect(bodyRules.join('\n')).toMatch(/min-height:\s*100%\s*;/);
    expect(bodyRules.join('\n')).not.toMatch(/^\s*height:\s*(?:100%|100(?:d|s|l)?vh)\s*;/m);
  });
});
