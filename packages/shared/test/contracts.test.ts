import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole, TimeEventType } from '../src/index.js';

test('shared enums expose expected keys', () => {
  assert.equal(UserRole.Admin, 'admin');
  assert.equal(TimeEventType.ClockIn, 'clock_in');
});
