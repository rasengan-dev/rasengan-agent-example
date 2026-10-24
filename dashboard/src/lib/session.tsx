import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type AgentEvent, type EngineId, type ServerState, type StopReason, type Usage } from './api';

export interface ToolView {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  durationMs?: number;
}

export interface StepView {
  n: number;
  text: string;
  toolCalls: number;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  contextSize?: number;
  tools: ToolView[];
}

export interface RunView {
  id: string;
  engine: EngineId;
  model: string;
  message: string;
  budgetUsd: number;
  maxSteps: number;
  steps: StepView[];
  totalCostUsd: number;
  finished?: { reason: StopReason; reply: string | null; steps: number };
  error?: string;
}

/** Builds the runs the dashboard draws from the server's event stream. */
function reduce(runs: RunView[], event: AgentEvent): RunView[] {
  if (event.type === 'reset') return [];
  if (event.type === 'site_changed') return runs;
  if (event.type === 'run_started') {
    return [
      ...runs,
      { id: event.runId, engine: event.engine, model: event.model, message: event.message, budgetUsd: event.budgetUsd, maxSteps: event.maxSteps, steps: [], totalCostUsd: 0 },
    ];
  }
  return runs.map((run) => {
    if (run.id !== event.runId) return run;
    switch (event.type) {
      case 'model_response': {
        const { type: _type, runId: _runId, step, totalCostUsd, ...rest } = event;
        return { ...run, totalCostUsd, steps: [...run.steps, { ...rest, n: step, tools: [] }] };
      }
      case 'tool_call':
        return {
          ...run,
          steps: run.steps.map((step) =>
            step.n === event.step
              ? { ...step, tools: [...step.tools, { id: event.id, name: event.name, input: (event.input ?? {}) as Record<string, unknown> }] }
              : step,
          ),
        };
      case 'tool_result':
        return {
          ...run,
          steps: run.steps.map((step) =>
            step.n === event.step
              ? {
                  ...step,
                  tools: step.tools.map((tool) =>
                    tool.id === event.id ? { ...tool, output: event.output, isError: event.isError, durationMs: event.durationMs } : tool,
                  ),
                }
              : step,
          ),
        };
      case 'run_finished':
        return { ...run, totalCostUsd: event.totalCostUsd, finished: { reason: event.reason, reply: event.reply, steps: event.steps } };
      case 'run_error':
        return { ...run, error: event.message };
      default:
        return run;
    }
  });
}

export interface Prefs {
  engine: EngineId;
  model: string;
  budgetUsd: number;
}

interface Session {
  server: ServerState | null;
  connected: boolean;
  runs: RunView[];
  running: boolean;
  /** Paths the agent changed since the last reset. */
  changedFiles: string[];
  /** The file the agent wrote most recently: the editor opens it. */
  lastChanged: string | null;
  /** Bumped on every file change, so panels can refresh. */
  siteVersion: number;
  prefs: Prefs;
  setPrefs(patch: Partial<Prefs>): void;
  send(message: string): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);
const PREFS_KEY = 'rasengan-agent:prefs';

function loadPrefs(): Prefs {
  const fallback: Prefs = { engine: 'manual', model: 'gemini-3.8-flash', budgetUsd: 0.5 };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return fallback;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ServerState | null>(null);
  const [connected, setConnected] = useState(false);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [lastChanged, setLastChanged] = useState<string | null>(null);
  const [siteVersion, setSiteVersion] = useState(0);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    let alive = true;
    const refresh = () => api.state().then((state) => alive && setServer(state), () => undefined);
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource(api.eventsUrl);
    // The server replays the whole session on connect: start from scratch each time.
    source.onopen = () => {
      setConnected(true);
      setRuns([]);
      setChangedFiles([]);
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as AgentEvent;
      setRuns((current) => reduce(current, event));
      if (event.type === 'site_changed') {
        setChangedFiles((files) => (files.includes(event.path) ? files : [...files, event.path]));
        setLastChanged(event.path);
        setSiteVersion((version) => version + 1);
      }
      if (event.type === 'reset') {
        setChangedFiles([]);
        setSiteVersion((version) => version + 1);
      }
    };
    return () => source.close();
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // private window: keep it in memory
      }
      return next;
    });
  }, []);

  const running = runs.length > 0 && !runs[runs.length - 1]!.finished;

  const value = useMemo<Session>(
    () => ({
      server,
      connected,
      runs,
      running,
      changedFiles,
      lastChanged,
      siteVersion,
      prefs,
      setPrefs,
      send: async (message) => {
        const model = server?.models.includes(prefs.model) ? prefs.model : (server?.models[0] ?? prefs.model);
        await api.startRun({ message, engine: prefs.engine, model, budgetUsd: prefs.budgetUsd });
      },
      stop: async () => {
        await api.stopRun();
      },
      reset: async () => {
        await api.reset();
      },
    }),
    [server, connected, runs, running, changedFiles, lastChanged, siteVersion, prefs, setPrefs],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

export const formatUsd = (value: number) => `$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(3)}`;

export const formatTokens = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value));
