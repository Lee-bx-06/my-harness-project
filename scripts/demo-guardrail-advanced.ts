import { Guardrail } from '../src/guardrail';
import { HITLStateMachine } from '../src/guardrail/hitl';
import { PolicyEvaluator } from '../src/guardrail/policy';
import { Sandbox } from '../src/guardrail/sandbox';
import type { Action } from '../src/llm/base';

async function main(): Promise<void> {
  console.log('Advanced guardrail demo: policy, sandbox, and HITL dimensions');

  demoPolicyEvaluation();
  demoSandboxBoundaries();
  await demoHitlFlows();
}

function demoPolicyEvaluation(): void {
  const policy = new PolicyEvaluator([
    {
      id: 'allow-tests',
      decision: 'allow',
      priority: 5,
      condition: {
        field: 'parameters.command',
        matches: '^npm\\s+test$',
      },
      reason: 'Test commands are allowed.',
    },
    {
      id: 'deny-force-push',
      decision: 'deny',
      priority: 20,
      condition: {
        all: [
          { field: 'type', equals: 'git.push' },
          { field: 'parameters.force', equals: true },
        ],
      },
      reason: 'Force pushes are denied by policy.',
    },
  ]);

  const allowed = policy.evaluate(action('shell.exec', { command: 'npm test' }));
  const denied = policy.evaluate(action('git.push', { force: true }));

  console.log('Policy evaluation:');
  console.log(`Policy allow outcome: ${allowed.decision}`);
  console.log(`Policy deny outcome: ${denied.decision}`);
  console.log(`Policy deny reason: ${denied.reason}`);
}

function demoSandboxBoundaries(): void {
  const sandbox = new Sandbox({
    allowedDirectories: ['D:/workspace/project'],
    blockedCommands: ['format', 'shutdown'],
  });

  const directoryBoundary = sandbox.check(action('file.write', {
    path: 'D:/workspace/secrets.env',
    content: 'TOKEN=secret',
  }));
  const blockedCommand = sandbox.check(action('shell.exec', {
    command: 'format C:',
  }));

  console.log('Sandbox enforcement:');
  console.log(`Sandbox directory boundary allowed: ${directoryBoundary.allowed}`);
  console.log(`Sandbox directory boundary reason: ${directoryBoundary.reason}`);
  console.log(`Sandbox blocked command allowed: ${blockedCommand.allowed}`);
  console.log(`Sandbox command blacklist reason: ${blockedCommand.reason}`);
}

async function demoHitlFlows(): Promise<void> {
  const approved = await requestHitlApproval();
  const rejected = await requestHitlRejection();
  const guardrail = new Guardrail({
    hitl: new HITLStateMachine({ mode: 'non-interactive' }),
  });
  const nonInteractiveResult = await guardrail.evaluate(action('shell.exec', { command: 'rm -rf *' }));

  console.log('HITL human-in-the-loop flow:');
  console.log(`HITL approved decision: ${approved.status}`);
  console.log(`HITL rejected decision: ${rejected.status}`);
  console.log(`HITL guardrail rejection source: ${nonInteractiveResult.source}`);
}

async function requestHitlApproval() {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });
  const decisionPromise = hitl.requestConfirmation(
    action('shell.exec', { command: 'rm build/output.txt' }),
    'Scoped deletion requires confirmation.',
  );

  hitl.approve('Confirmation approved for scoped deletion.');
  return decisionPromise;
}

async function requestHitlRejection() {
  const hitl = new HITLStateMachine({ mode: 'interactive', timeoutMs: 100 });
  const decisionPromise = hitl.requestConfirmation(
    action('git.push', { force: true }),
    'Force push requires confirmation.',
  );

  hitl.reject('Confirmation rejected for force push.');
  return decisionPromise;
}

function action(type: string, parameters: Record<string, unknown>): Action {
  return {
    type,
    parameters,
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
