import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import type { GrpcRequestDef } from '../types';
import { HighlightedField, HighlightedTextarea } from './Highlighted';
import { toCurl } from '../lib/curlExport';

export function GrpcRequestView() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const activeRequestId = useStore(s => s.activeRequestId);
  const saveRequest = useStore(s => s.saveRequest);
  const response = activeRequestId ? useStore(s => s.responses[activeRequestId]) : null;
  const executeRequest = useStore(s => s.executeRequest);

  const stored = useMemo(() => {
    const c = collections.find(c => c.id === activeCollectionId);
    const r = c?.requests.find(r => r.id === activeRequestId);
    return r?.protocol === 'grpc' ? r : null;
  }, [collections, activeCollectionId, activeRequestId]);

  const [draft, setDraft] = useState<GrpcRequestDef | null>(stored ?? null);
  const [tab, setTab] = useState<'metadata' | 'resilience'>('metadata');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => { setDraft(stored ?? null); }, [stored?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const dirty = useMemo(() =>
    draft && stored && JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);

  const update = (patch: Partial<GrpcRequestDef>) => setDraft(d => d && ({ ...d, ...patch }));

  const copyCurl = async () => {
    if (!draft) return;
    const resolveVars = useStore.getState().resolveVars;
    const curlCmd = toCurl(draft, resolveVars());
    await navigator.clipboard.writeText(curlCmd);
    setToast({ kind: 'ok', msg: 'Copied grpcurl suggestion' });
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
          Copy as grpcurl
        </button>
        <button onClick={onSave} disabled={!dirty} className="px-3 py-1 text-xs bg-accent/20 text-accent rounded disabled:opacity-30">
          {dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <span className="font-mono font-bold text-xs text-blue-400 w-12">gRPC</span>
        <HighlightedField
          value={draft.protoPath}
          onChange={protoPath => update({ protoPath })}
          placeholder="/path/to/service.proto"
          className="flex-1"
        />
        <button
          onClick={onSend}
          disabled={!!isLoading}
          className="px-4 py-2 bg-accent text-bg-panel font-medium text-sm rounded hover:bg-accent/90 disabled:opacity-50">
          {isLoading ? 'Calling...' : 'Call'}
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col border-r border-bg-border">
          <div className="px-4 py-3 border-b border-bg-border grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Service</label>
              <input
                value={draft.service}
                onChange={e => update({ service: e.target.value })}
                placeholder="mypackage.MyService"
                className="w-full bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Method</label>
              <input
                value={draft.method}
                onChange={e => update({ method: e.target.value })}
                placeholder="MyMethod"
                className="w-full bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="px-4 py-2 border-b border-bg-border text-xs font-medium text-zinc-400">Request Message (JSON)</div>
          <div className="flex-1 p-4">
            <HighlightedTextarea
              value={draft.message}
              onChange={message => update({ message })}
              placeholder='{"field": "value"}'
              className="w-full h-full resize-none font-mono text-sm"
            />
          </div>

          <div className="border-t border-bg-border">
            <div className="flex text-xs border-b border-bg-border">
              {(['metadata', 'resilience'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-4 max-h-48 overflow-y-auto">
              {tab === 'metadata' && (
                <div className="space-y-2">
                  {draft.metadata.map((m, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <input value={m.key} onChange={e => {
                        const next = [...draft.metadata];
                        next[i] = { ...m, key: e.target.value };
                        update({ metadata: next });
                      }} placeholder="Key" className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1" />
                      <input value={m.value} onChange={e => {
                        const next = [...draft.metadata];
                        next[i] = { ...m, value: e.target.value };
                        update({ metadata: next });
                      }} placeholder="Value" className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1" />
                      <input type="checkbox" checked={m.enabled} onChange={e => {
                        const next = [...draft.metadata];
                        next[i] = { ...m, enabled: e.target.checked };
                        update({ metadata: next });
                      }} />
                      <button onClick={() => update({ metadata: draft.metadata.filter((_, j) => j !== i) })} className="text-red-400">×</button>
                    </div>
                  ))}
                  <button onClick={() => update({ metadata: [...draft.metadata, { key: '', value: '', enabled: true }] })} className="text-xs text-accent">+ Add metadata</button>
                </div>
              )}

              {tab === 'resilience' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-zinc-400 mb-1">Timeout (ms)</label>
                    <input type="number" value={draft.resilience.timeoutMs} onChange={e => update({ resilience: { ...draft.resilience, timeoutMs: parseInt(e.target.value) || 30000 } })} className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Max Attempts</label>
                    <input type="number" value={draft.resilience.maxAttempts} onChange={e => update({ resilience: { ...draft.resilience, maxAttempts: parseInt(e.target.value) || 1 } })} className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-bg-panel">
          <div className="px-4 py-2 border-b border-bg-border text-xs font-medium text-zinc-400">Response</div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
            {isLoading && <div className="text-zinc-500">Calling...</div>}
            {response && 'protocol' in response && response.protocol === 'grpc' && (
              <pre className="whitespace-pre-wrap">{JSON.stringify(response, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
