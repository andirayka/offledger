# Issue tracker: Beads

Work for this repo is tracked privately in [Beads](https://github.com/steveyegge/beads) (`bd`), in the store at `~/beads/ledger` with the ID prefix `ledg`. It is not inside this repo; never run `bd init` here and never commit a `.beads/` folder.

Every `bd` command must select the store explicitly, because the shell default points at another project:

```sh
export BEADS_DIR="$HOME/beads/ledger/.beads"
```

## Conventions

- **Create a ticket**: `bd create "<title>" -t task -p 2 -d "<body>" --acceptance "<done when>"`. Use `-t epic` for a spec or feature, and `--parent <epic-id>` for its tickets.
- **Body**: goal, decisions and why, scope, out of scope, and the check that proves it (a property, an E2E journey, or a differential test). A fresh session must be able to continue from the ticket alone.
- **Read a ticket**: `bd show <id>`; `bd show <id> --json` for machine-readable output.
- **List**: `bd list --status open`; `bd ready` lists open tickets with no open blockers.
- **Block**: `bd dep add <blocked-id> <blocker-id>`.
- **Claim**: `BD_ACTOR=<thread or session id> bd update <id> --claim`. Claims are leases: release them if you stop.
- **Comment**: `bd comments add <id> "<text>"`.
- **Labels**: `bd label add <id> <label>` / `bd label remove <id> <label>` (see `triage-labels.md`).
- **Close**: `bd close <id> --reason "<what proved it>"`.
- After substantial changes, run `bd backup sync`, then commit and push `~/beads/backup` (a private repo).

## When a skill says "publish to the issue tracker"

Create a Beads ticket as above. A spec becomes an epic whose description holds the spec; `/to-tickets` output becomes child tasks of that epic with `bd dep add` edges.

## When a skill says "fetch the relevant ticket"

Run `bd show <id>`. The user will normally pass the ID (`ledg-…`) directly.

## Wayfinding operations

Used by `/wayfinder`.

- **Map**: an epic labelled `wayfinder:map`; its description holds Notes / Decisions so far / Fog.
- **Child ticket**: a task with `--parent <map-id>` and a `wayfinder:<type>` label (`research`, `prototype`, `grilling`, `task`).
- **Blocking**: `bd dep add`. A ticket is unblocked when all its blockers are closed.
- **Frontier**: `bd ready`, filtered to the map's children; lowest ID wins.
- **Claim**: `bd update <id> --claim`, the session's first write.
- **Resolve**: add the answer with `bd comments add`, `bd close`, then append a pointer to the map's Decisions so far.
