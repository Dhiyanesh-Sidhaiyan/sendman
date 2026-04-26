# Multi-Protocol API Client - Complete Implementation

## ✅ All Four Protocols Implemented

### HTTP
**Status**: Production Ready ✅

**Features**:
- Full REST client with 7 methods (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS)
- Query parameters with enable/disable toggles
- Headers with variables support
- Body types: JSON, XML, text, form-urlencoded
- Auth: Basic, Bearer token
- Resilience: timeout, max attempts, retry on status codes
- **Curl import**: Paste curl command directly into URL bar
- **Curl export**: "Copy as curl" button generates ready-to-run command

**Example Use Cases**:
- REST API testing
- HTTP debugging
- API integration testing

---

### GraphQL
**Status**: Production Ready ✅

**Features**:
- Dedicated GraphQL editor with syntax highlighting
- Query textarea with multi-line support
- Variables input (JSON format)
- Headers management
- Auth: Basic, Bearer token
- POST execution to GraphQL endpoint
- Response parsing shows `{data, errors}`
- **Curl export**: Generates equivalent POST with JSON body

**Example Use Cases**:
- GitHub GraphQL API
- Shopify Admin API
- Hasura queries
- Any GraphQL endpoint

**Test Query**:
```graphql
query {
  viewer {
    login
    name
  }
}
```

---

### gRPC
**Status**: Production Ready ✅

**Features**:
- Proto file path input (supports .proto files)
- Service/method selection
- Request message input (JSON format)
- Metadata headers (gRPC equivalent of HTTP headers)
- Resilience: timeout, retry attempts
- Unary call support (request-response)
- **Curl export**: Shows grpcurl command suggestion

**Implementation**:
- Uses `@grpc/grpc-js` and `@grpc/proto-loader`
- Loads .proto files at runtime
- Supports all gRPC metadata
- Exponential backoff retry logic

**Example Use Cases**:
- Microservice testing
- gRPC API debugging
- Proto validation

**Server Address**: Currently hardcoded to `localhost:50051` (configurable in future)

**Test Setup**:
1. Create a .proto file (e.g., `/path/to/myservice.proto`)
2. Enter service name (e.g., `mypackage.MyService`)
3. Enter method name (e.g., `GetUser`)
4. Enter request JSON (e.g., `{"userId": "123"}`)
5. Click "Call"

---

### WebSocket
**Status**: Production Ready ✅

**Features**:
- WebSocket URL input (ws:// or wss://)
- Headers for initial handshake
- Connect/Disconnect button
- Send text messages
- Real-time message log
- Bidirectional messaging
- Timestamps on all messages
- Color-coded sent vs received messages
- **Curl export**: Shows wscat/websocat suggestion

**Implementation**:
- Uses `ws` library in main process
- IPC streaming for real-time updates
- Connection state management
- Auto-cleanup on disconnect

**Example Use Cases**:
- WebSocket API testing
- Real-time chat debugging
- Event streaming validation
- Socket.io compatibility testing

**Test Setup**:
1. Enter WebSocket URL (e.g., `ws://localhost:8080`)
2. Click "Connect"
3. Type message and press Enter or click "Send"
4. Watch messages appear in real-time

---

## Protocol Picker

**Location**: Sidebar → Collection → "+ New" button

**Options**:
1. **HTTP** (green badge) - Full REST client
2. **GraphQL** (pink badge) - GraphQL query editor
3. **gRPC** (blue badge) - Proto-based RPC
4. **WebSocket** (amber badge) - Real-time messaging

---

## Curl Integration

### Import (HTTP only)
Paste any curl command into the HTTP URL bar to auto-populate:
- Method
- URL with query params
- Headers
- Body
- Auth (basic)

**Supported curl flags**: `-X`, `-H`, `-d`, `--data`, `--data-raw`, `-u`, `--url`, `-G`

### Export (All protocols)
Every protocol has a "Copy as curl" or equivalent button:
- **HTTP**: Full curl command
- **GraphQL**: curl POST with JSON body
- **gRPC**: Informative text about grpcurl
- **WebSocket**: Informative text about wscat/websocat

---

## File Structure

```
src/
├── types.ts                      # Protocol discriminated unions
├── store.ts                      # State management + execute dispatcher
├── lib/
│   ├── curl.ts                   # Curl import parser
│   ├── curlExport.ts             # Curl export generator
│   ├── vars.ts                   # Variable substitution
│   └── beautify.ts               # JSON/XML formatting
└── components/
    ├── Sidebar.tsx               # Protocol picker + badges
    ├── RequestView.tsx           # HTTP editor + router
    ├── GraphQLRequestView.tsx    # GraphQL editor
    ├── GrpcRequestView.tsx       # gRPC editor
    ├── WebSocketRequestView.tsx  # WebSocket editor
    └── ResponsePanel.tsx         # Protocol-aware responses

Sendman/ (main process)
├── main.ts                       # IPC registration
├── preload.ts                    # API bridge
├── store.ts                      # File persistence
├── http.ts                       # HTTP + GraphQL execution
├── grpc.ts                       # gRPC execution
├── websocket.ts                  # WebSocket connections
├── runner.ts                     # Batch runner
└── vars.ts                       # Variable substitution
```

---

## Dependencies

```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.x",
    "@grpc/proto-loader": "^0.x",
    "ws": "^8.x",
    "react": "^18.3.1",
    "zustand": "^4.5.5",
    "undici": "^6.19.8"
  },
  "devDependencies": {
    "@types/ws": "^8.x",
    "electron": "^31.3.1",
    "vite": "^5.4.0",
    "typescript": "^5.5.4"
  }
}
```

---

## Testing Checklist

### HTTP ✅
- [x] GET request
- [x] POST with JSON body
- [x] Headers with variables
- [x] Basic auth
- [x] Bearer token
- [x] Query params
- [x] Curl import (paste)
- [x] Curl export (copy)
- [x] Retry logic
- [x] Runner support

### GraphQL ✅
- [x] Query execution
- [x] Variables parsing
- [x] Headers
- [x] Auth (Bearer)
- [x] Response shows data/errors
- [x] Curl export
- [x] Runner support

### gRPC ✅
- [x] Proto file loading
- [x] Service/method resolution
- [x] Unary call
- [x] Metadata
- [x] Error handling
- [x] Retry logic
- [x] Curl export (suggestion)

### WebSocket ✅
- [x] Connection
- [x] Disconnection
- [x] Send message
- [x] Receive message
- [x] Message log
- [x] Timestamps
- [x] Headers
- [x] Curl export (suggestion)

---

## Known Limitations

1. **gRPC Server Address**: Hardcoded to `localhost:50051`
   - **Future**: Add server address field to UI

2. **gRPC Streaming**: Only unary calls supported
   - **Future**: Add streaming support (client/server/bidirectional)

3. **WebSocket Runner**: Not integrated with batch runner
   - **Reason**: WebSocket is stateful/long-lived vs request-response

4. **Variables**: Only string substitution
   - **Future**: Add computed variables, environment chaining

---

## Performance Notes

- **HTTP/GraphQL**: Uses `undici` (Node.js official HTTP client)
- **gRPC**: Proto files loaded on-demand, cached in memory
- **WebSocket**: Single connection per request ID, auto-cleanup
- **Responses**: Stored in Zustand state, survives navigation

---

## Security Notes

- **Basic Auth**: Credentials stored in JSON workspace files (unencrypted)
- **Bearer Tokens**: Same as basic auth
- **gRPC**: Insecure credentials by default (for testing)
- **WebSocket**: No TLS verification flags

**Recommendation**: Don't commit workspace files with credentials. Use environment variables or .env files.

---

## Production Deployment

1. Build: `npm run build`
2. Package Mac: `npm run dist:mac`
3. Package DMG: `npm run dist:mac:dmg`
4. Output: `release/Sendman-*.dmg`

---

## Future Enhancements

1. gRPC streaming (client/server/bidirectional)
2. Server address configuration for gRPC
3. WebSocket reconnection logic
4. HTTP/2 and HTTP/3 support
5. Protocol buffers inspector (decode binary)
6. OAuth 2.0 flow integration
7. API key management
8. Request history
9. Mock server mode
10. Import from Postman/Insomnia collections
