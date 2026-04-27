import { useEffect, useState, useRef } from 'react';
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
  const [sidebarWidth, setSidebarWidth] = useState(280); // pixels
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Sidebar resizer
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setSidebarWidth(Math.max(200, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="h-full flex flex-col bg-bg text-zinc-200">
      <TopBar />
      <div ref={containerRef} className="flex-1 flex min-h-0">
        <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0">
          <Sidebar />
        </div>
        <div
          onMouseDown={() => setIsDragging(true)}
          className="w-1 bg-bg-border hover:bg-accent cursor-col-resize flex-shrink-0"
        />
        <main className="flex-1 min-w-0 flex flex-col bg-bg">
          {view === 'request' ? <RequestView /> : <RunnerView />}
        </main>
      </div>
      <DialogHost />
    </div>
  );
}
