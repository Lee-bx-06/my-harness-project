import type { Action } from '../llm/base';

export type ThreatCategory =
  | 'destructive-command'
  | 'force-push'
  | 'force-reset'
  | 'system-modification'
  | 'network-access'
  | 'file-deletion'
  | 'credential-risk'
  | 'unknown';

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type ThreatRecommendation =
  | 'allow'
  | 'monitor'
  | 'require-confirmation'
  | 'deny';

export interface ThreatMatch {
  category: ThreatCategory;
  level: ThreatLevel;
  recommendation: ThreatRecommendation;
  reason: string;
  matchedPattern?: string;
}

export interface ThreatDetectionResult {
  dangerous: boolean;
  level: ThreatLevel;
  recommendation: ThreatRecommendation;
  threats: ThreatMatch[];
}

export interface ThreatPattern {
  category: ThreatCategory;
  level: Exclude<ThreatLevel, 'none'>;
  recommendation: Exclude<ThreatRecommendation, 'allow'>;
  reason: string;
  pattern: RegExp;
}

export interface ThreatDetectorOptions {
  additionalPatterns?: ThreatPattern[];
}

const severityRank: Record<ThreatLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const recommendationRank: Record<ThreatRecommendation, number> = {
  allow: 0,
  monitor: 1,
  'require-confirmation': 2,
  deny: 3,
};

const defaultPatterns: ThreatPattern[] = [
  {
    category: 'destructive-command',
    level: 'critical',
    recommendation: 'require-confirmation',
    reason: 'Recursive force deletion can remove large parts of the filesystem.',
    pattern: /\brm\s+(?=[^\n\r;|&]*-[^\n\r;|&]*r)(?=[^\n\r;|&]*-[^\n\r;|&]*f)[^\n\r;|&]*(?:\s+\*)/i,
  },
  {
    category: 'file-deletion',
    level: 'medium',
    recommendation: 'require-confirmation',
    reason: 'File deletion should be reviewed before execution.',
    pattern: /\brm\b/i,
  },
  {
    category: 'force-push',
    level: 'high',
    recommendation: 'require-confirmation',
    reason: 'Force pushing can rewrite remote history.',
    pattern: /\bgit\s+push\b(?=[^\n\r;|&]*(?:--force(?:-with-lease)?\b|-f\b))/i,
  },
  {
    category: 'force-reset',
    level: 'high',
    recommendation: 'require-confirmation',
    reason: 'Hard reset can discard local changes.',
    pattern: /\bgit\s+reset\s+--hard\b/i,
  },
];

export class ThreatDetector {
  private readonly patterns: ThreatPattern[];

  constructor(options: ThreatDetectorOptions = {}) {
    this.patterns = [...defaultPatterns, ...(options.additionalPatterns ?? [])];
  }

  detect(action: Action): ThreatDetectionResult {
    return this.detectCommand(this.actionToCommand(action));
  }

  isDangerous(action: Action): boolean {
    return this.detect(action).dangerous;
  }

  detectCommand(command: string): ThreatDetectionResult {
    const threats = this.patterns
      .filter((entry) => entry.pattern.test(command))
      .map((entry) => ({
        category: entry.category,
        level: entry.level,
        recommendation: entry.recommendation,
        reason: entry.reason,
        matchedPattern: entry.pattern.source,
      }));

    if (threats.length === 0) {
      return emptyResult();
    }

    return {
      dangerous: true,
      level: highestLevel(threats),
      recommendation: strictestRecommendation(threats),
      threats,
    };
  }

  private actionToCommand(action: Action): string {
    if (action.type === 'git.push') {
      return action.parameters.force === true ? 'git push --force' : 'git push';
    }

    if (action.type === 'git.reset') {
      const mode = action.parameters.mode;
      return typeof mode === 'string' ? `git reset ${mode}` : 'git reset';
    }

    if (action.type === 'shell.exec') {
      const command = action.parameters.command;
      return typeof command === 'string' ? command : '';
    }

    return action.type;
  }
}

function emptyResult(): ThreatDetectionResult {
  return {
    dangerous: false,
    level: 'none',
    recommendation: 'allow',
    threats: [],
  };
}

function highestLevel(threats: ThreatMatch[]): ThreatLevel {
  return threats.reduce<ThreatLevel>(
    (highest, threat) =>
      severityRank[threat.level] > severityRank[highest] ? threat.level : highest,
    'none',
  );
}

function strictestRecommendation(threats: ThreatMatch[]): ThreatRecommendation {
  return threats.reduce<ThreatRecommendation>(
    (strictest, threat) =>
      recommendationRank[threat.recommendation] > recommendationRank[strictest]
        ? threat.recommendation
        : strictest,
    'allow',
  );
}
