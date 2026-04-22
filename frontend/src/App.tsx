import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

type MatchMode = 'fast' | 'precise' | 'mixed';
type TeamSize = 1 | 2 | 3;

interface QueueEntry {
  userId: string;
  timestamp: number;
  priorityBonus: number;
  teamMembers?: string[];
}

interface MatchResult {
  matchId: string;
  players: string[];
  score: number;
  timestamp: number;
  teamAssignment: { teamId: number; players: string[] }[];
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
  const [mode, setMode] = useState<MatchMode>('fast');
  const [teamSize, setTeamSize] = useState<TeamSize>(1);
  const [inQueue, setInQueue] = useState(false);
  const [waitingTime, setWaitingTime] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [messages, setMessages] = useState<{ user: string; text: string }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [clicks, setClicks] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const timerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket'],
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      newSocket.emit('authenticate', userId);
      showToast('Connected to server', 'success');
    });

    newSocket.on('match-found', (result: MatchResult) => {
      setMatchResult(result);
      setShowMatchModal(true);
      setInQueue(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      showToast('Match found!', 'success');
    });

    newSocket.on('queue-update', (data: { position: number; estimatedTime: number }) => {
      setQueueSize(data.position);
    });

    newSocket.on('waiting-time-update', (data: { time: number }) => {
      setWaitingTime(data.time);
    });

    newSocket.on('queue-restored', (data: { position: number }) => {
      setInQueue(true);
      setQueueSize(data.position);
      showToast('Queue restored', 'info');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const showToast = (message: string, type: Toast['type']) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleJoinQueue = () => {
    if (!socket) return;
    socket.emit('join-queue', {
      userId,
      mode,
      teamSize,
      filters: {},
      teamMembers: undefined,
    });
    setInQueue(true);
    setWaitingTime(0);
    timerRef.current = window.setInterval(() => {
      setWaitingTime(prev => prev + 1);
    }, 1000);
  };

  const handleLeaveQueue = () => {
    if (!socket) return;
    socket.emit('leave-queue', { userId });
    setInQueue(false);
    setWaitingTime(0);
    setQueueSize(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socket) return;
    const msg = { user: userId, text: newMessage };
    socket.emit('chat-message', msg);
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handlePlayAgain = () => {
    if (!socket) return;
    socket.emit('feedback', {
      matchId: matchResult?.matchId || '',
      rating: 5,
      wouldPlayAgain: true,
    });
    setShowMatchModal(false);
    handleJoinQueue();
  };

  const handleSubmitFeedback = (rating: number) => {
    if (!socket || !matchResult) return;
    socket.emit('feedback', {
      matchId: matchResult.matchId,
      rating,
      wouldPlayAgain: rating >= 4,
    });
    setShowMatchModal(false);
    setMatchResult(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">MatchFlow</h1>
          <div className="text-sm text-gray-500">ID: {userId}</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Join Queue</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as MatchMode)}
                disabled={inQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              >
                <option value="fast">Fast</option>
                <option value="precise">Precise</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team Size</label>
              <select
                value={teamSize}
                onChange={e => setTeamSize(Number(e.target.value) as TeamSize)}
                disabled={inQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              >
                <option value="1">1v1</option>
                <option value="2">2v2</option>
                <option value="3">3v3</option>
              </select>
            </div>
          </div>

          {inQueue ? (
            <button
              onClick={handleLeaveQueue}
              className="w-full py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Leave Queue
            </button>
          ) : (
            <button
              onClick={handleJoinQueue}
              className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Find Match
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-md">
              <div className="text-2xl font-bold text-gray-800">{formatTime(waitingTime)}</div>
              <div className="text-sm text-gray-500">Waiting Time</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-md">
              <div className="text-2xl font-bold text-gray-800">{queueSize}</div>
              <div className="text-sm text-gray-500">In Queue</div>
            </div>
          </div>
        </div>

        {inQueue && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Global Chat</h2>
            <div className="h-48 overflow-y-auto border border-gray-200 rounded-md p-3 mb-3 space-y-2">
              {messages.map((msg, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-gray-700">{msg.user}:</span>{' '}
                  <span className="text-gray-600">{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Send
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Game</h2>
          <button
            onClick={() => setClicks(c => c + 1)}
            className="w-full py-8 text-4xl font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-95 transition-all"
          >
            {clicks}
          </button>
        </div>
      </main>

      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md text-white ${
            toast.type === 'success' ? 'bg-green-500' :
            toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}
        >
          {toast.message}
        </div>
      ))}

      {showMatchModal && matchResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Match Found!</h2>
            <div className="space-y-2 mb-6">
              <p><span className="font-medium">Match ID:</span> {matchResult.matchId}</p>
              <p><span className="font-medium">Score:</span> {matchResult.score.toFixed(1)}</p>
              <p><span className="font-medium">Teams:</span> {matchResult.teamAssignment.length}</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handlePlayAgain}
                className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Play Again
              </button>
              <button
                onClick={() => handleSubmitFeedback(5)}
                className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Great Match
              </button>
              <button
                onClick={() => handleSubmitFeedback(3)}
                className="w-full py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Fair
              </button>
              <button
                onClick={() => handleSubmitFeedback(1)}
                className="w-full py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;