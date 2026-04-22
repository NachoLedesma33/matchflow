import { createContext, useContext, ReactNode } from 'react';
import { Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function useSocketContext() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
  socket: Socket | null;
  isConnected: boolean;
}

export function SocketProvider({ children, socket, isConnected }: SocketProviderProps) {
  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}