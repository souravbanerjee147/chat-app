const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

// Import auth routes to initialize Passport strategies
require('./routes/auth'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware: Parse form and JSON data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup for Passport
const sessionMiddleware = session({
  secret: 'your_super_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hours
});
app.use(sessionMiddleware);

// Initialize Passport and use session
app.use(passport.initialize());
app.use(passport.session());

// Passport LocalStrategy for login (identifier = username or email or phone)
passport.use(new LocalStrategy(
  { usernameField: 'identifier' },
  async (identifier, password, done) => {
    try {
      const results = await db.query(
        'SELECT * FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1',
        [identifier, identifier, identifier]
      );
      if (results.length === 0) {
        return done(null, false, { message: 'Invalid username, email, or phone number' });
      }
      const user = results[0];

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return done(null, false, { message: 'Invalid password' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Serialize user to session (store user id)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session by user id
passport.deserializeUser(async (id, done) => {
  try {
    const results = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (results.length === 0) return done(null, false);
    done(null, results[0]);
  } catch (err) {
    done(err);
  }
});

// Prevent caching middleware
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// EJS setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware: Pass user and flash messages to all templates
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.error = req.session.messages ? req.session.messages[0] : null;
  delete req.session.messages;
  next();
});

// Protect routes middleware
function requireLogin(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.messages = ['Please login first'];
  res.redirect('/login');
}

// Routes
const authRoutes = require('./routes/auth');
// const chatRoutes = require('./routes/chat');

app.use('/', authRoutes);
app.use('/chat',  require('./routes/chat'));

// Redirect root to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Login page
app.get('/login', (req, res) => {
  res.render('login');
});

// Chat page UI (protected)
app.get('/chat', requireLogin, (req, res) => {
  res.render('chat', { user: req.user });
});

// Optional: For client-side session check
app.get('/check-session', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, username: req.user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect('/login');
    });
  });
});

// --- SOCKET.IO SETUP ---

// Share session middleware with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Map userId to their socket IDs for targeted messaging
const userSockets = new Map();

io.on('connection', (socket) => {
  const req = socket.request;
  if (!req.session || !req.session.passport || !req.session.passport.user) {
    // Not logged in - disconnect socket
    return socket.disconnect(true);
  }

  const userId = req.session.passport.user;
  console.log(`User connected via Socket.IO: userId=${userId}`);

  // Add this socket to user's socket list
  if (!userSockets.has(userId)) {
    userSockets.set(userId, []);
  }
  userSockets.get(userId).push(socket.id);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id} for user ${userId}`);
    const sockets = userSockets.get(userId) || [];
    userSockets.set(userId, sockets.filter(id => id !== socket.id));
    if (userSockets.get(userId).length === 0) {
      userSockets.delete(userId);
    }
  });

  // Handle sending a chat message to another user
  // Payload: { toUserId, text }
  socket.on('sendMessage', async ({ toUserId, text }) => {
    if (!toUserId || !text) return;

    // Save message to DB - you should implement this in chatRoutes or a helper
    try {
      // Insert message in DB (pseudo-code, adapt as per your schema)
      await db.query(
        'INSERT INTO messages (from_user_id, to_user_id, message_text, created_at) VALUES (?, ?, ?, NOW())',
        [userId, toUserId, text]
      );

      // Emit message to sender (confirmation)
      socket.emit('messageSent', { toUserId, text });

      // Emit message to receiver if connected
      if (userSockets.has(toUserId)) {
        userSockets.get(toUserId).forEach(socketId => {
          io.to(socketId).emit('newMessage', {
            fromUserId: userId,
            text
          });
        });
      }
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('errorMessage', { message: 'Failed to send message' });
    }
  });

  // Handle chat request events and approval/rejection if you want realtime updates
  socket.on('chatRequestSent', ({ toUsername }) => {
    // You can look up userId by username from DB, then notify if online
    // For demo, we just log
    console.log(`Chat request sent by user ${userId} to ${toUsername}`);

    // Optionally emit to the target user socket here
  });

  // You can add more events: chatRequestAccepted, chatRequestRejected, etc.
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server + Socket.IO running at http://localhost:${PORT}`);
});
