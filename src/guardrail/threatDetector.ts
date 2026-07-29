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

export class ThreatDetector {
  constructor(_options: ThreatDetectorOptions = {}) {}

  detect(action: Action): ThreatDetectionResult {
    void action;
    return emptyResult();
  }

  isDangerous(action: Action): boolean {
    return this.detect(action).dangerous;
  }

  detectCommand(command: string): ThreatDetectionResult {
    void command;
    return emptyResult();
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
