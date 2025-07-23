const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); // Statik dosya servisi

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); // daha stabil
});

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı');

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı');
    });
});

http.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});
