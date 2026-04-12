import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from 'lucide-react';
import { WebRTCClient } from '../services/webrtc';
import VideoTile from '../components/VideoTile';

interface RoomProps {
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const Room: React.FC<RoomProps> = ({ roomId, userId, onLeave }) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const webrtcClient = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    // Initialize WebRTC connection
    webrtcClient.current = new WebRTCClient(roomId, userId, (stream, sourceUserId) => {
      if (sourceUserId === userId) {
        setLocalStream(stream);
      } else {
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          updated.set(sourceUserId, stream);
          return updated;
        });
      }
    });

    return () => {
      // Cleanup on unmount
      if (webrtcClient.current) {
        webrtcClient.current.leave();
      }
    };
  }, [roomId, userId]);

  const toggleAudio = () => {
    if (webrtcClient.current) {
      const enabled = webrtcClient.current.toggleAudio();
      setAudioEnabled(enabled);
    }
  };

  const toggleVideo = () => {
    if (webrtcClient.current) {
      const enabled = webrtcClient.current.toggleVideo();
      setVideoEnabled(enabled);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert(`Copied Room ID: ${roomId}`);
  };

  return (
    <div className="room-container">
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>MyMeeting</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="glass" style={{ padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.875rem' }}>
            Meeting ID: <strong>{roomId}</strong>
            <button onClick={copyRoomId} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}>
              Copy
            </button>
          </div>
          <div className="glass" style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem 1rem', borderRadius: '20px', alignItems: 'center', fontSize: '0.875rem' }}>
            <Users size={16} /> {remoteStreams.size + 1}
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="video-grid">
        <VideoTile stream={localStream} label="You" muted={true} />
        {Array.from(remoteStreams.entries()).map(([streamUserId, stream]) => (
          <VideoTile key={streamUserId} stream={stream} label={`User ${streamUserId.substring(0, 4)}`} />
        ))}
      </div>

      {/* Controls */}
      <div className="controls-bar">
        <button className={`btn-icon ${!audioEnabled ? 'active' : ''}`} onClick={toggleAudio}>
          {audioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        <button className={`btn-icon ${!videoEnabled ? 'active' : ''}`} onClick={toggleVideo}>
          {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>
        <button className="btn-danger btn" style={{ borderRadius: '40px', padding: '0.75rem 2rem' }} onClick={onLeave}>
          <PhoneOff size={20} /> Leave
        </button>
      </div>
    </div>
  );
};

export default Room;
