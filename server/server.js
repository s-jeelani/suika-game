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
const playerProfiles = new Map(); // Store player nicknames and profiles

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

    // Old joinGame handler removed - using new lobby system instead

  // Old game event handlers removed - using new lobby system instead

  // Handle real-time fruit movement (new system)
  socket.on('fruitMove', ({ roomId, playerNumber, x, y }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('opponentFruitMove', { playerNumber, x, y });
  });

  // Handle fruit drops (new system)
  socket.on('fruitDropped', ({ roomId, playerNumber, fruitIndex }) => {
    // Broadcast to other players in the room
    socket.to(roomId).emit('opponentFruitDropped', { playerNumber, fruitIndex });
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

  // Handle score updates
  socket.on('scoreUpdate', ({ roomId, playerNumber, score }) => {
    console.log(`📊 Score update: Player ${playerNumber} in room ${roomId} has score ${score}`);
    
    const room = gameRooms.get(roomId);
    if (room) {
      // Update the score in the room
      room.scores[playerNumber] = score;
      
      // Broadcast score update to all players in the room
      io.to(roomId).emit('scoreUpdate', {
        playerNumber: playerNumber,
        score: score,
        roomId: roomId
      });
      
      console.log(`✅ Score update broadcasted to room ${roomId}`);
    } else {
      console.log(`❌ Room ${roomId} not found for score update`);
    }
  });

  // Handle fruit movement updates
  socket.on('fruitMove', ({ roomId, playerNumber, x, y }) => {
    const room = gameRooms.get(roomId);
    if (room) {
      // Broadcast fruit movement to all other players in the room
      socket.to(roomId).emit('opponentFruitMove', {
        playerNumber: playerNumber,
        x: x,
        y: y,
        roomId: roomId
      });
    }
  });

  // Handle complete state requests
  socket.on('requestCompleteState', ({ roomId, requestedPlayerNumber }) => {
    console.log(`Player requesting complete state for player ${requestedPlayerNumber} in room ${roomId}`);
    const room = gameRooms.get(roomId);
    if (room) {
      // Forward the request to the specific player
      socket.to(roomId).emit('requestCompleteState', {
        requestedPlayerNumber: requestedPlayerNumber,
        roomId: roomId
      });
    }
  });

  // Handle sending complete state
  socket.on('sendCompleteState', ({ roomId, gameState }) => {
    console.log(`Player ${gameState.playerNumber} sending complete state in room ${roomId}`);
    const room = gameRooms.get(roomId);
    if (room) {
      // Broadcast the complete state to all other players
      socket.to(roomId).emit('opponentCompleteState', {
        gameState: gameState,
        roomId: roomId
      });
    }
  });

  // Handle player profile updates
  socket.on('updateProfile', ({ nickname, isReady }) => {
    console.log('Player profile update:', { socketId: socket.id, nickname, isReady });
    playerProfiles.set(socket.id, { nickname, isReady });
  });

  // Handle room creation
  socket.on('createRoom', ({ name, maxPlayers, hostNickname }) => {
    console.log('Creating room:', { name, maxPlayers, hostNickname });
    
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const room = {
      players: [socket.id],
      scores: {},
      gameState: 'waiting',
      randomSeed: null,
      playerStates: {},
      healthChecks: {},
      winner: null,
      maxPlayers: maxPlayers || 4,
      roomName: name,
      hostId: socket.id,
      createdAt: new Date().toISOString()
    };
    
    gameRooms.set(roomId, room);
    playerScores.set(socket.id, 0);
    playerProfiles.set(socket.id, { nickname: hostNickname, isReady: true });
    console.log(`DEBUG: Host "${hostNickname}" created room ${roomId}`);
    
    socket.join(roomId);
    
    const players = [{
      id: socket.id,
      number: 1,
      nickname: hostNickname,
      isHost: true,
      isReady: true
    }];
    
    socket.emit('roomCreated', {
      roomId,
      roomName: name,
      roomCode: roomId,
      maxPlayers,
      players
    });
    
    console.log(`Room created: ${roomId} by ${hostNickname}`);
    console.log('Total rooms after creation:', gameRooms.size);
    console.log('Available rooms:', Array.from(gameRooms.keys()));
  });

  // Handle room joining
  socket.on('joinRoom', ({ roomCode, nickname }) => {
    console.log('Player attempting to join room:', roomCode, 'with nickname:', nickname);
    
    if (!gameRooms.has(roomCode)) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    const room = gameRooms.get(roomCode);
    
    if (room.gameState === 'playing') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    // Check if player is already in the room
    if (room.players.includes(socket.id)) {
      const existingPlayerNumber = room.players.indexOf(socket.id) + 1;
      console.log('Player already in room as player', existingPlayerNumber);
      
      const players = room.players.map((playerId, index) => ({
        id: playerId,
        number: index + 1,
        nickname: playerProfiles.get(playerId)?.nickname || `Player ${index + 1}`,
        isHost: playerId === room.hostId,
        isReady: playerProfiles.get(playerId)?.isReady || false
      }));
      
      socket.emit('roomJoined', {
        roomId: roomCode,
        roomName: room.roomName,
        maxPlayers: room.maxPlayers,
        players
      });
      return;
    }
    
    // Add player to room
    room.players.push(socket.id);
    playerScores.set(socket.id, 0);
    
    // Check if nickname is already taken in this room
    const existingNicknames = room.players.map(id => playerProfiles.get(id)?.nickname).filter(Boolean);
    let uniqueNickname = nickname;
    let counter = 1;
    while (existingNicknames.includes(uniqueNickname)) {
      uniqueNickname = `${nickname}${counter}`;
      counter++;
    }
    
    playerProfiles.set(socket.id, { nickname: uniqueNickname, isReady: true });
    console.log(`DEBUG: Assigned unique nickname "${uniqueNickname}" to player ${socket.id} (original: "${nickname}")`);
    
    console.log(`DEBUG: Stored profile for ${socket.id}:`, playerProfiles.get(socket.id));
    console.log(`DEBUG: All profiles after adding ${nickname}:`, Array.from(playerProfiles.entries()));
    console.log(`DEBUG: Room ${roomCode} now has players:`, room.players.map(id => ({ id, nickname: playerProfiles.get(id)?.nickname })));
    
    const playerNumber = room.players.length;
    console.log(`DEBUG: Player ${socket.id} (${nickname}) added to room at index ${room.players.length - 1}, assigned player number ${playerNumber}`);
    console.log(`DEBUG: Room ${roomCode} players array:`, room.players);
    console.log(`Player ${nickname} joined as player ${playerNumber}. Room now has ${room.players.length} players.`);
    
    // Create players list
    const players = room.players.map((playerId, index) => {
      const profile = playerProfiles.get(playerId);
      console.log(`DEBUG: Getting profile for ${playerId}:`, profile);
      return {
        id: playerId,
        number: index + 1,
        nickname: profile?.nickname || `Player ${index + 1}`,
        isHost: playerId === room.hostId,
        isReady: profile?.isReady || false
      };
    });
    
    socket.join(roomCode);
    
    // Send joinedRoom to the new player
    socket.emit('roomJoined', {
      roomId: roomCode,
      roomName: room.roomName,
      maxPlayers: room.maxPlayers,
      players
    });
    
    // Notify other players
    socket.to(roomCode).emit('playerJoined', {
      playerNumber,
      players
    });
    
    console.log(`Room ${roomCode} now has ${room.players.length} players:`, players.map(p => p.nickname));
  });

  // Handle leaving room
  socket.on('leaveRoom', ({ roomId }) => {
    console.log('Player leaving room:', roomId);
    
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1) return;
    
    room.players.splice(playerIndex, 1);
    socket.leave(roomId);
    
    // Notify other players
    socket.to(roomId).emit('playerLeft', {
      playerNumber: playerIndex + 1,
      players: room.players.map((playerId, index) => ({
        id: playerId,
        number: index + 1,
        nickname: playerProfiles.get(playerId)?.nickname || `Player ${index + 1}`,
        isHost: playerId === room.hostId,
        isReady: playerProfiles.get(playerId)?.isReady || false
      }))
    });
    
    // If room is empty, delete it
    if (room.players.length === 0) {
      gameRooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      // If host left, assign new host
      if (room.hostId === socket.id) {
        room.hostId = room.players[0];
        socket.to(roomId).emit('newHost', { hostId: room.hostId });
      }
    }
    
    socket.emit('roomLeft');
  });

  // Handle game start
  socket.on('startGame', ({ roomId }) => {
    console.log('Starting game for room:', roomId);
    console.log('Available rooms:', Array.from(gameRooms.keys()));
    
    const room = gameRooms.get(roomId);
    if (!room) {
      console.log(`Room ${roomId} not found when starting game`);
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.hostId !== socket.id) {
      console.log(`Player ${socket.id} tried to start game but host is ${room.hostId}`);
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }
    
    room.gameState = 'playing';
    room.randomSeed = Math.floor(Math.random() * 1000000);
    
    const players = room.players.map((playerId, index) => ({
      id: playerId,
      number: index + 1,
      nickname: playerProfiles.get(playerId)?.nickname || `Player ${index + 1}`,
      isHost: playerId === room.hostId,
      isReady: true
    }));
    
    console.log(`Emitting gameStarting to room ${roomId} with ${players.length} players`);
    io.to(roomId).emit('gameStarting', {
      roomId,
      players,
      randomSeed: room.randomSeed
    });
  });

  // Handle joining game room (from lobby)
  socket.on('joinGameRoom', ({ roomId, nickname, playerId }) => {
    console.log('Player joining game room:', roomId, nickname, playerId);
    console.log('Available rooms:', Array.from(gameRooms.keys()));
    
    const room = gameRooms.get(roomId);
    if (!room) {
      console.log(`Room ${roomId} not found. Available rooms:`, Array.from(gameRooms.keys()));
      socket.emit('error', { message: 'Game room not found' });
      return;
    }
    
    // Try to find player by socket ID, then by playerId, then by nickname
    let playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1 && playerId) {
      playerIndex = room.players.indexOf(playerId);
      if (playerIndex !== -1) {
        // Update the player's socket ID to the new connection
        room.players[playerIndex] = socket.id;
        const oldProfile = playerProfiles.get(playerId);
        if (oldProfile) playerProfiles.set(socket.id, oldProfile);
        playerProfiles.delete(playerId);
        console.log(`DEBUG: Matched player by playerId. Updated player slot ${playerIndex} to socket ${socket.id}`);
      }
    }
    if (playerIndex === -1 && nickname) {
      // Try to find by nickname (legacy fallback)
      const playerProfilesArray = Array.from(playerProfiles.entries());
      const playerEntry = playerProfilesArray.find(([id, profile]) => profile.nickname === nickname);
      if (playerEntry) {
        const oldSocketId = playerEntry[0];
        playerIndex = room.players.indexOf(oldSocketId);
        if (playerIndex !== -1) {
          room.players[playerIndex] = socket.id;
          const oldProfile = playerProfiles.get(oldSocketId);
          if (oldProfile) playerProfiles.set(socket.id, oldProfile);
          playerProfiles.delete(oldSocketId);
          console.log(`DEBUG: Matched player by nickname. Updated player slot ${playerIndex} to socket ${socket.id}`);
        }
      }
    }
    // Only add as a new player if not found by any means
    if (playerIndex === -1) {
      console.log(`DEBUG: Player not found by socket ID, playerId, or nickname. Adding as new player.`);
      room.players.push(socket.id);
      playerScores.set(socket.id, 0);
      playerProfiles.set(socket.id, { nickname, isReady: true });
      playerIndex = room.players.length - 1;
    }
    // Always use the current socket’s ID to determine the player’s index in the room’s players array
    const playerNumber = room.players.indexOf(socket.id) + 1;
    
    console.log(`DEBUG: Player ${socket.id} (${nickname}) assigned player number ${playerNumber} (index in array: ${room.players.indexOf(socket.id)})`);
    console.log(`DEBUG: Creating players list for game join. Room players:`, room.players);
    console.log(`DEBUG: All player profiles:`, Array.from(playerProfiles.entries()));
    
    const players = room.players.map((playerId, index) => {
      const profile = playerProfiles.get(playerId);
      return {
        id: playerId,
        number: index + 1,
        nickname: profile?.nickname || `Player ${index + 1}`,
        isHost: playerId === room.hostId,
        isReady: true
      };
    });
    
    console.log(`DEBUG: Final players list:`, players);
    console.log(`DEBUG: Sending gameJoined to player ${socket.id} with player number ${playerNumber}`);
    
    socket.emit('gameJoined', {
      roomId,
      playerNumber,
      players,
      maxPlayers: room.maxPlayers,
      randomSeed: room.randomSeed
    });
  });

  // Handle getting available rooms
  socket.on('getRooms', () => {
    const availableRooms = Array.from(gameRooms.entries())
      .filter(([roomId, room]) => room.gameState === 'waiting' && room.players.length < room.maxPlayers)
      .map(([roomId, room]) => ({
        code: roomId,
        name: room.roomName,
        hostNickname: playerProfiles.get(room.hostId)?.nickname || 'Unknown',
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers
      }));
    
    socket.emit('roomsList', { rooms: availableRooms });
  });

  // Removed game over handler - games continue indefinitely

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if this is a transition to game (room is in 'playing' state)
    let isGameTransition = false;
    for (const [roomId, room] of gameRooms.entries()) {
      if (room.players.includes(socket.id) && room.gameState === 'playing') {
        isGameTransition = true;
        console.log(`Player ${socket.id} disconnecting during game transition for room ${roomId}`);
        break;
      }
    }
    
    // Only remove player if it's not a game transition
    if (!isGameTransition) {
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
    }
    
    playerScores.delete(socket.id);
    console.log('Cleanup completed for:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 