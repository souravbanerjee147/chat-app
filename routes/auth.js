

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const passport = require('passport');

// POST /login handled by passport.authenticate middleware
router.post('/login',
  passport.authenticate('local', {
    successRedirect: '/chat',
    failureRedirect: '/login',
    failureMessage: true // stores error message in req.session.messages
  })
);

// POST /signup - manual signup, then auto-login
router.post('/signup', async (req, res, next) => {
  const { username, email, fullname, phone, password, confirmPassword } = req.body;

  if (!username || !email || !fullname || !phone || !password || !confirmPassword) {
    req.session.messages = ['All fields are required'];
    return res.redirect('/login');
  }

  if (password !== confirmPassword) {
    req.session.messages = ['Confirmation password does not match'];
    return res.redirect('/login');
  }

  try {
    // Check if username or email already exists
    const existingUsers = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );

    if (existingUsers.length > 0) {
      req.session.messages = ['User already exists'];
      return res.redirect('/login');
    }

    // Hash password and insert new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, fullname, password, phone) VALUES (?, ?, ?, ?, ?)',
      [username, email, fullname, hashedPassword, phone]
    );

    // Auto-login after signup
    const user = {
      id: result.insertId,
      username,
      email,
      fullname,
      phone,
    };

    req.login(user, (err) => {
      if (err) return next(err);
      return res.redirect('/chat');
    });
  } catch (error) {
    console.error('Signup error:', error);
    req.session.messages = ['Server error'];
    res.redirect('/login');
  }
});

module.exports = router;
