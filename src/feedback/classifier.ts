export interface ClassificationResult {
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion: string;
}

type ClassificationCategory = ClassificationResult['category'];

interface ClassificationRule {
  category: ClassificationCategory;
  pattern: RegExp;
  suggestion: string;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    category: 'syntax',
    pattern: /syntaxerror|unexpected token|parse/i,
    suggestion: 'Check the syntax and fix the parse error or unmatched token.',
  },
  {
    category: 'type',
    pattern: /typeerror|not assignable|type/i,
    suggestion: 'Review the type annotation or type assignment causing the mismatch.',
  },
  {
    category: 'lint',
    pattern: /lint|eslint|prettier|no-console|format/i,
    suggestion: 'Run linting and remove the reported style or lint violation.',
  },
  {
    category: 'performance',
    pattern: /performance|timeout|slow|exceeded/i,
    suggestion: 'Investigate the slow path and optimize the operation or timeout.',
  },
];

export class FailureClassifier {
  classify = (message: string): ClassificationResult => classifyMessage(message);

  analyze = (message: string): ClassificationResult => classifyMessage(message);
}

function classifyMessage(message: string): ClassificationResult {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(message)) {
      return createResult(rule, message);
    }
  }

  return {
    category: 'logic',
    message,
    suggestion: 'Review the assertion or control flow and correct the expected behavior.',
  };
}

function createResult(rule: ClassificationRule, message: string): ClassificationResult {
  return {
    category: rule.category,
    message,
    suggestion: rule.suggestion,
  };
}
