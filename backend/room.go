package main

import (
	"log"
	"strings"
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
			trackLocals:  make(map[string]*ownedTrack),
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

type ownedTrack struct {
	track   *webrtc.TrackLocalStaticRTP
	ownerID string
}

type Room struct {
	id           string
	mu           sync.RWMutex
	participants map[string]*Participant
	trackLocals  map[string]*ownedTrack
}

func (r *Room) AddParticipant(p *Participant) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.participants[p.id] = p
	r.logRoomStatus("用户加入")
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
	r.logRoomStatus("用户离开")
}

func (r *Room) AddTrack(t *webrtc.TrackLocalStaticRTP, ownerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.trackLocals[t.ID()] = &ownedTrack{track: t, ownerID: ownerID}

	// Add this track to all participants EXCEPT the owner
	for _, p := range r.participants {
		if p.id == ownerID {
			continue
		}
		if p.peerConnection != nil {
			sender, err := p.peerConnection.AddTrack(t)
			if err != nil {
				log.Println("Error adding track to peer:", err)
			} else {
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

// logRoomStatus 打印房间状态日志（调用方须已持有 r.mu 锁）
func (r *Room) logRoomStatus(event string) {
	userIDs := make([]string, 0, len(r.participants))
	for id := range r.participants {
		userIDs = append(userIDs, id[:8]) // 取 UUID 前 8 位，方便阅读
	}
	log.Printf("[%s] 房间: %s | 人数: %d | 用户: [%s]",
		event, r.id, len(r.participants), strings.Join(userIDs, ", "))
}
