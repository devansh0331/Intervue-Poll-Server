const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Basic CORS setup
app.use(cors());

// Simple health check endpoint
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Socket.IO setup with basic config
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling']
});

// Store connected clients
const students = new Map();
let currentPoll = null;

// Socket event handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('student-join', (name) => {
    students.set(socket.id, { id: socket.id, name });
    io.emit('students-updated', Array.from(students.values()));
  });

  socket.on('teacher-join', () => {
    socket.join('teachers');
  });

  socket.on('create-poll', (pollData) => {
    currentPoll = { ...pollData, id: Date.now(), startTime: Date.now() };
    io.emit('new-poll', currentPoll);
  });

  socket.on('submit-answer', (data) => {
    io.to('teachers').emit('student-answer', {
      studentId: socket.id,
      studentName: students.get(socket.id)?.name,
      answer: data.answer
    });
  });

  socket.on('end-poll', () => {
    if (currentPoll) {
      io.emit('poll-ended', { pollId: currentPoll.id });
      currentPoll = null;
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (students.has(socket.id)) {
      students.delete(socket.id);
      io.emit('students-updated', Array.from(students.values()));
    }
  });
});

// Error handling
server.on('error', (err) => {
  console.error('Server error:', err);
});

io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', err);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});