import React, { useEffect, useRef } from 'react';
import { Download, History, Sparkles } from 'lucide-react';

/**
 * ====================================================================
 * MoveHistory Component
 * ====================================================================
 * Renders the algebraic moves log and provides PGN export features.
 * 
 * React Concepts Covered:
 * 1. `useRef` & Dom Manipulation: Referencing the scroll container to automatically
 *    keep the moves list centered at the bottom.
 * 2. `useEffect` side effects: Triggering auto-scroll on change of move history array.
 * 3. File Downloads in Browser: Creating a dynamic virtual Blob containing PGN string
 *    and downloading it instantly without hitting a server.
 * ====================================================================
 */
export default function MoveHistory({ moves = [], pgnString = '', isUserAnonymous = true }) {
  const containerRef = useRef(null);

  // 1. Auto-scroll Side Effect
  // Whenever the moves array length changes, we programmatically scroll
  // the container to the bottom so the active move is always in view.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [moves]);

  // 2. Local PGN Downloader
  // Packages the PGN string into a text/plain Blob and triggers a virtual link click.
  const downloadPGNFile = () => {
    if (!pgnString) {
      alert('No moves have been played yet!');
      return;
    }
    
    // Create a client-side text blob
    const blob = new Blob([pgnString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Create a virtual download link and click it
    const link = document.createElement('a');
    link.href = url;
    link.download = `glowchess_game_${new Date().toISOString().slice(0, 10)}.pgn`;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup reference
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. Group moves into pairs (White move + Black move) for structured algebraic display
  // e.g. [{ num: 1, w: 'e4', b: 'e5' }, { num: 2, w: 'Nf3' }]
  const renderMovePairs = () => {
    const pairs = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        w: moves[i],
        b: moves[i + 1] || '' // May be empty if White just made a move
      });
    }
    return pairs;
  };

  const movePairs = renderMovePairs();

  return (
    <div className="history-card glass-panel">
      {/* Move Log Header */}
      <div className="history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={16} style={{ color: 'var(--accent-gold)' }} />
          <span className="history-title">Game History</span>
        </div>
        
        {/* Dynamic Downloader Button */}
        {isUserAnonymous ? (
          <span 
            className="text-muted" 
            style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Connect your Google profile to download permanent chess histories"
          >
            <Sparkles size={10} style={{ color: 'var(--accent-gold)' }} />
            <span>Connect Google to Download PGN</span>
          </span>
        ) : (
          <button 
            className="btn btn-glass" 
            onClick={downloadPGNFile}
            style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px' }}
            disabled={moves.length === 0}
          >
            <Download size={12} />
            <span>Save PGN</span>
          </button>
        )}
      </div>

      {/* Auto-scrolling Moves Grid */}
      <div className="moves-grid-container" ref={containerRef}>
        {moves.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Waiting for first move...
            </span>
          </div>
        ) : (
          <div className="moves-grid">
            {movePairs.map((pair) => (
              <React.Fragment key={pair.num}>
                {/* 1. Move Number */}
                <div className="move-num">{pair.num}.</div>
                
                {/* 2. White Move */}
                <div className="move-cell">{pair.w}</div>
                
                {/* 3. Black Move */}
                <div className="move-cell">{pair.b}</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
