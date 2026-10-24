import { useEffect, useRef, useState } from 'react';
import { Link, type PageComponent } from 'rasengan';
import { RefreshCw } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Composer } from '@/components/composer';
import { EngineSwitch } from '@/components/engine-switch';
import { PreviewPanel } from '@/components/preview-panel';
import { RunTimeline } from '@/components/timeline';
import { formatUsd, useSession } from '@/lib/session';

const Studio: PageComponent = () => {
  const { runs, running, prefs, setPrefs, server, connected } = useSession();
  const last = runs[runs.length - 1];
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  /** True while the chat is scrolled to the bottom: only then does it follow new messages. */
  const pinned = useRef(true);
  const [panel, setPanel] = useState<'chat' | 'preview'>('chat');

  // Follow the agent inside the chat panel only (never the page), unless you scrolled up to read.
  useEffect(() => {
    const box = scroller.current;
    const inner = content.current;
    if (!box || !inner) return;
    const follow = () => {
      if (pinned.current) box.scrollTop = box.scrollHeight;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    follow();
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const box = scroller.current;
    if (box) pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  };

  const budget = last?.budgetUsd ?? prefs.budgetUsd;
  const spent = last?.totalCostUsd ?? 0;

  return (
    // The page never scrolls: the chat and the preview each scroll on their own.
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-line bg-bg-soft px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Brand />
          <span className="text-[#3a3f49]">/</span>
          <span className="font-mono text-[13px] text-muted">site</span>
          {!connected && <span className="font-mono text-[11px] text-warn-soft">reconnecting…</span>}
        </div>

        {/* Below lg, one panel at a time so each gets the full height. */}
        <div role="group" aria-label="Panel" className="ml-auto flex gap-0.5 rounded-[9px] border border-line p-[3px] lg:hidden">
          {(['chat', 'preview'] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={panel === id}
              onClick={() => setPanel(id)}
              className={`rounded-md px-3 py-1 text-[13px] capitalize ${panel === id ? 'bg-line text-fg' : 'text-muted hover:text-fg'}`}
            >
              {id}
            </button>
          ))}
        </div>

        <div className="lg:ml-auto">
          <EngineSwitch />
        </div>

        <div className="ml-auto hidden flex-wrap items-center gap-3 md:flex">
          <label htmlFor="studio-model" className="sr-only">
            Model
          </label>
          <select
            id="studio-model"
            value={prefs.model}
            disabled={running}
            onChange={(event) => setPrefs({ model: event.target.value })}
            className="rounded-full border border-line bg-transparent px-2.5 py-1 font-mono text-xs text-muted"
          >
            {(server?.models ?? [prefs.model]).map((model) => (
              <option key={model}>{model}</option>
            ))}
          </select>
          <div className="flex min-w-[132px] flex-col gap-1" aria-label="Spend for the latest run">
            <div className="flex justify-between font-mono text-xs">
              <span>{formatUsd(spent)}</span>
              <span className="text-faint">/ {formatUsd(budget)}</span>
            </div>
            <div className="h-1 rounded-sm bg-line">
              <div
                className={`h-1 min-w-1.5 rounded-sm transition-[width] ${spent >= budget ? 'bg-warn' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
              />
            </div>
          </div>
          <span className="font-mono text-xs text-muted">
            step {last?.steps.length ?? 0}/{last?.maxSteps ?? 20}
          </span>
          <Link
            to="/inspector"
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-[7px] text-[13px] font-medium text-fg no-underline hover:bg-line"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Loop inspector
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Conversation"
          className={`${panel === 'chat' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-bg-soft lg:flex lg:w-[440px] lg:flex-none lg:border-r lg:border-line xl:w-[480px]`}
        >
          <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
            <div ref={content} className="flex min-h-full flex-col gap-6 p-5">
            {runs.length === 0 && (
              <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
                <p className="m-0 font-medium">No request yet</p>
                <p className="m-0 text-[13px] leading-relaxed text-muted">
                  Ask for a site or a change below. Each model call and tool shows up here as it happens.
                </p>
              </div>
            )}
            {runs.map((run, index) => (
              <RunTimeline key={run.id} run={run} live={index === runs.length - 1} />
            ))}
            </div>
          </div>
          <Composer />
        </section>

        <PreviewPanel className={panel === 'preview' ? 'flex' : 'hidden lg:flex'} />
      </div>
    </div>
  );
};

Studio.metadata = { title: 'Studio · rasengan/agent', description: 'Watch the agent build the site.' };

export default Studio;
