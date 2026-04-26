import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { askPrompt } from './Dialog';

interface Props {
  name: string;
  anchor: { x: number; y: number };
  onClose: () => void;
}

export function VarPopover({ name, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const environments = useStore(s => s.environments);
  const collections = useStore(s => s.collections);
  const activeEnvId = useStore(s => s.activeEnvId);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const setActiveEnv = useStore(s => s.setActiveEnv);
  const saveEnvironment = useStore(s => s.saveEnvironment);
  const saveCollection = useStore(s => s.saveCollection);
  const newEnvironment = useStore(s => s.newEnvironment);

  const env = environments.find(e => e.id === activeEnvId);
  const collection = collections.find(c => c.id === activeCollectionId);

  const initialScope: 'env' | 'collection' = env ? 'env' : 'collection';
  const [scope, setScope] = useState<'env' | 'collection'>(initialScope);
  const [value, setValue] = useState<string>(
    env?.variables[name] ?? collection?.variables[name] ?? ''
  );

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const resolvedFrom: string =
    env && name in env.variables ? `Environment "${env.name}"`
    : collection && name in collection.variables ? `Collection "${collection.name}"`
    : 'Not defined';

  const save = async () => {
    if (scope === 'env') {
      let target = env;
      if (!target) {
        const envName = await askPrompt({ title: 'Create environment', label: 'Name', defaultValue: 'Local', confirmLabel: 'Create' });
        if (!envName) return;
        await newEnvironment(envName);
        target = useStore.getState().environments.find(e => e.name === envName);
        if (target) setActiveEnv(target.id);
      }
      if (target) {
        await saveEnvironment({ ...target, variables: { ...target.variables, [name]: value } });
      }
    } else {
      if (!collection) return;
      await saveCollection({ ...collection, variables: { ...collection.variables, [name]: value } });
    }
    onClose();
  };

  // Clamp position so popover stays on screen.
  const W = 320, H = 220;
  const x = Math.min(anchor.x, window.innerWidth - W - 12);
  const y = Math.min(anchor.y + 8, window.innerHeight - H - 12);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y, width: W }}
      className="fixed z-50 bg-bg-panel border border-bg-border rounded-lg shadow-2xl p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <code className="text-accent text-sm font-mono">{`{{${name}}}`}</code>
        <span className="flex-1" />
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xs">×</button>
      </div>
      <div className="text-[11px] text-zinc-500 mb-2">
        Currently: <span className={resolvedFrom === 'Not defined' ? 'text-method-delete' : 'text-method-get'}>{resolvedFrom}</span>
      </div>
      <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mb-1">Value</label>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent"
      />
      <label className="block text-[10px] uppercase text-zinc-500 tracking-wider mt-2 mb-1">Save to</label>
      <div className="flex gap-1 text-[11px]">
        <button
          onClick={() => setScope('env')}
          className={`flex-1 px-2 py-1 rounded ${scope === 'env' ? 'bg-accent text-white' : 'bg-bg-elev text-zinc-400 hover:text-zinc-200'}`}>
          {env ? `Env: ${env.name}` : 'New environment'}
        </button>
        <button
          onClick={() => setScope('collection')}
          disabled={!collection}
          className={`flex-1 px-2 py-1 rounded ${scope === 'collection' ? 'bg-accent text-white' : 'bg-bg-elev text-zinc-400 hover:text-zinc-200'} disabled:opacity-40`}>
          Collection
        </button>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
        <button onClick={save} className="px-3 py-1 text-xs bg-accent hover:bg-accent-dim text-white rounded">Save</button>
      </div>
    </div>
  );
}
