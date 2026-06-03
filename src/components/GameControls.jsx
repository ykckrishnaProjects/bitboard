import React, { useState } from 'react';
import { Copy, Check, Flag, Handshake, PlusCircle, Share2, AlertCircle } from 'lucide-react';

/**
 * ====================================================================
 * GameControls Component
 * ====================================================================
 * Renders the room share code box, copy controls, and game actions
 * (Resign, Propose Draw, Start New Match).
 * ====================================================================
 */
export default function GameControls({ gameCode, onResign, onDraw, onNewGame, disabled = false }) {
  const [copied, setCopied] = useState(false);
  const [activeConfirm, setActiveConfirm] = useState(null); // 'resign' | 'draw' | null

  // 1. Copy Shortlink to Clipboard
  const handleCopyLink = () => {
    const url = `${window.location.origin}/?game=${gameCode.toUpperCase()}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error('Failed to copy link:', err));
  };

  const handleResignClick = () => {
    setActiveConfirm('resign');
  };

  const handleDrawClick = () => {
    setActiveConfirm('draw');
  };

  const handleConfirmAction = () => {
    if (activeConfirm === 'resign') {
      onResign();
    } else if (activeConfirm === 'draw') {
      onDraw();
    }
    setActiveConfirm(null);
  };

  return (
    <div className="controls-card glass-panel">
      
      {/* Shortcode Share Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Share2 size={11} style={{ color: 'var(--accent-gold)' }} />
          <span>Invite Opponent / Resume Game link:</span>
        </span>
        <div className="game-code-box">
          <span className="game-code-text">{gameCode.toUpperCase()}</span>
          <button 
            className="copy-btn" 
            onClick={handleCopyLink} 
            title="Copy game link"
            style={{ marginLeft: 'auto' }}
          >
            {copied ? (
              <Check size={16} style={{ color: 'var(--accent-emerald)' }} />
            ) : (
              <Copy size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Main Game Actions Grid */}
      <div className="btn-group" style={{ marginTop: '6px' }}>
        {/* Resign Button */}
        <button 
          className="btn btn-danger" 
          onClick={handleResignClick}
          disabled={disabled}
          title="Resign active match"
        >
          <Flag size={14} />
          <span>Resign</span>
        </button>

        {/* Draw Button */}
        <button 
          className="btn btn-glass" 
          onClick={handleDrawClick}
          disabled={disabled}
          title="Declare draw"
        >
          <Handshake size={14} />
          <span>Offer Draw</span>
        </button>
      </div>

      {/* Lobby Return / New Match */}
      <button 
        className="btn btn-primary" 
        onClick={onNewGame}
        style={{ width: '100%', marginTop: '4px' }}
      >
        <PlusCircle size={15} />
        <span>Create New Board</span>
      </button>

      {/* Custom Confirm Modal Overlay */}
      {activeConfirm && (
        <div className="overlay-screen">
          <div className="overlay-modal glass-panel">
            <div style={{ marginBottom: '16px' }}>
              <AlertCircle size={48} style={{ color: 'var(--accent-gold)' }} />
            </div>
            <h2 className="overlay-title">
              {activeConfirm === 'resign' ? 'Resign Match?' : 'Declare Draw?'}
            </h2>
            <p className="overlay-desc">
              {activeConfirm === 'resign'
                ? 'Are you sure you want to resign the game? This will hand victory to your opponent.'
                : 'Are you sure you want to declare this game a Draw? Both players must agree.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '16px' }}>
              <button 
                className="btn btn-danger" 
                style={{ flex: 1 }} 
                onClick={handleConfirmAction}
              >
                Confirm
              </button>
              <button 
                className="btn btn-glass" 
                style={{ flex: 1 }} 
                onClick={() => setActiveConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
