/**
 * `book.json` stores figure paths as domain-root-relative (e.g. `/figures/foo.png`).
 * When the app is deployed under a sub-path (GitHub Pages project sites live at
 * `/<repo>/`), those need the configured base prepended at runtime.
 */
export const assetUrl = (rootRelativePath: string): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}${rootRelativePath}`;
