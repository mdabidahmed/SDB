import { BlockList } from '@/components/blocks/BlockRenderer';
import styles from '@/components/reader/reader.module.css';
import { topicAnchorId } from '@/lib/navigation';
import type { Topic } from '@/types/book';

/**
 * One topic. The intro topic repeats the chapter title, which is already the
 * page `h1`, so its heading is omitted rather than duplicated.
 */
export const TopicSection = ({ topic }: { topic: Topic }): React.JSX.Element => (
  <section className={styles.topic} id={topicAnchorId(topic.id)} aria-labelledby={`${topicAnchorId(topic.id)}-title`}>
    <h2
      className={topic.isIntro ? 'sr-only' : styles.topicTitle}
      id={`${topicAnchorId(topic.id)}-title`}
    >
      {topic.title}
    </h2>
    <BlockList blocks={topic.blocks} />
  </section>
);
