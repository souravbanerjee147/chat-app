const socket = io();

// Join room
socket.emit('joinRoom', 'general');

// Send message
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const msg = document.querySelector('#msg').value;
  socket.emit('chatMessage', { room: 'general', message: msg });
  document.querySelector('#msg').value = '';
});

// Receive message
socket.on('message', msg => {
  const msgBox = document.createElement('div');
  msgBox.textContent = msg;
  document.querySelector('#messages').append(msgBox);
});
