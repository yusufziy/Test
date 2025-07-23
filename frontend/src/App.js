import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
const WS_FALLBACK = BACKEND_URL; // HTTP fallback for WebSocket

function App() {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [username, setUsername] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [connectionRetries, setConnectionRetries] = useState(0);
  
  const websocket = useRef(null);
  const messagesEndRef = useRef(null);
  const reconnectTimer = useRef(null);

  // Load messages on component mount
  useEffect(() => {
    if (isUsernameSet) {
      loadMessages();
    }
  }, [isUsernameSet]);

  // Setup WebSocket connection when username is set
  useEffect(() => {
    if (isUsernameSet && username && acceptedTerms) {
      setupWebSocket();
    }
    return () => {
      if (websocket.current) {
        websocket.current.close();
      }
      if (reconnectTimer.current) {
        if (typeof reconnectTimer.current === 'number') {
          clearTimeout(reconnectTimer.current);
        } else {
          clearInterval(reconnectTimer.current);
        }
      }
    };
  }, [isUsernameSet, username, acceptedTerms]);

  // Auto scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      console.log('Loading messages...');
      const response = await axios.get(`${API}/messages`);
      console.log('Messages loaded:', response.data);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const setupWebSocket = () => {
    try {
      // Try WebSocket first, then fallback to polling
      const wsUrl = `${WS_URL}/ws/${username}`;
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      websocket.current = new WebSocket(wsUrl);
      
      websocket.current.onopen = () => {
        setIsConnected(true);
        setConnectionRetries(0);
        console.log('WebSocket connected successfully');
      };

      websocket.current.onmessage = (event) => {
        try {
          console.log('WebSocket message received:', event.data);
          const data = JSON.parse(event.data);
          if (data.type === 'new_message') {
            setMessages(prev => {
              // Check if message already exists to prevent duplicates
              if (prev.find(msg => msg.id === data.data.id)) {
                return prev;
              }
              return [...prev, data.data];
            });
          } else if (data.type === 'message_deleted') {
            setMessages(prev => prev.filter(msg => msg.id !== data.data.message_id));
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.current.onclose = (event) => {
        setIsConnected(false);
        console.log('WebSocket disconnected:', event.code, event.reason);
        
        // If WebSocket fails, use polling as fallback
        if (connectionRetries === 0) {
          console.log('WebSocket failed, switching to polling mode...');
          startPolling();
        } else if (connectionRetries < 3) {
          const delay = Math.pow(2, connectionRetries) * 1000;
          console.log(`Reconnecting in ${delay}ms...`);
          reconnectTimer.current = setTimeout(() => {
            setConnectionRetries(prev => prev + 1);
            setupWebSocket();
          }, delay);
        } else {
          console.log('Max retries reached, switching to polling...');
          startPolling();
        }
      };

      websocket.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      setIsConnected(false);
      startPolling();
    }
  };

  // Polling fallback for real-time updates
  const startPolling = () => {
    console.log('Starting polling mode for real-time updates...');
    
    // Immediately set connected status for polling mode
    setIsConnected(true);
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API}/messages`);
        const newMessages = response.data;
        
        setMessages(prevMessages => {
          // Always update to ensure fresh data
          if (JSON.stringify(newMessages) !== JSON.stringify(prevMessages)) {
            console.log('Messages updated via polling:', newMessages.length);
            return newMessages;
          }
          return prevMessages;
        });
        
        // Keep connection status as connected while polling works
        setIsConnected(true);
      } catch (error) {
        console.error('Polling error:', error);
        setIsConnected(false);
      }
    }, 2000); // Poll every 2 seconds

    // Store interval ID to clear it later
    if (reconnectTimer.current) {
      clearInterval(reconnectTimer.current);
    }
    reconnectTimer.current = pollInterval;
  };

  const handleTermsAccept = () => {
    setAcceptedTerms(true);
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
        console.log('Sending message:', newMessage);
        const response = await axios.post(`${API}/messages`, {
          username: username,
          content: newMessage,
          is_admin: isAdmin
        });
        console.log('Message sent successfully:', response.data);
        setNewMessage('');
        
        // Immediately reload messages after sending
        setTimeout(loadMessages, 500);
      } catch (error) {
        console.error('Error sending message:', error);
        alert('Mesaj gönderilirken hata oluştu. Lütfen tekrar deneyin.');
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
      alert('Geçersiz yönetici bilgileri');
      console.error('Admin login error:', error);
    }
  };

  const deleteMessage = async (messageId) => {
    if (window.confirm('Bu mesajı silmek istediğinizden emin misiniz?')) {
      try {
        await axios.delete(`${API}/admin/messages/${messageId}`);
      } catch (error) {
        console.error('Error deleting message:', error);
        alert('Mesaj silinirken hata oluştu.');
      }
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('tr-TR', {
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

  // Terms acceptance screen
  if (!acceptedTerms) {
    return (
      <div className="app">
        <div className="terms-container">
          <div className="terms-card">
            <h1>ByLock Özel Sohbet</h1>
            <h2>Kullanım Şartları ve Gizlilik Sözleşmesi</h2>
            <div className="terms-content">
              <h3>1. Kullanım Şartları</h3>
              <p>• Bu platform özel ve güvenli mesajlaşma için tasarlanmıştır.</p>
              <p>• Tüm mesajlar şifrelenir ve güvenli bir şekilde saklanır.</p>
              <p>• Yasa dışı, zararlı veya rahatsız edici içerik paylaşmak yasaktır.</p>
              <p>• Platform yöneticileri güvenlik amacıyla mesajları inceleyebilir.</p>
              
              <h3>2. Gizlilik Politikası</h3>
              <p>• Kişisel bilgileriniz üçüncü şahıslarla paylaşılmaz.</p>
              <p>• Mesajlarınız sadece güvenlik ve denetim amacıyla erişilebilir.</p>
              <p>• IP adresi ve bağlantı logları güvenlik amacıyla tutulur.</p>
              
              <h3>3. Sorumluluklar</h3>
              <p>• Paylaştığınız içerikten tamamen siz sorumlusunuz.</p>
              <p>• Platform yönetimi uygunsuz davranışlar için hesap kapatma hakkını saklı tutar.</p>
              <p>• Teknik arızalardan dolayı oluşabilecek kayıplardan sorumluluk kabul edilmez.</p>
            </div>
            <div className="terms-actions">
              <button onClick={handleTermsAccept} className="accept-btn">
                Kabul Ediyorum ve Sohbete Devam Et
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Username entry screen
  if (!isUsernameSet) {
    return (
      <div className="app">
        <div className="username-container">
          <div className="username-card">
            <h1>ByLock Özel Sohbet</h1>
            <p>Güvenli sohbete katılmak için kullanıcı adınızı girin</p>
            <form onSubmit={handleUsernameSubmit}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Kullanıcı adınızı girin..."
                className="username-input"
                autoFocus
              />
              <button type="submit" className="join-btn">
                Sohbete Katıl
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
            <h2>Yönetici Girişi</h2>
            <p>Yönetici şifresini girin</p>
            <form onSubmit={handleAdminLogin}>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Yönetici şifresi..."
                className="username-input"
                autoFocus
              />
              <button type="submit" className="join-btn">
                Giriş Yap
              </button>
              <button 
                type="button" 
                onClick={() => setShowAdminLogin(false)}
                className="cancel-btn"
              >
                İptal
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
        <h1>ByLock Özel Sohbet</h1>
        <div className="header-controls">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Bağlı' : '🔴 Bağlantı Kopuk'}
            {!isConnected && connectionRetries > 0 && (
              <span className="retry-info"> (Yeniden bağlanıyor... {connectionRetries}/5)</span>
            )}
          </span>
          {isAdmin && (
            <span className="admin-badge">YÖNETİCİ MODU</span>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>Henüz mesaj yok. İlk mesajı siz gönderin!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`message ${message.is_admin ? 'admin-message' : ''}`}>
                <div className="message-header">
                  <span className="username">
                    {message.username}
                    {message.is_admin && <span className="admin-tag">YÖNETİCİ</span>}
                  </span>
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                  {isAdmin && (
                    <button 
                      onClick={() => deleteMessage(message.id)}
                      className="delete-btn"
                      title="Mesajı sil"
                    >
                      🗑️
                    </button>
                  )}
                </div>
                <div className="message-content">{message.content}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="input-container">
          <form onSubmit={handleMessageSubmit} className="message-form">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Mesajınızı yazın..."
              className="message-input"
              disabled={!isConnected}
            />
            <button 
              type="submit" 
              className="send-btn"
              disabled={!newMessage.trim()}
            >
              Gönder
            </button>
          </form>
          {isAdmin && (
            <div className="admin-info">
              <small>🔑 Yönetici Modu: Mesajlarınız YÖNETİCİ olarak etiketlenir</small>
            </div>
          )}
          {!isConnected && (
            <div className="connection-warning">
              <small>⚠️ Bağlantı kopuk - Mesaj gönderemiyor ve otomatik yeniden bağlanmaya çalışıyor...</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;