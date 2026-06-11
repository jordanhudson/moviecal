import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonForScript } from './html.js';

test('escapes </script> so embedded JSON cannot break out of a script tag', () => {
  const out = jsonForScript({ title: 'Evil</script><script>alert(1)</script>' });
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('>'));
  assert.equal(
    JSON.parse(out.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')).title,
    'Evil</script><script>alert(1)</script>'
  );
});

test('escaped output parses back to the original value', () => {
  const value = [{ title: 'Dune & <Friends>   ', id: 7 }];
  const out = jsonForScript(value);
  assert.deepEqual(eval(`(${out})`), value);
});

test('plain values pass through as valid JSON', () => {
  assert.equal(jsonForScript([1, 'two', null]), '[1,"two",null]');
});
