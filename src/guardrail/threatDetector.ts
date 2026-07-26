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
    pattern: /\brm\s+(?=[^\n\r;|&]*-[^\n\r;|&]*r)(?=[^\n\r;|&]*-[^\n\r;|&]*f)[^\n\r;|&]*(?:\s+\/|\s+\*|\s+\.{1,2}(?:\/|$)|\s+~(?:\/|$))/i,
  },
  {
    category: 'destructive-command',
    level: 'critical',
    recommendation: 'require-confirmation',
    reason: 'Windows format command can erase a disk or partition.',
    pattern: /\bformat(?:\.com)?\s+[a-z]:/i,
  },
  {
    category: 'destructive-command',
    level: 'high',
    recommendation: 'require-confirmation',
    reason: 'Git clean with force can permanently delete untracked files.',
    pattern: /\bgit\s+clean\b(?=[^\n\r;|&]*-[^\n\r;|&]*f)(?=[^\n\r;|&]*(?:-[^\n\r;|&]*d|--directories\b))/i,
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
  {
    category: 'system-modification',
    level: 'medium',
    recommendation: 'require-confirmation',
    reason: 'Elevated commands can modify system state outside the project.',
    pattern: /\bsudo\b|\bSet-ExecutionPolicy\b|\breg\s+(?:add|delete|import)\b/i,
  },
  {
    category: 'system-modification',
    level: 'medium',
    recommendation: 'require-confirmation',
    reason: 'Global package installation changes the host environment.',
    pattern: /\b(?:npm|pnpm|yarn)\s+(?:install|add)\b(?=[^\n\r;|&]*(?:-g\b|--global\b))/i,
  },
  {
    category: 'network-access',
    level: 'medium',
    recommendation: 'monitor',
    reason: 'Network commands may call external services or download code.',
    pattern: /\b(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b/i,
  },
  {
    category: 'network-access',
    level: 'high',
    recommendation: 'require-confirmation',
    reason: 'Publishing packages can expose project artifacts externally.',
    pattern: /\b(?:npm|pnpm|yarn)\s+publish\b/i,
  },
  {
    category: 'file-deletion',
    level: 'medium',
    recommendation: 'require-confirmation',
    reason: 'File deletion should be reviewed before execution.',
    pattern: /\b(?:rm|del|erase|Remove-Item)\b(?![^\n\r;|&]*\s+-?help\b)/i,
  },
  {
    category: 'credential-risk',
    level: 'high',
    recommendation: 'deny',
    reason: 'Commands that print environment variables can expose credentials.',
    pattern: /\b(?:env|printenv|set)\b|\bGet-ChildItem\s+Env:/i,
  },
];

export class ThreatDetector {
  private readonly patterns: ThreatPattern[];

  constructor(options: ThreatDetectorOptions = {}) {
    this.patterns = [...defaultPatterns, ...(options.additionalPatterns ?? [])];
  }

  detect(action: Action): ThreatDetectionResult {
    const target = this.extractDetectionTarget(action);
    const threats = target ? this.matchThreats(target) : [];

    return {
      dangerous: threats.length > 0,
      level: this.highestLevel(threats),
      recommendation: this.strictestRecommendation(threats),
      threats,
    };
  }

  isDangerous(action: Action): boolean {
    return this.detect(action).dangerous;
  }

  detectCommand(command: string): ThreatDetectionResult {
    const threats = this.matchThreats(command);

    return {
      dangerous: threats.length > 0,
      level: this.highestLevel(threats),
      recommendation: this.strictestRecommendation(threats),
      threats,
    };
  }

  private extractDetectionTarget(action: Action): string {
    if (action.type === 'shell.exec' || action.type === 'test.run') {
      return this.stringParameter(action, 'command');
    }

    if (action.type.startsWith('git.')) {
      return this.gitActionToCommand(action);
    }

    if (action.type === 'file.delete' || action.type === 'file.remove') {
      return `rm ${this.stringParameter(action, 'path')}`;
    }

    return [
      action.type,
      ...Object.values(action.parameters).filter(
        (value): value is string => typeof value === 'string',
      ),
    ].join(' ');
  }

  private stringParameter(action: Action, key: string): string {
    const value = action.parameters[key];
    return typeof value === 'string' ? value : '';
  }

  private gitActionToCommand(action: Action): string {
    if (action.type === 'git.push') {
      const force = action.parameters.force === true ? ' --force' : '';
      return `git push${force}`;
    }

    if (action.type === 'git.reset') {
      const mode = this.stringParameter(action, 'mode');
      return `git reset ${mode}`;
    }

    if (action.type === 'git.clean') {
      return 'git clean -fd';
    }

    return action.type.replace('.', ' ');
  }

  private matchThreats(target: string): ThreatMatch[] {
    return this.patterns
      .filter((entry) => entry.pattern.test(target))
      .map((entry) => ({
        category: entry.category,
        level: entry.level,
        recommendation: entry.recommendation,
        reason: entry.reason,
        matchedPattern: entry.pattern.source,
      }));
  }

  private highestLevel(threats: ThreatMatch[]): ThreatLevel {
    return threats.reduce<ThreatLevel>(
      (highest, threat) =>
        severityRank[threat.level] > severityRank[highest] ? threat.level : highest,
      'none',
    );
  }

  private strictestRecommendation(threats: ThreatMatch[]): ThreatRecommendation {
    return threats.reduce<ThreatRecommendation>(
      (strictest, threat) =>
        recommendationRank[threat.recommendation] > recommendationRank[strictest]
          ? threat.recommendation
          : strictest,
      'allow',
    );
  }
}
