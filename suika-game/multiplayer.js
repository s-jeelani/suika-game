import {Bodies, Body, Events, Engine, Render, Runner, World} from "matter-js"
import { FRUITS } from './fruits'
import { SERVER_URL } from './config.js'

// Socket.IO connection
const socket = io(SERVER_URL);

// Game state
let currentPlayer = null;
let roomId = 'room1';
let gameStarted = false;
let playerNumber = null;
let myPlayerNumber = null; // Which player am I controlling

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

// DOM elements
const connectionStatus = document.getElementById('connection-status');
const turnIndicator = document.getElementById('turn-indicator');
const joinGameBtn = document.getElementById('join-game');
const roomIdInput = document.getElementById('room-id');
const player1Score = document.getElementById('player1-score');
const player2Score = document.getElementById('player2-score');
const player1NextFruit = document.getElementById('player1-next-fruit');
const player2NextFruit = document.getElementById('player2-next-fruit');

// Game engines and renders for both players
const engine1 = Engine.create();
const engine2 = Engine.create();

const render1 = Render.create({
  engine: engine1,
  canvas: document.getElementById('player1-canvas'),
  options: {
    wireframes: false,
    background: "#F7f4C8",
    width: 600,
    height: 800
  }
});

const render2 = Render.create({
  engine: engine2,
  canvas: document.getElementById('player2-canvas'),
  options: {
    wireframes: false,
    background: "#F7f4C8",
    width: 600,
    height: 800
  }
});

// Separate game states for each player
const gameStates = {
  player1: {
    engine: engine1,
    world: engine1.world,
    currentBody: null,
    currentFruit: null,
    nextFruit: null,
    disableAction: false,
    score: 0,
    num_suika: 0
  },
  player2: {
    engine: engine2,
    world: engine2.world,
    currentBody: null,
    currentFruit: null,
    nextFruit: null,
    disableAction: false,
    score: 0,
    num_suika: 0
  }
};

// Initialize game worlds
function initializeWorld(world, isPlayer1) {
  const leftWall = Bodies.rectangle(15, 395, 30, 790, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const rightWall = Bodies.rectangle(585, 395, 30, 790, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const groundWall = Bodies.rectangle(300, 790, 600, 60, {
    isStatic: true,
    render: { fillStyle: '#E6B143'}
  });

  const topLine = Bodies.rectangle(300, 150, 600, 2, {
    name: 'topLine',
    isStatic: true,
    isSensor: true,
    render: { fillStyle: '#E6B143'}
  });

  World.add(world, [leftWall, rightWall, groundWall, topLine]);
}

// Initialize both worlds
initializeWorld(gameStates.player1.world, true);
initializeWorld(gameStates.player2.world, false);

// Start renders and runners for both games
Render.run(render1);
Render.run(render2);
Runner.run(engine1);
Runner.run(engine2);

// Add fruit to game for a specific player
function addFruit(playerNum) {
  const index = Math.floor(Math.random() * 5);
  addFruitWithIndex(playerNum, index);
}

// Add fruit to game with specific index
function addFruitWithIndex(playerNum, index) {
  console.log(`Adding fruit for player ${playerNum}, index ${index}`);
  const gameState = gameStates[`player${playerNum}`];
  
  if (!gameState) {
    console.error(`No game state found for player ${playerNum}`);
    return;
  }
  
  const fruit = FRUITS[index];

  const body = Bodies.circle(300, 50, fruit.radius, {
    index: index,
    isSleeping: true,
    render: {
      sprite: { texture: `./public/${fruit.name}.png` }
    },
    restitution: 0.2,
    isDropped: false // Track if fruit has been dropped
  });

  gameState.currentBody = body;
  gameState.currentFruit = fruit;

  // Generate next fruit
  const nextIndex = Math.floor(Math.random() * 5);
  gameState.nextFruit = FRUITS[nextIndex];

  World.add(gameState.world, body);
  
  // Update next fruit display
  updateNextFruitDisplay(playerNum, gameState.nextFruit);
  
  console.log(`Fruit added successfully for player ${playerNum}`);
}

// Update next fruit display
function updateNextFruitDisplay(playerNum, fruit) {
  const container = playerNum === 1 ? player1NextFruit : player2NextFruit;
  container.innerHTML = `<img src="./public/${fruit.name}.png" alt="${fruit.name}">`;
}

// Update turn indicator
function updateTurnIndicator() {
  if (!gameStarted) {
    turnIndicator.textContent = 'Waiting for game to start...';
    return;
  }
  
  if (myPlayerNumber === 1) {
    turnIndicator.textContent = 'You control the LEFT side (Player 1). Compete against the right side!';
  } else if (myPlayerNumber === 2) {
    turnIndicator.textContent = 'You control the RIGHT side (Player 2). Compete against the left side!';
  } else {
    turnIndicator.textContent = 'Spectating both players...';
  }
  turnIndicator.style.backgroundColor = '#4CAF50';
}

// Drop fruit on click for a specific player
function dropFruit(playerNum) {
  const gameState = gameStates[`player${playerNum}`];
  if (gameState.disableAction || !gameState.currentBody) return;
  
  gameState.currentBody.isSleeping = false;
  gameState.currentBody.isDropped = true; // Mark as dropped
  gameState.disableAction = true;

  // Add score for dropping fruit
  const score = FRUIT_SCORES[gameState.currentFruit.index] || 0;
  gameState.score += score;
  
  // Update score display
  if (playerNum === 1) {
    player1Score.textContent = `Player 1: ${gameState.score}`;
  } else {
    player2Score.textContent = `Player 2: ${gameState.score}`;
  }

  // Send score update to server
  socket.emit('updateScore', { 
    roomId, 
    player1Score: gameStates.player1.score,
    player2Score: gameStates.player2.score
  });

  // Send fruit drop event to server
  socket.emit('fruitDropped', { 
    roomId, 
    playerNumber: playerNum,
    fruitIndex: gameState.currentFruit.index
  });

  setTimeout(() => {
    // Generate new fruit and sync it
    const newFruitIndex = Math.floor(Math.random() * 5);
    socket.emit('generateNewFruit', { 
      roomId, 
      playerNumber: playerNum,
      fruitIndex: newFruitIndex
    });
    addFruitWithIndex(playerNum, newFruitIndex);
    gameState.disableAction = false;
  }, 1000);
}

// Handle mouse movement for fruit positioning
function handleMouseMove(event, playerNum) {
  console.log(`Mouse move on player ${playerNum}, my player is ${myPlayerNumber}`);
  
  // Only allow movement if this is my assigned player
  if (playerNum !== myPlayerNumber) {
    console.log(`Ignoring mouse move - not my player`);
    return;
  }
  
  const gameState = gameStates[`player${playerNum}`];
  if (gameState.disableAction || !gameState.currentBody) {
    console.log(`Cannot move - disabled:${gameState.disableAction}, body:${!!gameState.currentBody}`);
    return;
  }
  
  const canvas = playerNum === 1 ? render1.canvas : render2.canvas;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  
  console.log(`Moving fruit to x:${x} for player ${playerNum}`);
  
  if (x - gameState.currentFruit.radius > 30 && x + gameState.currentFruit.radius < 570) {
    Body.setPosition(gameState.currentBody, {
      x: x,
      y: gameState.currentBody.position.y
    });
    
    // Send position update to server for real-time sync
    socket.emit('fruitMove', { 
      roomId, 
      playerNumber: playerNum,
      x: x,
      y: gameState.currentBody.position.y
    });
  }
}

// Handle clicks for dropping fruit
function handleClick(event, playerNum) {
  console.log(`Click on player ${playerNum}, my player is ${myPlayerNumber}`);
  
  // Only allow dropping if this is my assigned player
  if (playerNum !== myPlayerNumber) {
    console.log(`Ignoring click - not my player`);
    return;
  }
  
  console.log(`Dropping fruit for player ${playerNum}`);
  dropFruit(playerNum);
}

// Set up event listeners - Player 1 always controls left, Player 2 always controls right
function setupEventListeners() {
  console.log(`Setting up event listeners for player ${myPlayerNumber}`);
  
  if (myPlayerNumber === 1) {
    // Player 1 controls the left canvas (render1)
    console.log('Adding event listeners to left canvas for Player 1');
    render1.canvas.addEventListener('mousemove', (e) => handleMouseMove(e, 1));
    render1.canvas.addEventListener('click', (e) => handleClick(e, 1));
  } else if (myPlayerNumber === 2) {
    // Player 2 controls the right canvas (render2)
    console.log('Adding event listeners to right canvas for Player 2');
    render2.canvas.addEventListener('mousemove', (e) => handleMouseMove(e, 2));
    render2.canvas.addEventListener('click', (e) => handleClick(e, 2));
  }
  
  // Test both canvases exist
  console.log('Left canvas exists:', !!render1.canvas);
  console.log('Right canvas exists:', !!render2.canvas);
}

// Collision detection for both games
Events.on(engine1, "collisionStart", (event) => {
  handleCollision(event, 1);
});

Events.on(engine2, "collisionStart", (event) => {
  handleCollision(event, 2);
});

function handleCollision(event, playerNum) {
  const gameState = gameStates[`player${playerNum}`];
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
        newFruit.radius,{
          render: {sprite: {texture: `./public/${newFruit.name}.png`}
        },
          index: index + 1,
        }
      );

      World.add(gameState.world, newBody);

      // Add score for fruit combination
      const combinationScore = FRUIT_SCORES[index + 1] || 0;
      gameState.score += combinationScore;
      
      // Update score display
      if (playerNum === 1) {
        player1Score.textContent = `Player 1: ${gameState.score}`;
      } else {
        player2Score.textContent = `Player 2: ${gameState.score}`;
      }

      // Send score update to server
      socket.emit('updateScore', { 
        roomId, 
        player1Score: gameStates.player1.score,
        player2Score: gameStates.player2.score
      });

      if (collision.bodyA.index === 9 && collision.bodyB.index === 9) {
        gameState.num_suika++;
        // Continue playing even after creating watermelons
      }
    }

        // No game over - fruits can cross the top line without ending the game
    // Players can continue playing indefinitely
  });
}

// Socket.IO event handlers
socket.on('connect', () => {
  connectionStatus.textContent = 'Connected to server';
  connectionStatus.style.backgroundColor = '#4CAF50';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = 'Disconnected from server';
  connectionStatus.style.backgroundColor = '#f44336';
});

socket.on('joinedRoom', (data) => {
  playerNumber = data.playerNumber;
  myPlayerNumber = data.playerNumber; // Set which player I control
  connectionStatus.textContent = `Joined room ${data.roomId} as Player ${data.playerNumber}`;
  connectionStatus.style.backgroundColor = '#2196F3';
  
  console.log(`I am player ${myPlayerNumber}`);
  
  // Set up event listeners immediately when player number is assigned
  setTimeout(() => {
    setupEventListeners();
  }, 100);
  
  // Update UI to show which side I control
  if (myPlayerNumber === 1) {
    document.getElementById('player1-score').style.backgroundColor = '#4CAF50';
    document.getElementById('player1-score').style.color = 'white';
  } else if (myPlayerNumber === 2) {
    document.getElementById('player2-score').style.backgroundColor = '#4CAF50';
    document.getElementById('player2-score').style.color = 'white';
  }
});

socket.on('gameStart', (data) => {
  gameStarted = true;
  connectionStatus.textContent = 'Game started!';
  connectionStatus.style.backgroundColor = '#4CAF50';
  
  console.log(`Game starting, I am player ${myPlayerNumber}`);
  
  // Set up event listeners for my assigned player (with delay to ensure player number is set)
  setTimeout(() => {
    setupEventListeners();
    
    // Each player generates their own fruit
    const myFruitIndex = Math.floor(Math.random() * 5);
    
    // Send my fruit to server for synchronization
    socket.emit('initializeMyFruit', { 
      roomId, 
      playerNumber: myPlayerNumber,
      fruitIndex: myFruitIndex
    });
    
    // Add my fruit locally to my game area
    addFruitWithIndex(myPlayerNumber, myFruitIndex);
  }, 200); // Longer delay to ensure everything is ready
  
  updateTurnIndicator();
});

socket.on('scoreUpdate', (scores) => {
  gameState.player1Score = scores.player1Score || 0;
  gameState.player2Score = scores.player2Score || 0;
  player1Score.textContent = `Player 1: ${gameState.player1Score}`;
  player2Score.textContent = `Player 2: ${gameState.player2Score}`;
});

// Handle opponent fruit movement
socket.on('opponentFruitMove', (data) => {
  // Only update if this is NOT my player
  if (data.playerNumber !== myPlayerNumber) {
    const gameState = gameStates[`player${data.playerNumber}`];
    if (gameState && gameState.currentBody) {
      Body.setPosition(gameState.currentBody, {
        x: data.x,
        y: data.y
      });
    }
  }
});

// Handle opponent fruit drop
socket.on('opponentFruitDropped', (data) => {
  // Only update if this is NOT my player
  if (data.playerNumber !== myPlayerNumber) {
    const gameState = gameStates[`player${data.playerNumber}`];
    if (gameState && gameState.currentBody) {
      gameState.currentBody.isSleeping = false;
      gameState.currentBody.isDropped = true; // Mark as dropped
    }
  }
});

// Handle opponent's initial fruit
socket.on('opponentInitialFruit', (data) => {
  console.log(`Received opponent fruit for player ${data.playerNumber}, index ${data.fruitIndex}`);
  // Add the opponent's fruit to their game area
  addFruitWithIndex(data.playerNumber, data.fruitIndex);
});

// Handle new fruit generation after drops
socket.on('newFruit', (data) => {
  // Only add fruit if this is NOT my player (I already added mine locally)
  if (data.playerNumber !== myPlayerNumber) {
    addFruitWithIndex(data.playerNumber, data.fruitIndex);
  }
});

// Removed game end handler - games continue indefinitely

socket.on('playerLeft', (playerId) => {
  connectionStatus.textContent = 'Opponent left the game';
  connectionStatus.style.backgroundColor = '#f44336';
});

// Join game button handler
joinGameBtn.addEventListener('click', () => {
  roomId = roomIdInput.value || 'room1';
  socket.emit('joinGame', roomId);
});

// Initialize connection status
connectionStatus.textContent = 'Connecting to server...'; 