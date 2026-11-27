import styles from './Avatar.module.css';

/** The first letter of a name in a circle. Decorative: the name is always written beside it. */
export function Avatar({
  name,
  large = false,
  onInset = false,
}: {
  name: string;
  large?: boolean;
  onInset?: boolean;
}) {
  const classes = [styles.avatar, large && styles.large, onInset && styles.onInset];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
