import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextManager } from '../../../src/agent/context';
import type { Message } from '../../../src/llm/base';

type ContextTool = {
  name: string;
  output: string;
};

type ContextFeedback = {
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion?: string;
};

type ContextInput = {
  systemPrompt: string;
  messages: Message[];
  tools?: ContextTool[];
  feedback?: ContextFeedback[];
};

type PersistenceAdapter = {
  save: (sessionId: string, messages: Message[]) => Promise<void>;
  load: (sessionId: string) => Promise<Message[] | undefined>;
};

type ContextManagerLike = {
  build?: (input: ContextInput) => Message[];
  compose?: (input: ContextInput) => Message[];
  organize?: (input: ContextInput) => Message[];
  persist?: (sessionId: string, messages: Message[]) => Promise<void>;
  restore?: (sessionId: string) => Promise<Message[] | undefined>;
  save?: (sessionId: string, messages: Message[]) => Promise<void>;
  load?: (sessionId: string) => Promise<Message[] | undefined>;
};

function getContextManager(options: Record<string, unknown> = {}): ContextManagerLike {
  return new ContextManager(options) as unknown as ContextManagerLike;
}

function buildContext(manager: ContextManagerLike, input: ContextInput): Message[] {
  const method = manager.build ?? manager.compose ?? manager.organize;
  assert.ok(method, 'Expected ContextManager to expose a context-building method.');
  return method.call(manager, input);
}

async function persistContext(
  manager: ContextManagerLike,
  sessionId: string,
  messages: Message[],
): Promise<void> {
  const method = manager.persist ?? manager.save;
  assert.ok(method, 'Expected ContextManager to expose a persistence method.');
  await method.call(manager, sessionId, messages);
}

async function restoreContext(
  manager: ContextManagerLike,
  sessionId: string,
): Promise<Message[] | undefined> {
  const method = manager.restore ?? manager.load;
  assert.ok(method, 'Expected ContextManager to expose a restore method.');
  return method.call(manager, sessionId);
}

function transcript(messages: Message[]): string {
  return messages.map((message) => `${message.role}:${message.content}`).join('\n');
}

test('ContextManager assembles system, conversation, tools, and feedback into one prompt', () => {
  const manager = getContextManager();

  const built = buildContext(manager, {
    systemPrompt: 'You are a coding agent.',
    messages: [
      { role: 'user', content: 'Implement T8.1.' },
      { role: 'assistant', content: 'I will inspect the plan first.' },
      { role: 'user', content: 'Keep the Red phase separate.' },
    ],
    tools: [
      { name: 'file.read', output: 'PLAN.md says to add failing tests first.' },
      { name: 'git.status', output: 'working tree clean' },
    ],
    feedback: [
      {
        category: 'logic',
        message: 'Keep the failure tests scoped to the context manager.',
        suggestion: 'Do not add implementation code in this step.',
      },
    ],
  });

  const text = transcript(built);

  assert.equal(built[0]?.role, 'system');
  assert.match(built[0]?.content ?? '', /You are a coding agent\./);
  assert.match(text, /Implement T8\.1\./);
  assert.match(text, /I will inspect the plan first\./);
  assert.match(text, /Keep the Red phase separate\./);
  assert.match(text, /file\.read/i);
  assert.match(text, /PLAN\.md says to add failing tests first\./);
  assert.match(text, /git\.status/i);
  assert.match(text, /working tree clean/i);
  assert.match(text, /Keep the failure tests scoped to the context manager\./);
  assert.match(text, /Do not add implementation code in this step\./);
});

test('ContextManager truncates long history while preserving the newest turn and a summary', () => {
  const manager = getContextManager({ maxHistory: 4 });

  const built = buildContext(manager, {
    systemPrompt: 'You are a coding agent.',
    messages: [
      { role: 'user', content: 'Turn 1: collect the requirements.' },
      { role: 'assistant', content: 'Turn 2: review the plan.' },
      { role: 'user', content: 'Turn 3: draft the tests.' },
      { role: 'assistant', content: 'Turn 4: keep the implementation absent.' },
      { role: 'user', content: 'Turn 5: verify the red phase.' },
      { role: 'assistant', content: 'Turn 6: record the result in AGENT_LOG.' },
    ],
  });

  const text = transcript(built);

  assert.match(text, /summary|summar/i);
  assert.match(text, /Turn 5: verify the red phase\./);
  assert.match(text, /Turn 6: record the result in AGENT_LOG\./);
  assert.doesNotMatch(text, /Turn 1: collect the requirements\./);
  assert.doesNotMatch(text, /Turn 2: review the plan\./);
});

test('ContextManager persists and restores session context', async () => {
  const sessions = new Map<string, Message[]>();
  const persistence: PersistenceAdapter = {
    async save(sessionId: string, messages: Message[]) {
      sessions.set(sessionId, messages.map((message) => ({ ...message })));
    },
    async load(sessionId: string) {
      return sessions.get(sessionId)?.map((message) => ({ ...message }));
    },
  };

  const manager = getContextManager({ persistence });
  const messages: Message[] = [
    { role: 'system', content: 'You are a coding agent.' },
    { role: 'user', content: 'Persist the current context.' },
    { role: 'assistant', content: 'Context will be stored for the next turn.' },
  ];

  await persistContext(manager, 'session-8', messages);

  const restored = await restoreContext(manager, 'session-8');

  assert.deepEqual(restored, messages);
});
