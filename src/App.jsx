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
import VoiceController from './components/VoiceController';

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
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [gameCode, setGameCode] = useState('');
  const [fen, setFen] = useState(STARTING_FEN);
  const [pgn, setPgn] = useState('');
  const [gameStatus, setGameStatus] = useState('active'); // active, draw, resigned_white, resigned_black, checkmate_white, checkmate_black
  const [boardOrientation, setBoardOrientation] = useState('w'); // 'w' or 'b'
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState({ white: null, black: null });
  const [totalGames, setTotalGames] = useState(0);
  const [historyGames, setHistoryGames] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [botDifficulty, setBotDifficulty] = useState(3); // Default Level 3

  // --- ENGINE REFERENCE ---
  // We initialize the chess.js engine once and store it in a Ref.
  // This ensures we always have the same rules validator across renders!
  const chessRef = useRef(new Chess());
  const stockfishRef = useRef(null);
  const moveSoundRef = useRef(new Audio('https://lichess1.org/assets/sound/standard/Move.mp3'));
  const captureSoundRef = useRef(new Audio('https://lichess1.org/assets/sound/standard/Capture.mp3'));

  const syncEngine = (fen, pgn) => {
    if (pgn) {
      try {
        chessRef.current.loadPgn(pgn);
      } catch (e) {
        console.warn("Could not load PGN, falling back to FEN:", e);
        chessRef.current.load(fen);
      }
    } else {
      chessRef.current.load(fen);
    }
  };

  const initStockfish = () => {
    if (stockfishRef.current) return stockfishRef.current;
    
    try {
      const worker = new Worker('/stockfish.js');
      worker.postMessage('uci');
      worker.postMessage('isready');
      stockfishRef.current = worker;
      return worker;
    } catch (e) {
      console.error('Failed to initialize Stockfish worker:', e);
      return null;
    }
  };

  const makeBotMove = () => {
    const worker = initStockfish();
    if (!worker) return;
    
    worker.onmessage = (event) => {
      const line = event.data;
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const bestMove = parts[1];
        if (bestMove && bestMove !== '(none)') {
          applyBotMove(bestMove);
        }
      }
    };
    
    worker.postMessage(`position fen ${chessRef.current.fen()}`);
    const searchDepth = botDifficulty * 2;
    worker.postMessage(`go depth ${searchDepth}`);
  };

  const applyBotMove = (bestMove) => {
    try {
      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined;
      
      const move = chessRef.current.move({ from, to, promotion });
      if (!move) return;
      
      playMoveSound(!!move.captured);
      
      const newFen = chessRef.current.fen();
      const newPgn = chessRef.current.pgn();
      
      let newStatus = 'active';
      if (chessRef.current.isCheckmate()) {
        newStatus = chessRef.current.turn() === 'w' ? 'checkmate_black' : 'checkmate_white';
      } else if (
        chessRef.current.isDraw() ||
        chessRef.current.isStalemate() ||
        chessRef.current.isThreefoldRepetition() ||
        chessRef.current.isInsufficientMaterial()
      ) {
        newStatus = 'draw';
      }
      
      setFen(newFen);
      setPgn(newPgn);
      setGameStatus(newStatus);
    } catch (e) {
      console.error('Failed to apply bot move:', e);
    }
  };

  // Bot calculation trigger side-effect
  useEffect(() => {
    if (gameCode !== 'local_bot' || gameStatus !== 'active') return;
    
    const activeColor = chessRef.current.turn();
    const isBotTurn = (activeColor === 'w' && players.white === 'bot') || 
                      (activeColor === 'b' && players.black === 'bot');
                      
    if (isBotTurn) {
      const timer = setTimeout(() => {
        makeBotMove();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [gameCode, gameStatus, fen, players]);
  const playMoveSound = (isCapture = false) => {
    try {
      const audio = isCapture ? captureSoundRef.current : moveSoundRef.current;
      audio.currentTime = 0; // Rewind in case it was already playing
      audio.volume = 0.65;
      audio.play().catch(e => console.log("Audio play blocked by browser policy:", e));
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  };
  // ====================================================================
  // Side-Effect 1: Authentication on Load
  // ====================================================================
  useEffect(() => {
    async function initAuth() {
      // Sign in user anonymously if no active session exists
      const { user: authedUser } = await signInAnonymously();
      setUser(authedUser);

      // Listen for auth state changes (e.g. if the user clicks "Connect Google")
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          setUser(session.user);
        } else {
          setUser(null);
          if (event === 'SIGNED_OUT') {
            window.location.reload();
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
    initAuth();
  }, []);

  // ====================================================================
  // Side-Effect 7: Network status monitoring (Online/Offline)
  // ====================================================================
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
    if (!gameCode || gameCode === 'local_bot') return;

    // Establish WebSocket subscription
    const subscription = subscribeToGame(gameCode, (updatedGame) => {
      // Sync player roles in real-time
      setPlayers({ white: updatedGame.white_player_id, black: updatedGame.black_player_id });

      // Sync FEN, PGN, or Status changes (like resignation) in real-time
      setFen(updatedGame.fen);
      setPgn(updatedGame.pgn);
      
      const drawOffer = updatedGame.draw_offer || 'none';
      if (updatedGame.status === 'active' && drawOffer !== 'none') {
        setGameStatus(drawOffer === 'white' ? 'draw_offered_white' : 'draw_offered_black');
      } else {
        setGameStatus(updatedGame.status);
      }
      
      // Sync the local engine with loaded position and history
      syncEngine(updatedGame.fen, updatedGame.pgn);
    });

    // Cleanup: Unsubscribe when the component unmounts or room changes
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [gameCode]);

  // ====================================================================
  // Side-Effect 5: Catch Up on Focus / Visibility Switch (e.g. Phone Call)
  // ====================================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && gameCode && gameCode !== 'local_bot') {
        loadGameRoom(gameCode);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameCode]);

  // Sync native fullscreen exits with pseudo state
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      if (!isFs) {
        setIsPseudoFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  // ====================================================================
  // Side-Effect 6: Trigger Tactile Audio tap on move/capture events
  // ====================================================================
  useEffect(() => {
    if (!gameCode || fen === STARTING_FEN) return;
    const isCapture = pgn.trim().endsWith('#') || pgn.trim().endsWith('+') || pgn.split(/\s+/).pop().includes('x');
    playMoveSound(isCapture);
  }, [fen]);

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
    
    const drawOffer = game.draw_offer || 'none';
    if (game.status === 'active' && drawOffer !== 'none') {
      setGameStatus(drawOffer === 'white' ? 'draw_offered_white' : 'draw_offered_black');
    } else {
      setGameStatus(game.status);
    }
    
    // Sync the local engine with loaded position and history
    syncEngine(game.fen, game.pgn);

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

  const handleStartBotGame = (userColor) => {
    setGameCode('local_bot');
    setFen(STARTING_FEN);
    setPgn('');
    setGameStatus('active');
    chessRef.current.reset();
    
    setBoardOrientation(userColor);
    setPlayers(userColor === 'w' 
      ? { white: user?.id || 'player', black: 'bot' }
      : { white: 'bot', black: user?.id || 'player' }
    );
  };

  // ====================================================================
  // CHESS GAMEPLAY HANDLERS
  // ====================================================================

  const handleMakeMove = async (moveObj) => {
    try {
      // Role & turn enforcement
      const activeColor = chessRef.current.turn(); // 'w' or 'b'
      const isWhiteTurn = activeColor === 'w';

      if (gameCode !== 'local_bot') {
        if (isWhiteTurn && user?.id !== players.white) {
          console.warn("Move blocked: It is White's turn, but you are not the White player.");
          return;
        }
        if (!isWhiteTurn && user?.id !== players.black) {
          console.warn("Move blocked: It is Black's turn, but you are not the Black player.");
          return;
        }
      } else {
        // Prevent moving when it is the bot's turn
        const isBotTurn = (isWhiteTurn && players.white === 'bot') ||
                          (!isWhiteTurn && players.black === 'bot');
        if (isBotTurn) {
          console.warn("Move blocked: It is the Bot's turn to calculate!");
          return;
        }
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

      // 2. Persist move to Supabase (Broadcasts to opponent instantly!) and reset draw offer (Skip for bot)
      if (gameCode !== 'local_bot') {
        await updateGameMove(gameCode, newFen, newPgn, newStatus, { draw_offer: 'none' });
      }

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
    if (gameCode !== 'local_bot') {
      await updateGameMove(gameCode, fen, pgn, newStatus);
    }
  };

  // Declare Draw (Sends Draw Offer)
  const handleDraw = async () => {
    if (gameCode === 'local_bot') {
      setGameStatus('draw');
      return;
    }
    const isWhite = user?.id === players.white;
    const isBlack = user?.id === players.black;
    if (!isWhite && !isBlack) return; // Spectator cannot offer draw
    
    const offerRole = isWhite ? 'white' : 'black';
    const nextStatus = isWhite ? 'draw_offered_white' : 'draw_offered_black';
    
    setGameStatus(nextStatus);
    await updateGameMove(gameCode, fen, pgn, 'active', { draw_offer: offerRole });
  };

  const handleAcceptDraw = async () => {
    setGameStatus('draw');
    await updateGameMove(gameCode, fen, pgn, 'draw', { draw_offer: 'none' });
  };

  const handleDeclineDraw = async () => {
    setGameStatus('active');
    await updateGameMove(gameCode, fen, pgn, 'active', { draw_offer: 'none' });
  };

  // Return to Lobby / Clear URL query
  const handleExitToLobby = () => {
    window.history.pushState({}, '', window.location.origin);
    setGameCode('');
    setFen(STARTING_FEN);
    setPgn('');
    setGameStatus('active');
    chessRef.current.reset();
    
    if (stockfishRef.current) {
      stockfishRef.current.terminate();
      stockfishRef.current = null;
    }
  };

  // Toggle visual board perspective (flip A-H / 1-8 coords)
  const handleFlipBoard = () => {
    setBoardOrientation(prev => prev === 'w' ? 'b' : 'w');
  };

  // Toggle fullscreen mode on the chessboard container
  const handleToggleFullscreen = () => {
    const container = document.querySelector('.chessboard-container');
    if (!container) return;

    // Check for native support
    const requestMethod = container.requestFullscreen || 
                          container.webkitRequestFullscreen || 
                          container.mozRequestFullScreen || 
                          container.msRequestFullscreen;

    if (requestMethod) {
      const isCurrentlyFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isCurrentlyFs) {
        requestMethod.call(container).catch((err) => {
          console.warn(`Native fullscreen blocked, falling back to pseudo-fullscreen: ${err.message}`);
          setIsPseudoFullscreen(true);
        });
      } else {
        const exitMethod = document.exitFullscreen || 
                           document.webkitExitFullscreen || 
                           document.mozCancelFullScreen || 
                           document.msExitFullscreen;
        if (exitMethod) {
          exitMethod.call(document);
        }
        setIsPseudoFullscreen(false);
      }
    } else {
      // Direct pseudo-fullscreen fallback for iOS mobile Safari
      setIsPseudoFullscreen(prev => !prev);
    }
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

  const getDrawOfferOverlay = () => {
    if (gameStatus !== 'draw_offered_white' && gameStatus !== 'draw_offered_black') return null;

    const isWhite = user?.id === players.white;
    const isBlack = user?.id === players.black;
    const isProposer = (gameStatus === 'draw_offered_white' && isWhite) || (gameStatus === 'draw_offered_black' && isBlack);
    const isOpponent = (gameStatus === 'draw_offered_white' && isBlack) || (gameStatus === 'draw_offered_black' && isWhite);

    console.log("DEBUG [getDrawOfferOverlay]:", {
      gameStatus,
      userId: user?.id,
      players,
      isWhite,
      isBlack,
      isProposer,
      isOpponent
    });

    if (isProposer) {
      return (
        <div className="overlay-screen" style={{ zIndex: 1900 }}>
          <div className="overlay-modal glass-panel">
            <div style={{ marginBottom: '16px' }}>
              <Handshake size={48} style={{ color: 'var(--accent-gold)' }} />
            </div>
            <h2 className="overlay-title">Draw Offered</h2>
            <p className="overlay-desc">Waiting for your opponent to respond to your draw offer...</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn btn-danger" onClick={handleDeclineDraw}>
                <span>Cancel Offer</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (isOpponent) {
      const proposerName = gameStatus === 'draw_offered_white' ? 'White' : 'Black';
      return (
        <div className="overlay-screen" style={{ zIndex: 1900 }}>
          <div className="overlay-modal glass-panel">
            <div style={{ marginBottom: '16px' }}>
              <Handshake size={48} style={{ color: 'var(--accent-gold)' }} />
            </div>
            <h2 className="overlay-title">Draw Offered</h2>
            <p className="overlay-desc">{proposerName} player has offered a draw. Do you accept?</p>
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '16px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAcceptDraw}>
                <span>Accept</span>
              </button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleDeclineDraw}>
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Spectator view
    return (
      <div className="overlay-screen" style={{ zIndex: 1900 }}>
        <div className="overlay-modal glass-panel">
          <div style={{ marginBottom: '16px' }}>
            <Handshake size={48} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <h2 className="overlay-title">Draw Offered</h2>
          <p className="overlay-desc">A draw has been offered. Waiting for opponent's response...</p>
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
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateY(-1px)', color: 'var(--text-primary)', marginRight: '2px' }}>
            <path d="M19 21H5c0-2.5 1.5-4.5 4-5.5 1.5-.5 2.5-1.5 2.5-3v-1c0-.5-.2-1-.6-1.4l-2.3-2.3C7.8 7.2 7.5 6.2 7.5 5.2V3c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v1.5c0 .8.3 1.5.8 2l2.2 2.2c.4.4.6.9.6 1.4v2.5c0 1.5 1 2.5 2.5 3 2.5 1 4 3 4 5.5z" fill="var(--text-primary)" />
          </svg>
          <span className="logo-title">ChessURL</span>
        </div>
        
        {/* Supabase Authenticator Link Component */}
        <AuthLink user={user} onAuthChange={setUser} />
      </header>

      {/* Online/Offline Connection Interrupt Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <span>🔌 Connection Interrupted. Trying to reconnect...</span>
        </div>
      )}

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

      {/* 2b. DRAW OFFER OVERLAY */}
      {getDrawOfferOverlay()}

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
            style={{ padding: '14px 28px', fontSize: '16px', marginTop: '10px', width: '100%' }}
          >
            <Compass size={18} />
            <span>Create Chessboard</span>
          </button>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px',
            borderRadius: '14px',
            border: '1px solid var(--panel-glass-border)',
            background: 'rgba(255, 255, 255, 0.45)',
            boxShadow: '0 4px 20px rgba(112, 146, 124, 0.06)',
            marginTop: '16px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Play Bot</span>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: 'rgba(112, 146, 124, 0.06)',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(112, 146, 124, 0.1)',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>Difficulty Level</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--accent-gold)',
                  background: 'rgba(176, 141, 44, 0.08)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(176, 141, 44, 0.15)'
                }}>
                  Level {botDifficulty}
                </span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="8" 
                value={botDifficulty} 
                onChange={(e) => setBotDifficulty(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '5px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  accentColor: 'var(--accent-gold)',
                  marginTop: '8px',
                  background: 'rgba(112, 146, 124, 0.15)'
                }} 
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Lv 1 (Novice)</span>
                <span>Lv 8 (Grandmaster)</span>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <button 
                className="btn btn-glass" 
                onClick={() => handleStartBotGame('w')}
                style={{
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid rgba(44, 53, 49, 0.12)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}
              >
                <span style={{ fontSize: '12px' }}>⚪</span>
                <span style={{ fontSize: '12px' }}>Play as White</span>
              </button>
              <button 
                className="btn" 
                onClick={() => handleStartBotGame('b')}
                style={{
                  padding: '10px',
                  background: 'var(--text-primary)',
                  border: '1px solid var(--text-primary)',
                  color: '#FFFFFF',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <span style={{ fontSize: '12px' }}>⚫</span>
                <span style={{ color: '#FFFFFF', fontSize: '12px' }}>Play as Black</span>
              </button>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 0 0 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Looking to resume a game? Paste the unique share URL into your browser!
            </span>
            
            {/* ❓ How to Play Tooltip */}
            <div className="tooltip-container">
              <button className="tooltip-trigger">
                ❓ How to Play & Link Accounts
              </button>
              <div className="tooltip-content glass-panel">
                <h4 style={{ color: 'var(--accent-gold)', marginBottom: '4px', fontSize: '13px' }}>How to Play:</h4>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px', lineHeight: '1.4', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  1. Click <strong>Create Chessboard</strong>.<br />
                  2. Copy the room URL and send it to a friend.<br />
                  3. Drag or click pieces to move when it is your turn.
                </p>
                <h4 style={{ color: 'var(--accent-gold)', marginBottom: '4px', fontSize: '13px' }}>Save History:</h4>
                <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  Click <strong>Connect Google</strong> in the top header to bind your guest games and access your match history on other devices.
                </p>
              </div>
            </div>
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
              isFullscreen={isPseudoFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
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
                onClick={handleToggleFullscreen}
                style={{ padding: '8px 12px', fontSize: '12px' }}
              >
                📺 Fullscreen
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

            <VoiceController 
              onMakeMove={handleMakeMove}
              onResign={handleResign}
              onDraw={handleDraw}
              onFlip={handleFlipBoard}
              disabled={gameStatus !== 'active' || (user?.id !== players.white && user?.id !== players.black)}
              isUserTurn={gameStatus === 'active' && (
                (chessRef.current.turn() === 'w' && user?.id === players.white) ||
                (chessRef.current.turn() === 'b' && user?.id === players.black)
              )}
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
