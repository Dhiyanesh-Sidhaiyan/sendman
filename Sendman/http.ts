import { IpcMain } from 'electron';
import { request as undiciRequest } from 'undici';
import type { RequestDef, HttpRequestDef } from './store';
import { substitute, substituteJson, VarMap } from './vars';

export interface ExecuteInput {
  request: RequestDef;
  vars: VarMap;
}

export type ExecuteResult = HttpExecuteResult | GraphQLExecuteResult;

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

function buildUrl(rawUrl: string, params: HttpRequestDef['params'], vars: VarMap): string {
  const url = substitute(rawUrl, vars);
  const enabled = params.filter(p => p.enabled && p.key);
  if (enabled.length === 0) return url;
  const u = new URL(url);
  for (const p of enabled) u.searchParams.append(substitute(p.key, vars), substitute(p.value, vars));
  return u.toString();
}

function buildHeaders(req: HttpRequestDef, vars: VarMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    out[substitute(h.key, vars)] = substitute(h.value, vars);
  }
  if (req.auth.type === 'basic' && req.auth.username) {
    const u = substitute(req.auth.username, vars);
    const p = substitute(req.auth.password ?? '', vars);
    out['Authorization'] = 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    out['Authorization'] = 'Bearer ' + substitute(req.auth.token, vars);
  }
  if (req.body.type === 'json' && req.body.content && !out['Content-Type'] && !out['content-type']) {
    out['Content-Type'] = 'application/json';
  }
  if (req.body.type === 'xml' && req.body.content && !out['Content-Type'] && !out['content-type']) {
    out['Content-Type'] = 'application/xml';
  }
  if (req.body.type === 'form' && !out['Content-Type'] && !out['content-type']) {
    out['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return out;
}

function buildBody(req: HttpRequestDef, vars: VarMap): string | undefined {
  if (req.body.type === 'none') return undefined;
  if (!req.body.content) return undefined;
  if (req.body.type === 'json') return substituteJson(req.body.content, vars);
  return substitute(req.body.content, vars);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function jitterDelay(attempt: number): number {
  const base = Math.min(30000, 200 * Math.pow(2, attempt));
  return Math.floor(Math.random() * base);
}

async function executeHttpOnce(input: ExecuteInput): Promise<HttpExecuteResult> {
  const { request: req, vars } = input;
  if (req.protocol !== 'http') throw new Error('executeHttpOnce expects http protocol');
  const url = buildUrl(req.url, req.params, vars);
  const headers = buildHeaders(req, vars);
  const body = buildBody(req, vars);
  const timeout = req.resilience.timeoutMs > 0 ? req.resilience.timeoutMs : 30000;

  const started = performance.now();
  try {
    const res = await undiciRequest(url, {
      method: req.method as any,
      headers,
      body,
      headersTimeout: timeout,
      bodyTimeout: timeout
    });
    const buf = Buffer.from(await res.body.arrayBuffer());
    const latencyMs = Math.round(performance.now() - started);
    const respHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      respHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    }
    return {
      protocol: 'http',
      ok: res.statusCode >= 200 && res.statusCode < 400,
      status: res.statusCode,
      statusText: '',
      headers: respHeaders,
      body: buf.toString('utf-8'),
      bodyBytes: buf.byteLength,
      latencyMs,
      attempts: 1,
      url,
      requestHeaders: headers,
      requestBody: body
    };
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      protocol: 'http',
      ok: false,
      status: 0,
      statusText: classifyError(e),
      headers: {},
      body: '',
      bodyBytes: 0,
      latencyMs,
      attempts: 1,
      error: errorReason(e, url),
      url,
      requestHeaders: headers,
      requestBody: body
    };
  }
}

function classifyError(e: any): string {
  const code = e?.code ?? e?.cause?.code ?? '';
  if (code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'Timeout';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS Failure';
  if (code === 'ECONNREFUSED') return 'Connection Refused';
  if (code === 'ECONNRESET') return 'Connection Reset';
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || String(code).startsWith('ERR_TLS')) return 'TLS Error';
  if (code === 'ERR_INVALID_URL') return 'Invalid URL';
  return 'Network Error';
}

function errorReason(e: any, url: string): string {
  const code = e?.code ?? e?.cause?.code;
  const msg = e?.cause?.message ?? e?.message ?? String(e);
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (code === 'ENOTFOUND') return `Could not resolve host "${host}". Check the URL or your network.`;
  if (code === 'ECONNREFUSED') return `Connection to ${host} was refused. Is the server running?`;
  if (code === 'ECONNRESET') return `Connection to ${host} was reset by the remote peer.`;
  if (code === 'UND_ERR_HEADERS_TIMEOUT') return `Server at ${host} did not return headers before the timeout.`;
  if (code === 'UND_ERR_BODY_TIMEOUT') return `Server at ${host} stopped sending the body before the timeout.`;
  if (code === 'UND_ERR_CONNECT_TIMEOUT') return `Could not establish a connection to ${host} before the timeout.`;
  if (code === 'ERR_INVALID_URL') return `"${url}" is not a valid URL.`;
  return code ? `${code}: ${msg}` : msg;
}

async function executeGraphQL(input: ExecuteInput): Promise<GraphQLExecuteResult> {
  const { request: req, vars } = input;
  if (req.protocol !== 'graphql') throw new Error('executeGraphQL expects graphql protocol');

  const started = performance.now();
  try {
    const url = substitute(req.url, vars);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const h of req.headers) {
      if (!h.enabled || !h.key) continue;
      headers[substitute(h.key, vars)] = substitute(h.value, vars);
    }
    if (req.auth.type === 'basic' && req.auth.username) {
      const u = substitute(req.auth.username, vars);
      const p = substitute(req.auth.password ?? '', vars);
      headers['Authorization'] = 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
    } else if (req.auth.type === 'bearer' && req.auth.token) {
      headers['Authorization'] = 'Bearer ' + substitute(req.auth.token, vars);
    }

    const query = substitute(req.query, vars);
    const variables = substituteJson(req.variables, vars);
    const body = JSON.stringify({ query, variables: JSON.parse(variables) });

    const timeout = req.resilience.timeoutMs > 0 ? req.resilience.timeoutMs : 30000;
    const res = await undiciRequest(url, { method: 'POST', headers, body, headersTimeout: timeout, bodyTimeout: timeout });

    const buf = Buffer.concat(await res.body.toArray());
    const latencyMs = Math.round(performance.now() - started);
    const parsed = JSON.parse(buf.toString('utf-8'));

    return {
      protocol: 'graphql',
      ok: !parsed.errors,
      data: parsed.data,
      errors: parsed.errors,
      latencyMs
    };
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      protocol: 'graphql',
      ok: false,
      latencyMs,
      error: e?.message ?? String(e)
    };
  }
}

async function executeHttp(input: ExecuteInput): Promise<HttpExecuteResult> {
  const maxAttempts = Math.max(1, input.request.resilience.maxAttempts || 1);
  const retryStatuses = new Set(input.request.resilience.retryStatuses || []);
  let last: HttpExecuteResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await executeHttpOnce(input);
    res.attempts = attempt;
    last = res;
    const transient = res.status === 0 || retryStatuses.has(res.status);
    if (!transient || attempt === maxAttempts) return res;
    await sleep(jitterDelay(attempt - 1));
  }
  return last!;
}

export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  if (input.request.protocol === 'graphql') return executeGraphQL(input);
  if (input.request.protocol === 'http') return executeHttp(input);
  // gRPC and WebSocket have their own IPC handlers
  throw new Error(`Unsupported protocol for http:execute: ${input.request.protocol}`);
}

export function registerHttpHandlers(ipc: IpcMain) {
  ipc.handle('http:execute', async (_e, input: ExecuteInput) => execute(input));
}
