export interface FeedbackLocation {
  file: string;
  line: number;
  column?: number;
}

export interface Feedback {
  type: 'success' | 'failure';
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  location?: FeedbackLocation;
}

export class TestValidator {
  parse(output: string): Feedback[] {
    return this.parseOutput(output);
  }

  validate(output: string): Feedback[] {
    return this.parseOutput(output);
  }

  private parseOutput(output: string): Feedback[] {
    const lines = output.split(/\r?\n/);
    const feedback: Feedback[] = [];
    let currentFramework: 'jest' | 'mocha' | undefined;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();

      if (isJestFailureMarker(line)) {
        currentFramework = 'jest';
        continue;
      }

      if (isMochaFailureMarker(line)) {
        currentFramework = 'mocha';
        continue;
      }

      if (!currentFramework) {
        continue;
      }

      if (line === '') {
        currentFramework = undefined;
        continue;
      }

      if (isErrorLine(line)) {
        feedback.push(createFailure(line, lines.slice(index + 1)));
        currentFramework = undefined;
      }
    }

    return feedback;
  }
}

function createFailure(message: string, remainingLines: string[]): Feedback {
  return {
    type: 'failure',
    category: classifyMessage(message),
    message,
    location: findLocation(remainingLines),
  };
}

function classifyMessage(message: string): Feedback['category'] {
  if (/syntaxerror/i.test(message)) {
    return 'syntax';
  }

  if (/typeerror/i.test(message)) {
    return 'type';
  }

  if (/lint/i.test(message)) {
    return 'lint';
  }

  if (/performance|timeout/i.test(message)) {
    return 'performance';
  }

  return 'logic';
}

function isErrorLine(line: string): boolean {
  return /^((Type|Syntax)Error:|Error:)/.test(line);
}

function isJestFailureMarker(line: string): boolean {
  return line.startsWith('FAIL ');
}

function isMochaFailureMarker(line: string): boolean {
  return /^\d+\)\s+.+$/.test(line);
}

function findLocation(lines: string[]): FeedbackLocation | undefined {
  for (const rawLine of lines) {
    const line = rawLine.trim();

    const stackMatch = line.match(/\(([^()]+):(\d+):(\d+)\)$/);
    if (stackMatch) {
      return {
        file: stackMatch[1],
        line: Number(stackMatch[2]),
        column: Number(stackMatch[3]),
      };
    }

    const inlineMatch = line.match(/^at\s+(.+):(\d+):(\d+)$/);
    if (inlineMatch) {
      return {
        file: inlineMatch[1],
        line: Number(inlineMatch[2]),
        column: Number(inlineMatch[3]),
      };
    }
  }

  return undefined;
}
