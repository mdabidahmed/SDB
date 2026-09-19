/**
 * The single data-access module.
 *
 * Views ask for `loadToc()` / `loadBook()` / `loadSearchIndex()` and never touch
 * a JSON path, so re-pointing the app at a new extraction run is a zero-diff
 * change for every consumer.
 *
 * Loading strategy: `toc.json` is small and gates the sidebar, so it is fetched
 * first. `book.json` is ~550 KB and is fetched per route, and `search.json`
 * only when the user first opens search. Nothing large blocks first paint.
 */

import { parseBook, parseSearchIndex, parseToc } from '@/lib/validate';
import type { Book, SearchIndex, Toc } from '@/types/book';

type JsonLoader = () => Promise<unknown>;

const dataModules = import.meta.glob('../data/*.json') as Record<string, JsonLoader>;

const loaderFor = (fileName: string): JsonLoader => {
  const key = Object.keys(dataModules).find((path) => path.endsWith(`/${fileName}`));
  const loader = key === undefined ? undefined : dataModules[key];
  if (!loader) throw new Error(`Missing data file: src/data/${fileName}`);
  return loader;
};

/** JSON modules resolve to `{ default: … }`; unwrap without assuming shape. */
const unwrapDefault = (moduleValue: unknown): unknown => {
  if (typeof moduleValue === 'object' && moduleValue !== null && 'default' in moduleValue) {
    return (moduleValue).default;
  }
  return moduleValue;
};

/* -------------------------------------------------------------------------- */
/* Caching                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Promises, not values: concurrent callers (sidebar + route + search) share a
 * single in-flight fetch, and a rejected load is not cached as a permanent
 * failure so a retry can actually retry.
 */
let bookPromise: Promise<Book> | null = null;
let tocPromise: Promise<Toc> | null = null;
let searchPromise: Promise<SearchIndex> | null = null;

const cache = <T>(
  get: () => Promise<T> | null,
  set: (value: Promise<T> | null) => void,
  create: () => Promise<T>,
): Promise<T> => {
  const existing = get();
  if (existing) return existing;
  const created = create().catch((error: unknown) => {
    set(null);
    throw error;
  });
  set(created);
  return created;
};

/* -------------------------------------------------------------------------- */
/* Public loaders                                                              */
/* -------------------------------------------------------------------------- */

export const loadBook = (): Promise<Book> =>
  cache(
    () => bookPromise,
    (value) => {
      bookPromise = value;
    },
    async () => parseBook(unwrapDefault(await loaderFor('book.json')())),
  );

export const loadToc = (): Promise<Toc> =>
  cache(
    () => tocPromise,
    (value) => {
      tocPromise = value;
    },
    async () => parseToc(unwrapDefault(await loaderFor('toc.json')())),
  );

export const loadSearchIndex = (): Promise<SearchIndex> =>
  cache(
    () => searchPromise,
    (value) => {
      searchPromise = value;
    },
    async () => parseSearchIndex(unwrapDefault(await loaderFor('search.json')())),
  );

/** Warms the book payload during idle time so the first chapter click is instant. */
export const prefetchBook = (): void => {
  const start = (): void => {
    void loadBook().catch(() => {
      /* prefetch is best-effort; the route load surfaces real errors */
    });
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2_000 });
  } else {
    window.setTimeout(start, 1_200);
  }
};
