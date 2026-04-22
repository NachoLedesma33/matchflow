import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import './index.css';
import App from './App';
import { SocketProvider } from './contexts/SocketContext';

const SERVER_URL = 'http://localhost:3001';

function Main() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketProvider socket={socket} isConnected={isConnected}>
      <App />
    </SocketProvider>
  );
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  }
}

if (typeof window !== 'undefined') {
  registerServiceWorker();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Main />
  </StrictMode>,
);