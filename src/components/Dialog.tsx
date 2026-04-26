import { create } from 'zustand';
import { useEffect, useRef, useState } from 'react';

interface PromptOpts {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

type Pending =
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | null;

interface DialogState {
  pending: Pending;
  show: (p: NonNullable<Pending>) => void;
  close: () => void;
}

const useDialog = create<DialogState>((set) => ({
  pending: null,
  show: (p) => set({ pending: p }),
  close: () => set({ pending: null })
}));

export function askPrompt(opts: PromptOpts): Promise<string | null> {
  return new Promise(resolve => useDialog.getState().show({ kind: 'prompt', opts, resolve }));
}

export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise(resolve => useDialog.getState().show({ kind: 'confirm', opts, resolve }));
}

export function DialogHost() {
  const pending = useDialog(s => s.pending);
  const close = useDialog(s => s.close);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (pending?.kind === 'prompt') {
      setValue(pending.opts.defaultValue ?? '');
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [pending]);

  if (!pending) return null;

  const submit = () => {
    if (pending.kind === 'prompt') {
      const v = value.trim();
      pending.resolve(v ? v : null);
    } else {
      pending.resolve(true);
    }
    close();
  };

  const cancel = () => {
    if (pending.kind === 'prompt') pending.resolve(null);
    else pending.resolve(false);
    close();
  };

  const isDestructive = pending.opts.destructive;
  const confirmLabel = pending.opts.confirmLabel ?? (pending.kind === 'prompt' ? 'Create' : 'Confirm');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={cancel}>
      <div
        className="bg-bg-panel border border-bg-border rounded-lg shadow-2xl w-[420px] p-5"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">{pending.opts.title}</h3>

        {pending.kind === 'prompt' ? (
          <>
            {pending.opts.label && <label className="block text-[11px] uppercase text-zinc-500 tracking-wider mb-1">{pending.opts.label}</label>}
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                else if (e.key === 'Escape') cancel();
              }}
              placeholder={pending.opts.placeholder}
              className="w-full bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </>
        ) : (
          <p className="text-sm text-zinc-400">{pending.opts.message}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={cancel}
            className="px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-200 rounded">
            Cancel
          </button>
          <button
            onClick={submit}
            className={`px-4 py-1.5 text-xs text-white rounded font-medium ${
              isDestructive ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-accent-dim'
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
