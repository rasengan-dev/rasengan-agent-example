import { useEffect, useRef, useState } from 'react';
import { Monitor, RotateCw, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

type Tab = 'preview' | 'files' | 'logs';
type Device = 'phone' | 'desktop';

export function PreviewPanel() {
  const { server, changedFiles } = useSession();
  const [tab, setTab] = useState<Tab>('preview');
  const [device, setDevice] = useState<Device>('desktop');
  const [frameKey, setFrameKey] = useState(0);
  const previewUrl = server?.previewUrl ?? 'http://localhost:5320';
  const status = server?.preview ?? 'starting';

  return (
    <section aria-label="Preview" className="flex min-h-[60vh] min-w-0 flex-[999_1_560px] flex-col bg-bg">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <nav aria-label="Panels" className="flex gap-1">
          {(['preview', 'files', 'logs'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-[7px] px-2.5 py-1.5 text-[13px] capitalize transition-colors ${
                tab === id ? 'bg-raised font-medium text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {id}
              {id === 'files' && changedFiles.length > 0 && <span className="ml-1 font-mono text-[11px] text-accent">{changedFiles.length}</span>}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-muted">
          <span className={`size-[7px] shrink-0 rounded-full ${status === 'ready' ? 'bg-ok' : status === 'crashed' ? 'bg-err' : 'animate-pulse bg-warn'}`} />
          <a href={previewUrl} target="_blank" rel="noreferrer" className="truncate text-muted no-underline hover:text-fg">
            {previewUrl.replace(/^https?:\/\//, '')}
          </a>
          <span className="ml-auto hidden text-faint sm:inline">rasengan dev · {status}</span>
          <button type="button" aria-label="Reload the preview" onClick={() => setFrameKey((key) => key + 1)} className="text-faint hover:text-fg">
            <RotateCw className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div role="group" aria-label="Device" className="flex gap-0.5 rounded-[9px] border border-line p-[3px]">
          {(
            [
              ['phone', Smartphone, 'Phone preview'],
              ['desktop', Monitor, 'Desktop preview'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={device === id}
              onClick={() => setDevice(id)}
              className={`flex h-7 w-8 items-center justify-center rounded-md ${device === id ? 'bg-line text-fg' : 'text-faint hover:text-fg'}`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {tab === 'preview' && (
        <div className={`dot-grid flex flex-1 justify-center overflow-auto ${device === 'phone' ? 'items-start p-7' : 'p-3'}`}>
          <iframe
            key={frameKey}
            title="Site preview"
            src={previewUrl}
            className={`border border-line-strong bg-white shadow-[0_30px_80px_rgba(0,0,0,0.55)] ${
              device === 'phone' ? 'h-[720px] w-[360px] rounded-[28px]' : 'h-full min-h-[480px] w-full rounded-[10px]'
            }`}
          />
        </div>
      )}
      {tab === 'files' && <FilesTab />}
      {tab === 'logs' && <LogsTab />}
    </section>
  );
}

function FilesTab() {
  const { changedFiles, siteVersion } = useSession();
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    api.files().then((result) => setFiles(result.files), () => setFiles([]));
  }, [siteVersion]);

  useEffect(() => {
    if (!selected) return;
    api.file(selected).then((result) => setContent(result.content), () => setContent('(file not found)'));
  }, [selected, siteVersion]);

  return (
    <div className="flex min-h-0 flex-1 flex-wrap">
      <ul className="m-0 max-h-[70vh] min-w-[220px] flex-[1_1_240px] list-none overflow-auto border-r border-line p-2 scrollbar-thin">
        {files.map((file) => (
          <li key={file}>
            <button
              type="button"
              onClick={() => setSelected(file)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs ${
                selected === file ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              <span className="truncate">{file}</span>
              {changedFiles.includes(file) && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" aria-label="changed by the agent" />}
            </button>
          </li>
        ))}
      </ul>
      <pre className="m-0 max-h-[70vh] min-w-0 flex-[999_1_400px] overflow-auto p-4 font-mono text-xs leading-relaxed text-fg-soft scrollbar-thin">
        {selected ? content : 'Pick a file. A blue dot marks the ones the agent changed.'}
      </pre>
    </div>
  );
}

function LogsTab() {
  const [log, setLog] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => api.logs().then((result) => alive && setLog(result.log), () => undefined);
    refresh();
    const timer = setInterval(refresh, 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => bottom.current?.scrollIntoView(), [log]);

  return (
    <div className="max-h-[75vh] flex-1 overflow-auto bg-bg-soft p-4 scrollbar-thin">
      <pre className="m-0 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">{log || 'No output yet.'}</pre>
      <div ref={bottom} />
    </div>
  );
}
