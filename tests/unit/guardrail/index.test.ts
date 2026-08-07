import assert from 'node:assert/strict';
import test from 'node:test';
import { Guardrail } from '../../../src/guardrail';
import { HITLStateMachine } from '../../../src/guardrail/hitl';
import { PolicyEvaluator } from '../../../src/guardrail/policy';
import { Sandbox } from '../../../src/guardrail/sandbox';
import type { Action } from '../../../src/llm/base';

function action(type: string, parameters: Record<string, unknown>): Action {
  return { type, parameters };
}

test('Guardrail allows safe actions when all checks pass', async () => {
  const guardrail = new Guardrail();

  const result = await guardrail.evaluate(action('shell.exec', { command: 'npm test' }));

  assert.equal(result.decision, 'allow');
  assert.equal(result.source, 'guardrail');
});

test('Guardrail denies dangerous actions when HITL rejects in non-interactive mode', async () => {
  const guardrail = new Guardrail({
    hitl: new HITLStateMachine({ mode: 'non-interactive' }),
  });

  const result = await guardrail.evaluate(action('shell.exec', { command: 'rm -rf *' }));

  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'hitl');
  assert.equal(result.threats?.[0]?.category, 'destructive-command');
  assert.match(result.reason ?? '', /non-interactive/i);
});

test('Guardrail denies actions blocked by policy before requesting HITL', async () => {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });
  const guardrail = new Guardrail({
    hitl,
    policyEvaluator: new PolicyEvaluator([
      {
        id: 'deny-force-push',
        decision: 'deny',
        priority: 10,
        condition: {
          field: 'type',
          equals: 'git.push',
        },
        reason: 'Force pushes are disabled.',
      },
    ]),
  });

  const result = await guardrail.evaluate(action('git.push', { force: true }));

  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'policy');
  assert.equal(result.matchedPolicyRule?.id, 'deny-force-push');
  assert.equal(hitl.state, 'pending');
});

test('Guardrail denies actions that violate sandbox boundaries', async () => {
  const guardrail = new Guardrail({
    sandbox: new Sandbox({
      allowedDirectories: ['D:/workspace/project'],
    }),
  });

  const result = await guardrail.evaluate(
    action('file.write', {
      path: 'D:/workspace/secrets.env',
      content: 'TOKEN=secret',
    }),
  );

  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'sandbox');
  assert.equal(result.sandboxViolation?.type, 'directory-boundary');
});

test('Guardrail allows dangerous actions after HITL approval', async () => {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });
  const guardrail = new Guardrail({ hitl });

  const resultPromise = guardrail.evaluate(action('shell.exec', { command: 'rm build/output.txt' }));

  assert.equal(hitl.state, 'require-confirmation');
  hitl.approve('Operator approved scoped deletion.');

  const result = await resultPromise;

  assert.equal(result.decision, 'allow');
  assert.equal(result.source, 'hitl');
  assert.equal(result.hitlDecision?.status, 'approved');
});
