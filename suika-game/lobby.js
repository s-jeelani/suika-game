import { SERVER_URL } from './config.js';

// Socket.IO connection
console.log('Connecting to server:', SERVER_URL);
const socket = io(SERVER_URL, {
  timeout: 10000,
  transports: ['websocket', 'polling'],
  forceNew: true
});

// Lobby state
let currentPlayer = {
  nickname: '',
  isReady: false,
  isHost: false
};

let currentRoom = {
  id: null,
  name: '',
  maxPlayers: 4,
  players: [],
  isInRoom: false
};

// DOM elements
let connectionStatus = null;
let statusDot = null;
let statusText = null;
let nicknameInput = null;
let updateProfileBtn = null;
let roomNameInput = null;
let maxPlayersSelect = null;
let createRoomBtn = null;
let roomCodeInput = null;
let joinRoomBtn = null;
let currentRoomSection = null;
let roomNameDisplay = null;
let roomCodeDisplay = null;
let playerCount = null;
let maxPlayersDisplay = null;
let leaveRoomBtn = null;
let startGameBtn = null;
let playersContainer = null;
let roomsContainer = null;
let refreshRoomsBtn = null;
let gameLaunchSection = null;
let launchGameBtn = null;

// Initialize DOM elements
function initializeDOMElements() {
  connectionStatus = document.getElementById('connection-status');
  statusDot = document.querySelector('.status-dot');
  statusText = document.querySelector('.status-text');
  nicknameInput = document.getElementById('nickname');
  updateProfileBtn = document.getElementById('update-profile');
  roomNameInput = document.getElementById('room-name');
  maxPlayersSelect = document.getElementById('max-players');
  createRoomBtn = document.getElementById('create-room');
  roomCodeInput = document.getElementById('room-code');
  joinRoomBtn = document.getElementById('join-room');
  currentRoomSection = document.getElementById('current-room');
  roomNameDisplay = document.getElementById('room-name-display');
  roomCodeDisplay = document.getElementById('room-code-display');
  playerCount = document.getElementById('player-count');
  maxPlayersDisplay = document.getElementById('max-players-display');
  leaveRoomBtn = document.getElementById('leave-room');
  startGameBtn = document.getElementById('start-game');
  playersContainer = document.getElementById('players-container');
  roomsContainer = document.getElementById('rooms-container');
  refreshRoomsBtn = document.getElementById('refresh-rooms');
  gameLaunchSection = document.getElementById('game-launch');
  launchGameBtn = document.getElementById('launch-game');
  
  console.log('DOM elements initialized');
}

// Update connection status
function updateConnectionStatus(text, status) {
  if (statusText) {
    statusText.textContent = text;
  }
  
  if (statusDot) {
    statusDot.className = 'status-dot ' + status;
  }
}

// Update player profile
function updatePlayerProfile() {
  const nickname = nicknameInput.value.trim();
  if (nickname.length < 2) {
    alert('Nickname must be at least 2 characters long');
    return;
  }
  
  currentPlayer.nickname = nickname;
  localStorage.setItem('suika-nickname', nickname);
  
  // Send profile update to server
  socket.emit('updateProfile', {
    nickname: nickname,
    isReady: currentPlayer.isReady
  });
  
  alert('Profile updated successfully!');
}

// Create room
function createRoom() {
  const roomName = roomNameInput.value.trim();
  const maxPlayers = parseInt(maxPlayersSelect.value);
  
  if (roomName.length < 3) {
    alert('Room name must be at least 3 characters long');
    return;
  }
  
  if (!currentPlayer.nickname) {
    alert('Please set your nickname first');
    return;
  }
  
  socket.emit('createRoom', {
    name: roomName,
    maxPlayers: maxPlayers,
    hostNickname: currentPlayer.nickname
  });
}

// Join room
function joinRoom() {
  const roomCode = roomCodeInput.value.trim();
  
  if (roomCode.length < 3) {
    alert('Please enter a valid room code');
    return;
  }
  
  if (!currentPlayer.nickname) {
    alert('Please set your nickname first');
    return;
  }
  
  socket.emit('joinRoom', {
    roomCode: roomCode,
    nickname: currentPlayer.nickname
  });
}

// Leave room
function leaveRoom() {
  if (currentRoom.id) {
    socket.emit('leaveRoom', { roomId: currentRoom.id });
  }
}

// Start game
function startGame() {
  if (currentRoom.id && currentPlayer.isHost) {
    socket.emit('startGame', { roomId: currentRoom.id });
  }
}

// Launch game
function launchGame() {
  // Store room info for the game
  localStorage.setItem('suika-room-id', currentRoom.id);
  localStorage.setItem('suika-player-nickname', currentPlayer.nickname);
  
  // Navigate to game
  window.location.href = 'game.html';
}

// Refresh available rooms
function refreshRooms() {
  socket.emit('getRooms');
}

// Update players list
function updatePlayersList(players) {
  if (!playersContainer) return;
  
  if (players.length === 0) {
    playersContainer.innerHTML = '<p class="no-players">No players in room yet</p>';
    return;
  }
  
  playersContainer.innerHTML = players.map(player => `
    <div class="player-item">
      <div class="player-info">
        <div class="player-avatar">${player.nickname.charAt(0).toUpperCase()}</div>
        <div class="player-details">
          <h4>${player.nickname}</h4>
          <p>${player.isHost ? 'Host' : 'Player'}</p>
        </div>
      </div>
      <div class="player-status ${player.isReady ? 'ready' : 'not-ready'} ${player.isHost ? 'host' : ''}">
        ${player.isHost ? 'Host' : (player.isReady ? 'Ready' : 'Not Ready')}
      </div>
    </div>
  `).join('');
}

// Update available rooms list
function updateRoomsList(rooms) {
  if (!roomsContainer) return;
  
  if (rooms.length === 0) {
    roomsContainer.innerHTML = '<p class="no-rooms">No rooms available</p>';
    return;
  }
  
  roomsContainer.innerHTML = rooms.map(room => `
    <div class="room-item">
      <div class="room-details">
        <h4>${room.name}</h4>
        <p>Code: ${room.code}</p>
        <p>Host: ${room.hostNickname}</p>
      </div>
      <div class="room-stats">
        <div class="room-stat">
          <div class="number">${room.playerCount}</div>
          <div class="label">Players</div>
        </div>
        <div class="room-stat">
          <div class="number">${room.maxPlayers}</div>
          <div class="label">Max</div>
        </div>
      </div>
      <button class="secondary" onclick="joinRoomByCode('${room.code}')">Join</button>
    </div>
  `).join('');
}

// Join room by code (global function for onclick)
window.joinRoomByCode = function(code) {
  roomCodeInput.value = code;
  joinRoom();
};

// Set up event listeners
function setupEventListeners() {
  // Profile
  updateProfileBtn.addEventListener('click', updatePlayerProfile);
  
  // Room management
  createRoomBtn.addEventListener('click', createRoom);
  joinRoomBtn.addEventListener('click', joinRoom);
  leaveRoomBtn.addEventListener('click', leaveRoom);
  startGameBtn.addEventListener('click', startGame);
  
  // Game launch
  launchGameBtn.addEventListener('click', launchGame);
  
  // Rooms
  refreshRoomsBtn.addEventListener('click', refreshRooms);
  
  // Enter key handlers
  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') updatePlayerProfile();
  });
  
  roomNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createRoom();
  });
  
  roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
  });
}

// Socket event handlers
function setupSocketEvents() {
  // Connection events
  socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus('Connected', 'connected');
    
    // Load saved nickname
    const savedNickname = localStorage.getItem('suika-nickname');
    if (savedNickname) {
      currentPlayer.nickname = savedNickname;
      nicknameInput.value = savedNickname;
    }
    
    // Get available rooms
    refreshRooms();
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus('Disconnected', '');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateConnectionStatus('Connection Failed', '');
  });
  
  // Room events
  socket.on('roomCreated', (data) => {
    console.log('Room created:', data);
    currentRoom = {
      id: data.roomId,
      name: data.roomName,
      maxPlayers: data.maxPlayers,
      players: data.players,
      isInRoom: true
    };
    
    currentPlayer.isHost = true;
    currentPlayer.isReady = true;
    
    updateRoomDisplay();
    updatePlayersList(data.players);
    
    alert(`Room created successfully! Room code: ${data.roomCode}`);
  });
  
  socket.on('roomJoined', (data) => {
    console.log('Joined room:', data);
    currentRoom = {
      id: data.roomId,
      name: data.roomName,
      maxPlayers: data.maxPlayers,
      players: data.players,
      isInRoom: true
    };
    
    currentPlayer.isHost = false;
    currentPlayer.isReady = true;
    
    updateRoomDisplay();
    updatePlayersList(data.players);
    
    alert(`Joined room: ${data.roomName}`);
  });
  
  socket.on('roomLeft', () => {
    console.log('Left room');
    currentRoom = {
      id: null,
      name: '',
      maxPlayers: 4,
      players: [],
      isInRoom: false
    };
    
    currentPlayer.isHost = false;
    currentPlayer.isReady = false;
    
    updateRoomDisplay();
    updatePlayersList([]);
  });
  
  socket.on('playerJoined', (data) => {
    console.log('Player joined:', data);
    currentRoom.players = data.players;
    updatePlayersList(data.players);
    updateRoomDisplay();
  });
  
  socket.on('playerLeft', (data) => {
    console.log('Player left:', data);
    currentRoom.players = data.players;
    updatePlayersList(data.players);
    updateRoomDisplay();
  });
  
  socket.on('playerReady', (data) => {
    console.log('Player ready:', data);
    currentRoom.players = data.players;
    updatePlayersList(data.players);
    checkGameReady();
  });
  
  socket.on('roomsList', (data) => {
    console.log('Available rooms:', data);
    updateRoomsList(data.rooms);
  });
  
  socket.on('gameStarting', (data) => {
    console.log('Game starting:', data);
    gameLaunchSection.style.display = 'block';
    startGameBtn.disabled = true;
  });
  
  socket.on('error', (data) => {
    alert(`Error: ${data.message}`);
  });
}

// Update room display
function updateRoomDisplay() {
  if (currentRoom.isInRoom) {
    currentRoomSection.style.display = 'block';
    roomNameDisplay.textContent = currentRoom.name;
    roomCodeDisplay.textContent = currentRoom.id;
    playerCount.textContent = currentRoom.players.length;
    maxPlayersDisplay.textContent = currentRoom.maxPlayers;
    
    // Enable start game button for host
    startGameBtn.disabled = !currentPlayer.isHost || currentRoom.players.length < 2;
  } else {
    currentRoomSection.style.display = 'none';
    gameLaunchSection.style.display = 'none';
  }
}

// Check if game is ready to start
function checkGameReady() {
  if (currentRoom.players.length >= 2 && currentRoom.players.every(p => p.isReady)) {
    if (currentPlayer.isHost) {
      startGameBtn.disabled = false;
    }
  } else {
    startGameBtn.disabled = true;
  }
}

// Initialize everything when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing lobby...');
    initializeDOMElements();
    setupEventListeners();
    setupSocketEvents();
  });
} else {
  console.log('DOM already loaded, initializing lobby...');
  initializeDOMElements();
  setupEventListeners();
  setupSocketEvents();
} 