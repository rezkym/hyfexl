import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('project configuration', () => {
  it('ships Vercel scripts and keeps the Python reference script', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      build: expect.any(String),
      lint: expect.any(String),
      test: expect.any(String),
    });
    expect(existsSync(resolve(root, 'hyfe_esim_flow_v4_browser.py'))).toBe(true);
  });

  it('documents the Vercel encryption key and manual CAPTCHA limitation', () => {
    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

    expect(readme).toContain('FLOW_STATE_ENCRYPTION_KEY');
    expect(readme).toContain('Vercel');
    expect(readme).toMatch(/CAPTCHA.*manual/i);
  });
});
