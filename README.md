# API Forge — v0.1

A local-first, modern desktop API client. v0.1 ships HTTP/REST + collections + environments + a CSV-driven Collection Runner with retry/timeout resilience. gRPC, WebSocket, GraphQL, scripting, and cloud sync are intentionally deferred — see `docs/` for the full multi-phase plan this is based on.

Built with Electron + Vite + React + TypeScript + Tailwind + Zustand. HTTP executor uses `undici`.

## Run locally

```bash
npm install
npm run dev
```

Vite dev server starts on `:5173`, then Electron opens pointed at it. Hot reload works for the React UI; changes to anything under `electron/` need a restart.

## Package as a Mac app (.dmg)

```bash
npm run dist:mac
```

Produces a `.dmg` (universal: arm64 + x64) under `release/`. Install by opening the DMG and dragging API Forge to Applications.

The build is unsigned. On first launch macOS will block it — right-click the app and choose **Open**, then **Open** again on the dialog. Add code signing in `package.json` → `build.mac.identity` if you have a Developer ID.

## Where data lives

Workspace files (collections + environments) are stored as JSON under:

```
~/Library/Application Support/API Forge/workspace/
  collections/<id>.json
  environments/<id>.json
```

These are plain JSON — git-friendly, hand-editable, easy to back up.

## Using it

1. **Create a collection** in the sidebar (Collections tab → + New).
2. **Add a request** (the **+** next to a collection name). Set method, URL, headers, params, body, auth.
3. **Send** to fire the request and view the response (status, latency, headers, pretty body).
4. **Variables**: use `{{name}}` anywhere in URL, headers, params, body. Define `name` in an Environment (sidebar → Environments tab) and pick the active env from the top bar.
5. **Resilience**: per request, set timeout, max retry attempts, and which status codes trigger a retry. Retries use exponential backoff with jitter.
6. **Runner** (top bar → Runner): pick a collection, check the requests to include, optionally upload a CSV (header row = variable names, each row = one iteration), set delay, and run. Results stream live.

## Project layout

```
electron/        Main process (TypeScript → dist-electron/)
  main.ts        Window + IPC bootstrap
  preload.ts     Bridges window.api → ipcRenderer.invoke
  store.ts       File-based collection/env persistence
  http.ts        undici-based HTTP executor with retry/timeout
  runner.ts      Sequential collection runner with progress events
  vars.ts        {{var}} substitution
src/             Renderer (React + Vite)
  App.tsx        Root layout
  store.ts       Zustand state
  components/    UI (Sidebar, RequestView, ResponsePanel, RunnerView, …)
  types.ts       Shared types + window.api type
```

## Scope: what's in v0.1, what isn't

In: HTTP/REST (all methods), JSON/text/form bodies, basic & bearer auth, collection/env file store, `{{var}}` substitution, retry+timeout, CSV runner (sequential), live result streaming, JSON pretty-print, dark UI.

Not in: gRPC, WebSocket, GraphQL, OAuth2 flows, JS scripting/assertions, circuit breaker, bulkheads, parallel runner, cloud sync, team workspaces, SSO, plugin SDK. These map to phases 2–6 of the full plan.

## Notes

- Default new request points at `https://httpbin.org/get` so you can hit Send immediately.
- Network failures (status 0) always retry up to `maxAttempts`, regardless of `retryStatuses`.
- The runner runs requests sequentially within each iteration, and iterations sequentially. No parallelism in v0.1 — that lives in the Phase 4 distributed runner.
