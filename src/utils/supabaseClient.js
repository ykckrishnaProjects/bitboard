import { createClient } from '@supabase/supabase-js';

// ====================================================================
// GlowChess - Supabase Client & Realtime Sync Service
// ====================================================================
// This file initializes the Supabase client and provides CRUD operations
// along with Realtime channel subscription methods for multiplayer syncing.
//
// Concepts Covered:
// 1. Environment Variables in Vite: We use `import.meta.env.VITE_...`
// 2. Anonymous Auth Session Persistence: Supabase Auth saves JWT tokens in LocalStorage automatically.
// 3. PostgreSQL Change Listening: Listen to row-level changes in real-time.
// ====================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Fallback warning if environment variables are missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are missing! Realtime sync will not work. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
  );
}

// 1. Initialize the Supabase Client
// The client holds database connection settings and credentials. It automatically
// injects authorization headers (JWT tokens) in requests when a user is signed in.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 2. Frictionless Anonymous Auth
 * Signs the user in without passwords/emails. Supabase creates a unique
 * temporary user record in the `auth.users` table, which is persisted locally.
 */
export async function signInAnonymously() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session) {
      // User is already logged in (anonymous or google)
      return { user: session.user, error: null };
    }
    
    // Perform anonymous sign-in
    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) throw signInError;
    return { user: data.user, error: null };
  } catch (error) {
    console.error('Anonymous auth failure:', error.message);
    return { user: null, error };
  }
}

/**
 * 3. OAuth Google Sign-in
 * Triggers a browser redirect to Google's authentication provider.
 * Once completed, the user is redirected back to the app with a linked session.
 */
export async function signInWithGoogle() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // Returns user back to this domain after login
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Google OAuth failure:', error.message);
    return { data: null, error };
  }
}

/**
 * Helper to log out current session
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Sign out error:', error.message);
}

/**
 * 4. Create New Game Room
 * Inserts a new game record in the Postgres table with a starting state.
 */
export async function createGame(code, whitePlayerId = null) {
  try {
    const { data, error } = await supabase
      .from('games')
      .insert([
        {
          code: code.toUpperCase(),
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Starting position
          pgn: '',
          white_player_id: whitePlayerId,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single(); // Returns the single created record instead of an array

    if (error) throw error;
    return { game: data, error: null };
  } catch (error) {
    console.error('Error creating game record:', error.message);
    return { game: null, error };
  }
}

/**
 * 5. Fetch Existing Game Room
 * Queries the PostgreSQL table to load the board position.
 */
export async function fetchGame(code) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error) throw error;
    return { game: data, error: null };
  } catch (error) {
    console.error('Error fetching game details:', error.message);
    return { game: null, error };
  }
}

/**
 * 6. Update Game State (Atomically make a chess move)
 * Performs a SQL UPDATE to set the new board position (FEN), moves history (PGN), and status.
 */
export async function updateGameMove(code, fen, pgn, status = 'active', playerUpdates = {}) {
  try {
    const updateData = {
      fen,
      pgn,
      status,
      updated_at: new Date().toISOString(),
      ...playerUpdates
    };

    const { data, error } = await supabase
      .from('games')
      .update(updateData)
      .eq('code', code.toUpperCase())
      .select()
      .single();

    if (error) throw error;
    return { game: data, error: null };
  } catch (error) {
    console.error('Error saving move:', error.message);
    return { game: null, error };
  }
}

/**
 * 7. Establish Realtime Sync Subscription
 * Opens a persistent WebSocket channel targeting database changes.
 * Under the hood, Supabase listens to the Postgres Write-Ahead Log (WAL)
 * and pushes updates to this specific channel.
 *
 * @param {string} code - The game shortcode to subscribe to.
 * @param {function} onUpdate - Callback function invoked whenever an UPDATE occurs.
 * @returns {object} Subscription instance (to allow cleaning up / unsubscribing).
 */
export function subscribeToGame(code, onUpdate) {
  // Create a channel name unique to the game room
  const channelName = `game_room_${code.toUpperCase()}`;

  const subscription = supabase
    .channel(channelName)
    // Register interest in Postgres Changes matching our table and filter
    .on(
      'postgres_changes',
      {
        event: 'UPDATE', // We only care about edits/moves
        schema: 'public',
        table: 'games',
        filter: `code=eq.${code.toUpperCase()}`, // Wildcard filter on the game's shortcode
      },
      (payload) => {
        // payload.new contains the updated row fields
        onUpdate(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to realtime channel for game: ${code}`);
      }
    });

  // Return the subscription so the React component can call subscription.unsubscribe() on unmount
  return subscription;
}

/**
 * 8. Get Total Games Count
 * Returns the exact count of all matches registered in the 'games' table.
 */
export async function getTotalGamesCount() {
  try {
    const { count, error } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return { count: count || 0, error: null };
  } catch (error) {
    console.error('Error fetching total games count:', error.message);
    return { count: 0, error };
  }
}

/**
 * 9. Fetch User Games History
 * Returns active and completed games where the user is either the White or Black player.
 */
export async function fetchUserGamesHistory(userId) {
  try {
    if (!userId) return { games: [], error: null };
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(10); // Limit to top 10 recent games for clean UI
    
    if (error) throw error;
    return { games: data || [], error: null };
  } catch (error) {
    console.error('Error fetching user games history:', error.message);
    return { games: [], error };
  }
}
