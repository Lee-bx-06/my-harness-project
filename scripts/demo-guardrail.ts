import { Agent, type AgentEvent } from '../src/agent/mainLoop';
import { StopCondition } from '../src/agent/stopCondition';
import { Guardrail } from '../src/guardrail';
import { PolicyEvaluator } from '../src/guardrail/policy';
import { MockLLM } from '../src/llm/mock';
import { ToolRegistry } from '../src/tools/registry';

async function main(): Promise<void> {
  const dangerousCommand = 'rm -rf /';
  const events: AgentEvent[] = [];
  const agent = new Agent({
    llm: new MockLLM({
      actions: [
        {
          type: 'shell.exec',
          parameters: { command: dangerousCommand },
          thought: 'Attempting a destructive command for the guardrail demo.',
        },
      ],
    }),
    guardrail: new Guardrail({
      policyEvaluator: new PolicyEvaluator([
        {
          id: 'demo-deny-root-delete',
          decision: 'deny',
          priority: 100,
          condition: {
            field: 'parameters.command',
            matches: '^rm\\s+-rf\\s+/$',
          },
          reason: 'Dangerous root deletion command is blocked by the demo policy.',
        },
      ]),
    }),
    tools: new ToolRegistry(),
    stopCondition: new StopCondition({ maxIterations: 3 }),
    onEvent: (event) => events.push(event),
  });

  const result = await agent.run({
    instruction: 'Demonstrate guardrail behavior for a dangerous shell command.',
  });
  const guardrailEvent = events.find((event) => event.type === 'guardrail');

  console.log('Guardrail demo: dangerous action interception');
  console.log(`Action: shell.exec command="${dangerousCommand}"`);
  console.log(`Decision: ${guardrailEvent?.guardrail?.decision ?? 'unknown'}`);
  console.log(`Source: ${guardrailEvent?.guardrail?.source ?? 'unknown'}`);
  console.log(`Reason: ${guardrailEvent?.guardrail?.reason ?? 'No reason recorded.'}`);
  console.log(`Threat count: ${guardrailEvent?.guardrail?.threats?.length ?? 0}`);
  console.log(`Run stopped: ${result.stopReason}`);

  if (guardrailEvent?.guardrail?.decision !== 'deny') {
    throw new Error('Guardrail demo failed: dangerous action was not denied.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
