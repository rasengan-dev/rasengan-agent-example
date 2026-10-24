import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useSession } from '@/lib/session';

const SUGGESTIONS = ['Change the colors', 'Add opening hours', 'Translate to French'];

export function Composer() {
  const { send, stop, running, server } = useSession();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(message: string) {
    if (!message.trim() || running) return;
    setError(null);
    try {
      await send(message.trim());
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(text);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-2.5 border-t border-line px-4 pt-3.5 pb-4">
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={running}
            onClick={() => setText(suggestion)}
            className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
      {error && <p className="m-0 text-xs text-err-soft">{error}</p>}
      {server && !server.hasApiKey && <p className="m-0 text-xs text-warn-soft">GEMINI_API_KEY is not set on the server.</p>}
      <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-panel py-2 pr-2 pl-3 focus-within:border-accent/60">
        <label htmlFor="ask" className="sr-only">
          Message the agent
        </label>
        <textarea
          id="ask"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={running ? 'The agent is working…' : 'Ask for a change…'}
          className="flex-1 resize-none border-0 bg-transparent leading-normal text-fg outline-none placeholder:text-faint"
        />
        {running ? (
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop the run"
            className="flex size-9 items-center justify-center rounded-[9px] border border-line-strong bg-raised text-fg hover:bg-line"
          >
            <Square className="size-3 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="flex size-9 items-center justify-center rounded-[9px] bg-accent text-bg transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
