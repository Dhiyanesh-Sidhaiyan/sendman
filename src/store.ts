import { create } from 'zustand';
import type { Collection, Environment, ExecuteResult, RequestDef } from './types';

export type View = 'request' | 'runner';
export type ThemeMode = 'auto' | 'light' | 'dark';

const THEME_KEY = 'sendman.theme';

export const readStoredTheme = (): ThemeMode => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {}
  return 'auto';
};

export const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
};

export const applyTheme = (mode: ThemeMode) => {
  document.documentElement.dataset.theme = resolveTheme(mode);
};

interface State {
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  activeCollectionId: string | null;
  activeRequestId: string | null;
  view: View;
  responses: Record<string, ExecuteResult | { loading: true }>;
  theme: ThemeMode;

  load: () => Promise<void>;
  setView: (v: View) => void;
  setTheme: (t: ThemeMode) => void;
  selectRequest: (collectionId: string, requestId: string) => void;
  selectCollection: (collectionId: string) => void;
  setActiveEnv: (id: string | null) => void;

  newCollection: (name: string) => Promise<void>;
  saveCollection: (c: Collection) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  newRequest: (collectionId: string, name: string, protocol?: 'http' | 'graphql' | 'grpc' | 'websocket') => Promise<void>;
  saveRequest: (collectionId: string, r: RequestDef) => Promise<void>;
  deleteRequest: (collectionId: string, requestId: string) => Promise<void>;

  newEnvironment: (name: string) => Promise<void>;
  saveEnvironment: (e: Environment) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;

  executeRequest: (req: RequestDef) => Promise<void>;
  resolveVars: () => Record<string, string>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const blankRequest = (name = 'New Request', protocol: 'http' | 'graphql' | 'grpc' | 'websocket' = 'http'): RequestDef => {
  const baseResilience = { timeoutMs: 30000, maxAttempts: 1, retryStatuses: [429, 502, 503, 504] };

  switch (protocol) {
    case 'http':
      return {
        id: uid(),
        name,
        protocol: 'http',
        method: 'GET',
        url: 'https://httpbin.org/get',
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        auth: { type: 'none' },
        resilience: baseResilience
      };
    case 'graphql':
      return {
        id: uid(),
        name,
        protocol: 'graphql',
        url: 'https://api.example.com/graphql',
        query: 'query {\n  \n}',
        variables: '{}',
        headers: [],
        auth: { type: 'none' },
        resilience: baseResilience
      };
    case 'grpc':
      return {
        id: uid(),
        name,
        protocol: 'grpc',
        protoPath: '',
        service: '',
        method: '',
        message: '{}',
        metadata: [],
        resilience: baseResilience
      };
    case 'websocket':
      return {
        id: uid(),
        name,
        protocol: 'websocket',
        url: 'ws://localhost:8080',
        headers: [],
        resilience: baseResilience
      };
  }
};

export const useStore = create<State>((set, get) => ({
  collections: [],
  environments: [],
  activeEnvId: null,
  activeCollectionId: null,
  activeRequestId: null,
  view: 'request',
  responses: {},
  theme: readStoredTheme(),

  setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    applyTheme(t);
    set({ theme: t });
  },

  async load() {
    const [collections, environments] = await Promise.all([
      window.api.store.listCollections(),
      window.api.store.listEnvironments()
    ]);

    // Migrate old requests without protocol field
    const migratedCollections = collections.map(col => ({
      ...col,
      requests: col.requests.map((req: any) => {
        if (!req.protocol) {
          // Old HTTP request - add protocol field
          return { ...req, protocol: 'http' } as RequestDef;
        }
        return req;
      })
    }));

    set({ collections: migratedCollections, environments });
    if (!get().activeCollectionId && migratedCollections.length) {
      const c = migratedCollections[0];
      set({ activeCollectionId: c.id, activeRequestId: c.requests[0]?.id ?? null });
    }
  },

  setView: (v) => set({ view: v }),
  selectRequest: (collectionId, requestId) =>
    set({ activeCollectionId: collectionId, activeRequestId: requestId, view: 'request' }),
  selectCollection: (collectionId) => set({ activeCollectionId: collectionId }),
  setActiveEnv: (id) => set({ activeEnvId: id }),

  async newCollection(name) {
    const c: Collection = { id: uid(), name, variables: {}, requests: [] };
    await window.api.store.saveCollection(c);
    await get().load();
    set({ activeCollectionId: c.id, activeRequestId: null });
  },

  async saveCollection(c) {
    await window.api.store.saveCollection(c);
    set(state => ({
      collections: state.collections.map(x => x.id === c.id ? c : x)
    }));
  },

  async deleteCollection(id) {
    await window.api.store.deleteCollection(id);
    await get().load();
    if (get().activeCollectionId === id) set({ activeCollectionId: null, activeRequestId: null });
  },

  async newRequest(collectionId, name, protocol = 'http') {
    const r = blankRequest(name, protocol);
    await window.api.store.saveRequest(collectionId, r);
    await get().load();
    set({ activeCollectionId: collectionId, activeRequestId: r.id, view: 'request' });
  },

  async saveRequest(collectionId, r) {
    await window.api.store.saveRequest(collectionId, r);
    set(state => ({
      collections: state.collections.map(c =>
        c.id === collectionId
          ? { ...c, requests: c.requests.some(x => x.id === r.id)
              ? c.requests.map(x => x.id === r.id ? r : x)
              : [...c.requests, r] }
          : c
      )
    }));
  },

  async deleteRequest(collectionId, requestId) {
    await window.api.store.deleteRequest(collectionId, requestId);
    await get().load();
    if (get().activeRequestId === requestId) set({ activeRequestId: null });
  },

  async newEnvironment(name) {
    const e: Environment = { id: uid(), name, variables: {} };
    await window.api.store.saveEnvironment(e);
    await get().load();
    set({ activeEnvId: e.id });
  },

  async saveEnvironment(e) {
    await window.api.store.saveEnvironment(e);
    await get().load();
  },

  async deleteEnvironment(id) {
    await window.api.store.deleteEnvironment(id);
    await get().load();
    if (get().activeEnvId === id) set({ activeEnvId: null });
  },

  resolveVars() {
    const { activeCollectionId, activeEnvId, collections, environments } = get();
    const col = collections.find(c => c.id === activeCollectionId);
    const env = environments.find(e => e.id === activeEnvId);
    return { ...(col?.variables ?? {}), ...(env?.variables ?? {}) };
  },

  async executeRequest(req) {
    set(state => ({ responses: { ...state.responses, [req.id]: { loading: true } } }));
    const vars = get().resolveVars();

    let res: any;
    if (req.protocol === 'http' || req.protocol === 'graphql') {
      res = await window.api.http.execute({ request: req, vars });
    } else if (req.protocol === 'grpc') {
      res = await window.api.grpc?.execute({ request: req, vars });
    } else if (req.protocol === 'websocket') {
      // WebSocket uses connect/disconnect, not execute
      return;
    }

    set(state => ({ responses: { ...state.responses, [req.id]: res } }));
  }
}));
