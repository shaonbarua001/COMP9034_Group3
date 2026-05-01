import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('required app router files exist', () => {
  assert.equal(existsSync('app/layout.tsx'), true);
  assert.equal(existsSync('app/page.tsx'), true);
  assert.equal(existsSync('app/staff/page.tsx'), true);
  assert.equal(existsSync('app/roster/page.tsx'), true);
  assert.equal(existsSync('app/clocking-station/page.tsx'), true);
  assert.equal(existsSync('app/payroll-reports/page.tsx'), true);
  assert.equal(existsSync('app/login/page.tsx'), true);
});
