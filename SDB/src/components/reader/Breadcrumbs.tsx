import { Link } from 'react-router-dom';

import styles from '@/components/reader/reader.module.css';
import { ChevronIcon } from '@/components/ui/icons';

export interface Crumb {
  readonly label: string;
  readonly to?: string;
}

export const Breadcrumbs = ({ items }: { items: readonly Crumb[] }): React.JSX.Element => (
  <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
    <ol className={styles.crumbList}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className={styles.crumb}>
          {index > 0 && <ChevronIcon size={13} className={styles.crumbSep} />}
          {item.to === undefined ? (
            <span aria-current="page" className={styles.crumbCurrent}>
              {item.label}
            </span>
          ) : (
            <Link to={item.to}>{item.label}</Link>
          )}
        </li>
      ))}
    </ol>
  </nav>
);
