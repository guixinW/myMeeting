export interface TrackEvent {
  track: MediaStreamTrack;
  streams: readonly MediaStream[];
  userId: string;
}

export class WebRTCClient {
  private pc: RTCPeerConnection;
  private ws!: WebSocket;
  private roomId: string;
  private userId: string;
  public localStream: MediaStream | null = null;
  private onRemoteTrackCallback: (stream: MediaStream, userId: string) => void;
  private _audioEnabled: boolean = true;
  private _videoEnabled: boolean = true;
  
  private msgQueue: any[] = [];
  private isProcessingQueue: boolean = false;
  private makingOffer: boolean = false;
  
  private wsMessageQueue: Record<string, unknown>[] = [];
  private wsConnected = false;

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

    this.setupPeerConnection();

    // 先启动本地媒体，确保完成摄像头的授权再连接 WebSocket 建立首个闭环。
    this.startLocalMedia().finally(() => {
      this.setupWebSocket();
    });
  }

  private sendMessage(msg: Record<string, unknown>) {
    if (this.ws && this.wsConnected) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.wsMessageQueue.push(msg);
    }
  }

  private setupWebSocket() {
    const isProd = import.meta.env.PROD;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isProd 
      ? `${wsProtocol}//${window.location.host}/ws` 
      : `ws://${window.location.hostname}:8080/ws`;

    this.ws = new WebSocket(wsUrl);
    
    this.ws.onmessage = this.handleSignalingMessage.bind(this);
    
    this.ws.onclose = () => {
      this.wsConnected = false;
      console.log('WebSocket disconnected');
    };

    this.ws.onopen = async () => {
      this.wsConnected = true;
      this.sendMessage({
        type: 'join',
        roomId: this.roomId,
        userId: this.userId,
      });

      // 清缓存内积压的所有发包，如因为 startLocalMedia 加载完毕激发的 Offer
      while (this.wsMessageQueue.length > 0) {
        const queueMsg = this.wsMessageQueue.shift();
        this.ws.send(JSON.stringify(queueMsg!));
      }

      // 如果连摄像头都没，或者拒绝了授权导致没有发包，补发一个空包确保服务端放行
      if (!this.localStream) {
        try {
          const emptyOffer = await this.pc.createOffer();
          await this.pc.setLocalDescription(emptyOffer);
          this.sendMessage({
            type: 'offer',
            sdp: this.pc.localDescription,
          });
        } catch (e) {
          console.error("生成空包失败", e);
        }
      }
    };
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
      if (event.streams && event.streams[0]) {
        console.log(`Received remote stream:`, event.streams[0].id);
        this.onRemoteTrackCallback(event.streams[0], event.streams[0].id);
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        if (this.pc.signalingState !== 'stable') return;
        this.makingOffer = true;
        const offer = await this.pc.createOffer();
        if (this.pc.signalingState !== 'stable') return;
        await this.pc.setLocalDescription(offer);
        this.sendMessage({
          type: 'offer',
          sdp: this.pc.localDescription,
        });
      } catch (err) {
        console.error('Error during negotiation:', err);
      } finally {
        this.makingOffer = false;
      }
    };
  }

  private async processMsgQueue() {
    if (this.isProcessingQueue || this.msgQueue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      while (this.msgQueue.length > 0) {
        const msg = this.msgQueue.shift();
        if (!msg) continue;

        switch (msg.type) {
          case 'offer': {
            const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
            if (offerCollision) {
              await this.pc.setLocalDescription({ type: 'rollback' } as any);
            }

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
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;
          case 'candidate':
            if (msg.candidate) {
              await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(e => console.error("ICE错误:", e));
            }
            break;
          case 'user-left':
            break;
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async handleSignalingMessage(message: MessageEvent) {
    const msg = JSON.parse(message.data);
    this.msgQueue.push(msg);
    this.processMsgQueue();
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
        if (track.kind === 'audio') {
          track.enabled = this._audioEnabled;
        } else if (track.kind === 'video') {
          track.enabled = this._videoEnabled;
        }
        // 回退至稳定单纯的原生绑定行为，摆脱强制方向的越级
        this.pc.addTrack(track, this.localStream!);
      });
      
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
    if (this.ws) {
      this.ws.close();
    }
  }
}
