# offledger

Offline-first expense splitter for Android, built with React Native (Expo SDK 58 dev build). Android only: there is no iOS target. No server, no accounts: each phone keeps an event log, and phones merge logs by exchanging a `.ledger` file.

## Layout

- `packages/core`: pure TypeScript domain (events, splitting, balances, merge, settle-up). Fast property tests live next to the code (`*.test.ts`).
- `apps/mobile`: the Expo app. Routes in `src/app/`. See `apps/mobile/AGENTS.md` for Expo-specific rules.
- `e2e/`: Maestro journeys. `features/`: the feature map the verify skill drives.
- `scripts/`: the verification CLIs.

## Commands

- `pnpm -s verify`: format, lint, typecheck, core tests in about 2 seconds. Run it every cycle. `--json` for machine output, `--only lint,test` to narrow, `--help` for more.
- `pnpm -s verify:e2e --serial <adb-serial>`: Maestro journeys on an Android emulator. Run before calling a UI ticket done. Emulators are shared: get a grant and its serial first (see the user-level AGENTS.md), and never boot, wipe, or shut one down yourself.
- `pnpm fmt`: apply formatting and safe lint fixes.
- Add native or Expo packages with `pnpm expo install <pkg>` inside `apps/mobile`.

## Rules

- Write the check first and watch it fail for the right reason, then make it pass. A ticket is done when its named proof (property, journey, or differential test) passes, with the red and green runs shown.
- Fix the code, not the check. Never weaken a property or journey to get green.
- Money is an integer count of minor units (cents), always. A float that touches money is a hard violation, and so is any division whose remainder isn't handed to an `allocate()`-style function that provably preserves the total.
- Ledger state is derived from events. Code that mutates derived state (balances, totals) directly instead of appending an event is a hard violation. Events are never deleted or rewritten; deletion is a new event.
- `packages/core` is pure TypeScript: no React, React Native, Expo, I/O, clock, or randomness. Time and IDs enter core as arguments. The app talks to core only through `packages/core/src/index.ts`.
- Parse external data (imported `.ledger` files, SQLite rows) at the boundary into core types; core does not re-validate trusted internal data.

## Workflow

Development here runs through [pstack](https://github.com/cursor/plugins/tree/main/pstack) (Lauren Tan's engineering skill pack, installed as a personal Amp plugin). Start nontrivial work with `/poteto-mode`; it routes to a playbook (feature, bug fix, refactor, investigation, etc.), opens a todolist, and applies pstack's principles (verification-first, model the domain, no planning theatre). See `pstack:AMP.md` for how Cursor-specific pstack concepts map to Amp.

### Delivery

Andi is the only contributor: no PRs. Work on a feature branch in a treehouse slot, then merge it into `main` and push once its named proof passes. CI still runs on `main`.

### Where progress lives

No external tracker, no triage labels, no Beads tasks. Progress is three things:

- The matched playbook's todolist, kept as a checklist in replies and ticked as each box is proven.
- For work spanning phases or PRs, a `show-me-your-work` TSV at `.amp/in/decisions.tsv` (local, not committed) plus the `phase-tracker` page in the side panel.
- The durable record: branch, commits, and PR description carrying the red and green runs.

Create a `GLOSSARY.md` and `docs/adr/` lazily, the first time a term or decision actually needs recording, via pstack's domain-modeling-equivalent work — don't scaffold them upfront.

### This is Andi's pstack learning project

Andi is learning pstack here, so show the method, not only the result. Before starting, say which playbook you matched and why, and name each principle you apply with the choice it changed. Keep the playbook todolist visible in replies. At a genuine product or preference fork, show the options with their practical impact and ask with `ask_user_choice`; if a run could settle it, run it instead of asking. Hand back at each verifiable unit instead of running the whole feature unattended.

Project verification lives wherever `/create-verification-skill` places it next (regenerating `.agents/skills/verify-offledger`); keep using `pnpm -s verify` and `pnpm -s verify:e2e` as the underlying checks either way.
