#!/bin/bash
set -e

echo "==========================================="
echo "🛑 正在安全关闭 MyMeeting 服务..."
echo "==========================================="

echo "=> 1. 停止 MyMeeting 后台服务 (Go WebSocket Server)..."
sudo systemctl stop mymeeting || true

echo "=> 2. 停止 Nginx 网页服务器 (切断外部 Web 访问)..."
sudo systemctl stop nginx || true

echo "=> 3. 强化防火墙 (UFW): 阻断互联网对 80 (HTTP) 和 443 (HTTPS) 端口的连接请求..."
sudo ufw deny 80/tcp
sudo ufw deny 443/tcp
sudo ufw reload

echo "==========================================="
echo "🛡️ 服务已安全关闭！"
echo "当前服务器已阻止 80 和 443 端口的访问，可有效避免被爬虫扫描和不必要的公网攻击。"
echo "请注意：22端口 (SSH) 仍然开启，您可以正常使用终端管理您的服务器。"
echo "💡 若要重新开放服务，请执行: sudo ./start.sh <您的域名>"
echo "==========================================="
