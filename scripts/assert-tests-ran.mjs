// Fails when a Vitest JSON report shows the suite did not really run.
//
// A green exit code is not proof on its own: a skipped or filtered-out suite also exits 0.
// Usage: node scripts/assert-tests-ran.mjs <report.json> [--file <path-suffix>]...
// Each --file names a test file (matched by path suffix) that must have at least one passing test.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const reportPath = args[0];
const required = [];
for (let i = 1; i < args.length; i += 2) {
  if (args[i] !== "--file" || args[i + 1] === undefined) {
    console.error("Usage: assert-tests-ran.mjs <report.json> [--file <path-suffix>]...");
    process.exit(2);
  }
  required.push(args[i + 1]);
}
if (reportPath === undefined) {
  console.error("Usage: assert-tests-ran.mjs <report.json> [--file <path-suffix>]...");
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const problems = [];

if (report.numPassedTests === 0) problems.push("no test passed");
if (report.numFailedTests > 0) problems.push(`${report.numFailedTests} test(s) failed`);

for (const suffix of required) {
  const normalized = suffix.replaceAll("\\", "/");
  const files = report.testResults.filter((file) =>
    file.name.replaceAll("\\", "/").endsWith(normalized),
  );
  const passed = files
    .flatMap((file) => file.assertionResults)
    .filter((t) => t.status === "passed");
  if (passed.length === 0) problems.push(`${suffix}: no passing test (missing or skipped)`);
}

console.log(
  `${reportPath}: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ` +
    `${report.numPendingTests} skipped of ${report.numTotalTests}`,
);
if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${reportPath}: ${problem}`);
  process.exit(1);
}
