import type { RequestDef, HttpRequestDef, GraphQLRequestDef } from '../types';

function escapeShellArg(str: string): string {
  // Use single quotes and escape any single quotes inside
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export function toCurl(req: RequestDef, vars: Record<string, string> = {}): string {
  const substitute = (text: string) => {
    return text.replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (_, name) => vars[name] ?? `{{${name}}}`);
  };

  if (req.protocol === 'http') {
    return httpToCurl(req, substitute);
  } else if (req.protocol === 'graphql') {
    return graphqlToCurl(req, substitute);
  } else if (req.protocol === 'grpc') {
    return '# gRPC requests cannot be represented as curl commands.\n# Use grpcurl or similar gRPC CLI tools instead.';
  } else if (req.protocol === 'websocket') {
    return '# WebSocket requests cannot be represented as curl commands.\n# Use websocat or wscat instead.';
  }
  return '# Unknown protocol';
}

function httpToCurl(req: HttpRequestDef, substitute: (s: string) => string): string {
  const parts: string[] = ['curl'];

  // Method
  if (req.method !== 'GET') {
    parts.push('-X', req.method);
  }

  // URL
  let url = substitute(req.url);

  // Params
  const enabledParams = req.params.filter(p => p.enabled && p.key);
  if (enabledParams.length > 0) {
    const urlObj = new URL(url);
    for (const p of enabledParams) {
      urlObj.searchParams.append(substitute(p.key), substitute(p.value));
    }
    url = urlObj.toString();
  }

  parts.push(escapeShellArg(url));

  // Headers
  const headers: Record<string, string> = {};
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    headers[substitute(h.key)] = substitute(h.value);
  }

  // Auth
  if (req.auth.type === 'basic' && req.auth.username) {
    const u = substitute(req.auth.username);
    const p = substitute(req.auth.password ?? '');
    parts.push('-u', escapeShellArg(`${u}:${p}`));
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    headers['Authorization'] = `Bearer ${substitute(req.auth.token)}`;
  }

  // Auto-add Content-Type if body present
  if (req.body.type === 'json' && req.body.content && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (req.body.type === 'xml' && req.body.content && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/xml';
  }
  if (req.body.type === 'form' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  // Emit headers
  for (const [k, v] of Object.entries(headers)) {
    parts.push('-H', escapeShellArg(`${k}: ${v}`));
  }

  // Body
  if (req.body.type !== 'none' && req.body.content) {
    const bodyContent = req.body.type === 'json'
      ? substituteJson(req.body.content, substitute)
      : substitute(req.body.content);
    parts.push('--data', escapeShellArg(bodyContent));
  }

  return parts.join(' \\\n  ');
}

function graphqlToCurl(req: GraphQLRequestDef, substitute: (s: string) => string): string {
  const parts: string[] = ['curl', '-X', 'POST'];

  const url = substitute(req.url);
  parts.push(escapeShellArg(url));

  // Headers
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    headers[substitute(h.key)] = substitute(h.value);
  }

  // Auth
  if (req.auth.type === 'basic' && req.auth.username) {
    const u = substitute(req.auth.username);
    const p = substitute(req.auth.password ?? '');
    parts.push('-u', escapeShellArg(`${u}:${p}`));
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    headers['Authorization'] = `Bearer ${substitute(req.auth.token)}`;
  }

  for (const [k, v] of Object.entries(headers)) {
    parts.push('-H', escapeShellArg(`${k}: ${v}`));
  }

  // Build GraphQL body
  const query = substitute(req.query);
  const variablesText = substitute(req.variables);
  let variables: any;
  try {
    variables = JSON.parse(variablesText || '{}');
  } catch {
    variables = {};
  }

  const body = JSON.stringify({ query, variables });
  parts.push('--data', escapeShellArg(body));

  return parts.join(' \\\n  ');
}

function substituteJson(jsonText: string, substitute: (s: string) => string): string {
  try {
    const parsed = JSON.parse(jsonText);
    const substituted = JSON.stringify(parsed, (_, v) => {
      if (typeof v === 'string') return substitute(v);
      return v;
    });
    return substituted;
  } catch {
    return substitute(jsonText);
  }
}
