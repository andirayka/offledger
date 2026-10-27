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
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP_DIR = join(ROOT, 'apps/mobile');
const STATE_DIR = join(ROOT, '.e2e');
const ARTIFACTS = join(ROOT, 'artifacts/e2e');
const FLOWS = join(ROOT, 'e2e/flows');
const APK = join(APP_DIR, 'android/app/build/outputs/apk/debug/app-debug.apk');
const APP_ID = 'dev.andirayka.offledger';
const PORT = Number(process.env.OFFLEDGER_METRO_PORT ?? 8090);
const OPEN_URL = `exp+offledger://?__expo_url=${encodeURIComponent(`http://localhost:${PORT}`)}&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1`;
const ANDROID_HOME = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const JAVA_HOME = process.env.JAVA_HOME ?? join(homedir(), '.sdkman/candidates/java/current');
const ENV = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', ANDROID_HOME, JAVA_HOME };

const HELP = `Usage: pnpm -s e2e <command> --serial <adb-serial> [options]

Drives the Offledger debug build on an already running Android emulator with Maestro.
This tool never boots, picks, or shuts down an emulator: the device and its serial come from
whoever granted it (see AGENTS.md). Pass --serial or set OFFLEDGER_ANDROID_SERIAL.
Every command prints one JSON object on stdout and exits non-zero on failure.

Commands:
  doctor              Read-only: is the device online, the app installed, Metro ours, serving,
                      watching files, and reachable from the device (adb reverse)?
  launch [--build]    Start Metro on :${PORT}, reverse the port to the device, open the app, and
                      wait until the Groups screen renders. --build rebuilds and reinstalls the
                      APK first (needed after adding a native package or changing app.json).
  run [flow...]       Run Maestro flows from e2e/flows (default: all). Evidence goes to
                      artifacts/e2e/<run-id>/ and survives cleanup.
  cleanup             Stop the Metro this tool started, force-stop the app, remove the port
                      reverse. Keeps evidence. Leaves the emulator running.

pnpm -s verify:e2e --serial <s>  = launch, run all flows, cleanup.`;

type Json = Record<string, unknown>;
type State = { metroPid?: number; serial?: string };

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

function sh(cmd: string, args: string[], cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV } });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const ADB = join(ANDROID_HOME, 'platform-tools/adb');
const adb = (serial: string, args: string[]) => sh(ADB, ['-s', serial, ...args]);

function serialArg(args: string[]): string | undefined {
  const i = args.indexOf('--serial');
  return (i === -1 ? undefined : args[i + 1]) ?? process.env.OFFLEDGER_ANDROID_SERIAL;
}

function onlineDevices(): string[] {
  return sh(ADB, ['devices'])
    .stdout.split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device')
    .map(([id]) => id as string);
}

function requireDevice(serial: string | undefined): string {
  const online = onlineDevices();
  if (!serial) {
    fail(
      'No device serial given.',
      'Pass --serial <adb-serial> for the emulator you were granted, or set OFFLEDGER_ANDROID_SERIAL.',
      { onlineDevices: online },
    );
  }
  if (!online.includes(serial)) {
    fail(
      `Device ${serial} is not online.`,
      'Ask for the emulator to be started, then re-check the serial with `adb devices`.',
      { onlineDevices: online },
    );
  }
  return serial;
}

function readState(): State {
  const file = join(STATE_DIR, 'state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function writeState(state: State) {
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
  const pid = Number(
    sh('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t'])
      .stdout.trim()
      .split('\n')[0],
  );
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

const appInstalled = (serial: string) =>
  adb(serial, ['shell', 'pm', 'path', APP_ID]).stdout.includes('package:');
const portReversed = (serial: string) =>
  adb(serial, ['reverse', '--list']).stdout.includes(`tcp:${PORT}`);

async function doctor(serial: string | undefined) {
  const online = onlineDevices();
  const deviceOnline = Boolean(serial && online.includes(serial));
  const state = readState();
  const owner = portOwner();
  const ours =
    isAlive(state.metroPid) &&
    owner !== undefined &&
    [state.metroPid, ...descendants(state.metroPid)].includes(owner);
  const watching =
    ours && !readFileSync(join(STATE_DIR, 'metro.log'), 'utf8').includes('reloads are disabled');
  const report = {
    device: {
      serial: serial ?? null,
      online: deviceOnline,
      avd:
        deviceOnline && serial
          ? (adb(serial, ['emu', 'avd', 'name']).stdout.split('\n')[0]?.trim() ?? null)
          : null,
      onlineDevices: online,
    },
    appInstalled: deviceOnline && serial ? appInstalled(serial) : false,
    metro: {
      port: PORT,
      status: (await metroStatus()) ?? null,
      ownedByThisTool: ours,
      watchingFiles: watching,
      listenerPid: owner ?? null,
    },
    portReversed: deviceOnline && serial ? portReversed(serial) : false,
    maestro: sh('maestro', ['--version']).stdout.trim().split('\n').at(-1) ?? null,
  };
  const problems = [
    !serial &&
      'No device serial given. Pass --serial <adb-serial> for the emulator you were granted.',
    serial &&
      !deviceOnline &&
      `Device ${serial} is not online. Ask for the emulator to be started; never start one yourself.`,
    deviceOnline &&
      !report.appInstalled &&
      'App is not installed. Run `pnpm -s e2e launch --build --serial <s>`.',
    report.metro.status !== 'packager-status:running' &&
      `Metro is not serving on :${PORT}. Run \`pnpm -s e2e launch --serial <s>\`.`,
    report.metro.status &&
      !ours &&
      `Port ${PORT} is served by a process this tool did not start (pid ${owner}). Do not drive it; stop it or set OFFLEDGER_METRO_PORT.`,
    ours &&
      !watching &&
      'Metro is not watching files, so runs would test stale code. Run `pnpm -s e2e cleanup`, then `pnpm -s e2e launch`.',
    deviceOnline &&
      !report.portReversed &&
      `Port ${PORT} is not reversed to the device. Run \`pnpm -s e2e launch --serial <s>\`.`,
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

function buildApk() {
  mkdirSync(STATE_DIR, { recursive: true });
  const log = join(STATE_DIR, 'build.log');
  const prebuild = sh(
    'pnpm',
    ['exec', 'expo', 'prebuild', '-p', 'android', '--no-install'],
    APP_DIR,
  );
  const gradle =
    prebuild.code === 0
      ? sh('./gradlew', ['app:assembleDebug', '--console=plain'], join(APP_DIR, 'android'))
      : undefined;
  writeFileSync(log, [prebuild.stdout, prebuild.stderr, gradle?.stdout, gradle?.stderr].join('\n'));
  if (prebuild.code !== 0 || gradle?.code !== 0) {
    fail(
      'Android build failed.',
      `Read ${log}; the first "FAILURE:" or "error:" line is the cause.`,
    );
  }
}

async function launch(serial: string, build: boolean) {
  if (build || !existsSync(APK)) buildApk();
  if (build || !appInstalled(serial)) {
    const r = adb(serial, ['install', '-r', APK]);
    if (r.code !== 0)
      fail(
        'APK install failed.',
        'Read the adb output; free space on the device or uninstall a conflicting signature.',
        { adb: r.stderr || r.stdout },
      );
  }

  const state = readState();
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
      env: { ...withoutCi(process.env), ...ENV },
    });
    metro.unref();
    state.metroPid = metro.pid;
  }
  state.serial = serial;
  writeState(state);
  if (!(await waitFor(async () => (await metroStatus()) === 'packager-status:running', 60_000))) {
    fail('Metro did not start within 60s.', `Read ${join(STATE_DIR, 'metro.log')}.`);
  }
  adb(serial, ['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);

  const ready = maestro(
    serial,
    [join(ROOT, 'e2e/subflows/open-app.yaml')],
    join(STATE_DIR, 'ready'),
  );
  if (!ready.ok) {
    fail(
      'App opened but the Groups screen never rendered.',
      `Read ${join(STATE_DIR, 'metro.log')} for a red-box error and the screenshot in ${join(STATE_DIR, 'ready')}, then \`pnpm -s e2e doctor\`.`,
      { maestro: ready.tail },
    );
  }
  return { serial, metroPid: state.metroPid, port: PORT, ready: true };
}

function maestro(serial: string, flows: string[], outputDir: string) {
  mkdirSync(outputDir, { recursive: true });
  const r = sh('maestro', [
    '--device',
    serial,
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

function run(serial: string, names: string[]) {
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
    serial,
    selected.map((f) => join(FLOWS, f)),
    dir,
  );
  const screenshots = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.png'),
  );
  const report = { runId, serial, flows: selected, evidence: dir, screenshots };
  if (result.ok) return { ok: true, ...report };
  return {
    ok: false,
    ...report,
    error: 'A journey failed.',
    fix: 'Fix the app, not the journey. The failing step and its screenshot are in the evidence dir.',
    maestro: result.tail,
  };
}

function cleanup() {
  const state = readState();
  const stopped: number[] = [];
  if (isAlive(state.metroPid)) {
    for (const pid of [...descendants(state.metroPid).toReversed(), state.metroPid]) {
      try {
        process.kill(pid, 'SIGTERM');
        stopped.push(pid);
      } catch {}
    }
  }
  const serial = state.serial;
  if (serial && onlineDevices().includes(serial)) {
    adb(serial, ['shell', 'am', 'force-stop', APP_ID]);
    adb(serial, ['reverse', '--remove', `tcp:${PORT}`]);
  }
  rmSync(join(STATE_DIR, 'state.json'), { force: true });
  return {
    stoppedPids: stopped,
    serial: serial ?? null,
    emulatorLeftRunning: true,
    evidenceKept: ARTIFACTS,
  };
}

const [command, ...rest] = process.argv.slice(2);
const flowArgs = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--serial');
switch (command) {
  case 'doctor': {
    const report = await doctor(serialArg(rest));
    out(report, report.problems.length === 0);
  }
  case 'launch':
    out(await launch(requireDevice(serialArg(rest)), rest.includes('--build')), true);
  case 'run': {
    const { ok, ...report } = run(requireDevice(serialArg(rest)), flowArgs);
    out(report, ok);
  }
  case 'cleanup':
    out(cleanup(), true);
  case 'all': {
    const serial = requireDevice(serialArg(rest));
    process.on('exit', () => cleanup());
    await launch(serial, rest.includes('--build'));
    const { ok, ...report } = run(serial, []);
    out(report, ok);
  }
  default:
    console.log(HELP);
    process.exit(command && command !== '--help' && command !== '-h' ? 2 : 0);
}
