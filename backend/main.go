package main

import (
	"log"
	"net/http"
)

func main() {
	roomManager := NewRoomManager()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWebSocket(roomManager, w, r)
	})

	log.Println("Signaling and SFU server running on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("failed to start server", err)
	}
}
