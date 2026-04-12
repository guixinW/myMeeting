# MyMeeting - WebRTC Video Conferencing

A minimalist, high-performance WebRTC video conferencing system based on Go (SFU) and React.

## Features
- Scalable SFU (Selective Forwarding Unit) architecture
- Multi-party video and audio meetings
- Real-time signaling via WebSocket
- Modern, responsive React UI
- Easy deployment with automated scripts

## Tech Stack
- **Backend:** Go, Pion WebRTC, Gorilla WebSocket
- **Frontend:** React, Vite, TypeScript
- **Deployment:** Nginx, Systemd, UFW (Ubuntu/Debian server recommended)

## Development

### 1. Run Backend
```bash
cd backend
go run main.go
```
*The signaling and SFU server will start on port 8080.*

### 2. Run Frontend
```bash
cd frontend
npm install
npm run dev
```
*Access the development server on `http://localhost:5173`.*

> **Note:** WebRTC requires HTTPS or `localhost` to access local media devices (Camera/Microphone). Make sure you test locally on `localhost`.

---

## Production Deployment

We provide an automated script to fully deploy the project on an Ubuntu/Debian server.

### Prerequisites

1. An Ubuntu/Debian server with SSH access.
2. A Domain Name resolving to your server's public IP.

### Deployment Instructions

1. Upload the entire project directory (`MyMeeting`) to your server.
2. Make the deployment scripts executable:
```bash
chmod +x deploy/start.sh deploy/stop.sh
```

#### Starting the Service
Run the one-click start script and pass your domain name:
```bash
sudo ./deploy/start.sh mymeeting.yourdomain.com
```

**What the start script does:**
- Updates system and installs dependencies (Nginx, Certbot, Go, Node.js).
- Configures Firewall (UFW) to allow ports 22, 80, 443.
- Compiles the Go backend and builds the Vite frontend.
- Sets up backend to run forever via systemd (`mymeeting.service`).
- Configures Nginx to serve the UI and proxy WebSocket requests to port 8080.
- Automatically generates TLS/SSL certificates via Let's Encrypt for WebRTC.

#### Stopping the Service Safely
If you do not need the service running and want to protect your server from port scanners and botnets, run the stop script:
```bash
sudo ./deploy/stop.sh
```

**What the stop script does:**
- Stops the Go backend Service (`systemctl stop mymeeting`).
- Stops Nginx web server.
- Completely shuts down public ports 80 and 443 via Firewall (UFW).
- Retains only port 22 (SSH) so you can still log into the server.
