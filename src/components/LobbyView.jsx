import React from 'react';
import { Sparkles, Compass } from 'lucide-react';

/**
 * LobbyView Component
 * Renders the initial screen for game creation, bot setup, and past games history.
 */
export default function LobbyView({
  totalGames,
  historyGames,
  botDifficulty,
  setBotDifficulty,
  onStartNewGame,
  onStartBotGame,
  onLoadGameRoom
}) {
  return (
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
        onClick={onStartNewGame}
        style={{ padding: '14px 28px', fontSize: '16px', marginTop: '10px', width: '100%' }}
      >
        <Compass size={18} />
        <span>Create Chessboard</span>
      </button>

      {/* Play Bot Setup Panel */}
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
            onClick={() => onStartBotGame('w')}
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
            onClick={() => onStartBotGame('b')}
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
        <div style={{ textalign: 'left', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginTop: '10px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)', textAlign: 'left' }}>Your Recent Games</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
            {historyGames.map((g) => (
              <div 
                key={g.id} 
                onClick={() => {
                  const newUrl = `${window.location.origin}/?game=${g.code}`;
                  window.history.pushState({ path: newUrl }, '', newUrl);
                  onLoadGameRoom(g.code);
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
  );
}
