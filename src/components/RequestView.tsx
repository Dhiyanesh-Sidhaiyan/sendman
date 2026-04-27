import { useEffect, useMemo, useState, useRef } from 'react';
import { useStore } from '../store';
import type { KV, RequestDef, HttpRequestDef } from '../types';
import { ResponsePanel } from './ResponsePanel';
import { beautifyJson, beautifyXml } from '../lib/beautify';
import { extractVars, findUnresolved } from '../lib/vars';
import { HighlightedField, HighlightedTextarea } from './Highlighted';
import { VarPopover } from './VarPopover';
import { parseCurl } from '../lib/curl';
import { toCurl } from '../lib/curlExport';
import { GraphQLRequestView } from './GraphQLRequestView';
import { GrpcRequestView } from './GrpcRequestView';
import { WebSocketRequestView } from './WebSocketRequestView';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function mergeHeaders(existing: KV[], incoming: KV[]): KV[] {
  const incomingKeys = new Set(incoming.map(h => h.key.toLowerCase()));
  const kept = existing.filter(h => !incomingKeys.has(h.key.toLowerCase()));
  return [...kept, ...incoming];
}

function shortUrl(u: string, max = 40) {
  if (u.length <= max) return u;
  return u.slice(0, max - 1) + '…';
}

export function RequestView() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const activeRequestId = useStore(s => s.activeRequestId);
  const saveRequest = useStore(s => s.saveRequest);
  const executeRequest = useStore(s => s.executeRequest);
  const responses = useStore(s => s.responses);
  const resolveVars = useStore(s => s.resolveVars);

  const collection = collections.find(c => c.id === activeCollectionId);
  const stored = collection?.requests.find(r => r.id === activeRequestId);

  // Initialize draft state - always set to null for non-HTTP protocols
  const [draft, setDraft] = useState<HttpRequestDef | null>(() =>
    stored?.protocol === 'http' ? stored : null
  );
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'resilience'>('params');
  const [popoverVar, setPopoverVar] = useState<{ name: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [splitPos, setSplitPos] = useState(50); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync draft with stored HTTP request
  useEffect(() => {
    if (stored?.protocol === 'http') {
      setDraft(stored);
    } else {
      setDraft(null);
    }
  }, [stored?.id, stored?.protocol]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Curl paste handler
  const handleUrlPaste = (text: string): boolean => {
    const trimmed = text.trim();
    if (!/^curl\b/i.test(trimmed)) return false;
    const result = parseCurl(text);
    if (!result.ok) {
      setToast({ kind: 'error', msg: result.error });
      return true;
    }
    const { req } = result;
    setDraft(d => {
      if (!d) return null;
      let newAuth = d.auth;
      if (req.auth.type === 'basic') {
        newAuth = { type: 'basic', username: req.auth.username ?? '', password: req.auth.password ?? '' };
      } else if (req.auth.type === 'bearer') {
        newAuth = { type: 'bearer', token: req.auth.token ?? '' };
      }
      return {
        ...d,
        method: req.method,
        url: req.url,
        headers: mergeHeaders(d.headers, req.headers),
        body: req.body.type === 'none' ? d.body : { type: req.body.type, content: req.body.content },
        auth: newAuth,
      };
    });
    const note = req.warnings.length ? ` (${req.warnings.length} warning${req.warnings.length > 1 ? 's' : ''})` : '';
    if (req.warnings.length) console.warn('[curl import]', req.warnings);
    setToast({ kind: 'ok', msg: `Imported ${req.method} ${shortUrl(req.url)}${note}` });
    return true;
  };

  // Compute derived state
  const dirty = useMemo(() =>
    draft && stored && stored.protocol === 'http' && JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);

  const vars = resolveVars();
  const unresolved = useMemo(() => draft ? findUnresolved(draft, vars) : [], [draft, vars]);

  // Route to protocol-specific views AFTER all hooks are declared
  if (stored?.protocol === 'graphql') return <GraphQLRequestView />;
  if (stored?.protocol === 'grpc') return <GrpcRequestView />;
  if (stored?.protocol === 'websocket') return <WebSocketRequestView />;

  if (!collection || !draft) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        Select or create a request to begin.
      </div>
    );
  }

  const update = (patch: Partial<HttpRequestDef>) => setDraft({ ...draft, ...patch });

  const copyCurl = async () => {
    const curlCmd = toCurl(draft, vars);
    await navigator.clipboard.writeText(curlCmd);
    setToast({ kind: 'ok', msg: 'Copied curl command' });
  };
  const response = responses[draft.id];
  const isLoading = response && 'loading' in response;

  // Resizer handlers
  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPos = ((e.clientY - rect.top) / rect.height) * 100;
    setSplitPos(Math.max(20, Math.min(80, newPos)));
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {toast && (
        <div
          onClick={() => setToast(null)}
          className={`fixed top-14 right-4 z-50 px-3 py-2 rounded text-xs border shadow-lg cursor-pointer hover:opacity-80 transition-opacity ${
            toast.kind === 'ok'
              ? 'bg-method-get/10 border-method-get/40 text-method-get'
              : 'bg-method-delete/10 border-method-delete/40 text-method-delete'
          }`}>
          {toast.msg}
        </div>
      )}
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <input
          value={draft.name}
          onChange={e => update({ name: e.target.value })}
          className="bg-transparent text-sm font-medium focus:outline-none w-48"
        />
        <span className="text-xs text-zinc-500">{collection.name}</span>
        <div className="flex-1" />
        {dirty && <span className="text-[11px] text-yellow-500">unsaved</span>}
        <button
          onClick={copyCurl}
          className="text-xs px-3 py-1 rounded bg-bg-elev hover:bg-bg-border">
          Copy as curl
        </button>
        <button
          onClick={() => saveRequest(collection.id, draft)}
          disabled={!dirty}
          className="text-xs px-3 py-1 rounded bg-bg-elev hover:bg-bg-border disabled:opacity-40">Save</button>
      </div>

      <div className="px-4 py-3 flex gap-2 border-b border-bg-border">
        <select
          value={draft.method}
          onChange={e => update({ method: e.target.value })}
          className="bg-bg-elev border border-bg-border rounded px-2 py-2 font-mono text-xs font-bold focus:outline-none focus:border-accent"
        >
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <HighlightedField
          value={draft.url}
          onChange={url => update({ url })}
          onPaste={handleUrlPaste}
          placeholder="https://api.example.com/{{resource}}  ·  paste curl to import"
          className="flex-1"
        />
        <button
          onClick={async () => { await saveRequest(collection.id, draft); await executeRequest(draft); }}
          disabled={isLoading}
          className="bg-accent hover:bg-accent-dim text-white text-sm font-medium px-5 py-2 rounded disabled:opacity-50"
        >{isLoading ? 'Sending…' : 'Send'}</button>
      </div>

      {unresolved.length > 0 && (
        <UnresolvedBanner
          unresolved={unresolved}
          onPick={(name, e) => setPopoverVar({ name, x: e.clientX, y: e.clientY })}
        />
      )}

      <div className="flex border-b border-bg-border text-xs">
        {(['params', 'headers', 'body', 'auth', 'resilience'] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize ${tab === t ? 'text-zinc-200 border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}{t === 'headers' && draft.headers.filter(h => h.enabled).length > 0 ? ` (${draft.headers.filter(h => h.enabled).length})` : ''}
            {t === 'params' && draft.params.filter(h => h.enabled).length > 0 ? ` (${draft.params.filter(h => h.enabled).length})` : ''}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
        <div className="overflow-y-auto p-4 border-b border-bg-border" style={{ height: `${splitPos}%` }}>
          {tab === 'params' && <KVEditor rows={draft.params} onChange={params => update({ params })} placeholderKey="key" />}
          {tab === 'headers' && <KVEditor rows={draft.headers} onChange={headers => update({ headers })} placeholderKey="header" />}
          {tab === 'body' && <BodyEditor body={draft.body} onChange={body => update({ body })} unresolvedNames={unresolved.map(u => u.name)} />}
          {tab === 'auth' && <AuthEditor auth={draft.auth} onChange={auth => update({ auth })} />}
          {tab === 'resilience' && <ResilienceEditor r={draft.resilience} onChange={resilience => update({ resilience })} />}
        </div>
        <div
          onMouseDown={handleMouseDown}
          className="h-1 bg-bg-border hover:bg-accent cursor-row-resize flex-shrink-0"
        />
        <div className="flex-1 min-h-0">
          <ResponsePanel response={response} />
        </div>
      </div>

      {popoverVar && (
        <VarPopover name={popoverVar.name} anchor={{ x: popoverVar.x, y: popoverVar.y }} onClose={() => setPopoverVar(null)} />
      )}
    </div>
  );
}

function UnresolvedBanner({ unresolved, onPick }: {
  unresolved: { name: string; locations: string[] }[];
  onPick: (name: string, e: React.MouseEvent) => void;
}) {
  return (
    <div className="px-4 py-2 bg-yellow-600/10 border-b border-yellow-600/30 text-xs flex items-center gap-2 flex-wrap">
      <span className="text-yellow-500 font-medium">
        {unresolved.length} unresolved variable{unresolved.length > 1 ? 's' : ''}:
      </span>
      {unresolved.map(u => (
        <button
          key={u.name}
          onClick={(e) => onPick(u.name, e)}
          title={`Used in: ${u.locations.join(', ')}\nClick to set`}
          className="px-2 py-0.5 rounded bg-method-delete/10 border border-method-delete/40 text-method-delete font-mono hover:bg-method-delete/20"
        >{`{{${u.name}}}`}</button>
      ))}
      <span className="text-zinc-500">— click to set, or define in an Environment.</span>
    </div>
  );
}

function KVEditor({ rows, onChange, placeholderKey }: { rows: KV[]; onChange: (r: KV[]) => void; placeholderKey: string }) {
  const update = (i: number, patch: Partial<KV>) => {
    const next = [...rows]; next[i] = { ...next[i], ...patch }; onChange(next);
  };
  const add = () => onChange([...rows, { key: '', value: '', enabled: true }]);
  const remove = (i: number) => onChange(rows.filter((_, x) => x !== i));

  return (
    <div className="space-y-1">
      {rows.length === 0 && <div className="text-xs text-zinc-500 mb-2">No rows. Add one below.</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input type="checkbox" checked={r.enabled} onChange={e => update(i, { enabled: e.target.checked })} className="accent-accent" />
          <input value={r.key} onChange={e => update(i, { key: e.target.value })} placeholder={placeholderKey}
            className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
          <input value={r.value} onChange={e => update(i, { value: e.target.value })} placeholder="value"
            className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
          <button onClick={() => remove(i)} className="text-zinc-500 hover:text-red-400 text-sm px-1">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-accent hover:text-zinc-200 mt-2">+ Add row</button>
    </div>
  );
}

function BodyEditor({ body, onChange, unresolvedNames }: {
  body: HttpRequestDef['body'];
  onChange: (b: HttpRequestDef['body']) => void;
  unresolvedNames: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const canBeautify = body.type === 'json' || body.type === 'xml';

  const onBeautify = () => {
    setError(null);
    const used = extractVars(body.content).filter(n => unresolvedNames.includes(n));
    if (used.length > 0) {
      setError(
        `Can't beautify — ${used.length} unresolved variable${used.length > 1 ? 's' : ''}: ${used.map(n => `{{${n}}}`).join(', ')}. ` +
        `Define them first (or click the highlighted token) so the body becomes valid ${body.type.toUpperCase()}.`
      );
      return;
    }
    const result = body.type === 'json' ? beautifyJson(body.content) : beautifyXml(body.content);
    if (result.ok) onChange({ ...body, content: result.text });
    else setError(`Invalid ${body.type.toUpperCase()} — ${result.error}`);
  };

  const placeholder = body.type === 'json'
    ? '{ "key": "{{var}}" }'
    : body.type === 'xml'
    ? '<root>\n  <name>{{var}}</name>\n</root>'
    : body.type === 'form'
    ? 'key1=value1&key2=value2'
    : '';

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex gap-1 text-xs items-center flex-shrink-0">
        {(['none', 'json', 'xml', 'text', 'form'] as const).map(t => (
          <button key={t} onClick={() => { setError(null); onChange({ ...body, type: t }); }}
            className={`px-3 py-1 rounded uppercase ${body.type === t ? 'bg-accent text-white' : 'bg-bg-elev text-zinc-400 hover:text-zinc-200'}`}>
            {t}
          </button>
        ))}
        <div className="flex-1" />
        {canBeautify && (
          <button
            onClick={onBeautify}
            disabled={!body.content.trim()}
            className="px-3 py-1 rounded bg-bg-elev hover:bg-bg-border text-zinc-300 disabled:opacity-40">
            Beautify {body.type.toUpperCase()}
          </button>
        )}
      </div>
      {body.type !== 'none' && (
        <>
          <HighlightedTextarea
            value={body.content}
            onChange={v => { setError(null); onChange({ ...body, content: v }); }}
            placeholder={placeholder}
          />
          {error && (
            <div className="text-[11px] text-method-delete border border-method-delete/40 bg-method-delete/5 rounded px-3 py-2 leading-relaxed">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuthEditor({ auth, onChange }: { auth: HttpRequestDef['auth']; onChange: (a: HttpRequestDef['auth']) => void }) {
  return (
    <div className="space-y-3 max-w-md">
      <div className="flex gap-1 text-xs">
        {(['none', 'basic', 'bearer'] as const).map(t => (
          <button key={t} onClick={() => onChange({ ...auth, type: t })}
            className={`px-3 py-1 rounded ${auth.type === t ? 'bg-accent text-white' : 'bg-bg-elev text-zinc-400 hover:text-zinc-200'}`}>
            {t}
          </button>
        ))}
      </div>
      {auth.type === 'basic' && (
        <div className="space-y-2">
          <input value={auth.username ?? ''} onChange={e => onChange({ ...auth, username: e.target.value })} placeholder="username"
            className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
          <input value={auth.password ?? ''} onChange={e => onChange({ ...auth, password: e.target.value })} placeholder="password" type="password"
            className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
        </div>
      )}
      {auth.type === 'bearer' && (
        <input value={auth.token ?? ''} onChange={e => onChange({ ...auth, token: e.target.value })} placeholder="token (or {{token}})"
          className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
      )}
    </div>
  );
}

function ResilienceEditor({ r, onChange }: { r: RequestDef['resilience']; onChange: (r: RequestDef['resilience']) => void }) {
  return (
    <div className="space-y-3 max-w-md text-xs">
      <Field label="Timeout (ms)">
        <input type="number" value={r.timeoutMs} onChange={e => onChange({ ...r, timeoutMs: +e.target.value })}
          className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 font-mono focus:outline-none focus:border-accent" />
      </Field>
      <Field label="Max attempts (1 = no retry)">
        <input type="number" min={1} max={10} value={r.maxAttempts} onChange={e => onChange({ ...r, maxAttempts: +e.target.value })}
          className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 font-mono focus:outline-none focus:border-accent" />
      </Field>
      <Field label="Retry on status codes (comma-separated)">
        <input value={r.retryStatuses.join(',')}
          onChange={e => onChange({ ...r, retryStatuses: e.target.value.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) })}
          className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 font-mono focus:outline-none focus:border-accent" />
      </Field>
      <p className="text-zinc-500 text-[11px]">Retries use exponential backoff with jitter. Network failures (status 0) always retry.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-zinc-500 text-[11px] uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
