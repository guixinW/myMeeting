# MyMeeting

一个基于 Go SFU 和 React 的轻量级多人视频会议系统。和两位同学互相检查论文时发现腾讯会议超过两人需要开89块钱一个月的会员，才能够开45分钟以上的会议，于是萌生想法自己用AI编程做一个，服务器+域名成本仅仅90块钱一年。尚未实现分享屏幕功能。

## 功能特性

- **SFU 架构**：基于 Pion WebRTC 实现选择性转发，支持多人音视频通话
- **WebSocket 信令**：通过 Gorilla WebSocket 完成 SDP 交换与 ICE 候选协商
- **Perfect Negotiation**：客户端发起 Offer，服务端作为 Impolite Peer 处理 Glare 冲突
- **延迟下行推流**：新用户完成首次协商后，再推送房间内已有的媒体流，避免 SDP 碰撞
- **音视频控制**：支持麦克风静音/取消静音、摄像头开关
- **一键部署**：提供自动化脚本，支持 Nginx + Let's Encrypt HTTPS 部署

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.26、Pion WebRTC v4、Gorilla WebSocket |
| 前端 | React 19、TypeScript、Vite、Lucide Icons |
| 部署 | Nginx、Systemd、Certbot、UFW |

## 项目结构

```
MyMeeting/
├── backend/
│   ├── main.go          # HTTP 服务入口，监听 :8080
│   ├── signaling.go     # WebSocket 信令处理（join/offer/answer/candidate）
│   ├── sfu.go           # WebRTC PeerConnection 管理与媒体转发
│   └── room.go          # 房间与参会者管理，Track 分发逻辑
├── frontend/
│   └── src/
│       ├── App.tsx              # 应用根组件，Lobby/Room 路由切换
│       ├── pages/Lobby.tsx      # 大厅页面：创建/加入会议
│       ├── pages/Room.tsx       # 会议室页面：视频网格与控制栏
│       ├── components/VideoTile.tsx  # 视频画面组件
│       ├── services/webrtc.ts   # WebRTC 客户端封装
│       ├── index.css            # 全局样式（暗色主题 + 毛玻璃效果）
│       └── main.tsx             # Vite 入口
└── deploy/
    ├── local.sh         # 本地一键启动（前后端同时运行）
    ├── start.sh         # 生产部署脚本
    └── stop.sh          # 服务停止与端口关闭脚本
```

## 本地开发

### 一键启动

```bash
chmod +x deploy/local.sh
./deploy/local.sh
```

脚本会自动启动后端（`:8080`）和前端开发服务器（`:5173`），按 `Ctrl+C` 停止所有服务。

### 手动启动

**后端：**

```bash
cd backend
go run .
```

**前端：**

```bash
cd frontend
npm install
npm run dev
```

浏览器访问 `http://localhost:5173` 进入大厅。

> **注意：** WebRTC 需要 HTTPS 或 `localhost` 才能访问摄像头/麦克风，本地开发请使用 `localhost` 访问。

## 生产部署

### 前置条件

1. Ubuntu/Debian 服务器，具有 SSH 访问权限
2. 已解析到服务器公网 IP 的域名

### 部署步骤

将项目上传至服务器后执行：

```bash
chmod +x deploy/start.sh deploy/stop.sh
sudo ./deploy/start.sh your-domain.com
```

**`start.sh` 会自动完成：**

- 安装系统依赖（Nginx、Certbot、Go、Node.js）
- 配置防火墙（UFW），放行 22、80、443 端口
- 编译 Go 后端，构建 Vite 前端
- 通过 Systemd 注册后端服务（`mymeeting.service`）
- 配置 Nginx 反向代理（静态资源 + WebSocket `/ws`）
- 自动申请 Let's Encrypt TLS 证书

### 停止服务

```bash
sudo ./deploy/stop.sh
```

停止后端服务和 Nginx，关闭 80/443 端口，仅保留 SSH（22）。
