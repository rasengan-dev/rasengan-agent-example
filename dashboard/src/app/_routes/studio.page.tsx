import { useEffect, useRef } from 'react';
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

  // Follow the agent as it works.
  const lastStep = last?.steps[last.steps.length - 1];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [runs.length, last?.steps.length, lastStep?.tools.length, last?.finished]);

  const budget = last?.budgetUsd ?? prefs.budgetUsd;
  const spent = last?.totalCostUsd ?? 0;

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-bg-soft px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Brand />
          <span className="text-[#3a3f49]">/</span>
          <span className="font-mono text-[13px] text-muted">site</span>
          {!connected && <span className="font-mono text-[11px] text-warn-soft">reconnecting…</span>}
        </div>

        <div className="ml-auto">
          <EngineSwitch />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
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

      <div className="flex min-h-0 flex-1 flex-wrap">
        <section aria-label="Conversation" className="flex max-h-[85vh] max-w-full min-w-0 flex-[1_1_400px] flex-col border-r border-line bg-bg-soft lg:max-h-none">
          <div ref={scroller} className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 scrollbar-thin">
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
          <Composer />
        </section>

        <PreviewPanel />
      </div>
    </div>
  );
};

Studio.metadata = { title: 'Studio · rasengan/agent', description: 'Watch the agent build the site.' };

export default Studio;
