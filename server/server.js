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
    gameState: room.gameState,
    randomSeed: room.randomSeed,
    scores: room.scores,
    createdAt: room.createdAt,
    hasPlayerStates: Object.keys(room.playerStates || {}).length,
    lastHealthChecks: room.healthChecks ? Object.keys(room.healthChecks).map(player => ({
      player,
      lastCheck: new Date(room.healthChecks[player].timestamp).toISOString()
    })) : [],
    winner: room.winner ? {
      playerNumber: room.winner.playerNumber,
      score: room.winner.score,
      num_suika: room.winner.num_suika,
      wonAt: room.winner.wonAt
    } : null
  }));
  res.json({ rooms, totalRooms: rooms.length });
});

// Clear all rooms (for testing)
app.post('/clear-rooms', (req, res) => {
  gameRooms.clear();
  playerScores.clear();
  res.json({ message: 'All rooms cleared' });
});

// Debug endpoint for sync states
app.get('/sync-debug/:roomId?', (req, res) => {
  const { roomId } = req.params;
  
  if (roomId) {
    // Get specific room sync info
    const room = gameRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
      roomId,
      gameState: room.gameState,
      randomSeed: room.randomSeed,
      playerStates: room.playerStates || {},
      healthChecks: room.healthChecks || {},
      players: room.players,
      scores: room.scores
    });
  } else {
    // Get all sync info
    const syncInfo = Array.from(gameRooms.entries()).map(([roomId, room]) => ({
      roomId,
      gameState: room.gameState,
      randomSeed: room.randomSeed,
      playerStateCount: Object.keys(room.playerStates || {}).length,
      healthCheckCount: Object.keys(room.healthChecks || {}).length,
      lastSyncStates: room.playerStates ? Object.keys(room.playerStates).map(player => ({
        player,
        placementCount: room.playerStates[player].placementCount,
        bodyCount: room.playerStates[player].bodies?.length || 0,
        score: room.playerStates[player].score,
        receivedAt: room.playerStates[player].receivedAt
      })) : []
    }));
    
    res.json({ syncInfo, totalRooms: syncInfo.length });
  }
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
        gameState: 'waiting',
        randomSeed: null,
        playerStates: {},
        healthChecks: {},
        winner: null,
        createdAt: new Date().toISOString()
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
        room.winner = null; // Reset winner for new game
        
        // Generate a shared random seed for synchronized randomness
        const randomSeed = Math.floor(Math.random() * 1000000);
        room.randomSeed = randomSeed;
        
        console.log('Starting game with 2 players, random seed:', randomSeed);
        io.to(roomId).emit('gameStart', {
          player1: room.players[0],
          player2: room.players[1],
          randomSeed: randomSeed
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

  // Handle complete game state synchronization (every 5 placements)
  socket.on('completeGameState', ({ roomId, gameState }) => {
    console.log(`📦 Received complete game state from player ${gameState.playerNumber} in room ${roomId}`);
    console.log(`State contains ${gameState.bodies.length} bodies, score: ${gameState.score}, placements: ${gameState.placementCount}`);
    
    const room = gameRooms.get(roomId);
    if (room && room.gameState === 'playing') {
      // Store the state in the room for potential debugging
      if (!room.playerStates) {
        room.playerStates = {};
      }
      room.playerStates[`player${gameState.playerNumber}`] = {
        ...gameState,
        receivedAt: new Date().toISOString()
      };
      
      // Forward the complete state to the opponent
      socket.to(roomId).emit('opponentCompleteState', { 
        gameState: gameState,
        timestamp: Date.now()
      });
      
      console.log(`✅ Forwarded complete state for player ${gameState.playerNumber} to opponent`);
    } else {
      console.log(`❌ Room ${roomId} not found or game not in playing state`);
    }
  });

  // Handle sync health checks
  socket.on('syncHealthCheck', ({ roomId, playerNumber, timestamp }) => {
    const room = gameRooms.get(roomId);
    if (room) {
      console.log(`💓 Health check from player ${playerNumber} in room ${roomId} at ${new Date(timestamp).toISOString()}`);
      
      // Optional: Store health check info for monitoring
      if (!room.healthChecks) {
        room.healthChecks = {};
      }
      room.healthChecks[`player${playerNumber}`] = {
        timestamp: timestamp,
        socketId: socket.id,
        receivedAt: Date.now()
      };
    }
  });

  // Handle legacy sync state (for compatibility)
  socket.on('syncState', ({ roomId, gameStates }) => {
    console.log(`🔄 Legacy sync state received from room ${roomId}`);
    // Could be used for additional monitoring or fallback sync
  });

  // Handle player win events (watermelon created)
  socket.on('playerWon', ({ roomId, playerNumber, score, num_suika }) => {
    console.log(`🏆 Player ${playerNumber} won the game in room ${roomId}!`);
    console.log(`Final score: ${score}, Watermelons: ${num_suika}`);
    
    const room = gameRooms.get(roomId);
    if (room) {
      // Mark game as finished
      room.gameState = 'finished';
      room.winner = {
        playerNumber: playerNumber,
        score: score,
        num_suika: num_suika,
        wonAt: new Date().toISOString()
      };
      
      // Broadcast win event to all players in the room
      io.to(roomId).emit('gameWon', {
        winnerPlayerNumber: playerNumber,
        winnerScore: score,
        num_suika: num_suika,
        roomId: roomId
      });
      
      console.log(`✅ Game win broadcasted to room ${roomId}`);
    } else {
      console.log(`❌ Room ${roomId} not found for win event`);
    }
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