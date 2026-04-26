import { useStore, type ThemeMode } from '../store';

const THEME_LABEL: Record<ThemeMode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const THEME_GLYPH: Record<ThemeMode, string> = { auto: '◐', light: '☀', dark: '☾' };
const NEXT_THEME: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };

export function TopBar() {
  const environments = useStore(s => s.environments);
  const activeEnvId = useStore(s => s.activeEnvId);
  const setActiveEnv = useStore(s => s.setActiveEnv);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);

  return (
    <div className="titlebar-drag h-11 flex items-center justify-between px-4 border-b border-bg-border bg-bg-panel">
      <div className="flex items-center gap-3 pl-16">
        <div className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-sm font-semibold tracking-tight">Sendman</span>
        <span className="text-xs text-zinc-500">v0.1</span>
      </div>
      <div className="no-drag flex items-center gap-2">
        <div className="flex bg-bg-elev rounded-md p-0.5 text-xs">
          <button
            onClick={() => setView('request')}
            className={`px-3 py-1 rounded ${view === 'request' ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >Request</button>
          <button
            onClick={() => setView('runner')}
            className={`px-3 py-1 rounded ${view === 'runner' ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >Runner</button>
        </div>
        <button
          onClick={() => setTheme(NEXT_THEME[theme])}
          title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
          className="bg-bg-elev border border-bg-border rounded-md w-7 h-7 flex items-center justify-center text-sm text-zinc-300 hover:text-zinc-200 hover:border-accent/50"
        >{THEME_GLYPH[theme]}</button>
        <select
          value={activeEnvId ?? ''}
          onChange={e => setActiveEnv(e.target.value || null)}
          className="bg-bg-elev border border-bg-border rounded-md text-xs px-2 py-1 text-zinc-300 focus:outline-none focus:border-accent"
        >
          <option value="">No environment</option>
          {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </div>
  );
}
