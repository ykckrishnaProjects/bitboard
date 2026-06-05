import React from 'react';
import Chessboard from './Chessboard';
import GameControls from './GameControls';
import VoiceController from './VoiceController';
import MoveHistory from './MoveHistory';

/**
 * GameView Component
 * Renders the active match view containing the chessboard, indicators, actions sidebar, and PGN list.
 */
export default function GameView({
  gameCode,
  fen,
  pgn,
  players,
  user,
  boardOrientation,
  isPseudoFullscreen,
  gameStatus,
  movesList,
  chessEngine,
  onMakeMove,
  onToggleFullscreen,
  onFlipBoard,
  onExitToLobby,
  onResign,
  onDraw,
  onStartNewGame
}) {
  return (
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
            <div className={`turn-pill white ${chessEngine.turn() === 'w' ? 'active' : ''}`}>
              <div className="turn-dot" />
              <span>White</span>
            </div>
            <div className={`turn-pill black ${chessEngine.turn() === 'b' ? 'active' : ''}`}>
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
          gameEngine={chessEngine}
          fen={fen}
          orientation={boardOrientation}
          onMakeMove={onMakeMove}
          disabled={gameStatus !== 'active' || user?.id !== (chessEngine.turn() === 'w' ? players.white : players.black)}
          isFullscreen={isPseudoFullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />

        {/* Helper Utility Buttons directly below the board */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '500px', marginTop: '10px' }}>
          <button 
            className="btn btn-glass" 
            onClick={onFlipBoard}
            style={{ flexGrow: 1, padding: '8px 12px', fontSize: '12px' }}
          >
            🔄 Flip Perspective
          </button>
          <button 
            className="btn btn-glass" 
            onClick={onToggleFullscreen}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            📺 Fullscreen
          </button>
          <button 
            className="btn btn-glass" 
            onClick={onExitToLobby}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            🚪 Exit
          </button>
        </div>

      </div>

      {/* Column 2: Game Controls and Move History panels */}
      <div className="sidebar-panel">
        <GameControls 
          gameCode={gameCode}
          onResign={onResign}
          onDraw={onDraw}
          onNewGame={onStartNewGame}
          disabled={gameStatus !== 'active' || (user?.id !== players.white && user?.id !== players.black)}
        />

        <VoiceController 
          onMakeMove={onMakeMove}
          onResign={onResign}
          onDraw={onDraw}
          onFlip={onFlipBoard}
          disabled={gameStatus !== 'active' || (user?.id !== players.white && user?.id !== players.black)}
          isUserTurn={gameStatus === 'active' && (
            (chessEngine.turn() === 'w' && user?.id === players.white) ||
            (chessEngine.turn() === 'b' && user?.id === players.black)
          )}
        />

        <MoveHistory 
          moves={movesList}
          pgnString={pgn}
          isUserAnonymous={user?.is_anonymous ?? true}
        />
      </div>

    </div>
  );
}
