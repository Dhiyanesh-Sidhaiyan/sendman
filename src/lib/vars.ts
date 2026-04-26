import type { RequestDef } from '../types';

export const VAR_RE = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;

export function extractVars(text: string | undefined | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

export interface VarUsage {
  name: string;
  locations: string[];
}

export function collectRequestVars(req: RequestDef): VarUsage[] {
  const map = new Map<string, Set<string>>();
  const add = (name: string, where: string) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name)!.add(where);
  };

  if (req.protocol === 'http') {
    for (const v of extractVars(req.url)) add(v, 'URL');
    for (const p of req.params) {
      if (!p.enabled) continue;
      for (const v of extractVars(p.key)) add(v, `Param key "${p.key}"`);
      for (const v of extractVars(p.value)) add(v, `Param "${p.key}"`);
    }
    for (const h of req.headers) {
      if (!h.enabled) continue;
      for (const v of extractVars(h.key)) add(v, `Header key "${h.key}"`);
      for (const v of extractVars(h.value)) add(v, `Header "${h.key}"`);
    }
    if (req.body.type !== 'none') for (const v of extractVars(req.body.content)) add(v, 'Body');
    if (req.auth.type === 'basic') {
      for (const v of extractVars(req.auth.username ?? '')) add(v, 'Auth username');
      for (const v of extractVars(req.auth.password ?? '')) add(v, 'Auth password');
    } else if (req.auth.type === 'bearer') {
      for (const v of extractVars(req.auth.token ?? '')) add(v, 'Auth token');
    }
  } else if (req.protocol === 'graphql') {
    for (const v of extractVars(req.url)) add(v, 'URL');
    for (const v of extractVars(req.query)) add(v, 'Query');
    for (const v of extractVars(req.variables)) add(v, 'Variables');
    for (const h of req.headers) {
      if (!h.enabled) continue;
      for (const v of extractVars(h.key)) add(v, `Header key "${h.key}"`);
      for (const v of extractVars(h.value)) add(v, `Header "${h.key}"`);
    }
    if (req.auth.type === 'basic') {
      for (const v of extractVars(req.auth.username ?? '')) add(v, 'Auth username');
      for (const v of extractVars(req.auth.password ?? '')) add(v, 'Auth password');
    } else if (req.auth.type === 'bearer') {
      for (const v of extractVars(req.auth.token ?? '')) add(v, 'Auth token');
    }
  } else if (req.protocol === 'grpc') {
    for (const v of extractVars(req.protoPath)) add(v, 'Proto path');
    for (const v of extractVars(req.message)) add(v, 'Message');
  } else if (req.protocol === 'websocket') {
    for (const v of extractVars(req.url)) add(v, 'URL');
    for (const h of req.headers) {
      if (!h.enabled) continue;
      for (const v of extractVars(h.key)) add(v, `Header key "${h.key}"`);
      for (const v of extractVars(h.value)) add(v, `Header "${h.key}"`);
    }
  }

  return [...map.entries()].map(([name, locs]) => ({ name, locations: [...locs] }));
}

export function findUnresolved(req: RequestDef, vars: Record<string, string>): VarUsage[] {
  return collectRequestVars(req).filter(u => !(u.name in vars));
}
