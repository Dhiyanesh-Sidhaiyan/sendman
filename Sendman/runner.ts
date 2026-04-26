import { BrowserWindow, IpcMain } from 'electron';
import { execute } from './http';
import { mergeVars, VarMap } from './vars';
import { RequestDef } from './store';

export interface RunnerConfig {
  runId: string;
  requests: RequestDef[];
  rows: VarMap[];
  baseVars: VarMap;
  delayMs: number;
}

export function registerRunnerHandlers(ipc: IpcMain) {
  ipc.handle('runner:start', async (event, config: RunnerConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const send = (msg: unknown) => win?.webContents.send('runner:progress', msg);

    const totalIterations = Math.max(1, config.rows.length || 1);
    const rows = config.rows.length ? config.rows : [{}];
    let pass = 0, fail = 0;
    const startedAt = Date.now();

    send({ type: 'start', runId: config.runId, total: totalIterations * config.requests.length });

    outer: for (let i = 0; i < rows.length; i++) {
      for (const req of config.requests) {
        const vars = mergeVars(config.baseVars, rows[i]);
        const res = await execute({ request: req, vars });
        const ok = res.ok;
        if (ok) pass++; else fail++;
        const error = res.error ?? (!ok && res.protocol === 'http' && res.status > 0 ? `HTTP ${res.status}` : undefined);
        send({
          type: 'iteration',
          runId: config.runId,
          iteration: i,
          requestId: req.id,
          requestName: req.name,
          method: req.protocol === 'http' ? req.method : req.protocol.toUpperCase(),
          url: res.protocol === 'http' ? res.url : '',
          status: res.protocol === 'http' ? res.status : 0,
          ok,
          latencyMs: res.protocol === 'http' || res.protocol === 'graphql' ? res.latencyMs : 0,
          attempts: res.protocol === 'http' ? res.attempts : 1,
          error,
          requestHeaders: res.protocol === 'http' ? res.requestHeaders : undefined,
          requestBody: res.protocol === 'http' ? res.requestBody : undefined,
          responseHeaders: res.protocol === 'http' ? res.headers : undefined,
          responseBody: res.protocol === 'http' ? res.body : JSON.stringify(res)
        });
        if (config.delayMs > 0) await new Promise(r => setTimeout(r, config.delayMs));
        if ((global as any).__abort_runner === config.runId) break outer;
      }
    }

    const summary = {
      type: 'done' as const,
      runId: config.runId,
      pass, fail,
      totalMs: Date.now() - startedAt
    };
    send(summary);
    return summary;
  });
}
