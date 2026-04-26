import { app, IpcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

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

export interface GrpcExecuteResult {
  protocol: 'grpc';
  ok: boolean;
  response?: any;
  latencyMs: number;
  attempts: number;
  error?: string;
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

function workspaceDir(): string {
  return path.join(app.getPath('userData'), 'workspace');
}
const collectionsDir = () => path.join(workspaceDir(), 'collections');
const envDir = () => path.join(workspaceDir(), 'environments');

async function ensureDirs() {
  await fs.mkdir(collectionsDir(), { recursive: true });
  await fs.mkdir(envDir(), { recursive: true });
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const text = await fs.readFile(p, 'utf-8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(p: string, data: unknown) {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

export function registerStoreHandlers(ipc: IpcMain) {
  ipc.handle('store:workspacePath', () => workspaceDir());

  ipc.handle('store:listCollections', async (): Promise<Collection[]> => {
    await ensureDirs();
    const entries = await fs.readdir(collectionsDir());
    const out: Collection[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      const c = await readJson<Collection>(path.join(collectionsDir(), e));
      if (c) out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipc.handle('store:readCollection', async (_e, id: string) => {
    return readJson<Collection>(path.join(collectionsDir(), `${id}.json`));
  });

  ipc.handle('store:saveCollection', async (_e, col: Collection) => {
    await ensureDirs();
    await writeJson(path.join(collectionsDir(), `${col.id}.json`), col);
    return col;
  });

  ipc.handle('store:deleteCollection', async (_e, id: string) => {
    try { await fs.unlink(path.join(collectionsDir(), `${id}.json`)); } catch {}
  });

  ipc.handle('store:saveRequest', async (_e, collectionId: string, req: RequestDef) => {
    const p = path.join(collectionsDir(), `${collectionId}.json`);
    const col = await readJson<Collection>(p);
    if (!col) throw new Error('Collection not found');
    const idx = col.requests.findIndex(r => r.id === req.id);
    if (idx >= 0) col.requests[idx] = req; else col.requests.push(req);
    await writeJson(p, col);
    return col;
  });

  ipc.handle('store:deleteRequest', async (_e, collectionId: string, requestId: string) => {
    const p = path.join(collectionsDir(), `${collectionId}.json`);
    const col = await readJson<Collection>(p);
    if (!col) return null;
    col.requests = col.requests.filter(r => r.id !== requestId);
    await writeJson(p, col);
    return col;
  });

  ipc.handle('store:listEnvironments', async (): Promise<Environment[]> => {
    await ensureDirs();
    const entries = await fs.readdir(envDir());
    const out: Environment[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      const env = await readJson<Environment>(path.join(envDir(), e));
      if (env) out.push(env);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipc.handle('store:saveEnvironment', async (_e, env: Environment) => {
    await ensureDirs();
    await writeJson(path.join(envDir(), `${env.id}.json`), env);
    return env;
  });

  ipc.handle('store:deleteEnvironment', async (_e, id: string) => {
    try { await fs.unlink(path.join(envDir(), `${id}.json`)); } catch {}
  });
}
