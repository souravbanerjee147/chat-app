const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const sharedSession = require('express-socket.io-session');

const db = require('./db');
require('./routes/auth'); // Passport strategy

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware: Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
const sessionMiddleware = session({
  secret: 'your_super_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }
});
app.use(sessionMiddleware);

// Passport.js setup
app.use(passport.initialize());
app.use(passport.session());

// Passport Strategy
passport.use(new LocalStrategy(
  { usernameField: 'identifier' },
  async (identifier, password, done) => {
    try {
      const results = await db.query(
        'SELECT * FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1',
        [identifier, identifier, identifier]
      );
      if (results.length === 0) return done(null, false, { message: 'Invalid login' });

      const user = results[0];
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) return done(null, false, { message: 'Wrong password' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const results = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (results.length === 0) return done(null, false);
    done(null, results[0]);
  } catch (err) {
    done(err);
  }
});

// Prevent caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Static + Views
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Flash + locals
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.error = req.session.messages ? req.session.messages[0] : null;
  delete req.session.messages;
  next();
});

// Routes
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);
app.use('/chat', require('./routes/chat'));

// Route guards
function requireLogin(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.messages = ['Please login first'];
  res.redirect('/login');
}

// Views
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/chat', requireLogin, (req, res) => res.render('chat', { user: req.user }));

app.get('/check-session', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, username: req.user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect('/login');
    });
  });
});

// Share session with Socket.IO
io.use(sharedSession(sessionMiddleware, { autoSave: true }));

// Map of connected user sockets
const userSockets = new Map();

// Socket.IO logic
io.on('connection', (socket) => {
  const req = socket.handshake;
  const userId = req.session.passport?.user;

  if (!userId) {
    console.log('🔒 Unauthorized socket - disconnecting');
    return socket.disconnect(true);
  }

  console.log(`User connected: ID=${userId}`);

  // Register socket
  if (!userSockets.has(userId)) userSockets.set(userId, []);
  userSockets.get(userId).push(socket.id);

  // Handle incoming message
  socket.on('send_message', async ({ toUserId, chatId, text }) => {
    try {
      if (!text || !chatId || !toUserId) return;

      // Save to DB
      await db.query(
        'INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)',
        [chatId, userId, text]
      );

      // Send to sender
      socket.emit('receive_message', {
        chatId,
        text,
        sender: 'you'
      });

      // Send to recipient if online
      const sockets = userSockets.get(toUserId);
      if (sockets) {
        sockets.forEach(socketId => {
          io.to(socketId).emit('receive_message', {
            chatId,
            text,
            sender: 'them'
          });
        });
      }

    } catch (err) {
      console.error('Error saving or emitting message:', err);
      socket.emit('errorMessage', { message: 'Message failed to send.' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const sockets = userSockets.get(userId) || [];
    userSockets.set(userId, sockets.filter(id => id !== socket.id));
    if (userSockets.get(userId).length === 0) userSockets.delete(userId);
    console.log(`Socket disconnected for user ${userId}`);
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server + Socket.IO running: http://localhost:${PORT}`);
});
