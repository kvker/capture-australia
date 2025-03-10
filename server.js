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
const disconnectedPlayers = {} // 存储断开连接的玩家信息
const PLAYER_TIMEOUT = 10000 // 玩家超时时间（毫秒）
const HEARTBEAT_INTERVAL = 5000 // 心跳间隔（毫秒）
const HEARTBEAT_TIMEOUT = 15000 // 心跳超时时间（毫秒）

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
    console.log(`玩家加入: ${playerId}, socketId: ${socket.id}`)

    // 检查ID是否已被使用
    if (isPlayerIdInUse(playerId)) {
      // 如果ID已被使用，发送错误消息
      socket.emit('joinError', {
        message: `ID "${playerId}" 已被使用，请选择其他ID`
      })
      return
    }

    // 检查是否是断开连接的玩家重新连接
    const existingPlayerId = findPlayerByName(playerId)
    if (existingPlayerId && disconnectedPlayers[existingPlayerId]) {
      // 清除该玩家的超时清理定时器
      clearTimeout(disconnectedPlayers[existingPlayerId].timeoutId)
      delete disconnectedPlayers[existingPlayerId]

      // 通知所有玩家该玩家已离开（因为将使用新的socket.id）
      io.emit('playerLeft', {
        id: existingPlayerId
      })
    }

    // 创建新玩家
    players[socket.id] = {
      id: playerId,
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      rotation: 0,
      speed: 0,
      health: 100,
      lastShot: 0,
      lastActive: Date.now(), // 记录最后活动时间
      lastHeartbeat: Date.now() // 记录最后心跳时间
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

    // 向所有玩家发送更新的玩家数量
    io.emit('playerCount', {
      count: Object.keys(players).length
    })

    // 打印当前玩家列表
    console.log(`当前玩家列表: ${Object.keys(players).length}个玩家`)
    for (const id in players) {
      console.log(`- ${id}: ${players[id].id}`)
    }
  })

  // 处理玩家移动
  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x
      players[socket.id].y = data.y
      players[socket.id].rotation = data.rotation
      players[socket.id].speed = data.speed
      players[socket.id].lastActive = Date.now() // 更新最后活动时间
      players[socket.id].lastHeartbeat = Date.now() // 更新最后心跳时间

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
      player.lastActive = now // 更新最后活动时间
      player.lastHeartbeat = now // 更新最后心跳时间

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
      hitPlayer.lastActive = Date.now() // 更新最后活动时间

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
            players[data.id].lastActive = Date.now() // 更新最后活动时间

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

    // 如果提供了反弹力，应用到另一个玩家
    if (data.bounceX !== undefined && data.bounceY !== undefined && players[data.id2]) {
      // 更新另一个玩家的位置
      players[data.id2].x += data.bounceX
      players[data.id2].y += data.bounceY
      players[data.id2].lastActive = Date.now() // 更新最后活动时间

      // 确保玩家在世界范围内
      if (players[data.id2].x < 0) players[data.id2].x = 0
      if (players[data.id2].x > WORLD_WIDTH) players[data.id2].x = WORLD_WIDTH
      if (players[data.id2].y < 0) players[data.id2].y = 0
      if (players[data.id2].y > WORLD_HEIGHT) players[data.id2].y = WORLD_HEIGHT

      // 广播位置更新
      io.emit('playerMoved', {
        id: data.id2,
        x: players[data.id2].x,
        y: players[data.id2].y,
        rotation: players[data.id2].rotation,
        speed: players[data.id2].speed
      })
    }
  })

  // 处理玩家信息请求
  socket.on('requestPlayerInfo', (data) => {
    const requestedId = data.id
    if (players[requestedId]) {
      socket.emit('playerInfo', {
        id: requestedId,
        player: players[requestedId]
      })
    }
  })

  // 处理心跳
  socket.on('heartbeat', () => {
    if (players[socket.id]) {
      players[socket.id].lastHeartbeat = Date.now()
    }
  })

  // 处理玩家断开连接
  socket.on('disconnect', () => {
    console.log(`玩家断开连接: ${socket.id}`)

    // 从游戏中移除玩家，但先保存信息
    if (players[socket.id]) {
      // 保存玩家信息的副本，因为稍后会删除原始数据
      const playerInfo = {
        id: players[socket.id].id,
        socketId: socket.id
      };

      // 将玩家添加到断开连接的玩家列表
      disconnectedPlayers[socket.id] = {
        player: players[socket.id],
        disconnectTime: Date.now(),
        timeoutId: setTimeout(() => {
          // 10秒后如果玩家没有重新连接，则彻底移除
          console.log(`玩家超时未重连，彻底移除: ${playerInfo.socketId}, 玩家ID: ${playerInfo.id}`)

          // 通知所有玩家该玩家已离开
          io.emit('playerLeft', {
            id: playerInfo.socketId
          })

          // 从断开连接的玩家列表中移除
          delete disconnectedPlayers[playerInfo.socketId]

          // 向所有玩家发送更新的玩家数量
          io.emit('playerCount', {
            count: Object.keys(players).length
          })

          // 打印当前玩家列表
          console.log(`当前玩家列表: ${Object.keys(players).length}个玩家`)
          for (const id in players) {
            console.log(`- ${id}: ${players[id].id}`)
          }
        }, PLAYER_TIMEOUT)
      }

      // 从活跃玩家列表中移除
      delete players[socket.id]

      // 立即向所有玩家发送更新的玩家数量
      io.emit('playerCount', {
        count: Object.keys(players).length
      })
    }
  })
})

// 发送心跳请求
setInterval(() => {
  io.emit('heartbeatRequest')
}, HEARTBEAT_INTERVAL)

// 检查心跳超时的玩家
setInterval(() => {
  const now = Date.now()
  const timeoutPlayers = [] // 存储要移除的心跳超时玩家ID

  // 首先收集所有心跳超时的玩家ID
  for (const id in players) {
    const player = players[id]
    if (now - player.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      timeoutPlayers.push({
        socketId: id,
        playerId: player.id
      })
    }
  }

  // 然后移除这些心跳超时的玩家
  for (const player of timeoutPlayers) {
    console.log(`玩家心跳超时，移除: ${player.socketId}, 玩家ID: ${player.playerId}`)

    // 通知所有玩家该玩家已离开
    io.emit('playerLeft', {
      id: player.socketId
    })

    // 从玩家列表中移除
    delete players[player.socketId]
  }

  if (timeoutPlayers.length > 0) {
    console.log(`已移除 ${timeoutPlayers.length} 个心跳超时玩家，当前玩家数量: ${Object.keys(players).length}`)

    // 向所有玩家发送更新的玩家数量
    io.emit('playerCount', {
      count: Object.keys(players).length
    })
  }
}, HEARTBEAT_INTERVAL * 2) // 每两个心跳间隔检查一次

// 检查玩家ID是否已被使用
function isPlayerIdInUse(playerId) {
  // 检查活跃玩家
  for (const socketId in players) {
    if (players[socketId].id === playerId) {
      return true
    }
  }

  // 检查断开连接但未超时的玩家
  for (const socketId in disconnectedPlayers) {
    if (disconnectedPlayers[socketId].player.id === playerId) {
      return true
    }
  }

  return false
}

// 查找具有相同名称的玩家
function findPlayerByName(playerId) {
  for (const socketId in players) {
    if (players[socketId].id === playerId) {
      return socketId
    }
  }
  return null
}

// 启动服务器
const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 8080
server.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`)
})