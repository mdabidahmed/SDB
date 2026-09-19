/** Joins class names, dropping the `undefined` that CSS-module lookups produce. */
export const cx = (...values: readonly (string | false | null | undefined)[]): string =>
  values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
