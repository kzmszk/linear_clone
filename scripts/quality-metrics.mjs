import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'artifacts/private/quality/current');
await mkdir(output, { recursive: true });
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { sonarjs },
      rules: {
        'sonarjs/cognitive-complexity': ['warn', 0],
        complexity: ['warn', 0],
        'max-lines-per-function': [
          'warn',
          { max: 0, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  ],
});
const results = await eslint.lintFiles([
  'apps/*/src/**/*.{ts,tsx}',
  'packages/*/src/**/*.ts',
]);
const files = [];
for (const result of results) {
  if (result.fatalErrorCount)
    throw new Error(`Cannot parse ${result.filePath}`);
  const source = await readFile(result.filePath, 'utf8');
  files.push({
    file: relative(process.cwd(), result.filePath),
    lines: source.trimEnd().split('\n').length,
    findings: result.messages.map(({ ruleId, message, line, column }) => ({
      ruleId,
      message,
      line,
      column,
    })),
  });
}
await writeFile(
  `${output}/complexity.json`,
  JSON.stringify(files, null, 2) + '\n',
);
const cognitive = files
  .flatMap(({ file, findings }) =>
    findings
      .filter(({ ruleId }) => ruleId === 'sonarjs/cognitive-complexity')
      .map((finding) => ({
        file,
        ...finding,
        score: Number(finding.message.match(/from (\d+)/)?.[1]),
      })),
  )
  .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
const summary = {
  files: files.length,
  lines: files.reduce((sum, file) => sum + file.lines, 0),
  cyclomatic: summarizeRule('complexity', /complexity of (\d+)/, 12),
  functionLines: summarizeRule('max-lines-per-function', /lines \((\d+)\)/, 80),
  cognitiveOver15: cognitive.filter(({ score }) => score > 15),
  largestFiles: files
    .map(({ file, lines }) => ({ file, lines }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10),
  highestCognitive: cognitive.slice(0, 15),
};
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));

function summarizeRule(rule, pattern, threshold) {
  const measured = files
    .flatMap(({ file, findings }) =>
      findings
        .filter(({ ruleId }) => ruleId === rule)
        .map((finding) => ({
          file,
          ...finding,
          score: Number(finding.message.match(pattern)?.[1]),
        })),
    )
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return {
    measuredFunctions: measured.length,
    maximum: measured[0]?.score ?? 0,
    threshold,
    overThreshold: measured.filter(({ score }) => score > threshold),
    highest: measured.slice(0, 10),
  };
}
