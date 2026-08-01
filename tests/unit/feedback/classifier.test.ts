import assert from 'node:assert/strict';
import test from 'node:test';
import { FailureClassifier } from '../../../src/feedback/classifier';

type Classification = {
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion: string;
};

function classify(message: string): Classification {
  const classifier = new FailureClassifier() as unknown as {
    classify?: (input: string) => Classification;
    analyze?: (input: string) => Classification;
  };

  const method = classifier.classify ?? classifier.analyze;
  assert.equal(typeof method, 'function', 'Expected FailureClassifier to expose classify() or analyze().');

  return (method as (input: string) => Classification)(message);
}

function assertClassification(
  actual: Classification,
  expected: {
    category: Classification['category'];
    message: string;
    suggestion: RegExp;
  },
): void {
  assert.equal(actual.category, expected.category);
  assert.equal(actual.message, expected.message);
  assert.match(actual.suggestion, expected.suggestion);
}

test('FailureClassifier categorizes syntax errors with a fix suggestion', () => {
  const result = classify("SyntaxError: Unexpected token '}' in src/parser.ts");

  assertClassification(result, {
    category: 'syntax',
    message: "SyntaxError: Unexpected token '}' in src/parser.ts",
    suggestion: /syntax|parse|brace|token/i,
  });
});

test('FailureClassifier categorizes type errors with a fix suggestion', () => {
  const result = classify("Type 'string' is not assignable to type 'number'.");

  assertClassification(result, {
    category: 'type',
    message: "Type 'string' is not assignable to type 'number'.",
    suggestion: /type|annotation|assignable/i,
  });
});

test('FailureClassifier categorizes logic failures with a fix suggestion', () => {
  const result = classify('Expected 2 to equal 3.');

  assertClassification(result, {
    category: 'logic',
    message: 'Expected 2 to equal 3.',
    suggestion: /logic|assert|expect|compare/i,
  });
});

test('FailureClassifier categorizes performance failures with a fix suggestion', () => {
  const result = classify('Test suite exceeded 5000ms timeout.');

  assertClassification(result, {
    category: 'performance',
    message: 'Test suite exceeded 5000ms timeout.',
    suggestion: /performance|optimize|timeout|slow/i,
  });
});

test('FailureClassifier categorizes lint failures with a fix suggestion', () => {
  const result = classify('src/index.ts:1:1  error  Unexpected console statement  no-console');

  assertClassification(result, {
    category: 'lint',
    message: 'src/index.ts:1:1  error  Unexpected console statement  no-console',
    suggestion: /lint|remove console|eslint|format/i,
  });
});
