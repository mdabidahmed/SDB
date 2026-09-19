import { FigureView } from '@/components/blocks/FigureView';
import styles from '@/components/blocks/blocks.module.css';
import { cx } from '@/lib/cx';
import type {
  Block,
  CodeBlock,
  HeadingBlock,
  ListBlock,
  ParagraphBlock,
  TableBlock,
} from '@/types/book';

/* Every renderer below prints its strings unmodified. */

const Paragraph = ({ block }: { block: ParagraphBlock }): React.JSX.Element => (
  <p className={styles.paragraph}>{block.text}</p>
);

const ListView = ({ block }: { block: ListBlock }): React.JSX.Element => {
  const items = block.items.map((item, index) => <li key={index}>{item}</li>);

  // `start` carries the book's real first ordinal; dropping it would renumber
  // the list from 1 and misprint the page.
  return block.ordered ? (
    <ol
      className={cx(styles.list, styles.ordered)}
      {...(block.start === null ? {} : { start: block.start })}
    >
      {items}
    </ol>
  ) : (
    <ul className={cx(styles.list, styles.unordered)}>{items}</ul>
  );
};

/** Topic titles are `h2`, so the contract's level-3 sub-headings stay `h3`. */
const Heading = ({ block }: { block: HeadingBlock }): React.JSX.Element => {
  const id = headingId(block.text);
  if (block.level <= 3) return <h3 className={styles.heading} id={id}>{block.text}</h3>;
  if (block.level === 4) return <h4 className={styles.heading} id={id}>{block.text}</h4>;
  return <h5 className={styles.heading} id={id}>{block.text}</h5>;
};

const headingId = (text: string): string =>
  `h-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

const Code = ({ block }: { block: CodeBlock }): React.JSX.Element => (
  <pre className={styles.pre}>
    <code {...(block.language === null ? {} : { className: `language-${block.language}` })}>
      {block.text}
    </code>
  </pre>
);

const Table = ({ block }: { block: TableBlock }): React.JSX.Element => (
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-reachable
  <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="Table">
    <table className={styles.table}>
      {block.headers.length > 0 && (
        <thead>
          <tr>
            {block.headers.map((header, index) => (
              <th key={index} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const BlockRenderer = ({ block }: { block: Block }): React.JSX.Element | null => {
  switch (block.type) {
    case 'paragraph':
      return <Paragraph block={block} />;
    case 'list':
      return <ListView block={block} />;
    case 'figure':
      return <FigureView block={block} />;
    case 'heading':
      return <Heading block={block} />;
    case 'code':
      return <Code block={block} />;
    case 'table':
      return <Table block={block} />;
    default:
      return null;
  }
};

export const BlockList = ({ blocks }: { blocks: readonly Block[] }): React.JSX.Element => (
  <>
    {blocks.map((block, index) => (
      <BlockRenderer key={index} block={block} />
    ))}
  </>
);
