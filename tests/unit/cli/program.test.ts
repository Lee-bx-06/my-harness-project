import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';
import { createCliProgram } from '../../../src/cli/program';
import { ToolRegistry, type Tool } from '../../../src/tools/registry';

class MemoryWritable extends Writable {
  private readonly chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  text(): string {
    return this.chunks.join('');
  }
}

type CliProgram = {
  parseAsync(argv: string[], options?: { from?: 'node' | 'user' }): Promise<unknown>;
};

function createOutputProgram(options: Parameters<typeof createCliProgram>[0] = {}): {
  program: CliProgram;
  output: MemoryWritable;
  errorOutput: MemoryWritable;
} {
  const output = new MemoryWritable();
  const errorOutput = new MemoryWritable();
  const program = createCliProgram({
    ...options,
    output,
    errorOutput,
  }) as CliProgram;

  return { program, output, errorOutput };
}

function createTool(name: string, description: string): Tool {
  return {
    name,
    description,
    async execute() {
      return { success: true };
    },
  };
}

test('CLI top-level help exposes the required command groups', async () => {
  const { program, output } = createOutputProgram();

  await program.parseAsync(['--help'], { from: 'user' });

  const text = output.text();
  assert.match(text, /Usage:\s+agent/i);
  assert.match(text, /\brun\b/i);
  assert.match(text, /\bcredential\b/i);
  assert.match(text, /\bconfig\b/i);
  assert.match(text, /\btools\b/i);
});

test('CLI credential help exposes credential management commands', async () => {
  const { program, output } = createOutputProgram();

  await program.parseAsync(['credential', '--help'], { from: 'user' });

  const text = output.text();
  assert.match(text, /Usage:\s+agent credential/i);
  assert.match(text, /\bset\b/i);
  assert.match(text, /\bget\b/i);
  assert.match(text, /\bclear\b/i);
});

test('CLI tools command lists registered tool names and descriptions', async () => {
  const registry = new ToolRegistry();
  registry.register(createTool('file.read', 'Read a UTF-8 text file.'));
  registry.register(createTool('shell.exec', 'Execute a shell command.'));
  const { program, output } = createOutputProgram({ tools: registry });

  await program.parseAsync(['tools'], { from: 'user' });

  const text = output.text();
  assert.match(text, /file\.read/);
  assert.match(text, /Read a UTF-8 text file\./);
  assert.match(text, /shell\.exec/);
  assert.match(text, /Execute a shell command\./);
});

test('CLI run command mode passes the instruction to the agent runner and prints completion status', async () => {
  const receivedInstructions: string[] = [];
  const { program, output } = createOutputProgram({
    runAgent: async (instruction: string) => {
      receivedInstructions.push(instruction);
      return {
        completed: true,
        iterations: 2,
        actions: [{ type: 'finish', parameters: {} }],
        toolResults: [],
        messages: [],
      };
    },
  });

  await program.parseAsync(['run', '--instruction', 'Add failing tests first.'], { from: 'user' });

  assert.deepEqual(receivedInstructions, ['Add failing tests first.']);
  assert.match(output.text(), /completed/i);
  assert.match(output.text(), /2\s+iterations?/i);
});
