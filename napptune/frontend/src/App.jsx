import { useState, useRef, useEffect } from 'react';
import './App.css';
import { generateSessionId } from './session';

function App() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [manualSessionId, setManualSessionId] = useState("");
  const ws = useRef(null);

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

  const handleWidgetClick = () => {
    setOpen(true);
    if (!ws.current) {
      ws.current = new window.WebSocket('ws://localhost:8000/ws/chat/');
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
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
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
      };
      console.log('WebSocket connecting...');
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

  const handleSend = (e) => {
    e.preventDefault();
    const input = e.target.elements.msg;
    if (input.value && ws.current && ws.current.readyState === 1 && !sending) {
      setSending(true);
      ws.current.send(JSON.stringify({ message: input.value, session_id: sessionId }));
      setMessages((prev) => [...prev, { self: true, text: input.value }]);
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

  return (
    <>
      {/* Main page content */}
      <div className="main-content">
        <h1>Welcome to the Chat Bot Demo</h1>
        <p style={{ maxWidth: 500, margin: '0 auto', color: '#bbb' }}>
          This is a simple demo page for a floating chat widget. Click the chat icon at the bottom right to start a conversation with the bot. The chat window supports real-time streaming responses.
        </p>
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
            <span>Chat Bot Demo</span>
            <button className="close-btn" onClick={handleClose}>×</button>
          </div>
          {/* Session ID input for fetching history */}
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
                  <span className="chat-text">{formatBotMessage(msg.text)}</span>
                </div>
              )
            ))}
            {sending && <div className="chat-message bot loader"><span className="chat-avatar bot">🤖</span>Typing...</div>}
          </div>
          <form className="chat-input" onSubmit={handleSend}>
            <input name="msg" autoComplete="off" placeholder="Type a message..." />
            <button type="submit" disabled={sending}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}

export default App;
