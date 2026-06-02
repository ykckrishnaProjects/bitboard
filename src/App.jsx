import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Sparkles, Trophy, Handshake, RefreshCw, Compass } from 'lucide-react';
import { 
  signInAnonymously, 
  createGame, 
  fetchGame, 
  updateGameMove, 
  subscribeToGame,
  supabase
} from './utils/supabaseClient';
import AuthLink from './components/AuthLink';
import Chessboard from './components/Chessboard';
import MoveHistory from './components/MoveHistory';
import GameControls from './components/GameControls';

// A starting default FEN string representing a standard chess board
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * ====================================================================
 * App Orchestrator Component
 * ====================================================================
 * The central controller of the GlowChess application. It orchestrates
 * authentication, routing, local chess rules engines, and real-time syncing.
 *
 * React Concepts Covered:
 * 1. `useRef` vs. `useState`:
 *    - `useState` is used for variables that change the visual UI (like FEN, status).
 *    - `useRef` is used to hold the `Chess` engine instance. The engine contains
 *      mutable internal states (like castling rights) that don't need to trigger
 *      re-renders.
 * 2. `useEffect` for Lifecycles & Side Effects:
 *    - Side-Effect 1: Run Anonymous Login on page load.
 *    - Side-Effect 2: Connect to a game room when the URL query changes.
 *    - Side-Effect 3: Subscribe to real-time Supabase broadcasts when inside a room.
 * ====================================================================
 */
export default function App() {
  // --- STATE DECLARATIONS ---
  const [user, setUser] = useState(null);
  const [gameCode, setGameCode] = useState('');
  const [fen, setFen] = useState(STARTING_FEN);
  const [pgn, setPgn] = useState('');
  const [gameStatus, setGameStatus] = useState('active'); // active, draw, resigned_white, resigned_black, checkmate_white, checkmate_black
  const [boardOrientation, setBoardOrientation] = useState('w'); // 'w' or 'b'
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState({ white: null, black: null });

  // --- ENGINE REFERENCE ---
  // We initialize the chess.js engine once and store it in a Ref.
  // This ensures we always have the same rules validator across renders!
  const chessRef = useRef(new Chess());

  // ====================================================================
  // Side-Effect 1: Authenticaton on Load
  // ====================================================================
  useEffect(() => {
    async function initAuth() {
      // Sign in user anonymously if no active session exists
      const { user: authedUser } = await signInAnonymously();
      setUser(authedUser);

      // Listen for auth state changes (e.g. if the user clicks "Connect Google")
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
    initAuth();
  }, []);

  // ====================================================================
  // Side-Effect 2: Room Routing & State Sync
  // ====================================================================
  // Extracts shortcode from window URL query (e.g. `/?game=XXXXXX`) and loads it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('game');

    if (codeParam) {
      loadGameRoom(codeParam.toUpperCase());
    } else {
      // Clear game states if on home screen
      setGameCode('');
      setFen(STARTING_FEN);
      setPgn('');
      setGameStatus('active');
      chessRef.current.reset();
    }
  }, [window.location.search]);

  // ====================================================================
  // Side-Effect 3: Realtime Database Connection
  // ====================================================================
  // Listens to database UPDATE broadcasts. Whenever the opponent makes a move,
  // this hook fires and updates our local board without refreshing!
  useEffect(() => {
    if (!gameCode) return;

    // Establish WebSocket subscription
    const subscription = subscribeToGame(gameCode, (updatedGame) => {
      // Check if received FEN is newer than our local FEN
      if (updatedGame.fen !== fen) {
        setFen(updatedGame.fen);
        setPgn(updatedGame.pgn);
        setGameStatus(updatedGame.status);
        
        // Load the new FEN position into our local rules engine
        chessRef.current.load(updatedGame.fen);
      }
    });

    // Cleanup: Unsubscribe when the component unmounts or room changes
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [gameCode, fen]);

  // ====================================================================
  // ROOM ACTIONS
  // ====================================================================

  // Load game from database
  const loadGameRoom = async (code) => {
    setLoading(true);
    const { game, error } = await fetchGame(code);
    
    if (error || !game) {
      alert('Chess room not found or connection error!');
      // Return to lobby
      window.history.pushState({}, '', window.location.origin);
      setGameCode('');
      setLoading(false);
      return;
    }

    setGameCode(game.code);
    setFen(game.fen);
    setPgn(game.pgn);
    setGameStatus(game.status);
    
    // Sync the local engine with loaded position
    chessRef.current.load(game.fen);
    
    setLoading(false);
  };

  // Helper to generate a random 6-character room shortcode
  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Cleaned characters (no confusing 0, O, 1, I)
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Create a brand new chess room
  const handleStartNewGame = async () => {
    setLoading(true);
    const newCode = generateRandomCode();
    
    // Create the DB record
    const { game, error } = await createGame(newCode, user?.id || null);
    
    if (error) {
      alert(`Failed to spin up a new chess room! Error: ${error.message}`);
      setLoading(false);
      return;
    }

    // Set URL query parameter and update history state without full page reload
    const newUrl = `${window.location.origin}/?game=${newCode}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    setGameCode(newCode);
    setFen(STARTING_FEN);
    setPgn('');
    setGameStatus('active');
    setBoardOrientation('w'); // Creator is White by default
    chessRef.current.reset();
    setLoading(false);
  };

  // ====================================================================
  // CHESS GAMEPLAY HANDLERS
  // ====================================================================

  // Fired when player drags/taps a piece to make a move on the Chessboard component
  const handleMakeMove = async (moveObj) => {
    try {
      // Validate move locally using chess.js engine
      const move = chessRef.current.move(moveObj);
      
      // If move is illegal, block it
      if (!move) return;

      // Extract new states
      const newFen = chessRef.current.fen();
      const newPgn = chessRef.current.pgn();
      let newStatus = 'active';

      // Check for Game Ending conditions
      if (chessRef.current.isCheckmate()) {
        // Active turn is the player who has no moves, i.e. who is checkmated!
        newStatus = chessRef.current.turn() === 'w' ? 'checkmate_black' : 'checkmate_white';
      } else if (
        chessRef.current.isDraw() ||
        chessRef.current.isStalemate() ||
        chessRef.current.isThreefoldRepetition() ||
        chessRef.current.isInsufficientMaterial()
      ) {
        newStatus = 'draw';
      }

      // 1. Instantly update local react state (Optimistic Update)
      setFen(newFen);
      setPgn(newPgn);
      setGameStatus(newStatus);

      // 2. Persist move to Supabase (Broadcasts to opponent instantly!)
      await updateGameMove(gameCode, newFen, newPgn, newStatus);

    } catch (e) {
      console.error('Invalid move attempt:', e.message);
    }
  };

  // Declare Resignation
  const handleResign = async () => {
    // Current turn resigns
    const currentTurn = chessRef.current.turn();
    const newStatus = currentTurn === 'w' ? 'resigned_white' : 'resigned_black';
    
    setGameStatus(newStatus);
    await updateGameMove(gameCode, fen, pgn, newStatus);
  };

  // Declare Draw
  const handleDraw = async () => {
    setGameStatus('draw');
    await updateGameMove(gameCode, fen, pgn, 'draw');
  };

  // Return to Lobby / Clear URL query
  const handleExitToLobby = () => {
    window.history.pushState({}, '', window.location.origin);
    setGameCode('');
    setFen(STARTING_FEN);
    setPgn('');
    setGameStatus('active');
    chessRef.current.reset();
  };

  // Toggle visual board perspective (flip A-H / 1-8 coords)
  const handleFlipBoard = () => {
    setBoardOrientation(prev => prev === 'w' ? 'b' : 'w');
  };

  // Parse moves history strings into simple arrays for PGN display
  const getMovesList = () => {
    if (!pgn) return [];
    // Parses PGN string (e.g. "1. e4 e5 2. Nf3") into moves array
    // Remaps out the numbering e.g. "1. e4 e5" => ["e4", "e5"]
    return pgn
      .replace(/\d+\.\s+/g, '') // remove "1. ", "2. "
      .split(/\s+/) // split on whitespace
      .filter(m => m.trim().length > 0);
  };

  const movesList = getMovesList();

  // --- GAME OVER MODAL CALCULATORS ---
  const getGameOverOverlay = () => {
    if (gameStatus === 'active') return null;

    let title = 'Game Over';
    let description = '';
    let icon = <Trophy size={48} style={{ color: 'var(--accent-gold)' }} />;

    if (gameStatus === 'checkmate_white') {
      title = 'White Wins!';
      description = 'Checkmate. White successfully captured the Black King.';
    } else if (gameStatus === 'checkmate_black') {
      title = 'Black Wins!';
      description = 'Checkmate. Black successfully captured the White King.';
    } else if (gameStatus === 'resigned_white') {
      title = 'Black Wins!';
      description = 'White player resigned the match.';
    } else if (gameStatus === 'resigned_black') {
      title = 'White Wins!';
      description = 'Black player resigned the match.';
    } else if (gameStatus === 'draw') {
      title = 'Draw Match';
      description = 'The match concluded in a draw (Stalemate, Threefold, or Agreement).';
      icon = <Handshake size={48} style={{ color: 'var(--text-secondary)' }} />;
    }

    return (
      <div className="overlay-screen">
        <div className="overlay-modal glass-panel">
          <div style={{ marginBottom: '16px' }}>{icon}</div>
          <h2 className="overlay-title">{title}</h2>
          <p className="overlay-desc">{description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn btn-primary" onClick={handleExitToLobby}>
              <span>Create New Game</span>
            </button>
            <button className="btn btn-glass" onClick={() => setGameStatus('active')}>
              <span>Review Board</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- MAIN RENDER ---
  return (
    <div className="app-container">
      
      {/* 1. APP HEADER */}
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-icon">👑</span>
          <span className="logo-title">GlowChess</span>
        </div>
        
        {/* Supabase Authenticator Link Component */}
        <AuthLink user={user} onAuthChange={setUser} />
      </header>

      {/* Loading Overlay */}
      {loading && (
        <div className="overlay-screen" style={{ background: 'rgba(4,6,12,0.6)', zIndex: 2000 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <RefreshCw className="spin" size={32} style={{ color: 'var(--accent-gold)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Syncing Chess State...</span>
          </div>
        </div>
      )}

      {/* 2. GAME OVER OVERLAY */}
      {getGameOverOverlay()}

      {/* 3. LOBBY OR GAMEPLAY VIEW */}
      {!gameCode ? (
        // ====================================================================
        // VIEW A: Home Lobby Screen
        // ====================================================================
        <div className="lobby-view glass-panel">
          <div className="lobby-hero">🏆</div>
          <h1 className="lobby-title">Instant Multiplayer Chess</h1>
          <p className="lobby-desc">
            No emails, no passwords. Create a chess room instantly, share the unique URL shortcode with a friend, and play in real-time.
          </p>

          <button 
            className="btn btn-primary" 
            onClick={handleStartNewGame}
            style={{ padding: '14px 28px', fontSize: '16px', marginTop: '10px' }}
          >
            <Compass size={18} />
            <span>Create Chessboard</span>
          </button>
          
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 0 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Looking to resume a game? Paste the unique share URL into your browser!
            </span>
          </div>
        </div>
      ) : (
        // ====================================================================
        // VIEW B: Active Chessboard Gameplay Screen
        // ====================================================================
        <div className="game-area">
          
          {/* Column 1: Board UI, Turn Pill, Captured trays */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {/* Active Turn HUD Bar */}
            <div className="status-bar glass-panel">
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Room:</span>
                <strong style={{ color: 'var(--accent-gold)' }}>{gameCode}</strong>
              </span>

              {/* Turn pill indicator */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <div className={`turn-pill white ${chessRef.current.turn() === 'w' ? 'active' : ''}`}>
                  <div className="turn-dot" />
                  <span>White</span>
                </div>
                <div className={`turn-pill black ${chessRef.current.turn() === 'b' ? 'active' : ''}`}>
                  <div className="turn-dot" />
                  <span>Black</span>
                </div>
              </div>
            </div>

            {/* Custom Chessboard Grid Component */}
            <Chessboard 
              gameEngine={chessRef.current}
              fen={fen}
              orientation={boardOrientation}
              onMakeMove={handleMakeMove}
              disabled={gameStatus !== 'active'}
            />

            {/* Helper Utility Buttons directly below the board */}
            <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '500px', marginTop: '10px' }}>
              <button 
                className="btn btn-glass" 
                onClick={handleFlipBoard}
                style={{ flexGrow: 1, padding: '8px 12px', fontSize: '12px' }}
              >
                🔄 Flip Perspective
              </button>
              <button 
                className="btn btn-glass" 
                onClick={handleExitToLobby}
                style={{ padding: '8px 12px', fontSize: '12px' }}
              >
                🚪 Exit
              </button>
            </div>

          </div>

          {/* Column 2: Game Controls and Move History panels */}
          <div className="sidebar-panel">
            {/* Share, Resign, and Reset controls panel */}
            <GameControls 
              gameCode={gameCode}
              onResign={handleResign}
              onDraw={handleDraw}
              onNewGame={handleStartNewGame}
              disabled={gameStatus !== 'active'}
            />

            {/* Auto-scrolling algebraic moves list panel */}
            <MoveHistory 
              moves={movesList}
              pgnString={pgn}
              isUserAnonymous={user?.is_anonymous ?? true}
            />
          </div>

        </div>
      )}

    </div>
  );
}
