import { createContext, useContext } from 'react';

import type { FigureBlock } from '@/types/book';

export type LightboxOpener = (figure: FigureBlock) => void;

export const LightboxContext = createContext<LightboxOpener | null>(null);

/** Returns a no-op outside the provider so figures still render in isolation. */
export const useLightbox = (): LightboxOpener => useContext(LightboxContext) ?? (() => undefined);
