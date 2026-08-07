import assert from 'node:assert/strict';
import test from 'node:test';
import { HITLStateMachine } from '../../../src/guardrail/hitl';
import type { Action } from '../../../src/llm/base';

function action(type: string, parameters: Record<string, unknown>): Action {
  return { type, parameters };
}

test('HITLStateMachine transitions from pending to approved after confirmation', async () => {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });

  const decisionPromise = hitl.requestConfirmation(
    action('shell.exec', { command: 'rm build/output.txt' }),
    'Deletion commands need review.',
  );

  assert.equal(hitl.state, 'require-confirmation');
  assert.equal(hitl.currentRequest?.reason, 'Deletion commands need review.');

  hitl.approve('Reviewed by operator.');
  const decision = await decisionPromise;

  assert.deepEqual(decision, {
    status: 'approved',
    note: 'Reviewed by operator.',
  });
  assert.equal(hitl.state, 'approved');
  assert.equal(hitl.currentRequest, undefined);
});

test('HITLStateMachine transitions from pending to rejected when denied', async () => {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });

  const decisionPromise = hitl.requestConfirmation(
    action('git.push', { force: true }),
    'Force pushes need review.',
  );

  assert.equal(hitl.state, 'require-confirmation');

  hitl.reject('Force push is not allowed.');
  const decision = await decisionPromise;

  assert.deepEqual(decision, {
    status: 'rejected',
    note: 'Force push is not allowed.',
  });
  assert.equal(hitl.state, 'rejected');
  assert.equal(hitl.currentRequest, undefined);
});

test('HITLStateMachine rejects pending confirmation after timeout', async () => {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 5 });

  const decision = await hitl.requestConfirmation(
    action('shell.exec', { command: 'npm install left-pad' }),
    'Package installs need review.',
  );

  assert.equal(decision.status, 'rejected');
  assert.match(decision.note ?? '', /timed out/i);
  assert.equal(hitl.state, 'rejected');
  assert.equal(hitl.currentRequest, undefined);
});

test('HITLStateMachine rejects confirmation requests in non-interactive mode', async () => {
  const hitl = new HITLStateMachine({ mode: 'non-interactive', timeoutMs: 100 });

  const decision = await hitl.requestConfirmation(
    action('shell.exec', { command: 'shutdown /s' }),
    'System shutdown needs review.',
  );

  assert.equal(decision.status, 'rejected');
  assert.match(decision.note ?? '', /non-interactive/i);
  assert.equal(hitl.state, 'rejected');
  assert.equal(hitl.currentRequest, undefined);
});
