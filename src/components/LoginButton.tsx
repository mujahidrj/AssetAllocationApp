import { useAuth } from '../lib/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';

export function LoginButton() {
  const { user, signInWithGoogle, signOut } = useAuth();

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.photoURL && (
          <img 
            src={user.photoURL} 
            alt={user.displayName || 'User'} 
            className="w-8 h-8 rounded-full"
          />
        )}
        <button
          onClick={signOut}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={signInWithGoogle}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
    >
      <FontAwesomeIcon icon={faGoogle} />
      <span>Sign in with Google</span>
    </button>
  );
}
