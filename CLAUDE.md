# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Sendman — Multi-Protocol API Client

Sendman is a local-first Electron desktop application for testing APIs across HTTP, GraphQL, gRPC, and WebSocket protocols. Built with Electron + Vite + React + TypeScript + Tailwind + Zustand.

## Build & Development Commands

```bash
# Development (hot reload for React UI; Electron changes need restart)
npm run dev

# Build for production
npm run build

# Package as macOS app (.dmg, universal arm64 + x64)
npm run dist:mac:dmg

# Preview production build
npm run preview
```

## Architecture Overview

### Two-Process Model (Electron)

**Main Process** (`Sendman/`) — Node.js, owns system resources
- `main.ts` — Window lifecycle, IPC registration bootstrap
- `preload.ts` — Security bridge (`window.api` → IPC); context isolation enabled
- `store.ts` — File-based persistence (collections/environments as JSON)
- `http.ts` — HTTP + GraphQL execution via `undici`
- `grpc.ts` — gRPC execution via `@grpc/grpc-js`
- `websocket.ts` — WebSocket connections via `ws`
- `runner.ts` — CSV-driven batch runner (sequential execution)
- `vars.ts` — `{{variable}}` substitution engine

**Renderer Process** (`src/`) — React SPA, sandboxed from Node.js
- `App.tsx` — Root layout (TopBar, Sidebar, RequestView/RunnerView)
- `store.ts` — Zustand state (collections, environments, active selections, responses)
- `types.ts` — Shared TypeScript types + `window.api` interface
- `components/` — UI components (protocol-specific request editors, response panel)
- `lib/` — Utilities (curl parser/exporter, variable substitution, beautify)

### Data Flow

```
User Input → Renderer (React + Zustand)
          ↓
     IPC invoke (window.api.*)
          ↓
Main Process Handler (store/http/grpc/ws/runner)
          ↓
External Resources (filesystem, network, gRPC server, WebSocket)
          ↓
Response → IPC return → Renderer state update → UI
```

### Storage

Workspace files persist as JSON under:
```
~/Library/Application Support/Sendman/workspace/
  collections/<id>.json
  environments/<id>.json
```

Git-friendly, hand-editable, easy to back up. **Do not commit these with credentials** — add to `.gitignore` if needed.

### Protocol Architecture

Each protocol has:
1. **Type definition** in `src/types.ts` (discriminated union on `protocol` field)
2. **Request editor component** in `src/components/` (e.g., `GraphQLRequestView.tsx`)
3. **Execution handler** in `Sendman/` (e.g., `grpc.ts`)
4. **Execute dispatcher** in `src/store.ts` (`executeRequest` routes by protocol)
5. **Response handling** in `ResponsePanel.tsx` (protocol-aware rendering)

All four protocols share the same resilience model (`timeoutMs`, `maxAttempts`, `retryStatuses`) where applicable.

## Key Implementation Details

### Variable Substitution

`{{var}}` syntax works in URLs, headers, params, body, GraphQL queries/variables. Two substitution paths:
- **Renderer** (`src/lib/vars.ts`) — preview/validation only
- **Main** (`Sendman/vars.ts`) — actual execution (merges collection + environment + runner row vars)

### Curl Integration

- **Import** (`src/lib/curl.ts`) — Paste curl command into HTTP URL bar → auto-populate method/headers/body/auth
- **Export** (`src/lib/curlExport.ts`) — "Copy as curl" button generates ready-to-run command (HTTP/GraphQL); gRPC/WebSocket show `grpcurl`/`wscat` suggestions

### Retry Logic (HTTP/GraphQL/gRPC)

Exponential backoff with jitter. Network failures (status 0) always retry up to `maxAttempts`. HTTP errors retry only if status in `retryStatuses` array.

### Runner (Batch Execution)

- CSV-driven (header row = variable names, each row = one iteration)
- Sequential execution (no parallelism in v0.1)
- Live result streaming via IPC events (`runner:progress`)
- Supports all protocols except WebSocket (stateful/long-lived vs request-response)

### gRPC Current Limitations

- Server address hardcoded to `localhost:50051` (no UI field yet)
- Unary calls only (no streaming)

## Common Development Tasks

### Adding a New Protocol

1. Add type to `RequestDef` union in `src/types.ts` + execute result variant
2. Create request editor component in `src/components/`
3. Implement execution handler in `Sendman/` with IPC registration
4. Update `executeRequest` dispatcher in `src/store.ts`
5. Add protocol-aware rendering in `ResponsePanel.tsx`
6. Update sidebar badge colors/protocol picker in `Sidebar.tsx`

### Adding a New Resilience Feature

1. Update `resilience` field in relevant protocol types (`src/types.ts`)
2. Modify execution handlers (`http.ts`/`grpc.ts`) to respect new fields
3. Update UI forms in request editor components

### Adding a New IPC Channel

1. Define handler in `Sendman/<module>.ts` via `ipcMain.handle('<namespace>:<action>', ...)`
2. Register in `main.ts` via `register*Handlers(ipcMain)`
3. Expose in `preload.ts` via `contextBridge.exposeInMainWorld('api', ...)`
4. Type in `src/types.ts` under `window.api` interface
5. Consume in renderer via `window.api.<namespace>.<action>()`

## Security & Permissions

- **Context isolation enabled** — renderer has no direct Node.js access
- **Node integration disabled** — only `preload.ts` bridges to main process
- Basic/Bearer auth credentials stored **unencrypted** in workspace JSON files — do not commit
- No input sanitization on tool execution (bash, file paths) — main process trusts renderer input

## Testing Workflows

- **HTTP**: `https://httpbin.org/get` (default new request URL)
- **GraphQL**: Point at any GraphQL endpoint (e.g., GitHub API)
- **gRPC**: Requires local gRPC server on `localhost:50051` + `.proto` file
- **WebSocket**: `ws://localhost:8080` or public echo servers

## Notable Third-Party Dependencies

- `undici` — HTTP client (Node.js official)
- `@grpc/grpc-js` + `@grpc/proto-loader` — gRPC runtime
- `ws` — WebSocket library
- `zustand` — State management (lightweight, no boilerplate)
- `papaparse` — CSV parsing for runner

## Future Considerations (Not in v0.1)

- OAuth 2.0 flows
- JavaScript scripting/assertions
- Parallel runner
- Cloud sync
- gRPC streaming
- WebSocket runner integration
- Plugin SDK
