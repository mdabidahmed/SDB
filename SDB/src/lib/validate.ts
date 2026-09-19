/**
 * Hand-rolled runtime validation for the data contract.
 *
 * Why not a schema library: the contract is small, fixed and fully described in
 * `CONTRACT.md`, and the payload is multi-megabyte. A focused validator keeps
 * the dependency list tight and the parse cost negligible.
 *
 * Every validator is **non-transforming**. It checks shapes and hands the
 * original string references straight through, so book text can never be
 * altered on the way in.
 */

import type {
  Block,
  Book,
  Chapter,
  SearchIndex,
  SearchRecord,
  Toc,
  TocChapter,
  TocTopic,
  Topic,
} from '@/types/book';

export class ContractViolationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContractViolationError';
    this.path = path;
  }
}

const fail = (path: string, message: string): never => {
  throw new ContractViolationError(path, message);
};

const describe = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${String(value.length)})`;
  return typeof value;
};

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, `expected an object, received ${describe(value)}`);
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) return fail(path, `expected an array, received ${describe(value)}`);
  return value as readonly unknown[];
};

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') return fail(path, `expected a string, received ${describe(value)}`);
  return value;
};

const asStringArray = (value: unknown, path: string): readonly string[] =>
  asArray(value, path).map((item, index) => asString(item, `${path}[${String(index)}]`));

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(path, `expected a finite number, received ${describe(value)}`);
  }
  return value;
};

const asNullableNumber = (value: unknown, path: string): number | null =>
  value === null ? null : asNumber(value, path);

const asNullableString = (value: unknown, path: string): string | null =>
  value === null ? null : asString(value, path);

const asBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    return fail(path, `expected a boolean, received ${describe(value)}`);
  }
  return value;
};

/* -------------------------------------------------------------------------- */

const parseBlock = (value: unknown, path: string): Block => {
  const raw = asRecord(value, path);
  const type = asString(raw.type, `${path}.type`);

  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', text: asString(raw.text, `${path}.text`) };

    case 'list':
      return {
        type: 'list',
        ordered: asBoolean(raw.ordered, `${path}.ordered`),
        items: asStringArray(raw.items, `${path}.items`),
        start: asNullableNumber(raw.start ?? null, `${path}.start`),
      };

    case 'figure':
      return {
        type: 'figure',
        src: asString(raw.src, `${path}.src`),
        alt: asString(raw.alt, `${path}.alt`),
        caption: asNullableString(raw.caption, `${path}.caption`),
        width: asNumber(raw.width, `${path}.width`),
        height: asNumber(raw.height, `${path}.height`),
        page: asNumber(raw.page, `${path}.page`),
      };

    case 'table':
      return {
        type: 'table',
        headers: asStringArray(raw.headers, `${path}.headers`),
        rows: asArray(raw.rows, `${path}.rows`).map((row, index) =>
          asStringArray(row, `${path}.rows[${String(index)}]`),
        ),
      };

    case 'code':
      return {
        type: 'code',
        text: asString(raw.text, `${path}.text`),
        language: asNullableString(raw.language, `${path}.language`),
      };

    case 'heading':
      return {
        type: 'heading',
        level: asNumber(raw.level, `${path}.level`),
        text: asString(raw.text, `${path}.text`),
      };

    default:
      return fail(`${path}.type`, `unknown block type "${type}"`);
  }
};

const parseTopic = (value: unknown, path: string): Topic => {
  const raw = asRecord(value, path);
  return {
    id: asString(raw.id, `${path}.id`),
    title: asString(raw.title, `${path}.title`),
    isIntro: asBoolean(raw.isIntro, `${path}.isIntro`),
    blocks: asArray(raw.blocks, `${path}.blocks`).map((block, index) =>
      parseBlock(block, `${path}.blocks[${String(index)}]`),
    ),
  };
};

const parseChapter = (value: unknown, path: string): Chapter => {
  const raw = asRecord(value, path);
  return {
    id: asString(raw.id, `${path}.id`),
    number: asNullableNumber(raw.number, `${path}.number`),
    title: asString(raw.title, `${path}.title`),
    fullTitle: asString(raw.fullTitle, `${path}.fullTitle`),
    pageStart: asNumber(raw.pageStart, `${path}.pageStart`),
    pageEnd: asNumber(raw.pageEnd, `${path}.pageEnd`),
    topics: asArray(raw.topics, `${path}.topics`).map((topic, index) =>
      parseTopic(topic, `${path}.topics[${String(index)}]`),
    ),
  };
};

export const parseBook = (value: unknown): Book => {
  const raw = asRecord(value, 'book.json');
  return {
    title: asString(raw.title, 'book.json.title'),
    author: asString(raw.author, 'book.json.author'),
    generatedAt: asString(raw.generatedAt, 'book.json.generatedAt'),
    chapters: asArray(raw.chapters, 'book.json.chapters').map((chapter, index) =>
      parseChapter(chapter, `book.json.chapters[${String(index)}]`),
    ),
  };
};

const parseTocTopic = (value: unknown, path: string): TocTopic => {
  const raw = asRecord(value, path);
  return {
    id: asString(raw.id, `${path}.id`),
    title: asString(raw.title, `${path}.title`),
  };
};

const parseTocChapter = (value: unknown, path: string): TocChapter => {
  const raw = asRecord(value, path);
  return {
    id: asString(raw.id, `${path}.id`),
    number: asNullableNumber(raw.number, `${path}.number`),
    title: asString(raw.title, `${path}.title`),
    fullTitle: asString(raw.fullTitle, `${path}.fullTitle`),
    topics: asArray(raw.topics, `${path}.topics`).map((topic, index) =>
      parseTocTopic(topic, `${path}.topics[${String(index)}]`),
    ),
  };
};

export const parseToc = (value: unknown): Toc =>
  asArray(value, 'toc.json').map((chapter, index) =>
    parseTocChapter(chapter, `toc.json[${String(index)}]`),
  );

const parseSearchRecord = (value: unknown, path: string): SearchRecord => {
  const raw = asRecord(value, path);
  return {
    chapterId: asString(raw.chapterId, `${path}.chapterId`),
    chapterTitle: asString(raw.chapterTitle, `${path}.chapterTitle`),
    topicId: asString(raw.topicId, `${path}.topicId`),
    topicTitle: asString(raw.topicTitle, `${path}.topicTitle`),
    text: asString(raw.text, `${path}.text`),
  };
};

export const parseSearchIndex = (value: unknown): SearchIndex =>
  asArray(value, 'search.json').map((record, index) =>
    parseSearchRecord(record, `search.json[${String(index)}]`),
  );
