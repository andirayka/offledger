---
name: verify-offledger
description: Drive the Offledger Expo dev build on its own iOS simulator with Maestro and capture screenshot evidence. Use to prove a UI change or feature works end to end, to reproduce a UI bug, or before calling any ticket that touches apps/mobile done.
---

# Verify Offledger

Offledger's user surface is the iOS app (Android comes later). This skill drives the real app on a dedicated simulator, through the same screens a user touches, and leaves evidence on disk. Everything goes through one CLI, `pnpm -s e2e`, run from the repo root. Each command prints one JSON object and exits non-zero on failure with `error` and `fix` fields: do what `fix` says.

Fast checks (`pnpm -s verify`) prove the core logic. This skill proves the app. A UI ticket needs both.

## Launch

```sh
pnpm -s e2e launch            # boots "Offledger iPhone 16", starts Metro on :8090, opens the app
pnpm -s e2e launch --build    # also rebuilds and reinstalls the native app (2–5 min)
```

- Use `--build` the first time on a machine, and after adding a native package (`pnpm expo install` in `apps/mobile`) or changing `apps/mobile/app.json`. JS-only changes never need it: Metro serves them live.
- Launch creates the simulator if it is missing, reuses a Metro it started earlier, and refuses to use a port 8090 it did not start.
- **Ready** means the CLI has wiped app data, opened the dev build against our Metro, and Maestro has seen the Groups screen (`testID="groups-empty"`). `"ok": true` from launch means usable, not just "process up".

## Doctor

```sh
pnpm -s e2e doctor
```

Read-only. Run it first whenever anything looks off. `"ok": true` requires: simulator booted, app installed, Metro on :8090 serving and owned by this tool, Metro watching files, Maestro installed. Each problem in `problems` names its fix.

## Drive

Journeys are Maestro flows in `e2e/flows/*.yaml`; one flow per feature-map journey. Every flow starts with:

```yaml
appId: dev.andirayka.offledger
---
- runFlow: ../subflows/open-app.yaml
```

`open-app` stops the app, clears its data, opens the dev build at `${OPEN_URL}` (the CLI passes it), and waits for the Groups screen. Never use `launchApp` in a flow: a bare launch opens the dev-client launcher, not the app.

```sh
pnpm -s e2e run                    # all flows
pnpm -s e2e run groups-empty       # one flow, by file name without .yaml
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
pnpm -s e2e cleanup               # stop the Metro this tool started, terminate the app
pnpm -s e2e cleanup --shutdown    # also shut the simulator down, only if this tool booted it
```

Cleanup kills only PIDs it recorded in `.e2e/state.json`; it never kills by name. It never deletes `artifacts/`. Run it after every session, including failed ones.

## One-shot

```sh
pnpm -s verify:e2e                # launch, run all flows, cleanup (cleanup also runs on failure)
```

## Isolation

- One instance only: one simulator ("Offledger iPhone 16"), one Metro port. Two agents must not drive it at the same time; if `doctor` shows a Metro you did not launch in this session, ask before using it.
- Set `OFFLEDGER_METRO_PORT` to run Metro elsewhere if 8090 is taken by something else.
- This simulator is not one of the coordinated Android emulators. Android verification is not set up yet.

## Gotchas

- `CI=1` makes Expo start Metro without a file watcher, so every run tests the code from when Metro started. The CLI strips `CI` for Metro, and `doctor` flags a non-watching Metro. If a journey passes after a change it should fail on, suspect stale code first: run `doctor`.
- CocoaPods fails with an encoding error unless `LANG=en_US.UTF-8`. The CLI sets it; set it yourself if you run `expo run:ios` by hand.
- `clearState` resets the dev client too. Opening the app with the `__expo_url=…&__expo_disable_onboarding=1` link (what `open-app` does) prevents the dev menu from covering the app; the older `expo-development-client/?url=` link format does not.
- Native build logs go to `.e2e/build.log` on failure; Metro logs to `.e2e/metro.log` (red-box errors show there).
