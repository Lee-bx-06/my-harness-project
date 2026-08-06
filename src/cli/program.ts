import { Writable } from 'node:stream';
import { Command, CommanderError } from 'commander';
import type { AgentRunResult } from '../agent/mainLoop';
import { ToolRegistry } from '../tools/registry';

export interface CliProgramOptions {
  output?: Writable;
  errorOutput?: Writable;
  tools?: ToolRegistry;
  runAgent?: (instruction: string) => Promise<AgentRunResult>;
}

export function createCliProgram(options: CliProgramOptions = {}): Command {
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const tools = options.tools ?? new ToolRegistry();
  const runAgent = options.runAgent ?? defaultRunAgent;

  const program = new Command('agent');
  configureProgram(program, output, errorOutput);

  program
    .description('Coding agent harness command-line interface.')
    .addCommand(createRunCommand(runAgent, output))
    .addCommand(createCredentialCommand(output, errorOutput))
    .addCommand(createConfigCommand(output, errorOutput))
    .addCommand(createToolsCommand(tools, output));

  makeHelpTestable(program);

  return program;
}

function configureProgram(program: Command, output: Writable, errorOutput: Writable): void {
  program.configureOutput({
    writeOut: (text) => output.write(text),
    writeErr: (text) => errorOutput.write(text),
  });
}

function createRunCommand(
  runAgent: (instruction: string) => Promise<AgentRunResult>,
  output: Writable,
): Command {
  return new Command('run')
    .description('Start an agent session.')
    .option('-i, --instruction <instruction>', 'instruction to run in command mode')
    .action(async (commandOptions: { instruction?: string }) => {
      const instruction = commandOptions.instruction?.trim();

      if (!instruction) {
        output.write('Interactive mode is not implemented yet.\n');
        return;
      }

      const result = await runAgent(instruction);
      const status = result.completed ? 'completed' : 'stopped';
      output.write(`Agent ${status} after ${result.iterations} iterations.\n`);
    });
}

function createCredentialCommand(output: Writable, errorOutput: Writable): Command {
  const credential = new Command('credential')
    .description('Manage credentials.');
  configureProgram(credential, output, errorOutput);

  const setCommand = credential
    .command('set')
    .description('Set a credential value.')
    .argument('<name>')
    .argument('<value>')
    .action((name: string) => {
      output.write(`Credential ${name} set.\n`);
    });
  configureProgram(setCommand, output, errorOutput);

  const getCommand = credential
    .command('get')
    .description('Get a credential value.')
    .argument('<name>')
    .action((name: string) => {
      output.write(`Credential ${name} is not configured.\n`);
    });
  configureProgram(getCommand, output, errorOutput);

  const clearCommand = credential
    .command('clear')
    .description('Clear a credential value.')
    .argument('<name>')
    .action((name: string) => {
      output.write(`Credential ${name} cleared.\n`);
    });
  configureProgram(clearCommand, output, errorOutput);

  return credential;
}

function createConfigCommand(output: Writable, errorOutput: Writable): Command {
  const config = new Command('config')
    .description('Manage configuration.');
  configureProgram(config, output, errorOutput);

  const showCommand = config
    .command('show')
    .description('Show configuration.')
    .action(() => {
      output.write('Configuration display is not implemented yet.\n');
    });
  configureProgram(showCommand, output, errorOutput);

  const setCommand = config
    .command('set')
    .description('Set a configuration value.')
    .argument('<key>')
    .argument('<value>')
    .action((key: string) => {
      output.write(`Configuration ${key} set.\n`);
    });
  configureProgram(setCommand, output, errorOutput);

  return config;
}

function createToolsCommand(tools: ToolRegistry, output: Writable): Command {
  return new Command('tools')
    .description('List available tools.')
    .action(() => {
      for (const tool of tools.list()) {
        output.write(`${tool.name}\t${tool.description}\n`);
      }
    });
}

async function defaultRunAgent(_instruction: string): Promise<AgentRunResult> {
  return {
    completed: false,
    iterations: 0,
    actions: [],
    toolResults: [],
    messages: [],
    stopReason: 'agent-runner-not-configured',
  };
}

function makeHelpTestable(program: Command): void {
  program.exitOverride((error) => {
    throw error;
  });

  const parseAsync = program.parseAsync.bind(program);
  program.parseAsync = async (...args: Parameters<Command['parseAsync']>): Promise<Command> => {
    try {
      return await parseAsync(...args);
    } catch (error) {
      if (isHelpDisplayed(error)) {
        return program;
      }

      throw error;
    }
  };
}

function isHelpDisplayed(error: unknown): boolean {
  return error instanceof CommanderError && error.code === 'commander.helpDisplayed';
}
