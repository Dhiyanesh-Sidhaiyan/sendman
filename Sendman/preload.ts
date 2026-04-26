import { contextBridge, ipcRenderer } from 'electron';

const api = {
  store: {
    listCollections: () => ipcRenderer.invoke('store:listCollections'),
    readCollection: (id: string) => ipcRenderer.invoke('store:readCollection', id),
    saveCollection: (col: unknown) => ipcRenderer.invoke('store:saveCollection', col),
    deleteCollection: (id: string) => ipcRenderer.invoke('store:deleteCollection', id),
    saveRequest: (collectionId: string, req: unknown) =>
      ipcRenderer.invoke('store:saveRequest', collectionId, req),
    deleteRequest: (collectionId: string, requestId: string) =>
      ipcRenderer.invoke('store:deleteRequest', collectionId, requestId),
    listEnvironments: () => ipcRenderer.invoke('store:listEnvironments'),
    saveEnvironment: (env: unknown) => ipcRenderer.invoke('store:saveEnvironment', env),
    deleteEnvironment: (id: string) => ipcRenderer.invoke('store:deleteEnvironment', id),
    workspacePath: () => ipcRenderer.invoke('store:workspacePath')
  },
  http: {
    execute: (req: unknown) => ipcRenderer.invoke('http:execute', req)
  },
  runner: {
    start: (config: unknown) => ipcRenderer.invoke('runner:start', config),
    onProgress: (cb: (msg: unknown) => void) => {
      const listener = (_e: unknown, msg: unknown) => cb(msg);
      ipcRenderer.on('runner:progress', listener);
      return () => ipcRenderer.removeListener('runner:progress', listener);
    }
  },
  grpc: {
    execute: (req: unknown) => ipcRenderer.invoke('grpc:execute', req)
  },
  ws: {
    connect: (input: unknown) => ipcRenderer.invoke('ws:connect', input),
    disconnect: (id: string) => ipcRenderer.invoke('ws:disconnect', id),
    send: (id: string, text: string) => ipcRenderer.invoke('ws:send', id, text),
    onMessage: (cb: (data: { id: string; direction: 'sent' | 'received'; text: string; timestamp: number }) => void) => {
      const listener = (_e: unknown, data: any) => cb(data);
      ipcRenderer.on('ws:message', listener);
      return () => ipcRenderer.removeListener('ws:message', listener);
    }
  }
};

contextBridge.exposeInMainWorld('api', api);

export type ApiBridge = typeof api;
