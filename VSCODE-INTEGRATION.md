# VSCodeIntegration branch — status pointer

This branch carries additive Remote API extensions (state serializers, subscriptions, an invokeAction registry,
`runTerminalCommand`) plus the `--no-steam` and `--rfa-port`/`?rfaPort=` launch flags, powering the VS Code
extension at github.com/aef123/bitburner-vscode (local: c:\git\bitburner-vscode).

All project status, the wire contract (docs/protocol.md), design docs, and pickup notes live in THAT repo —
start at its `docs/STATUS.md`. Game-side code is isolated to `src/RemoteFileAPI/*` plus small hooks
(engine.tsx, SaveObject.ts, Prestige.ts, electron/gameWindow.js). Parked 2026-07-05; branch tests green (4838).
