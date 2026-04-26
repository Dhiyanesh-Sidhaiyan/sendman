import { IpcMain, WebContents } from 'electron';
import WebSocket from 'ws';
import type { WebSocketRequestDef } from './store';
import { substitute, VarMap } from './vars';

interface WsConnection {
  ws: WebSocket;
  request: WebSocketRequestDef;
}

const connections = new Map<string, WsConnection>();

export interface WsConnectInput {
  request: WebSocketRequestDef;
  vars: VarMap;
}

export function registerWebSocketHandlers(ipc: IpcMain, getMainWindow: () => WebContents | null) {
  ipc.handle('ws:connect', async (_e, input: WsConnectInput) => {
    const { request: req, vars } = input;

    try {
      const url = substitute(req.url, vars);

      // Build headers
      const headers: Record<string, string> = {};
      for (const h of req.headers) {
        if (!h.enabled || !h.key) continue;
        headers[substitute(h.key, vars)] = substitute(h.value, vars);
      }

      const timeout = req.resilience.timeoutMs > 0 ? req.resilience.timeoutMs : 30000;

      const ws = new WebSocket(url, {
        headers,
        handshakeTimeout: timeout
      });

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const connectTimeout = setTimeout(() => {
          ws.close();
          resolve({ ok: false, error: 'Connection timeout' });
        }, timeout);

        ws.on('open', () => {
          clearTimeout(connectTimeout);
          connections.set(req.id, { ws, request: req });
          resolve({ ok: true });
        });

        ws.on('error', (err) => {
          clearTimeout(connectTimeout);
          resolve({ ok: false, error: err.message });
        });

        ws.on('message', (data) => {
          const text = data.toString();
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.send('ws:message', { id: req.id, direction: 'received', text, timestamp: Date.now() });
          }
        });

        ws.on('close', () => {
          connections.delete(req.id);
        });
      });
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipc.handle('ws:disconnect', async (_e, id: string) => {
    const conn = connections.get(id);
    if (conn) {
      conn.ws.close();
      connections.delete(id);
    }
  });

  ipc.handle('ws:send', async (_e, id: string, text: string) => {
    const conn = connections.get(id);
    if (!conn) return;

    conn.ws.send(text);

    // Notify renderer of sent message
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.send('ws:message', { id, direction: 'sent', text, timestamp: Date.now() });
    }
  });
}
