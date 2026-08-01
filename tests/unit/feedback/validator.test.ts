import assert from 'node:assert/strict';
import test from 'node:test';
import { TestValidator } from '../../../src/feedback/validator';

type ValidatorLike = {
  parse?: (output: string) => unknown;
  validate?: (output: string) => unknown;
};

function runValidator(output: string): Array<Record<string, unknown>> {
  const validator = new TestValidator() as unknown as ValidatorLike;
  const method = validator.parse ?? validator.validate;

  assert.equal(typeof method, 'function', 'Expected TestValidator to expose parse() or validate().');

  const invoke = method as (this: ValidatorLike, output: string) => unknown;
  const result = invoke.call(validator, output);
  assert.ok(Array.isArray(result), 'Expected validator to return an array of feedback items.');

  return result as Array<Record<string, unknown>>;
}

function assertFeedback(
  actual: Record<string, unknown>,
  expected: {
    type: 'success' | 'failure';
    category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
    message: string;
    location?: { file: string; line: number; column?: number };
  },
): void {
  assert.deepEqual(
    {
      type: actual.type,
      category: actual.category,
      message: actual.message,
      location: actual.location,
    },
    expected,
  );
}

test('TestValidator parses Jest failure output into structured feedback', () => {
  const feedback = runValidator(
    [
      'FAIL src/math/add.test.ts',
      '  adds numbers',
      "    TypeError: Cannot read properties of undefined (reading 'value')",
      '    at Object.<anonymous> (src/math/add.test.ts:12:8)',
      'Tests: 1 failed, 1 passed, 2 total',
    ].join('\n'),
  );

  assert.equal(feedback.length, 1);
  assertFeedback(feedback[0], {
    type: 'failure',
    category: 'type',
    message: "TypeError: Cannot read properties of undefined (reading 'value')",
    location: {
      file: 'src/math/add.test.ts',
      line: 12,
      column: 8,
    },
  });
});

test('TestValidator parses Mocha failure output with syntax location details', () => {
  const feedback = runValidator(
    [
      '  1) parser rejects malformed input',
      "     SyntaxError: Unexpected token '}'",
      '     at src/parser.ts:4:15',
      '  0 passing',
      '  1 failing',
    ].join('\n'),
  );

  assert.equal(feedback.length, 1);
  assertFeedback(feedback[0], {
    type: 'failure',
    category: 'syntax',
    message: "SyntaxError: Unexpected token '}'",
    location: {
      file: 'src/parser.ts',
      line: 4,
      column: 15,
    },
  });
});
