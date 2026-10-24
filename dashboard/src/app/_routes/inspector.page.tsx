import { Fragment, useEffect, useState } from 'react';
import { Link, type PageComponent } from 'rasengan';
import { ChevronLeft } from 'lucide-react';
import { formatTokens, formatUsd, useSession, type StepView } from '@/lib/session';

const ENGINE_FILES = { manual: 'engines/manual-loop.ts', 'ai-sdk': 'engines/ai-sdk.ts' } as const;
const LOOP = ['contents[]', 'Gemini', 'functionCalls in reply ?', 'run tools in the container', 'push functionResponse, repeat'];

/** The loop, step by step: what Gemini said, what it asked for, what came back. */
const Inspector: PageComponent = () => {
  const { runs } = useSession();
  const [runIndex, setRunIndex] = useState(-1);
  const [selected, setSelected] = useState(0);
  const run = runs[runIndex < 0 ? runs.length - 1 : runIndex];
  const steps = run?.steps ?? [];
  const step: StepView | undefined = steps[Math.min(selected, steps.length - 1)];

  // Follow the newest step while a run is live.
  useEffect(() => {
    if (run && !run.finished) setSelected(steps.length - 1);
  }, [run, steps.length]);

  const input = steps.reduce((sum, item) => sum + item.usage.input, 0);
  const cached = steps.reduce((sum, item) => sum + item.usage.cached, 0);
  const maxInput = Math.max(1, ...steps.map((item) => item.usage.input));
  const tools = steps.flatMap((item) => item.tools);
  const fixes = tools.filter((tool) => tool.name === 'finish' && tool.output?.startsWith('Not finished')).length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-bg-soft px-5 py-3">
        <Link to="/studio" className="flex items-center gap-1 text-[13px] text-muted no-underline hover:text-fg">
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Back to studio
        </Link>
        <h1 className="m-0 text-base font-semibold">Loop inspector</h1>
        {runs.length > 0 && (
          <>
            <label htmlFor="run" className="sr-only">
              Run
            </label>
            <select
              id="run"
              value={runIndex < 0 ? runs.length - 1 : runIndex}
              onChange={(event) => {
                setRunIndex(Number(event.target.value));
                setSelected(0);
              }}
              className="max-w-[320px] rounded-lg border border-line bg-panel px-2 py-1 font-mono text-xs text-muted"
            >
              {runs.map((item, index) => (
                <option key={item.id} value={index}>
                  run #{index + 1} · {item.message.slice(0, 40)}
                </option>
              ))}
            </select>
          </>
        )}
        {run && (
          <div className="ml-auto flex flex-wrap gap-2 font-mono text-xs">
            <span className="rounded-full border border-line px-2.5 py-1">{ENGINE_FILES[run.engine]}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-muted">
              {run.finished ? `stop: ${run.finished.reason}` : 'running…'}
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-center gap-2.5 border-b border-line px-5 py-[18px]">
        {LOOP.map((label, index) => (
          <Fragment key={label}>
            {index > 0 && (
              <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
                <path d="M0 5h24m-4-4 4 4-4 4" fill="none" stroke="#3a3f49" strokeWidth="1.5" />
              </svg>
            )}
            <span
              className={`rounded-[10px] border px-3.5 py-2 text-[13px] ${
                index === 1 ? 'border-accent bg-accent-bg' : 'border-line-strong bg-panel'
              } ${index === 2 ? 'font-mono text-xs' : ''}`}
            >
              {label}
            </span>
          </Fragment>
        ))}
      </div>

      {!run ? (
        <p className="m-auto p-10 text-muted">
          No run yet. Start one from the{' '}
          <Link to="/studio" className="text-accent-soft">
            studio
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-1 flex-wrap">
          <nav aria-label="Model calls" className="flex max-w-full flex-[1_1_240px] flex-col gap-1 border-r border-line bg-bg-soft p-3.5">
            <span className="px-2 pt-1 pb-2 text-xs font-medium tracking-[0.08em] text-faint uppercase">Model calls</span>
            {steps.map((item, index) => {
              const names = item.tools.map((tool) => tool.name);
              const label = names.length ? [...new Set(names)].join(', ') : 'text reply';
              const error = item.tools.some((tool) => tool.isError || (tool.name === 'check' && tool.output && !tool.output.startsWith('No errors')));
              const active = step?.n === item.n;
              return (
                <button
                  key={item.n}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(index)}
                  className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left ${
                    active ? 'border-line-strong bg-raised' : 'border-transparent hover:bg-panel'
                  }`}
                >
                  <span className="w-4 font-mono text-[11px] text-faint">{item.n}</span>
                  <span className={`min-w-0 flex-1 truncate font-mono text-xs ${error ? 'text-warn-soft' : 'text-fg'}`}>{label}</span>
                  <span className="font-mono text-[11px] text-faint">{(item.durationMs / 1000).toFixed(1)}s</span>
                </button>
              );
            })}
          </nav>

          <section aria-label="Selected step" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 px-5 py-[18px]">
            {step ? (
              <StepDetail step={step} message={run.message} />
            ) : (
              <p className="text-muted">{run.finished ? (run.error ?? 'This run made no model calls.') : 'Waiting for the first model call…'}</p>
            )}
          </section>

          <aside aria-label="Run totals" className="flex max-w-full flex-[1_1_280px] flex-col gap-[18px] border-l border-line bg-bg-soft p-[18px]">
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Cost" value={formatUsd(run.totalCostUsd)} />
              <Stat label="Steps" value={`${steps.length} / ${run.maxSteps}`} />
              <Stat label="Input tokens" value={formatTokens(input)} />
              <Stat label="From cache" value={input ? `${Math.round((cached / input) * 100)}%` : '—'} />
            </div>

            <figure className="m-0 flex flex-col gap-2.5">
              <figcaption className="text-xs text-faint">Input tokens per step: the whole conversation is sent every time</figcaption>
              <div role="img" aria-label="Input tokens per model call" className="flex h-[120px] items-end gap-1.5 border-b border-line">
                {steps.map((item) => (
                  <div
                    key={item.n}
                    title={`step ${item.n}: ${item.usage.input} tokens`}
                    className={`flex-1 rounded-t-[3px] ${step?.n === item.n ? 'bg-accent' : 'bg-line-strong'}`}
                    style={{ height: `${Math.max(4, (item.usage.input / maxInput) * 100)}%` }}
                  />
                ))}
              </div>
            </figure>

            <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3 text-[13px]">
              <span className="text-xs text-faint">Guardrails</span>
              <Row label="Writable paths" value="src/ public/" />
              <Row label="Auto-fixes used" value={`${fixes} / 3`} />
              <Row label="Budget" value={`${formatUsd(run.totalCostUsd)} / ${formatUsd(run.budgetUsd)}`} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

function StepDetail({ step, message }: { step: StepView; message: string }) {
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <h2 className="m-0 text-[15px] font-semibold">Step {step.n} · what the model saw and said</h2>
        {step.contextSize !== undefined && <span className="font-mono text-xs text-faint">{step.contextSize} messages in context</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
          <Role>system</Role>
          <span className="truncate text-[13px] text-muted">You design and build landing pages… (6 tools declared)</span>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Role>user</Role>
          <span className="truncate text-[13px] text-fg-soft">{message}</span>
        </div>
      </div>

      <Block tone="model" title="model" subtitle={`${formatTokens(step.usage.output)} tokens out · ${(step.durationMs / 1000).toFixed(1)}s`}>
        {step.text && <div className="mb-2 font-sans text-[13px] whitespace-pre-wrap text-fg-soft">{step.text}</div>}
        {step.tools.length === 0 && !step.text && <span className="text-faint">(no text)</span>}
        {step.tools.map((tool) => (
          <div key={tool.id} className="whitespace-pre-wrap">
            <span className="text-faint">functionCall </span>
            {JSON.stringify({ name: tool.name, args: summarizeArgs(tool.input) }, null, 2)}
          </div>
        ))}
      </Block>

      {step.tools.map((tool) => (
        <Block
          key={tool.id}
          tone={tool.isError ? 'error' : tool.output === undefined ? 'model' : 'user'}
          title="user"
          subtitle={`functionResponse · ${tool.name}${tool.isError ? ' · error' : ''}${tool.durationMs !== undefined ? ` · ${tool.durationMs} ms` : ''}`}
        >
          {tool.output === undefined ? 'running…' : tool.output || '(empty)'}
        </Block>
      ))}
    </>
  );
}

function summarizeArgs(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === 'string' && value.length > 160 ? `${value.slice(0, 160)}…` : value]),
  );
}

function Block({ tone, title, subtitle, children }: { tone: 'model' | 'user' | 'error'; title: string; subtitle: string; children: React.ReactNode }) {
  const styles = {
    model: 'border-[#2e3a57] bg-[#111624]',
    user: 'border-line-strong bg-panel',
    error: 'border-[#4a3a1c] bg-[#17130b]',
  }[tone];
  return (
    <div className={`max-h-[340px] overflow-auto rounded-xl border px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] scrollbar-thin ${styles}`}>
      <div className="mb-1">
        <span className={tone === 'model' ? 'text-accent-soft' : tone === 'error' ? 'text-warn-soft' : 'text-ok-soft'}>{title}</span>
        <span className="text-faint"> → {subtitle}</span>
      </div>
      <div className="text-fg-soft">{children}</div>
    </div>
  );
}

function Role({ children }: { children: string }) {
  return <span className="rounded-[5px] bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-line p-3">
      <span className="text-xs text-faint">{label}</span>
      <span className="font-mono text-xl">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono text-muted">{value}</span>
    </span>
  );
}

Inspector.metadata = { title: 'Loop inspector · rasengan/agent', description: 'Every model call, tool call and result.' };

export default Inspector;
