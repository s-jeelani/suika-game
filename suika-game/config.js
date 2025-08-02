// Configuration for server URLs
export const SERVER_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-railway-app-url.railway.app' 
  : 'http://localhost:3000'; 