import { useState, useRef, useEffect } from 'react';
import './App.css';
import { generateSessionId } from './session';

function App() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [manualSessionId, setManualSessionId] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const ws = useRef(null);
  const audioQueue = useRef([]);
  const isPlayingAudio = useRef(false);
  const recognitionRef = useRef(null);
  const sttTimeout = useRef(null);
  const inputRef = useRef(null);

  // New state for live transcript and listening/processing UI
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    document.title = 'Demo for Chat bot';
    document.body.style.background = '#111';
    document.body.style.color = '#fff';
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

  // Helper to play next audio in queue
  const playNextAudio = () => {
    if (audioQueue.current.length === 0) {
      isPlayingAudio.current = false;
      return;
    }
    isPlayingAudio.current = true;
    const base64 = audioQueue.current.shift();
    const audioData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      playNextAudio();
    };
    audio.play();
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
    if (!ws.current) {
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
    }
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

  const handleVoiceToggle = () => {
    setVoiceMode(v => !v);
    if (ws.current) {
      ws.current.close();
      ws.current = null;
      setMessages([]);
      setSessionId(generateSessionId());
    }
  };

  const handleClose = () => {
    setOpen(false);
    if (ws.current) {
      ws.current.close();
      ws.current = null;
      setSessionId(generateSessionId()); // New session on close
      setMessages([]);
      console.log('WebSocket connection closed by user. New session will be created on next open.');
    }
  };

  // Remove * from TTS text before sending to backend
  const handleSend = (e) => {
    e.preventDefault();
    const input = e.target.elements.msg;
    if (input.value && ws.current && ws.current.readyState === 1 && !sending) {
      setSending(true);
      let cleanText = input.value;
      if (voiceMode) {
        cleanText = cleanText.replace(/\*/g, ''); // Remove all * for TTS
        ws.current.send(JSON.stringify({ text: cleanText, session_id: sessionId }));
        setMessages((prev) => [...prev, { self: true, text: input.value }]);
      } else {
        ws.current.send(JSON.stringify({ message: input.value, session_id: sessionId }));
        setMessages((prev) => [...prev, { self: true, text: input.value }]);
      }
      input.value = '';
      console.log('Message sent to backend:', input.value, 'Session:', sessionId);
    }
  };

  const handleManualSessionIdChange = (e) => {
    setManualSessionId(e.target.value);
  };

  const handleGetHistory = (e) => {
    e.preventDefault();
    if (manualSessionId) {
      fetch(`http://localhost:8000/api/chat/history/${manualSessionId}/`)
        .then(res => res.json()) 
        .then(data => {
          if (Array.isArray(data.messages)) {
            setSessionId(manualSessionId);
            setMessages(data.messages.map(m => {
              const msgObj = m.role === 'user' ? { self: true, text: m.content } : { bot: true, text: m.content };
              console.log('History message:', msgObj);
              return msgObj;
            }));
          }
        })
        .catch(() => {});
      
      console.log('Fetching history for session:', manualSessionId)
    }
  };

  // Helper to format bot message: bullet points and *emphasis*
  function formatBotMessage(text) {
    if (!text) return null;
    // Replace *word* with <span class="em">word</span>
    let formatted = text.replace(/\*(.*?)\*/g, '<span class="em">$1</span>');
    // Convert lines starting with - or * to bullet points
    if (/^\s*[-*] /m.test(formatted)) {
      // Split into lines and wrap bullet points in <ul><li>
      const lines = formatted.split(/\n|\r/);
      let inList = false;
      let html = '';
      lines.forEach(line => {
        if (/^\s*[-*] /.test(line)) {
          if (!inList) { html += '<ul>';
            inList = true; }
          html += '<li>' + line.replace(/^\s*[-*] /, '') + '</li>';
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          if (line.trim()) html += '<div>' + line + '</div>';
        }
      });
      if (inList) html += '</ul>';
      formatted = html;
    } else {
      // Just wrap in <div>
      formatted = '<div>' + formatted.replace(/\n/g, '<br/>') + '</div>';
    }
    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  }

  // --- Enhanced STT logic for smooth, real-time experience ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      return;
    }
    if (!sttActive) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setLiveTranscript("");
      setIsProcessing(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    let silenceTimer = null;
    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      setLiveTranscript(transcript);
      if (inputRef.current) inputRef.current.value = transcript;
      if (isFinal) {
        setIsProcessing(true);
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (inputRef.current && inputRef.current.value.trim()) {
            const fakeEvent = { preventDefault: () => {}, target: { elements: { msg: inputRef.current } } };
            handleSend(fakeEvent);
            inputRef.current.value = '';
            setLiveTranscript("");
          }
          setIsProcessing(false);
          setSttActive(false);
        }, 800); // faster response after final
      } else {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      }
    };
    recognition.onerror = (e) => {
      setIsProcessing(false);
      setSttActive(false);
    };
    recognition.onend = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        if (inputRef.current && inputRef.current.value.trim()) {
          const fakeEvent = { preventDefault: () => {}, target: { elements: { msg: inputRef.current } } };
          handleSend(fakeEvent);
          inputRef.current.value = '';
          setLiveTranscript("");
        }
      }
      setIsProcessing(false);
      setSttActive(false);
    };
    recognition.start();
    setIsProcessing(false);
    return () => {
      recognition.stop();
      if (silenceTimer) clearTimeout(silenceTimer);
    };
    // eslint-disable-next-line
  }, [sttActive]);

  return (
    <>
      {/* Main page content */}
      <div className="main-content">
        <h1>Welcome to the Chat Bot Demo</h1>
        <p style={{ maxWidth: 500, margin: '0 auto', color: '#bbb' }}>
          This is a simple demo page for a floating chat widget. Click the chat icon at the bottom right to start a conversation with the bot. The chat window supports real-time streaming responses.
        </p>
        <button onClick={handleVoiceToggle} style={{ position: 'fixed', bottom: 90, right: 90, zIndex: 1000 }}>
          {voiceMode ? 'Switch to Text Chat' : 'Switch to Voice Chat'}
        </button>
      </div>
      {/* Widget Icon */}
      {!open && (
        <button className="chat-widget-icon" onClick={handleWidgetClick}>
          <span role="img" aria-label="chat">💬</span>
        </button>
      )}
      {/* Chat Window */}
      {open && (
        <div className="chat-window dark-theme large">
          <div className="chat-header">
            <span>🤵 Mr. Developer</span>
            <button className="close-btn" onClick={handleClose}>×</button>
          </div>
          {/* Session ID input for fetching history */}
          {!voiceMode && (
            <form onSubmit={handleGetHistory} style={{ display: 'flex', gap: 8, margin: '8px 0', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Enter session ID to fetch history"
                value={manualSessionId}
                onChange={handleManualSessionIdChange}
                style={{ flex: 1 }}
              />
              <button type="submit">Get</button>
            </form>
          )}
          {/* If in voiceMode and sttActive or isProcessing, show sphere card inside chat window */}
          {voiceMode && (sttActive || isProcessing) ? (
            <div className="voice-chat-card voice-chat-card-inside">
              <div className="voice-chat-bubble-icon">
                <span role="img" aria-label="chat">💬</span>
              </div>
              <div className="voice-chat-sphere" />
              <div className="voice-chat-instruction">Click microphone to start listening</div>
              <div className="voice-chat-buttons">
                <button
                  className="voice-mic-btn"
                  onClick={() => { if (!sttActive && !isProcessing) setSttActive(true); }}
                  disabled={isProcessing || sttActive}
                  title={sttActive ? 'Listening...' : 'Tap to Speak'}
                >
                  <span role="img" aria-label="mic">🎤</span>
                </button>
                <button
                  className="voice-cancel-btn"
                  onClick={() => { setSttActive(false); setIsProcessing(false); }}
                  title="Cancel"
                >
                  <span role="img" aria-label="cancel">❌</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-messages">
                {messages.map((msg, i) => (
                  msg.self ? (
                    <div key={i} className="chat-message self">
                      <span className="chat-avatar user">👤</span>
                      <span className="chat-text">{msg.text}</span>
                    </div>
                  ) : (
                    <div key={i} className="chat-message bot">
                      <span className="chat-avatar bot">🤖</span>
                      <span className="chat-text">{voiceMode ? msg.text : formatBotMessage(msg.text)}</span>
                    </div>
                  )
                ))}
                {sending && <div className="chat-message bot loader"><span className="chat-avatar bot">🤖</span>Typing...</div>}
              </div>
              <form className="chat-input" onSubmit={handleSend}>
                <textarea
                  name="msg"
                  autoComplete="off"
                  placeholder="Type a message..."
                  ref={inputRef}
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 36, maxHeight: 120, flex: 1 }}
                />
                {voiceMode && (
                  <button
                    type="button"
                    onClick={() => setSttActive(true)}
                    style={{ marginLeft: 8, marginRight: 8, background: sttActive ? '#0f0' : '#333', color: '#000', border: 'none', borderRadius: 4, padding: '0 12px', height: 36 }}
                    title={sttActive ? 'Listening...' : 'Start Listening'}
                    disabled={sttActive}
                  >
                    {sttActive ? '🎤 Listening...' : '🎤 Start Mic'}
                  </button>
                )}
                <button type="submit" disabled={sending}>Send</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default App;
