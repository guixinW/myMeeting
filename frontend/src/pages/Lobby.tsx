import React, { useState } from 'react';
import { Video, LogIn } from 'lucide-react';

interface LobbyProps {
  onJoin: (roomId: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [inputRoomId, setInputRoomId] = useState('');

  const createRoom = () => {
    // Generate a random 6-digit room ID
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    onJoin(newRoomId);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRoomId.trim()) {
      onJoin(inputRoomId.trim());
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card glass">
        <h1 className="flex items-center justify-center gap-3">
          <Video className="w-10 h-10 text-accent-color" />
          MyMeeting
        </h1>
        <p>Premium 10-person HD Video Conferences</p>

        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '2rem' }} onClick={createRoom}>
          <Video size={20} /> New Meeting
        </button>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--panel-border)' }}></div>
          <span style={{ padding: '0 1rem', color: 'var(--text-secondary)' }}>or join existing</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--panel-border)' }}></div>
        </div>

        <form onSubmit={joinRoom}>
          <div className="form-group">
            <label>Meeting ID</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. 123456"
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn" style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
            <LogIn size={20} /> Join Meeting
          </button>
        </form>
      </div>
    </div>
  );
};

export default Lobby;
