# offledger

An offline-first expense splitter for Android, built with Expo and React Native.

Split trips, dinners, and rent with friends. No server and no accounts: every phone keeps its own copy, and two phones merge by sending each other a `.ledger` file. Nothing gets overwritten or lost.

## Why it is interesting

- **Event-sourced ledger.** Every change is an event; balances are derived, so history and undo come for free.
- **Device-to-device merge without a server.** Merging is order-independent and idempotent, checked by property tests.
- **Money that adds up.** Integer cents everywhere; splitting never creates or loses a cent.
- **Agentic verification.** One command (`pnpm -s verify`) gives an agent a fast, deterministic check, and a verify skill lets it drive the real app and capture evidence.

## Develop

```sh
pnpm install
pnpm -s verify          # fast loop: format, lint, typecheck, property tests
pnpm --filter @offledger/mobile android   # dev build on a running Android emulator
```

## Status

Phase 0: verification groundwork. Features land one proven slice at a time.

## License

MIT
