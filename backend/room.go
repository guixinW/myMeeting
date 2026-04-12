package main

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewRoomManager() *RoomManager {
	return &RoomManager{
		rooms: make(map[string]*Room),
	}
}

func (rm *RoomManager) GetOrCreateRoom(id string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	room, ok := rm.rooms[id]
	if !ok {
		room = &Room{
			id:           id,
			participants: make(map[string]*Participant),
			trackLocals:  make(map[string]*webrtc.TrackLocalStaticRTP),
		}
		rm.rooms[id] = room
	}
	return room
}

type Participant struct {
	id             string
	wsConn         *websocket.Conn
	mu             sync.Mutex
	peerConnection *webrtc.PeerConnection
}

type Room struct {
	id           string
	mu           sync.RWMutex
	participants map[string]*Participant
	trackLocals  map[string]*webrtc.TrackLocalStaticRTP
}

func (r *Room) AddParticipant(p *Participant) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.participants[p.id] = p
}

func (r *Room) RemoveParticipant(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p, ok := r.participants[id]; ok {
		if p.peerConnection != nil {
			p.peerConnection.Close()
		}
		p.mu.Lock()
		p.wsConn.Close()
		p.mu.Unlock()
		delete(r.participants, id)
	}
}

func (r *Room) AddTrack(t *webrtc.TrackLocalStaticRTP) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.trackLocals[t.ID()] = t

	// Add this track to all participants
	for _, p := range r.participants {
		if p.peerConnection != nil {
			sender, err := p.peerConnection.AddTrack(t)
			if err != nil {
				log.Println("Error adding track to peer:", err)
			} else {
				// Read RTCP packets from the sender
				go func() {
					rtcpBuf := make([]byte, 1500)
					for {
						if _, _, rtcpErr := sender.Read(rtcpBuf); rtcpErr != nil {
							return
						}
					}
				}()
			}
		}
	}
}

func (r *Room) RemoveTrack(t *webrtc.TrackLocalStaticRTP) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.trackLocals, t.ID())
}
