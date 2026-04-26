import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import type { WebSocketRequestDef } from '../types';
import { HighlightedField } from './Highlighted';
import { toCurl } from '../lib/curlExport';

export function WebSocketRequestView() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const activeRequestId = useStore(s => s.activeRequestId);
  const saveRequest = useStore(s => s.saveRequest);
  const response = activeRequestId ? useStore(s => s.responses[activeRequestId]) : null;

  const stored = useMemo(() => {
    const c = collections.find(c => c.id === activeCollectionId);
    const r = c?.requests.find(r => r.id === activeRequestId);
    return r?.protocol === 'websocket' ? r : null;
  }, [collections, activeCollectionId, activeRequestId]);

  const [draft, setDraft] = useState<WebSocketRequestDef | null>(stored ?? null);
  const [tab, setTab] = useState<'headers' | 'resilience'>('headers');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [sendText, setSendText] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => { setDraft(stored ?? null); }, [stored?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const dirty = useMemo(() =>
    draft && stored && JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored]);

  const update = (patch: Partial<WebSocketRequestDef>) => setDraft(d => d && ({ ...d, ...patch }));

  const copyCurl = async () => {
    if (!draft) return;
    const resolveVars = useStore.getState().resolveVars;
    const curlCmd = toCurl(draft, resolveVars());
    await navigator.clipboard.writeText(curlCmd);
    setToast({ kind: 'ok', msg: 'Copied wscat suggestion' });
  };

  if (!draft || !activeCollectionId) return null;

  const onSave = () => activeCollectionId && saveRequest(activeCollectionId, draft);

  const onConnect = async () => {
    if (connected) {
      // Disconnect
      await window.api.ws?.disconnect(draft.id);
      setConnected(false);
      setToast({ kind: 'ok', msg: 'Disconnected' });
    } else {
      // Connect
      const vars = useStore.getState().resolveVars();
      const result = await window.api.ws?.connect({ request: draft, vars });
      if (result?.ok) {
        setConnected(true);
        setToast({ kind: 'ok', msg: 'Connected' });
      } else {
        setToast({ kind: 'error', msg: result?.error || 'Connection failed' });
      }
    }
  };

  const onSend = async () => {
    if (!sendText.trim()) return;
    await window.api.ws?.send(draft.id, sendText);
    setSendText('');
  };

  const messages = response && 'protocol' in response && response.protocol === 'websocket' ? response.messages : [];

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
          Copy as wscat
        </button>
        <button onClick={onSave} disabled={!dirty} className="px-3 py-1 text-xs bg-accent/20 text-accent rounded disabled:opacity-30">
          {dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <span className="font-mono font-bold text-xs text-amber-400 w-12">WS</span>
        <HighlightedField
          value={draft.url}
          onChange={url => update({ url })}
          placeholder="ws://localhost:8080"
          className="flex-1"
        />
        <button
          onClick={onConnect}
          className={`px-4 py-2 font-medium text-sm rounded ${
            connected
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-accent text-bg-panel hover:bg-accent/90'
          }`}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col border-r border-bg-border">
          <div className="border-b border-bg-border">
            <div className="flex text-xs border-b border-bg-border">
              {(['headers', 'resilience'] as const).map(t => (
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

              {tab === 'resilience' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-zinc-400 mb-1">Connection Timeout (ms)</label>
                    <input type="number" value={draft.resilience.timeoutMs} onChange={e => update({ resilience: { ...draft.resilience, timeoutMs: parseInt(e.target.value) || 30000 } })} className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {connected && (
            <div className="border-t border-bg-border p-4">
              <div className="flex gap-2">
                <input
                  value={sendText}
                  onChange={e => setSendText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onSend()}
                  placeholder="Type message and press Enter..."
                  className="flex-1 bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm"
                />
                <button onClick={onSend} className="px-4 py-2 bg-accent text-bg-panel font-medium text-sm rounded hover:bg-accent/90">
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-bg-panel">
          <div className="px-4 py-2 border-b border-bg-border text-xs font-medium text-zinc-400">Messages</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
            {messages.length === 0 && (
              <div className="text-zinc-500">{connected ? 'No messages yet' : 'Connect to start receiving messages'}</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`p-2 rounded ${msg.direction === 'sent' ? 'bg-accent/10 text-accent' : 'bg-bg-elev text-zinc-300'}`}>
                <div className="text-[10px] text-zinc-500 mb-1">{msg.direction === 'sent' ? '→ Sent' : '← Received'} {new Date(msg.timestamp).toLocaleTimeString()}</div>
                <div>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
