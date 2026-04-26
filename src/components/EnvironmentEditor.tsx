import { useState } from 'react';
import { useStore } from '../store';
import { askConfirm, askPrompt } from './Dialog';

export function EnvironmentEditor() {
  const environments = useStore(s => s.environments);
  const newEnvironment = useStore(s => s.newEnvironment);
  const saveEnvironment = useStore(s => s.saveEnvironment);
  const deleteEnvironment = useStore(s => s.deleteEnvironment);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = environments.find(e => e.id === editingId);

  if (editing) {
    return <EnvForm env={editing} onClose={() => setEditingId(null)} onSave={saveEnvironment} />;
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-bg-border flex justify-between items-center">
        <span className="text-[11px] uppercase text-zinc-500 tracking-wider">Environments</span>
        <button
          onClick={async () => {
            const n = await askPrompt({ title: 'New environment', label: 'Name', defaultValue: 'Local' });
            if (n) await newEnvironment(n);
          }}
          className="text-xs text-accent hover:text-zinc-200">+ New</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {environments.length === 0 && (
          <div className="p-4 text-xs text-zinc-500">No environments. Create one to define <code className="text-accent">{'{{vars}}'}</code>.</div>
        )}
        {environments.map(e => (
          <div key={e.id} className="px-3 py-2 flex justify-between items-center hover:bg-bg-elev/50 border-b border-bg-border/60">
            <div onClick={() => setEditingId(e.id)} className="cursor-pointer flex-1">
              <div className="text-sm">{e.name}</div>
              <div className="text-[10px] text-zinc-500">{Object.keys(e.variables).length} vars</div>
            </div>
            <button
              onClick={async () => {
                const yes = await askConfirm({ title: `Delete "${e.name}"?`, confirmLabel: 'Delete', destructive: true });
                if (yes) await deleteEnvironment(e.id);
              }}
              className="text-zinc-500 hover:text-red-400 text-xs">×</button>
          </div>
        ))}
      </div>
    </>
  );
}

function EnvForm({ env, onClose, onSave }: {
  env: { id: string; name: string; variables: Record<string, string> };
  onClose: () => void;
  onSave: (e: { id: string; name: string; variables: Record<string, string> }) => Promise<void>;
}) {
  const [name, setName] = useState(env.name);
  const [rows, setRows] = useState<Array<[string, string]>>(
    Object.entries(env.variables).length ? Object.entries(env.variables) : [['', '']]
  );

  const update = (i: number, k: string, v: string) => {
    const next = [...rows]; next[i] = [k, v]; setRows(next);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-bg-border flex justify-between items-center">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200">← Back</button>
        <button
          onClick={async () => {
            const variables: Record<string, string> = {};
            for (const [k, v] of rows) if (k.trim()) variables[k.trim()] = v;
            await onSave({ ...env, name, variables });
            onClose();
          }}
          className="text-xs bg-accent hover:bg-accent-dim text-white px-2 py-1 rounded">Save</button>
      </div>
      <div className="p-3 space-y-2 overflow-y-auto">
        <input
          value={name} onChange={e => setName(e.target.value)}
          className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
        />
        <div className="space-y-1">
          {rows.map(([k, v], i) => (
            <div key={i} className="flex gap-1">
              <input value={k} onChange={e => update(i, e.target.value, v)} placeholder="key"
                className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
              <input value={v} onChange={e => update(i, k, e.target.value)} placeholder="value"
                className="flex-1 bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
              <button onClick={() => setRows(rows.filter((_, x) => x !== i))} className="text-zinc-500 hover:text-red-400 text-xs px-1">×</button>
            </div>
          ))}
          <button onClick={() => setRows([...rows, ['', '']])} className="text-xs text-accent hover:text-zinc-200">+ Add variable</button>
        </div>
      </div>
    </div>
  );
}
