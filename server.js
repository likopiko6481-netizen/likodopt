const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Хранилища активных пиров и очереди поиска
const activePeers = new Map(); // peerId -> timestamp
const searchingPeers = new Map(); // peerId -> timestamp

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Likodopt запущен на порту ${PORT}`);
});

// Встроенный PeerServer на том же порту (путь /peerjs)
const peerServer = ExpressPeerServer(server, {
  path: '/',
  proxied: true,
  allow_discovery: true
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  activePeers.set(client.id, Date.now());
  console.log('Пир подключился:', client.id);
});

peerServer.on('disconnect', (client) => {
  activePeers.delete(client.id);
  searchingPeers.delete(client.id);
  console.log('Пир отключился:', client.id);
});

// Очистка зависших пользователей каждые 15 секунд
setInterval(() => {
  const now = Date.now();
  activePeers.forEach((lastActive, peerId) => {
    if (now - lastActive > 25000) {
      activePeers.delete(peerId);
      searchingPeers.delete(peerId);
    }
  });
  searchingPeers.forEach((lastSearch, peerId) => {
    if (now - lastSearch > 15000) {
      searchingPeers.delete(peerId);
    }
  });
}, 15000);

// Фоновая картинка
app.get('/background-image', (req, res) => {
  const names = ['bg.png', 'bg.jpg', 'bg.jpeg', 'bg.webp'];
  for (const name of names) {
    const fullPath = path.join(__dirname, name);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }
  res.status(404).end();
});

// Проверка здоровья и онлайна
app.get('/ping', (req, res) => {
  const peerId = req.query.peerId;
  if (peerId) {
    activePeers.set(peerId, Date.now());
  }
  res.json({
    status: 'OK',
    online: activePeers.size
  });
});

// Поиск свободного собеседника
app.get('/find-partner', (req, res) => {
  const myId = req.query.myId;
  if (!myId) {
    return res.status(400).json({ error: 'Требуется параметр myId' });
  }

  const now = Date.now();
  activePeers.set(myId, now);
  searchingPeers.set(myId, now);

  // Ищем тех, кто тоже сейчас нажал кнопку поиска
  const availablePeers = [];
  searchingPeers.forEach((lastSearch, peerId) => {
    if (peerId !== myId && (now - lastSearch) < 12000) {
      availablePeers.push(peerId);
    }
  });

  if (availablePeers.length === 0) {
    return res.json({
      code: 'NO_PARTNERS',
      online: activePeers.size
    });
  }

  // Выбираем случайного собеседника и убираем обоих из очереди поиска
  const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
  searchingPeers.delete(myId);
  searchingPeers.delete(partnerId);

  res.json({
    partnerId,
    online: activePeers.size
  });
});

// Остановка поиска
app.get('/stop-search', (req, res) => {
  const myId = req.query.myId;
  if (myId) {
    searchingPeers.delete(myId);
  }
  res.json({ ok: true });
});

// Главная страница
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
