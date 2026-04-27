import { useRef, useState } from 'react';
import { useStore } from '../store';
import { VAR_RE } from '../lib/vars';
import { VarPopover } from './VarPopover';

function tokenize(text: string): Array<{ type: 'text' | 'var'; value: string; name?: string }> {
  const out: Array<{ type: 'text' | 'var'; value: string; name?: string }> = [];
  const re = new RegExp(VAR_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'var', value: m[0], name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

interface VarBadgeProps {
  name: string;
  raw: string;
  onClick: (e: React.MouseEvent) => void;
}

function VarBadge({ name, raw, onClick }: VarBadgeProps) {
  const vars = useStore(s => s.resolveVars)();
  const resolved = name in vars;
  const value = vars[name];
  const cls = resolved
    ? 'text-method-get bg-method-get/10 hover:bg-method-get/20 border-method-get/30'
    : 'text-method-delete bg-method-delete/10 hover:bg-method-delete/20 border-method-delete/30';
  return (
    <span
      onClick={onClick}
      title={resolved ? `${name} = ${value}` : `${name} is not defined — click to set`}
      className={`cursor-pointer rounded px-0.5 border pointer-events-auto ${cls}`}
    >{raw}</span>
  );
}

export function HighlightedOverlay({ value, className }: { value: string; className?: string }) {
  const [popover, setPopover] = useState<{ name: string; x: number; y: number } | null>(null);
  const tokens = tokenize(value);
  return (
    <>
      <div className={className}>
        {tokens.map((t, i) => t.type === 'text'
          ? <span key={i}>{t.value}</span>
          : <VarBadge
              key={i}
              name={t.name!}
              raw={t.value}
              onClick={(e) => { e.stopPropagation(); setPopover({ name: t.name!, x: e.clientX, y: e.clientY }); }} />
        )}
      </div>
      {popover && <VarPopover name={popover.name} anchor={{ x: popover.x, y: popover.y }} onClose={() => setPopover(null)} />}
    </>
  );
}

interface HighlightedFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onPaste?: (text: string) => boolean;
}

export function HighlightedField({ value, onChange, placeholder, className, onPaste }: HighlightedFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onPaste={e => {
          if (!onPaste) return;
          const text = e.clipboardData.getData('text/plain');
          if (onPaste(text)) e.preventDefault();
        }}
        className={`w-full bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent ${focused || !value ? '' : 'text-transparent caret-zinc-200'}`}
      />
      {!focused && value && (
        <div
          className="absolute inset-0 px-3 py-2 text-sm font-mono pointer-events-none flex items-center"
          aria-hidden
        >
          <div className="whitespace-pre overflow-hidden">
            <HighlightedOverlay value={value} />
          </div>
        </div>
      )}
    </div>
  );
}

interface HighlightedTextareaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export function HighlightedTextarea({ value, onChange, placeholder, className }: HighlightedTextareaProps) {
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    if (!taRef.current || !overlayRef.current) return;
    overlayRef.current.scrollTop = taRef.current.scrollTop;
    overlayRef.current.scrollLeft = taRef.current.scrollLeft;
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onScroll={onScroll}
        spellCheck={false}
        placeholder={placeholder}
        className={`w-full h-full bg-bg-elev border border-bg-border rounded p-2 text-xs font-mono focus:outline-none focus:border-accent resize-none ${focused || !value ? '' : 'text-transparent caret-zinc-200'} ${className ?? ''}`}
      />
      {!focused && value && (
        <div
          ref={overlayRef}
          className="absolute inset-0 p-2 text-xs font-mono pointer-events-none overflow-auto whitespace-pre-wrap break-all"
          aria-hidden
        >
          <HighlightedOverlay value={value} />
        </div>
      )}
    </div>
  );
}
