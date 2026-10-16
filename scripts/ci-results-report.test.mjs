import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/ci-results-report.mjs');
function verify(suite, text, outcome, expected) {
  const dir = mkdtempSync(join(tmpdir(), 'sw-ci-report-'));
  try {
    const log = join(dir, 'log.txt');
    writeFileSync(log, text);
    const run = spawnSync(process.execPath, [script, suite, log, dir, outcome], { encoding: 'utf8', env: { ...process.env, GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '987', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: 'org/repo' } });
    const report = JSON.parse(readFileSync(join(dir, `${suite}-results.json`), 'utf8'));
    const summary = readFileSync(join(dir, `${suite}-summary.md`), 'utf8');
    assert.equal(report.status, expected.status);
    assert.equal(report.originalTestStepOutcome, outcome);
    assert.equal(report.commitSha, 'abc123');
    assert.equal(run.status, expected.exitCode);
    assert.ok(summary.includes('abc123'));
    assert.ok(summary.includes('github.com/org/repo/actions/runs/987'));
    return report;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('server TAP counts and real all-files coverage parsed', () => {
  const report = verify('server', '# tests 223\n# pass 223\n# fail 0\n# skipped 0\n# cancelled 0\n# todo 0\n# all files | 96.76 | 92.63 | 90.89 |\n', 'success', { status: 'success', exitCode: 0 });
  assert.equal(report.totals.tests, 223);
  assert.equal(report.coverage.linePercent, 96.76);
  assert.match(report.coverage.scope, /including test files/);
});
test('failed backend tests remain failed', () => {
  const report = verify('server', '# tests 5\n# pass 4\n# fail 1\n', 'failure', { status: 'failure', exitCode: 0 });
  assert.equal(report.totals.failed, 1);
});
test('Vitest success captures real file and test counts and unavailable coverage', () => {
  const report = verify('client', ' Test Files  20 passed (20)\n      Tests  100 passed (100)\n', 'success', { status: 'success', exitCode: 0 });
  assert.equal(report.totals.testFiles, 20);
  assert.equal(report.totals.passed, 100);
  assert.equal(report.coverage.collected, false);
});
test('Vitest failure retains passed, failed and skipped', () => {
  const report = verify('client', ' Test Files  1 failed | 19 passed (20)\n      Tests  2 failed | 1 skipped | 97 passed (100)\n', 'failure', { status: 'failure', exitCode: 0 });
  assert.equal(report.totals.failed, 2);
  assert.equal(report.totals.skipped, 1);
});
test('successful client exit with inconsistent counts fails closed', () => {
  const report = verify('client', ' Test Files  1 passed (1)\n      Tests  4 passed (5)\n', 'success', { status: 'incomplete', exitCode: 1 });
  assert.equal(report.countsFromTestOutput, false);
});
test('successful server exit with inconsistent counts fails closed', () => {
  const report = verify('server', '# tests 5\n# pass 4\n# fail 0\n# skipped 0\n# cancelled 0\n# todo 0\n# all files | 96.76 | 92.63 | 90.89 |\n', 'success', { status: 'incomplete', exitCode: 1 });
  assert.equal(report.countsFromTestOutput, false);
});
test('valid test counts retain provenance when server coverage is missing', () => {
  const report = verify('server', '# tests 3\n# pass 3\n# fail 0\n', 'success', { status: 'incomplete', exitCode: 1 });
  assert.equal(report.countsFromTestOutput, true);
  assert.equal(report.coverage.collected, false);
});
test('server successful step without coverage fails closed', () => {
  const report = verify('server', '# tests 3\n# pass 3\n# fail 0\n', 'success', { status: 'incomplete', exitCode: 1 });
  assert.equal(report.coverage.collected, false);
});
test('successful shell exit without test counts fails closed', () => {
  const report = verify('server', 'No test summary here\n', 'success', { status: 'incomplete', exitCode: 1 });
  assert.equal(report.countsFromTestOutput, false);
});
