import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, HelpCircle } from 'lucide-react';

/**
 * ====================================================================
 * VoiceController Component
 * ====================================================================
 * Captures user speech using the browser's Web Speech API, normalizes 
 * phonetic words to chess notation, and executes game moves hands-free.
 * ====================================================================
 */
export default function VoiceController({ 
  onMakeMove, 
  onResign, 
  onDraw, 
  onFlip, 
  disabled = false,
  isUserTurn = false
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState({ text: '', type: '' }); // type: 'success', 'error', 'info'
  const [showHelp, setShowHelp] = useState(false);
  
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Initialize Web Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setFeedback({ 
        text: 'Speech recognition is not supported in this browser. Try Chrome/Safari.', 
        type: 'error' 
      });
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setFeedback({ text: 'Listening for moves...', type: 'info' });
    };

    rec.onresult = (event) => {
      const lastResultIndex = event.results.length - 1;
      const speechText = event.results[lastResultIndex][0].transcript;
      setTranscript(speechText);
      processVoiceCommand(speechText);
    };

    rec.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setFeedback({ text: 'Microphone permission denied.', type: 'error' });
      } else {
        setFeedback({ text: `Recognition error: ${event.error}`, type: 'error' });
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const toggleListening = () => {
    if (disabled) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setFeedback({ text: '', type: '' });
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Failed to start speech recognition:', e);
      }
    }
  };

  // Keep feedback clean after timeout
  const triggerFeedback = (text, type) => {
    setFeedback({ text, type });
    if (type !== 'error' || text.includes('not supported')) {
      const timer = setTimeout(() => {
        setFeedback(prev => prev.text === text ? { text: '', type: '' } : prev);
      }, 5000);
      return () => clearTimeout(timer);
    }
  };

  const cleanSpeechText = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '') // remove punctuation
      .replace(/\bto\b|\btwo\b|\btoo\b/g, 'to')
      .replace(/\bfor\b|\bfour\b/g, '4')
      .replace(/\bate\b/g, '8')
      .replace(/\bone\b|\bwon\b/g, '1')
      .replace(/\bbee\b|\bbe\b/g, 'b')
      .replace(/\bsee\b|\bsea\b/g, 'c')
      .replace(/\bknight\b|\bnight\b/g, 'knight')
      .replace(/\bqueen\b/g, 'queen')
      .replace(/\brook\b/g, 'rook')
      .replace(/\bbishop\b/g, 'bishop')
      .replace(/\bking\b/g, 'king')
      .replace(/\bpawn\b/g, 'pawn')
      .replace(/\s+/g, ' '); // collapse extra spaces
  };

  const processVoiceCommand = (rawText) => {
    const text = cleanSpeechText(rawText);
    console.log(`Processed Speech command: "${text}" (Raw: "${rawText}")`);

    // 1. System/Game Commands
    if (text.includes('flip board') || text.includes('flip perspective') || text === 'flip') {
      onFlip();
      triggerFeedback('Board flipped!', 'success');
      return;
    }

    if (text.includes('resign') || text.includes('give up')) {
      onResign();
      triggerFeedback('Resigned via voice command.', 'success');
      return;
    }

    if (text === 'draw' || text.includes('offer draw') || text.includes('propose draw')) {
      onDraw();
      triggerFeedback('Draw proposed via voice command.', 'success');
      return;
    }

    // Check if it's currently the user's turn
    if (!isUserTurn) {
      triggerFeedback("It is not your turn to move.", 'error');
      return;
    }

    // 2. Coordinate Movement Matching (e.g. "e2 to e4", "e2 e4", "e2to e4")
    // Match structure: file(a-h), rank(1-8), optional separator, file(a-h), rank(1-8)
    const coordPattern = /\b([a-h])\s*([1-8])\s*(?:to\s+)?([a-h])\s*([1-8])\b/i;
    const coordMatch = text.match(coordPattern);
    
    if (coordMatch) {
      const from = coordMatch[1] + coordMatch[2];
      const to = coordMatch[3] + coordMatch[4];
      console.log(`Attempting coordinate move: ${from} -> ${to}`);
      
      onMakeMove({ from, to, promotion: 'q' });
      triggerFeedback(`Moved ${from.toUpperCase()} to ${to.toUpperCase()}`, 'success');
      return;
    }

    // 3. Algebraic parsing (e.g., "knight to f3", "knight f3", "e4", "d4")
    // Extract pieces
    let pieceCode = '';
    let searchText = text;
    
    if (text.startsWith('knight')) {
      pieceCode = 'N';
      searchText = text.replace('knight', '').trim();
    } else if (text.startsWith('bishop')) {
      pieceCode = 'B';
      searchText = text.replace('bishop', '').trim();
    } else if (text.startsWith('rook')) {
      pieceCode = 'R';
      searchText = text.replace('rook', '').trim();
    } else if (text.startsWith('queen')) {
      pieceCode = 'Q';
      searchText = text.replace('queen', '').trim();
    } else if (text.startsWith('king')) {
      pieceCode = 'K';
      searchText = text.replace('king', '').trim();
    } else if (text.startsWith('pawn')) {
      searchText = text.replace('pawn', '').trim();
    }

    // Look for target square in remaining text
    const squarePattern = /\b([a-h])\s*([1-8])\b/i;
    const squareMatch = searchText.match(squarePattern);

    if (squareMatch) {
      const destSquare = squareMatch[1] + squareMatch[2];
      const algebraicMove = pieceCode + destSquare;
      console.log(`Attempting algebraic move: ${algebraicMove}`);
      
      onMakeMove(algebraicMove);
      triggerFeedback(`Moved ${algebraicMove}`, 'success');
      return;
    }

    // If nothing matches
    triggerFeedback(`Unrecognized command: "${rawText}"`, 'error');
  };

  return (
    <div className="controls-card glass-panel" style={{ marginTop: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🎤 Voice Commands</span>
        </h3>
        <button 
          onClick={() => setShowHelp(prev => !prev)}
          className="btn-glass"
          style={{ border: 'none', background: 'transparent', padding: '4px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)' }}
          title="Voice command help"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {showHelp && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '8px', marginBottom: '10px', lineHeight: '1.4' }}>
          <strong>Supported Commands:</strong>
          <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
            <li>Coordinates: <em>"e2 to e4"</em> or <em>"e2 e4"</em></li>
            <li>Algebraic: <em>"Knight to f3"</em> or <em>"e4"</em></li>
            <li>Controls: <em>"flip board"</em>, <em>"resign"</em>, <em>"offer draw"</em></li>
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={toggleListening}
          disabled={disabled}
          className={`btn ${isListening ? 'btn-danger pulse' : 'btn-glass'}`}
          style={{ 
            borderRadius: '50%', 
            width: '42px', 
            height: '42px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flexShrink: 0,
            padding: 0,
            boxShadow: isListening ? '0 0 12px var(--accent-ruby)' : 'none'
          }}
          title={isListening ? 'Stop listening' : 'Start voice commands'}
        >
          {isListening ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flexGrow: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {isListening ? '🔴 LISTENING' : 'OFFLINE'}
          </span>
          <span style={{ 
            fontSize: '12px', 
            color: transcript ? 'var(--text-primary)' : 'var(--text-muted)', 
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontStyle: transcript ? 'normal' : 'italic'
          }}>
            {transcript || 'Say "e2 to e4" to move...'}
          </span>
        </div>
      </div>

      {feedback.text && (
        <div style={{ 
          marginTop: '10px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          fontSize: '11px', 
          color: feedback.type === 'error' ? 'var(--accent-ruby)' : feedback.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-gold)'
        }}>
          <AlertCircle size={12} />
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}
