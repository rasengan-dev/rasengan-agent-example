import { LoaderCircle } from 'lucide-react';
import { Spiral } from '@/components/brand';
import { formatUsd, type RunView, type StepView, type ToolView } from '@/lib/session';

const ENGINE_FILES = { manual: 'engines/manual-loop.ts', 'ai-sdk': 'engines/ai-sdk.ts' } as const;

const REASONS: Record<string, string> = {
  finish: 'finished',
  answered: 'answered without finish',
  budget: 'stopped: budget spent',
  max_steps: 'stopped: step limit',
  stopped: 'stopped by you',
  error: 'failed',
};

/** One request: the message, every model call and tool, then the reply. */
export function RunTimeline({ run, live }: { run: RunView; live: boolean }) {
  const waitingForModel = live && !run.finished && run.steps.every((step) => step.tools.every((tool) => tool.output !== undefined));

  return (
    <div className="flex animate-rise flex-col gap-4">
      <div className="max-w-[88%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] border border-line bg-raised px-3.5 py-3 leading-relaxed">
        {run.message}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-faint">
          <span className="text-accent">
            <Spiral size={18} />
          </span>
          <span className="font-medium text-fg">Agent</span>
          <span className="font-mono">
            · {ENGINE_FILES[run.engine]} · {run.model}
          </span>
        </div>

        <ol className="ml-2 flex list-none flex-col gap-2 border-l border-dashed border-line-strong py-1 pl-[18px]">
          {run.steps.map((step) => (
            <Step key={step.n} step={step} live={live && !run.finished} />
          ))}
          {waitingForModel && (
            <li className="relative">
              <span className="absolute -left-6 top-3 size-[11px] animate-pulse rounded-full bg-accent" />
              <div className="flex items-center gap-2.5 rounded-[10px] border border-[#2e3a57] bg-accent-bg px-3 py-2.5">
                <LoaderCircle className="size-3.5 animate-spin text-accent" aria-hidden="true" />
                <span className="font-mono text-xs font-medium text-accent">gemini</span>
                <span className="text-[13px] text-fg-soft">Thinking…</span>
              </div>
            </li>
          )}
        </ol>

        {run.error && (
          <p className="ml-6 rounded-[10px] border border-err/40 bg-err/10 px-3 py-2.5 font-mono text-xs leading-relaxed text-err-soft">
            {run.error}
          </p>
        )}

        {run.finished && (
          <div className="ml-6 flex flex-col gap-2">
            {run.finished.reply && <p className="m-0 whitespace-pre-wrap leading-relaxed text-fg">{run.finished.reply}</p>}
            <p className="m-0 font-mono text-[11px] text-faint">
              {REASONS[run.finished.reason]} · {run.finished.steps} model calls · {formatUsd(run.totalCostUsd)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ step, live }: { step: StepView; live: boolean }) {
  return (
    <>
      {step.text && (
        <li className="m-0 -ml-[18px] pl-[18px] text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg-soft">{step.text}</li>
      )}
      {step.tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} live={live} />
      ))}
    </>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  err: 'text-err',
};
const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-muted',
  accent: 'border-accent',
  ok: 'border-ok',
  warn: 'border-warn',
  err: 'border-err',
};

function ToolCard({ tool, live }: { tool: ToolView; live: boolean }) {
  const pending = tool.output === undefined;
  const { tone, meta, note } = describe(tool);
  const path = typeof tool.input.path === 'string' ? tool.input.path : '';

  return (
    <li className="relative animate-rise">
      <span className={`absolute -left-6 top-3 size-[11px] rounded-full border-2 bg-bg-soft ${TONE_BORDER[tone]}`} />
      <div className="overflow-hidden rounded-[10px] border border-line bg-panel">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span className={`font-mono text-xs font-medium ${TONE_TEXT[tone]}`}>{tool.name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{path}</span>
          {pending && live ? (
            <LoaderCircle className="size-3.5 animate-spin text-faint" aria-label="Running" />
          ) : (
            <span className="font-mono text-[11px] text-faint">{meta}</span>
          )}
        </div>
        {tool.name === 'edit_file' && !tool.isError && <Diff input={tool.input} />}
        {note && (
          <pre
            className={`m-0 max-h-48 overflow-auto border-t border-line px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap scrollbar-thin ${
              tone === 'ok' ? 'bg-ok/5 text-ok-soft' : tone === 'err' ? 'bg-err/5 text-err-soft' : 'bg-warn/5 text-warn-soft'
            }`}
          >
            {note}
          </pre>
        )}
      </div>
    </li>
  );
}

/** A short before/after of an edit: the first lines removed and added. */
function Diff({ input }: { input: Record<string, unknown> }) {
  const removed = String(input.old_str ?? '').split('\n').filter((line) => line.trim() !== '');
  const added = String(input.new_str ?? '').split('\n').filter((line) => line.trim() !== '');
  const shown = 4;
  return (
    <div className="max-h-44 overflow-auto border-t border-line bg-bg-soft py-2 font-mono text-xs leading-[1.7] scrollbar-thin">
      {removed.slice(0, shown).map((line, index) => (
        <div key={`r${index}`} className="bg-err/10 px-3 whitespace-pre text-err-soft">
          - {line}
        </div>
      ))}
      {added.slice(0, shown).map((line, index) => (
        <div key={`a${index}`} className="bg-ok/10 px-3 whitespace-pre text-ok-soft">
          + {line}
        </div>
      ))}
      {(removed.length > shown || added.length > shown) && (
        <div className="px-3 text-faint">
          … {Math.max(0, removed.length - shown) + Math.max(0, added.length - shown)} more lines
        </div>
      )}
    </div>
  );
}

function describe(tool: ToolView): { tone: Tone; meta: string; note?: string } {
  const output = tool.output ?? '';
  if (tool.output === undefined) return { tone: tool.name === 'edit_file' ? 'accent' : 'neutral', meta: '' };
  if (tool.isError) return { tone: 'err', meta: 'error', note: output };
  switch (tool.name) {
    case 'list_files':
      return { tone: 'neutral', meta: `${output.split('\n').filter(Boolean).length} files` };
    case 'read_file':
      return { tone: 'neutral', meta: `${output.split('\n').length} lines` };
    case 'edit_file': {
      const removed = String(tool.input.old_str ?? '').split('\n').length;
      const added = String(tool.input.new_str ?? '').split('\n').length;
      return { tone: 'accent', meta: tool.input.old_str ? `+${added} −${removed}` : `new · +${added}` };
    }
    case 'check':
      return output.startsWith('No errors')
        ? { tone: 'ok', meta: 'passed', note: 'No type errors · no dev server errors' }
        : { tone: 'warn', meta: 'errors', note: output };
    case 'finish':
      return output.startsWith('Done')
        ? { tone: 'ok', meta: 'done' }
        : { tone: 'warn', meta: 'refused', note: output };
    default:
      return { tone: 'neutral', meta: tool.durationMs ? `${tool.durationMs} ms` : '' };
  }
}
