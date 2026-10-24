import { PageComponent } from 'rasengan';
import ThemeToggle from '@/components/theme-toggle';

const Page: PageComponent = () => {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_16%,transparent)_0%,transparent_100%)]" />

      <header className="relative flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src="/rasengan.svg" alt="Rasengan" className="size-6" />
          <span className="font-mono text-sm text-muted-foreground">
            rasengan
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
          Channel your chakra.
          <br />
          Ship your jutsu.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
          A Rasengan starter with Tailwind v4, dark mode and file-based
          routing ready to go. Edit{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            src/app/_routes/index.page.tsx
          </code>{' '}
          to make it yours.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://rasengan.dev/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Documentation
          </a>
          <a
            href="https://github.com/rasengan-dev/rasenganjs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            GitHub
          </a>
        </div>

        <div className="mt-12 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background/70 text-left shadow-sm backdrop-blur">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
            <span className="size-3 rounded-full bg-red-400/70" />
            <span className="size-3 rounded-full bg-yellow-400/70" />
            <span className="size-3 rounded-full bg-green-400/70" />
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              zsh
            </span>
          </div>
          <div className="space-y-1.5 p-4 font-mono text-sm leading-relaxed">
            <p>
              <span className="text-muted-foreground">$</span> npx
              create-rasengan my-app
            </p>
            <p className="text-muted-foreground">✓ project scaffolded</p>
            <p className="text-muted-foreground">✓ dependencies installed</p>
            <p>
              <span className="text-primary">→</span> ready on
              http://localhost:5320
            </p>
          </div>
        </div>
      </div>

      <footer className="relative px-6 py-5 text-center text-xs text-muted-foreground">
        Scaffolded with create-rasengan
      </footer>
    </main>
  );
};

Page.metadata = {
  title: 'Welcome to Rasengan',
  description: 'Welcome to Rasengan',
};

export default Page;
