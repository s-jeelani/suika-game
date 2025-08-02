# Multiplayer Suika Game

A real-time multiplayer version of the popular Suika (Watermelon Game) with split-screen 1v1 gameplay.

## Features

- **Split-screen multiplayer**: Two players can play simultaneously on the same screen
- **Real-time scoring**: Live score updates for both players
- **Next fruit preview**: See what fruit is coming next for strategic planning
- **Click to drop**: Click anywhere on your game area to drop the fruit
- **Competitive gameplay**: Compete to get the highest score
- **Railway deployment**: Ready for cloud deployment

## Game Controls

- **Mouse movement**: Move the fruit left and right
- **Click**: Drop the fruit
- **Goal**: Combine same fruits to create larger ones and get the highest score

## Setup Instructions

### Prerequisites
- Node.js (version 18 or higher)
- npm

### Local Development

1. **Install server dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server will run on `http://localhost:3000`

3. **Install client dependencies:**
   ```bash
   cd suika-game
   npm install
   ```

4. **Start the client:**
   ```bash
   npm run dev
   ```
   The client will run on `http://localhost:5173`

5. **Join a game:**
   - Open the game in your browser
   - Enter a room ID (default: "room1")
   - Click "Join Game"
   - Wait for another player to join the same room

### Railway Deployment

1. **Deploy the server:**
   ```bash
   cd server
   # Install Railway CLI if you haven't already
   npm install -g @railway/cli
   
   # Login to Railway
   railway login
   
   # Deploy
   railway up
   ```

2. **Update the client configuration:**
   - Get your Railway app URL from the Railway dashboard
   - Update `suika-game/config.js` with your Railway URL:
   ```javascript
   export const SERVER_URL = 'https://your-railway-app-url.railway.app';
   ```

3. **Deploy the client:**
   ```bash
   cd suika-game
   npm run build
   # Deploy the dist folder to your preferred hosting service
   ```

## Game Rules

1. **Fruit Combination**: When two fruits of the same type collide, they combine to form the next larger fruit
2. **Scoring**: Creating larger fruits gives more points, especially watermelons
3. **Game Over**: If fruits reach the top line, the game ends
4. **Victory**: Create 2 watermelons to win
5. **Competition**: The player with the highest score wins

## Technical Details

- **Server**: Node.js with Express and Socket.IO for real-time communication
- **Client**: Vanilla JavaScript with Matter.js physics engine
- **Deployment**: Railway for server hosting
- **Real-time**: WebSocket connections for live game updates

## File Structure

```
suika-game/
├── server/                 # Backend server
│   ├── server.js          # Main server file
│   ├── package.json       # Server dependencies
│   ├── railway.json       # Railway configuration
│   └── public/            # Static files
├── suika-game/            # Frontend client
│   ├── index.html         # Main HTML file
│   ├── multiplayer.js     # Multiplayer game logic
│   ├── fruits.js          # Fruit definitions
│   ├── config.js          # Configuration
│   ├── style.css          # Styling
│   └── public/            # Game assets
└── README.md              # This file
```

## Troubleshooting

- **Connection issues**: Make sure the server is running and the URL in `config.js` is correct
- **Game not starting**: Ensure both players have joined the same room
- **Performance issues**: Close other browser tabs to free up resources

## Contributing

Feel free to submit issues and enhancement requests!
