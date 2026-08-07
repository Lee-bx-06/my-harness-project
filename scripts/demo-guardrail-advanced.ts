import { Guardrail } from '../src/guardrail';
import { HITLStateMachine } from '../src/guardrail/hitl';
import { PolicyEvaluator } from '../src/guardrail/policy';
import { Sandbox } from '../src/guardrail/sandbox';
import type { Action } from '../src/llm/base';

const DEMO_TITLE = 'Advanced guardrail demo: policy, sandbox, and HITL dimensions';
const POLICY_RULES = [
  {
    id: 'allow-tests',
    decision: 'allow' as const,
    priority: 5,
    condition: {
      field: 'parameters.command',
      matches: '^npm\\s+test$',
    },
    reason: 'Test commands are allowed.',
  },
  {
    id: 'deny-force-push',
    decision: 'deny' as const,
    priority: 20,
    condition: {
      all: [
        { field: 'type', equals: 'git.push' },
        { field: 'parameters.force', equals: true },
      ],
    },
    reason: 'Force pushes are denied by policy.',
  },
];
const SANDBOX_OPTIONS = {
  allowedDirectories: ['D:/workspace/project'],
  blockedCommands: ['format', 'shutdown'],
};
const SAFE_TEST_ACTION = action('shell.exec', { command: 'npm test' });
const FORCE_PUSH_ACTION = action('git.push', { force: true });
const OUTSIDE_FILE_ACTION = action('file.write', {
  path: 'D:/workspace/secrets.env',
  content: 'TOKEN=secret',
});
const BLOCKED_COMMAND_ACTION = action('shell.exec', { command: 'format C:' });

async function main(): Promise<void> {
  console.log(DEMO_TITLE);

  demoPolicyEvaluation();
  demoSandboxBoundaries();
  await demoHitlFlows();
}

function demoPolicyEvaluation(): void {
  const policy = new PolicyEvaluator(POLICY_RULES);
  const allowed = policy.evaluate(SAFE_TEST_ACTION);
  const denied = policy.evaluate(FORCE_PUSH_ACTION);

  printPolicyEvaluation(allowed.decision, denied.decision, denied.reason);
}

function printPolicyEvaluation(allowDecision: string, denyDecision: string, denyReason?: string): void {
  console.log('Policy evaluation:');
  console.log(`Policy allow outcome: ${allowDecision}`);
  console.log(`Policy deny outcome: ${denyDecision}`);
  console.log(`Policy deny reason: ${denyReason}`);
}

function demoSandboxBoundaries(): void {
  const sandbox = new Sandbox(SANDBOX_OPTIONS);
  const directoryBoundary = sandbox.check(OUTSIDE_FILE_ACTION);
  const blockedCommand = sandbox.check(BLOCKED_COMMAND_ACTION);

  printSandboxEnforcement(
    directoryBoundary.allowed,
    directoryBoundary.reason,
    blockedCommand.allowed,
    blockedCommand.reason,
  );
}

function printSandboxEnforcement(
  directoryAllowed: boolean,
  directoryReason: string | undefined,
  commandAllowed: boolean,
  commandReason: string | undefined,
): void {
  console.log('Sandbox enforcement:');
  console.log(`Sandbox directory boundary allowed: ${directoryAllowed}`);
  console.log(`Sandbox directory boundary reason: ${directoryReason}`);
  console.log(`Sandbox blocked command allowed: ${commandAllowed}`);
  console.log(`Sandbox command blacklist reason: ${commandReason}`);
}

async function demoHitlFlows(): Promise<void> {
  const approved = await requestHitlApproval();
  const rejected = await requestHitlRejection();
  const guardrail = new Guardrail({
    hitl: new HITLStateMachine({ mode: 'non-interactive' }),
  });
  const nonInteractiveResult = await guardrail.evaluate(action('shell.exec', { command: 'rm -rf *' }));

  printHitlFlows(approved.status, rejected.status, nonInteractiveResult.source);
}

function printHitlFlows(approvedStatus: string, rejectedStatus: string, rejectionSource: string): void {
  console.log('HITL human-in-the-loop flow:');
  console.log(`HITL approved decision: ${approvedStatus}`);
  console.log(`HITL rejected decision: ${rejectedStatus}`);
  console.log(`HITL guardrail rejection source: ${rejectionSource}`);
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
