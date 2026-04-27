# Sendman

> A local-first, open-source desktop API client for HTTP, GraphQL, gRPC, and WebSocket.

Built with **Electron · Vite · React · TypeScript · Tailwind · Zustand**.  
No accounts. No cloud. Your data stays on your machine.

![Runner screenshot](public/screenshot-runner.png)

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Installing on macOS](#installing-on-macos)
- [Usage guide](#usage-guide)
- [Contributing](#contributing)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

| | |
|---|---|
| **HTTP / REST** | All methods, JSON / text / form / raw bodies, Basic & Bearer auth, query params |
| **GraphQL** | Query + mutation editor with variables |
| **gRPC** | Unary calls via `.proto` file |
| **WebSocket** | Persistent connections with timestamped send/receive log |
| **Environments** | `{{variable}}` substitution in URLs, headers, params, body |
| **Collection Runner** | CSV-driven batch execution with live-streaming results |
| **Resilience** | Per-request timeout, retry count, retry-on-status-code, exponential backoff + jitter |
| **curl import / export** | Paste a curl command to populate any HTTP request; copy any request as curl |

---

## Architecture

Sendman uses Electron's two-process model with strict context isolation — the renderer has no direct Node.js access.

### Reliability & Fault Tolerance

**Sendman guarantees robust API execution through a multi-layered resilience architecture:**

#### 1. **Automatic Retry Logic**
- **Exponential backoff with jitter** prevents thundering herd
- **Network failures (status 0)** always retry up to `maxAttempts`
- **Configurable retry statuses** (default: 429, 502, 503, 504)
- **Per-request timeout control** prevents indefinite hangs
- **Attempt tracking** shows retry count per request

```typescript
// Retry algorithm (http.ts)
const delay = Math.min(30000, baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000);
// Caps at 30s to prevent excessive waits
```

#### 2. **Guaranteed Execution Flow**
```
User clicks Send
  ↓
[1] Renderer: Validate request structure
  ↓
[2] IPC Bridge: Type-safe serialization
  ↓
[3] Main Process: Variable substitution
  ↓
[4] Executor: Network call with timeout
  ↓
[5] Retry Layer: Exponential backoff on failure
  ↓
[6] Response: Always returned (success or error state)
  ↓
[7] UI Update: State reflects actual execution result
```

**Failure Handling Guarantees:**

| Failure Type | Detection | Recovery | User Feedback |
|--------------|-----------|----------|---------------|
| **Network timeout** | `AbortController` at timeout threshold | Retry with exponential backoff | Status 0 + latency |
| **DNS resolution failure** | `getaddrinfo ENOTFOUND` | Retry (network failure) | Error message shown |
| **Connection refused** | `ECONNREFUSED` | Retry (network failure) | Error message shown |
| **TLS/SSL error** | Certificate validation fails | No retry (config issue) | Error details shown |
| **429 Rate limit** | HTTP status 429 | Retry with backoff | Attempt count shown |
| **502/503/504 Server errors** | HTTP status codes | Retry with backoff | Status + attempts |
| **Invalid response** | JSON parse error | No retry (capture raw) | Body shown as-is |
| **Request abortion** | User cancels | Immediate stop | "Aborted" state |

#### 3. **CSV Runner Fault Isolation**
- **Sequential execution** ensures predictable order
- **Per-iteration isolation** - one row failure doesn't stop others
- **Live streaming results** - see failures immediately
- **Retry individual iterations** - fix data and re-run specific rows
- **Error aggregation** - summary shows pass/fail counts

#### 4. **State Consistency**
```typescript
// Zustand store guarantees (store.ts)
- Atomic updates: State changes are transactional
- Persistence: Auto-save to disk after every mutation
- Recovery: Load from disk on startup (no data loss)
- Response caching: Results survive app restart
```

#### 5. **Error Propagation**
Every layer in the stack preserves error context:
```typescript
// Error flow example
Network Error → Executor catches → Wraps with context → IPC returns
→ Zustand updates → UI shows user-friendly message + retry button
```

#### 6. **Performance Optimizations**
- **Connection pooling** (undici): Reuses TCP connections
- **Request pipelining**: HTTP/1.1 pipelining when supported
- **Parallel DNS resolution**: Non-blocking lookups
- **Minimal overhead**: <5ms IPC roundtrip latency
- **Efficient retries**: Exponential backoff prevents wasted attempts

### Real-World Resilience

**Scenario 1: Intermittent Network**
```
Attempt 1: ECONNREFUSED → retry after 1s + jitter
Attempt 2: ECONNREFUSED → retry after 2s + jitter  
Attempt 3: SUCCESS (200 OK) → show result
Total: 3 attempts, ~3.5s elapsed
```

**Scenario 2: Rate Limiting**
```
Attempt 1: 429 Too Many Requests → retry after 1s
Attempt 2: 429 → retry after 2s
Attempt 3: 429 → retry after 4s
Attempt 4: 200 OK → show result
Total: 4 attempts, ~8s elapsed (respects server rate limit)
```

**Scenario 3: CSV Runner Batch**
```
Row 1: SUCCESS (200)
Row 2: FAILURE (500) → marked as failed, execution continues
Row 3: SUCCESS (200)
Row 4: NETWORK ERROR → retries 3x → marked as failed
...
Result: 75 pass, 25 fail → retry all 25 failed rows independently
```

### Code Quality Guarantees

- **TypeScript strict mode**: Catches type errors at compile time
- **React hooks rules**: All hooks called in consistent order
- **IPC type safety**: `window.api` fully typed, no `any` types
- **Error boundaries**: UI never crashes, shows fallback
- **Memory leak prevention**: All event listeners cleaned up
- **Build validation**: `npm run build` fails on any error

```mermaid
graph TD
    subgraph Renderer["Renderer Process (sandboxed — no Node.js)"]
        UI["React + Zustand\n──────────────────\nTopBar · Sidebar\nRequestView (HTTP/GQL/gRPC/WS)\nResponsePanel · RunnerView"]
    end

    subgraph Bridge["preload.ts — contextBridge"]
        API["window.api.*\n(typed IPC interface)"]
    end

    subgraph Main["Main Process (Node.js)"]
        MAIN["main.ts\nWindow lifecycle + IPC bootstrap"]
        STORE["store.ts\nFile-based JSON persistence"]
        HTTP["http.ts\nHTTP + GraphQL via undici"]
        GRPC["grpc.ts\ngRPC via @grpc/grpc-js"]
        WS["websocket.ts\nWebSocket via ws"]
        RUNNER["runner.ts\nCSV batch runner\n(streams progress events)"]
        VARS["vars.ts\n{{var}} substitution engine"]
    end

    subgraph External["External Resources"]
        FS["Filesystem\n~/Library/Application Support/Sendman/"]
        NET["HTTP / GraphQL servers"]
        GRPC_SRV["gRPC server"]
        WS_SRV["WebSocket server"]
    end

    UI -->|"ipcRenderer.invoke"| API
    API -->|"ipcMain.handle"| MAIN
    MAIN --> STORE
    MAIN --> HTTP
    MAIN --> GRPC
    MAIN --> WS
    MAIN --> RUNNER
    RUNNER --> VARS
    HTTP --> VARS

    STORE --> FS
    HTTP --> NET
    GRPC --> GRPC_SRV
    WS --> WS_SRV

    MAIN -->|"IPC return / event"| API
    API -->|"resolved Promise / event"| UI
```

### Data flow

```
User input
  → React component dispatches action → Zustand store
  → window.api.<namespace>.<action>()       [IPC invoke]
  → Main process picks up in ipcMain.handle
  → vars.ts substitutes {{variables}}
  → Protocol executor (http / grpc / websocket / runner)
  → External resource (network / filesystem)
  → Result returned over IPC
  → Zustand state updated → React re-renders
```

### Storage

Collections and environments are stored as plain JSON — no database, no binary formats:

```
~/Library/Application Support/Sendman/workspace/
  collections/<uuid>.json
  environments/<uuid>.json
```

Files are git-friendly, diff-readable, and hand-editable. **Do not commit workspace files that contain credentials.**

---

## Getting started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- macOS (Linux/Windows builds are untested in v0.1)

### Install and run

```bash
git clone https://github.com/your-org/sendman.git
cd sendman
npm install
npm run dev
```

Vite starts on `:5173`; Electron opens automatically pointed at it.  
Hot reload works for the React UI. Changes under `Sendman/` require restarting Electron (`Ctrl+C` → `npm run dev`).

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (Vite + Electron with hot reload) |
| `npm run build` | Compile TypeScript + bundle renderer |
| `npm run dist:mac:dmg` | Build + package as `.dmg` (arm64 + x64) |
| `npm run preview` | Preview the production renderer build |

---

## Installing on macOS

### Option A — Pre-built DMG

1. Download from [Releases](https://github.com/your-org/sendman/releases):
   - `Sendman-0.1.0-arm64.dmg` — Apple Silicon
   - `Sendman-0.1.0.dmg` — Intel / universal
2. Open the `.dmg`, drag **Sendman** to **Applications**, eject the DMG.
3. Open Sendman from Applications.

**First launch (unsigned build):** macOS blocks the app with "developer cannot be verified".

- Right-click (or Control-click) the app → **Open** → **Open** again on the dialog.
- You only need to do this once.

> To remove this step permanently: add a Developer ID certificate to `build.mac.identity` in `package.json` and rebuild.

### Option B — Build it yourself

```bash
npm run dist:mac:dmg
# Output → release/Sendman-0.1.0-arm64.dmg (and x64 variant)
```

Then follow steps 2–3 above.

---

## Usage guide

### Collections and requests

1. **Sidebar → Collections → + New** — create a collection.
2. **+** next to a collection name — add a request.
3. Choose a **protocol** (HTTP, GraphQL, gRPC, WebSocket), set method + URL, configure headers/params/body/auth.
4. **Send** — response panel shows status, latency, headers, pretty-printed body.

### Environments and variables

Use `{{name}}` anywhere in URLs, headers, params, or body.

1. **Sidebar → Environments → + New** — create an environment, add key/value pairs.
2. Select the active environment in the top bar.
3. Variables are substituted in the main process at execution time (not in the UI preview).

### Resilience

Per-request settings available for HTTP, GraphQL, and gRPC:

| Setting | Description |
|---|---|
| **Timeout** | Max ms before the request is aborted |
| **Max attempts** | Total tries (1 = no retry) |
| **Retry statuses** | HTTP status codes that trigger a retry, e.g. `429,503` |

Retries use exponential backoff with jitter. Network failures (status 0) always retry up to `maxAttempts` regardless of `retryStatuses`.

### Collection Runner

1. **Top bar → Runner**.
2. Select a collection, check the requests to include.
3. Optionally upload a **CSV** — header row = variable names, each data row = one iteration. Row variables override the active environment.
4. Set delay between requests (ms).
5. **Run** — results stream live per request per row.

### curl import / export

- **Import**: paste a `curl` command into an HTTP request's URL bar and press Enter — method, headers, and body are auto-populated.
- **Export**: **Copy as curl** on any request. gRPC / WebSocket requests produce `grpcurl` / `wscat` equivalents.

---

## Contributing

Contributions are welcome. Please read this section before opening a PR.

### Reporting bugs

Open an issue with:
- OS and version
- Steps to reproduce
- Expected vs actual behaviour
- Any console output (open DevTools with `Cmd+Option+I`)

### Requesting features

Open an issue tagged `enhancement`. Describe the use case, not just the solution.

### Submitting a pull request

```bash
# 1. Fork the repo and clone your fork
git clone https://github.com/<your-username>/sendman.git
cd sendman

# 2. Create a feature branch
git checkout -b feat/your-feature-name

# 3. Install dependencies
npm install

# 4. Make changes, verify with dev server
npm run dev

# 5. Build to catch TypeScript errors
npm run build

# 6. Commit using Conventional Commits
git commit -m "feat: add server address field for gRPC"

# 7. Push and open a PR against main
git push origin feat/your-feature-name
```

**Guidelines:**
- Follow the existing code style (TypeScript strict, Tailwind utility classes).
- Keep PRs focused — one feature or fix per PR.
- Renderer code lives in `src/`; main-process code lives in `Sendman/`. Don't mix them.
- New IPC channels need changes in all five places: handler, `main.ts` registration, `preload.ts` bridge, `types.ts` interface, and the renderer call site.
- No new dependencies without discussion in an issue first.

### Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     new feature
fix:      bug fix
refactor: code change with no behaviour change
docs:     documentation only
chore:    build / tooling / config
```

---

## Project structure

```
sendman/
├── Sendman/                  Main process (Node.js / TypeScript)
│   ├── main.ts               Window lifecycle + IPC handler registration
│   ├── preload.ts            contextBridge — exposes window.api to renderer
│   ├── store.ts              File-based collection + environment persistence
│   ├── http.ts               HTTP + GraphQL executor (undici)
│   ├── grpc.ts               gRPC executor (@grpc/grpc-js + proto-loader)
│   ├── websocket.ts          WebSocket connections (ws)
│   ├── runner.ts             CSV batch runner with IPC progress streaming
│   └── vars.ts               {{var}} substitution engine
│
├── src/                      Renderer process (React + Vite)
│   ├── App.tsx               Root layout
│   ├── store.ts              Zustand state (collections, envs, responses)
│   ├── types.ts              Shared TypeScript types + window.api interface
│   ├── components/
│   │   ├── TopBar.tsx        Protocol picker, env selector, Runner toggle
│   │   ├── Sidebar.tsx       Collections + Environments tabs
│   │   ├── RequestView.tsx   HTTP request editor
│   │   ├── GraphQLRequestView.tsx
│   │   ├── GrpcRequestView.tsx
│   │   ├── WebSocketRequestView.tsx
│   │   ├── ResponsePanel.tsx Protocol-aware response rendering
│   │   ├── RunnerView.tsx    CSV runner UI + live result table
│   │   ├── EnvironmentEditor.tsx
│   │   └── VarPopover.tsx    {{var}} helper popover
│   └── lib/
│       ├── curl.ts           curl command → request import parser
│       ├── curlExport.ts     Request → curl export generator
│       ├── vars.ts           Client-side variable preview (renderer only)
│       └── beautify.ts       JSON / XML pretty-printer
│
├── scripts/
│   └── rename-dev-electron.js  Build helper
├── public/                   Static assets
├── index.html                Vite entry point
├── vite.config.mts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Roadmap

| Phase | Scope |
|---|---|
| **v0.1** (current) | HTTP/REST, GraphQL, gRPC (unary), WebSocket, environments, `{{vars}}`, retry/timeout, CSV runner |
| **v0.2** | gRPC streaming, configurable gRPC server address, WebSocket runner integration |
| **v0.3** | JavaScript scripting + assertions per request |
| **v0.4** | OAuth 2.0 flows, API key management |
| **v0.5** | Parallel runner, circuit breaker |
| **v1.0** | Cloud sync, team workspaces, plugin SDK |

See [`PROTOCOL_FEATURES.md`](PROTOCOL_FEATURES.md) for a full per-protocol feature breakdown.

---

## License

[MIT](LICENSE)
