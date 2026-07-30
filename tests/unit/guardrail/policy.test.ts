import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PolicyEvaluator,
  type PolicyRule,
} from '../../../src/guardrail/policy';
import type { Action } from '../../../src/llm/base';

function action(type: string, parameters: Record<string, unknown>): Action {
  return { type, parameters };
}

test('PolicyEvaluator denies actions that match a deny rule', () => {
  const evaluator = new PolicyEvaluator([
    {
      id: 'deny-force-push',
      decision: 'deny',
      priority: 10,
      condition: {
        field: 'type',
        equals: 'git.push',
      },
      reason: 'Remote pushes are disabled in this policy.',
    },
  ]);

  const result = evaluator.evaluate(action('git.push', { force: true }));

  assert.equal(result.decision, 'deny');
  assert.equal(result.matchedRule?.id, 'deny-force-push');
  assert.match(result.reason ?? '', /remote pushes/i);
});

test('PolicyEvaluator uses the highest priority matching rule', () => {
  const evaluator = new PolicyEvaluator([
    {
      id: 'allow-shell',
      decision: 'allow',
      priority: 1,
      condition: {
        field: 'type',
        equals: 'shell.exec',
      },
    },
    {
      id: 'confirm-shell-deletion',
      decision: 'require-confirmation',
      priority: 20,
      condition: {
        field: 'parameters.command',
        matches: '\\brm\\b',
      },
      reason: 'Deletion commands need review.',
    },
  ]);

  const result = evaluator.evaluate(action('shell.exec', { command: 'rm build/output.txt' }));

  assert.equal(result.decision, 'require-confirmation');
  assert.equal(result.matchedRule?.id, 'confirm-shell-deletion');
  assert.match(result.reason ?? '', /deletion/i);
});

test('PolicyEvaluator supports AND conditions', () => {
  const evaluator = new PolicyEvaluator([
    {
      id: 'confirm-force-push',
      decision: 'require-confirmation',
      priority: 10,
      condition: {
        all: [
          { field: 'type', equals: 'git.push' },
          { field: 'parameters.force', equals: true },
        ],
      },
    },
  ]);

  assert.equal(
    evaluator.evaluate(action('git.push', { force: true })).decision,
    'require-confirmation',
  );
  assert.equal(
    evaluator.evaluate(action('git.push', { force: false })).decision,
    'allow',
  );
});

test('PolicyEvaluator supports OR conditions', () => {
  const rules: PolicyRule[] = [
    {
      id: 'deny-package-installs',
      decision: 'deny',
      priority: 10,
      condition: {
        any: [
          { field: 'parameters.command', matches: '\\bnpm\\s+install\\b' },
          { field: 'parameters.command', matches: '\\bpnpm\\s+add\\b' },
        ],
      },
    },
  ];
  const evaluator = new PolicyEvaluator(rules);

  assert.equal(
    evaluator.evaluate(action('shell.exec', { command: 'npm install left-pad' })).decision,
    'deny',
  );
  assert.equal(
    evaluator.evaluate(action('shell.exec', { command: 'pnpm add left-pad' })).decision,
    'deny',
  );
  assert.equal(
    evaluator.evaluate(action('shell.exec', { command: 'npm test' })).decision,
    'allow',
  );
});
