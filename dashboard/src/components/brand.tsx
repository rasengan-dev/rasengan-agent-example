import { Link } from 'rasengan';

/** The Rasengan.js mark (public/rasengan.svg, the same file as the docs). */
export function RasenganLogo({ size = 26 }: { size?: number }) {
  return <img src="/rasengan.svg" alt="" width={size} height={size} className="shrink-0" />;
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-fg no-underline" aria-label="rasengan/agent home">
      <RasenganLogo />
      <span className="font-semibold tracking-tight">
        rasengan<span className="text-faint">/</span>agent
      </span>
    </Link>
  );
}
