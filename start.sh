#!/bin/bash

echo "=========================================="
echo "   内容审核系统启动脚本"
echo "=========================================="

echo ""
echo "[1/4] 安装后端依赖..."
cd backend
pip install -r requirements.txt -q
echo "后端依赖安装完成"

echo ""
echo "[2/4] 安装前端依赖..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    npm install --silent 2>/dev/null
    echo "前端依赖安装完成"
else
    echo "前端依赖已存在，跳过安装"
fi

echo ""
echo "[3/4] 启动后端服务 (端口: 1111)..."
cd ../backend
if command -v python3 &> /dev/null; then
    python3 main.py &
else
    python main.py &
fi
BACKEND_PID=$!
sleep 3

echo ""
echo "[4/4] 启动前端服务 (端口: 1112)..."
cd ../frontend
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
sleep 3

echo ""
echo "=========================================="
echo "   服务启动完成！"
echo "=========================================="
echo ""
echo "后端API:  http://localhost:1111"
echo "前端界面: http://localhost:1112"
echo "API文档:  http://localhost:1111/docs"
echo ""
echo "后端PID: $BACKEND_PID"
echo "前端PID: $FRONTEND_PID"
echo ""
echo "按 Ctrl+C 停止服务"
echo "=========================================="

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
