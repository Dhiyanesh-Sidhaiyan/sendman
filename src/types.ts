export interface KV { key: string; value: string; enabled: boolean }

export type RequestDef = HttpRequestDef | GraphQLRequestDef | GrpcRequestDef | WebSocketRequestDef;

export interface HttpRequestDef {
  id: string;
  name: string;
  protocol: 'http';
  method: string;
  url: string;
  headers: KV[];
  params: KV[];
  body: { type: 'none' | 'json' | 'xml' | 'text' | 'form'; content: string };
  auth: { type: 'none' | 'basic' | 'bearer'; username?: string; password?: string; token?: string };
  resilience: { timeoutMs: number; maxAttempts: number; retryStatuses: number[] };
}

export interface GraphQLRequestDef {
  id: string;
  name: string;
  protocol: 'graphql';
  url: string;
  query: string;
  variables: string;
  headers: KV[];
  auth: { type: 'none' | 'basic' | 'bearer'; username?: string; password?: string; token?: string };
  resilience: { timeoutMs: number; maxAttempts: number; retryStatuses: number[] };
}

export interface GrpcRequestDef {
  id: string;
  name: string;
  protocol: 'grpc';
  protoPath: string;
  service: string;
  method: string;
  message: string;
  metadata: KV[];
  resilience: { timeoutMs: number; maxAttempts: number; retryStatuses: number[] };
}

export interface WebSocketRequestDef {
  id: string;
  name: string;
  protocol: 'websocket';
  url: string;
  headers: KV[];
  resilience: { timeoutMs: number; maxAttempts: number; retryStatuses: number[] };
}

export interface Collection {
  id: string;
  name: string;
  variables: Record<string, string>;
  requests: RequestDef[];
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export type ExecuteResult = HttpExecuteResult | GraphQLExecuteResult | GrpcExecuteResult | WebSocketExecuteResult;

export interface HttpExecuteResult {
  protocol: 'http';
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyBytes: number;
  latencyMs: number;
  attempts: number;
  error?: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
}

export interface GraphQLExecuteResult {
  protocol: 'graphql';
  ok: boolean;
  data?: any;
  errors?: any[];
  latencyMs: number;
  error?: string;
}

export interface GrpcExecuteResult {
  protocol: 'grpc';
  ok: boolean;
  response?: any;
  latencyMs: number;
  attempts: number;
  error?: string;
}

export interface WebSocketExecuteResult {
  protocol: 'websocket';
  ok: boolean;
  messages: Array<{ direction: 'sent' | 'received'; text: string; timestamp: number }>;
  error?: string;
}

export interface IterationEvent {
  type: 'iteration';
  runId: string;
  iteration: number;
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  attempts: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface RunStartEvent { type: 'start'; runId: string; total: number }
export interface RunDoneEvent { type: 'done'; runId: string; pass: number; fail: number; totalMs: number }
export type RunEvent = RunStartEvent | IterationEvent | RunDoneEvent;

declare global {
  interface Window {
    api: {
      store: {
        listCollections: () => Promise<Collection[]>;
        readCollection: (id: string) => Promise<Collection | null>;
        saveCollection: (c: Collection) => Promise<Collection>;
        deleteCollection: (id: string) => Promise<void>;
        saveRequest: (collectionId: string, r: RequestDef) => Promise<Collection>;
        deleteRequest: (collectionId: string, requestId: string) => Promise<Collection | null>;
        listEnvironments: () => Promise<Environment[]>;
        saveEnvironment: (e: Environment) => Promise<Environment>;
        deleteEnvironment: (id: string) => Promise<void>;
        workspacePath: () => Promise<string>;
      };
      http: {
        execute: (input: { request: RequestDef; vars: Record<string, string> }) => Promise<ExecuteResult>;
      };
      runner: {
        start: (config: {
          runId: string;
          requests: RequestDef[];
          rows: Record<string, string>[];
          baseVars: Record<string, string>;
          delayMs: number;
        }) => Promise<RunDoneEvent>;
        onProgress: (cb: (msg: RunEvent) => void) => () => void;
      };
      grpc?: {
        execute: (input: { request: GrpcRequestDef; vars: Record<string, string> }) => Promise<GrpcExecuteResult>;
      };
      ws?: {
        connect: (input: { request: WebSocketRequestDef; vars: Record<string, string> }) => Promise<{ ok: boolean; error?: string }>;
        disconnect: (id: string) => Promise<void>;
        send: (id: string, text: string) => Promise<void>;
        onMessage: (cb: (data: { id: string; direction: 'sent' | 'received'; text: string; timestamp: number }) => void) => () => void;
      };
    };
  }
}
