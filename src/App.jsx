import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
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

// Import newly modularized components
import AppHeader from './components/AppHeader';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import Overlays from './components/Overlays';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * App Component
 * Serves as the central state and rules controller for ChessURL.
 * Orchestrates Supabase syncing, offline reconnects, and Stockfish practice worker moves.
 */
export default function App() {
  // --- STATE DECLARATIONS ---
  const [user, setUser] = useState(null);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [gameCode, setGameCode] = useState('');
  const [fen, setFen] = useState(STARTING_FEN);
  const [pgn, setPgn] = useState('');
  const [gameStatus, setGameStatus] = useState('active'); 
  const [boardOrientation, setBoardOrientation] = useState('w'); 
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState({ white: null, black: null });
  const [totalGames, setTotalGames] = useState(0);
  const [historyGames, setHistoryGames] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [botDifficulty, setBotDifficulty] = useState(3); 

  // --- ENGINE REFERENCES ---
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

  // Trigger bot move calculations
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
      audio.currentTime = 0;
      audio.volume = 0.65;
      audio.play().catch(e => console.log("Audio play blocked by browser policy:", e));
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  };

  // 1. Authentication lifecycle
  useEffect(() => {
    async function initAuth() {
      const { user: authedUser } = await signInAnonymously();
      setUser(authedUser);

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

  // 2. Network status monitoring
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

  // 3. Room Routing URL Sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('game');

    if (codeParam) {
      loadGameRoom(codeParam.toUpperCase());
    } else {
      setGameCode('');
      setFen(STARTING_FEN);
      setPgn('');
      setGameStatus('active');
      chessRef.current.reset();
    }
  }, [window.location.search]);

  // 4. Realtime Database Subscription
  useEffect(() => {
    if (!gameCode || gameCode === 'local_bot') return;

    const subscription = subscribeToGame(gameCode, (updatedGame) => {
      setPlayers({ white: updatedGame.white_player_id, black: updatedGame.black_player_id });
      setFen(updatedGame.fen);
      setPgn(updatedGame.pgn);
      
      const drawOffer = updatedGame.draw_offer || 'none';
      if (updatedGame.status === 'active' && drawOffer !== 'none') {
        setGameStatus(drawOffer === 'white' ? 'draw_offered_white' : 'draw_offered_black');
      } else {
        setGameStatus(updatedGame.status);
      }
      
      syncEngine(updatedGame.fen, updatedGame.pgn);
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [gameCode]);

  // 5. Visibility Focus catchup
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

  // 6. Native Fullscreen Exit Sync
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

  // 7. Sound Play trigger
  useEffect(() => {
    if (!gameCode || fen === STARTING_FEN) return;
    const isCapture = pgn.trim().endsWith('#') || pgn.trim().endsWith('+') || pgn.split(/\s+/).pop().includes('x');
    playMoveSound(isCapture);
  }, [fen]);

  // 8. Fetch statistics
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
  }, [user, gameCode]);

  // --- GAMEPLAY ROOM ACTIONS ---
  const loadGameRoom = async (code) => {
    setLoading(true);
    const { game, error } = await fetchGame(code);
    
    if (error || !game) {
      alert('Chess room not found or connection error!');
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
    
    syncEngine(game.fen, game.pgn);

    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = session?.user?.id || user?.id || null;

    let currentWhite = game.white_player_id;
    let currentBlack = game.black_player_id;

    if (activeUserId) {
      if (!currentWhite) {
        currentWhite = activeUserId;
        await updateGameMove(code, game.fen, game.pgn, game.status, { white_player_id: activeUserId });
        setBoardOrientation('w');
      } else if (currentWhite === activeUserId) {
        setBoardOrientation('w');
      } else if (!currentBlack) {
        currentBlack = activeUserId;
        await updateGameMove(code, game.fen, game.pgn, game.status, { black_player_id: activeUserId });
        setBoardOrientation('b');
      } else if (currentBlack === activeUserId) {
        setBoardOrientation('b');
      } else {
        setBoardOrientation('w');
      }
    } else {
      setBoardOrientation('w');
    }

    setPlayers({ white: currentWhite, black: currentBlack });
    setLoading(false);
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleStartNewGame = async () => {
    setLoading(true);
    const newCode = generateRandomCode();
    const { error } = await createGame(newCode, user?.id || null);
    
    if (error) {
      alert(`Failed to spin up a new chess room! Error: ${error.message}`);
      setLoading(false);
      return;
    }

    const newUrl = `${window.location.origin}/?game=${newCode}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    setGameCode(newCode);
    setFen(STARTING_FEN);
    setPgn('');
    setGameStatus('active');
    setBoardOrientation('w'); 
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

  const handleMakeMove = async (moveObj) => {
    try {
      const activeColor = chessRef.current.turn();
      const isWhiteTurn = activeColor === 'w';

      if (gameCode !== 'local_bot') {
        if (isWhiteTurn && user?.id !== players.white) return;
        if (!isWhiteTurn && user?.id !== players.black) return;
      } else {
        const isBotTurn = (isWhiteTurn && players.white === 'bot') ||
                          (!isWhiteTurn && players.black === 'bot');
        if (isBotTurn) return;
      }

      const move = chessRef.current.move(moveObj);
      if (!move) return;

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

      if (gameCode !== 'local_bot') {
        await updateGameMove(gameCode, newFen, newPgn, newStatus, { draw_offer: 'none' });
      }
    } catch (e) {
      console.error('Invalid move attempt:', e.message);
    }
  };

  const handleResign = async () => {
    const currentTurn = chessRef.current.turn();
    const newStatus = currentTurn === 'w' ? 'resigned_white' : 'resigned_black';
    
    setGameStatus(newStatus);
    if (gameCode !== 'local_bot') {
      await updateGameMove(gameCode, fen, pgn, newStatus);
    }
  };

  const handleDraw = async () => {
    if (gameCode === 'local_bot') {
      setGameStatus('draw');
      return;
    }
    const isWhite = user?.id === players.white;
    const isBlack = user?.id === players.black;
    if (!isWhite && !isBlack) return;
    
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

  const handleFlipBoard = () => {
    setBoardOrientation(prev => prev === 'w' ? 'b' : 'w');
  };

  const handleToggleFullscreen = () => {
    const container = document.querySelector('.chessboard-container');
    if (!container) return;

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
      setIsPseudoFullscreen(prev => !prev);
    }
  };

  const getMovesList = () => {
    if (!pgn) return [];
    
    const cleanPgn = pgn
      .split('\n')
      .filter(line => !line.trim().startsWith('['))
      .join(' ');

    return cleanPgn
      .replace(/\d+\.\s+/g, '') 
      .split(/\s+/) 
      .filter(m => m.trim().length > 0);
  };
  
  const movesList = getMovesList();

  return (
    <div className="app-container">
      
      {/* 1. APP HEADER */}
      <AppHeader user={user} onAuthChange={setUser} />

      {/* Online/Offline Connection Interrupt Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <span>🔌 Connection Interrupted. Trying to reconnect...</span>
        </div>
      )}

      {/* Status Alerts & Modal Overlays */}
      <Overlays 
        loading={loading}
        gameStatus={gameStatus}
        user={user}
        players={players}
        onDeclineDraw={handleDeclineDraw}
        onAcceptDraw={handleAcceptDraw}
        onExitToLobby={handleExitToLobby}
        onReviewBoard={() => setGameStatus('active')}
      />

      {/* Toggle View: Lobby vs Active Board */}
      {!gameCode ? (
        <LobbyView 
          totalGames={totalGames}
          historyGames={historyGames}
          botDifficulty={botDifficulty}
          setBotDifficulty={setBotDifficulty}
          onStartNewGame={handleStartNewGame}
          onStartBotGame={handleStartBotGame}
          onLoadGameRoom={loadGameRoom}
        />
      ) : (
        <GameView 
          gameCode={gameCode}
          fen={fen}
          pgn={pgn}
          players={players}
          user={user}
          boardOrientation={boardOrientation}
          isPseudoFullscreen={isPseudoFullscreen}
          gameStatus={gameStatus}
          movesList={movesList}
          chessEngine={chessRef.current}
          onMakeMove={handleMakeMove}
          onToggleFullscreen={handleToggleFullscreen}
          onFlipBoard={handleFlipBoard}
          onExitToLobby={handleExitToLobby}
          onResign={handleResign}
          onDraw={handleDraw}
          onStartNewGame={handleStartNewGame}
        />
      )}

    </div>
  );
}
