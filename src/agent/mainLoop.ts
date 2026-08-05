import { Guardrail, type GuardrailResult } from '../guardrail';
import type { Action, LLMInterface, Message } from '../llm/base';
import { ToolRegistry, type ToolResult } from '../tools/registry';
import { ContextManager } from './context';
import { StopCondition } from './stopCondition';

export interface AgentRunInput {
  instruction: string;
}

export interface AgentRunResult {
  completed: boolean;
  iterations: number;
  actions: Action[];
  toolResults: ToolResult[];
  messages: Message[];
  stopReason?: string;
}

export interface AgentEvent {
  type: string;
  action?: Action;
  result?: ToolResult;
  guardrail?: GuardrailResult;
}

export interface AgentOptions {
  llm: LLMInterface;
  contextManager?: ContextManager;
  guardrail?: { evaluate(action: Action): Promise<GuardrailResult> };
  tools?: ToolRegistry;
  stopCondition?: StopCondition;
  systemPrompt?: string;
  onEvent?: (event: AgentEvent) => void;
}

export class Agent {
  private readonly llm: LLMInterface;
  private readonly contextManager: ContextManager;
  private readonly guardrail: { evaluate(action: Action): Promise<GuardrailResult> };
  private readonly tools: ToolRegistry;
  private readonly stopCondition: StopCondition;
  private readonly systemPrompt: string;
  private readonly onEvent?: (event: AgentEvent) => void;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.contextManager = options.contextManager ?? new ContextManager();
    this.guardrail = options.guardrail ?? new Guardrail();
    this.tools = options.tools ?? new ToolRegistry();
    this.stopCondition = options.stopCondition ?? new StopCondition();
    this.systemPrompt = options.systemPrompt ?? 'You are a coding agent.';
    this.onEvent = options.onEvent;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const state: AgentRunResult = {
      completed: false,
      iterations: 0,
      actions: [],
      toolResults: [],
      messages: [{ role: 'user', content: input.instruction }],
    };
    let consecutiveFailures = 0;

    while (true) {
      const stopResult = this.stopCondition.evaluate({
        iteration: state.iterations + 1,
        taskComplete: state.completed,
        consecutiveFailures,
      });

      if (stopResult.shouldStop) {
        state.stopReason = stopResult.reason;
        return state;
      }

      const action = await this.llm.generateAction(this.buildMessages(state.messages));
      state.iterations += 1;
      state.actions.push(action);
      this.emit({ type: 'action', action });

      if (action.type === 'finish') {
        state.completed = true;
        return state;
      }

      const guardrailResult = await this.guardrail.evaluate(action);
      this.emit({ type: 'guardrail', action, guardrail: guardrailResult });

      if (guardrailResult.decision === 'deny') {
        state.stopReason = 'guardrail-denied';
        return state;
      }

      const result = await this.executeTool(action);
      state.toolResults.push(result);
      state.messages.push(toolResultMessage(action, result));
      consecutiveFailures = result.success ? 0 : consecutiveFailures + 1;
      this.emit({ type: 'tool-result', action, result });
    }
  }

  async execute(input: AgentRunInput): Promise<AgentRunResult> {
    return this.run(input);
  }

  async start(input: AgentRunInput): Promise<AgentRunResult> {
    return this.run(input);
  }

  private buildMessages(messages: Message[]): Message[] {
    return this.contextManager.build({
      systemPrompt: this.systemPrompt,
      messages,
    });
  }

  private async executeTool(action: Action): Promise<ToolResult> {
    return this.tools.get(action.type).execute(action.parameters);
  }

  private emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }
}

function toolResultMessage(action: Action, result: ToolResult): Message {
  return {
    role: 'assistant',
    content: `Tool result for ${action.type}: ${JSON.stringify(result)}`,
  };
}
