# offledger

Offline-first expense splitter for React Native (Expo SDK 58 dev build). No server, no accounts: each phone keeps an event log, and phones merge logs by exchanging a `.ledger` file.

## Layout

- `packages/core`: pure TypeScript domain (events, splitting, balances, merge, settle-up). Fast property tests live next to the code (`*.test.ts`).
- `apps/mobile`: the Expo app. Routes in `src/app/`. See `apps/mobile/AGENTS.md` for Expo-specific rules.
- `e2e/`: Maestro journeys. `features/`: the feature map the verify skill drives.
- `scripts/`: the verification CLIs.

## Commands

- `pnpm -s verify`: format, lint, typecheck, core tests in about 2 seconds. Run it every cycle. `--json` for machine output, `--only lint,test` to narrow, `--help` for more.
- `pnpm -s verify:e2e`: Maestro journeys on the iOS simulator. Run before calling a UI ticket done.
- `pnpm fmt`: apply formatting and safe lint fixes.
- Add native or Expo packages with `pnpm expo install <pkg>` inside `apps/mobile`.

## Rules

- Write the check first and watch it fail for the right reason, then make it pass. A ticket is done when its named proof (property, journey, or differential test) passes, with the red and green runs shown.
- Fix the code, not the check. Never weaken a property or journey to get green.
- Money is integer minor units, always.

## Agent skills

### Issue tracker

Work is tracked in the private Beads store `ledg` at `~/beads/ledger`; prefix every `bd` command with `BEADS_DIR="$HOME/beads/ledger/.beads"`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, applied as Beads labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Coding standards

For reviewers only. See `docs/agents/coding-standards.md`.
