import React, { useState, useEffect } from 'react';

/**
 * ====================================================================
 * Bobby Fischer Series Classic Tournament Chessboard
 * ====================================================================
 * Renders a matte, non-glossy, highly readable vinyl tournament chessboard
 * exactly modeled after the Bobby Fischer Series.
 *
 * Core Features:
 * 1. Bobby Fischer Vinyl Aesthetic: Curated forest green and warm cream squares.
 * 2. Border-Bound Coordinates: Letters and numbers are printed in the off-white
 *    vinyl margins outside the board squares.
 * 3. Trademark Corner Logo: Watermarked "BOBBY FISCHER" text stamps on a8/h1 squares.
 * 4. Official CBurnett Chess Vector Set: Integrated pixel-perfect, globally 
 *    recognized tournament pieces loaded via high-availability CDN.
 * ====================================================================
 */

// --- WATERMARKED BOBBY FISCHER EASTER EGG LOGO ---
const BobbyFischerLogo = ({ flipped }) => (
  <div 
    className="bobby-fischer-logo" 
    style={{ 
      position: 'absolute', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      opacity: 0.16,
      pointerEvents: 'none',
      transform: flipped ? 'rotate(180deg)' : 'none',
      fontFamily: '"Outfit", sans-serif',
      fontSize: '7px',
      fontWeight: 800,
      color: '#000000',
      lineHeight: 1.1,
      textAlign: 'center',
      userSelect: 'none',
      width: '80%',
      height: '80%'
    }}
  >
    <div style={{ letterSpacing: '0.6px' }}>BOBBY</div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <span>F</span>
      {/* SVG Rook in place of the letter "I" */}
      <svg 
        viewBox="0 0 45 45" 
        style={{ 
          width: '7px', 
          height: '7px', 
          fill: '#000000',
          margin: '0 0.5px'
        }}
      >
        <path d="M9 36h27v3H9zm3-10v8h21v-8H12zm1.5-12l2.5 10h14l2.5-10H13.5zM9 9v4h4v-4H9zm8 0v4h4v-4h-4zm8 0v4h4v-4h-4zm8 0v4h4v-4h-4z" />
      </svg>
      <span style={{ letterSpacing: '0.2px' }}>SCHER</span>
    </div>
  </div>
);

// --- PIXEL-PERFECT OFFICIAL TOURNAMENT CHESS ASSETS ---
// Returns the official, high-quality, pixel-perfect CBurnett chess piece SVGs
// hosted on Lichess's global high-availability static CDN.
const getPieceImgUrl = (color, type) => {
  return `https://lichess1.org/assets/piece/cburnett/${color}${type.toUpperCase()}.svg`;
};

// Standard material values
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export default function Chessboard({ 
  gameEngine, 
  fen, 
  orientation = 'w', 
  onMakeMove, 
  disabled = false 
}) {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);

  const isWhiteTurn = gameEngine.turn() === 'w';
  const inCheck = gameEngine.inCheck();
  
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
    const history = gameEngine.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      setLastMove({ from: last.from, to: last.to });
    } else {
      setLastMove(null);
    }
  }, [fen]);

  // --- CAPTURED MATERIAL CALCULATOR ---
  const getCapturedState = () => {
    const boardPieces = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };
    
    gameEngine.board().forEach((row) => {
      row.forEach((square) => {
        if (square) {
          boardPieces[square.color][square.type]++;
        }
      });
    });

    const standardCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const captured = { w: [], b: [] }; 
    let materialValue = { w: 0, b: 0 };

    Object.keys(standardCounts).forEach((type) => {
      const wCapturedCount = standardCounts[type] - boardPieces.w[type];
      for (let i = 0; i < wCapturedCount; i++) {
        captured.w.push(type);
        materialValue.b += PIECE_VALUES[type];
      }
      
      const bCapturedCount = standardCounts[type] - boardPieces.b[type];
      for (let i = 0; i < bCapturedCount; i++) {
        captured.b.push(type);
        materialValue.w += PIECE_VALUES[type];
      }
    });

    let wScore = '';
    let bScore = '';
    if (materialValue.w > materialValue.b) {
      wScore = `+${materialValue.w - materialValue.b}`;
    } else if (materialValue.b > materialValue.w) {
      bScore = `+${materialValue.b - materialValue.w}`;
    }

    return { captured, wScore, bScore };
  };

  const { captured, wScore, bScore } = getCapturedState();

  // --- CORE GAME HANDLERS ---
  const handleSquareClick = (squareKey) => {
    if (disabled) return;
    const piece = gameEngine.get(squareKey);

    if (validMoves.includes(squareKey)) {
      makeMove(selectedSquare, squareKey);
      return;
    }

    if (piece && piece.color === gameEngine.turn()) {
      setSelectedSquare(squareKey);
      const moves = gameEngine.moves({ square: squareKey, verbose: true });
      setValidMoves(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const makeMove = (from, to) => {
    const piece = gameEngine.get(from);
    let promotion = undefined;
    if (piece && piece.type === 'p' && (to.endsWith('8') || to.endsWith('1'))) {
      promotion = 'q'; 
    }

    const moveObj = { from, to, promotion };
    onMakeMove(moveObj);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (e, squareKey) => {
    if (disabled) return;
    const piece = gameEngine.get(squareKey);
    if (piece && piece.color === gameEngine.turn()) {
      e.dataTransfer.setData('text/plain', squareKey);
      setSelectedSquare(squareKey);
      const moves = gameEngine.moves({ square: squareKey, verbose: true });
      setValidMoves(moves.map(m => m.to));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetSquare) => {
    e.preventDefault();
    const sourceSquare = e.dataTransfer.getData('text/plain');
    if (sourceSquare && validMoves.includes(targetSquare)) {
      makeMove(sourceSquare, targetSquare);
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  // --- GRID RENDER PERSPECTIVE GENERATION ---
  const generateBoardLayout = () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    if (orientation === 'b') {
      return {
        files: [...files].reverse(),
        ranks: [...ranks].reverse()
      };
    }
    return { files, ranks };
  };

  const { files, ranks } = generateBoardLayout();

  // Helper to render Bobby Fischer watermark logos in white corner squares a8/h1
  const renderCornerLogo = (squareKey) => {
    if (squareKey === 'h1') {
      return <BobbyFischerLogo flipped={orientation === 'b'} />;
    }
    if (squareKey === 'a8') {
      return <BobbyFischerLogo flipped={orientation !== 'b'} />;
    }
    return null;
  };

  return (
    <div className="chessboard-container">
      
      {/* 1. TOP CAPTURED TRAY */}
      <div className="captured-tray">
        {orientation === 'w' ? (
          <>
            {captured.b.map((type, idx) => (
              <div key={idx} className="captured-piece">
                <img src={getPieceImgUrl('b', type)} alt={`b${type}`} style={{ width: '100%', height: '100%' }} />
              </div>
            ))}
            {wScore && <span className="captured-score">{wScore}</span>}
          </>
        ) : (
          <>
            {captured.w.map((type, idx) => (
              <div key={idx} className="captured-piece">
                <img src={getPieceImgUrl('w', type)} alt={`w${type}`} style={{ width: '100%', height: '100%' }} />
              </div>
            ))}
            {bScore && <span className="captured-score">{bScore}</span>}
          </>
        )}
      </div>

      {/* 2. BOBBY FISCHER VINYL DIGITAL CHESSBOARD */}
      <div className="board-outer-ring">
        
        {/* Border Row 1: Top File letters */}
        <div className="border-corner"></div>
        <div className="border-files">
          {files.map((file) => (
            <div key={file} className="border-label">{file}</div>
          ))}
        </div>
        <div className="border-corner"></div>

        {/* Border Row 2: Left Rank Numbers, Active Chessboard, Right Rank Numbers */}
        <div className="border-ranks">
          {ranks.map((rank) => (
            <div key={rank} className="border-label">{rank}</div>
          ))}
        </div>

        <div className="chessboard">
          {ranks.map((rank, rankIdx) => (
            <React.Fragment key={rank}>
              {files.map((file, fileIdx) => {
                const squareKey = `${file}${rank}`;
                const piece = gameEngine.get(squareKey);
                
                const isLight = (rankIdx + fileIdx) % 2 === 0;
                
                const isSelected = selectedSquare === squareKey;
                const isHint = validMoves.includes(squareKey);
                const isHintCapture = isHint && piece;
                const isLastMoveSrc = lastMove && lastMove.from === squareKey;
                const isLastMoveDst = lastMove && lastMove.to === squareKey;
                const isKingInCheck = inCheck && piece && piece.type === 'k' && piece.color === gameEngine.turn();
                
                let squareClass = `square ${isLight ? 'light' : 'dark'}`;
                if (isSelected) squareClass += ' selected';
                if (isLastMoveSrc || isLastMoveDst) squareClass += ' last-move';
                if (isKingInCheck) squareClass += ' check';

                return (
                  <div
                    key={squareKey}
                    className={squareClass}
                    onClick={() => handleSquareClick(squareKey)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, squareKey)}
                  >
                    
                    {/* Render trademark Bobby Fischer logo inside clean corner white squares */}
                    {isLight && renderCornerLogo(squareKey)}

                    {/* Render Chess Piece IMG */}
                    {piece && (
                      <div
                        className={`chess-piece ${selectedSquare === squareKey ? 'dragging' : ''}`}
                        draggable={!disabled && piece.color === gameEngine.turn()}
                        onDragStart={(e) => handleDragStart(e, squareKey)}
                      >
                        <img src={getPieceImgUrl(piece.color, piece.type)} alt={`${piece.color}${piece.type}`} />
                      </div>
                    )}

                    {/* Valid Destination indicators */}
                    {isHint && !isHintCapture && <div className="move-hint" />}
                    {isHintCapture && <div className="move-hint-capture" />}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="border-ranks">
          {ranks.map((rank) => (
            <div key={rank} className="border-label">{rank}</div>
          ))}
        </div>

        {/* Border Row 3: Bottom File letters */}
        <div className="border-corner"></div>
        <div className="border-files">
          {files.map((file) => (
            <div key={file} className="border-label">{file}</div>
          ))}
        </div>
        <div className="border-corner"></div>

      </div>

      {/* 3. BOTTOM CAPTURED TRAY */}
      <div className="captured-tray" style={{ marginTop: '10px' }}>
        {orientation === 'w' ? (
          <>
            {captured.w.map((type, idx) => (
              <div key={idx} className="captured-piece">
                <img src={getPieceImgUrl('w', type)} alt={`w${type}`} style={{ width: '100%', height: '100%' }} />
              </div>
            ))}
            {bScore && <span className="captured-score">{bScore}</span>}
          </>
        ) : (
          <>
            {captured.b.map((type, idx) => (
              <div key={idx} className="captured-piece">
                <img src={getPieceImgUrl('b', type)} alt={`b${type}`} style={{ width: '100%', height: '100%' }} />
              </div>
            ))}
            {wScore && <span className="captured-score">{wScore}</span>}
          </>
        )}
      </div>

    </div>
  );
}
