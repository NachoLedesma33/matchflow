import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

type GameId = 'lol' | 'valorant' | 'cs2' | 'dota2' | 'apex' | 'overwatch' | 'fortnite' | 'rl' | 'pubg' | 'warzone' | 'genshin' | 'osu';
type MatchMode = 'ranked-solo' | 'ranked-flex' | 'casual' | 'tournament' | 'ranked-duo' | 'aram' | 'urf' | 'comp' | 'unrated' | 'deathmatch' | 'battle-royal' | 'duos' | 'squads' | 'ranked' | 'public';
type TeamSize = 1 | 2 | 3 | 4 | 5;

interface Game {
  id: GameId;
  name: string;
  icon: string;
  queueModes: { id: MatchMode; name: string }[];
  teamSizes: number[];
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
  const [mode, setMode] = useState<MatchMode>('ranked-solo');
  const [teamSize, setTeamSize] = useState<TeamSize>(4);
  const [inQueue, setInQueue] = useState(false);
  const [waitingTime, setWaitingTime] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [messages, setMessages] = useState<{ user: string; text: string; nick?: string }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [clicks, setClicks] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [ratingChange, _setRatingChange] = useState(0);
  const [selectedGame, setSelectedGame] = useState<GameId>('valorant');
  const [userNick, setUserNick] = useState('');
  const [userProfile, _setUserProfile] = useState({
    skillRating: 1500,
    playStyle: 'balanced' as 'aggressive' | 'balanced' | 'defensive',
    preferredRegions: ['us-east'] as string[],
  });
  const timerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const games: Game[] = [
    { id: 'valorant', name: 'Valorant', icon: '🎯', queueModes: [
      { id: 'unrated', name: 'Unrated' }, { id: 'comp', name: 'Competitive' }, { id: 'deathmatch', name: 'Deathmatch' }
    ], teamSizes: [1, 2, 5] },
    { id: 'lol', name: 'League of Legends', icon: '⚔️', queueModes: [
      { id: 'ranked-solo', name: 'Ranked Solo/Duo' }, { id: 'ranked-flex', name: 'Ranked Flex' },
      { id: 'aram', name: 'ARAM' }, { id: 'urf', name: 'URF' }, { id: 'casual', name: 'Normal' }
    ], teamSizes: [1, 2, 3, 4, 5] },
    { id: 'cs2', name: 'Counter-Strike 2', icon: '🔫', queueModes: [
      { id: 'comp', name: 'Competitive' }, { id: 'unrated', name: 'Wingman' },
      { id: 'deathmatch', name: 'Deathmatch' }, { id: 'casual', name: 'Casual' }
    ], teamSizes: [1, 2, 4, 5] },
    { id: 'dota2', name: 'Dota 2', icon: '🛡️', queueModes: [
      { id: 'ranked-solo', name: 'Ranked Solo' }, { id: 'ranked-flex', name: 'Ranked Party' },
      { id: 'casual', name: 'All Pick' }, { id: 'deathmatch', name: 'Deathmatch' }
    ], teamSizes: [1, 2, 4, 5] },
    { id: 'apex', name: 'Apex Legends', icon: '🦅', queueModes: [
      { id: 'ranked', name: 'Ranked' }, { id: 'casual', name: 'Public' },
      { id: 'duos', name: 'Duos' }, { id: 'squads', name: 'Trios' }
    ], teamSizes: [1, 2, 3] },
    { id: 'overwatch', name: 'Overwatch 2', icon: '🦸', queueModes: [
      { id: 'comp', name: 'Competitive' }, { id: 'casual', name: 'Quick Play' },
      { id: 'deathmatch', name: 'Deathmatch' }
    ], teamSizes: [1, 2, 5] },
    { id: 'fortnite', name: 'Fortnite', icon: '🏝️', queueModes: [
      { id: 'battle-royal', name: 'Battle Royale' }, { id: 'duos', name: 'Duos' },
      { id: 'squads', name: 'Squads' }, { id: 'casual', name: 'Creative' }
    ], teamSizes: [1, 2, 3, 4] },
    { id: 'rl', name: 'Rocket League', icon: '🚀', queueModes: [
      { id: 'comp', name: 'Competitive' }, { id: 'casual', name: 'Unranked' },
      { id: 'duos', name: '2v2' }, { id: 'squads', name: '3v3' }
    ], teamSizes: [1, 2, 3] },
    { id: 'pubg', name: 'PUBG', icon: '🪂', queueModes: [
      { id: 'battle-royal', name: 'Matchmaking' }, { id: 'duos', name: 'Duos' },
      { id: 'squads', name: 'Squads' }, { id: 'ranked', name: 'Ranked' }
    ], teamSizes: [1, 2, 3, 4] },
    { id: 'warzone', name: 'Call of Duty Warzone', icon: '⚡', queueModes: [
      { id: 'battle-royal', name: 'Battle Royale' }, { id: 'duos', name: 'Resurgence Duos' },
      { id: 'squads', name: 'Resurgence Quads' }, { id: 'deathmatch', name: 'DMZ' }
    ], teamSizes: [1, 2, 3, 4] },
    { id: 'genshin', name: 'Genshin Impact', icon: '⭐', queueModes: [
      { id: 'casual', name: 'Co-Op' }, { id: 'squads', name: 'Domain' }
    ], teamSizes: [1, 2, 3, 4] },
    { id: 'osu', name: 'osu!', icon: '🍿', queueModes: [
      { id: 'comp', name: 'Ranked' }, { id: 'casual', name: 'Unranked' }
    ], teamSizes: [1] },
  ];

  const currentGame = games.find(g => g.id === selectedGame) || games[0];

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
    const msg = { user: userId, text: newMessage, nick: userNick || userId };
    socket.emit('chat-message', msg);
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handlePlayAgain = () => {
    if (!socket) return;
    socket.emit('feedback', {
      userId,
      matchId: matchResult?.matchId || '',
      rating: 5,
      wouldPlayAgain: true,
      result: 'win',
    });
    setShowMatchModal(false);
    handleJoinQueue();
  };

  const handleSubmitFeedback = (rating: number, result: 'win' | 'loss' | 'draw') => {
    if (!socket || !matchResult) return;
    socket.emit('feedback', {
      userId,
      matchId: matchResult.matchId,
      rating,
      wouldPlayAgain: rating >= 4,
      result,
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
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHelp(true)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Ayuda
            </button>
            <div className="text-sm text-gray-500">ID: {userId}</div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {showHelp && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-blue-800">Welcome to MatchFlow</h2>
              <button onClick={() => setShowHelp(false)} className="text-blue-600 hover:text-blue-800">✕</button>
            </div>
            <p className="text-blue-700 mb-4">
              MatchFlow helps you find teammates for team online games like LoL, Valorant, CS2, Apex, etc.
              Match with players who have similar skill level and playstyle.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">🎮 How to Use</h3>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                  <li>Select your game</li>
                  <li>Enter your in-game username</li>
                  <li>Choose queue mode & team size</li>
                  <li>Find teammates</li>
                </ol>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">💡 Tips</h3>
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>Share your username in chat to add friends</li>
                  <li>Check chat for teammates asking for your game</li>
                  <li>Rating updates after each game</li>
                </ul>
              </div>
            </div>

            <button 
              onClick={() => setShowHelp(false)}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Get Started
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Game Profile</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
              <div className="text-sm text-purple-600 mb-1">Skill Rating</div>
              <div className="text-3xl font-bold text-purple-700">{userProfile.skillRating}</div>
              <div className="text-xs text-purple-500">Glicko-2</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
              <div className="text-sm text-green-600 mb-1">Playstyle</div>
              <div className="text-lg font-medium text-green-700 capitalize">{userProfile.playStyle}</div>
              <div className="text-xs text-green-500">
                {userProfile.playStyle === 'aggressive' ? 'Aggressive play' : 
                 userProfile.playStyle === 'defensive' ? 'Defensive play' : 
                 'Balanced'}
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg">
              <div className="text-sm text-orange-600 mb-1">Region</div>
              <div className="text-lg font-medium text-orange-700">{userProfile.preferredRegions[0]}</div>
              <div className="text-xs text-orange-500">Best ping</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Find Teammates</h2>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Game</label>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game.id)}
                  className={`p-3 rounded-lg text-center border-2 transition-all ${
                    selectedGame === game.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{game.icon}</div>
                  <div className="text-xs font-medium">{game.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Your {currentGame.name} Nick</label>
            <input
              type="text"
              value={userNick}
              onChange={e => setUserNick(e.target.value)}
              placeholder={`Enter your ${currentGame.name} username...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">Share this in chat to add you as friend</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Queue Mode</label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as MatchMode)}
                disabled={inQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              >
                {currentGame.queueModes.map(qm => (
                  <option key={qm.id} value={qm.id}>{qm.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team Size Needed</label>
              <select
                value={teamSize}
                onChange={e => setTeamSize(Number(e.target.value) as TeamSize)}
                disabled={inQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              >
                <option value="1">{currentGame.teamSizes.includes(1) ? '1 player (solo)' : 'N/A'}</option>
                <option value="2">{currentGame.teamSizes.includes(2) ? '2 players (duo)' : 'N/A'}</option>
                <option value="3">{currentGame.teamSizes.includes(3) ? '3 players (trio)' : 'N/A'}</option>
                <option value="4">{currentGame.teamSizes.includes(4) ? '4 players (squad)' : 'N/A'}</option>
                <option value="5">{currentGame.teamSizes.includes(5) ? '5 players (full team)' : 'N/A'}</option>
              </select>
            </div>
          </div>

          {inQueue ? (
            <button
              onClick={handleLeaveQueue}
              className="w-full py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Cancel Queue
            </button>
          ) : (
            <button
              onClick={handleJoinQueue}
              className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              🔍 Find Teammates
            </button>
          )}
        </div>

        {inQueue && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-blue-700 font-medium">Searching...</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-gray-800">{formatTime(waitingTime)}</div>
                <div className="text-sm text-gray-500">Wait time</div>
              </div>
              <div className="bg-white p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-gray-800">{queueSize}</div>
                <div className="text-sm text-gray-500">En cola</div>
              </div>
            </div>
          </div>
        )}

        {!inQueue && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-md">
                <div className="text-2xl font-bold text-gray-800">{formatTime(waitingTime)}</div>
                <div className="text-sm text-gray-500">Last wait time</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-md">
                <div className="text-2xl font-bold text-gray-800">0</div>
                <div className="text-sm text-gray-500">Games played</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Global Chat</h2>
          <p className="text-xs text-gray-500 mb-2">Tip: Share your {currentGame.name} username to add friends!</p>
          <div className="h-48 overflow-y-auto border border-gray-200 rounded-md p-3 mb-3 space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-gray-700">{msg.nick || msg.user}:</span>{' '}
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

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Clicker Game</h2>
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
            <h2 className="text-xl font-bold mb-4">🎮 Match Found!</h2>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="text-center">
                <div className="text-sm text-green-600 mb-1">Your Rating</div>
                <div className="text-3xl font-bold text-green-700">{userProfile.skillRating}</div>
                {ratingChange !== 0 && (
                  <div className={`text-lg font-medium ${ratingChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ratingChange > 0 ? '+' : ''}{ratingChange} points
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              <p className="text-sm text-gray-600"><span className="font-medium">Game Result:</span> How did it go?</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSubmitFeedback(5, 'win')}
                  className="py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                >
                  🏆 Win
                </button>
                <button
                  onClick={() => handleSubmitFeedback(3, 'draw')}
                  className="py-3 bg-gray-400 text-white rounded-md hover:bg-gray-500 font-medium"
                >
                  🤝 Draw
                </button>
                <button
                  onClick={() => handleSubmitFeedback(1, 'loss')}
                  className="py-3 bg-red-500 text-white rounded-md hover:bg-red-600 font-medium"
                >
                  💀 Loss
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handlePlayAgain}
                className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                🎮 Play Again
              </button>
              <button
                onClick={() => {
                  setShowMatchModal(false);
                  setMatchResult(null);
                }}
                className="w-full py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;