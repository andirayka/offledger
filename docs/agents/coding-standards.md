# Coding standards

This file is for the **reviewer**, not the implementer. `/code-review` reads it on the Standards axis. Anything a tool already enforces (`pnpm -s verify`) is not repeated here.

## Domain

- Money is an integer count of minor units (cents). A float that touches money is a hard violation, and so is any division whose remainder is not handed to `allocate()` or an equivalent that provably preserves the total.
- Ledger state is derived from events. Code that mutates derived state (balances, totals) directly instead of appending an event is a hard violation.
- Events are never deleted or rewritten. Deletion is a new event.
- Use the vocabulary in `GLOSSARY.md`. A synonym for a glossary term in a name, test title, or UI string is a finding.

## Architecture

- `packages/core` is pure TypeScript: no React, React Native, Expo, I/O, clock, or randomness. Time and IDs enter core as arguments. (Imports are linted; hidden I/O such as `Date.now()` or `Math.random()` is the reviewer's job.)
- The app talks to core through core's public exports in `packages/core/src/index.ts`. Reaching into another file's internals is a finding.
- Parse external data (imported `.ledger` files, SQLite rows) at the boundary into core types. Core does not re-validate trusted internal data.
- Prefer one obvious path. A new option, flag, or abstraction with a single caller is a finding unless the ticket asked for it.

## Tests

- Test behaviour through public interfaces. Asserting private helpers, call order, or mock interactions is a finding.
- Never fake our own code. Fake only what sits outside the app (camera, file picker, share sheet, clock), each fake defined once.
- Property tests use the global seed in their file and assert a rule a plausible wrong implementation would break. A property that cannot fail is a finding.
- A fast-check counterexample that found a real bug is kept as a fixed example test.
- A Maestro journey is never weakened to make it pass.

## Comments

- No comments that narrate the code or justify a workaround. A short doc comment on a public core export that states its contract is fine.
