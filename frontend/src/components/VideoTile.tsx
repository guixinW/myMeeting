import React, { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

const VideoTile: React.FC<VideoTileProps> = ({ stream, label, muted = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-wrapper">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="video-label glass">{label}</div>
    </div>
  );
};

export default VideoTile;
