const express = require('express')
const path = require('path')
const http = require('http')
const socketIO = require('socket.io')

// 创建Express应用
const app = express()
const server = http.createServer(app)
const io = socketIO(server)

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')))

// 游戏状态
const players = {}
const islands = []
const WORLD_WIDTH = 3000
const WORLD_HEIGHT = 2000
const ISLAND_COUNT = 10

// 生成随机岛屿
function generateIslands() {
  for (let i = 0; i < ISLAND_COUNT; i++) {
    islands.push({
      id: `island-${i}`,
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      radius: 50 + Math.random() * 100,
      type: Math.floor(Math.random() * 3) // 岛屿类型，用于前端显示不同的岛屿图像
    })
  }
}

// 生成岛屿
generateIslands()

// 处理Socket连接
io.on('connection', (socket) => {
  console.log(`玩家连接: ${socket.id}`)

  // 玩家加入游戏
  socket.on('join', (playerId) => {
    // 创建新玩家
    players[socket.id] = {
      id: playerId,
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      rotation: 0,
      speed: 0,
      health: 100,
      lastShot: 0
    }

    // 发送游戏初始状态给新玩家
    socket.emit('gameState', {
      players: players,
      islands: islands,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      selfId: socket.id
    })

    // 通知其他玩家有新玩家加入
    socket.broadcast.emit('playerJoined', {
      id: socket.id,
      player: players[socket.id]
    })
  })

  // 处理玩家移动
  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x
      players[socket.id].y = data.y
      players[socket.id].rotation = data.rotation
      players[socket.id].speed = data.speed

      // 广播玩家移动
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y,
        rotation: data.rotation,
        speed: data.speed
      })
    }
  })

  // 处理玩家射击
  socket.on('playerShoot', (data) => {
    const now = Date.now()
    const player = players[socket.id]

    // 检查射击冷却时间 (1秒)
    if (player && now - player.lastShot > 1000) {
      player.lastShot = now

      // 广播射击事件
      io.emit('playerShot', {
        id: socket.id,
        x: data.x,
        y: data.y,
        targetX: data.targetX,
        targetY: data.targetY
      })
    }
  })

  // 处理玩家受伤
  socket.on('playerHit', (data) => {
    const hitPlayer = players[data.id]
    if (hitPlayer) {
      hitPlayer.health -= data.damage

      // 广播玩家受伤
      io.emit('playerDamaged', {
        id: data.id,
        health: hitPlayer.health
      })

      // 检查玩家是否死亡
      if (hitPlayer.health <= 0) {
        // 广播玩家死亡
        io.emit('playerDied', {
          id: data.id
        })

        // 3秒后重生
        setTimeout(() => {
          if (players[data.id]) {
            players[data.id].health = 100
            players[data.id].x = Math.random() * WORLD_WIDTH
            players[data.id].y = Math.random() * WORLD_HEIGHT

            // 广播玩家重生
            io.emit('playerRespawned', {
              id: data.id,
              x: players[data.id].x,
              y: players[data.id].y,
              health: 100
            })
          }
        }, 3000)
      }
    }
  })

  // 处理碰撞
  socket.on('collision', (data) => {
    // 广播碰撞事件
    io.emit('collisionOccurred', data)
  })

  // 处理玩家断开连接
  socket.on('disconnect', () => {
    console.log(`玩家断开连接: ${socket.id}`)

    // 从游戏中移除玩家
    if (players[socket.id]) {
      delete players[socket.id]

      // 通知其他玩家
      io.emit('playerLeft', {
        id: socket.id
      })
    }
  })
})

// 启动服务器
const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 8080
server.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`)
})