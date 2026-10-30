import styles from './Inspector.module.css';

export function Inspector() {
  return (
    <aside className={styles.inspector} aria-label="Inspector">
      <h2 className={styles.title}>Inspector</h2>
      <p className={styles.body}>Details for the selected item appear here.</p>
    </aside>
  );
}
