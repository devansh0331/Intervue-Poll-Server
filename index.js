const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io'
});

app.use(cors());
app.use(express.json());

// Store connected students and active polls
const connectedStudents = new Map();
const activePolls = new Map();
const pollResults = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Teacher connects
  socket.on('teacher-join', () => {
    socket.join('teachers');
    console.log('Teacher joined:', socket.id);
    
    // Send current list of students to the teacher
    io.to('teachers').emit('students-updated', Array.from(connectedStudents.values()));
  });

  // Student connects
  socket.on('student-join', (data) => {
    const { name } = data;
    const studentData = {
      id: socket.id,
      name: name,
      joinedAt: new Date()
    };
    
    // Store student
    connectedStudents.set(socket.id, studentData);
    socket.join('students');
    
    console.log('Student joined:', name, socket.id);
    
    // Notify all teachers about the new student
    io.to('teachers').emit('student-joined', studentData);
    io.to('teachers').emit('students-updated', Array.from(connectedStudents.values()));
    
    // Send current active poll to student if exists
    if (activePolls.size > 0) {
      const latestPoll = Array.from(activePolls.values()).pop();
      socket.emit('new-poll', latestPoll);
    }
  });

  // Teacher creates a poll
  socket.on('create-poll', (pollData) => {
    const poll = {
      id: Date.now().toString(),
      ...pollData,
      createdAt: new Date(),
      startTime: new Date().toISOString(), // Add server start time
      active: true
    };
    
    activePolls.set(poll.id, poll);
    pollResults.set(poll.id, {});
    
    console.log('Poll created:', poll.question);
    
    // Send to all students and teachers
    io.emit('new-poll', poll);
    
    // Set timeout to end poll automatically
    if (poll.duration > 0) {
      setTimeout(() => {
        if (activePolls.has(poll.id)) {
          endPoll(poll.id);
        }
      }, poll.duration * 1000);
    }
  });

  // Student submits answer
  socket.on('submit-answer', (data) => {
    const { pollId, answer, studentName } = data;
    const poll = activePolls.get(pollId);
    
    if (poll && poll.active) {
      const results = pollResults.get(pollId);
      results[socket.id] = {
        studentName,
        answer,
        timestamp: new Date()
      };
      
      pollResults.set(pollId, results);
      
      // Notify teachers about the answer
      io.to('teachers').emit('student-answer', {
        pollId,
        studentId: socket.id,
        studentName,
        answer
      });
      
      // Update results for teachers
      io.to('teachers').emit('poll-results', {
        pollId,
        results: pollResults.get(pollId)
      });
    }
  });

  // Teacher ends poll manually
  socket.on('end-poll', (pollId) => {
    endPoll(pollId);
  });

  // Teacher removes student
  socket.on('remove-student', (studentId) => {
    if (connectedStudents.has(studentId)) {
      const student = connectedStudents.get(studentId);
      connectedStudents.delete(studentId);
      
      // Notify student they've been removed
      io.to(studentId).emit('student-removed');
      
      // Notify teachers
      io.to('teachers').emit('student-left', studentId);
      io.to('teachers').emit('students-updated', Array.from(connectedStudents.values()));
      
      console.log('Student removed:', studentId);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (connectedStudents.has(socket.id)) {
      const student = connectedStudents.get(socket.id);
      connectedStudents.delete(socket.id);
      
      // Notify teachers about student disconnection
      io.to('teachers').emit('student-left', socket.id);
      io.to('teachers').emit('students-updated', Array.from(connectedStudents.values()));
      
      console.log('Student disconnected:', student.name);
    }
  });

  // Helper function to end poll
  function endPoll(pollId) {
    if (activePolls.has(pollId)) {
      const poll = activePolls.get(pollId);
      poll.active = false;
      activePolls.set(pollId, poll);
      
      const results = pollResults.get(pollId);
      
      // Send final results with poll data
      io.emit('poll-ended', {
        pollId,
        results,
        poll // Include the full poll object
      });
      
      console.log('Poll ended:', poll.question);
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});