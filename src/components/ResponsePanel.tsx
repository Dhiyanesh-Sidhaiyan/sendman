import { useState } from 'react';
import type { ExecuteResult } from '../types';
import { beautifyXml } from '../lib/beautify';

export function ResponsePanel({ response }: { response: ExecuteResult | { loading: true } | undefined }) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');

  if (!response) {
    return <div className="overflow-y-auto p-4 text-xs text-zinc-500">Send a request to see the response.</div>;
  }
  if ('loading' in response) {
    return <div className="overflow-y-auto p-4 text-xs text-zinc-500">Sending…</div>;
  }

  if (response.protocol !== 'http') {
    return (
      <div className="overflow-y-auto p-4 font-mono text-xs">
        <pre className="whitespace-pre-wrap">{JSON.stringify(response, null, 2)}</pre>
      </div>
    );
  }

  const isError = response.status === 0;
  const statusColor = response.ok ? 'text-method-get' : isError ? 'text-method-delete' : 'text-method-delete';
  const pretty = formatBody(response.body, response.headers['content-type'] ?? response.headers['Content-Type'] ?? '');

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 py-2 border-b border-bg-border flex items-center gap-4 text-xs">
        <span className={`font-mono font-bold ${statusColor}`}>
          {isError ? 'ERR' : response.status}
        </span>
        {!isError && <span className="text-zinc-500">{response.latencyMs} ms</span>}
        {!isError && <span className="text-zinc-500">{formatBytes(response.bodyBytes)}</span>}
        {response.attempts > 1 && <span className="text-yellow-500">{response.attempts} attempts</span>}
        <div className="flex-1" />
        {!isError && (['body', 'headers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`capitalize ${tab === t ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}{t === 'headers' ? ` (${Object.keys(response.headers).length})` : ''}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorBlock kind={response.statusText} reason={response.error ?? 'Unknown error'} latencyMs={response.latencyMs} attempts={response.attempts} url={response.url} />
      ) : (
        <div className="flex-1 overflow-auto bg-bg-panel">
          {tab === 'body' ? (
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all text-zinc-300">{pretty}</pre>
          ) : (
            <table className="w-full text-xs font-mono">
              <tbody>
                {Object.entries(response.headers).map(([k, v]) => (
                  <tr key={k} className="border-b border-bg-border/50">
                    <td className="px-4 py-1 text-accent align-top">{k}</td>
                    <td className="px-4 py-1 text-zinc-300 break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ kind, reason, latencyMs, attempts, url }: {
  kind: string; reason: string; latencyMs: number; attempts: number; url: string;
}) {
  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="border border-method-delete/40 bg-method-delete/5 rounded-md p-4 max-w-3xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-method-delete text-xs font-bold uppercase tracking-wider">{kind || 'Error'}</span>
          <span className="text-zinc-500 text-[11px]">after {latencyMs} ms · {attempts} attempt{attempts > 1 ? 's' : ''}</span>
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">{reason}</p>
        <div className="mt-3 pt-3 border-t border-method-delete/20">
          <div className="text-[10px] uppercase text-zinc-500 tracking-wider mb-1">Request URL</div>
          <code className="text-xs text-zinc-400 break-all">{url}</code>
        </div>
      </div>
    </div>
  );
}

function formatBody(body: string, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('json')) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  }
  if (ct.includes('xml')) {
    const r = beautifyXml(body);
    return r.ok ? r.text : body;
  }
  return body;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
