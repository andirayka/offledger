# Groups

The Groups screen is the app's home. It lists the groups a user splits expenses with. With no groups it shows an empty state that explains everything stays on the phone.

## Sub-features

- `groups-empty` shows the empty state when the user has no groups.

## How to get to it (user POV)

- Open the app. Groups is the first screen.

## Driving it with Maestro

Preconditions:

- `pnpm -s e2e doctor --serial <serial>` returns `"ok": true`.
- App data is empty (the `open-app` subflow guarantees it).

- **Open the app.** `open-app` opens the dev build. The screen with `id: groups-empty` is visible.
- **See the empty state.** Run `pnpm -s e2e run groups-empty --serial <serial>`. The header reads `Groups`, the title reads `No groups yet`, and the body reads `Create a group to start splitting expenses. Everything stays on this phone.`
- **Proof.** The flow saves `groups-empty.png` under the run's evidence directory; it shows all three texts.

## Gotchas

- The empty state is the only state today. When creating a group lands, add `groups-create` and `groups-list` sub-features and keep `groups-empty` passing from cleared data.
