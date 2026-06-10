require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Ensure uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|heic|heif/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype.split('/')[1]);
    if (extOk || mimeOk) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// CORS middleware (for separate frontend hosting)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

// Serve user panel at /
app.use(express.static(path.join(__dirname, '../public/user')));

// Serve admin panel at /admin
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// ====================== TELEGRAM ALERTS ======================
async function sendTelegramAlert(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

async function alertNewUserFirstMessage(userId, messageText) {
  const msg = `<b>👤 Naya User Aaya!</b>\n\nUser #${userId} ne first message bheja hai.\nMessage: ${messageText || '(image)'}`;
  await sendTelegramAlert(process.env.TELEGRAM_CHANNEL_NEW_USER, msg);
}

async function alertAllMessages(userId, messageText, imageUrl) {
  const content = messageText || (imageUrl ? '[Image]' : '');
  const msg = `<b>💬 User #${userId} ne message bheja</b>\n\n${content}`;
  await sendTelegramAlert(process.env.TELEGRAM_CHANNEL_ALL_MSGS, msg);
}

// ====================== API ROUTES ======================

// Create new user
app.post('/api/user/new', (req, res) => {
  const user = db.createUser();
  res.json({ id: user.id });
});

// Get all users (for admin)
app.get('/api/users', (req, res) => {
  const users = db.getAllUsers();
  res.json(users);
});

// Get messages for a specific user
app.get('/api/messages/:userId', (req, res) => {
  const messages = db.getMessages(req.params.userId);
  res.json(messages);
});

// Upload image
app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// Send message (from user or admin)
app.post('/api/message', (req, res) => {
  const { userId, message, imageUrl, isAdmin } = req.body;
  const msg = db.addMessage(userId, message, imageUrl, isAdmin ? 1 : 0);

  // Real-time broadcast
  io.emit('message:new', {
    ...msg,
    user_id: parseInt(userId),
  });

  // Telegram alerts (only for user messages, not admin)
  if (!isAdmin) {
    const count = db.getUserMessageCount(userId);
    if (count === 1) {
      // First message ever from this user
      db.setUserHasSentMessage(userId);
      alertNewUserFirstMessage(userId, message);
    }
    // Always send to all-messages channel
    alertAllMessages(userId, message, imageUrl);
  }

  res.json({ success: true, message: msg });
});

// ====================== SOCKET.IO ======================
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);

  // User comes online
  socket.on('user:online', (userId) => {
    db.setUserOnline(userId, 1);
    io.emit('user:status', { userId: parseInt(userId), online: 1 });
    console.log(`✅ User #${userId} is online`);
  });

  // User goes offline
  socket.on('user:offline', (userId) => {
    db.setUserOnline(userId, 0);
    io.emit('user:status', { userId: parseInt(userId), online: 0 });
    console.log(`❌ User #${userId} is offline`);
  });

  // Admin viewing a user's chat — join a room
  socket.on('admin:select_user', (userId) => {
    const room = `user_${userId}`;
    socket.join(room);
    console.log(`🔍 Admin joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// ====================== START SERVER ======================
const PORT = process.env.PORT || 3000;

db.init().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`👤 User Panel:  http://localhost:${PORT}`);
    console.log(`🔧 Admin Panel: http://localhost:${PORT}/admin\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
