import React, { useState } from 'react';
import { Copy, Check, Flag, Handshake, PlusCircle, Share2 } from 'lucide-react';

/**
 * ====================================================================
 * GameControls Component
 * ====================================================================
 * Renders the room share code box, copy controls, and game actions
 * (Resign, Propose Draw, Start New Match).
 * 
 * React Concepts Covered:
 * 1. State Hooks: Local state `copied` to manage a temporal success checkmark.
 * 2. Clipboard API: Copying URL shortcode string directly to the operating system's clipboard.
 * 3. Event Handling Props: Passing callback requests up to App.jsx orchestrator.
 * ====================================================================
 */
export default function GameControls({ gameCode, onResign, onDraw, onNewGame, disabled = false }) {
  const [copied, setCopied] = useState(false);

  // 1. Copy Shortlink to Clipboard
  const handleCopyLink = () => {
    // Generate the full direct URL
    const url = `${window.location.origin}/?game=${gameCode.toUpperCase()}`;
    
    // Web Clipboard API
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        // Reset checkmark back to clipboard icon after 2 seconds
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error('Failed to copy link:', err));
  };

  // 2. Double-confirm Resignation
  const handleResignClick = () => {
    if (confirm('Are you sure you want to resign the game? This will hand victory to your opponent.')) {
      onResign();
    }
  };

  // 3. Double-confirm Draw
  const handleDrawClick = () => {
    if (confirm('Are you sure you want to declare this game a Draw? Both players must agree.')) {
      onDraw();
    }
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

    </div>
  );
}
