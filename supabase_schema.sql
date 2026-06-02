-- ====================================================================
-- GlowChess - PostgreSQL Database Schema
-- ====================================================================
-- This SQL script sets up the "games" table in your Supabase database.
-- You can copy-paste this entire script directly into the "SQL Editor"
-- tab in your Supabase Dashboard!
--
-- Postgres Concepts Covered:
-- 1. UUIDs & Primary Keys: Automatic random UUIDs for row uniqueness.
-- 2. Unique Indexes: Creating a fast lookup index on the "code" shortlink.
-- 3. Defaults & Modifiers: Default FEN for a starting chessboard, non-nullable status.
-- 4. Realtime Replication: Activating Supabase Realtime so changes broadcast to clients.
-- ====================================================================

-- 1. Create the "games" table
CREATE TABLE IF NOT EXISTS public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- The unique shortcode (e.g. "G6A9FX") used in the URL to share/resume the game.
  -- We apply a UNIQUE constraint to guarantee no two active rooms share a code.
  code VARCHAR(10) UNIQUE NOT NULL,
  
  -- The current chess board position represented in FEN (Forsyth-Edwards Notation).
  -- Default is the standard starting position of a chess game.
  fen VARCHAR(255) NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  
  -- The chronological history of all moves represented in standard PGN format.
  pgn TEXT NOT NULL DEFAULT '',
  
  -- Auth ID references: Allows us to bind a game to authenticated accounts.
  -- We use NULLABLE fields because players can start anonymous games instantly!
  white_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  black_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Current status of the match: 'active', 'checkmate_white' (white won), 
  -- 'checkmate_black', 'draw', 'resigned_white', 'resigned_black'
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  
  -- Timestamps to track creation and latest move updates
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create index on the 'code' column for ultra-fast queries
-- Since users load games via /?game=CODE, Postgres will query this index
-- in O(log N) time instead of doing a full table scan.
CREATE INDEX IF NOT EXISTS games_code_idx ON public.games (code);

-- 3. Enable Realtime Replication
-- In Supabase, Postgres databases do not broadcast changes by default.
-- We must explicitly add our 'games' table to the 'supabase_realtime' publication.
-- This tells the Postgres Write-Ahead Log (WAL) to notify Supabase's Realtime
-- websockets service whenever a row is INSERTed, UPDATEd, or DELETEd.
alter publication supabase_realtime add table games;

-- 4. Set up Row Level Security (RLS)
-- To allow frictionless public anonymous play, we enable RLS and add policies
-- permitting public SELECTs and UPDATEs on any game, while preventing full deletion.
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Policy A: Anyone can read a game state if they know the shortcode
CREATE POLICY "Allow public read access to games by code" 
  ON public.games
  FOR SELECT 
  TO public
  USING (true);

-- Policy B: Anyone can update a game state (make moves) as long as it's active
CREATE POLICY "Allow public update access to active games" 
  ON public.games
  FOR UPDATE
  TO public
  USING (status = 'active')
  WITH CHECK (status = 'active' OR status IN ('checkmate_white', 'checkmate_black', 'draw', 'resigned_white', 'resigned_black'));

-- Policy C: Anyone can create a new game
CREATE POLICY "Allow public insert access to create games" 
  ON public.games
  FOR INSERT
  TO public
  WITH CHECK (true);

-- 5. Explicitly grant permissions on the table to API roles
-- Usually Supabase handles this, but in strict/custom databases, we must explicitly
-- grant table access to public roles (anon and authenticated) so queries don't hit
-- "permission denied" blocks. RLS will still protect updates!
GRANT ALL ON public.games TO anon, authenticated, service_role;
