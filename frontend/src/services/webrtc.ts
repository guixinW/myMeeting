export interface TrackEvent {
  track: MediaStreamTrack;
  streams: readonly MediaStream[];
  userId: string;
}

export class WebRTCClient {
  private pc: RTCPeerConnection;
  private ws: WebSocket;
  private roomId: string;
  private userId: string;
  public localStream: MediaStream | null = null;
  private onRemoteTrackCallback: (stream: MediaStream, userId: string) => void;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private _audioEnabled: boolean = true;
  private _videoEnabled: boolean = true;

  constructor(
    roomId: string,
    userId: string,
    onRemoteTrack: (stream: MediaStream, userId: string) => void
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.onRemoteTrackCallback = onRemoteTrack;

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const isProd = import.meta.env.PROD;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isProd 
      ? `${wsProtocol}//${window.location.host}/ws` 
      : `ws://${window.location.hostname}:8080/ws`;
    this.ws = new WebSocket(wsUrl);

    this.setupPeerConnection();
    this.setupWebSocket();
  }

  private setupPeerConnection() {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendMessage({
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    this.pc.ontrack = (event) => {
      // Stream ID from Go backend maps to the remote User ID
      const stream = event.streams[0];
      const remoteUserId = stream.id;

      if (!this.remoteStreams.has(remoteUserId)) {
        this.remoteStreams.set(remoteUserId, stream);
      }
      this.onRemoteTrackCallback(stream, remoteUserId);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sendMessage({
          type: 'offer',
          sdp: this.pc.localDescription,
        });
      } catch (err) {
        console.error('Error negotiating:', err);
      }
    };
  }

  private setupWebSocket() {
    this.ws.onopen = async () => {
      this.sendMessage({
        type: 'join',
        roomId: this.roomId,
        userId: this.userId,
      });

      // After joining, start local media and add tracks
      await this.startLocalMedia();
    };

    this.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'offer': {
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.sendMessage({
            type: 'answer',
            sdp: this.pc.localDescription,
          });
          break;
        }

        case 'answer':
          if (this.pc.signalingState !== 'stable') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          }
          break;

        case 'candidate':
          if (msg.candidate) {
            await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
          break;

        case 'user-left':
          // The component will handle removing the video element.
          // We could emit an event here to notify UI to remove the stream from state
          break;
      }
    };
  }

  public async startLocalMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: 15 },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.localStream.getTracks().forEach((track) => {
        // Apply the intended initial state
        if (track.kind === 'audio') {
          track.enabled = this._audioEnabled;
        } else if (track.kind === 'video') {
          track.enabled = this._videoEnabled;
        }
        this.pc.addTrack(track, this.localStream!);
      });
      
      // Notify UI local stream is ready
      this.onRemoteTrackCallback(this.localStream, this.userId);

    } catch (err) {
      console.error('Error accessing media devices.', err);
    }
  }

  public toggleAudio() {
    this._audioEnabled = !this._audioEnabled;
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = this._audioEnabled;
        this.sendMessage({ type: this._audioEnabled ? 'unmute' : 'mute' });
      }
    }
    return this._audioEnabled;
  }

  public toggleVideo() {
    this._videoEnabled = !this._videoEnabled;
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = this._videoEnabled;
        this.sendMessage({ type: this._videoEnabled ? 'video-on' : 'video-off' });
      }
    }
    return this._videoEnabled;
  }

  public leave() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }
    this.pc.close();
    this.ws.close();
  }

  private sendMessage(msg: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
