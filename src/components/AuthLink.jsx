import React, { useEffect } from 'react';
import { LogIn, LogOut, User, Sparkles } from 'lucide-react';
import { signInWithGoogle, signInWithGoogleToken, signOut } from '../utils/supabaseClient';

/**
 * ====================================================================
 * AuthLink Component
 * ====================================================================
 * Renders the top-right authentication status of the user, incorporating
 * Google One-Tap single-click authentication and official sign-in buttons.
 * ====================================================================
 */
export default function AuthLink({ user, onAuthChange }) {
  
  // Triggers the Google Auth Sign-in (Redirect Fallback)
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

  const isAnonymous = user?.is_anonymous || !user?.email;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Google One-Tap & Sign-in Button Initialization
  useEffect(() => {
    if (typeof window === 'undefined' || !window.google || !isAnonymous || !googleClientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          const { user: authedUser, error } = await signInWithGoogleToken(response.credential);
          if (authedUser) {
            onAuthChange(authedUser);
          } else if (error) {
            console.error('Google One-Tap token sign in failed:', error.message);
          }
        },
        auto_select: false, // Avoid immediately logging users in without their consent on reload
      });

      // Render official Google Sign-in button into our placeholder container
      const btnContainer = document.getElementById('google-signin-btn');
      if (btnContainer) {
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'medium',
          shape: 'pill',
          text: 'signin_with',
        });
      }

      // Display the Google One-Tap prompt overlay at the top-right
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.log('One-tap overlay skipped or hidden:', notification.getMomentType());
        }
      });
    } catch (e) {
      console.warn('Google Identity Client initialization error:', e);
    }
  }, [user, isAnonymous, googleClientId]);

  // 1. Not loaded or no user yet: show a placeholder
  if (!user) return null;

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
          
          {googleClientId ? (
            // Secure Placeholder container for official Google Button
            <div id="google-signin-btn" style={{ minHeight: '32px' }}></div>
          ) : (
            // Fallback OAuth Button if Client ID is not populated
            <button 
              className="btn btn-glass" 
              onClick={handleGoogleSignIn}
              title="Link Google Account to save game history"
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
            >
              <LogIn size={13} />
              <span>Connect Google</span>
            </button>
          )}
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
