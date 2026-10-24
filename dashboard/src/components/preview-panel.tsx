import { useState } from 'react';
import { Monitor, RotateCw, Smartphone } from 'lucide-react';
import { CodeEditor } from '@/components/code-editor';
import { useSession } from '@/lib/session';

type Tab = 'preview' | 'code';
type Device = 'phone' | 'desktop';

export function PreviewPanel({ className = 'flex' }: { className?: string }) {
  const { server, changedFiles } = useSession();
  const [tab, setTab] = useState<Tab>('preview');
  const [device, setDevice] = useState<Device>('desktop');
  const [frameKey, setFrameKey] = useState(0);
  const previewUrl = server?.previewUrl ?? 'http://localhost:5320';
  const status = server?.preview ?? 'starting';

  return (
    <section aria-label="Preview" className={`${className} min-h-0 min-w-0 flex-1 flex-col bg-bg`}>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <nav aria-label="Panels" className="flex gap-1">
          {(['preview', 'code'] as Tab[]).map((id) => (
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
              {id === 'code' && changedFiles.length > 0 && <span className="ml-1 font-mono text-[11px] text-accent">{changedFiles.length}</span>}
            </button>
          ))}
        </nav>

        {/* The address, reload and device controls only apply to the preview. */}
        {tab === 'preview' && (
          <>
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
          </>
        )}
      </div>

      {tab === 'preview' && (
        <div className={`dot-grid flex min-h-0 flex-1 justify-center overflow-auto ${device === 'phone' ? 'items-start p-7' : 'p-3'}`}>
          {/* The site scrolls inside the iframe; the phone frame is the only thing that can overflow the stage. */}
          <iframe
            key={frameKey}
            title="Site preview"
            src={previewUrl}
            className={`shrink-0 border border-line-strong bg-white shadow-[0_30px_80px_rgba(0,0,0,0.55)] ${
              device === 'phone' ? 'h-[720px] max-h-full w-[360px] rounded-[28px]' : 'h-full w-full rounded-[10px]'
            }`}
          />
        </div>
      )}
      {tab === 'code' && (
        <div className="dot-grid flex min-h-0 flex-1 flex-col p-3">
          <CodeEditor />
        </div>
      )}
    </section>
  );
}
