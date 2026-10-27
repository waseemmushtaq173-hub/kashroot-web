'use client';

/**
 * The search box in the portal's top bar. It looks only at this portal — its
 * sections (tabs), the buttons at the top of the page, the stat cards that
 * open something, and the menu (My details, Help, Home, Sign out) — and jumps
 * to the one picked. Nothing is sent anywhere.
 *
 * Type a word, then tap a result or press Enter; the arrow keys move through
 * the list, Escape closes it. ⌘K (Ctrl K) puts the cursor here from anywhere.
 * On narrow screens it sits behind a search button, opening as a row under
 * the top bar.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';

import { FOCUS, type PortalTheme } from '@/components/portal/kit';

export interface SearchItem {
  key: string;
  label: string;
  /** What it is, in a word: Section, Button, Menu. */
  kind: string;
  run: () => void;
}

const MAX = 8;

/** Best first: the name starts with it, a word starts with it, it is inside the name, every word is inside. */
function score(label: string, q: string): number {
  const name = label.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((w) => name.includes(w)) ? 3 : -1;
}

export function findItems(items: SearchItem[], query: string): SearchItem[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  return items
    .map((item, i) => ({ item, i, s: score(item.label, q) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, MAX)
    .map((r) => r.item);
}

const noop = () => () => undefined;
const shortcutText = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');
// Large screens have room for an example in the empty box; smaller ones just say Search.
const LARGE = '(min-width: 1024px)';
const onWidth = (change: () => void) => {
  const query = window.matchMedia(LARGE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};
const isLarge = () => window.matchMedia(LARGE).matches;

export function ShellSearch({ getItems, theme, example }: { getItems: () => SearchItem[]; theme: PortalTheme; example?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const listId = `${ids}-results`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  // Narrow screens: the search row under the top bar is open.
  const [row, setRow] = useState(false);
  const shortcut = useSyncExternalStore(noop, shortcutText, () => null);
  const large = useSyncExternalStore(onWidth, isLarge, () => false);

  const update = (text: string) => {
    setQuery(text);
    setResults(findItems(getItems(), text));
    setActive(0);
  };
  const close = () => {
    setQuery('');
    setResults([]);
    setRow(false);
    inputRef.current?.blur();
  };
  const choose = (item: SearchItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  // ⌘K / Ctrl K from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = inputRef.current;
        input?.focus();
        // Narrow screens: the box is behind the search button; open its row first.
        if (input && document.activeElement !== input) {
          setRow(true);
          window.requestAnimationFrame(() => input.focus());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active] ?? results[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) update('');
      else close();
    }
  };

  const showList = focused && query.trim() !== '';
  const optionId = (i: number) => `${ids}-option-${i}`;

  return (
    <div role="search" className="flex-1 md:relative md:min-w-[15rem] md:max-w-md">
      <button
        type="button"
        onClick={() => {
          setRow((r) => !r);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Open search"
        aria-expanded={row}
        className={`ml-auto grid h-12 w-12 cursor-pointer place-items-center rounded-xl text-slate-700 ring-1 ring-slate-900/10 transition hover:bg-white md:hidden ${FOCUS} ${theme.outline}`}
      >
        <Search className="h-5 w-5" aria-hidden />
      </button>

      <div className={`${row ? 'absolute inset-x-0 top-full border-b border-slate-900/10 bg-white/95 p-3 shadow-lg backdrop-blur-xl' : 'hidden'} md:static md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search this portal"
            aria-autocomplete="list"
            aria-expanded={showList && results.length > 0}
            aria-controls={listId}
            aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            placeholder={example && large ? `Search (like “${example}”)` : 'Search'}
            value={query}
            onChange={(e) => update(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              if (query) setResults(findItems(getItems(), query));
            }}
            onBlur={() => setFocused(false)}
            className="block h-12 w-full rounded-xl border-0 bg-white/90 pl-11 pr-16 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-900/10 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 md:h-11 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                update('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            shortcut && (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-500 ring-1 ring-slate-900/10 md:block [@media(pointer:coarse)]:hidden">
                {shortcut}
              </kbd>
            )
          )}
        </div>

        {showList && (
          <div className="absolute inset-x-3 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/10 md:inset-x-0">
            <ul id={listId} role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto p-1.5">
              {results.map((item, i) => (
                <li
                  key={item.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${i === active ? theme.soft : 'text-slate-800'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-slate-900/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.kind}</span>
                  {i === active && <CornerDownLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p role="status" className="px-4 py-3 text-sm text-slate-600">
                Nothing called “{query.trim()}” here. Try another word{example ? `, like “${example}”` : ''}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
