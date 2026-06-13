import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3001` : 'http://localhost:3001');

// Singleton socket instance to share across components and prevent multiple handshakes
let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_SERVER_URL, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return socket;
};

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const activeSocket = getSocket();

  useEffect(() => {
    const onConnect = () => {
      console.log('Socket connected:', activeSocket.id);
      setIsConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    };

    activeSocket.on('connect', onConnect);
    activeSocket.on('disconnect', onDisconnect);
    activeSocket.on('connect_error', onConnectError);

    // If already connected when hook mounts
    if (activeSocket.connected) {
      setIsConnected(true);
    } else {
      activeSocket.connect();
    }

    return () => {
      activeSocket.off('connect', onConnect);
      activeSocket.off('disconnect', onDisconnect);
      activeSocket.off('connect_error', onConnectError);
    };
  }, [activeSocket]);

  return {
    socket: activeSocket,
    isConnected,
  };
}
export type { Socket };
