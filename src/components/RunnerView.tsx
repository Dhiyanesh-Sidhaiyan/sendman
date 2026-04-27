import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useStore } from '../store';
import type { IterationEvent, RunDoneEvent, RunEvent } from '../types';
import { askConfirm } from './Dialog';
import { beautifyJson, beautifyXml } from '../lib/beautify';

function prettify(body: string, headers?: Record<string, string>): string {
  if (!body) return '';
  const ct = (headers?.['content-type'] ?? headers?.['Content-Type'] ?? '').toLowerCase();
  if (ct.includes('json') || (body.trim().startsWith('{') || body.trim().startsWith('['))) {
    const r = beautifyJson(body);
    if (r.ok) return r.text;
  }
  if (ct.includes('xml') || body.trim().startsWith('<')) {
    const r = beautifyXml(body);
    if (r.ok) return r.text;
  }
  return body;
}

interface BodyPanelProps {
  label: string;
  headers?: Record<string, string>;
  body?: string;
  method?: string;
  url?: string;
  status?: number;
}

function BodyPanel({ label, headers, body, method, url, status }: BodyPanelProps) {
  if (!body && !headers) return null;
  const pretty = body ? prettify(body, headers) : '';
  const headerEntries = headers ? Object.entries(headers) : [];
  return (
    <div className="border border-bg-border rounded">
      <div className="px-3 py-1.5 bg-bg-elev/60 border-b border-bg-border flex items-center justify-between text-[11px] uppercase text-zinc-500 tracking-wider">
        <span>{label}</span>
        <span className="font-mono normal-case text-zinc-400 truncate max-w-[60%]">
          {method && <span className="text-accent mr-2">{method}</span>}
          {url}
          {status !== undefined && status > 0 && <span className="ml-2 text-zinc-300">{status}</span>}
        </span>
      </div>
      {headerEntries.length > 0 && (
        <details className="border-b border-bg-border">
          <summary className="px-3 py-1 text-[11px] text-zinc-500 cursor-pointer select-none hover:text-zinc-300">
            Headers ({headerEntries.length})
          </summary>
          <div className="px-3 py-2 font-mono text-[11px] text-zinc-300 space-y-0.5 max-h-40 overflow-auto">
            {headerEntries.map(([k, v]) => (
              <div key={k}><span className="text-zinc-500">{k}:</span> {v}</div>
            ))}
          </div>
        </details>
      )}
      {body ? (
        <pre className="px-3 py-2 text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-all max-h-96 overflow-auto">{pretty}</pre>
      ) : (
        <div className="px-3 py-2 text-[11px] text-zinc-500 italic">(empty body)</div>
      )}
    </div>
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);

interface ParsedCsv {
  rows: Record<string, string>[];
  headers: string[];
  errors: string[];
}

function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h: string) => h.trim()
  });
  const errors = result.errors.map(e => `Row ${e.row ?? '?'}: ${e.message}`);
  const cleaned: Record<string, string>[] = [];
  for (const r of result.data) {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === '__parsed_extra' || k === '') continue;
      row[k] = v == null ? '' : String(v);
    }
    if (Object.keys(row).length) cleaned.push(row);
  }
  const headers = (result.meta.fields ?? [])
    .map(h => h.trim())
    .filter(h => h && h !== '__parsed_extra');
  return { rows: cleaned, headers, errors };
}

export function RunnerView() {
  const collections = useStore(s => s.collections);
  const activeCollectionId = useStore(s => s.activeCollectionId);
  const selectCollection = useStore(s => s.selectCollection);
  const resolveVars = useStore(s => s.resolveVars);

  const collection = collections.find(c => c.id === activeCollectionId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csv, setCsv] = useState<ParsedCsv>({ rows: [], headers: [], errors: [] });
  const [csvName, setCsvName] = useState<string>('');
  const [delayMs, setDelayMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [iterations, setIterations] = useState<IterationEvent[]>([]);
  const [summary, setSummary] = useState<RunDoneEvent | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(400); // pixels
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const retry = async (idx: number) => {
    if (!collection) return;
    const it = iterations[idx];
    const req = collection.requests.find(r => r.id === it.requestId);
    if (!req) return;
    setRetrying(idx);
    try {
      const rowVars = csv.rows[it.iteration] ?? {};
      const vars = { ...resolveVars(), ...rowVars };
      const res = await window.api.http.execute({ request: req, vars });
      const ok = res.ok;
      const error = res.error ?? (!ok && res.protocol === 'http' && res.status > 0 ? `HTTP ${res.status}` : undefined);
      setIterations(prev => prev.map((p, i) => i === idx ? {
        ...p,
        status: res.protocol === 'http' ? res.status : 0,
        ok,
        latencyMs: res.protocol !== 'websocket' ? res.latencyMs : 0,
        attempts: res.protocol === 'http' ? res.attempts : 1,
        error,
        requestHeaders: res.protocol === 'http' ? res.requestHeaders : undefined,
        requestBody: res.protocol === 'http' ? res.requestBody : undefined,
        responseHeaders: res.protocol === 'http' ? res.headers : undefined,
        responseBody: res.protocol === 'http' ? res.body : JSON.stringify(res)
      } : p));
    } finally {
      setRetrying(null);
    }
  };

  useEffect(() => { setSelected(new Set(collection?.requests.map(r => r.id) ?? [])); }, [collection?.id]);

  // Sidebar resizer
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setSidebarWidth(Math.max(300, Math.min(700, newWidth)));
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const onFile = async (file: File) => {
    setCsvName(file.name);
    const text = await file.text();
    setCsv(parseCsv(text));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const start = async () => {
    if (!collection) return;
    const requests = collection.requests.filter(r => selected.has(r.id));
    if (!requests.length) {
      await askConfirm({ title: 'No requests selected', message: 'Pick at least one request to run.', confirmLabel: 'OK' });
      return;
    }

    setIterations([]);
    setSummary(null);
    setExpanded(null);
    setRunning(true);

    // Safety timeout: auto-reset running state after 10 minutes
    const safetyTimeout = setTimeout(() => {
      console.warn('[runner] safety timeout triggered - resetting running state');
      setRunning(false);
    }, 600000); // 10 minutes

    const runId = uid();
    let completedViaEvent = false;

    const off = window.api.runner.onProgress((msg: RunEvent) => {
      if (msg.runId !== runId) return;
      if (msg.type === 'iteration') {
        setIterations(prev => [...prev, msg]);
      } else if (msg.type === 'done') {
        setSummary(msg);
        setRunning(false);
        completedViaEvent = true;
      }
    });

    try {
      await window.api.runner.start({
        runId, requests, rows: csv.rows, baseVars: resolveVars(), delayMs
      });
    } catch (err) {
      console.error('[runner] execution failed:', err);
    } finally {
      clearTimeout(safetyTimeout);
      off();
      // Ensure running is false even if 'done' event was missed
      if (!completedViaEvent) {
        console.warn('[runner] completed without done event');
        setRunning(false);
      }
    }
  };

  if (!collection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm gap-3">
        <div>Pick a collection from the sidebar to start a run.</div>
        {collections.length > 0 && (
          <select
            onChange={e => selectCollection(e.target.value)} defaultValue=""
            className="bg-bg-elev border border-bg-border rounded px-3 py-2 text-sm"
          >
            <option value="" disabled>— choose collection —</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
    );
  }

  const passCount = iterations.filter(i => i.ok).length;
  const failCount = iterations.length - passCount;

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0">
      <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0 flex flex-col min-h-0 overflow-y-auto border-r border-bg-border bg-bg-panel">
        <div className="px-4 py-3 border-b border-bg-border">
          <div className="text-[11px] uppercase text-zinc-500 tracking-wider mb-1">Collection</div>
          <div className="text-sm font-medium">{collection.name}</div>
        </div>

        <div className="px-4 py-3 border-b border-bg-border">
          <div className="text-[11px] uppercase text-zinc-500 tracking-wider mb-2">Requests</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {collection.requests.length === 0 && <div className="text-xs text-zinc-500">No requests in collection.</div>}
            {collection.requests.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-bg-elev/40 px-1 py-0.5 rounded">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-accent" />
                <span className="font-mono font-bold text-[10px] w-10 text-zinc-400">{r.protocol === 'http' ? r.method : r.protocol.toUpperCase()}</span>
                <span className="truncate">{r.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-bg-border">
          <div className="text-[11px] uppercase text-zinc-500 tracking-wider mb-2">CSV Data</div>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files && onFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full text-xs bg-bg-elev hover:bg-bg-border border border-bg-border rounded px-3 py-2">
            {csvName || 'Choose CSV file…'}
          </button>

          {csv.headers.length > 0 && (
            <div className="text-[11px] text-zinc-500 mt-2">
              {csv.rows.length} rows × {csv.headers.length} columns
            </div>
          )}
          {csv.errors.length > 0 && (
            <div className="mt-2 border border-yellow-600/40 bg-yellow-600/5 rounded p-2 text-[11px] text-yellow-400">
              <div className="font-semibold mb-1">CSV parse warnings</div>
              {csv.errors.slice(0, 3).map((e, i) => <div key={i}>• {e}</div>)}
              {csv.errors.length > 3 && <div className="text-zinc-500">+ {csv.errors.length - 3} more</div>}
            </div>
          )}
          {csvName && csv.rows.length === 0 && csv.errors.length === 0 && (
            <div className="text-[11px] text-zinc-500 mt-2">No rows parsed.</div>
          )}
          <div className="text-[11px] text-zinc-500 mt-2">Optional. Without CSV, runs once per selected request.</div>
        </div>

        {csv.rows.length > 0 && (
          <div className="px-4 py-3 border-b border-bg-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase text-zinc-500 tracking-wider">Preview (first 5 rows)</div>
              <button
                onClick={() => setPreviewOpen(true)}
                className="text-[11px] text-accent hover:text-accent-dim"
              >Expand ({csv.rows.length} × {csv.headers.length}) ↗</button>
            </div>
            <div className="overflow-x-auto rounded border border-bg-border">
              <table className="text-[11px] font-mono w-full">
                <thead className="bg-bg-elev">
                  <tr>
                    <th className="px-2 py-1 text-left text-zinc-500 font-normal">#</th>
                    {csv.headers.map(h => (
                      <th key={h} className="px-2 py-1 text-left text-accent font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csv.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-bg-border/50">
                      <td className="px-2 py-1 text-zinc-500">{i + 1}</td>
                      {csv.headers.map(h => (
                        <td key={h} className="px-2 py-1 text-zinc-300 max-w-[140px] truncate" title={r[h] ?? ''}>
                          {r[h] ?? <span className="text-zinc-600">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csv.rows.length > 5 && (
              <button onClick={() => setPreviewOpen(true)} className="text-[11px] text-zinc-500 mt-1 hover:text-zinc-300">
                + {csv.rows.length - 5} more rows — click to view all
              </button>
            )}
          </div>
        )}

        <div className="px-4 py-3 border-b border-bg-border space-y-2">
          <label className="block text-[11px] uppercase text-zinc-500 tracking-wider">Delay between iterations (ms)</label>
          <input type="number" value={delayMs} onChange={e => setDelayMs(+e.target.value)}
            className="w-full bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent" />
        </div>

        <div className="px-4 py-3">
          <button onClick={start} disabled={running}
            className="w-full bg-accent hover:bg-accent-dim text-white text-sm font-medium py-2 rounded disabled:opacity-50">
            {running ? 'Running…' : `Run ${selected.size} request(s) × ${csv.rows.length || 1} iteration(s)`}
          </button>
        </div>
      </div>
      <div
        onMouseDown={() => setIsDragging(true)}
        className="w-1 bg-bg-border hover:bg-accent cursor-col-resize flex-shrink-0"
      />
      <div className="flex-1 flex flex-col min-h-0 bg-bg">
        <div className="px-4 py-3 border-b border-bg-border flex items-center gap-4 text-xs flex-wrap">
          <span className="text-method-get">{passCount} pass</span>
          <span className="text-method-delete">{failCount} fail</span>
          {summary && <span className="text-zinc-500">total {summary.totalMs} ms</span>}
          <span className="flex-1" />
          <span className="text-zinc-500" title="Auto-retry: network errors and statuses in the request's retry list (default 429/502/503/504), with exponential backoff + jitter, capped at 30s, up to maxAttempts.">
            ⓘ retry policy
          </span>
          {failCount > 0 && (
            <button
              onClick={async () => {
                const failedIdx = iterations.map((it, i) => it.ok ? -1 : i).filter(i => i >= 0);
                for (const i of failedIdx) await retry(i);
              }}
              disabled={retrying !== null || running}
              className="text-xs px-2 py-1 rounded bg-bg-elev hover:bg-bg-border text-zinc-300 disabled:opacity-40"
            >↻ Retry all failed</button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-panel border-b border-bg-border z-10">
                <tr className="text-left text-zinc-500">
                  <th className="px-3 py-2 w-10 text-center"></th>
                  <th className="px-3 py-2 w-16">#</th>
                  <th className="px-3 py-2 min-w-[200px] max-w-[300px]">Request</th>
                  <th className="px-3 py-2 min-w-[250px] max-w-[400px]">URL</th>
                  <th className="px-3 py-2 w-20">Status</th>
                  <th className="px-3 py-2 w-28">Latency</th>
                  <th className="px-3 py-2 w-24">Attempts</th>
                  <th className="px-3 py-2 min-w-[200px]">Error</th>
                  <th className="px-3 py-2 w-28"></th>
                </tr>
              </thead>
            <tbody className="font-mono">
              {iterations.map((it, idx) => {
                const isOpen = expanded === idx;
                const expandable = !it.ok || !!it.requestBody || !!it.responseBody;
                return (
                  <>
                    <tr
                      key={idx}
                      onClick={() => expandable && setExpanded(isOpen ? null : idx)}
                      className={`border-b border-bg-border/40 hover:bg-bg-elev/30 ${expandable ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-1.5 text-zinc-500 text-center">
                        {expandable ? (isOpen ? '▾' : '▸') : ''}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-500">{it.iteration + 1}</td>
                      <td className="px-3 py-1.5 truncate" title={`${it.method} ${it.requestName}`}>
                        <span className="text-zinc-400 mr-2">{it.method}</span>
                        <span className="text-zinc-200">{it.requestName}</span>
                      </td>
                      <td className="px-3 py-1.5 text-zinc-500 truncate" title={it.url}>{it.url}</td>
                      <td className={`px-3 py-1.5 font-bold ${it.ok ? 'text-method-get' : 'text-method-delete'}`}>{it.status || 'ERR'}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{it.latencyMs} ms</td>
                      <td className="px-3 py-1.5 text-zinc-400">{it.attempts}</td>
                      <td className="px-3 py-1.5 text-method-delete truncate" title={it.error ?? ''}>
                        {it.error ?? ''}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); retry(idx); }}
                          disabled={retrying !== null || running}
                          title="Re-run this iteration with the same row vars"
                          className="text-[11px] px-2 py-0.5 rounded bg-bg-elev hover:bg-bg-border text-zinc-300 disabled:opacity-40"
                        >
                          {retrying === idx ? '…' : '↻ Retry'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className={`${it.ok ? 'bg-bg-elev/30' : 'bg-method-delete/5'} border-b border-bg-border/40`}>
                        <td colSpan={9} className="px-3 py-3 space-y-3">
                          {it.error && (
                            <div>
                              <div className="text-[11px] uppercase text-method-delete tracking-wider mb-1">Failure reason</div>
                              <p className="text-sm text-zinc-200 font-sans leading-relaxed">{it.error}</p>
                            </div>
                          )}
                          <BodyPanel label="Request body" headers={it.requestHeaders} body={it.requestBody} method={it.method} url={it.url} />
                          <BodyPanel label="Response body" headers={it.responseHeaders} body={it.responseBody} status={it.status} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {iterations.length === 0 && !running && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="text-zinc-500 text-sm mb-2">No results yet</div>
                    <div className="text-zinc-600 text-xs">Click "Run" button to execute selected requests</div>
                  </td>
                </tr>
              )}
              {running && iterations.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="text-accent text-sm mb-2">Running...</div>
                    <div className="text-zinc-500 text-xs">Executing requests, results will appear here</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      {previewOpen && (
        <DataPreviewModal
          name={csvName}
          headers={csv.headers}
          rows={csv.rows}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

interface DataPreviewModalProps {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  onClose: () => void;
}

function DataPreviewModal({ name, headers, rows, onClose }: DataPreviewModalProps) {
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  const filtered = f
    ? rows.filter(r => headers.some(h => (r[h] ?? '').toLowerCase().includes(f)))
    : rows;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-bg-panel border border-bg-border rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[85vh] flex flex-col"
      >
        <div className="px-4 py-3 border-b border-bg-border flex items-center gap-3">
          <div>
            <div className="text-sm font-medium">{name || 'CSV preview'}</div>
            <div className="text-[11px] text-zinc-500">{rows.length} rows · {headers.length} columns</div>
          </div>
          <span className="flex-1" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter rows…"
            className="bg-bg-elev border border-bg-border rounded px-2 py-1 text-xs w-48 focus:outline-none focus:border-accent"
          />
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="text-[11px] font-mono w-full">
            <thead className="bg-bg-elev sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left text-zinc-500 font-normal sticky left-0 bg-bg-elev">#</th>
                {headers.map(h => (
                  <th key={h} className="px-2 py-1.5 text-left text-accent font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-bg-border/50 hover:bg-bg-elev/40">
                  <td className="px-2 py-1 text-zinc-500 sticky left-0 bg-bg-panel">{rows.indexOf(r) + 1}</td>
                  {headers.map(h => (
                    <td key={h} className="px-2 py-1 text-zinc-300 whitespace-nowrap" title={r[h] ?? ''}>
                      {r[h] || <span className="text-zinc-600">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={headers.length + 1} className="px-2 py-8 text-center text-zinc-500">No rows match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-bg-border text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Showing {filtered.length} of {rows.length}</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
