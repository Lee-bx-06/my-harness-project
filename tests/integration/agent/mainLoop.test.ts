import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../../../src/agent/mainLoop';
import { ContextManager } from '../../../src/agent/context';
import { StopCondition } from '../../../src/agent/stopCondition';
import type { GuardrailResult } from '../../../src/guardrail';
import type { Action, Message } from '../../../src/llm/base';
import { MockLLM } from '../../../src/llm/mock';
import { ToolRegistry, type ToolResult } from '../../../src/tools/registry';

type AgentRunInput = {
  instruction: string;
};

type AgentRunResult = {
  completed: boolean;
  iterations: number;
  actions: Action[];
  toolResults: ToolResult[];
  messages: Message[];
  stopReason?: string;
};

type AgentLike = {
  run?: (input: AgentRunInput) => Promise<AgentRunResult>;
  execute?: (input: AgentRunInput) => Promise<AgentRunResult>;
  start?: (input: AgentRunInput) => Promise<AgentRunResult>;
};

type AgentEvent = {
  type: string;
  action?: Action;
  result?: ToolResult;
};

class RecordingGuardrail {
  readonly actions: Action[] = [];

  constructor(private readonly decision: GuardrailResult = { decision: 'allow', source: 'guardrail' }) {}

  async evaluate(action: Action): Promise<GuardrailResult> {
    this.actions.push(action);
    return this.decision;
  }
}

async function runAgent(agent: AgentLike, input: AgentRunInput): Promise<AgentRunResult> {
  const method = agent.run ?? agent.execute ?? agent.start;
  assert.ok(method, 'Expected Agent to expose run, execute, or start.');
  return method.call(agent, input);
}

function createRegistry(
  execute: (parameters: Record<string, unknown>) => Promise<ToolResult>,
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: 'file.write',
    description: 'Write a file',
    execute,
  });
  return registry;
}

test('Agent runs a guarded tool action and feeds the result into the next LLM turn', async () => {
  const toolCalls: Record<string, unknown>[] = [];
  const events: AgentEvent[] = [];
  const llm = new MockLLM({
    actions: [
      { type: 'file.write', parameters: { path: 'notes.txt', content: 'hello' } },
      { type: 'finish', parameters: {}, thought: 'Done.' },
    ],
  });
  const guardrail = new RecordingGuardrail();
  const registry = createRegistry(async (parameters) => {
    toolCalls.push(parameters);
    return { success: true, data: { path: parameters.path, bytesWritten: 5 } };
  });
  const agent = new Agent({
    llm,
    contextManager: new ContextManager(),
    guardrail,
    tools: registry,
    stopCondition: new StopCondition({ maxIterations: 5 }),
    systemPrompt: 'You are a coding agent.',
    onEvent: (event: AgentEvent) => events.push(event),
  }) as unknown as AgentLike;

  const result = await runAgent(agent, { instruction: 'Write hello to notes.txt.' });

  assert.equal(result.completed, true);
  assert.equal(result.iterations, 2);
  assert.deepEqual(result.actions.map((action) => action.type), ['file.write', 'finish']);
  assert.equal(result.toolResults.length, 1);
  assert.deepEqual(result.toolResults[0], { success: true, data: { path: 'notes.txt', bytesWritten: 5 } });
  assert.deepEqual(toolCalls, [{ path: 'notes.txt', content: 'hello' }]);
  assert.deepEqual(guardrail.actions.map((action) => action.type), ['file.write']);
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].map((message) => message.content).join('\n'), /bytesWritten|notes\.txt/);
  assert.ok(events.some((event) => event.type === 'action' && event.action?.type === 'file.write'));
  assert.ok(events.some((event) => event.type === 'tool-result' && event.result?.success === true));
});

test('Agent continues for multiple tool iterations until the LLM finishes', async () => {
  const executedTools: string[] = [];
  const llm = new MockLLM({
    actions: [
      { type: 'file.write', parameters: { path: 'a.txt', content: 'first' } },
      { type: 'file.write', parameters: { path: 'b.txt', content: 'second' } },
      { type: 'finish', parameters: {}, thought: 'All requested files were written.' },
    ],
  });
  const registry = createRegistry(async (parameters) => {
    executedTools.push(String(parameters.path));
    return { success: true, data: { path: parameters.path } };
  });
  const agent = new Agent({
    llm,
    contextManager: new ContextManager(),
    guardrail: new RecordingGuardrail(),
    tools: registry,
    stopCondition: new StopCondition({ maxIterations: 5 }),
    systemPrompt: 'You are a coding agent.',
  }) as unknown as AgentLike;

  const result = await runAgent(agent, { instruction: 'Write two files.' });

  assert.equal(result.completed, true);
  assert.equal(result.iterations, 3);
  assert.deepEqual(executedTools, ['a.txt', 'b.txt']);
  assert.deepEqual(result.actions.map((action) => action.type), ['file.write', 'file.write', 'finish']);
  assert.equal(result.toolResults.length, 2);
});

test('Agent stops without executing a tool when guardrail denies the action', async () => {
  let toolExecuted = false;
  const llm = new MockLLM({
    actions: [{ type: 'file.write', parameters: { path: '../outside.txt', content: 'secret' } }],
  });
  const registry = createRegistry(async () => {
    toolExecuted = true;
    return { success: true };
  });
  const agent = new Agent({
    llm,
    contextManager: new ContextManager(),
    guardrail: new RecordingGuardrail({
      decision: 'deny',
      source: 'sandbox',
      reason: 'Path is outside the workspace.',
    }),
    tools: registry,
    stopCondition: new StopCondition({ maxIterations: 5 }),
    systemPrompt: 'You are a coding agent.',
  }) as unknown as AgentLike;

  const result = await runAgent(agent, { instruction: 'Write outside the workspace.' });

  assert.equal(result.completed, false);
  assert.equal(result.stopReason, 'guardrail-denied');
  assert.equal(toolExecuted, false);
  assert.equal(result.toolResults.length, 0);
  assert.deepEqual(result.actions.map((action) => action.type), ['file.write']);
});
