import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface MatchResult {
  matchId: string;
  players: string[];
  score: number;
  timestamp: number;
  teamAssignment: { teamId: number; players: string[] }[];
}

interface QueueInfo {
  position: number;
  estimatedTime: number;
  mode: string;
  teamSize: number;
}

interface QueueState {
  mode: string;
  teamSize: number;
  filters: Record<string, unknown>;
  teamMembers?: string[];
}

const SERVER_URL = 'http://localhost:3001';
const STORAGE_KEY = 'matchflow_queue_state';

export function useSocket(userId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null);
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [waitingTime, setWaitingTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  const saveQueueState = useCallback((state: QueueState | null) => {
    if (state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const getQueueState = useCallback((): QueueState | null => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  }, []);

  const sendEvent = useCallback((event: string, data: unknown) => {
    if (socket?.connected) {
      socket.emit(event, data);
    }
  }, [socket]);

  const joinQueue = useCallback((mode: string, teamSize: number, filters: Record<string, unknown> = {}) => {
    saveQueueState({ mode, teamSize, filters });
    sendEvent('join-queue', { userId, mode, teamSize, filters, teamMembers: undefined });
  }, [sendEvent, userId, saveQueueState]);

  const leaveQueue = useCallback(() => {
    saveQueueState(null);
    sendEvent('leave-queue', { userId });
    setQueueInfo(null);
    setWaitingTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [sendEvent, saveQueueState]);

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
      newSocket.emit('authenticate', userId);

      const savedState = getQueueState();
      if (savedState) {
        newSocket.emit('reconnect', { userId });
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('reconnect_attempt', () => {
      reconnectAttempts.current += 1;
    });

    newSocket.on('match-found', (result: MatchResult) => {
      setLastMatch(result);
      saveQueueState(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });

    newSocket.on('queue-update', (data: { position: number; estimatedTime: number }) => {
      setQueueInfo({
        position: data.position,
        estimatedTime: data.estimatedTime,
        mode: getQueueState()?.mode || 'fast',
        teamSize: getQueueState()?.teamSize || 1,
      });
    });

    newSocket.on('waiting-time-update', (data: { time: number }) => {
      setWaitingTime(data.time);
    });

    newSocket.on('session-restored', (data: { mode: string; teamSize: number }) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = window.setInterval(() => {
        setWaitingTime(prev => prev + 1);
      }, 1000);
    });

    setSocket(newSocket);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      newSocket.disconnect();
    };
  }, [userId, getQueueState, saveQueueState]);

  useEffect(() => {
    if (queueInfo) {
      if (!timerRef.current) {
        timerRef.current = window.setInterval(() => {
          setWaitingTime(prev => prev + 1);
        }, 1000);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [queueInfo]);

  return {
    sendEvent,
    isConnected,
    lastMatch,
    queueInfo,
    waitingTime,
    joinQueue,
    leaveQueue,
    setLastMatch,
  };
}