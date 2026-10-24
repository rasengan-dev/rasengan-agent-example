import { Link } from 'rasengan';

export function Spiral({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M13 5a8 8 0 0 1 8 8 5 5 0 0 1-5 5 3 3 0 0 1-3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-fg no-underline">
      <span className="text-accent">
        <Spiral />
      </span>
      <span className="font-semibold tracking-tight">
        rasengan<span className="text-faint">/</span>agent
      </span>
    </Link>
  );
}
