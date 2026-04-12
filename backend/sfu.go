package main

import (
	"log"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

func setupWebRTC(room *Room, p *Participant) {
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Println("NewPeerConnection err:", err)
		return
	}
	p.peerConnection = pc

	pc.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i != nil {
			candidateInit := i.ToJSON()
			notifyParticipant(p, ServerMessage{
				Type:      "candidate",
				Candidate: &candidateInit,
			})
		}
	})

	// NOTE: We intentionally do NOT set OnNegotiationNeeded on the server side.
	// The client is always the sole Offer initiator to prevent SDP glare.

	// Add existing tracks in the room to this participant (skip this participant's own tracks)
	room.mu.RLock()
	needsRenegotiation := false
	for _, ot := range room.trackLocals {
		if ot.ownerID == p.id {
			continue
		}
		sender, err := pc.AddTrack(ot.track)
		if err == nil {
			needsRenegotiation = true
			go func() {
				rtcpBuf := make([]byte, 1500)
				for {
					if _, _, err := sender.Read(rtcpBuf); err != nil {
						return
					}
				}
			}()
		}
	}
	room.mu.RUnlock()

	// If existing tracks were added, tell the client to create a new offer
	if needsRenegotiation {
		notifyParticipant(p, ServerMessage{Type: "renegotiate"})
	}

	// Broadcast tracks sent by this participant to others in the room
	pc.OnTrack(func(remoteTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("Received Track from %s: %s, ID: %s, Kind: %s\n", p.id, remoteTrack.Codec().MimeType, remoteTrack.ID(), remoteTrack.Kind())

		// Send a PLI periodically so the publisher generates keyframes for new viewers
		go func() {
			ticker := time.NewTicker(3 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				if pc.ConnectionState() == webrtc.PeerConnectionStateClosed {
					return
				}
				pc.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(remoteTrack.SSRC())}})
			}
		}()

		// We use StreamID field to pass the user ID, which helps frontend identify the track owner.
		localTrack, err := webrtc.NewTrackLocalStaticRTP(remoteTrack.Codec().RTPCodecCapability, remoteTrack.ID(), p.id)
		if err != nil {
			log.Println("NewTrackLocalStaticRTP error:", err)
			return
		}

		room.AddTrack(localTrack, p.id)

		go func() {
			defer room.RemoveTrack(localTrack)
			rtpBuf := make([]byte, 1400)
			for {
				i, _, readErr := remoteTrack.Read(rtpBuf)
				if readErr != nil {
					return
				}
				if _, writeErr := localTrack.Write(rtpBuf[:i]); writeErr != nil {
					return
				}
			}
		}()
	})
}
