import React from 'react';
import { Trophy, Handshake, RefreshCw } from 'lucide-react';

/**
 * Overlays Component
 * Renders modal dialog screens for Loading overlays and Game Over/Draw Offer states.
 */
export default function Overlays({
  loading,
  gameStatus,
  user,
  players,
  onDeclineDraw,
  onAcceptDraw,
  onExitToLobby,
  onReviewBoard
}) {
  
  // 1. Loading Overlay
  if (loading) {
    return (
      <div className="overlay-screen" style={{ background: 'rgba(4,6,12,0.6)', zIndex: 2000 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <RefreshCw className="spin" size={32} style={{ color: 'var(--accent-gold)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Syncing Chess State...</span>
        </div>
      </div>
    );
  }

  // 2. Draw Offer Overlay check
  if (gameStatus === 'draw_offered_white' || gameStatus === 'draw_offered_black') {
    const isWhite = user?.id === players.white;
    const isBlack = user?.id === players.black;
    const isProposer = (gameStatus === 'draw_offered_white' && isWhite) || (gameStatus === 'draw_offered_black' && isBlack);
    const isOpponent = (gameStatus === 'draw_offered_white' && isBlack) || (gameStatus === 'draw_offered_black' && isWhite);

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
              <button className="btn btn-danger" onClick={onDeclineDraw}>
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
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onAcceptDraw}>
                <span>Accept</span>
              </button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={onDeclineDraw}>
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Spectator view for draw offer
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
  }

  // 3. Game Over Overlay check
  if (gameStatus !== 'active') {
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
    } else {
      // Avoid rendering game-over dialog for intermediate state anomalies
      return null;
    }

    return (
      <div className="overlay-screen">
        <div className="overlay-modal glass-panel">
          <div style={{ marginBottom: '16px' }}>{icon}</div>
          <h2 className="overlay-title">{title}</h2>
          <p className="overlay-desc">{description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn btn-primary" onClick={onExitToLobby}>
              <span>Create New Game</span>
            </button>
            <button className="btn btn-glass" onClick={onReviewBoard}>
              <span>Review Board</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
