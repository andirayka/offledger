# Offledger verification map

The maintained source for verifying Offledger's user-facing behaviour. Read this index before driving the app, then use the matching feature file as the recipe. Add a feature file in the same change that ships the feature.

## Baseline preconditions

- `pnpm -s e2e doctor` returns `"ok": true`.
- Every journey starts from empty app data: `e2e/subflows/open-app.yaml` clears state and lands on the Groups screen.
- No seed data exists yet. A journey that needs groups or expenses creates them through the UI.

## Driving conventions

- Drive through `pnpm -s e2e run <flow>`; flows live in `e2e/flows/`, named after the feature file and sub-feature.
- Select by `testID` (`id:` in Maestro), then exact visible text. No coordinates.
- Money is entered and asserted as the user sees it (`12.50`), never as cents.

## Proof and skip reporting

- Capture the action and the resulting state, with a named screenshot per meaningful step.
- Cite the evidence directory from the `run` output, and inspect each screenshot you cite.
- Record which entry point a proof used. A proof through one entry point does not cover the others listed.
- Report an unreachable path with the command tried and the unmet precondition. Never weaken a journey to make it pass.

## Feature entry contract

Each feature file has an H1 title and one paragraph describing the user-visible behaviour, then exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Maestro`, `Gotchas`.

## Features

- [Groups](./groups.md): the home screen listing the user's groups; today only its empty state.
