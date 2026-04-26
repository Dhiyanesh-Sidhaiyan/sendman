import { useState } from 'react';
import { useStore } from '../store';
import { EnvironmentEditor } from './EnvironmentEditor';
import { askConfirm, askPrompt } from './Dialog';
import type { RequestDef } from '../types';

export function Sidebar() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const activeRequestId = useStore(s => s.activeRequestId);
  const selectRequest = useStore(s => s.selectRequest);
  const selectCollection = useStore(s => s.selectCollection);
  const newCollection = useStore(s => s.newCollection);
  const newRequest = useStore(s => s.newRequest);
  const deleteCollection = useStore(s => s.deleteCollection);
  const deleteRequest = useStore(s => s.deleteRequest);
  const [tab, setTab] = useState<'cols' | 'envs'>('cols');

  const onNewCollection = async () => {
    const name = await askPrompt({ title: 'New collection', label: 'Name', defaultValue: 'My Collection', placeholder: 'e.g. Auth API' });
    if (name) await newCollection(name);
  };

  const onNewRequest = async (collectionId: string, protocol: 'http' | 'graphql' | 'grpc' | 'websocket' = 'http') => {
    const name = await askPrompt({ title: 'New request', label: 'Name', defaultValue: 'New Request' });
    if (name) await newRequest(collectionId, name, protocol);
  };

  const [showProtocolPicker, setShowProtocolPicker] = useState<string | null>(null);

  const onDeleteCollection = async (id: string, name: string) => {
    const yes = await askConfirm({ title: `Delete "${name}"?`, message: 'This deletes the collection and all its requests.', confirmLabel: 'Delete', destructive: true });
    if (yes) await deleteCollection(id);
  };

  const onDeleteRequest = async (collectionId: string, requestId: string, name: string) => {
    const yes = await askConfirm({ title: `Delete "${name}"?`, confirmLabel: 'Delete', destructive: true });
    if (yes) await deleteRequest(collectionId, requestId);
  };

  return (
    <aside className="w-72 bg-bg-panel border-r border-bg-border flex flex-col min-h-0">
      <div className="flex border-b border-bg-border text-xs">
        {(['cols', 'envs'] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t === 'cols' ? 'Collections' : 'Environments'}
          </button>
        ))}
      </div>

      {tab === 'cols' ? (
        <>
          <div className="px-3 py-2 border-b border-bg-border flex justify-between items-center">
            <span className="text-[11px] uppercase text-zinc-500 tracking-wider">Workspace</span>
            <button onClick={onNewCollection} className="text-xs text-accent hover:text-zinc-200">+ New</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {collections.length === 0 && (
              <div className="p-4 text-xs text-zinc-500">No collections yet. Click <span className="text-accent">+ New</span> to create one.</div>
            )}
            {collections.map(col => (
              <div key={col.id} className="border-b border-bg-border/60">
                <div
                  className={`px-3 py-2 flex justify-between items-center cursor-pointer ${activeCollectionId === col.id ? 'bg-bg-elev' : 'hover:bg-bg-elev/50'}`}
                  onClick={() => selectCollection(col.id)}
                >
                  <span className="text-sm font-medium truncate">{col.name}</span>
                  <div className="flex gap-1 text-[10px] relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowProtocolPicker(showProtocolPicker === col.id ? null : col.id); }}
                      className="text-zinc-500 hover:text-accent px-1">+</button>
                    {showProtocolPicker === col.id && (
                      <div className="absolute right-0 top-6 bg-bg-panel border border-bg-border rounded shadow-lg py-1 z-50 min-w-[100px]">
                        {[
                          { protocol: 'http' as const, label: 'HTTP', color: 'text-method-get' },
                          { protocol: 'graphql' as const, label: 'GraphQL', color: 'text-pink-400' },
                          { protocol: 'grpc' as const, label: 'gRPC', color: 'text-blue-400' },
                          { protocol: 'websocket' as const, label: 'WebSocket', color: 'text-amber-400' }
                        ].map(({ protocol, label, color }) => (
                          <button
                            key={protocol}
                            onClick={(e) => { e.stopPropagation(); setShowProtocolPicker(null); onNewRequest(col.id, protocol); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-elev ${color}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteCollection(col.id, col.name); }}
                      className="text-zinc-500 hover:text-red-400 px-1">×</button>
                  </div>
                </div>
                {activeCollectionId === col.id && col.requests.map(r => (
                  <div
                    key={r.id}
                    onClick={() => selectRequest(col.id, r.id)}
                    className={`pl-6 pr-3 py-1.5 flex items-center gap-2 cursor-pointer text-xs group ${activeRequestId === r.id ? 'bg-accent/15 text-zinc-200' : 'text-zinc-400 hover:bg-bg-elev/40 hover:text-zinc-200'}`}
                  >
                    <ProtocolBadge request={r} />
                    <span className="flex-1 truncate">{r.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteRequest(col.id, r.id, r.name); }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400">×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <EnvironmentEditor />
      )}
    </aside>
  );
}

export function ProtocolBadge({ request }: { request: RequestDef }) {
  // Handle legacy requests without protocol field (default to http)
  const protocol = request.protocol || 'http';

  const badges: Record<string, { text: string; color: string }> = {
    http: { text: protocol === 'http' && 'method' in request ? request.method.toUpperCase() : 'HTTP', color: 'text-method-get' },
    graphql: { text: 'GQL', color: 'text-pink-400' },
    grpc: { text: 'gRPC', color: 'text-blue-400' },
    websocket: { text: 'WS', color: 'text-amber-400' }
  };
  const badge = badges[protocol] || { text: protocol.toUpperCase(), color: 'text-zinc-400' };
  return <span className={`font-mono font-bold text-[10px] w-10 ${badge.color}`}>{badge.text}</span>;
}
