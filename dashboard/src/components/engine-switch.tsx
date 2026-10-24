import { useSession } from '@/lib/session';
import type { EngineId } from '@/lib/api';

const LABELS: Record<EngineId, string> = { manual: 'Hand-written loop', 'ai-sdk': 'Vercel AI SDK' };

/** The demo's key switch: same tools, same UI, a different loop. */
export function EngineSwitch() {
  const { prefs, setPrefs, running } = useSession();
  return (
    <div role="group" aria-label="Agent engine" className="flex items-center gap-0.5 rounded-[10px] border border-line bg-panel p-[3px]">
      <span className="px-2 text-xs text-faint">Engine</span>
      {(Object.keys(LABELS) as EngineId[]).map((id) => {
        const active = prefs.engine === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            disabled={running}
            onClick={() => setPrefs({ engine: id })}
            className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
              active ? 'bg-line text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {active && <span className="size-1.5 rounded-full bg-accent" />}
            {LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
