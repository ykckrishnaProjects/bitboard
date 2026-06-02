import React from 'react';
import { LogIn, LogOut, User, Sparkles } from 'lucide-react';
import { signInWithGoogle, signOut } from '../utils/supabaseClient';

/**
 * ====================================================================
 * AuthLink Component
 * ====================================================================
 * Renders the top-right authentication status of the user.
 * 
 * React Concepts Covered:
 * 1. Conditional Rendering: Showing different buttons based on the user's auth state.
 * 2. Destructuring Props: Accessing the current `user` object passed from the parent App state.
 * 3. Handling Side Effects: Calling asynchronous authentication functions.
 * ====================================================================
 */
export default function AuthLink({ user, onAuthChange }) {
  
  // Triggers the Google Auth Sign-in
  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      alert('Failed to connect to Google Auth: ' + error.message);
    }
  };

  // Triggers the Logout event
  const handleSignOut = async () => {
    if (confirm('Are you sure you want to log out? Any anonymous game session may be lost.')) {
      await signOut();
      onAuthChange(null);
    }
  };

  // 1. Not loaded or no user yet: we show a loading or simple spacer
  if (!user) return null;

  const isAnonymous = user.is_anonymous || !user.email;

  return (
    <div className="auth-section">
      {isAnonymous ? (
        // Case A: User is logged in Anonymously
        <>
          <div className="auth-user-pill">
            <div className="auth-dot anon"></div>
            <User size={12} style={{ color: 'var(--text-muted)' }} />
            <span>Guest Player</span>
          </div>
          
          <button 
            className="btn btn-glass" 
            onClick={handleGoogleSignIn}
            title="Link Google Account to save game history"
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
          >
            <LogIn size={13} />
            <span>Connect Google</span>
          </button>
        </>
      ) : (
        // Case B: User is fully logged in via Google Auth
        <>
          <div className="auth-user-pill" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
            <div className="auth-dot"></div>
            {user.user_metadata?.avatar_url ? (
              <img 
                src={user.user_metadata.avatar_url} 
                alt="Avatar" 
                style={{ width: '16px', height: '16px', borderRadius: '50%' }} 
              />
            ) : (
              <Sparkles size={12} style={{ color: 'var(--accent-gold)' }} />
            )}
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {user.user_metadata?.full_name || user.email.split('@')[0]}
            </span>
          </div>

          <button 
            className="btn btn-glass btn-danger" 
            onClick={handleSignOut}
            title="Sign Out"
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', background: 'transparent' }}
          >
            <LogOut size={13} />
            <span>Logout</span>
          </button>
        </>
      )}
    </div>
  );
}
