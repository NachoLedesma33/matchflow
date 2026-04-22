import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  userId: string;
  text: string;
  timestamp: number;
}

interface WaitingRoomProps {
  userId: string;
  waitingTime: number;
  queueSize: number;
  onSendMessage?: (message: string) => void;
  socket?: {
    emit: (event: string, data: unknown) => void;
    on: (event: string, callback: (data: unknown) => void) => void;
    off: (event: string, callback: (data: unknown) => void) => void;
  } | null;
}

const CLICKER_STORAGE_KEY = 'matchflow_clicker_score';

export function WaitingRoom({ userId, waitingTime, queueSize, onSendMessage, socket }: WaitingRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [clicks, setClicks] = useState(() => {
    const stored = localStorage.getItem(`${CLICKER_STORAGE_KEY}_${userId}`);
    return stored ? parseInt(stored, 10) : 0;
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleChatMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };

    socket?.on('chat-message', handleChatMessage);

    return () => {
      socket?.off('chat-message', handleChatMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(`${CLICKER_STORAGE_KEY}_${userId}`, clicks.toString());
  }, [clicks, userId]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const msg = {
      userId,
      text: newMessage,
      timestamp: Date.now(),
    };

    socket?.emit('chat-message', msg);
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handleClick = () => {
    setClicks(prev => prev + 1);
  };

  const handleResetClicks = () => {
    setClicks(0);
    localStorage.removeItem(`${CLICKER_STORAGE_KEY}_${userId}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Finding Match...</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-600">{formatTime(waitingTime)}</div>
            <div className="text-sm text-gray-600">Waiting Time</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-3xl font-bold text-green-600">{queueSize}</div>
            <div className="text-sm text-gray-600">In Queue</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Global Chat</h2>
        <div className="h-48 overflow-y-auto border border-gray-200 rounded-md p-3 mb-3 space-y-2">
          {messages.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-gray-700">{msg.userId}:</span>{' '}
                <span className="text-gray-600">{msg.text}</span>
              </div>
            ))
          )}
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Clicker Game</h2>
          <button
            onClick={handleResetClicks}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Reset
          </button>
        </div>
        <button
          onClick={handleClick}
          className="w-full py-8 text-4xl font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-95 transition-all"
        >
          {clicks}
        </button>
        <div className="mt-2 text-center text-sm text-gray-500">
          Tap to pass the time!
        </div>
      </div>
    </div>
  );
}