import { useEffect } from 'react';
import { applyTheme, useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { RequestView } from './components/RequestView';
import { RunnerView } from './components/RunnerView';
import { TopBar } from './components/TopBar';
import { DialogHost } from './components/Dialog';

export function App() {
  const load = useStore(s => s.load);
  const view = useStore(s => s.view);
  const theme = useStore(s => s.theme);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <div className="h-full flex flex-col bg-bg text-zinc-200">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col bg-bg">
          {view === 'request' ? <RequestView /> : <RunnerView />}
        </main>
      </div>
      <DialogHost />
    </div>
  );
}
