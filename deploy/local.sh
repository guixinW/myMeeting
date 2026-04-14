#!/bin/bash

# 获取项目根目录
ROOT_DIR=$(cd $(dirname $0)/.. && pwd)

echo "==========================================="
echo "🚀 启动 MyMeeting 本地测试开发环境"
echo "==========================================="

# 1. 启动 Go 后端服务
echo "=> 1. 启动 Go 后端服务 (端口 :8080)..."
cd $ROOT_DIR/backend

# 为了能够跨网段或本地正常运行，确保依赖无误
go mod tidy 

# 放入后台运行
go run . &
BACKEND_PID=$!

# 2. 启动前端 Vite 开发服务器
echo "=> 2. 启动 Vite 前端开发服务器..."
cd $ROOT_DIR/frontend

# 智能判断是否需要安装依赖
if [ ! -d "node_modules" ]; then
  echo "   [自动检测] 初次运行，正在执行 npm install..."
  npm install
fi

# 放入后台运行
npm run dev &
FRONTEND_PID=$!

# 3. 进程清理 (捕获 Ctrl+C)
# 这个 trap 保证当你按下 Ctrl+C 退出脚本时，后台的前、后端进程能被干净地杀掉，不会占用端口
trap "echo -e '\n🛑 测试结束，正在停止前、后端服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

echo "==========================================="
echo "✅ 一键测试环境已就绪！"
echo "🌐 视频会议客户端已运行，请在浏览器中打开: http://localhost:5173"
echo "🛑 完成测试后，在此终端按下 [Ctrl+C] 即可安全退出并关闭所有服务。"
echo "==========================================="

# 等待后台进程，防止脚本过早退出
wait
