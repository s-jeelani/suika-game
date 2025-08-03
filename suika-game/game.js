import {Bodies, Body, Events, Engine, Render, Runner, World, Sleeping} from "matter-js"
import { FRUITS } from './fruits.js'
import { SERVER_URL } from './config.js'

// Socket.IO connection
console.log('Connecting to game server:', SERVER_URL);
const socket = io(SERVER_URL, {
  timeout: 10000,
  transports: ['websocket', 'polling'],
  forceNew: true
});

// Game state
let gameState = {
  roomId: null,
  playerNickname: '',
  playerNumber: null,
  maxPlayers: 4,
  players: [],
  currentView: 'main', // 'main' or player number
  gameStarted: false,
  gameOver: false
};

// Physics engines for each player
const engines = {};
const renders = {};
const gameStates = {};

// DOM elements
let mainPlayerName = null;
let mainScore = null;
let mainCanvas = null;
let viewersContainer = null;
let winModal = null;
let loadingScreen = null;
let loadingMessage = null;

// Initialize DOM elements
function initializeDOMElements() {
  mainPlayerName = document.getElementById('main-player-name');
  mainScore = document.getElementById('main-score');
  mainCanvas = document.getElementById('main-canvas');
  viewersContainer = document.getElementById('viewers-container');
  winModal = document.getElementById('win-modal');
  loadingScreen = document.getElementById('loading-screen');
  loadingMessage = document.getElementById('loading-message');
  
  console.log('Game DOM elements initialized');
}

  

// Initialize physics engine for a player
function initializePlayerEngine(playerNum, canvasWidth = 800, canvasHeight = 600) {
  const engine = Engine.create();
  engine.world.gravity.y = 1;
  engine.world.gravity.scale = 0.001;
  engine.timing.timeScale = 1;
  engine.positionIterations = 6;
  engine.velocityIterations = 4;
  
  engines[playerNum] = engine;
  gameStates[playerNum] = {
    engine: engine,
    world: engine.world,
    currentBody: null,
    currentFruit: null,
    nextFruit: null,
    disableAction: false,
    score: 0,
    num_suika: 0,
    placementCount: 0,
    canvasWidth: canvasWidth,
    canvasHeight: canvasHeight
  };
  
  // Initialize world with canvas dimensions
  initializeWorld(engine.world, canvasWidth, canvasHeight);
  
  console.log(`Physics engine initialized for player ${playerNum} with canvas ${canvasWidth}x${canvasHeight}`);
}

// Initialize world with walls
function initializeWorld(world, canvasWidth = 800, canvasHeight = 600) {
  console.log(`Initializing world with dimensions: ${canvasWidth}x${canvasHeight}`);
  
  const leftWall = Bodies.rectangle(15, canvasHeight/2, 30, canvasHeight, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const rightWall = Bodies.rectangle(canvasWidth - 15, canvasHeight/2, 30, canvasHeight, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const groundWall = Bodies.rectangle(canvasWidth/2, canvasHeight - 30, canvasWidth, 60, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const topLine = Bodies.rectangle(canvasWidth/2, 150, canvasWidth, 2, {
    name: 'topLine',
    isStatic: true,
    isSensor: true,
    render: { fillStyle: '#E6B143'}
  });

  World.add(world, [leftWall, rightWall, groundWall, topLine]);
  console.log(`World initialized with walls at positions: left(15), right(${canvasWidth-15}), ground(${canvasHeight-30}), top(150)`);
}

// Create render for a player
function createPlayerRender(playerNum, canvas) {
  console.log(`Creating render for player ${playerNum}: canvas=${canvas.width}x${canvas.height}`);
  
  const render = Render.create({
    engine: engines[playerNum],
    canvas: canvas,
    options: {
      wireframes: true,          // Enable wireframes to debug viewport issues
      background: "#F7f4C8",
      width: canvas.width,
      height: canvas.height,
      pixelRatio: 'auto',
      showDebug: false,
      hasBounds: false
    }
  });
  
  renders[playerNum] = render;
  Render.run(render);
  Runner.run(engines[playerNum]);
  
  console.log(`Render created for player ${playerNum} with canvas size ${canvas.width}x${canvas.height}`);
  
  // Debug: Check if bodies are being rendered
  setTimeout(() => {
    const world = engines[playerNum].world;
    console.log(`Player ${playerNum} world has ${world.bodies.length} bodies after render creation`);
    world.bodies.forEach((body, index) => {
      console.log(`Body ${index}: position(${body.position.x}, ${body.position.y}), render:`, body.render);
    });
  }, 1000);
}

// Add fruit to a player's game
function addFruitToPlayer(playerNum, fruitIndex) {
  const gameState = gameStates[playerNum];
  if (!gameState) return;
  
  const fruit = FRUITS[fruitIndex];
  const centerX = gameState.canvasWidth / 2;
  
  console.log(`Adding fruit ${fruit.name} to player ${playerNum} at position ${centerX}, 50`);
  
  // Create fruit with bright colors for wireframe debugging
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
  const body = Bodies.circle(centerX, 50, fruit.radius, {
    index: fruitIndex,
    isSleeping: true,
    render: {
      fillStyle: colors[fruitIndex % colors.length],    // Different color per fruit type
      strokeStyle: '#2c3e50',
      lineWidth: 2
    },
    restitution: 0.2,
    density: 0.001,
    friction: 0.3,
    frictionAir: 0.01,
    isDropped: false
  });

  gameState.currentBody = body;
  gameState.currentFruit = fruit;

  // Generate next fruit
  const nextIndex = Math.floor(Math.random() * 5);
  gameState.nextFruit = FRUITS[nextIndex];

  World.add(gameState.world, body);
  
  console.log(`Fruit added to player ${playerNum}: ${fruit.name} at position ${centerX}, 50`);
  console.log(`World now has ${gameState.world.bodies.length} bodies`);
}

// Drop fruit for a player
function dropFruitForPlayer(playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState || gameState.disableAction || !gameState.currentBody) return;
  
  gameState.currentBody.isSleeping = false;
  gameState.currentBody.isDropped = true;
  gameState.disableAction = true;
  gameState.placementCount++;

  // Update score
  const score = FRUIT_SCORES[gameState.currentFruit.index] || 0;
  gameState.score += score;
  
  // Send drop event to server
  socket.emit('fruitDropped', {
    roomId: gameState.roomId,
    playerNumber: playerNum,
    fruitIndex: gameState.currentFruit.index
  });

  // Check for complete state sync (every 5 placements)
  if (gameState.placementCount % 5 === 0) {
    setTimeout(() => {
      const completeState = serializeGameState(playerNum);
      if (completeState) {
        socket.emit('completeGameState', {
          roomId: gameState.roomId,
          gameState: completeState
        });
      }
    }, 2000);
  }

  // Generate new fruit after delay
  setTimeout(() => {
    const newFruitIndex = Math.floor(Math.random() * 5);
    addFruitToPlayer(playerNum, newFruitIndex);
    gameState.disableAction = false;
  }, 1000);
}

// Serialize game state
function serializeGameState(playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState) return null;
  
  const bodies = gameState.world.bodies.filter(body => 
    !body.isStatic && body !== gameState.currentBody
  ).map(body => ({
    id: body.id,
    x: body.position.x,
    y: body.position.y,
    angle: body.angle,
    velocityX: body.velocity.x,
    velocityY: body.velocity.y,
    angularVelocity: body.angularVelocity,
    index: body.index,
    radius: body.circleRadius,
    isSleeping: body.isSleeping
  }));
  
  return {
    playerNumber: playerNum,
    score: gameState.score,
    placementCount: gameState.placementCount,
    num_suika: gameState.num_suika,
    bodies: bodies,
    currentFruit: gameState.currentFruit ? {
      name: gameState.currentFruit.name,
      radius: gameState.currentFruit.radius,
      index: gameState.currentBody?.index
    } : null,
    nextFruit: gameState.nextFruit ? {
      name: gameState.nextFruit.name,
      radius: gameState.nextFruit.radius
    } : null,
    timestamp: Date.now()
  };
}

// Apply opponent game state
function applyOpponentGameState(stateData) {
  const playerNum = stateData.playerNumber;
  const gameState = gameStates[playerNum];
  if (!gameState) return;
  
  // Remove existing bodies
  const bodiesToRemove = gameState.world.bodies.filter(body => 
    !body.isStatic && body !== gameState.currentBody
  );
  World.remove(gameState.world, bodiesToRemove);
  
  // Recreate bodies
  const newBodies = stateData.bodies.map(bodyData => {
    const fruit = FRUITS[bodyData.index];
    const body = Bodies.circle(bodyData.x, bodyData.y, bodyData.radius, {
      index: bodyData.index,
      render: {
        sprite: { texture: `/${fruit.name}.png` }
      },
      restitution: 0.2,
      density: 0.001,
      friction: 0.3,
      frictionAir: 0.01,
    });
    
    Body.setVelocity(body, { x: bodyData.velocityX, y: bodyData.velocityY });
    Body.setAngularVelocity(body, bodyData.angularVelocity);
    Body.setAngle(body, bodyData.angle);
    
    if (bodyData.isSleeping) {
      Sleeping.set(body, true);
    }
    
    return body;
  });
  
  World.add(gameState.world, newBodies);
  gameState.score = stateData.score;
  gameState.placementCount = stateData.placementCount;
  gameState.num_suika = stateData.num_suika;
  
  // Update mini viewer
  updateMiniViewer(playerNum);
}

// Create mini viewer for a player
function createMiniViewer(playerNum, playerData) {
  const viewerDiv = document.createElement('div');
  viewerDiv.className = 'mini-viewer';
  viewerDiv.id = `viewer-${playerNum}`;
  
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 150;
  canvas.id = `canvas-${playerNum}`;
  
  viewerDiv.innerHTML = `
    <div class="mini-viewer-header">
      <div class="mini-viewer-name">${playerData.nickname}</div>
      <div class="mini-viewer-score" id="score-${playerNum}">Score: 0</div>
    </div>
    <canvas id="canvas-${playerNum}" width="300" height="150"></canvas>
    <div class="mini-viewer-status" id="status-${playerNum}">Waiting...</div>
  `;
  
  viewersContainer.appendChild(viewerDiv);
  
  // Initialize physics for this player with main canvas dimensions (800x600)
  // This ensures consistent world coordinates across all players
  initializePlayerEngine(playerNum, 800, 600);
  createPlayerRender(playerNum, canvas);
  
  // Store original mini canvas for each player
  if (!window.originalMiniCanvases) {
    window.originalMiniCanvases = {};
  }
  window.originalMiniCanvases[playerNum] = canvas;
  
  // Add click handler to switch view
  viewerDiv.addEventListener('click', () => {
    console.log(`Clicked on player ${playerNum} mini viewer`);
    switchToPlayerView(playerNum);
  });
  
  console.log(`Mini viewer created for player ${playerNum}: ${playerData.nickname}`);
}

// Update mini viewer
function updateMiniViewer(playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState) return;
  
  const scoreElement = document.getElementById(`score-${playerNum}`);
  const statusElement = document.getElementById(`status-${playerNum}`);
  
  if (scoreElement) {
    scoreElement.textContent = `Score: ${gameState.score}`;
  }
  
  if (statusElement) {
    statusElement.textContent = gameState.disableAction ? 'Dropping...' : 'Playing';
    statusElement.className = `mini-viewer-status ${gameState.disableAction ? 'waiting' : 'playing'}`;
  }
  
  // Update main game controls if this is the current view (for real-time updates)
  if (gameState.currentView === playerNum) {
    updateMainGameControls(playerNum);
  }
}



// Switch to player view
function switchToPlayerView(playerNum) {
  if (gameState.currentView === playerNum) return;
  
  console.log(`Switching from player ${gameState.currentView} to player ${playerNum}`);
  
  // Stop ALL current renders to avoid conflicts
  Object.keys(renders).forEach(pNum => {
    const render = renders[pNum];
    if (render && render.canvas === mainCanvas) {
      console.log(`Stopping main canvas render for player ${pNum}`);
      Render.stop(render);
      render.canvas = null;
    }
  });
  
  gameState.currentView = playerNum;
  
  // Update main canvas to show this player's game
  mainCanvas.width = 800;
  mainCanvas.height = 600;
  
  // Use the original render but redirect it to main canvas
  const originalRender = renders[playerNum];
  if (originalRender) {
    // Stop the original render first
    Render.stop(originalRender);
    
    // Redirect to main canvas
    originalRender.canvas = mainCanvas;
    originalRender.options.width = mainCanvas.width;
    originalRender.options.height = mainCanvas.height;
    
    // Restart on main canvas
    Render.run(originalRender);
    
    console.log(`Redirected player ${playerNum} render to main canvas`);
  }
  
  // Update UI
  const playerData = gameState.players.find(p => p.number === playerNum);
  if (playerData) {
    mainPlayerName.textContent = `${playerData.nickname}'s Game`;
  }
  
  // Update active state
  document.querySelectorAll('.mini-viewer').forEach(viewer => {
    viewer.classList.remove('active');
  });
  const activeViewer = document.getElementById(`viewer-${playerNum}`);
  if (activeViewer) {
    activeViewer.classList.add('active');
    console.log(`Set active highlight on viewer-${playerNum}`);
  } else {
    console.error(`Could not find viewer-${playerNum} to highlight`);
  }
  
  // Update controls
  updateMainGameControls(playerNum);
  
  // Enable/disable interaction based on whether viewing your own game
  const isViewingOwnGame = playerNum === gameState.playerNumber;
  mainCanvas.style.cursor = isViewingOwnGame ? 'crosshair' : 'default';
  
  // Debug: Log canvas state and render info
  console.log(`Switched to player ${playerNum} view. Canvas size: ${mainCanvas.width}x${mainCanvas.height}`);
  console.log(`Canvas client size: ${mainCanvas.clientWidth}x${mainCanvas.clientHeight}`);
  console.log(`Canvas style: width=${mainCanvas.style.width}, height=${mainCanvas.style.height}`);
  
  // Ensure canvas is properly sized
  setTimeout(() => {
    const render = renders[playerNum];
    if (render) {
      console.log(`Render bounds: width=${render.bounds.max.x - render.bounds.min.x}, height=${render.bounds.max.y - render.bounds.min.y}`);
      console.log(`Render options: width=${render.options.width}, height=${render.options.height}`);
    }
  }, 100);
}

// Update main game controls
function updateMainGameControls(playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState) return;
  
  mainScore.textContent = `Score: ${gameState.score}`;
}

// Get fruit emoji
function getFruitEmoji(index) {
  const emojis = ['🍒', '🍓', '🍇', '🍊', '🍎', '🍐', '🍑', '🍍', '🍈', '🍉'];
  return emojis[index] || '🍒';
}

// Set up collision detection
function setupCollisionDetection() {
  Object.keys(engines).forEach(playerNum => {
    Events.on(engines[playerNum], "collisionStart", (event) => {
      handleCollision(event, parseInt(playerNum));
    });
  });
}

// Handle collision
function handleCollision(event, playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState) return;
  
  event.pairs.forEach((collision) => {
    if (collision.bodyA.index === collision.bodyB.index) {
      const index = collision.bodyA.index;

      if (index === FRUITS.length - 1) {
        return;
      }

      World.remove(gameState.world, [collision.bodyA, collision.bodyB]);

      const newFruit = FRUITS[index + 1];
      const newBody = Bodies.circle(
        collision.collision.supports[0].x,
        collision.collision.supports[0].y,
        newFruit.radius, {
          render: {sprite: {texture: `/${newFruit.name}.png`}},
          index: index + 1,
          restitution: 0.2,
          density: 0.001,
          friction: 0.3,
          frictionAir: 0.01,
        }
      );

      World.add(gameState.world, newBody);

      // Add score
      const combinationScore = FRUIT_SCORES[index + 1] || 0;
      gameState.score += combinationScore;
      
      // Check for watermelon win
      if (index + 1 === 10) {
        console.log(`🎉 Player ${playerNum} created a WATERMELON! Game Over!`);
        
        socket.emit('playerWon', {
          roomId: gameState.roomId,
          playerNumber: playerNum,
          score: gameState.score,
          num_suika: gameState.num_suika
        });
        
        showWinModal(playerNum);
      }
      
      // Update mini viewer
      updateMiniViewer(playerNum);
    }
  });
}

// Show win modal
function showWinModal(winnerPlayerNum) {
  const winnerData = gameState.players.find(p => p.number === winnerPlayerNum);
  const isWinner = winnerPlayerNum === gameState.playerNumber;
  
  const winTitle = document.getElementById('win-title');
  const winMessage = document.getElementById('win-message');
  const winScore = document.getElementById('win-score');
  const winWatermelons = document.getElementById('win-watermelons');
  
  if (isWinner) {
    winTitle.textContent = '🎉 Congratulations!';
    winMessage.textContent = 'You created a watermelon and won the game!';
  } else {
    winTitle.textContent = '🏆 Game Over';
    winMessage.textContent = `${winnerData.nickname} created a watermelon and won the game!`;
  }
  
  const gameState = gameStates[winnerPlayerNum];
  winScore.textContent = gameState.score;
  winWatermelons.textContent = gameState.num_suika;
  
  winModal.classList.remove('hidden');
}

// Fruit scoring system
const FRUIT_SCORES = {
  0: 10,   // cherry
  1: 20,   // strawberry
  2: 40,   // grape
  3: 80,   // gyool
  4: 160,  // orange
  5: 320,  // apple
  6: 640,  // pear
  7: 1280, // peach
  8: 2560, // pineapple
  9: 5120, // melon
  10: 10000 // watermelon
};

// Set up event listeners
function setupEventListeners() {
  // Main canvas click (will be managed by switchToPlayerView)
  mainCanvas.addEventListener('click', (e) => {
    if (gameState.currentView === gameState.playerNumber) {
      dropFruitForPlayer(gameState.playerNumber);
    }
  });
  
  // Main canvas mouse move (will be managed by switchToPlayerView)
  mainCanvas.addEventListener('mousemove', (e) => {
    if (gameState.currentView === gameState.playerNumber) {
      handleMouseMove(e, gameState.playerNumber);
    }
  });
  
  // Win modal buttons
  document.getElementById('play-again').addEventListener('click', () => {
    winModal.classList.add('hidden');
    socket.emit('playAgain', { roomId: gameState.roomId });
  });
  
  document.getElementById('back-lobby').addEventListener('click', () => {
    window.location.href = '/lobby.html';
  });
}

// Handle mouse movement
function handleMouseMove(event, playerNum) {
  const gameState = gameStates[playerNum];
  if (!gameState || gameState.disableAction || !gameState.currentBody) return;
  
  const rect = mainCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  
  // Convert screen coordinates to world coordinates
  const worldX = (x / rect.width) * gameState.canvasWidth;
  
  // Clamp the position within the game boundaries
  const clampedX = Math.max(30 + gameState.currentFruit.radius, 
                           Math.min(worldX, gameState.canvasWidth - 30 - gameState.currentFruit.radius));
  
    Body.setPosition(gameState.currentBody, {
    x: clampedX,
      y: gameState.currentBody.position.y
    });
    
    // Send position update
    socket.emit('fruitMove', {
      roomId: gameState.roomId,
      playerNumber: playerNum,
    x: clampedX,
      y: gameState.currentBody.position.y
    });
}

// Set up socket events
function setupSocketEvents() {
  // Connection events
  socket.on('connect', () => {
    console.log('Connected to game server');
    
    // Load room info
    const roomId = localStorage.getItem('suika-room-id');
    const nickname = localStorage.getItem('suika-player-nickname');
    
    if (roomId && nickname) {
      gameState.roomId = roomId;
      gameState.playerNickname = nickname;
      
      // Join game room
      socket.emit('joinGameRoom', { roomId, nickname });
    } else {
      alert('No room information found. Please return to lobby.');
      window.location.href = '/lobby.html';
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from game server');
  });
  
  // Game events
  socket.on('gameJoined', (data) => {
    console.log('Joined game:', data);
    gameState.playerNumber = data.playerNumber;
    gameState.players = data.players;
    gameState.maxPlayers = data.maxPlayers;
    
    // Set main canvas to much larger size for better visibility
    mainCanvas.width = 800;
    mainCanvas.height = 600;
    // Initialize main player with canvas dimensions
    initializePlayerEngine(gameState.playerNumber, mainCanvas.width, mainCanvas.height);
    createPlayerRender(gameState.playerNumber, mainCanvas);
    
    // Create mini viewers for all players (including your own)
    data.players.forEach(player => {
        createMiniViewer(player.number, player);
    });
    
    // Set up collision detection
    setupCollisionDetection();
    
    // Hide loading screen
    loadingScreen.style.display = 'none';
    
    // Start game
    gameState.gameStarted = true;
    
    // Set initial view to your own game and add initial fruit
    switchToPlayerView(gameState.playerNumber);
    addFruitToPlayer(gameState.playerNumber, Math.floor(Math.random() * 5));
  });
  
  socket.on('playerJoined', (data) => {
    console.log('Player joined game:', data);
    gameState.players = data.players;
    
    // Create mini viewer for new player
    const newPlayer = data.players.find(p => p.number === data.playerNumber);
    if (newPlayer) {
      createMiniViewer(newPlayer.number, newPlayer);
    }
  });
  
  socket.on('playerLeft', (data) => {
    console.log('Player left game:', data);
    gameState.players = data.players;
    
    // Remove mini viewer
    const viewerElement = document.getElementById(`viewer-${data.playerNumber}`);
    if (viewerElement) {
      viewerElement.remove();
    }
  });
  
  socket.on('opponentFruitMove', (data) => {
    if (data.playerNumber !== gameState.playerNumber) {
      const gameState = gameStates[data.playerNumber];
      if (gameState && gameState.currentBody) {
        Body.setPosition(gameState.currentBody, {
          x: data.x,
          y: data.y
        });
      }
    }
  });
  
  socket.on('opponentFruitDropped', (data) => {
    if (data.playerNumber !== gameState.playerNumber) {
      const gameState = gameStates[data.playerNumber];
      if (gameState && gameState.currentBody) {
        gameState.currentBody.isSleeping = false;
        gameState.currentBody.isDropped = true;
      }
    }
  });
  
  socket.on('opponentCompleteState', (data) => {
    if (data.gameState && data.gameState.playerNumber !== gameState.playerNumber) {
      applyOpponentGameState(data.gameState);
    }
  });
  
  socket.on('gameWon', (data) => {
    console.log('Game won:', data);
    gameState.gameOver = true;
    showWinModal(data.winnerPlayerNumber);
  });
  
  socket.on('error', (data) => {
    alert(`Game Error: ${data.message}`);
  });
}

// Test sprite loading
function testSpriteLoading() {
  console.log('🔍 Testing sprite loading paths...');
  
  // Test different possible paths
  const testPaths = [
    '/00_cherry.png',
    '/public/00_cherry.png', 
    './public/00_cherry.png',
    'public/00_cherry.png',
    './00_cherry.png'
  ];
  
  testPaths.forEach((path, index) => {
    const testImg = new Image();
    testImg.onload = () => {
      console.log(`✅ SUCCESS: Sprite loaded at path:`, path);
      console.log(`🎯 USE THIS PATH: "${path}" for textures`);
    };
    testImg.onerror = () => console.log(`❌ Failed: ${path}`);
    testImg.src = path;
  });
}

// Initialize everything
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing game...');
    initializeDOMElements();
    setupEventListeners();
    setupSocketEvents();
    testSpriteLoading();
  });
} else {
  console.log('DOM already loaded, initializing game...');
  initializeDOMElements();
  setupEventListeners();
  setupSocketEvents();
  testSpriteLoading();
} 