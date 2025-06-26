import React, { useState, useRef, useEffect } from 'react';

// Inject reference.html CSS into the page
const referenceCss = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100vh; overflow: hidden; }
.widget-button { position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); transition: all 0.3s ease; z-index: 1000; border: none; }
.widget-button:hover { transform: scale(1.1); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); }
.widget-button svg { width: 24px; height: 24px; fill: white; }
.chat-window { position: fixed; bottom: 20px; right: 20px; width: 380px; height: 600px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); display: none; flex-direction: column; overflow: hidden; z-index: 1001; border: 1px solid rgba(255, 255, 255, 0.2); }
.chat-window.active { display: flex; animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
.chat-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; display: flex; align-items: center; justify-content: space-between; }
.chat-header h3 { font-size: 18px; font-weight: 600; }
.close-btn { background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 5px; border-radius: 50%; transition: background 0.2s; }
.close-btn:hover { background: rgba(255, 255, 255, 0.2); }
.voice-chat-card { background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); color: white; padding: 20px; margin: 10px; border-radius: 15px; display: none; flex-direction: column; align-items: center; gap: 15px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); }
.voice-chat-card.active { display: flex; animation: slideDown 0.3s ease-out; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
.voice-header { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.voice-title { font-size: 16px; font-weight: 600; }
.voice-close-btn { background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 5px; border-radius: 50%; transition: background 0.2s; }
.voice-close-btn:hover { background: rgba(255, 255, 255, 0.2); }
.voice-controls { display: flex; align-items: center; gap: 20px; }
.mic-button { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
.mic-button:hover { transform: scale(1.1); }
.mic-button.active { background: linear-gradient(135deg, #ff3838 0%, #d63031 100%); animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.mic-button svg { width: 24px; height: 24px; fill: white; }
.audio-bars { display: flex; align-items: center; gap: 3px; }
.audio-bar { width: 4px; height: 20px; background: rgba(255, 255, 255, 0.6); border-radius: 2px; transition: all 0.2s ease; }
.audio-bar.active { background: #00ff88; animation: bounce 0.6s infinite alternate; }
@keyframes bounce { from { height: 20px; } to { height: 40px; } }
.user-bars .audio-bar:nth-child(1) { animation-delay: 0s; }
.user-bars .audio-bar:nth-child(2) { animation-delay: 0.1s; }
.user-bars .audio-bar:nth-child(3) { animation-delay: 0.2s; }
.user-bars .audio-bar:nth-child(4) { animation-delay: 0.3s; }
.user-bars .audio-bar:nth-child(5) { animation-delay: 0.4s; }
.response-bars .audio-bar:nth-child(1) { animation-delay: 0.2s; }
.response-bars .audio-bar:nth-child(2) { animation-delay: 0.3s; }
.response-bars .audio-bar:nth-child(3) { animation-delay: 0.4s; }
.response-bars .audio-bar:nth-child(4) { animation-delay: 0.1s; }
.response-bars .audio-bar:nth-child(5) { animation-delay: 0s; }
.audio-section { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.audio-label { font-size: 12px; opacity: 0.9; }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
.message { max-width: 80%; padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.4; animation: messageSlide 0.3s ease-out; }
@keyframes messageSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.message.user { align-self: flex-end; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #222; }
.message.assistant { align-self: flex-start; background: #f1f3f4; color: #333; }
.chat-input { padding: 20px; background: white; border-top: 1px solid #e0e0e0; display: flex; gap: 10px; align-items: center; }
.input-field { flex: 1; border: 2px solid #e0e0e0; border-radius: 25px; padding: 12px 16px; font-size: 14px; outline: none; transition: border-color 0.2s; }
.input-field:focus { border-color: #667eea; }
.voice-toggle { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; }
.voice-toggle:hover { transform: scale(1.1); }
.voice-toggle svg { width: 16px; height: 16px; fill: white; }
.send-btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; }
.send-btn:hover { transform: scale(1.1); }
.send-btn svg { width: 16px; height: 16px; fill: white; }
.chat-messages::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
`;

function injectReferenceCss() {
  if (!document.getElementById('reference-css')) {
    const style = document.createElement('style');
    style.id = 'reference-css';
    style.innerHTML = referenceCss;
    document.head.appendChild(style);
  }
}

function generateSessionId() {
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
}

function formatBotMessage(text) {
  if (!text) return null;
  let formatted = text.replace(/\*(.*?)\*/g, '<span class="em">$1</span>');
  if (/^\s*[-*] /m.test(formatted)) {
    const lines = formatted.split(/\n|\r/);
    let inList = false;
    let html = '';
    lines.forEach(line => {
      if (/^\s*[-*] /.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + line.replace(/^\s*[-*] /, '') + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (line.trim()) html += '<div>' + line + '</div>';
      }
    });
    if (inList) html += '</ul>';
    formatted = html;
  } else {
    formatted = '<div>' + formatted.replace(/\n/g, '<br/>') + '</div>';
  }
  return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
}

function App() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  // const [manualSessionId, setManualSessionId] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const ws = useRef(null);
  const audioQueue = useRef([]);
  const isPlayingAudio = useRef(false);
  // const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  // const [liveTranscript, setLiveTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoiceCard, setShowVoiceCard] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const audioRef = useRef(null); // Keep a reference to the current Audio object

  useEffect(() => {
    injectReferenceCss();
    document.title = 'Demo for Chat bot';
    document.body.style.background = '';
    document.body.style.color = '';
  }, []);

  // On open, fetch previous messages for this sessionId
  useEffect(() => {
    if (open && sessionId) {
      fetch(`http://localhost:8000/api/chat/history/${sessionId}/`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.messages)) {
            setMessages(data.messages.map(m => m.role === 'user' ? { self: true, text: m.content } : { bot: true, text: m.content }));
          }
        })
        .catch(() => {});
    }
  }, [open, sessionId]);

  // WebSocket management: always use correct URL for text/voice
  useEffect(() => {
    if (!open) {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      return;
    }
    // Always create a new WebSocket when open or voiceMode changes
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    const wsUrl = voiceMode
      ? 'ws://localhost:8000/ws/voice/'
      : 'ws://localhost:8000/ws/chat/';
    ws.current = new window.WebSocket(wsUrl);
    ws.current.onopen = () => {
      console.log('WebSocket connected');
    };
    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
    };
    ws.current.onerror = (e) => {
      console.log('WebSocket error', e);
    };
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSending(false);
      if (voiceMode) {
        // Deactivate STT as soon as we start receiving a response
        deactivateSTT();
        // Voice mode: group sentences for the same response
        if (data.audio_data) {
          audioQueue.current.push(data.audio_data);
          setMessages((prev) => {
            // If last message is bot and not is_final, append sentence if not already present
            if (
              prev.length &&
              prev[prev.length - 1].bot &&
              !prev[prev.length - 1].is_final
            ) {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              // Only append if data.text is not already at the end
              const trimmedLast = lastMsg.text.trim();
              const trimmedNew = data.text.trim();
              if (!trimmedLast.endsWith(trimmedNew)) {
                lastMsg.text = (trimmedLast + ' ' + trimmedNew).trim();
              }
              lastMsg.is_final = data.is_final;
              return updated;
            } else {
              // New bot message (start of new response)
              return [
                ...prev,
                { bot: true, text: data.text, is_final: data.is_final }
              ];
            }
          });
          if (!isPlayingAudio.current) {
            playNextAudio();
          }
          // If this is the final part of the response, reactivate STT
          if (data.is_final) {
            setTimeout(activateSTT, 500); // slight delay to avoid overlap
          }
        } else if (data.message) {
          setMessages((prev) => [...prev, { bot: true, text: data.message }]);
        }
      } else {
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
          localStorage.setItem('session_id', data.session_id);
        }
        if (data.full_message) {
          setMessages((prev) => {
            const updated = [...prev];
            if (updated.length && updated[updated.length - 1].botStreaming) {
              updated[updated.length - 1] = { bot: true, text: data.full_message };
            } else {
              updated.push({ bot: true, text: data.full_message });
            }
            return updated;
          });
        } else if (data.message) {
          setMessages((prev) => {
            const updated = [...prev];
            if (updated.length && updated[updated.length - 1].botStreaming) {
              const currentText = updated[updated.length - 1].text;
              let newText = data.message;
              if (newText.startsWith(currentText)) {
                updated[updated.length - 1].text = newText;
              } else {
                updated[updated.length - 1].text += newText;
              }
            } else {
              updated.push({ bot: true, text: data.message, botStreaming: true });
            }
            return updated;
          });
        }
      }
    };
    console.log('WebSocket connecting...');
    // Cleanup on unmount or when open/voiceMode changes
    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
    // eslint-disable-next-line
  }, [open, voiceMode]);

  // Helper to play next audio in queue
  const playNextAudio = () => {
    if (audioQueue.current.length === 0) {
      isPlayingAudio.current = false;
      setBotSpeaking(false); // Stop animation when no audio
      audioRef.current = null;
      console.debug('[AUDIO] Queue empty, nothing to play');
      return;
    }
    isPlayingAudio.current = true;
    setBotSpeaking(true); // Start animation when audio starts
    const base64 = audioQueue.current.shift();
    let audioData;
    try {
      audioData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      console.debug('[AUDIO] Decoded base64 length:', base64.length, 'AudioData length:', audioData.length);
    } catch (err) {
      console.error('[AUDIO] Failed to decode base64 audio:', err);
      setBotSpeaking(false);
      isPlayingAudio.current = false;
      audioRef.current = null;
      return;
    }
    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => {
      setBotSpeaking(true);
      console.debug('[AUDIO] onplay event fired');
    };
    audio.onended = () => {
      setBotSpeaking(false); // Stop animation when audio ends
      audioRef.current = null;
      console.debug('[AUDIO] onended event fired, playing next audio if any');
      playNextAudio();
    };
    audio.onerror = (e) => {
      setBotSpeaking(false);
      isPlayingAudio.current = false;
      audioRef.current = null;
      console.error('[AUDIO] Audio playback error:', e);
    };
    // Try to play, catch promise rejections (autoplay block)
    audio.play().then(() => {
      console.debug('[AUDIO] play() promise resolved');
    }).catch(err => {
      setBotSpeaking(false);
      isPlayingAudio.current = false;
      audioRef.current = null;
      console.error('[AUDIO] Audio play() failed:', err);
    });
  };

  // Helper to control STT activation from bot response
  const deactivateSTT = () => {
    if (sttActive) setSttActive(false);
  };
  const activateSTT = () => {
    if (!sttActive) setSttActive(true);
  };

  const handleWidgetClick = () => {
    setOpen(true);
  };

  // Always use the same sessionId for both text and voice
  useEffect(() => {
    let storedSessionId = localStorage.getItem('session_id');
    if (!storedSessionId) {
      storedSessionId = generateSessionId();
      localStorage.setItem('session_id', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, [voiceMode]);

  // const handleVoiceToggle = () => {
  //   setVoiceMode(v => !v);
  //   if (ws.current) {
  //     ws.current.close();
  //     ws.current = null;
  //     setMessages([]);
  //     console.log('Voice/Text mode toggled. WebSocket closed and messages cleared, sessionId preserved:', sessionId);
  //   }
  // };

  const handleClose = () => {
    setOpen(false);
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    // Reset everything to default
    setSessionId(generateSessionId()); // New session on close
    setMessages([]);
    // setManualSessionId("");
    setVoiceMode(false);
    setShowVoiceCard(false);
    setSttActive(false);
    setIsProcessing(false);
    // setLiveTranscript("");
    setUserSpeaking(false);
    setBotSpeaking(false);
    audioQueue.current = [];
    isPlayingAudio.current = false;
    audioRef.current = null;
    // Remove session_id from localStorage so a new one is created on next open
    localStorage.removeItem('session_id');
    console.log('WebSocket connection closed by user. Everything reset. New session will be created on next open.');
  };

  // Remove * from TTS text before sending to backend
  const handleSend = (e) => {
    e.preventDefault();
    const input = e.target.elements.msg;
    const userMsg = input.value; // Capture before clearing
    if (userMsg && ws.current && ws.current.readyState === 1 && !sending) {
      setSending(true);
      let cleanText = userMsg;
      if (voiceMode) {
        cleanText = cleanText.replace(/\*/g, ''); // Remove all * for TTS
        ws.current.send(JSON.stringify({ text: cleanText, session_id: sessionId }));
        setMessages((prev) => [...prev, { self: true, text: userMsg }]);
      } else {
        ws.current.send(JSON.stringify({ message: userMsg, session_id: sessionId }));
        setMessages((prev) => [...prev, { self: true, text: userMsg }]);
      }
      input.value = '';
      console.log('Message sent to backend:', userMsg, 'Session:', sessionId);
    }
  };

  // --- UI ---
  return (
    <>
      {/* Main page content (heading and intro) */}
      <div className="main-content" style={{ padding: 32, textAlign: 'center' }}>
        <h1>Welcome to the Chat Bot Demo</h1>
        <p style={{ maxWidth: 500, margin: '0 auto', color: '#bbb' }}>
          This is a simple demo page for a floating chat widget. Click the chat icon at the bottom right to start a conversation with the bot. The chat window supports real-time streaming responses.
        </p>
      </div>
      {/* Widget Button */}
      {!open && (
        <button className="widget-button" onClick={handleWidgetClick}>
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </button>
      )}
      {/* Chat Window */}
      <div className={`chat-window${open ? ' active' : ''}`}>
        {/* Chat Header */}
        <div className="chat-header">
          <h3>AI Assistant</h3>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>
        {/* Voice Chat Card */}
        {voiceMode && showVoiceCard && (
          <div className={`voice-chat-card${showVoiceCard ? ' active' : ''}`}> 
            <div className="voice-header">
              <span className="voice-title">Voice Chat</span>
              <button className="voice-close-btn" onClick={() => {
                setShowVoiceCard(false);
                setSttActive(false);
                setIsProcessing(false);
                // setLiveTranscript("");
              }}>×</button>
            </div>
            <div className="voice-controls">
              <div className="audio-section">
                <div className="audio-label">You</div>
                <div className="audio-bars user-bars">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`audio-bar${userSpeaking ? ' active' : ''}`}></div>
                  ))}
                </div>
              </div>
              <button
                className={`mic-button${sttActive ? ' active' : ''}`}
                onClick={() => {
                  if (!sttActive && !isProcessing) setSttActive(true);
                }}
                disabled={isProcessing || sttActive}
                title={sttActive ? 'Listening...' : 'Tap to Speak'}
              >
                <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              </button>
              <div className="audio-section">
                <div className="audio-label">Assistant</div>
                <div className="audio-bars response-bars">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`audio-bar${botSpeaking ? ' active' : ''}`}></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="voice-chat-instruction" style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
              {sttActive ? (isProcessing ? 'Processing...' : 'Listening...') : 'Click microphone to start listening'}
            </div>
          </div>
        )}
        {/* Chat Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.self ? 'user' : 'assistant'}`}>{
              msg.bot ? formatBotMessage(msg.text) : (msg.text || '[No message]')
            }</div>
          ))}
          {sending && <div className="message assistant">Typing...</div>}
        </div>
        {/* Chat Input */}
        <form className="chat-input" onSubmit={handleSend}>
          <input
            type="text"
            className="input-field"
            name="msg"
            autoComplete="off"
            placeholder="Type your message..."
            ref={inputRef}
            disabled={sending}
          />
          <button
            type="button"
            className="voice-toggle"
            onClick={() => {
              if (!voiceMode) {
                setVoiceMode(true);
                setShowVoiceCard(true);
                setTimeout(() => setSttActive(true), 300);
              } else {
                setVoiceMode(false);
                setShowVoiceCard(false);
                setSttActive(false);
                setIsProcessing(false);
              }
            }}
            title={voiceMode ? 'Switch to Text Chat' : 'Switch to Voice Chat'}
          >
            <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
          </button>
          <button type="submit" className="send-btn" disabled={sending}>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </form>
      </div>
    </>
  );
}

export default App;
