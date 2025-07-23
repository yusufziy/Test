import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

function App() {
  const [username, setUsername] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  
  const websocket = useRef(null);
  const messagesEndRef = useRef(null);

  // Load messages on component mount
  useEffect(() => {
    loadMessages();
  }, []);

  // Setup WebSocket connection when username is set
  useEffect(() => {
    if (isUsernameSet && username) {
      setupWebSocket();
    }
    return () => {
      if (websocket.current) {
        websocket.current.close();
      }
    };
  }, [isUsernameSet, username]);

  // Auto scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      const response = await axios.get(`${API}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const setupWebSocket = () => {
    websocket.current = new WebSocket(`${WS_URL}/ws/${username}`);
    
    websocket.current.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    websocket.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        setMessages(prev => [...prev, data.data]);
      } else if (data.type === 'message_deleted') {
        setMessages(prev => prev.filter(msg => msg.id !== data.data.message_id));
      }
    };

    websocket.current.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (isUsernameSet && username) {
          setupWebSocket();
        }
      }, 3000);
    };

    websocket.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
  };

  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setIsUsernameSet(true);
    }
  };

  const handleMessageSubmit = async (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      try {
        await axios.post(`${API}/messages`, {
          username: username,
          content: newMessage,
          is_admin: isAdmin
        });
        setNewMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/admin/login`, {
        username: 'admin',
        password: adminPassword
      });
      if (response.data.success) {
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminPassword('');
      }
    } catch (error) {
      alert('Invalid admin credentials');
      console.error('Admin login error:', error);
    }
  };

  const deleteMessage = async (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      try {
        await axios.delete(`${API}/admin/messages/${messageId}`);
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Check for admin access via secret key combination
  const handleKeyPress = (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      setShowAdminLogin(true);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // Username entry screen
  if (!isUsernameSet) {
    return (
      <div className="app">
        <div className="username-container">
          <div className="username-card">
            <h1>ByLock Private Chat</h1>
            <p>Enter your username to join the secure chat</p>
            <form onSubmit={handleUsernameSubmit}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username..."
                className="username-input"
                autoFocus
              />
              <button type="submit" className="join-btn">
                Join Chat
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Admin login modal
  if (showAdminLogin) {
    return (
      <div className="app">
        <div className="username-container">
          <div className="username-card">
            <h2>Admin Access</h2>
            <p>Enter admin password</p>
            <form onSubmit={handleAdminLogin}>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Admin password..."
                className="username-input"
                autoFocus
              />
              <button type="submit" className="join-btn">
                Login
              </button>
              <button 
                type="button" 
                onClick={() => setShowAdminLogin(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Main chat interface
  return (
    <div className="app">
      {/* Header */}
      <div className="chat-header">
        <h1>ByLock Private Chat</h1>
        <div className="header-controls">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          {isAdmin && (
            <span className="admin-badge">ADMIN MODE</span>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-container">
        <div className="messages-container">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.is_admin ? 'admin-message' : ''}`}>
              <div className="message-header">
                <span className="username">
                  {message.username}
                  {message.is_admin && <span className="admin-tag">ADMIN</span>}
                </span>
                <span className="timestamp">{formatTime(message.timestamp)}</span>
                {isAdmin && (
                  <button 
                    onClick={() => deleteMessage(message.id)}
                    className="delete-btn"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <div className="message-content">{message.content}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="input-container">
          <form onSubmit={handleMessageSubmit} className="message-form">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="message-input"
              disabled={!isConnected}
            />
            <button 
              type="submit" 
              className="send-btn"
              disabled={!isConnected || !newMessage.trim()}
            >
              Send
            </button>
          </form>
          {isAdmin && (
            <div className="admin-info">
              <small>🔑 Admin Mode: Your messages are tagged as ADMIN</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;