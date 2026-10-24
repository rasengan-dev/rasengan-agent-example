import { createHighlighterCore, type HighlighterCore, type ShikiTransformer } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Shiki with the theme and languages the editor needs, loaded on first use.
 * Same theme as the Rasengan docs' landing editor: one-dark-pro.
 */
let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/one-dark-pro.mjs')],
    langs: [
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/html.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** Tags every line so CSS counters can number them (the docs editor does the same). */
const lineNumbers: ShikiTransformer = {
  name: 'line-numbers',
  line(node) {
    node.properties['data-line'] = '';
  },
  pre(node) {
    node.properties['data-line-numbers'] = '';
  },
};

const LANGS: Record<string, string> = {
  tsx: 'tsx',
  jsx: 'tsx',
  ts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'html',
  svg: 'html',
};

export async function highlight(path: string, code: string): Promise<string> {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const shiki = await getHighlighter();
  return shiki.codeToHtml(code, { lang: LANGS[ext] ?? 'text', theme: 'one-dark-pro', transformers: [lineNumbers] });
}

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|zip)$/i;

export const isBinary = (path: string) => BINARY.test(path);
