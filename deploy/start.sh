#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "❌ 错误: 缺少域名参数！"
  echo "💡 用法: sudo ./start.sh <你的域名> (例如: sudo ./start.sh mymeeting.exampe.com)"
  exit 1
fi

DOMAIN=$1

echo "==========================================="
echo "🚀 开始部署 MyMeeting 服务: $DOMAIN"
echo "==========================================="

echo "=> 1. 更新系统包并安装基础依赖 (Nginx, Git, UFW, Snapd)..."
sudo apt-get update
sudo apt-get install -y nginx snapd ufw curl git wget

echo "=> 2. 配置服务器防火墙 (UFW)..."
sudo ufw allow 22/tcp  # 允许 SSH
sudo ufw allow 80/tcp  # 允许 HTTP
sudo ufw allow 443/tcp # 允许 HTTPS
sudo ufw --force enable

echo "=> 3. 配置 Golang 运行环境 (若未安装)..."
if ! command -v go &> /dev/null && [ ! -x /usr/local/go/bin/go ]; then
  echo "   正在下载并安装 Go 1.26.1..."
  wget https://go.dev/dl/go1.26.1.linux-amd64.tar.gz -q
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.26.1.linux-amd64.tar.gz
  export PATH=$PATH:/usr/local/go/bin
  echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
  rm go1.26.1.linux-amd64.tar.gz
fi

echo "=> 4. 配置 Node.js 运行环境 (若未安装)..."
if ! command -v npm &> /dev/null; then
  echo "   正在下载并安装 Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 确保在项目根目录运行
ROOT_DIR=$(cd $(dirname $0)/.. && pwd)

echo "=> 5. 编译 Go 后端服务..."
cd $ROOT_DIR/backend
export GOPROXY=https://goproxy.cn,direct
/usr/local/go/bin/go build -o mymeeting-backend .

echo "=> 6. 安装依赖并编译前端 (React + Vite)..."
cd $ROOT_DIR/frontend
npm install
npm run build
cd $ROOT_DIR

echo "=> 7. 配置后端以系统后台服务 (systemd) 运行..."
cat <<EOF | sudo tee /etc/systemd/system/mymeeting.service
[Unit]
Description=MyMeeting WebRTC Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$ROOT_DIR/backend
ExecStart=$ROOT_DIR/backend/mymeeting-backend
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mymeeting

echo "=> 8. 配置 Nginx 网页引擎与 WebSocket 代理..."
cat <<EOF | sudo tee /etc/nginx/sites-available/mymeeting
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        root $ROOT_DIR/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# 激活 Nginx 配置
sudo ln -sf /etc/nginx/sites-available/mymeeting /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo "=> 9. 使用 Certbot 自动申请并配置 HTTPS 证书..."
sudo snap install --classic certbot || true
sudo ln -sf /snap/bin/certbot /usr/bin/certbot || true
# 非交互式申请证书
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email

echo "==========================================="
echo "🎉 部署全部完成！"
echo "🌐 你的视频会议现已上线并开启加密，请访问: https://$DOMAIN"
echo "==========================================="
