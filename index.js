const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

// Statik dosyaları servis et
app.use(express.static(__dirname));

// Ana sayfada index.html'i göster
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io bağlantısı
io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı!');
});

http.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor!`);
});
