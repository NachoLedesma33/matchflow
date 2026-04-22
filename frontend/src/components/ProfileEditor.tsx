import { useState, useEffect } from 'react';
import axios from 'axios';

interface Weights {
  skillWeight: number;
  personalityWeight: number;
  scheduleWeight: number;
  languageWeight: number;
  proximityWeight: number;
}

interface ProfileEditorProps {
  userId: string;
  onSave?: (profile: unknown) => void;
}

const AVAILABLE_TAGS = ['microphone', 'headset', 'camera', 'streaming', 'competitive', 'casual', 'coach', ' commentator'];

export function ProfileEditor({ userId, onSave }: ProfileEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weights, setWeights] = useState<Weights>({
    skillWeight: 0.7,
    personalityWeight: 0.1,
    scheduleWeight: 0.1,
    languageWeight: 0.05,
    proximityWeight: 0.05,
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [blacklistInput, setBlacklistInput] = useState('');
  const [notificationPrefs, setNotificationPrefs] = useState({
    email: true,
    push: true,
    sound: true,
  });

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/users/${userId}`);
      const profile = response.data;
      
      if (profile.weights) setWeights(profile.weights);
      if (profile.tags) setSelectedTags(profile.tags);
      if (profile.blacklist) setBlacklist(profile.blacklist);
    } catch (error) {
      console.log('Profile not found, using defaults');
    }
  };

  const handleWeightChange = (key: keyof Weights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
      setSelectedTags(prev => [...prev, customTag.trim()]);
      setCustomTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleBlacklistAdd = () => {
    const id = blacklistInput.trim();
    if (id && !blacklist.includes(id)) {
      setBlacklist(prev => [...prev, id]);
      setBlacklistInput('');
    }
  };

  const handleBlacklistRemove = (id: string) => {
    setBlacklist(prev => prev.filter(b => b !== id));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`http://localhost:3001/users/${userId}/weights`, { weights });
      
      await axios.post('http://localhost:3001/notification/preferences', {
        userId,
        ...notificationPrefs,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      onSave?.({
        weights,
        tags: selectedTags,
        blacklist,
        notificationPrefs,
      });
    } catch (error) {
      console.error('Failed to save profile', error);
    } finally {
      setLoading(false);
    }
  };

  const weightLabels: { key: keyof Weights; label: string }[] = [
    { key: 'skillWeight', label: 'Skill' },
    { key: 'personalityWeight', label: 'Personality' },
    { key: 'scheduleWeight', label: 'Schedule' },
    { key: 'languageWeight', label: 'Language' },
    { key: 'proximityWeight', label: 'Proximity' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Match Weights</h2>
        <p className="text-sm text-gray-500 mb-4">
          Adjust how important each factor is for your matches
        </p>
        
        <div className="space-y-4">
          {weightLabels.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">{label}</label>
                <span className="text-sm text-gray-500">
                  {(weights[key] * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights[key]}
                onChange={e => handleWeightChange(key, parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Tags</h2>
        <p className="text-sm text-gray-500 mb-4">
          Select tags that describe you
        </p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {AVAILABLE_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => handleTagToggle(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedTags.includes(tag)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCustomTag()}
            placeholder="Add custom tag..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={handleAddCustomTag}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Add
          </button>
        </div>
        
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 text-blue-500 hover:text-blue-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Blacklist</h2>
        <p className="text-sm text-gray-500 mb-4">
          Block specific users from matching with you
        </p>
        
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={blacklistInput}
            onChange={e => setBlacklistInput(e.target.value)}
            placeholder="Enter user ID..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={handleBlacklistAdd}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Add
          </button>
        </div>
        
        {blacklist.length > 0 && (
          <div className="space-y-2">
            {blacklist.map(id => (
              <div
                key={id}
                className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-md"
              >
                <span className="text-sm font-mono">{id}</span>
                <button
                  onClick={() => handleBlacklistRemove(id)}
                  className="text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Notification Preferences</h2>
        
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notificationPrefs.email}
              onChange={e =>
                setNotificationPrefs(prev => ({ ...prev, email: e.target.checked }))
              }
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-700">Email notifications</span>
          </label>
          
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notificationPrefs.push}
              onChange={e =>
                setNotificationPrefs(prev => ({ ...prev, push: e.target.checked }))
              }
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-700">Push notifications</span>
          </label>
          
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notificationPrefs.sound}
              onChange={e =>
                setNotificationPrefs(prev => ({ ...prev, sound: e.target.checked }))
              }
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-700">Sound alerts</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}