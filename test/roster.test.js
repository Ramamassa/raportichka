import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesStudent, studentId } from '../roster.js';

test('search matches parts, any case, whitespace, е/ё and reordered tokens', () => {
  assert.ok(matchesStudent('Васильев Артём', '  АРТЕМ вас  '));
  assert.ok(matchesStudent('Волкова Мария', 'мар'));
  assert.ok(matchesStudent('Волкова Мария', '   '));
  assert.ok(!matchesStudent('Волкова Мария', 'Мария Иванова'));
  assert.ok(!matchesStudent('Волкова Мария', '<script>'));
});
test('student identifiers are valid and unique without randomUUID', () => {
  const ids = Array.from({length:200}, () => studentId());
  assert.equal(new Set(ids).size, 200);
  assert.ok(ids.every(id => /^[\w-]{1,80}$/.test(id)));
});
