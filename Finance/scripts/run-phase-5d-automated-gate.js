'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const financeRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(financeRoot, '..');
const jsonOnly = process.argv.includes('--json');

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return listJavaScriptFiles(target);
        return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    });
}

function runNode(argumentsList) {
    return spawnSync(process.execPath, argumentsList, {
        cwd: workspaceRoot,
        encoding: 'utf8',
        maxBuffer: 24 * 1024 * 1024
    });
}

const syntaxFiles = listJavaScriptFiles(path.join(financeRoot, 'assets', 'js'));
const syntaxFailures = [];
for (const filename of syntaxFiles) {
    const result = runNode(['--check', filename]);
    if (result.status !== 0) {
        syntaxFailures.push({
            file: path.relative(workspaceRoot, filename),
            output: String(result.stderr || result.stdout || '').trim()
        });
    }
}

const testFiles = fs.readdirSync(path.join(financeRoot, 'tests'))
    .filter(filename => filename.endsWith('.test.js'))
    .sort()
    .map(filename => path.join('Finance', 'tests', filename));
const suite = syntaxFailures.length === 0
    ? runNode(['--test', ...testFiles])
    : { status: 1, stdout: '', stderr: 'Test suite skipped because JavaScript syntax checks failed.' };
const suiteOutput = `${suite.stdout || ''}\n${suite.stderr || ''}`;
const suitePassed = suite.status === 0;
const testCount = Number(suiteOutput.match(/(?:^|\n)[^\n]*tests\s+(\d+)/)?.[1] || 0);
const passCount = Number(suiteOutput.match(/(?:^|\n)[^\n]*pass\s+(\d+)/)?.[1] || 0);
const fixtureFilesPresent = testFiles.some(filename => filename.endsWith('phase-2e-fixture.test.js'))
    && testFiles.some(filename => filename.endsWith('phase-2e-reconciliation.test.js'));

const evidence = {
    contractVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    syntax: {
        valid: syntaxFailures.length === 0,
        checkedCount: syntaxFiles.length,
        issueCount: syntaxFailures.length
    },
    fixtureReconciliation: {
        valid: suitePassed && fixtureFilesPresent,
        available: fixtureFilesPresent,
        issueCount: suitePassed && fixtureFilesPresent ? 0 : 1
    },
    regressionSuite: {
        valid: suitePassed && testCount > 0 && passCount === testCount,
        available: true,
        testCount,
        passCount,
        issueCount: suitePassed ? 0 : 1
    }
};
const valid = evidence.syntax.valid
    && evidence.fixtureReconciliation.valid
    && evidence.regressionSuite.valid;
const result = { valid, evidence };

if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (valid) {
    process.stdout.write(
        `Phase 5D automated gate passed: ${passCount}/${testCount} tests and ${syntaxFiles.length} JavaScript files.\n`
    );
    process.stdout.write('Use the evidence object with runFinancePhase5DBrowserChecks({ automatedEvidence }) in Preview Mode.\n');
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} else {
    process.stderr.write('Phase 5D automated gate failed.\n');
    if (syntaxFailures.length) process.stderr.write(`${JSON.stringify(syntaxFailures, null, 2)}\n`);
    process.stderr.write(suiteOutput);
}

process.exitCode = valid ? 0 : 1;
