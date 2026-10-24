import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Copy,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  Maximize2,
  Minimize2,
  TerminalSquare,
  X,
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { api } from '@/lib/api';
import { highlight, isBinary } from '@/lib/highlight';
import { useSession } from '@/lib/session';

/**
 * The site's code: explorer, tabs, highlighted code and the dev server's
 * terminal, laid out like the editor on the Rasengan docs' landing page and
 * drawn with the dashboard's theme. It follows the agent: every file it
 * writes opens in a tab and reloads.
 */

const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

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

// ── File icons ───────────────────────────────────────────────

/** Language label shown in the status bar, from the file extension. */
function languageOf(name: string | null): string {
  if (!name) return '';
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
      return <FileCode2 size={size} aria-hidden="true" className="shrink-0 text-faint" />;
  }
}

// ── Explorer ─────────────────────────────────────────────────

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
  const paddingLeft = depth * 12 + 10;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          style={{ paddingLeft }}
          className="flex w-full items-center gap-1.5 py-[5px] pr-2 text-left text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <ChevronRight size={12} aria-hidden="true" className={cn('shrink-0 text-faint transition-transform duration-200', expanded && 'rotate-90')} />
          {expanded ? (
            <FolderOpen size={14} aria-hidden="true" className="shrink-0 text-accent" />
          ) : (
            <Folder size={14} aria-hidden="true" className="shrink-0 text-accent" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {expanded && (
          <div className="relative">
            {/* indent guide */}
            <span aria-hidden="true" style={{ left: paddingLeft + 5 }} className="absolute inset-y-0 w-px bg-line" />
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
        'relative flex w-full items-center gap-1.5 py-[5px] pr-2 text-left font-mono text-xs transition-colors',
        isActive ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-raised hover:text-fg',
      )}
    >
      {isActive && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
      {/* Files the agent wrote this session. */}
      {isChanged && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" aria-label="changed by the agent" />}
    </button>
  );
}

// ── Tabs ─────────────────────────────────────────────────────

function EditorTabBar({
  openFiles,
  activeFile,
  onSelect,
  onClose,
  children,
}: {
  openFiles: string[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  /** Actions shown at the right end of the bar. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-bg-soft">
      <div className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {openFiles.map((path) => {
          const isActive = path === activeFile;
          const name = path.split('/').pop() ?? path;
          return (
            <div
              key={path}
              className={cn(
                'group relative flex shrink-0 items-center gap-2 border-r border-line pr-1.5 pl-3 font-mono text-xs transition-colors',
                isActive ? 'bg-panel text-fg' : 'text-faint hover:bg-raised hover:text-fg',
              )}
            >
              {isActive && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
              <button type="button" onClick={() => onSelect(path)} className="flex items-center gap-2" title={path}>
                <FileIcon name={name} size={13} />
                <span>{name}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${name}`}
                onClick={() => onClose(path)}
                className={cn(
                  'rounded p-0.5 text-faint transition-opacity hover:bg-line hover:text-fg focus-visible:opacity-100',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {children && <div className="flex shrink-0 items-center gap-0.5 px-1.5">{children}</div>}
    </div>
  );
}

function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('rounded-md p-1.5 transition-colors hover:bg-raised hover:text-fg', pressed ? 'text-accent' : 'text-faint')}
    >
      {children}
    </button>
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
  '[&_[data-line-numbers]_span[data-line]]:w-full',
  '[&_[data-line-numbers]_span[data-line]:hover]:!bg-white/[0.03]',
  '[&_[data-line-numbers]_span[data-line]::before]:mr-5',
  '[&_[data-line-numbers]_span[data-line]::before]:inline-block',
  '[&_[data-line-numbers]_span[data-line]::before]:w-[4ch]',
  '[&_[data-line-numbers]_span[data-line]::before]:select-none',
  '[&_[data-line-numbers]_span[data-line]::before]:text-right',
  '[&_[data-line-numbers]_span[data-line]::before]:!text-faint/60',
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
    <div className="relative min-h-0 flex-1 bg-panel">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy the file"
        className="absolute right-3 bottom-3 z-10 flex md:top-3 md:bottom-auto items-center gap-1.5 rounded-md border border-line-strong bg-raised/80 px-2 py-1 text-[11px] text-muted backdrop-blur transition-colors hover:bg-line hover:text-fg"
      >
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>

      {/* Re-keyed per file so switching files fades the new content in. */}
      {html === null ? (
        <pre key={path} className={cn(CODE_CLASSES, 'pl-4 font-mono whitespace-pre text-fg-soft')}>
          {code}
        </pre>
      ) : (
        <div key={path} className={CODE_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function EmptyEditorState({ label = 'Pick a file in the explorer' }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-panel text-sm text-faint">
      <FileCode2 size={28} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

// ── Terminal ─────────────────────────────────────────────────

function lineClass(line: string): string | undefined {
  if (/error|failed|✘/i.test(line)) return 'text-err-soft';
  if (/running|ready|listening/i.test(line)) return 'text-ok-soft';
  if (/^→ (Local|Network)/.test(line)) return 'text-accent-soft';
  if (/^→ |^\$ /.test(line)) return 'text-faint';
  return undefined;
}

/** The live output of the site's `rasengan dev`. */
function Terminal({ status }: { status: string }) {
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

  const lines = useMemo(() => log.split('\n').slice(-300), [log]);
  const dot = status === 'ready' ? 'bg-ok' : status === 'crashed' ? 'bg-err' : 'animate-pulse bg-warn';

  return (
    <div className="flex h-full flex-col bg-bg-soft">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-xs">
        <TerminalSquare size={13} aria-hidden="true" className="text-muted" />
        <span className="font-medium text-fg">Terminal</span>
        <span className="font-mono text-faint">rasengan dev</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-faint">
          <span className={cn('size-1.5 rounded-full', dot)} />
          {status}
        </span>
      </div>

      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex flex-1 flex-col items-start overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-muted scrollbar-thin"
      >
        {lines.map((line, i) => (
          <div key={i} className={cn('whitespace-pre', lineClass(line))}>
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status bar ───────────────────────────────────────────────

/** Problems from the agent's latest check: null before any check. */
function useProblems(): number | null {
  const { runs } = useSession();
  for (let r = runs.length - 1; r >= 0; r--) {
    const checks = runs[r]!.steps.flatMap((step) => step.tools).filter((tool) => tool.name === 'check' && tool.output !== undefined);
    const last = checks[checks.length - 1];
    if (!last) continue;
    if (last.output!.startsWith('No errors')) return 0;
    const count = /(\d+) errors?\./.exec(last.output!);
    return count ? Number(count[1]) : 1;
  }
  return null;
}

function StatusBar({ problems, changed, file }: { problems: number | null; changed: number; file: string | null }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-bg-soft px-3 font-mono text-[11px] text-faint">
      {problems !== null && (
        <span className={cn('flex items-center gap-1', problems > 0 ? 'text-warn-soft' : 'text-ok-soft')}>
          {problems > 0 ? <CircleAlert size={12} aria-hidden="true" /> : <CircleCheck size={12} aria-hidden="true" />}
          {problems} problem{problems === 1 ? '' : 's'}
        </span>
      )}
      <span>
        {changed} file{changed === 1 ? '' : 's'} changed by the agent
      </span>
      <span className="ml-auto">{languageOf(file)}</span>
    </div>
  );
}

// ── Code editor ──────────────────────────────────────────────

interface Loaded {
  code: string;
  html: string | null;
}

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
  const status = server?.preview ?? 'starting';

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

  // Esc leaves full screen.
  useEffect(() => {
    if (!isMaximized) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setIsMaximized(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMaximized]);

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

  const explorer = (onSelect: (path: string) => void) => (
    <>
      <div className="px-3 pt-1 pb-2 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">Explorer</div>
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} activeFile={activeFile} changed={changedFiles} onSelectFile={onSelect} />
      ))}
    </>
  );

  const maximize = (
    <IconButton label={isMaximized ? 'Exit full screen' : 'Full screen'} onClick={() => setIsMaximized((value) => !value)}>
      {isMaximized ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
    </IconButton>
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden border-line-strong bg-panel',
        isMaximized ? 'fixed inset-0 z-50' : 'h-full rounded-[10px] border shadow-[0_30px_80px_rgba(0,0,0,0.55)]',
      )}
    >
      {/* ── Desktop / tablet ── */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <PanelGroup id="code-editor-vertical" direction="vertical" className="flex h-full w-full flex-col">
          <Panel id="code-editor-main" defaultSize={70} minSize={40}>
            <PanelGroup id="code-editor" direction="horizontal" className="flex h-full w-full">
              <Panel id="code-editor-tree" defaultSize={26} minSize={16} maxSize={40} className="overflow-y-auto bg-bg-soft py-2 scrollbar-thin">
                {explorer(openFile)}
              </Panel>
              <PanelResizeHandle id="code-editor-handle" className="w-px bg-line transition-colors hover:bg-accent" />
              <Panel id="code-editor-content" defaultSize={74} className="flex min-w-0 flex-col">
                <EditorTabBar openFiles={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile}>
                  {maximize}
                </EditorTabBar>
                {content}
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle id="code-editor-terminal-handle" className="h-px bg-line transition-colors hover:bg-accent" />
          <Panel id="code-editor-terminal" defaultSize={30} minSize={15} maxSize={60}>
            <Terminal status={status} />
          </Panel>
        </PanelGroup>
      </div>

      {/* ── Mobile ── */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <EditorTabBar openFiles={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile}>
          <IconButton label="Files" pressed={mobileTreeOpen} onClick={() => setMobileTreeOpen((value) => !value)}>
            <Files size={15} aria-hidden="true" />
          </IconButton>
          <IconButton label="Terminal" pressed={mobileTerminalOpen} onClick={() => setMobileTerminalOpen((value) => !value)}>
            <TerminalSquare size={15} aria-hidden="true" />
          </IconButton>
        </EditorTabBar>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {content}
          {mobileTreeOpen && (
            <>
              <div onClick={() => setMobileTreeOpen(false)} className="absolute inset-0 z-20 animate-code-in bg-black/60" />
              <div className="absolute top-0 left-0 z-30 h-full w-[78%] max-w-[270px] overflow-y-auto border-r border-line bg-bg-soft py-2">
                {explorer((path) => {
                  openFile(path);
                  setMobileTreeOpen(false);
                })}
              </div>
            </>
          )}
        </div>
        {mobileTerminalOpen && (
          <div className="h-[200px] shrink-0 border-t border-line">
            <Terminal status={status} />
          </div>
        )}
      </div>

      <StatusBar problems={problems} changed={changedFiles.length} file={activeFile} />
    </div>
  );
}
