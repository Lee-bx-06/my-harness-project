import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolRegistry, type Tool } from '../../../src/tools/registry';

function createTool(name: string): Tool {
  return {
    name,
    description: `${name} test tool`,
    async execute(parameters: Record<string, unknown>) {
      return {
        success: true,
        data: {
          name,
          parameters,
        },
      };
    },
  };
}

test('ToolRegistry registers and retrieves a tool by name', () => {
  const registry = new ToolRegistry();
  const fileRead = createTool('file.read');

  registry.register(fileRead);

  assert.equal(registry.get('file.read'), fileRead);
});

test('ToolRegistry lists all registered tools in registration order', () => {
  const registry = new ToolRegistry();
  const fileRead = createTool('file.read');
  const shellExec = createTool('shell.exec');

  registry.register(fileRead);
  registry.register(shellExec);

  assert.deepEqual(registry.list(), [fileRead, shellExec]);
});

test('ToolRegistry rejects duplicate tool names', () => {
  const registry = new ToolRegistry();

  registry.register(createTool('file.read'));

  assert.throws(
    () => registry.register(createTool('file.read')),
    /already registered/i,
  );
});

test('ToolRegistry rejects tools with blank names', () => {
  const registry = new ToolRegistry();

  assert.throws(
    () => registry.register(createTool('   ')),
    /tool name/i,
  );
});

test('ToolRegistry throws when getting an unknown tool', () => {
  const registry = new ToolRegistry();

  assert.throws(
    () => registry.get('missing.tool'),
    /not registered|unknown tool/i,
  );
});
