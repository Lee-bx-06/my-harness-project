import assert from 'node:assert/strict';
import test from 'node:test';
import { ThreatDetector, type ThreatCategory } from '../../../src/guardrail/threatDetector';
import type { Action } from '../../../src/llm/base';

function action(type: string, parameters: Record<string, unknown>): Action {
  return { type, parameters };
}

function assertThreatCategories(
  actual: ReturnType<ThreatDetector['detectCommand']>,
  expected: ThreatCategory[],
): void {
  assert.deepEqual(
    actual.threats.map((threat) => threat.category),
    expected,
  );
}

test('ThreatDetector identifies recursive force deletion commands as critical', () => {
  const detector = new ThreatDetector();

  const result = detector.detectCommand('rm -rf *');

  assert.equal(result.dangerous, true);
  assert.equal(result.level, 'critical');
  assert.equal(result.recommendation, 'require-confirmation');
  assertThreatCategories(result, ['destructive-command', 'file-deletion']);
  assert.match(result.threats[0].reason, /recursive|deletion|filesystem/i);
});

test('ThreatDetector identifies force pushes that rewrite remote history', () => {
  const detector = new ThreatDetector();

  const result = detector.detect(action('git.push', { force: true }));

  assert.equal(result.dangerous, true);
  assert.equal(result.level, 'high');
  assert.equal(result.recommendation, 'require-confirmation');
  assertThreatCategories(result, ['force-push']);
});

test('ThreatDetector identifies hard resets that discard local changes', () => {
  const detector = new ThreatDetector();

  const result = detector.detect(action('git.reset', { mode: '--hard' }));

  assert.equal(result.dangerous, true);
  assert.equal(result.level, 'high');
  assert.equal(result.recommendation, 'require-confirmation');
  assertThreatCategories(result, ['force-reset']);
});

test('ThreatDetector does not flag safe shell and git actions', () => {
  const detector = new ThreatDetector();

  assert.deepEqual(detector.detectCommand('npm test'), {
    dangerous: false,
    level: 'none',
    recommendation: 'allow',
    threats: [],
  });

  assert.deepEqual(detector.detect(action('git.push', { force: false })), {
    dangerous: false,
    level: 'none',
    recommendation: 'allow',
    threats: [],
  });
});
