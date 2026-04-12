package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type ClientMessage struct {
	Type      string                    `json:"type"`
	RoomID    string                    `json:"roomId,omitempty"`
	UserID    string                    `json:"userId,omitempty"`
	SDP       *webrtc.SessionDescription `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit  `json:"candidate,omitempty"`
	TargetID  string                    `json:"targetId,omitempty"`
}

type ServerMessage struct {
	Type      string                    `json:"type"`
	UserID    string                    `json:"userId,omitempty"`
	SDP       *webrtc.SessionDescription `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit  `json:"candidate,omitempty"`
}

func handleWebSocket(rm *RoomManager, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	var currentParticipant *Participant
	var currentRoom *Room

	cleanup := func() {
		if currentRoom != nil && currentParticipant != nil {
			currentRoom.RemoveParticipant(currentParticipant.id)
			notifyOthers(currentRoom, currentParticipant.id, ServerMessage{
				Type:   "user-left",
				UserID: currentParticipant.id,
			})
		}
		conn.Close()
	}
	defer cleanup()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg ClientMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "join":
			currentRoom = rm.GetOrCreateRoom(msg.RoomID)
			currentParticipant = &Participant{
				id:     msg.UserID,
				wsConn: conn,
			}
			currentRoom.AddParticipant(currentParticipant)

			setupWebRTC(currentRoom, currentParticipant)

			notifyOthers(currentRoom, currentParticipant.id, ServerMessage{
				Type:   "user-joined",
				UserID: currentParticipant.id,
			})

		case "offer":
			if currentParticipant != nil && currentParticipant.peerConnection != nil {
				if err := currentParticipant.peerConnection.SetRemoteDescription(*msg.SDP); err != nil {
					log.Println("SetRemoteDescription error (offer):", err)
				}
				answer, err := currentParticipant.peerConnection.CreateAnswer(nil)
				if err != nil {
					log.Println("CreateAnswer error:", err)
					continue
				}
				if err := currentParticipant.peerConnection.SetLocalDescription(answer); err != nil {
					log.Println("SetLocalDescription error (answer):", err)
					continue
				}
				notifyParticipant(currentParticipant, ServerMessage{
					Type: "answer",
					SDP:  &answer,
				})
			}

		case "answer":
			if currentParticipant != nil && currentParticipant.peerConnection != nil {
				if err := currentParticipant.peerConnection.SetRemoteDescription(*msg.SDP); err != nil {
					log.Println("SetRemoteDescription error (answer):", err)
				}
			}

		case "candidate":
			if currentParticipant != nil && currentParticipant.peerConnection != nil {
				if err := currentParticipant.peerConnection.AddICECandidate(*msg.Candidate); err != nil {
					log.Println("AddICECandidate error:", err)
				}
			}

		case "mute", "unmute", "video-off", "video-on":
			notifyOthers(currentRoom, currentParticipant.id, ServerMessage{
				Type:   msg.Type,
				UserID: currentParticipant.id,
			})
		}
	}
}

func notifyOthers(room *Room, excludeID string, msg ServerMessage) {
	room.mu.RLock()
	defer room.mu.RUnlock()
	for id, p := range room.participants {
		if id != excludeID {
			notifyParticipant(p, msg)
		}
	}
}

func notifyParticipant(p *Participant, msg ServerMessage) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.wsConn.WriteJSON(msg)
}
