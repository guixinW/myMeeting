import { useState } from 'react';
import Lobby from './pages/Lobby';
import Room from './pages/Room.tsx'; // refresh
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId] = useState<string>(() => uuidv4());

  const handleJoin = (id: string) => {
    setRoomId(id);
  };

  const handleLeave = () => {
    setRoomId(null);
  };

  return (
    <div className="app-container">
      {!roomId ? (
        <Lobby onJoin={handleJoin} />
      ) : (
        <Room roomId={roomId} userId={userId} onLeave={handleLeave} />
      )}
    </div>
  );
}

export default App;
