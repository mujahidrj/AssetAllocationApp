import { LoginButton } from '../../LoginButton';
import styles from './Header.module.css';

export function Header() {
  return (
    <div className={styles.header}>
      <h1 className={styles.heading}>Asset Allocation Calculator</h1>
      <LoginButton />
    </div>
  );
}
