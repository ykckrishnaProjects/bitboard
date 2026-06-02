import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Sparkles, Trophy, Handshake, RefreshCw, Compass } from 'lucide-react';
import { 
  signInAnonymously, 
  createGame, 
  fetchGame, 
  updateGameMove, 
  subscribeToGame,
  getTotalGamesCount,
  fetchUserGamesHistory,
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
  const [totalGames, setTotalGames] = useState(0);
  const [historyGames, setHistoryGames] = useState([]);

  // --- ENGINE REFERENCE ---
  // We initialize the chess.js engine once and store it in a Ref.
  // This ensures we always have the same rules validator across renders!
  const chessRef = useRef(new Chess());

  // ====================================================================
  // Side-Effect 1: Authentication on Load
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
      // Sync player roles in real-time
      setPlayers({ white: updatedGame.white_player_id, black: updatedGame.black_player_id });

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
  // Side-Effect 4: Fetch Stats & History on User Load / Room Reset
  // ====================================================================
  useEffect(() => {
    async function loadLobbyStats() {
      if (!gameCode) {
        const { count } = await getTotalGamesCount();
        setTotalGames(count);
        if (user?.id) {
          const { games } = await fetchUserGamesHistory(user.id);
          setHistoryGames(games);
        }
      }
    }
    loadLobbyStats();
  }, [user, gameCode]);  // ====================================================================
  // ROOM ACTIONS
  // ====================================================================  // Load game from database and handle user role assignment
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

    // Dynamic slot assignment
    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = session?.user?.id || user?.id || null;

    let currentWhite = game.white_player_id;
    let currentBlack = game.black_player_id;

    if (activeUserId) {
      if (!currentWhite) {
        // Assign creator/joining user to empty White slot
        currentWhite = activeUserId;
        await updateGameMove(code, game.fen, game.pgn, game.status, { white_player_id: activeUserId });
        setBoardOrientation('w');
      } else if (currentWhite === activeUserId) {
        setBoardOrientation('w');
      } else if (!currentBlack) {
        // Assign opponent to empty Black slot
        currentBlack = activeUserId;
        await updateGameMove(code, game.fen, game.pgn, game.status, { black_player_id: activeUserId });
        setBoardOrientation('b');
      } else if (currentBlack === activeUserId) {
        setBoardOrientation('b');
      } else {
        // Spectator
        setBoardOrientation('w');
      }
    } else {
      setBoardOrientation('w');
    }

    setPlayers({ white: currentWhite, black: currentBlack });
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

  const handleMakeMove = async (moveObj) => {
    try {
      // Role & turn enforcement
      const activeColor = chessRef.current.turn(); // 'w' or 'b'
      const isWhiteTurn = activeColor === 'w';

      if (isWhiteTurn && user?.id !== players.white) {
        console.warn("Move blocked: It is White's turn, but you are not the White player.");
        return;
      }
      if (!isWhiteTurn && user?.id !== players.black) {
        console.warn("Move blocked: It is Black's turn, but you are not the Black player.");
        return;
      }

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
  // Parse moves history strings into simple arrays for PGN display (stripping headers)
  const getMovesList = () => {
    if (!pgn) return [];
    
    // Strip metadata headers (lines starting with [)
    const cleanPgn = pgn
      .split('\n')
      .filter(line => !line.trim().startsWith('['))
      .join(' ');

    // Parses PGN string (e.g. "1. e4 e5 2. Nf3") into moves array
    return cleanPgn
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
          <span className="logo-icon">🏁</span>
          <span className="logo-title">BitBoard</span>
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

          {totalGames > 0 && (
            <div style={{ display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: '6px', background: 'rgba(226, 193, 117, 0.1)', border: '1px solid rgba(226, 193, 117, 0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 600 }}>
              <Sparkles size={12} />
              <span>{totalGames.toLocaleString()} games played globally</span>
            </div>
          )}

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

          {/* User History List */}
          {historyGames.length > 0 && (
            <div style={{ textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginTop: '10px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Your Recent Games</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                {historyGames.map((g) => (
                  <div 
                    key={g.id} 
                    onClick={() => {
                      const newUrl = `${window.location.origin}/?game=${g.code}`;
                      window.history.pushState({ path: newUrl }, '', newUrl);
                      loadGameRoom(g.code);
                    }} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '8px 12px', 
                      background: 'rgba(255, 255, 255, 0.03)', 
                      border: '1px solid rgba(255, 255, 255, 0.05)', 
                      borderRadius: '8px', 
                      cursor: 'pointer'
                    }} 
                    className="history-item-hover"
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>{g.code}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Status: {g.status.replace('_', ' ')}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(g.updated_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

            {/* Dynamic Role Indicator Badge */}
            <div style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              background: 'rgba(255, 255, 255, 0.03)', 
              border: '1px solid rgba(255, 255, 255, 0.05)', 
              borderRadius: '20px', 
              padding: '4px 12px', 
              marginBottom: '10px', 
              display: 'flex', 
              gap: '4px',
              fontFamily: 'var(--font-display)',
              fontWeight: 500
            }}>
              {user?.id === players.white && <span>⚪ Playing as <strong style={{ color: 'var(--text-primary)' }}>White</strong></span>}
              {user?.id === players.black && <span>⚫ Playing as <strong style={{ color: 'var(--text-primary)' }}>Black</strong></span>}
              {user?.id !== players.white && user?.id !== players.black && <span style={{ color: 'var(--accent-gold)' }}>👁️ Spectating (Read-Only Mode)</span>}
            </div>

            {/* Custom Chessboard Grid Component */}
            <Chessboard 
              gameEngine={chessRef.current}
              fen={fen}
              orientation={boardOrientation}
              onMakeMove={handleMakeMove}
              disabled={gameStatus !== 'active' || user?.id !== (chessRef.current.turn() === 'w' ? players.white : players.black)}
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
            {/* Share, Resign, and Reset controls panel - allowed for either player at any time */}
            <GameControls 
              gameCode={gameCode}
              onResign={handleResign}
              onDraw={handleDraw}
              onNewGame={handleStartNewGame}
              disabled={gameStatus !== 'active' || (user?.id !== players.white && user?.id !== players.black)}
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
