const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to protect routes
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  res.redirect('/login');
}

// Chat Page
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const requests = await db.query(
      `SELECT cr.id, u.username AS sender_username, u.fullname AS sender_full_name, u.avatar AS sender_avatar
       FROM chat_requests cr
       JOIN users u ON cr.from_user = u.id
       WHERE cr.to_user = ? AND cr.status = 'pending'`,
      [req.user.id]
    );

    res.render('chat', {
      user: req.user,
      pendingRequests: requests.map(r => ({
        request_id: r.id,
        username: r.sender_username,
        full_name: r.sender_full_name,
        avatar: r.sender_avatar || './stufs/default-avatar.png'
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Fetch Chat Messages
router.get('/messages/:chatId', ensureAuthenticated, async (req, res) => {
  const chatId = req.params.chatId;
  const userId = req.user.id;

  try {
    const messages = await db.query(
      `SELECT sender_id, text, created_at FROM messages 
       WHERE chat_id = ? 
       ORDER BY created_at ASC`,
      [chatId]
    );

    const formatted = messages.map(msg => ({
      text: msg.text,
      sender: msg.sender_id === userId ? 'you' : 'them',
      time: msg.created_at
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get Contact List
router.get('/contacts', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  try {
    const chats = await db.query(
      `SELECT c.id AS chat_id, 
              u.id AS user_id, u.username, u.fullname, u.avatar, 
              m.text AS last_message, m.created_at AS last_message_time
       FROM chats c
       JOIN users u ON u.id = (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END)
       LEFT JOIN messages m ON m.id = (
         SELECT id FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
       )
       WHERE c.user1_id = ? OR c.user2_id = ?
       ORDER BY COALESCE(m.created_at, c.id) DESC`,
      [userId, userId, userId]
    );

    const contacts = chats.map(chat => ({
      id: chat.user_id,
      chatId: chat.chat_id,
      username: chat.username,
      fullname: chat.fullname,
      avatar: chat.avatar || `https://i.pravatar.cc/50?u=${chat.username}`,
      lastMessage: chat.last_message || '',
      lastMessageTime: chat.last_message_time || null
    }));

    res.json(contacts);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Send Chat Request
router.post('/request/send', ensureAuthenticated, async (req, res) => {
  try {
    const targetUsername = req.body.targetUsername?.trim();
    const senderId = req.user.id;

    if (!targetUsername) {
      return res.status(400).json({ success: false, message: 'No username provided.' });
    }

    const [targetUser] = await db.query(
      'SELECT id FROM users WHERE username = ?',
      [targetUsername]
    );

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const targetId = targetUser.id;

    const existing = await db.query(
      'SELECT * FROM chat_requests WHERE from_user = ? AND to_user = ? AND status = "pending"',
      [senderId, targetId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Request already sent.' });
    }

    await db.query(
      'INSERT INTO chat_requests (from_user, to_user) VALUES (?, ?)',
      [senderId, targetId]
    );

    res.status(200).json({ success: true, message: `Request sent to ${targetUsername}` });

  } catch (err) {
    console.error("Send Request Error:", err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Get Incoming Requests
router.get('/request/incoming', ensureAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const requests = await db.query(
      `SELECT cr.id, u.username, u.fullname, u.avatar
       FROM chat_requests cr
       JOIN users u ON cr.from_user = u.id
       WHERE cr.to_user = ? AND cr.status = 'pending'`,
      [currentUserId]
    );

    res.json({ success: true, requests: requests.map(r => ({
      id: r.id,
      username: r.username,
      fullname: r.fullname,
      profile_pic: r.avatar || './stufs/default-avatar.png'
    })) });

  } catch (err) {
    console.error("Error fetching incoming requests:", err);
    res.status(500).json({ success: false, message: "Failed to fetch requests." });
  }
});

// Respond to Chat Request
router.post('/request/respond', ensureAuthenticated, async (req, res) => {
  const toUser = req.user.id;
  const { requestId, action } = req.body;

  try {
    const [request] = await db.query(
      'SELECT * FROM chat_requests WHERE id = ? AND to_user = ? AND status = "pending"',
      [Number(requestId), toUser]
    );

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const fromUser = request.from_user;

    if (action === 'accept') {
      await db.query('UPDATE chat_requests SET status = "accepted" WHERE id = ?', [requestId]);

      const existingChat = await db.query(
        `SELECT id FROM chats 
         WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
        [fromUser, toUser, toUser, fromUser]
      );

      if (existingChat.length === 0) {
        await db.query('INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)', [fromUser, toUser]);
        console.log('New chat inserted');
      }

      return res.json({ success: true, message: 'Request accepted' });
    }

    if (action === 'reject') {
      await db.query('UPDATE chat_requests SET status = "rejected" WHERE id = ?', [requestId]);
      return res.json({ success: true, message: 'Request rejected' });
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });

  } catch (err) {
    console.error('Respond Request Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

//  [Optional] Notification Dot API – if needed for future
// router.get('/requests/unread', ensureAuthenticated, async (req, res) => {
//   try {
//     const [[{ count }]] = await db.query(
//       'SELECT COUNT(*) AS count FROM chat_requests WHERE to_user = ? AND status = "pending"',
//       [req.user.id]
//     );
//     res.json({ success: true, count });
//   } catch (err) {
//     console.error('Notification Dot Error:', err);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

module.exports = router;
