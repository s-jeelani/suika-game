import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:4173", "https://*.vercel.app", "*"],
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true
});

app.use(cors());
app.use(express.json());

// Game state
const gameRooms = new Map();
const playerScores = new Map();

// Serve static files
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Suika Game Server is running!');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'from:', socket.handshake.headers.origin);

  socket.on('joinGame', (roomId) => {
    socket.join(roomId);
    
    if (!gameRooms.has(roomId)) {
              gameRooms.set(roomId, {
          players: [],
          scores: { player1Score: 0, player2Score: 0 },
          gameState: 'waiting'
        });
    }
    
    const room = gameRooms.get(roomId);
    if (room.players.length < 2) {
      room.players.push(socket.id);
      playerScores.set(socket.id, 0);
      
      if (room.players.length === 2) {
        room.gameState = 'playing';
        io.to(roomId).emit('gameStart', {
          player1: room.players[0],
          player2: room.players[1]
        });
      }
    }
    
    socket.emit('joinedRoom', {
      roomId,
      playerId: socket.id,
      playerNumber: room.players.indexOf(socket.id) + 1
    });
  });

  socket.on('updateScore', ({ roomId, player1Score, player2Score }) => {
    const room = gameRooms.get(roomId);
    if (room) {
      room.scores.player1Score = player1Score || room.scores.player1Score;
      room.scores.player2Score = player2Score || room.scores.player2Score;
      
      io.to(roomId).emit('scoreUpdate', room.scores);
    }
  });

  // Handle real-time fruit movement
  socket.on('fruitMove', ({ roomId, playerNumber, x, y }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('opponentFruitMove', { playerNumber, x, y });
  });

  // Handle fruit drops
  socket.on('fruitDropped', ({ roomId, playerNumber, fruitIndex }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('opponentFruitDropped', { playerNumber, fruitIndex });
  });

  // Handle individual player fruit initialization
  socket.on('initializeMyFruit', ({ roomId, playerNumber, fruitIndex }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('opponentInitialFruit', { playerNumber, fruitIndex });
  });

  // Handle new fruit generation
  socket.on('generateNewFruit', ({ roomId, playerNumber, fruitIndex }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('newFruit', { playerNumber, fruitIndex });
  });

  // Removed game over handler - games continue indefinitely

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from all rooms
    for (const [roomId, room] of gameRooms.entries()) {
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          gameRooms.delete(roomId);
        } else {
          io.to(roomId).emit('playerLeft', socket.id);
        }
        break;
      }
    }
    
    playerScores.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 