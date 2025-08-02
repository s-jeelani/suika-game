import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for now
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
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

// Debug endpoint to check rooms
app.get('/rooms', (req, res) => {
  const rooms = Array.from(gameRooms.entries()).map(([roomId, room]) => ({
    roomId,
    playerCount: room.players.length,
    players: room.players,
    gameState: room.gameState
  }));
  res.json({ rooms, totalRooms: rooms.length });
});

// Clear all rooms (for testing)
app.post('/clear-rooms', (req, res) => {
  gameRooms.clear();
  playerScores.clear();
  res.json({ message: 'All rooms cleared' });
});

// Add connection debugging
io.engine.on('connection_error', (err) => {
  console.log('Connection error:', err.req.url, err.code, err.message, err.context);
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'from:', socket.handshake.headers.origin);
  console.log('Connection details:', {
    transport: socket.conn.transport.name,
    address: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent']
  });
  
  // Log current game rooms state
  console.log('Current game rooms:', Array.from(gameRooms.entries()).map(([roomId, room]) => ({
    roomId,
    playerCount: room.players.length,
    players: room.players
  })));

    socket.on('joinGame', (roomId) => {
    console.log('Player attempting to join room:', roomId, 'with socket ID:', socket.id);
    socket.join(roomId);
    
    if (!gameRooms.has(roomId)) {
      gameRooms.set(roomId, {
        players: [],
        scores: { player1Score: 0, player2Score: 0 },
        gameState: 'waiting'
      });
      console.log('Created new room:', roomId);
    }
    
    const room = gameRooms.get(roomId);
    console.log('Room state before join:', {
      roomId,
      currentPlayers: room.players,
      playerCount: room.players.length
    });
    
    // Check if player is already in the room
    if (room.players.includes(socket.id)) {
      const existingPlayerNumber = room.players.indexOf(socket.id) + 1;
      console.log('Player already in room as player', existingPlayerNumber);
      socket.emit('joinedRoom', {
        roomId,
        playerId: socket.id,
        playerNumber: existingPlayerNumber
      });
      return;
    }
    
    // Add player to room if there's space
    if (room.players.length < 2) {
      room.players.push(socket.id);
      playerScores.set(socket.id, 0);
      
      const playerNumber = room.players.length; // 1 or 2
      console.log(`Player ${socket.id} joined as player ${playerNumber}. Room now has ${room.players.length} players.`);
      
      // Send joinedRoom to the new player
      socket.emit('joinedRoom', {
        roomId,
        playerId: socket.id,
        playerNumber: playerNumber
      });
      
      // Start game only when exactly 2 players
      if (room.players.length === 2) {
        room.gameState = 'playing';
        console.log('Starting game with 2 players');
        io.to(roomId).emit('gameStart', {
          player1: room.players[0],
          player2: room.players[1]
        });
      } else {
        // Notify waiting for more players
        socket.emit('waitingForPlayers', {
          currentPlayers: room.players.length,
          requiredPlayers: 2
        });
      }
    } else {
      // Room is full
      socket.emit('roomFull', { roomId });
    }
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
        console.log(`Removing player ${socket.id} from room ${roomId} (was player ${playerIndex + 1})`);
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          console.log(`Deleting empty room ${roomId}`);
          gameRooms.delete(roomId);
        } else {
          console.log(`Room ${roomId} now has ${room.players.length} players`);
          io.to(roomId).emit('playerLeft', {
            leftPlayerId: socket.id,
            remainingPlayers: room.players.length
          });
          room.gameState = 'waiting';
        }
        break;
      }
    }
    
    playerScores.delete(socket.id);
    console.log('Cleanup completed for:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 