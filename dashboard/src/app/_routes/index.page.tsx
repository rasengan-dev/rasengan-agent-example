import { useState, type FormEvent } from 'react';
import { Link, useNavigate, type PageComponent } from 'rasengan';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { Brand } from '@/components/brand';
import { useSession } from '@/lib/session';
import type { EngineId } from '@/lib/api';

const ENGINES: { id: EngineId; label: string; file: string; body: string; code: string }[] = [
  {
    id: 'manual',
    label: 'Hand-written loop',
    file: 'manual-loop.ts',
    body: 'About 40 lines on the raw Google Gen AI SDK. Every model call and tool result is ours to see.',
    code: 'while (reply.functionCalls?.length) { … }',
  },
  {
    id: 'ai-sdk',
    label: 'Vercel AI SDK',
    file: 'ai-sdk.ts',
    body: 'Same tools, same guardrails, run by ToolLoopAgent. What you would ship in production.',
    code: 'new ToolLoopAgent({ model, tools, stopWhen })',
  },
];

const BUDGETS = [0.25, 0.5, 1, 2];

const Home: PageComponent = () => {
  const { server, prefs, setPrefs, send, reset, running, runs } = useSession();
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!brief.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await send(brief.trim());
      navigate('/studio');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  async function onReset() {
    if (!window.confirm('Put the site back to the starter template and clear the conversation?')) return;
    await reset();
  }

  return (
    <div className="dot-grid flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-4 px-7 py-3.5">
        <Brand />
        <nav aria-label="Main" className="ml-auto flex items-center gap-5 text-[13px]">
          <Link to="/inspector" className="text-muted no-underline hover:text-fg">
            Loop inspector
          </Link>
          <a href="https://rasengan.dev/docs" target="_blank" rel="noreferrer" className="text-muted no-underline hover:text-fg">
            Rasengan.js docs
          </a>
        </nav>
      </header>

      <main className="mx-auto box-border flex w-full max-w-[860px] flex-1 flex-col gap-7 px-6 pt-16 pb-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs text-muted">DevFest Douala · Yaoundé 2026</span>
          <h1 className="m-0 text-[clamp(34px,6vw,52px)] leading-[1.05] font-semibold tracking-[-0.035em]">What are you launching?</h1>
          <p className="m-0 max-w-[560px] text-base leading-relaxed text-muted">
            Describe your product. A Gemini agent builds its landing page in Rasengan.js, checks its own work, and you watch every step.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col rounded-2xl border border-line-strong bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.45)] focus-within:border-accent/60">
          <label htmlFor="brief" className="sr-only">
            Describe your product
          </label>
          <textarea
            id="brief"
            rows={4}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="A landing page for Kora, an app that lets small shops in Douala accept Mobile Money and track their sales. Call to action: join the waitlist…"
            className="resize-none border-0 bg-transparent px-[18px] pt-[18px] pb-2 text-base leading-relaxed text-fg outline-none placeholder:text-faint"
          />
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#1e2128] px-3 pt-2.5 pb-3">
            <label htmlFor="model" className="text-xs text-faint">
              Model
            </label>
            <select
              id="model"
              value={prefs.model}
              onChange={(event) => setPrefs({ model: event.target.value })}
              className="rounded-lg border border-line-strong bg-raised px-2 py-1.5 font-mono text-xs text-fg"
            >
              {(server?.models ?? [prefs.model]).map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
            <label htmlFor="budget" className="ml-1.5 text-xs text-faint">
              Budget
            </label>
            <select
              id="budget"
              value={prefs.budgetUsd}
              onChange={(event) => setPrefs({ budgetUsd: Number(event.target.value) })}
              className="rounded-lg border border-line-strong bg-raised px-2 py-1.5 font-mono text-xs text-fg"
            >
              {BUDGETS.map((budget) => (
                <option key={budget} value={budget}>
                  ${budget.toFixed(2)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || running || !brief.trim()}
              className="ml-auto flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
            >
              Start the agent
              <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </form>
        {error && <p className="-mt-4 m-0 text-sm text-err-soft">{error}</p>}
        {server && !server.hasApiKey && (
          <p className="-mt-4 m-0 text-sm text-warn-soft">Set GEMINI_API_KEY in .env, then restart the server.</p>
        )}

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-xs font-medium tracking-[0.08em] text-faint uppercase">Agent engine</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
            {ENGINES.map((engine) => {
              const active = prefs.engine === engine.id;
              return (
                <button
                  key={engine.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPrefs({ engine: engine.id })}
                  className={`flex flex-col gap-2.5 rounded-[14px] border p-4 text-left transition-colors ${
                    active ? 'border-accent bg-accent-bg' : 'border-line bg-panel hover:border-line-strong'
                  }`}
                >
                  <span className="flex w-full items-center gap-2.5">
                    <span className={`box-border size-4 rounded-full ${active ? 'border-[5px] border-accent' : 'border-2 border-[#3a3f49]'}`} />
                    <span className="text-[15px] font-semibold">{engine.label}</span>
                    <span className={`ml-auto font-mono text-[11px] ${active ? 'text-muted' : 'text-faint'}`}>{engine.file}</span>
                  </span>
                  <span className="leading-normal text-muted">{engine.body}</span>
                  <code className="box-border w-full overflow-hidden rounded-lg border border-line bg-bg-soft px-2.5 py-2 font-mono text-xs whitespace-pre text-fg-soft">
                    {engine.code}
                  </code>
                </button>
              );
            })}
          </div>
        </fieldset>

        <section aria-label="Current site" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-medium">workspace/site</span>
            <span className="font-mono text-xs text-faint">
              {runs.length} {runs.length === 1 ? 'run' : 'runs'} this session · preview {server?.preview ?? '…'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void onReset()}
            disabled={running}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[13px] text-fg hover:bg-line disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset site
          </button>
          <Link to="/studio" className="rounded-lg bg-line px-3 py-2 text-[13px] font-medium text-fg no-underline hover:bg-line-strong">
            Open the studio
          </Link>
        </section>
      </main>

      <footer className="px-4 py-[18px] text-center font-mono text-xs text-faint">Futon server · Rasengan.js dashboard · one Docker container</footer>
    </div>
  );
};

Home.metadata = { title: 'rasengan/agent', description: 'A code agent built with Rasengan.js, Futon and Gemini.' };

export default Home;
