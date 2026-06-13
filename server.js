import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  initDb,
  getCatalog,
  addMovie,
  deleteMovie,
  getAdminCredentials,
  updateAdminCredentials
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Initialize Database
await initDb();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Admin active tokens store in memory
const activeAdminTokens = new Set();

// Admin Authentication Middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Требуется авторизация.' });
  }
  const token = authHeader.split(' ')[1];
  if (!activeAdminTokens.has(token)) {
    return res.status(403).json({ message: 'Неверный или устаревший токен сессии.' });
  }
  next();
}

// Rooms database in memory
const rooms = new Map();

// Helper to generate a 5-digit room code
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(10000 + Math.random() * 90000).toString();
  } while (rooms.has(code));
  return code;
}

// ==========================================
// ADMIN REST API ENDPOINTS
// ==========================================

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const adminCreds = await getAdminCredentials();

  if (username === adminCreds.username && password === adminCreds.password) {
    const token = crypto.randomBytes(32).toString('hex');
    activeAdminTokens.add(token);
    return res.json({ token, message: 'Успешный вход.' });
  } else {
    return res.status(401).json({ message: 'Неверное имя пользователя или пароль.' });
  }
});

// Get Admin stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  let totalUsers = 0;
  rooms.forEach((room) => {
    totalUsers += room.users.length;
  });
  
  const catalog = await getCatalog();
  return res.json({
    roomsCount: rooms.size,
    usersCount: totalUsers,
    catalogCount: catalog.length
  });
});

// Get Active Rooms
app.get('/api/admin/rooms', adminAuth, (req, res) => {
  const roomsList = [];
  rooms.forEach((room, code) => {
    roomsList.push({
      code,
      id: room.id,
      hostNickname: room.hostNickname,
      usersCount: room.users.length,
      currentVideoTitle: room.videoState.title || 'Нет видео'
    });
  });
  return res.json(roomsList);
});

// Close a room
app.delete('/api/admin/rooms/:code', adminAuth, (req, res) => {
  const { code } = req.params;
  if (!rooms.has(code)) {
    return res.status(404).json({ message: 'Комната не найдена.' });
  }

  const roomData = rooms.get(code);
  
  io.to(roomData.id).emit('room-closed-by-admin', {
    message: 'Эта комната была закрыта администратором ресурса.'
  });

  const clients = io.sockets.adapter.rooms.get(roomData.id);
  if (clients) {
    for (const socketId of clients) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomData.id);
        socket.roomCode = null;
      }
    }
  }

  rooms.delete(code);
  console.log(`Room ${code} closed by admin.`);
  return res.json({ message: `Комната ${code} успешно закрыта.` });
});

// Broadcast a global message
app.post('/api/admin/broadcast', adminAuth, (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ message: 'Текст сообщения не может быть пустым.' });
  }

  io.emit('chat-message', {
    id: `sys-broadcast-${Date.now()}`,
    sender: 'АДМИНИСТРАТОР',
    text: `🚨 ОБЪЯВЛЕНИЕ: ${text}`,
    isSystem: true
  });

  console.log(`Global admin broadcast sent: "${text}"`);
  return res.json({ message: 'Оповещение успешно отправлено.' });
});

// Get Public Catalog
app.get('/api/admin/catalog', async (req, res) => {
  const catalog = await getCatalog();
  return res.json(catalog);
});

// Add Movie to Catalog
app.post('/api/admin/catalog', adminAuth, async (req, res) => {
  const { title, description, poster, url, type, rating } = req.body;
  if (!title || !url) {
    return res.status(400).json({ message: 'Название и ссылка на видео обязательны.' });
  }

  const movie = await addMovie({ title, description, poster, url, type, rating });
  console.log(`Movie added to catalog: "${title}"`);
  return res.json(movie);
});

// Delete Movie from Catalog
app.delete('/api/admin/catalog/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  const success = await deleteMovie(id);
  if (success) {
    console.log(`Movie ID ${id} deleted from catalog.`);
    return res.json({ message: 'Фильм удален из каталога.' });
  } else {
    return res.status(404).json({ message: 'Фильм не найден в каталоге.' });
  }
});

// Update admin settings
app.post('/api/admin/settings', adminAuth, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Имя пользователя и пароль не могут быть пустыми.' });
  }

  await updateAdminCredentials(username, password);
  console.log('Admin credentials updated.');
  return res.json({ message: 'Настройки входа успешно изменены.' });
});

// ==========================================
// GLOBAL MOVIE SEARCH (IMDB PROXY)
// ==========================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || query.length < 2) {
    return res.json({ d: [] });
  }
  try {
    const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    const firstLetter = cleanQuery.charAt(0) || 'a';
    const url = `https://v2.sg.media-imdb.com/suggestion/${firstLetter}/${cleanQuery}.json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).json({ error: 'IMDB API Error' });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// SOCKET.IO REAL-TIME EVENT HANDLERS
// ==========================================

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create Room (Host)
  socket.on('create-room', ({ nickname }) => {
    const roomCode = generateRoomCode();
    const roomData = {
      id: `room-${socket.id}`,
      hostId: socket.id,
      hostNickname: nickname,
      videoState: {
        url: '',
        type: 'none',
        title: '',
        currentTime: 0,
        playing: false,
        speed: 1, // Default speed
        subtitlesUrl: ''
      },
      users: [{ id: socket.id, nickname, isHost: true }]
    };

    rooms.set(roomCode, roomData);
    socket.join(roomData.id);

    socket.roomCode = roomCode;
    socket.nickname = nickname;

    socket.emit('room-created', {
      roomCode,
      videoState: roomData.videoState,
      users: roomData.users
    });

    console.log(`Room created: ${roomCode} by ${nickname} (${socket.id})`);
  });

  // Join Room (Guest)
  socket.on('join-room', ({ roomCode, nickname }) => {
    const cleanCode = roomCode.trim();
    if (!rooms.has(cleanCode)) {
      socket.emit('join-error', { message: 'Комната с таким кодом не найдена.' });
      return;
    }

    const roomData = rooms.get(cleanCode);
    const userExists = roomData.users.some(u => u.id === socket.id);
    if (!userExists) {
      roomData.users.push({ id: socket.id, nickname, isHost: false });
    }

    socket.join(roomData.id);
    socket.roomCode = cleanCode;
    socket.nickname = nickname;

    socket.emit('room-joined', {
      roomCode: cleanCode,
      videoState: roomData.videoState,
      users: roomData.users
    });

    socket.to(roomData.id).emit('user-joined', {
      id: socket.id,
      nickname,
      users: roomData.users
    });

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${nickname} присоединился к совместному просмотру.`,
      isSystem: true
    });

    console.log(`User ${nickname} joined room ${cleanCode}`);
  });

  // Play Video
  socket.on('play-video', ({ currentTime }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState.playing = true;
    roomData.videoState.currentTime = currentTime;

    socket.to(roomData.id).emit('play-video', { currentTime, sender: socket.nickname });

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} запустил воспроизведение.`,
      isSystem: true
    });
  });

  // Pause Video
  socket.on('pause-video', ({ currentTime }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState.playing = false;
    roomData.videoState.currentTime = currentTime;

    socket.to(roomData.id).emit('pause-video', { currentTime, sender: socket.nickname });

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} приостановил воспроизведение.`,
      isSystem: true
    });
  });

  // Seek Video
  socket.on('seek-video', ({ currentTime }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState.currentTime = currentTime;

    socket.to(roomData.id).emit('seek-video', { currentTime, sender: socket.nickname });

    const formatTime = (time) => {
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    };

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} перемотал на ${formatTime(currentTime)}.`,
      isSystem: true
    });
  });

  // Change Video URL
  socket.on('change-video', ({ url, type, title }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState = {
      ...roomData.videoState,
      url,
      type,
      title,
      currentTime: 0,
      playing: false,
      speed: 1 // reset speed
    };

    io.to(roomData.id).emit('change-video', roomData.videoState);

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} изменил фильм на "${title || 'Без названия'}".`,
      isSystem: true
    });
  });

  // Load Subtitles
  socket.on('change-subtitles', ({ subtitlesUrl }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState.subtitlesUrl = subtitlesUrl;

    io.to(roomData.id).emit('change-subtitles', { subtitlesUrl });

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} загрузил файл субтитров.`,
      isSystem: true
    });
  });

  // Playback Speed Change
  socket.on('change-speed', ({ speed }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.videoState.speed = speed;

    socket.to(roomData.id).emit('change-speed', { speed, sender: socket.nickname });

    io.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} изменил скорость воспроизведения на ${speed}x.`,
      isSystem: true
    });
  });

  // Chat Message
  socket.on('send-message', ({ text }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    
    io.to(roomData.id).emit('chat-message', {
      id: `msg-${Date.now()}-${socket.id}`,
      sender: socket.nickname,
      text,
      isSystem: false,
      socketId: socket.id
    });
  });

  // Typing status broadcast
  socket.on('typing-status', ({ isTyping }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    socket.to(roomData.id).emit('typing-status', {
      id: socket.id,
      nickname: socket.nickname,
      isTyping
    });
  });

  // Emoji Reactions
  socket.on('send-reaction', ({ reaction }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    socket.to(roomData.id).emit('receive-reaction', { reaction, sender: socket.nickname });
  });

  // Sync request
  socket.on('request-sync', () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    if (socket.id !== roomData.hostId) {
      io.to(roomData.hostId).emit('request-host-sync', { requestorId: socket.id });
    }
  });

  // Sync response
  socket.on('send-sync-to-peer', ({ peerId, currentTime, playing, speed }) => {
    io.to(peerId).emit('receive-sync', { currentTime, playing, speed });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const roomData = rooms.get(roomCode);
    roomData.users = roomData.users.filter(u => u.id !== socket.id);

    socket.to(roomData.id).emit('user-left', {
      id: socket.id,
      nickname: socket.nickname,
      users: roomData.users
    });

    socket.to(roomData.id).emit('chat-message', {
      id: `sys-${Date.now()}`,
      sender: 'Система',
      text: `${socket.nickname} покинул просмотр.`,
      isSystem: true
    });

    // Notify typing false on disconnect
    socket.to(roomData.id).emit('typing-status', {
      id: socket.id,
      nickname: socket.nickname,
      isTyping: false
    });

    if (socket.id === roomData.hostId && roomData.users.length > 0) {
      const newHost = roomData.users[0];
      newHost.isHost = true;
      roomData.hostId = newHost.id;
      roomData.hostNickname = newHost.nickname;

      io.to(roomData.id).emit('host-changed', {
        hostId: newHost.id,
        hostNickname: newHost.nickname,
        users: roomData.users
      });

      io.to(roomData.id).emit('chat-message', {
        id: `sys-${Date.now()}`,
        sender: 'Система',
        text: `${newHost.nickname} теперь является хостом комнаты.`,
        isSystem: true
      });
    }

    if (roomData.users.length === 0) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (empty)`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
