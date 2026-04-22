import { useState, useEffect, useRef } from 'react';

interface TeamAssignment {
  teamId: number;
  players: string[];
}

interface MatchResult {
  matchId: string;
  players: string[];
  score: number;
  timestamp: number;
  teamAssignment: TeamAssignment[];
}

interface MatchNotificationProps {
  match: MatchResult;
  userId: string;
  onAccept: () => void;
  onReject: () => void;
  onPlayAgain: () => void;
  onFeedback?: (rating: number) => void;
}

export function MatchNotification({
  match,
  userId,
  onAccept,
  onReject,
  onPlayAgain,
  onFeedback,
}: MatchNotificationProps) {
  const [showMatchScreen, setShowMatchScreen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp2Xj4JvmXJCf4WIfnKIfXqFenWEf4GAfYN/f4B+f4F+fYN+fYR+fYV+fYWBfYaDfIaFf4eGgYeHgIiGgYiHgYmHgomHhIqHhYyHhoyIiI2IiI6IiI+Jio+JjI+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+JjY+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jic+Jjc+');
    audioRef.current = audio;

    const playSound = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    };

    playSound();
    const interval = setInterval(playSound, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showMatchScreen) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            onAccept();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [showMatchScreen, onAccept]);

  const handleAccept = () => {
    setShowMatchScreen(true);
    onAccept();
  };

  const handleReject = () => {
    onReject();
  };

  const getOpponents = () => {
    const myTeam = match.teamAssignment.find(t => t.players.includes(userId));
    if (!myTeam) return match.players.filter(p => p !== userId);

    const opponentTeam = match.teamAssignment.find(t => t.teamId !== myTeam.teamId);
    return opponentTeam ? opponentTeam.players : [];
  };

  const opponents = getOpponents();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        {!showMatchScreen ? (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-green-600 mb-2">Match Found!</h2>
              <p className="text-gray-600">Get ready to play</p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Match ID</div>
                <div className="font-mono text-sm">{match.matchId}</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-2">Opponents</div>
                <div className="space-y-1">
                  {opponents.map((opponent, i) => (
                    <div key={i} className="font-medium text-gray-800">
                      {opponent}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Match Score</div>
                <div className="text-2xl font-bold text-blue-600">
                  {match.score.toFixed(1)}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-2">Teams</div>
                <div className="grid grid-cols-2 gap-2">
                  {match.teamAssignment.map((team, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">Team {team.teamId + 1}:</span>{' '}
                      {team.players.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleAccept}
                className="w-full py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold"
              >
                Accept Match
              </button>
              <button
                onClick={handleReject}
                className="w-full py-3 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                Reject
              </button>
              <button
                onClick={onPlayAgain}
                className="w-full py-3 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
              >
                Jugar de nuevo
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl font-bold text-green-600 mb-4">{countdown}</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Match Started!</h2>
            <p className="text-gray-600">Good luck!</p>

            <div className="mt-8 space-y-2">
              <button
                onClick={() => onFeedback?.(5)}
                className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Great Match
              </button>
              <button
                onClick={() => onFeedback?.(3)}
                className="w-full py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Fair
              </button>
              <button
                onClick={() => onFeedback?.(1)}
                className="w-full py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}