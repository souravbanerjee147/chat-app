module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🟢 New user connected:', socket.id);

    // Join a chat room
    socket.on('joinRoom', (room) => {
      socket.join(room);
      console.log(`🔵 Socket ${socket.id} joined room: ${room}`);

      // Notify others in the room
      socket.to(room).emit('message', 'A new user has joined the chat');
    });

    // Handle message sent by user
    socket.on('chatMessage', ({ room, message }) => {
      console.log(`💬 Message in room ${room}: ${message}`);
      io.to(room).emit('message', message); // broadcast to all in room
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔴 User disconnected:', socket.id);
    });
  });
};
