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

// Debouncing for updateMiniViewer to prevent recursion
const updateMiniViewerTimeouts = {};

// Visual cursor indicator for viewing other players
let cursorIndicator = null;
let cursorIndicatorTimeout = null;

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
  
  // Create cursor indicator
  cursorIndicator = document.createElement('div');
  cursorIndicator.style.position = 'absolute';
  cursorIndicator.style.width = '20px';
  cursorIndicator.style.height = '20px';
  cursorIndicator.style.borderRadius = '50%';
  cursorIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
  cursorIndicator.style.border = '2px solid red';
  cursorIndicator.style.pointerEvents = 'none';
  cursorIndicator.style.zIndex = '1000';
  cursorIndicator.style.display = 'none';
  cursorIndicator.style.transition = 'all 0.1s ease';
  
  // Add to main canvas container
  const canvasContainer = mainCanvas.parentElement;
  if (canvasContainer) {
    canvasContainer.style.position = 'relative';
    canvasContainer.appendChild(cursorIndicator);
  }
  
  console.log('Game DOM elements initialized');
}

  

// Initialize physics engine for a player
function initializePlayerEngine(playerNum, canvasWidth = 400, canvasHeight = 600) {
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
  
  // Start the physics engine
  Runner.run(engine);
  
  console.log(`Physics engine initialized for player ${playerNum} with canvas ${canvasWidth}x${canvasHeight}`);
}

// Initialize world with walls
function initializeWorld(world, canvasWidth = 400, canvasHeight = 600) {
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
  // Prevent creating duplicate viewers for the same player
  if (document.getElementById(`viewer-${playerNum}`)) {
    console.warn(`Mini viewer for player ${playerNum} already exists. Skipping creation.`);
    return;
  }

  const viewerDiv = document.createElement('div');
  viewerDiv.className = 'mini-viewer';
  viewerDiv.id = `viewer-${playerNum}`;
  
  // Build the viewer HTML (including the canvas that will actually be in the DOM)
  viewerDiv.innerHTML = `
    <div class="mini-viewer-header">
      <div class="mini-viewer-name">${playerData.nickname}</div>
      <div class="mini-viewer-score" id="score-${playerNum}">Score: 0</div>
    </div>
    <canvas id="canvas-${playerNum}" width="300" height="150"></canvas>
    <div class="mini-viewer-status" id="status-${playerNum}">Waiting...</div>
  `;
  
  // Append to DOM *before* we start rendering so the canvas is present
  viewersContainer.appendChild(viewerDiv);
  
  // Grab the canvas that now exists inside the viewer
  const canvas = viewerDiv.querySelector('canvas');

  // --- ENGINE INITIALISATION -------------------------------------------------
  // Only create a new physics engine if we don't already have one for this player.
  // This avoids overwriting the main player engine (and prevents score resets / recursion).
  if (!engines[playerNum]) {
    initializePlayerEngine(playerNum, 400, 600);
  }
  
  // Create and run the Matter.js render on the **actual** DOM canvas
  const miniRender = createSimpleRender(engines[playerNum], canvas);
  renders[playerNum] = miniRender;
  Render.run(miniRender);
  
  // Allow clicking the mini-viewer to switch the main view
  viewerDiv.addEventListener('click', () => {
    console.log(`Clicked on player ${playerNum} mini viewer`);
    switchToPlayerView(playerNum);
  });
  
  // Immediately request the opponent's full state so their objects & score appear
  if (playerNum !== gameState.playerNumber && gameState.roomId) {
    console.log(`Requesting immediate complete state for player ${playerNum}`);
    socket.emit('requestCompleteState', {
      roomId: gameState.roomId,
      requestedPlayerNumber: playerNum
    });
  }
  
  console.log(`Mini viewer created for player ${playerNum}: ${playerData.nickname}`);
  }

// Update mini viewer
function updateMiniViewer(playerNum) {
  // Clear existing timeout for this player to prevent excessive calls
  if (updateMiniViewerTimeouts[playerNum]) {
    clearTimeout(updateMiniViewerTimeouts[playerNum]);
  }
  
  // Debounce the update to prevent excessive calls
  updateMiniViewerTimeouts[playerNum] = setTimeout(() => {
    const playerGameState = gameStates[playerNum];
    if (!playerGameState) return;
    
    // Update mini viewer score display
    const scoreElement = document.getElementById(`score-${playerNum}`);
    const statusElement = document.getElementById(`status-${playerNum}`);
    
    if (scoreElement) {
      scoreElement.textContent = `Score: ${playerGameState.score}`;
    }
    
    if (statusElement) {
      statusElement.textContent = playerGameState.disableAction ? 'Dropping...' : 'Playing';
      statusElement.className = `mini-viewer-status ${playerGameState.disableAction ? 'waiting' : 'playing'}`;
    }
    
    // IMPORTANT: Only update main score if this is the currently viewed player
    // This prevents recursion and ensures the main score shows the correct player
    if (gameState.currentView === playerNum) {
      // Direct update without calling updateMainGameControls to prevent recursion
      if (mainScore) {
        mainScore.textContent = `Score: ${playerGameState.score}`;
      }
    }
  }, 50); // 50ms debounce
}



// Simple render creation - no storage, no reuse
function createSimpleRender(engine, canvas) {
  return Render.create({
    engine: engine,
    canvas: canvas,
    options: {
      wireframes: false, // Change to false to show textures/colors
      background: "#F7f4C8",
      width: canvas.width,
      height: canvas.height,
      pixelRatio: 'auto',
      showDebug: false,
      hasBounds: false,
      enabled: true,
      showVelocity: false,
      showAngleIndicator: false
    }
  });
}

// Switch to player view - simple approach
function switchToPlayerView(playerNum) {
  if (gameState.currentView === playerNum) return;
  
  console.log(`Switching from player ${gameState.currentView} to player ${playerNum}`);
  
  // Stop and clear ALL renders completely
  Object.keys(renders).forEach(pNum => {
    const render = renders[pNum];
    if (render) {
      Render.stop(render);
      delete renders[pNum];
    }
  });
  
  gameState.currentView = playerNum;
  
  // Update main canvas
  mainCanvas.width = 400;
  mainCanvas.height = 600;
  
  // Ensure the engine and world exist for this player
  const targetEngine = engines[playerNum];
  const targetGameState = gameStates[playerNum];
  
  if (!targetEngine || !targetGameState) {
    console.error(`No engine or gameState found for player ${playerNum}`);
    return;
  }
  
  console.log(`Player ${playerNum} world has ${targetGameState.world.bodies.length} bodies`);
  
  // Create one simple render for main canvas
  const mainRender = createSimpleRender(targetEngine, mainCanvas);
  renders[playerNum] = mainRender;
  Render.run(mainRender);
  
  // Force a render update to show existing bodies
  setTimeout(() => {
    if (renders[playerNum]) {
      Render.world(renders[playerNum]);
      
      // If viewing another player's game, request their complete state
      if (playerNum !== gameState.playerNumber) {
        console.log(`Requesting complete state for player ${playerNum}`);
        socket.emit('requestCompleteState', {
          roomId: gameState.roomId,
          requestedPlayerNumber: playerNum
        });
      }
    }
  }, 100);
  
  console.log(`Created simple render for player ${playerNum} on main canvas`);
  
  // Update UI
  const playerData = gameState.players.find(p => p.number === playerNum);
  if (playerData) {
    // Show "Your Game" if viewing your own game, otherwise show the player's name
    if (playerNum === gameState.playerNumber) {
      mainPlayerName.textContent = 'Your Game';
    } else {
      mainPlayerName.textContent = `${playerData.nickname}'s Game`;
    }
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
  
  // Show/hide cursor indicator based on whether viewing your own game
  if (isViewingOwnGame) {
    hideCursorIndicator();
  } else {
    // Show cursor indicator for other players' games
    const opponentGameState = gameStates[playerNum];
    if (opponentGameState && opponentGameState.currentBody) {
      updateCursorIndicator(
        opponentGameState.currentBody.position.x,
        opponentGameState.currentBody.position.y
      );
    }
  }
  
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
  
  // Always show the score of the currently viewed player
  mainScore.textContent = `Score: ${gameState.score}`;
}

// Get fruit emoji
function getFruitEmoji(index) {
  const emojis = ['🍒', '🍓', '🍇', '🍊', '🍎', '🍐', '🍑', '🍍', '🍈', '🍉'];
  return emojis[index] || '🍒';
}

// Set up collision detection
function setupCollisionDetection() {
  // Prevent multiple setups
  if (setupCollisionDetection.isSetup) {
    console.log('Collision detection already set up, skipping...');
    return;
  }
  
  Object.keys(engines).forEach(playerNum => {
    Events.on(engines[playerNum], "collisionStart", (event) => {
      handleCollision(event, parseInt(playerNum));
    });
  });
  
  setupCollisionDetection.isSetup = true;
  console.log('Collision detection set up for all engines');
}

// Handle collision
function handleCollision(event, playerNum) {
  const playerGameState = gameStates[playerNum];
  if (!playerGameState) return;
  
  event.pairs.forEach((collision) => {
    if (collision.bodyA.index === collision.bodyB.index) {
      const index = collision.bodyA.index;

      if (index === FRUITS.length - 1) {
        return;
      }

      World.remove(playerGameState.world, [collision.bodyA, collision.bodyB]);

      const newFruit = FRUITS[index + 1];
      const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#c0392b'];
      const newBody = Bodies.circle(
        collision.collision.supports[0].x,
        collision.collision.supports[0].y,
        newFruit.radius, {
          render: {
            fillStyle: colors[(index + 1) % colors.length],
            strokeStyle: '#2c3e50',
            lineWidth: 2,
            sprite: {texture: `/${newFruit.name}.png`}
          },
          index: index + 1,
          restitution: 0.2,
          density: 0.001,
          friction: 0.3,
          frictionAir: 0.01,
        }
      );

      World.add(playerGameState.world, newBody);

      // Add score
      const combinationScore = FRUIT_SCORES[index + 1] || 0;
      playerGameState.score += combinationScore;
      
      console.log(`Player ${playerNum} scored ${combinationScore} points, total: ${playerGameState.score}`);
      
      // Broadcast score update to other players
      socket.emit('scoreUpdate', {
        roomId: gameState.roomId,
        playerNumber: playerNum,
        score: playerGameState.score
      });
      
      // Update mini viewer for this player
      updateMiniViewer(playerNum);
      
      // Check for watermelon win
      if (index + 1 === 10) {
        console.log(`🎉 Player ${playerNum} created a WATERMELON! Game Over!`);
        
        playerGameState.num_suika += 1;
        
        socket.emit('playerWon', {
          roomId: gameState.roomId,
          playerNumber: playerNum,
          score: playerGameState.score,
          num_suika: playerGameState.num_suika
        });
        
        showWinModal(playerNum);
      }
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
  
  const winnerGameState = gameStates[winnerPlayerNum];
  winScore.textContent = winnerGameState.score;
  winWatermelons.textContent = winnerGameState.num_suika;
  
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
  // Prevent multiple setups
  if (setupEventListeners.isSetup) {
    console.log('Event listeners already set up, skipping...');
    return;
  }
  
  // Main canvas click (will be managed by switchToPlayerView)
  mainCanvas.addEventListener('click', (e) => {
    // Only allow clicking if viewing your own game
    if (gameState.currentView === gameState.playerNumber) {
      dropFruitForPlayer(gameState.playerNumber);
    }
  });
  
  // Main canvas mouse move (will be managed by switchToPlayerView)
  mainCanvas.addEventListener('mousemove', (e) => {
    // Handle mouse movement for the currently viewed player
    const currentViewPlayer = gameState.currentView;
    if (currentViewPlayer && currentViewPlayer === gameState.playerNumber) {
      // Only handle mouse movement for your own game
      handleMouseMove(e, currentViewPlayer);
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
  
  setupEventListeners.isSetup = true;
  console.log('Event listeners set up successfully');
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

// Update cursor indicator position
function updateCursorIndicator(x, y) {
  if (!cursorIndicator) return;
  
  const rect = mainCanvas.getBoundingClientRect();
  const currentViewGameState = gameStates[gameState.currentView];
  const worldWidth = currentViewGameState?.canvasWidth || 400;
  
  // Convert world coordinates to screen coordinates
  const canvasX = (x / worldWidth) * rect.width;
  const canvasY = (y / 600) * rect.height;
  
  // Update cursor indicator position
  cursorIndicator.style.left = `${rect.left + canvasX - 10}px`;
  cursorIndicator.style.top = `${rect.top + canvasY - 10}px`;
  cursorIndicator.style.display = 'block';
  
  // Clear existing timeout and set new one
  if (cursorIndicatorTimeout) {
    clearTimeout(cursorIndicatorTimeout);
  }
  
  // Hide cursor indicator after 2 seconds of inactivity
  cursorIndicatorTimeout = setTimeout(() => {
    hideCursorIndicator();
  }, 2000);
}

// Hide cursor indicator
function hideCursorIndicator() {
  if (cursorIndicator) {
    cursorIndicator.style.display = 'none';
  }
  
  // Clear timeout
  if (cursorIndicatorTimeout) {
    clearTimeout(cursorIndicatorTimeout);
    cursorIndicatorTimeout = null;
  }
}

// Socket event handlers
function setupSocketEvents() {
  // Prevent multiple setups
  if (setupSocketEvents.isSetup) {
    console.log('Socket events already set up, skipping...');
    return;
  }
  
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
    
    // Set main canvas to narrower size for better gameplay
    mainCanvas.width = 400;
    mainCanvas.height = 600;
    // Initialize main player with canvas dimensions
    initializePlayerEngine(gameState.playerNumber, mainCanvas.width, mainCanvas.height);
    
    // Create initial main render
    const initialRender = createSimpleRender(engines[gameState.playerNumber], mainCanvas);
    renders[gameState.playerNumber] = initialRender;
    Render.run(initialRender);
    
    // Create mini viewers with YOURSELF first, then others – client-specific order
    const sortedPlayers = [...data.players].sort((pA, pB) => {
      // put my own player (data.playerNumber) at the front
      if (pA.number === data.playerNumber) return -1;
      if (pB.number === data.playerNumber) return 1;
      return pA.number - pB.number; // keep deterministic order for remaining
    });

    sortedPlayers.forEach(player => {
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
      const opponentGameState = gameStates[data.playerNumber];
      if (opponentGameState && opponentGameState.currentBody) {
        // Update the opponent's fruit position
        Body.setPosition(opponentGameState.currentBody, {
          x: data.x,
          y: data.y
        });
        
        // If we're currently viewing this player's game, show cursor indicator
        if (gameState.currentView === data.playerNumber) {
          updateCursorIndicator(data.x, data.y);
        }
      }
    }
  });
  
  socket.on('opponentFruitDropped', (data) => {
    if (data.playerNumber !== gameState.playerNumber) {
      const opponentGameState = gameStates[data.playerNumber];
      if (opponentGameState && opponentGameState.currentBody) {
        opponentGameState.currentBody.isSleeping = false;
        opponentGameState.currentBody.isDropped = true;
        
        // Hide cursor indicator when fruit is dropped
        if (gameState.currentView === data.playerNumber) {
          hideCursorIndicator();
        }
      }
    }
  });
  
  socket.on('opponentCompleteState', (data) => {
    if (data.gameState && data.gameState.playerNumber !== gameState.playerNumber) {
      applyOpponentGameState(data.gameState);
    }
  });
  
  socket.on('requestCompleteState', (data) => {
    if (data.requestedPlayerNumber === gameState.playerNumber) {
      // Send our complete game state to the requester
      const currentState = gameStates[gameState.playerNumber];
      if (currentState) {
        const completeState = {
          playerNumber: gameState.playerNumber,
          score: currentState.score,
          placementCount: currentState.placementCount,
          num_suika: currentState.num_suika,
          bodies: currentState.world.bodies
            .filter(body => !body.isStatic && body.index !== undefined)
            .map(body => ({
              x: body.position.x,
              y: body.position.y,
              radius: Math.sqrt(body.area / Math.PI),
              index: body.index,
              velocityX: body.velocity.x,
              velocityY: body.velocity.y,
              angularVelocity: body.angularVelocity,
              angle: body.angle,
              isSleeping: body.isSleeping
            }))
        };
        
        socket.emit('sendCompleteState', {
          roomId: gameState.roomId,
          gameState: completeState
        });
      }
    }
  });
  
  socket.on('scoreUpdate', (data) => {
    console.log('Score update received:', data);
    if (data.playerNumber !== gameState.playerNumber) {
      // Update the opponent's score in their game state
      const opponentGameState = gameStates[data.playerNumber];
      if (opponentGameState) {
        opponentGameState.score = data.score;
        console.log(`Updated player ${data.playerNumber} score to ${data.score}`);
        
        // Update the mini viewer for this player
        updateMiniViewer(data.playerNumber);
        
        // If we're currently viewing this player, update the main score immediately
        if (gameState.currentView === data.playerNumber && mainScore) {
          mainScore.textContent = `Score: ${data.score}`;
        }
      }
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
  
  setupSocketEvents.isSetup = true;
  console.log('Socket events set up successfully');
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