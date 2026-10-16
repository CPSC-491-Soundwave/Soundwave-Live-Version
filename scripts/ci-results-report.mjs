#!/usr/bin/env node
// Summarize actual server TAP or client Vitest output without masking failures.
// Usage: node scripts/ci-results-report.mjs server|client console-log report-dir step-outcome
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const [suite, logPath, reportDir, outcome] = process.argv.slice(2);
if (!['server', 'client'].includes(suite) || !logPath || !reportDir || !['success','failure','cancelled','skipped'].includes(outcome)) {
  console.error('Usage: node scripts/ci-results-report.mjs server|client log-path report-dir success|failure|cancelled|skipped');
  process.exit(2);
}

let consoleText = '';
let logAvailable = false;
try { consoleText = readFileSync(logPath, 'utf8').replace(/\x1b\[[0-9;]*m/g, ''); logAvailable = true; }
catch (e) { if (e.code !== 'ENOENT') throw e; }

function lastNumber(regex, text = consoleText) {
  let result = null;
  for (const match of text.matchAll(regex)) result = Number(match[1]);
  return result;
}

function parseServer(text) {
  const number = (name) => lastNumber(new RegExp('^#\\s+' + name + '\\s+(\\d+)\\s*$', 'gm'), text);
  const coverageLine = [...text.matchAll(/^\s*#?\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/gm)].at(-1);
  return {
    totals: { tests: number('tests'), passed: number('pass'), failed: number('fail'), skipped: number('skipped'), cancelled: number('cancelled'), todo: number('todo') },
    coverage: coverageLine ? {
      collected: true, tool: 'Node.js 20 experimental test coverage (--experimental-test-coverage)',
      scope: 'All instrumented server JavaScript, including test files; NOT source-only coverage',
      linePercent: Number(coverageLine[1]), branchPercent: Number(coverageLine[2]), functionPercent: Number(coverageLine[3])
    } : { collected: false, reason: 'No completed Node.js coverage report in captured test output' }
  };
}

function parseClient(text) {
  const testLine = [...text.matchAll(/^\s*Tests\s+(.+)$/gm)].at(-1)?.[1] || '';
  const filesLine = [...text.matchAll(/^\s*Test Files\s+(.+)$/gm)].at(-1)?.[1] || '';
  const number = (line, label) => {
    const match = line.match(new RegExp('(\\d+)\\s+' + label + '\\b'));
    return match ? Number(match[1]) : 0;
  };
  const total = testLine.match(/\((\d+)\)/);
  const fileTotal = filesLine.match(/\((\d+)\)/);
  return {
    totals: {
      tests: total ? Number(total[1]) : null,
      passed: testLine ? number(testLine, 'passed') : null,
      failed: testLine ? number(testLine, 'failed') : null,
      skipped: testLine ? number(testLine, 'skipped') : null,
      cancelled: null, todo: testLine ? number(testLine, 'todo') : null,
      testFiles: fileTotal ? Number(fileTotal[1]) : null,
      failedFiles: filesLine ? number(filesLine, 'failed') : null
    },
    coverage: { collected: false, reason: 'Client Tests executes Vitest without a coverage provider; coverage not collected' }
  };
}

const parsed = suite === 'server' ? parseServer(consoleText) : parseClient(consoleText);
const totals = parsed.totals;
// A successful process exit is not sufficient if the reported totals disagree.
const countFields = [totals.passed, totals.failed, totals.skipped, totals.cancelled, totals.todo];
const countsAddUp = countFields.filter((n) => n !== null)
  .reduce((sum, n) => sum + n, 0) === totals.tests;
const countsComplete = logAvailable && Number.isInteger(totals.tests) && totals.tests > 0 &&
  Number.isInteger(totals.passed) && Number.isInteger(totals.failed) && countsAddUp;
const coverageComplete = suite === 'client' || parsed.coverage.collected;
const summaryComplete = countsComplete && coverageComplete;
const status = outcome !== 'success' ? outcome : (summaryComplete && totals.failed === 0 ? 'success' : 'incomplete');
const sha = process.env.GITHUB_SHA || 'local-unset';
const runId = process.env.GITHUB_RUN_ID || 'local-unset';
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || 'local-unset';
const runNumber = process.env.GITHUB_RUN_NUMBER || 'local-unset';
const repo = process.env.GITHUB_REPOSITORY || 'local-unset';
const url = (repo !== 'local-unset' && runId !== 'local-unset')
  ? `https://github.com/${repo}/actions/runs/${runId}/attempts/${runAttempt}` : null;
const report = {
  schemaVersion: 1, suite: suite === 'server' ? 'Server Tests' : 'Client Tests',
  status, originalTestStepOutcome: outcome, countsFromTestOutput: countsComplete,
  commitSha: sha, runId, runAttempt, runNumber, repository: repo, runUrl: url,
  totals, coverage: parsed.coverage
};
mkdirSync(reportDir, { recursive: true });
const title = suite === 'server' ? 'Server Tests' : 'Client Tests';
const show = (v) => v === null ? 'Not reported' : String(v);
const label = (v) => v === null ? 'unavailable' : `${v.toFixed(2)}%`;
const lines = [
  `## ${title} — CI results`, '',
  `- **Test step:** ${outcome.toUpperCase()}${status === 'incomplete' ? ' (results incomplete)' : ''}`,
  `- **Commit SHA:** \`${sha}\``,
  `- **Run / attempt:** \`${runId}\` / \`${runAttempt}\` (run number \`${runNumber}\`)`,
  `- **Workflow run:** ${url ? `[Open run](${url})` : 'Local verification; not hosted'}`, '',
  '| Metric | Observed value |', '| --- | ---: |',
  `| Tests | ${show(totals.tests)} |`,
  `| Passed | ${show(totals.passed)} |`,
  `| Failed | ${show(totals.failed)} |`,
  `| Skipped | ${show(totals.skipped)} |`,
  `| Cancelled | ${show(totals.cancelled)} |`,
  `| Pending / todo | ${show(totals.todo)} |`,
];
if (suite === 'client') {
  lines.push(`| Test files | ${show(totals.testFiles)} |`, `| Failed test files | ${show(totals.failedFiles)} |`);
}
lines.push('', '### Coverage');
if (parsed.coverage.collected) {
  lines.push(`- **Instrument:** ${parsed.coverage.tool}`,
    `- **Scope:** ${parsed.coverage.scope}`,
    `- **Line:** ${label(parsed.coverage.linePercent)}; **branch:** ${label(parsed.coverage.branchPercent)}; **function:** ${label(parsed.coverage.functionPercent)}`);
} else {
  lines.push(`- **Coverage not collected:** ${parsed.coverage.reason}`);
}
if (!countsComplete) lines.push('', '**Incomplete test results:** the executed test output did not provide full counts; do not interpret this as a passing suite.');
if (!coverageComplete) lines.push('', '**Incomplete coverage:** server coverage was expected but could not be parsed; do not interpret this as passing coverage collection.');
lines.push('', 'Report JSON and this summary are available in the run-matched CI artifact. Other workflow checks appear on the GitHub Actions run page.', '');
const summary = lines.join('\n');
writeFileSync(join(reportDir, `${suite}-results.json`), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(reportDir, `${suite}-summary.md`), summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
process.stdout.write(`${title}: ${status}; ${show(totals.passed)}/${show(totals.tests)} passed; coverage ${parsed.coverage.collected ? label(parsed.coverage.linePercent) : 'not collected'}\n`);
// Preserve failures: the test step itself still fails; also fail closed on missing summaries for successful tests.
if (status === 'incomplete') process.exitCode = 1;
