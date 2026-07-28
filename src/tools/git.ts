import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolResult } from './registry';

const execFileAsync = promisify(execFile);

export class GitTool {
  getTools(): Tool[] {
    return [
      {
        name: 'git.status',
        description: 'Return git repository status.',
        execute: (parameters) => this.status(parameters),
      },
      {
        name: 'git.commit',
        description: 'Stage all changes and create a git commit.',
        execute: (parameters) => this.commit(parameters),
      },
    ];
  }

  private async status(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = readCwdInput(parameters);
    if (!input.success) {
      return input;
    }

    const result = await runGit(['status', '--short', '--branch'], input.cwd);
    if (!result.success) {
      return failure(gitErrorMessage(result, 'Failed to get git status.'), result);
    }

    const raw = result.stdout;
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
    const branch = parseBranch(lines[0]);
    const files = lines.slice(1).map(parseStatusFile);

    return {
      success: true,
      data: {
        branch,
        clean: files.length === 0,
        raw,
        files,
      },
    };
  }

  private async commit(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = readCommitInput(parameters);
    if (!input.success) {
      return input;
    }

    const identity = await readLocalIdentity(input.cwd);
    if (!identity.success) {
      return identity;
    }

    const addResult = await runGit(['add', '-A'], input.cwd);
    if (!addResult.success) {
      return failure(gitErrorMessage(addResult, 'Failed to stage changes.'), addResult);
    }

    const commitResult = await runGit(['commit', '-m', input.message], input.cwd);
    if (!commitResult.success) {
      return failure(gitErrorMessage(commitResult, 'Failed to create git commit.'), commitResult);
    }

    const hashResult = await runGit(['rev-parse', 'HEAD'], input.cwd);
    if (!hashResult.success) {
      return failure(gitErrorMessage(hashResult, 'Failed to read commit hash.'), hashResult);
    }

    return {
      success: true,
      data: {
        message: input.message,
        hash: hashResult.stdout.trim(),
        stdout: commitResult.stdout,
        stderr: commitResult.stderr,
        exitCode: commitResult.exitCode,
      },
    };
  }
}

interface CwdInput {
  success: true;
  cwd?: string;
}

interface CommitInput extends CwdInput {
  message: string;
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

type FailureResult = Extract<ToolResult, { success: false }>;

function readCwdInput(parameters: Record<string, unknown>): CwdInput | FailureResult {
  if (parameters.cwd !== undefined && typeof parameters.cwd !== 'string') {
    return failure('cwd must be a string when provided.');
  }

  return {
    success: true,
    cwd: parameters.cwd,
  };
}

function readCommitInput(parameters: Record<string, unknown>): CommitInput | FailureResult {
  const cwdInput = readCwdInput(parameters);
  if (!cwdInput.success) {
    return cwdInput;
  }

  if (typeof parameters.message !== 'string' || parameters.message.trim() === '') {
    return failure('message must be a non-empty string.');
  }

  return {
    ...cwdInput,
    message: parameters.message,
  };
}

async function runGit(args: string[], cwd?: string): Promise<GitCommandResult & { success: boolean }> {
  try {
    const result = await execFileAsync('git', args, { cwd });
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error) {
    if (isExecError(error)) {
      return {
        success: false,
        stdout: String(error.stdout ?? ''),
        stderr: String(error.stderr ?? error.message),
        exitCode: typeof error.code === 'number' ? error.code : null,
      };
    }

    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown git error.',
      exitCode: null,
    };
  }
}

function parseBranch(line: string | undefined): string {
  if (!line) {
    return '';
  }

  const branch = line.replace(/^##\s+/, '').split('...')[0].trim();
  const unborn = branch.match(/^No commits yet on (.+)$/);
  return unborn ? unborn[1].trim() : branch;
}

function parseStatusFile(line: string): { path: string; index: string; workingTree: string } {
  return {
    index: line[0] ?? ' ',
    workingTree: line[1] ?? ' ',
    path: line.slice(3).trim(),
  };
}

function gitErrorMessage(result: GitCommandResult, fallback: string): string {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  return output === '' ? fallback : `${fallback} ${output}`;
}

async function readLocalIdentity(cwd?: string): Promise<{ success: true } | FailureResult> {
  const name = await runGit(['config', '--local', '--get', 'user.name'], cwd);
  const email = await runGit(['config', '--local', '--get', 'user.email'], cwd);

  if (name.success && email.success && name.stdout.trim() !== '' && email.stdout.trim() !== '') {
    return { success: true };
  }

  return failure('Git user identity is not configured. Set user.name and user.email.', {
    stdout: `${name.stdout}${email.stdout}`,
    stderr: `${name.stderr}${email.stderr}`,
    exitCode: 128,
  });
}

function failure(error: string, data?: unknown): FailureResult {
  return {
    success: false,
    error,
    data,
  };
}

function isExecError(error: unknown): error is Error & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: string | number;
} {
  return error instanceof Error;
}
