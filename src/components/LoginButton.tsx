import { useAuth } from '../lib/useAuth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import styles from './LoginButton.module.css';

export function LoginButton() {
  const { user, signInWithGoogle, signOut } = useAuth();

  if (user) {
    return (
      <div className={styles.container}>
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className={styles.userPhoto}
          />
        )}
        <button
          onClick={signOut}
          className={styles.signOutButton}
        >
          <span>{user.displayName}</span>
          <FontAwesomeIcon icon={faRightFromBracket} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={signInWithGoogle}
      className={styles.signInButton}
    >
      <FontAwesomeIcon icon={faGoogle} />
      <span>Sign in with Google</span>
    </button>
  );
}
