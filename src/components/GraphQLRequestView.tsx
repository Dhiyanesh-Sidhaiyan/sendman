import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import type { GraphQLRequestDef } from '../types';
import { HighlightedField, HighlightedTextarea } from './Highlighted';
import { toCurl } from '../lib/curlExport';

export function GraphQLRequestView() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const activeRequestId = useStore(s => s.activeRequestId);
  const saveRequest = useStore(s => s.saveRequest);
  const response = activeRequestId ? useStore(s => s.responses[activeRequestId]) : null;
  const executeRequest = useStore(s => s.executeRequest);

  const stored = useMemo(() => {
    const c = collections.find(c => c.id === activeCollectionId);
    const r = c?.requests.find(r => r.id === activeRequestId);
    return r?.protocol === 'graphql' ? r : null;
  }, [collections, activeCollectionId, activeRequestId]);

  const [draft, setDraft] = useState<GraphQLRequestDef | null>(stored ?? null);
  const [tab, setTab] = useState<'headers' | 'auth'>('headers');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => { setDraft(stored ?? null); }, [stored?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const dirty = useMemo(() =>
    draft && stored && JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);

  const update = (patch: Partial<GraphQLRequestDef>) => setDraft(d => d && ({ ...d, ...patch }));

  const copyCurl = async () => {
    if (!draft) return;
    const resolveVars = useStore.getState().resolveVars;
    const curlCmd = toCurl(draft, resolveVars());
    await navigator.clipboard.writeText(curlCmd);
    setToast({ kind: 'ok', msg: 'Copied curl command' });
  };

  if (!draft || !activeCollectionId) return null;

  const onSave = () => activeCollectionId && saveRequest(activeCollectionId, draft);
  const onSend = () => executeRequest(draft);
  const isLoading = response && 'loading' in response;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {toast && (
        <div className={`fixed top-14 right-4 z-50 px-3 py-2 rounded text-xs border shadow-lg ${
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
          className="text-lg font-medium bg-transparent border-none outline-none flex-1"
        />
        <button onClick={copyCurl} className="px-3 py-1 text-xs bg-bg-elev hover:bg-bg-border rounded">
          Copy as curl
        </button>
        <button onClick={onSave} disabled={!dirty} className="px-3 py-1 text-xs bg-accent/20 text-accent rounded disabled:opacity-30">
          {dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <span className="font-mono font-bold text-xs text-pink-400 w-12">GQL</span>
        <HighlightedField
          value={draft.url}
          onChange={url => update({ url })}
          placeholder="https://api.example.com/graphql"
          className="flex-1"
        />
        <button
          onClick={onSend}
          disabled={!!isLoading}
          className="px-4 py-2 bg-accent text-bg-panel font-medium text-sm rounded hover:bg-accent/90 disabled:opacity-50">
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col border-r border-bg-border">
          <div className="px-4 py-2 border-b border-bg-border text-xs font-medium text-zinc-400">Query</div>
          <div className="flex-1 p-4">
            <HighlightedTextarea
              value={draft.query}
              onChange={query => update({ query })}
              placeholder="query { }"
              className="w-full h-full resize-none"
            />
          </div>
          <div className="px-4 py-2 border-t border-b border-bg-border text-xs font-medium text-zinc-400">Variables (JSON)</div>
          <div className="h-40 p-4">
            <HighlightedTextarea
              value={draft.variables}
              onChange={variables => update({ variables })}
              placeholder="{}"
              className="w-full h-full resize-none"
            />
          </div>

          <div className="border-t border-bg-border">
            <div className="flex text-xs border-b border-bg-border">
              {(['headers', 'auth'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-4 max-h-48 overflow-y-auto">
              {tab === 'headers' && (
                <div className="space-y-2">
                  {draft.headers.map((h, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <input value={h.key} onChange={e => {
                        const next = [...draft.headers];
                        next[i] = { ...h, key: e.target.value };
                        update({ headers: next });
                      }} placeholder="Key" className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1" />
                      <input value={h.value} onChange={e => {
                        const next = [...draft.headers];
                        next[i] = { ...h, value: e.target.value };
                        update({ headers: next });
                      }} placeholder="Value" className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1" />
                      <input type="checkbox" checked={h.enabled} onChange={e => {
                        const next = [...draft.headers];
                        next[i] = { ...h, enabled: e.target.checked };
                        update({ headers: next });
                      }} />
                      <button onClick={() => update({ headers: draft.headers.filter((_, j) => j !== i) })} className="text-red-400">×</button>
                    </div>
                  ))}
                  <button onClick={() => update({ headers: [...draft.headers, { key: '', value: '', enabled: true }] })} className="text-xs text-accent">+ Add header</button>
                </div>
              )}

              {tab === 'auth' && (
                <div className="space-y-2 text-xs">
                  <select value={draft.auth.type} onChange={e => update({ auth: { type: e.target.value as any } })} className="bg-bg-elev border border-bg-border rounded px-2 py-1">
                    <option value="none">No Auth</option>
                    <option value="basic">Basic Auth</option>
                    <option value="bearer">Bearer Token</option>
                  </select>
                  {draft.auth.type === 'basic' && (
                    <>
                      <input value={draft.auth.username ?? ''} onChange={e => update({ auth: { ...draft.auth, username: e.target.value } })} placeholder="Username" className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                      <input type="password" value={draft.auth.password ?? ''} onChange={e => update({ auth: { ...draft.auth, password: e.target.value } })} placeholder="Password" className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                    </>
                  )}
                  {draft.auth.type === 'bearer' && (
                    <input value={draft.auth.token ?? ''} onChange={e => update({ auth: { ...draft.auth, token: e.target.value } })} placeholder="Token" className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-bg-panel">
          <div className="px-4 py-2 border-b border-bg-border text-xs font-medium text-zinc-400">Response</div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
            {isLoading && <div className="text-zinc-500">Sending...</div>}
            {response && 'protocol' in response && response.protocol === 'graphql' && (
              <pre className="whitespace-pre-wrap">{JSON.stringify({ data: response.data, errors: response.errors }, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
