import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP_DIR = join(ROOT, 'apps/mobile');
const STATE_DIR = join(ROOT, '.e2e');
const ARTIFACTS = join(ROOT, 'artifacts/e2e');
const FLOWS = join(ROOT, 'e2e/flows');
const SIM_NAME = 'Offledger iPhone 16';
const SIM_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-16';
const BUNDLE_ID = 'dev.andirayka.offledger';
const PORT = Number(process.env.OFFLEDGER_METRO_PORT ?? 8090);
const OPEN_URL = `exp+offledger://?__expo_url=${encodeURIComponent(`http://localhost:${PORT}`)}&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1`;
const UTF8 = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

const HELP = `Usage: pnpm -s e2e <command> [options]

Drives the Offledger dev build on its own iOS simulator ("${SIM_NAME}") with Maestro.
Every command prints one JSON object on stdout and exits non-zero on failure.

Commands:
  doctor              Read-only: is the simulator booted, the app installed, Metro ours and serving?
  launch [--build]    Boot the simulator, start Metro on :${PORT}, open the app, wait until the
                      Groups screen renders. --build rebuilds and reinstalls the native app first
                      (needed after adding a native package or changing app.json).
  run [flow...]       Run Maestro flows from e2e/flows (default: all). Evidence goes to
                      artifacts/e2e/<run-id>/ and survives cleanup.
  cleanup             Stop the Metro this tool started and terminate the app. Keeps evidence and
                      leaves the simulator booted (pass --shutdown to stop it, only if we booted it).

pnpm -s verify:e2e  = launch, run all flows, cleanup.`;

type Json = Record<string, unknown>;

function out(result: Json, ok: boolean): never {
  console.log(JSON.stringify({ ok, ...result }, null, 2));
  process.exit(ok ? 0 : 1);
}

function fail(error: string, fix: string, extra: Json = {}): never {
  out({ error, fix, ...extra }, false);
}

// With CI set, Expo starts Metro without a file watcher and serves stale code to every run.
function withoutCi(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CI: _ci, ...rest } = env;
  return rest;
}

function sh(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...UTF8 } });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function findSimulator(): { udid: string; state: string } | undefined {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', '-j']).stdout) as {
    devices: Record<string, { name: string; udid: string; state: string; isAvailable: boolean }[]>;
  };
  for (const devices of Object.values(list.devices)) {
    const sim = devices.find((d) => d.name === SIM_NAME && d.isAvailable);
    if (sim) return { udid: sim.udid, state: sim.state };
  }
  return undefined;
}

function newestIosRuntime(): string | undefined {
  const runtimes = JSON.parse(sh('xcrun', ['simctl', 'list', 'runtimes', '-j']).stdout) as {
    runtimes: { identifier: string; platform: string; isAvailable: boolean; version: string }[];
  };
  return runtimes.runtimes
    .filter((r) => r.platform === 'iOS' && r.isAvailable)
    .toSorted((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
    ?.identifier;
}

function readState(): { metroPid?: number; bootedByUs?: boolean } {
  const file = join(STATE_DIR, 'state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function writeState(state: { metroPid?: number; bootedByUs?: boolean }) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, 'state.json'), JSON.stringify(state));
}

function isAlive(pid: number | undefined): pid is number {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portOwner(): number | undefined {
  const r = sh('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t']);
  const pid = Number(r.stdout.trim().split('\n')[0]);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

function descendants(pid: number): number[] {
  const kids = sh('pgrep', ['-P', String(pid)])
    .stdout.trim()
    .split('\n')
    .filter(Boolean)
    .map(Number);
  return kids.flatMap((kid) => [kid, ...descendants(kid)]);
}

async function metroStatus(): Promise<string | undefined> {
  try {
    const res = await fetch(`http://localhost:${PORT}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return (await res.text()).trim();
  } catch {
    return undefined;
  }
}

function appInstalled(udid: string) {
  return sh('xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID]).code === 0;
}

async function doctor() {
  const sim = findSimulator();
  const state = readState();
  const owner = portOwner();
  const ours =
    isAlive(state.metroPid) &&
    owner !== undefined &&
    [state.metroPid, ...descendants(state.metroPid)].includes(owner);
  const report = {
    simulator: sim ? { name: SIM_NAME, ...sim } : null,
    appInstalled: sim ? appInstalled(sim.udid) : false,
    metro: {
      port: PORT,
      status: (await metroStatus()) ?? null,
      ownedByThisTool: ours,
      listenerPid: owner ?? null,
    },
    maestro: sh('maestro', ['--version']).stdout.trim().split('\n').at(-1) ?? null,
  };
  const problems = [
    !sim && `Simulator "${SIM_NAME}" does not exist. Run \`pnpm -s e2e launch --build\`.`,
    sim && sim.state !== 'Booted' && 'Simulator is not booted. Run `pnpm -s e2e launch`.',
    sim && !report.appInstalled && 'App is not installed. Run `pnpm -s e2e launch --build`.',
    report.metro.status !== 'packager-status:running' &&
      `Metro is not serving on :${PORT}. Run \`pnpm -s e2e launch\`.`,
    report.metro.status &&
      !ours &&
      `Port ${PORT} is served by a process this tool did not start (pid ${owner}). Do not drive it; stop it or set OFFLEDGER_METRO_PORT.`,
    ours &&
      readFileSync(join(STATE_DIR, 'metro.log'), 'utf8').includes('reloads are disabled') &&
      'Metro is not watching files, so runs would test stale code. Run `pnpm -s e2e cleanup`, then `pnpm -s e2e launch`.',
    !report.maestro &&
      'Maestro is not installed: https://docs.maestro.dev/getting-started/installing-maestro',
  ].filter(Boolean);
  return { ...report, problems };
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function launch(build: boolean) {
  let sim = findSimulator();
  if (!sim) {
    const runtime = newestIosRuntime();
    if (!runtime)
      fail(
        'No iOS simulator runtime is installed.',
        'Install one with `xcodebuild -downloadPlatform iOS`.',
      );
    sh('xcrun', ['simctl', 'create', SIM_NAME, SIM_TYPE, runtime]);
    sim = findSimulator();
    if (!sim)
      fail(
        `Could not create simulator "${SIM_NAME}".`,
        'Run `xcrun simctl list devicetypes` and check iPhone 16 exists.',
      );
  }
  const state = readState();
  if (sim.state !== 'Booted') {
    sh('xcrun', ['simctl', 'boot', sim.udid]);
    sh('xcrun', ['simctl', 'bootstatus', sim.udid, '-b']);
    state.bootedByUs = true;
  }
  sh('open', ['-a', 'Simulator']);

  if (build || !appInstalled(sim.udid)) {
    const r = spawnSync('pnpm', ['exec', 'expo', 'run:ios', '--device', sim.udid, '--no-bundler'], {
      cwd: APP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, ...UTF8, CI: '1' },
    });
    if (r.status !== 0) {
      const log = join(STATE_DIR, 'build.log');
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(log, `${r.stdout}\n${r.stderr}`);
      fail('Native build failed.', `Read ${log}; the first "error:" line is the cause.`);
    }
  }

  const owner = portOwner();
  if (!isAlive(state.metroPid) || owner === undefined) {
    if (owner !== undefined) {
      fail(
        `Port ${PORT} is already in use by pid ${owner}, which this tool did not start.`,
        'Stop that process, or set OFFLEDGER_METRO_PORT to a free port.',
      );
    }
    mkdirSync(STATE_DIR, { recursive: true });
    const log = openSync(join(STATE_DIR, 'metro.log'), 'w');
    const metro = spawn('pnpm', ['exec', 'expo', 'start', '--dev-client', '--port', String(PORT)], {
      cwd: APP_DIR,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...withoutCi(process.env), ...UTF8 },
    });
    metro.unref();
    state.metroPid = metro.pid;
  }
  writeState(state);
  if (!(await waitFor(async () => (await metroStatus()) === 'packager-status:running', 60_000))) {
    fail('Metro did not start within 60s.', `Read ${join(STATE_DIR, 'metro.log')}.`);
  }

  const ready = maestro(
    sim.udid,
    [join(ROOT, 'e2e/subflows/open-app.yaml')],
    join(STATE_DIR, 'ready'),
  );
  if (!ready.ok) {
    fail(
      'App opened but the Groups screen never rendered.',
      `Read ${join(STATE_DIR, 'metro.log')} for a red-box error, then \`pnpm -s e2e doctor\`.`,
      { maestro: ready.tail },
    );
  }
  return { simulator: sim.udid, metroPid: state.metroPid, port: PORT, ready: true };
}

function maestro(udid: string, flows: string[], outputDir: string) {
  mkdirSync(outputDir, { recursive: true });
  const r = sh('maestro', [
    '--device',
    udid,
    'test',
    '-e',
    `OPEN_URL=${OPEN_URL}`,
    '--format',
    'junit',
    '--output',
    join(outputDir, 'report.xml'),
    '--test-output-dir',
    outputDir,
    ...flows,
  ]);
  return {
    ok: r.code === 0,
    tail: `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-25).join('\n'),
  };
}

function run(names: string[]) {
  const sim = findSimulator();
  if (!sim || sim.state !== 'Booted')
    fail('Simulator is not running.', 'Run `pnpm -s e2e launch` first.');
  const all = readdirSync(FLOWS)
    .filter((f) => f.endsWith('.yaml'))
    .toSorted();
  const unknown = names.filter((n) => !all.includes(n) && !all.includes(`${n}.yaml`));
  if (unknown.length)
    fail(`Unknown flow: ${unknown.join(', ')}.`, `Valid flows: ${all.join(', ')}.`);
  const selected = names.length
    ? all.filter((f) => names.includes(f) || names.includes(f.replace(/\.yaml$/, '')))
    : all;
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ARTIFACTS, runId);
  const result = maestro(
    sim.udid,
    selected.map((f) => join(FLOWS, f)),
    dir,
  );
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.png'),
  );
  const report = { runId, flows: selected, evidence: dir, screenshots: files };
  if (result.ok) return { ok: true, ...report };
  return {
    ok: false,
    ...report,
    error: 'A journey failed.',
    fix: 'Fix the app, not the journey. The failing step and its screenshot are in the evidence dir.',
    maestro: result.tail,
  };
}

function cleanup(shutdown: boolean) {
  const state = readState();
  const stopped: number[] = [];
  if (isAlive(state.metroPid)) {
    const pids = [...descendants(state.metroPid).toReversed(), state.metroPid];
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
        stopped.push(pid);
      } catch {}
    }
  }
  const sim = findSimulator();
  if (sim?.state === 'Booted') sh('xcrun', ['simctl', 'terminate', sim.udid, BUNDLE_ID]);
  const shutDown = Boolean(shutdown && state.bootedByUs && sim);
  if (shutDown && sim) sh('xcrun', ['simctl', 'shutdown', sim.udid]);
  rmSync(join(STATE_DIR, 'state.json'), { force: true });
  return { stoppedPids: stopped, simulatorShutDown: shutDown, evidenceKept: ARTIFACTS };
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'doctor': {
    const report = await doctor();
    out(report, report.problems.length === 0);
  }
  case 'launch':
    out(await launch(rest.includes('--build')), true);
  case 'run': {
    const { ok, ...report } = run(rest);
    out(report, ok);
  }
  case 'cleanup':
    out(cleanup(rest.includes('--shutdown')), true);
  case 'all': {
    process.on('exit', () => cleanup(false));
    await launch(rest.includes('--build'));
    const { ok, ...report } = run([]);
    out(report, ok);
  }
  default:
    console.log(HELP);
    process.exit(command && command !== '--help' && command !== '-h' ? 2 : 0);
}
