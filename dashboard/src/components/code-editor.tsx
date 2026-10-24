import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Blocks,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  CircleAlert,
  Copy,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  Minus,
  Search as SearchIcon,
  TerminalSquare,
  X,
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { api } from '@/lib/api';
import { highlight, isBinary } from '@/lib/highlight';
import { useSession } from '@/lib/session';

/**
 * The site's code, in the mini IDE from the Rasengan docs' landing page
 * (docs-v2 `components/home/showcase.tsx`): same chrome, tree, tabs, Shiki
 * theme, terminal and status bar, wired to the real site the agent edits.
 */

const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

const PROJECT_NAME = 'site';
const DEFAULT_OPEN_FILE = 'src/app/_routes/index.page.tsx';

// ── File tree ────────────────────────────────────────────────

type TreeFile = { type: 'file'; name: string; path: string };
type TreeFolder = { type: 'folder'; name: string; path: string; children: TreeNode[] };
type TreeNode = TreeFile | TreeFolder;

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    const parts = path.split('/');
    let level = root;
    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (index === parts.length - 1) {
        level.push({ type: 'file', name: part, path: currentPath });
        return;
      }
      let folder = level.find((node): node is TreeFolder => node.type === 'folder' && node.name === part);
      if (!folder) {
        folder = { type: 'folder', name: part, path: currentPath, children: [] };
        level.push(folder);
      }
      level = folder.children;
    });
  }
  return sortFoldersFirst(root);
}

/** Folders before files at every level; order within each group is kept. */
function sortFoldersFirst(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .sort((a, b) => Number(a.type === 'file') - Number(b.type === 'file'))
    .map((node) => (node.type === 'folder' ? { ...node, children: sortFoldersFirst(node.children) } : node));
}

// ── Look & feel ──────────────────────────────────────────────

/** Language label shown in the status bar, from the file extension. */
function languageOf(name: string | null): string {
  if (!name) return 'Plain Text';
  if (name.endsWith('.tsx')) return 'TypeScript JSX';
  if (name.endsWith('.ts')) return 'TypeScript';
  if (name.endsWith('.json')) return 'JSON';
  if (name.endsWith('.js')) return 'JavaScript';
  if (name.endsWith('.css')) return 'CSS';
  if (name.endsWith('.svg')) return 'SVG';
  return 'Plain Text';
}

/** Rounded tile with a short label, the shape most language logos share. */
function LabelTile({ size, bg, fg, label }: { size: number; bg: string; fg: string; label: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="3" fill={bg} />
      <text x="21" y="20.5" textAnchor="end" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize={label.length > 2 ? 8.5 : 11} fill={fg}>
        {label}
      </text>
    </svg>
  );
}

function ReactLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" className="shrink-0">
      <circle r="2.1" fill="#61DAFB" />
      <g stroke="#61DAFB" strokeWidth="1.6" fill="none">
        <ellipse rx="10.5" ry="4" />
        <ellipse rx="10.5" ry="4" transform="rotate(60)" />
        <ellipse rx="10.5" ry="4" transform="rotate(120)" />
      </g>
    </svg>
  );
}

function JsonLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <text x="12" y="17.5" textAnchor="middle" fontFamily="ui-monospace, monospace" fontWeight="800" fontSize="16" fill="#F5C518">
        {'{}'}
      </text>
    </svg>
  );
}

/** Technology logo for a file in the tree and the tab bar, by extension. */
function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <ReactLogo size={size} />;
    case 'ts':
      return <LabelTile size={size} bg="#3178C6" fg="#fff" label="TS" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <LabelTile size={size} bg="#F7DF1E" fg="#000" label="JS" />;
    case 'json':
      return <JsonLogo size={size} />;
    case 'css':
      return <LabelTile size={size} bg="#663399" fg="#fff" label="CSS" />;
    default:
      return <FileCode2 size={size} aria-hidden="true" className="shrink-0 text-ide-fg/60" />;
  }
}

// ── File tree ────────────────────────────────────────────────

function FileTreeNode({
  node,
  depth,
  activeFile,
  changed,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  changed: string[];
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const paddingLeft = depth * 12 + 12;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          style={{ paddingLeft }}
          className="flex w-full cursor-pointer items-center gap-1.5 py-[5px] pr-2 text-left text-[12.5px] text-ide-fg/70 transition-colors duration-150 hover:bg-white/[0.04] hover:text-ide-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-c)]"
        >
          <ChevronRight size={12} aria-hidden="true" className={cn('shrink-0 text-ide-fg/40 transition-transform duration-200 ease-out', expanded && 'rotate-90')} />
          {expanded ? (
            <FolderOpen size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-c)]" />
          ) : (
            <Folder size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-c)]" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {expanded && (
          <div className="relative">
            {/* indent guide */}
            <span aria-hidden="true" style={{ left: paddingLeft + 5 }} className="absolute inset-y-0 w-px bg-white/[0.06]" />
            {node.children.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} activeFile={activeFile} changed={changed} onSelectFile={onSelectFile} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = node.path === activeFile;
  const isChanged = changed.includes(node.path);

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      aria-current={isActive}
      style={{ paddingLeft: paddingLeft + 14 }}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-1.5 py-[5px] pr-2 text-left font-mono text-[12px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-c)]',
        isActive
          ? 'bg-[color-mix(in_oklab,var(--accent-c)_14%,transparent)] text-white'
          : 'text-ide-fg/65 hover:bg-white/[0.04] hover:text-ide-fg',
      )}
    >
      {isActive && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-[var(--accent-c)]" />}
      <FileIcon name={node.name} />
      <span className={cn('truncate', isChanged && !isActive && 'text-[#E2C08D]')}>{node.name}</span>
      {/* Like VS Code's "modified" marker: files the agent wrote this session. */}
      {isChanged && (
        <span className="ml-auto pl-2 text-[11px] font-semibold text-[#E2C08D]" title="Changed by the agent">
          M
        </span>
      )}
    </button>
  );
}

// ── Window chrome ────────────────────────────────────────────

/** macOS-style window controls. Yellow restores, green maximizes the editor to the full viewport; red is decorative. */
function TrafficLights({ isMaximized, onMaximize, onRestore }: { isMaximized: boolean; onMaximize: () => void; onRestore: () => void }) {
  return (
    <div className="group/lights flex items-center gap-2">
      <span aria-hidden="true" className="size-3 rounded-full bg-[#FF5F57]" />
      <button
        type="button"
        onClick={onRestore}
        disabled={!isMaximized}
        aria-label="Restore editor size"
        className="flex size-3 cursor-pointer items-center justify-center rounded-full bg-[#FEBC2E] text-transparent group-hover/lights:text-black/70 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <Minus size={8} strokeWidth={3} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onMaximize}
        disabled={isMaximized}
        aria-label="Maximize editor"
        className="flex size-3 cursor-pointer items-center justify-center rounded-full bg-[#28C840] text-transparent group-hover/lights:text-black/70 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ChevronsUpDown size={8} strokeWidth={3} className="rotate-45" aria-hidden="true" />
      </button>
    </div>
  );
}

/** "site › src › app › index.page.tsx" path shown in the title bar. */
function Breadcrumb({ project, path }: { project: string; path: string | null }) {
  const parts = [project, ...(path ? path.split('/') : [])];
  return (
    <nav aria-label="Current file" className="flex min-w-0 items-center gap-1 font-mono text-[11.5px] text-ide-fg/45">
      {parts.map((part, i) => {
        const last = i === parts.length - 1;
        return (
          <span key={`${part}-${i}`} className={cn('flex min-w-0 items-center gap-1', !last && 'max-lg:hidden')}>
            {i > 0 && <ChevronRight size={11} aria-hidden="true" className="shrink-0 text-ide-fg/25" />}
            <span className={cn('truncate', last && 'text-ide-fg/80')}>{part}</span>
          </span>
        );
      })}
    </nav>
  );
}

/** Where the docs editor switches starter projects: here, the live state of the site's dev server. */
function DevServerPill({ status }: { status: string }) {
  const color = status === 'ready' ? '#3FCF8E' : status === 'crashed' ? '#FF6B6B' : '#F5A524';
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.06] bg-black/30 p-0.5">
      <span
        style={{ backgroundColor: 'color-mix(in oklab, var(--accent-c) 22%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-c) 45%, transparent)' }}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-white"
      >
        <span aria-hidden="true" style={{ backgroundColor: 'var(--accent-c)' }} className="size-1.5 rounded-full" />
        Rasengan
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 font-mono text-xs text-ide-fg/55">
        <span aria-hidden="true" style={{ backgroundColor: color }} className="size-1.5 rounded-full" />
        rasengan dev · {status}
      </span>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────

function EditorTabBar({
  openFiles,
  activeFile,
  onSelect,
  onClose,
}: {
  openFiles: string[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.06] bg-[#0a0e1b]">
      <div className="no-scrollbar flex items-stretch overflow-x-auto">
        {openFiles.map((path) => {
          const isActive = path === activeFile;
          const name = path.split('/').pop() ?? path;
          return (
            <div
              key={path}
              className={cn(
                'group relative flex shrink-0 items-center gap-2 border-r border-white/[0.06] pl-3 pr-1.5 font-mono text-[12px] transition-colors duration-150',
                isActive ? 'bg-[#0d1324] text-white' : 'text-ide-fg/50 hover:bg-white/[0.03] hover:text-ide-fg/80',
              )}
            >
              {isActive && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-[var(--accent-c)]" />}
              <button type="button" onClick={() => onSelect(path)} className="flex cursor-pointer items-center gap-2 focus-visible:outline-none focus-visible:underline">
                <FileIcon name={name} size={13} />
                <span>{name}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${name}`}
                onClick={() => onClose(path)}
                className={cn(
                  'cursor-pointer rounded p-0.5 text-ide-fg/40 transition-opacity hover:bg-white/10 hover:text-ide-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Code pane ────────────────────────────────────────────────

const CODE_CLASSES = cn(
  'h-full animate-code-in overflow-auto py-4 pr-4 text-[13px] leading-[1.7] scrollbar-thin',
  // Shiki's own backgrounds off: the pane provides the surface.
  '[&_.shiki]:!bg-transparent [&_.shiki_span]:!bg-transparent [&_pre]:!bg-transparent [&_pre]:m-0',
  '[&_code]:font-mono [&_code]:flex [&_code]:flex-col [&_code]:items-start',
  // Line numbers via CSS counters on the `data-line` spans.
  '[&_[data-line-numbers]]:[counter-reset:line]',
  '[&_[data-line-numbers]_span[data-line]]:w-full [&_[data-line-numbers]_span[data-line]]:pl-0',
  '[&_[data-line-numbers]_span[data-line]:hover]:!bg-white/[0.03]',
  '[&_[data-line-numbers]_span[data-line]::before]:mr-5',
  '[&_[data-line-numbers]_span[data-line]::before]:inline-block',
  '[&_[data-line-numbers]_span[data-line]::before]:w-[4ch]',
  '[&_[data-line-numbers]_span[data-line]::before]:select-none',
  '[&_[data-line-numbers]_span[data-line]::before]:text-right',
  '[&_[data-line-numbers]_span[data-line]::before]:!text-ide-fg/25',
  '[&_[data-line-numbers]_span[data-line]::before]:[counter-increment:line]',
  '[&_[data-line-numbers]_span[data-line]::before]:content-[counter(line)]',
);

function CodePane({ path, code, html }: { path: string; code: string; html: string | null }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => setCopied(true), () => undefined);
  };

  return (
    <div className="relative min-h-0 flex-1 bg-[#0d1324]">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code snippet"
        className="absolute right-3 bottom-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-ide-fg/60 backdrop-blur transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 md:top-3 md:bottom-auto"
      >
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>

      {/* Re-keyed per file so switching files fades the new content in. */}
      {html === null ? (
        <pre key={path} className={cn(CODE_CLASSES, 'pl-4 font-mono whitespace-pre text-ide-fg/80')}>
          {code}
        </pre>
      ) : (
        <div key={path} className={CODE_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function EmptyEditorState({ label = 'Select a file in the explorer' }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#0d1324] text-sm text-ide-fg/40">
      <FileCode2 size={30} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

// ── Terminal ─────────────────────────────────────────────────

/** Same palette as the docs terminal: green for ready, blue for URLs, dim for hints; red for errors. */
function lineClass(line: string): string | undefined {
  if (/error|failed|✘/i.test(line)) return 'text-red-400';
  if (/running|ready|listening/i.test(line)) return 'text-emerald-500';
  if (/^→ (Local|Network)/.test(line)) return 'text-blue-400';
  if (/^→ |^\$ /.test(line)) return 'text-ide-fg/40';
  return undefined;
}

/**
 * Bottom panel: the tab strip (only Terminal is live) and the real output of
 * the site's `rasengan dev`, ending on a prompt with a blinking cursor.
 */
function Terminal() {
  const [log, setLog] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    let alive = true;
    const refresh = () => api.logs().then((result) => alive && setLog(result.log), () => undefined);
    refresh();
    const timer = setInterval(refresh, 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Follow the output, unless you scrolled up to read.
  useEffect(() => {
    if (box.current && pinned.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log]);

  const lines = useMemo(() => ['$ rasengan dev', ...log.split('\n').slice(-300)], [log]);

  return (
    <div className="flex h-full flex-col bg-[#0a0e1b]">
      <div className="flex h-9 shrink-0 items-stretch gap-4 border-b border-white/[0.06] px-4 text-[11px] font-medium tracking-[0.06em] uppercase">
        <span className="relative flex items-center gap-1.5 text-ide-fg/85">
          <TerminalSquare size={13} aria-hidden="true" />
          Terminal
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent-c)]" />
        </span>
        <span aria-hidden="true" className="flex items-center text-ide-fg/35">
          Output
        </span>
        <span aria-hidden="true" className="flex items-center text-ide-fg/35">
          Problems
        </span>
        <span className="ml-auto flex items-center font-mono tracking-normal normal-case text-ide-fg/35">zsh</span>
      </div>

      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex flex-1 flex-col items-start overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-ide-fg/80 scrollbar-thin"
      >
        {lines.map((line, i) => (
          <div key={i} className={cn('whitespace-pre', lineClass(line))}>
            {line || ' '}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[var(--accent-c)]">❯</span>
          <span aria-hidden="true" className="inline-block h-[14px] w-[7px] bg-ide-fg/70 motion-safe:animate-[editor-caret_1.1s_steps(1)_infinite]" />
        </div>
      </div>
    </div>
  );
}

// ── Side rails ───────────────────────────────────────────────

/** Decorative IDE activity bar (desktop only). */
function ActivityBar() {
  return (
    <div aria-hidden="true" className="flex w-11 shrink-0 flex-col items-center gap-4 border-r border-white/[0.06] bg-[#080b16] pt-3 text-ide-fg/35">
      <span className="relative text-ide-fg/85">
        <Files size={18} />
        <span className="absolute top-0 -left-[13px] h-full w-[2px] bg-[var(--accent-c)]" />
      </span>
      <SearchIcon size={18} />
      <GitBranch size={18} />
      <Blocks size={18} />
    </div>
  );
}

/** VS Code-style status bar in the accent color, with the agent's last check result. */
function StatusBar({ problems, changed, file }: { problems: number | null; changed: number; file: string | null }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-4 bg-[color-mix(in_oklab,var(--accent-c)_85%,black)] px-3 font-mono text-[11px] text-white">
      <span className="flex items-center gap-1">
        <GitBranch size={12} aria-hidden="true" />
        main
      </span>
      <span className="flex items-center gap-1 max-sm:hidden">
        {problems ? <CircleAlert size={12} aria-hidden="true" /> : <CircleCheck size={12} aria-hidden="true" />}
        {problems === null ? 'not checked' : `${problems} problem${problems === 1 ? '' : 's'}`}
      </span>
      <span className="max-sm:hidden">
        {changed} file{changed === 1 ? '' : 's'} changed
      </span>
      <span className="ml-auto max-md:hidden">Spaces: 2</span>
      <span className="max-md:hidden">UTF-8</span>
      <span>{languageOf(file)}</span>
    </div>
  );
}

// ── Code editor ──────────────────────────────────────────────

interface Loaded {
  code: string;
  html: string | null;
}

/** Problems reported by the agent's latest check: null before any check. */
function useProblems(): number | null {
  const { runs } = useSession();
  for (let r = runs.length - 1; r >= 0; r--) {
    const tools = runs[r]!.steps.flatMap((step) => step.tools).filter((tool) => tool.name === 'check' && tool.output !== undefined);
    const last = tools[tools.length - 1];
    if (!last) continue;
    if (last.output!.startsWith('No errors')) return 0;
    const count = /(\d+) errors?\./.exec(last.output!);
    return count ? Number(count[1]) : 1;
  }
  return null;
}

/**
 * The site's code as an always-dark mini IDE. Follows the agent: every file it
 * writes opens in a tab and reloads, and the tree marks it as changed.
 */
export function CodeEditor() {
  const { server, siteVersion, changedFiles, lastChanged } = useSession();
  const [paths, setPaths] = useState<string[]>([]);
  const [openFiles, setOpenFiles] = useState<string[]>([DEFAULT_OPEN_FILE]);
  const [activeFile, setActiveFile] = useState<string | null>(DEFAULT_OPEN_FILE);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [isMaximized, setIsMaximized] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);
  const problems = useProblems();

  useEffect(() => {
    api.files().then((result) => setPaths(result.files), () => setPaths([]));
  }, [siteVersion]);

  const openFile = (path: string) => {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]));
    setActiveFile(path);
  };

  // Follow the agent: open what it just wrote.
  useEffect(() => {
    if (lastChanged) openFile(lastChanged);
  }, [lastChanged, siteVersion]);

  // Load and highlight the active file; reload it after every change to the site.
  useEffect(() => {
    if (!activeFile) return;
    if (isBinary(activeFile)) {
      setLoaded((prev) => ({ ...prev, [activeFile]: { code: '(binary file)', html: null } }));
      return;
    }
    let alive = true;
    api.file(activeFile).then(
      async ({ content }) => {
        const html = await highlight(activeFile, content).catch(() => null);
        if (alive) setLoaded((prev) => ({ ...prev, [activeFile]: { code: content, html } }));
      },
      () => {
        if (alive) setLoaded((prev) => ({ ...prev, [activeFile]: { code: '(this file no longer exists)', html: null } }));
      },
    );
    return () => {
      alive = false;
    };
  }, [activeFile, siteVersion]);

  const closeFile = (path: string) => {
    const index = openFiles.indexOf(path);
    const next = openFiles.filter((p) => p !== path);
    setOpenFiles(next);
    if (activeFile === path) setActiveFile(next.length === 0 ? null : next[Math.max(0, index - 1)]!);
  };

  const tree = useMemo(() => buildTree(paths), [paths]);
  const active = activeFile ? loaded[activeFile] : undefined;

  const content = activeFile ? (
    active ? (
      <CodePane path={activeFile} code={active.code} html={active.html} />
    ) : (
      <EmptyEditorState label="Loading…" />
    )
  ) : (
    <EmptyEditorState />
  );

  /** Explorer contents, shared by the desktop panel and the mobile drawer. */
  const explorer = (onSelect: (path: string) => void) => (
    <>
      <div className="px-3 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.12em] text-ide-fg/40 uppercase">Explorer</div>
      <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-ide-fg/75 uppercase">
        <ChevronRight size={12} aria-hidden="true" className="rotate-90 text-ide-fg/40" />
        {PROJECT_NAME}
      </div>
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} activeFile={activeFile} changed={changedFiles} onSelectFile={onSelect} />
      ))}
    </>
  );

  return (
    <div
      style={{ '--accent-c': 'var(--color-ide-accent)' } as CSSProperties}
      className={cn('relative flex min-h-0 flex-col', isMaximized ? 'fixed inset-0 z-50' : 'h-full')}
    >
      {/* Ambient glow in the accent color, behind the window. */}
      {!isMaximized && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-6 -top-8 bottom-10 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--accent-c)_35%,transparent),transparent_70%)] opacity-70 blur-2xl"
        />
      )}

      {/* Gradient hairline border: a 1px padded wrapper with a gradient fill. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-c)_55%,transparent),rgba(255,255,255,0.06)_35%,rgba(255,255,255,0.04))] p-px shadow-[0_30px_60px_-40px_rgba(15,26,51,0.45)]',
          !isMaximized && 'rounded-2xl',
        )}
      >
        <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1020] text-ide-fg', !isMaximized && 'rounded-[15px]')}>
          {/* ── Title bar ── */}
          <div className="flex h-11 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#080b16] px-4 pr-2">
            <TrafficLights isMaximized={isMaximized} onMaximize={() => setIsMaximized(true)} onRestore={() => setIsMaximized(false)} />
            <div className="hidden min-w-0 flex-1 md:flex">
              <Breadcrumb project={PROJECT_NAME} path={activeFile} />
            </div>
            <div className="ml-auto hidden md:block">
              <DevServerPill status={server?.preview ?? 'starting'} />
            </div>

            {/* mobile actions */}
            <div className="ml-auto flex items-center gap-1 md:hidden">
              <button
                type="button"
                onClick={() => setMobileTreeOpen(true)}
                aria-label="Open file explorer"
                className="cursor-pointer rounded-md p-1.5 text-ide-fg/60 transition-colors hover:bg-white/10 hover:text-ide-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
              >
                <Files size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setMobileTerminalOpen((prev) => !prev)}
                aria-label="Toggle terminal"
                aria-pressed={mobileTerminalOpen}
                className={cn(
                  'cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/10 hover:text-ide-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60',
                  mobileTerminalOpen ? 'text-[var(--accent-c)]' : 'text-ide-fg/60',
                )}
              >
                <TerminalSquare size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ── Desktop / tablet ── */}
          <div className="hidden min-h-0 flex-1 md:flex">
            <ActivityBar />
            <PanelGroup id="code-editor-vertical" direction="vertical" className="flex h-full w-full flex-col">
              <Panel id="code-editor-main" defaultSize={70} minSize={40}>
                <PanelGroup id="code-editor" direction="horizontal" className="flex h-full w-full">
                  <Panel id="code-editor-tree" defaultSize={26} minSize={16} maxSize={40} className="overflow-y-auto bg-[#0a0e1b] py-2 scrollbar-thin">
                    {explorer(openFile)}
                  </Panel>
                  <PanelResizeHandle id="code-editor-handle" className="w-px bg-white/[0.06] transition-colors hover:bg-[var(--accent-c)]" />
                  <Panel id="code-editor-content" defaultSize={74} className="flex min-w-0 flex-col">
                    <EditorTabBar openFiles={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile} />
                    {content}
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle id="code-editor-terminal-handle" className="h-px bg-white/[0.06] transition-colors hover:bg-[var(--accent-c)]" />
              <Panel id="code-editor-terminal" defaultSize={30} minSize={15} maxSize={60}>
                <Terminal />
              </Panel>
            </PanelGroup>
          </div>

          {/* ── Mobile ── */}
          <div className="flex min-h-0 flex-1 flex-col md:hidden">
            <EditorTabBar openFiles={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile} />
            <div className="relative flex min-h-0 flex-1 flex-col">
              {content}
              {mobileTreeOpen && (
                <>
                  <div onClick={() => setMobileTreeOpen(false)} className="absolute inset-0 z-20 animate-code-in bg-black/60" />
                  <div className="absolute top-0 left-0 z-30 h-full w-[78%] max-w-[270px] overflow-y-auto border-r border-white/[0.06] bg-[#0a0e1b] py-2">
                    {explorer((path) => {
                      openFile(path);
                      setMobileTreeOpen(false);
                    })}
                  </div>
                </>
              )}
            </div>
            {mobileTerminalOpen && (
              <div className="h-[200px] shrink-0 border-t border-white/[0.06]">
                <Terminal />
              </div>
            )}
          </div>

          <StatusBar problems={problems} changed={changedFiles.length} file={activeFile} />
        </div>
      </div>
    </div>
  );
}
