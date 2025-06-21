

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
        avatar: r.sender_avatar
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


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

    // Format messages to identify sender
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


// Get user contacts
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
      ORDER BY COALESCE(m.created_at, c.id) DESC`
    , [userId, userId, userId]);

    const contacts = chats.map(chat => ({
      id: chat.user_id,
      chatId: chat.chat_id,
      username: chat.username,
      fullname: chat.fullname,
      avatar: chat.avatar || `https://i.pravatar.cc/50?u=${chat.username}`,
      lastMessage: chat.last_message || "",
      lastMessageTime: chat.last_message_time || null,
      messages: []
    }));

    res.json(contacts);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});


// Send message
router.post('/send/:toUserId', ensureAuthenticated, async (req, res) => {
  const fromUserId = req.user.id;
  const toUserId = parseInt(req.params.toUserId, 10);
  const { text } = req.body;

  if (!text || isNaN(toUserId)) {
    return res.status(400).json({ success: false, message: 'Invalid input' });
  }

  try {
    const [chatRows] = await db.query(
      `SELECT * FROM chats 
       WHERE (user1_id = ? AND user2_id = ?) 
          OR (user1_id = ? AND user2_id = ?)`,
      [fromUserId, toUserId, toUserId, fromUserId]
    );

    let chatId;
    if (chatRows.length > 0) {
      chatId = chatRows[0].id;
    } else {
      const [insertResult] = await db.query(
        'INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)',
        [fromUserId, toUserId]
      );
      chatId = insertResult.insertId;
    }

    await db.query(
      'INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)',
      [chatId, fromUserId, text]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 🔹 1. Send Chat Request
router.post('/request/send', async (req, res) => {
  try {
    const targetUsername = req.body.targetUsername?.trim();
    console.log("Incoming targetUsername:", targetUsername);

    if (!targetUsername) {
      return res.status(400).json({ success: false, message: 'No username provided.' });
    }

    const rows = await db.query(
      'SELECT id FROM users WHERE username = ?',
      [targetUsername]
    );

    console.log("Query result rows:", rows);

    // Determine if rows is an array or an object
    let targetUser;
    if (Array.isArray(rows)) {
      targetUser = rows[0];
    } else if (rows && typeof rows === 'object') {
      targetUser = rows;
    } else {
      targetUser = null;
    }

    if (!targetUser || !targetUser.id) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const targetId = targetUser.id;
    const senderId = req.user.id;
    console.log("Target user ID:", targetId);

    // Check if request already exists
    const existing = await db.query(
      'SELECT * FROM chat_requests WHERE from_user = ? AND to_user = ? AND status = "pending"',
      [senderId, targetId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Request already sent.' });
    }

    // Insert new request
    await db.query(
      'INSERT INTO chat_requests (from_user, to_user) VALUES (?, ?)',
      [senderId, targetId]
    );



    // Proceed with your logic, e.g., sending a chat request
    res.status(200).json({ success: true, message: Request `sent to ${targetUsername}` });

  } catch (err) {
    console.error("Send Request Error:", err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});



// 🔹 2. Get Incoming Requests
router.get('/request/incoming', async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const requests = await db.query(
      `SELECT cr.id, u.username, u.fullname, u.avatar
      FROM chat_requests cr
      JOIN users u ON cr.from_user = u.id
      WHERE cr.to_user = ? AND cr.status = 'pending'`
    , [currentUserId]);

    res.json({ success: true, requests });
  } catch (err) {
    console.error("Error fetching incoming requests:", err);
    res.status(500).json({ success: false, message: "Failed to fetch requests." });
  }
});


// 🔹 3. Accept/Reject Request
router.post('/request/respond', ensureAuthenticated, async (req, res) => {
  const toUser = req.user.id;
  const { requestId, action } = req.body;

  console.log("Logged-in User ID (toUser):", toUser);
  console.log('Incoming response:', req.body);
  console.log('Request ID:', requestId);

  try {
    const rows = await db.query(
      'SELECT * FROM chat_requests WHERE id = ? AND to_user = ? AND status = "pending"',
      [Number(requestId), toUser]
    );
    console.log("Fetched rows:", rows)

    const request = rows[0];
    console.log(request);

    // Check if request exists
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const fromUser = request.from_user;

    if (action === 'accept') {
      await db.query('UPDATE chat_requests SET status = "accepted" WHERE id = ?', [requestId]);
      await db.query('INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)', [fromUser, toUser]);
      return res.json({ success: true, message: 'Request accepted' });
    } else if (action === 'reject') {
      await db.query('UPDATE chat_requests SET status = "rejected" WHERE id = ?', [requestId]);
      return res.json({ success: true, message: 'Request rejected' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (err) {
    console.error('Respond Request Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 🔹 4. Notification Dot for Pending Requests
// router.get('/requests/unread', ensureAuthenticated, async (req, res) => {
//   const userId = req.user.id;

//   try {
//     const [[result]] = await db.query(
//       SELECT COUNT(*) AS count 
//        FROM chat_requests 
//        WHERE to_user = ? AND status = 'pending',
//       [userId]
//     );

//     res.json({ success: true, count: result.count });
//   } catch (err) {
//     console.error('Notification Dot Error:', err);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

module.exports = router;





// ritypriya1
// sourav1
