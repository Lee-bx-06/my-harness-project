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
  const streams = resolveStreams(options);
  const tools = options.tools ?? new ToolRegistry();
  const runAgent = options.runAgent ?? defaultRunAgent;

  const program = new Command('agent');
  configureCommand(program, streams);

  program
    .description('Coding agent harness command-line interface.')
    .addCommand(createRunCommand(runAgent, streams))
    .addCommand(createCredentialCommand(streams))
    .addCommand(createConfigCommand(streams))
    .addCommand(createToolsCommand(tools, streams));

  makeHelpTestable(program);

  return program;
}

type CliStreams = Required<Pick<CliProgramOptions, 'output' | 'errorOutput'>>;

function resolveStreams(options: CliProgramOptions): CliStreams {
  return {
    output: options.output ?? process.stdout,
    errorOutput: options.errorOutput ?? process.stderr,
  };
}

function configureCommand(program: Command, streams: CliStreams): void {
  program.configureOutput({
    writeOut: (text) => streams.output.write(text),
    writeErr: (text) => streams.errorOutput.write(text),
  });
}

function createRunCommand(
  runAgent: (instruction: string) => Promise<AgentRunResult>,
  streams: CliStreams,
): Command {
  const command = new Command('run')
    .description('Start an agent session.')
    .option('-i, --instruction <instruction>', 'instruction to run in command mode')
    .action(async (commandOptions: { instruction?: string }) => {
      const instruction = commandOptions.instruction?.trim();

      if (!instruction) {
        streams.output.write('Interactive mode is not implemented yet.\n');
        return;
      }

      const result = await runAgent(instruction);
      const status = result.completed ? 'completed' : 'stopped';
      streams.output.write(`Agent ${status} after ${result.iterations} iterations.\n`);
    });

  configureCommand(command, streams);
  return command;
}

function createCredentialCommand(streams: CliStreams): Command {
  const credential = new Command('credential')
    .description('Manage credentials.');
  configureCommand(credential, streams);

  const setCommand = credential
    .command('set')
    .description('Set a credential value.')
    .argument('<name>')
    .argument('<value>')
    .action((name: string) => {
      streams.output.write(`Credential ${name} set.\n`);
    });
  configureCommand(setCommand, streams);

  const getCommand = credential
    .command('get')
    .description('Get a credential value.')
    .argument('<name>')
    .action((name: string) => {
      streams.output.write(`Credential ${name} is not configured.\n`);
    });
  configureCommand(getCommand, streams);

  const clearCommand = credential
    .command('clear')
    .description('Clear a credential value.')
    .argument('<name>')
    .action((name: string) => {
      streams.output.write(`Credential ${name} cleared.\n`);
    });
  configureCommand(clearCommand, streams);

  return credential;
}

function createConfigCommand(streams: CliStreams): Command {
  const config = new Command('config')
    .description('Manage configuration.');
  configureCommand(config, streams);

  const showCommand = config
    .command('show')
    .description('Show configuration.')
    .action(() => {
      streams.output.write('Configuration display is not implemented yet.\n');
    });
  configureCommand(showCommand, streams);

  const setCommand = config
    .command('set')
    .description('Set a configuration value.')
    .argument('<key>')
    .argument('<value>')
    .action((key: string) => {
      streams.output.write(`Configuration ${key} set.\n`);
    });
  configureCommand(setCommand, streams);

  return config;
}

function createToolsCommand(tools: ToolRegistry, streams: CliStreams): Command {
  const command = new Command('tools')
    .description('List available tools.')
    .action(() => {
      for (const tool of tools.list()) {
        streams.output.write(`${tool.name}\t${tool.description}\n`);
      }
    });

  configureCommand(command, streams);
  return command;
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
