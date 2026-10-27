---
name: verify-offledger
description: Drive the Offledger Expo dev build on a granted Android emulator with Maestro and capture screenshot evidence. Use to prove a UI change or feature works end to end, to reproduce a UI bug, or before calling any ticket that touches apps/mobile done.
---

# Verify Offledger

Offledger is Android only. This skill drives the real app on an Android emulator, through the same screens a user touches, and leaves evidence on disk. Everything goes through one CLI, `pnpm -s e2e`, run from the repo root. Each command prints one JSON object and exits non-zero on failure with `error` and `fix` fields: do what `fix` says.

Fast checks (`pnpm -s verify`) prove the core logic. This skill proves the app. A UI ticket needs both.

## Get a device first

Emulators on this Mac are shared and owned by a coordinator. Before any command below:

1. Ask for a grant as the user-level `AGENTS.md` describes (thread URL, task, preferred AVD, estimated duration). Wait for an explicit grant naming an AVD and serial.
2. Confirm the serial yourself: `adb -s <serial> emu avd name` prints the granted AVD and `adb -s <serial> shell getprop sys.boot_completed` prints `1`.
3. Pass that serial to every command: `--serial <serial>`, or `export OFFLEDGER_ANDROID_SERIAL=<serial>`.

This CLI never boots, picks, wipes, or shuts down an emulator. When done, run cleanup and report the release to the coordinator.

## Launch

```sh
pnpm -s e2e launch --serial emulator-5554            # Metro on :8090, adb reverse, open the app
pnpm -s e2e launch --build --serial emulator-5554    # also prebuilds, assembles and installs the debug APK (5–10 min cold)
```

- Use `--build` the first time on a machine, and after adding a native package (`pnpm expo install` in `apps/mobile`) or changing `apps/mobile/app.json`. JS-only changes never need it: Metro serves them live.
- Launch installs the APK if the app is missing, reuses a Metro it started earlier, and refuses to use a port 8090 it did not start.
- **Ready** means the CLI has wiped this app's data, opened the dev build against our Metro, and Maestro has seen the Groups screen (`testID="groups-empty"`). `"ok": true` from launch means usable, not just "process up".

## Doctor

```sh
pnpm -s e2e doctor --serial emulator-5554
```

Read-only. Run it first whenever anything looks off. `"ok": true` requires: device online, app installed, Metro on :8090 serving, owned by this tool and watching files, port reversed to the device, Maestro installed. Each entry in `problems` names its fix.

## Drive

Journeys are Maestro flows in `e2e/flows/*.yaml`, one flow per feature-map journey. Every flow starts with:

```yaml
appId: dev.andirayka.offledger
---
- runFlow: ../subflows/open-app.yaml
```

`open-app` stops the app, clears its data, opens the dev build at `${OPEN_URL}` (the CLI passes it), and waits for the Groups screen. Never use `launchApp` in a flow: a bare launch opens the dev-client launcher, not the app.

```sh
pnpm -s e2e run --serial emulator-5554                  # all flows
pnpm -s e2e run groups-empty --serial emulator-5554     # one flow, by file name without .yaml
```

- Select elements by `id:` (a React Native `testID`) first, then by exact user-visible text. Never by coordinates.
- Add a `testID` to the component when a journey needs a stable handle. That is a normal app change, not test scaffolding.
- Journey recipes, entry points, and expected end states are in [features/README.md](features/README.md). Read the matching feature file before driving.

## Evidence

- Each `run` writes to `artifacts/e2e/<run-id>/`: `report.xml` (JUnit), Maestro's per-step screenshots and logs, and every `takeScreenshot` the flow names. The JSON output lists the directory and screenshots.
- A proof shows the user action and the resulting state: take a screenshot after each meaningful step, not only at the end, and name it after the step (`takeScreenshot: expense-saved`).
- Inspect the screenshots you cite. A passing flow whose screenshot shows the wrong screen is not a proof.
- Show red then green: run the journey against the unchanged code (or a deliberate break) and see it fail for the right reason, then pass with the change.
- Drive the real user path only: no test-only routes, debug buttons, or fakes of our own code. Fakes are allowed only at real boundaries (camera, share sheet, file picker), each defined once.
- When storage lands, also verify side effects from a second view (reopen the screen, relaunch the app), not only the success message.

## Cleanup

```sh
pnpm -s e2e cleanup
```

Stops only the Metro PIDs recorded in `.e2e/state.json` (never kills by name), force-stops the app, and removes the `tcp:8090` reverse on the recorded serial. It never deletes `artifacts/` and leaves the emulator running. Run it after every session, including failed ones, then report the release.

## One-shot

```sh
pnpm -s verify:e2e --serial emulator-5554    # launch, run all flows, cleanup (cleanup also runs on failure)
```

## Isolation

- One Metro port per checkout. Two agents must not drive the same device at once; if `doctor` shows a Metro you did not launch this session, ask before using it.
- Set `OFFLEDGER_METRO_PORT` to run Metro elsewhere if 8090 is taken.
- Flows clear only this app's data. Never wipe the emulator or change its settings.

## Gotchas

- `CI=1` makes Expo start Metro without a file watcher, so every run tests the code from when Metro started. The CLI strips `CI` for Metro, and `doctor` flags a non-watching Metro. If a journey passes after a change it should fail on, suspect stale code first: run `doctor`.
- Without `adb reverse tcp:8090 tcp:8090` the dev build cannot reach Metro at `localhost:8090`. Launch sets it; `doctor` checks it.
- `clearState` resets the dev client too. The `__expo_url=…&__expo_disable_onboarding=1` link that `open-app` uses keeps the dev menu from covering the app.
- Gradle needs `JAVA_HOME` (defaults to `~/.sdkman/candidates/java/current`) and `ANDROID_HOME` (defaults to `~/Library/Android/sdk`). Build logs go to `.e2e/build.log` on failure; Metro logs to `.e2e/metro.log` (red-box errors show there).
