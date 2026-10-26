import { spawn } from 'node:child_process';

type Step = { name: string; cmd: string; args: string[]; fix: string };
type Result = { name: string; ok: boolean; ms: number; fix?: string; output?: string };

const STEPS: Step[] = [
  { name: 'format', cmd: 'pnpm', args: ['exec', 'oxfmt', '--check'], fix: 'Run `pnpm fmt`.' },
  {
    name: 'lint',
    cmd: 'pnpm',
    args: ['exec', 'oxlint', '--deny-warnings'],
    fix: 'Fix each diagnostic above; the help text names the fix. `pnpm fmt` applies safe autofixes.',
  },
  {
    name: 'typecheck',
    cmd: 'pnpm',
    args: ['typecheck'],
    fix: 'Fix the type errors above. Do not add casts or `any` to silence them.',
  },
  {
    name: 'test',
    cmd: 'pnpm',
    args: ['--filter', '@offledger/core', 'exec', 'vitest', 'run', '--reporter=dot'],
    fix: 'A property or example failed. Fix the code, not the test. If fast-check printed a counterexample, add it as a fixed regression case.',
  },
];

const HELP = `Usage: pnpm -s verify [--json] [--only <step>[,<step>]]

Runs the fast loop in parallel: ${STEPS.map((s) => s.name).join(', ')}.
Exit code 0 means every step passed.

  --json         Print one JSON object: { ok, steps: [{ name, ok, ms, fix?, output? }] }
  --only a,b     Run only the named steps
  --help         Show this help

Slow checks (device E2E) live in \`pnpm verify:e2e\`.`;

const MAX_LINES = 60;

function parseArgs(argv: string[]) {
  const json = argv.includes('--json');
  const help = argv.includes('--help') || argv.includes('-h');
  const onlyIndex = argv.indexOf('--only');
  const only =
    onlyIndex === -1 ? undefined : (argv[onlyIndex + 1] ?? '').split(',').filter(Boolean);
  const known = new Set(STEPS.map((s) => s.name));
  const unknown = only?.filter((name) => !known.has(name)) ?? [];
  if (unknown.length > 0 || (only && only.length === 0)) {
    console.error(
      `Unknown step: ${unknown.join(', ') || '(none given)'}. Valid steps: ${[...known].join(', ')}.`,
    );
    process.exit(2);
  }
  return { json, help, only };
}

function run(step: Step): Promise<Result> {
  const start = performance.now();
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, { env: { ...process.env, FORCE_COLOR: '0' } });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => {
      const ms = Math.round(performance.now() - start);
      if (code === 0) return resolve({ name: step.name, ok: true, ms });
      const lines = output.trimEnd().split('\n');
      const trimmed =
        lines.length > MAX_LINES
          ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines omitted`]
          : lines;
      resolve({ name: step.name, ok: false, ms, fix: step.fix, output: trimmed.join('\n') });
    });
  });
}

const { json, help, only } = parseArgs(process.argv.slice(2));
if (help) {
  console.log(HELP);
  process.exit(0);
}

const steps = only ? STEPS.filter((s) => only.includes(s.name)) : STEPS;
const results = await Promise.all(steps.map(run));
const ok = results.every((r) => r.ok);

if (json) {
  console.log(JSON.stringify({ ok, steps: results }, null, 2));
} else {
  for (const failed of results.filter((r) => !r.ok)) {
    console.log(`\n✗ ${failed.name}\n${failed.output}\n→ ${failed.fix}`);
  }
  console.log(
    `\n${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name} ${r.ms}ms`).join('   ')}\n${ok ? 'verify: ok' : 'verify: FAILED'}`,
  );
}
process.exit(ok ? 0 : 1);
