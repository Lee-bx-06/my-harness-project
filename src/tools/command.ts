import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface ShellCommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export async function runShellCommand(
  command: string,
  options: ShellCommandOptions = {},
): Promise<CommandResult & { timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            terminateProcess(child.pid);
          }, options.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      stderr += stderr === '' || stderr.endsWith('\n') ? error.message : `\n${error.message}`;
      resolve({
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        timedOut,
      });
    });

    child.on('close', (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
      });
    });
  });
}

export async function runFileCommand(
  file: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(file, args, { cwd: options.cwd });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
      signal: null,
    };
  } catch (error) {
    if (isExecError(error)) {
      return {
        stdout: String(error.stdout ?? ''),
        stderr: String(error.stderr ?? error.message),
        exitCode: typeof error.code === 'number' ? error.code : null,
        signal: typeof error.signal === 'string' ? (error.signal as NodeJS.Signals) : null,
      };
    }

    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown command error.',
      exitCode: null,
      signal: null,
    };
  }
}

function terminateProcess(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-pid);
  } catch {
    try {
      process.kill(pid);
    } catch {
      // The process may have already exited between timeout and termination.
    }
  }
}

function isExecError(error: unknown): error is Error & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: string | number;
  signal?: string;
} {
  return error instanceof Error;
}
