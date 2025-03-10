/**
 * 澳大利亚沿海海战游戏
 * 基于PIXI.js和Socket.IO的多人在线海战游戏
 */

// 游戏常量
const SHIP_ACCELERATION = 0.2
const SHIP_MAX_SPEED = 5
const SHIP_ROTATION_SPEED = 0.05
const SHIP_FRICTION = 0.98
const BULLET_SPEED = 10
const BULLET_DAMAGE = 10
const RECOIL_FORCE = 1
const COLLISION_DAMAGE = 15

// 游戏变量
let app
let socket
let gameStarted = false
let selfId
let selfShip
let ships = {}
let bullets = []
let islands = []
let keys = {}
let worldWidth
let worldHeight
let gameContainer
let worldContainer
let lastShootTime = 0
let shootCooldown = 2000 // 射击冷却时间（毫秒）
let collisionAnimations = [] // 碰撞动画数组
let isMouseDown = false // 鼠标是否按下
let mousePosition = { x: 0, y: 0 } // 鼠标位置
let isAimingMode = false // 是否处于瞄准模式
const BULLET_FLIGHT_TIME = 2 // 炮弹飞行时间（秒）
const EXPLOSION_RADIUS = 20 // 爆炸半径
const EXPLOSION_DURATION = 0.3 // 爆炸持续时间（秒）

// DOM元素
const loginScreen = document.getElementById('loginScreen')
const playerId = document.getElementById('playerId')
const startButton = document.getElementById('startButton')
const gameInfo = document.getElementById('gameInfo')
const healthValue = document.getElementById('healthValue')
const speedValue = document.getElementById('speedValue')
const playerCount = document.getElementById('playerCount')
const positionValue = document.getElementById('positionValue')
const miniMap = document.getElementById('miniMap')
const worldBoundaryInfo = document.getElementById('worldBoundaryInfo')
const worldSizeValue = document.getElementById('worldSizeValue')

// 初始化游戏
function initGame() {
  // 创建PIXI应用
  app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a64a0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
  })

  // 添加到DOM
  document.getElementById('gameContainer').appendChild(app.view)

  // 创建世界容器
  worldContainer = new PIXI.Container()
  app.stage.addChild(worldContainer)

  // 连接到服务器
  socket = io()

  // 设置事件监听
  setupEventListeners()

  // 开始游戏循环
  app.ticker.add(gameLoop)
}

// 设置事件监听
function setupEventListeners() {
  // 自动聚焦输入框
  setTimeout(() => {
    playerId.focus()
  }, 500)

  // 键盘事件
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true

    // 如果在登录界面按下回车键，则开始游戏
    if (e.key === 'Enter' && loginScreen.style.display !== 'none') {
      startGame()
    }
  })

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
  })

  // 鼠标事件
  app.view.addEventListener('mousedown', onMouseDown)
  app.view.addEventListener('mouseup', onMouseUp)
  app.view.addEventListener('mousemove', onMouseMove)

  // 窗口大小调整事件
  window.addEventListener('resize', onResize)

  // 服务器事件
  socket.on('gameState', onGameState)
  socket.on('playerJoined', onPlayerJoined)
  socket.on('playerLeft', onPlayerLeft)
  socket.on('playerMoved', onPlayerMoved)
  socket.on('playerShot', onPlayerShot)
  socket.on('playerDamaged', onPlayerDamaged)
  socket.on('playerDied', onPlayerDied)
  socket.on('playerRespawned', onPlayerRespawned)
  socket.on('collisionOccurred', onCollision)
  socket.on('playerInfo', onPlayerInfo)

  // 开始游戏按钮
  startButton.addEventListener('click', startGame)

  // 输入框回车事件
  playerId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      startGame()
    }
  })

  // 调试信息
  console.log('事件监听器设置完成')
}

// 鼠标按下事件
function onMouseDown(e) {
  if (!gameStarted || !selfShip || selfShip.playerData.health <= 0) return

  // 只处理左键
  if (e.button !== 0) return

  isMouseDown = true
  isAimingMode = true

  // 更新鼠标位置
  updateMousePosition(e)

  // 立即计算并打印鼠标位置和船只位置，用于调试
  console.log("鼠标按下 - 鼠标位置:", mousePosition, "船只位置:", {x: selfShip.x, y: selfShip.y})
}

// 鼠标松开事件
function onMouseUp(e) {
  if (!gameStarted || !selfShip || selfShip.playerData.health <= 0) return

  // 只处理左键
  if (e.button !== 0) return

  // 如果之前是按下状态，则尝试发射炮弹
  if (isMouseDown) {
    fireCannonIfReady()
  }

  isMouseDown = false
  isAimingMode = false
}

// 鼠标移动事件
function onMouseMove(e) {
  if (!gameStarted || !selfShip) return

  // 更新鼠标位置
  updateMousePosition(e)
}

// 更新鼠标位置
function updateMousePosition(e) {
  // 获取鼠标位置（相对于画布）
  const rect = app.view.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // 转换为世界坐标
  mousePosition = {
    x: x - app.screen.width / 2 + selfShip.x,
    y: y - app.screen.height / 2 + selfShip.y
  }

  // 调试输出
  if (isAimingMode) {
    console.log("更新鼠标位置:", mousePosition, "船只位置:", {x: selfShip.x, y: selfShip.y})
  }
}

// 如果冷却完成，发射炮弹
function fireCannonIfReady() {
  const now = Date.now()

  // 检查射击冷却
  if (now - lastShootTime < shootCooldown) {
    // 显示冷却提示
    showCooldownMessage((shootCooldown - (now - lastShootTime)) / 1000)
    return
  }

  // 更新最后射击时间
  lastShootTime = now

  // 计算从船只到鼠标的距离和方向
  const dx = mousePosition.x - selfShip.x
  const dy = mousePosition.y - selfShip.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const angle = selfShip.ship.rotation

  // 计算目标点（使用船只当前朝向和鼠标距离）
  const targetX = selfShip.x + Math.cos(angle) * distance
  const targetY = selfShip.y + Math.sin(angle) * distance

  // 发送射击事件
  socket.emit('playerShoot', {
    x: selfShip.x,
    y: selfShip.y,
    targetX: targetX,
    targetY: targetY
  })

  // 调试输出
  console.log("发射炮弹:", {
    from: {x: selfShip.x, y: selfShip.y},
    to: {x: targetX, y: targetY},
    angle: angle,
    distance: distance,
    cooldown: shootCooldown,
    lastShootTime: lastShootTime
  })
}

// 显示冷却提示
function showCooldownMessage(seconds) {
  // 创建冷却提示文本
  const cooldownText = new PIXI.Text(`炮弹冷却中: ${seconds.toFixed(1)}秒`, {
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xff0000,
    align: 'center'
  })
  cooldownText.anchor.set(0.5)
  cooldownText.x = app.screen.width / 2
  cooldownText.y = app.screen.height - 50
  app.stage.addChild(cooldownText)

  // 1秒后移除
  setTimeout(() => {
    app.stage.removeChild(cooldownText)
  }, 1000)
}

// 开始游戏
function startGame() {
  const id = playerId.value.trim()

  if (id.length === 0) {
    alert('请输入ID')
    return
  }

  // 隐藏登录界面
  loginScreen.style.display = 'none'
  gameInfo.style.display = 'block'
  miniMap.style.display = 'block'
  worldBoundaryInfo.style.display = 'block'

  // 加入游戏
  socket.emit('join', id)

  gameStarted = true
}

// 游戏状态初始化
function onGameState(data) {
  console.log(`收到游戏状态, 玩家数量: ${Object.keys(data.players).length}`)

  // 保存世界尺寸
  worldWidth = data.worldWidth
  worldHeight = data.worldHeight

  // 更新世界大小显示
  worldSizeValue.textContent = `${worldWidth} x ${worldHeight}`

  // 保存自己的ID
  selfId = data.selfId
  console.log(`自己的ID: ${selfId}`)

  // 创建海洋背景
  createOcean()

  // 创建岛屿
  createIslands(data.islands)

  // 创建所有玩家
  for (const id in data.players) {
    console.log(`创建玩家: ${id}, 玩家ID: ${data.players[id].id}`)
    createShip(id, data.players[id])
  }

  // 更新玩家数量
  updatePlayerCount()
  console.log(`当前玩家数量: ${Object.keys(ships).length}`)

  // 初始化小地图
  initMiniMap()
}

// 创建海洋背景
function createOcean() {
  const ocean = new PIXI.Graphics()
  ocean.beginFill(0x0a64a0)
  ocean.drawRect(0, 0, worldWidth, worldHeight)
  ocean.endFill()

  // 添加海洋纹理
  for (let i = 0; i < 100; i++) {
    const wave = new PIXI.Graphics()
    wave.beginFill(0x0a74b0, 0.3)
    wave.drawCircle(
      Math.random() * worldWidth,
      Math.random() * worldHeight,
      10 + Math.random() * 40
    )
    wave.endFill()
    ocean.addChild(wave)
  }

  // 添加世界边界线
  const border = new PIXI.Graphics()
  border.lineStyle(5, 0xFFFFFF, 0.8) // 5像素宽的白色边框，透明度0.8
  border.drawRect(0, 0, worldWidth, worldHeight)

  // 添加边界标记
  // 四个角落添加标记
  const cornerSize = 50

  // 左上角
  border.beginFill(0xFF0000, 0.7)
  border.drawRect(0, 0, cornerSize, cornerSize / 5)
  border.drawRect(0, 0, cornerSize / 5, cornerSize)
  border.endFill()

  // 右上角
  border.beginFill(0xFF0000, 0.7)
  border.drawRect(worldWidth - cornerSize, 0, cornerSize, cornerSize / 5)
  border.drawRect(worldWidth - cornerSize / 5, 0, cornerSize / 5, cornerSize)
  border.endFill()

  // 左下角
  border.beginFill(0xFF0000, 0.7)
  border.drawRect(0, worldHeight - cornerSize / 5, cornerSize, cornerSize / 5)
  border.drawRect(0, worldHeight - cornerSize, cornerSize / 5, cornerSize)
  border.endFill()

  // 右下角
  border.beginFill(0xFF0000, 0.7)
  border.drawRect(worldWidth - cornerSize, worldHeight - cornerSize / 5, cornerSize, cornerSize / 5)
  border.drawRect(worldWidth - cornerSize / 5, worldHeight - cornerSize, cornerSize / 5, cornerSize)
  border.endFill()

  // 添加边界坐标文本
  const textStyle = new PIXI.TextStyle({
    fontFamily: 'Arial',
    fontSize: 16,
    fill: 0xFFFFFF,
    stroke: 0x000000,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowColor: '#000000',
    dropShadowBlur: 4,
    dropShadowAngle: Math.PI / 6,
    dropShadowDistance: 2,
  })

  // 添加四个角落的坐标
  const topLeft = new PIXI.Text('(0, 0)', textStyle)
  topLeft.position.set(10, 10)

  const topRight = new PIXI.Text(`(${worldWidth}, 0)`, textStyle)
  topRight.position.set(worldWidth - 100, 10)

  const bottomLeft = new PIXI.Text(`(0, ${worldHeight})`, textStyle)
  bottomLeft.position.set(10, worldHeight - 30)

  const bottomRight = new PIXI.Text(`(${worldWidth}, ${worldHeight})`, textStyle)
  bottomRight.position.set(worldWidth - 150, worldHeight - 30)

  // 添加边界线和文本到海洋
  ocean.addChild(border)
  ocean.addChild(topLeft)
  ocean.addChild(topRight)
  ocean.addChild(bottomLeft)
  ocean.addChild(bottomRight)

  worldContainer.addChild(ocean)
}

// 创建岛屿
function createIslands(islandData) {
  islands = islandData

  for (const island of islands) {
    const islandGraphic = new PIXI.Graphics()

    // 根据岛屿类型选择颜色
    let color
    switch (island.type) {
      case 0:
        color = 0xc2b280 // 沙滩
        break
      case 1:
        color = 0x228b22 // 森林
        break
      case 2:
        color = 0x808080 // 岩石
        break
      default:
        color = 0xc2b280
    }

    islandGraphic.beginFill(color)
    islandGraphic.drawCircle(0, 0, island.radius)
    islandGraphic.endFill()

    // 添加一些细节
    if (island.type === 0) { // 沙滩
      islandGraphic.beginFill(0xe6c288)
      islandGraphic.drawCircle(0, 0, island.radius * 0.7)
      islandGraphic.endFill()
    } else if (island.type === 1) { // 森林
      // 添加一些树
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2
        const distance = Math.random() * island.radius * 0.7
        const treeX = Math.cos(angle) * distance
        const treeY = Math.sin(angle) * distance

        const tree = new PIXI.Graphics()
        tree.beginFill(0x006400)
        tree.drawCircle(treeX, treeY, 5 + Math.random() * 10)
        tree.endFill()
        islandGraphic.addChild(tree)
      }
    }

    islandGraphic.x = island.x
    islandGraphic.y = island.y
    islandGraphic.island = island

    worldContainer.addChild(islandGraphic)
  }
}

// 创建船只
function createShip(id, playerData) {
  // 创建船只容器
  const shipContainer = new PIXI.Container()
  shipContainer.x = playerData.x
  shipContainer.y = playerData.y

  // 创建船只图形
  const ship = new PIXI.Graphics()

  // 船身
  ship.beginFill(id === selfId ? 0x1a5a83 : 0x83331a)
  ship.moveTo(20, 0)
  ship.lineTo(-10, -10)
  ship.lineTo(-10, 10)
  ship.lineTo(20, 0)
  ship.endFill()

  // 船舱
  ship.beginFill(0xcccccc)
  ship.drawRect(-5, -5, 10, 10)
  ship.endFill()

  // 设置船只旋转
  ship.rotation = playerData.rotation

  // 添加船只到容器
  shipContainer.addChild(ship)
  shipContainer.ship = ship

  // 添加玩家ID文本
  const playerText = new PIXI.Text(playerData.id, {
    fontFamily: 'Arial',
    fontSize: 12,
    fill: 0xffffff,
    align: 'center'
  })
  playerText.anchor.set(0.5)
  playerText.y = -30
  shipContainer.addChild(playerText)

  // 添加血条
  const healthBar = new PIXI.Graphics()
  healthBar.beginFill(0x00ff00)
  healthBar.drawRect(-20, -20, 40, 5)
  healthBar.endFill()
  shipContainer.addChild(healthBar)
  shipContainer.healthBar = healthBar

  // 保存玩家数据
  shipContainer.playerData = playerData

  // 添加到世界
  worldContainer.addChild(shipContainer)

  // 保存到船只列表
  ships[id] = shipContainer

  // 如果是自己的船，设置摄像机跟随
  if (id === selfId) {
    selfShip = shipContainer
    centerCamera()
  }

  return shipContainer
}

// 玩家加入
function onPlayerJoined(data) {
  console.log(`玩家加入: ${data.id}, 玩家ID: ${data.player.id}`)

  // 检查玩家是否已存在
  if (ships[data.id]) {
    console.log(`玩家已存在，更新位置: ${data.id}`)
    ships[data.id].x = data.player.x
    ships[data.id].y = data.player.y
    ships[data.id].ship.rotation = data.player.rotation
    ships[data.id].playerData = data.player
    updateHealthBar(ships[data.id])
  } else {
    console.log(`创建新玩家: ${data.id}`)
    createShip(data.id, data.player)
  }

  updatePlayerCount()
  console.log(`当前玩家数量: ${Object.keys(ships).length}`)
}

// 玩家离开
function onPlayerLeft(data) {
  console.log(`玩家离开: ${data.id}`)

  if (ships[data.id]) {
    worldContainer.removeChild(ships[data.id])
    delete ships[data.id]
    updatePlayerCount()
    console.log(`当前玩家数量: ${Object.keys(ships).length}`)
  }
}

// 玩家移动
function onPlayerMoved(data) {
  console.log(`玩家移动: ${data.id}, 位置: (${Math.round(data.x)}, ${Math.round(data.y)})`)

  if (ships[data.id]) {
    ships[data.id].x = data.x
    ships[data.id].y = data.y
    ships[data.id].ship.rotation = data.rotation
    ships[data.id].playerData.speed = data.speed
  } else {
    console.log(`找不到移动的玩家: ${data.id}，尝试重新创建`)
    // 如果找不到玩家，尝试重新创建
    socket.emit('requestPlayerInfo', { id: data.id })
  }
}

// 玩家射击
function onPlayerShot(data) {
  // 调试输出
  console.log("收到射击事件:", data)

  // 创建子弹
  const bullet = createBullet(data.x, data.y, data.targetX, data.targetY, data.id)

  // 如果是自己射击，添加后坐力
  if (data.id === selfId && selfShip) {
    // 计算后坐力方向（与射击方向相反）
    const angle = Math.atan2(data.targetY - data.y, data.targetX - data.x)
    const recoilX = -Math.cos(angle) * RECOIL_FORCE
    const recoilY = -Math.sin(angle) * RECOIL_FORCE

    // 应用后坐力
    createCollisionAnimation(selfShip, recoilX, recoilY)

    // 屏幕震动效果
    shakeScreen(3)
  }
}

// 创建炮弹
function createBullet(x, y, targetX, targetY, shooterId) {
  // 计算方向
  const angle = Math.atan2(targetY - y, targetX - x)
  const distance = Math.sqrt((targetX - x) * (targetX - x) + (targetY - y) * (targetY - y))

  // 创建炮弹图形
  const bullet = new PIXI.Graphics()
  bullet.beginFill(0xffff00)
  bullet.drawCircle(0, 0, 5)
  bullet.endFill()

  // 设置位置
  bullet.x = x
  bullet.y = y

  // 设置属性
  bullet.shooterId = shooterId
  bullet.damage = BULLET_DAMAGE
  bullet.startX = x
  bullet.startY = y
  bullet.targetX = targetX
  bullet.targetY = targetY
  bullet.distance = distance
  bullet.angle = angle
  bullet.flightTime = 0
  bullet.totalFlightTime = BULLET_FLIGHT_TIME
  bullet.maxHeight = Math.min(distance / 4, 200) // 抛物线最大高度

  // 添加到世界
  worldContainer.addChild(bullet)

  // 添加到子弹列表
  bullets.push(bullet)

  return bullet
}

// 玩家受伤
function onPlayerDamaged(data) {
  if (ships[data.id]) {
    ships[data.id].playerData.health = data.health
    updateHealthBar(ships[data.id])

    // 如果是自己，更新血量显示
    if (data.id === selfId) {
      healthValue.textContent = data.health

      // 屏幕震动效果
      shakeScreen(5)
    }
  }
}

// 更新血条
function updateHealthBar(ship) {
  const health = ship.playerData.health
  const maxHealth = 100
  const width = 40 * (health / maxHealth)

  ship.healthBar.clear()

  // 根据血量变色
  let color
  if (health > 70) {
    color = 0x00ff00 // 绿色
  } else if (health > 30) {
    color = 0xffff00 // 黄色
  } else {
    color = 0xff0000 // 红色
  }

  ship.healthBar.beginFill(color)
  ship.healthBar.drawRect(-20, -20, width, 5)
  ship.healthBar.endFill()
}

// 玩家死亡
function onPlayerDied(data) {
  if (ships[data.id]) {
    // 添加爆炸效果
    createExplosion(ships[data.id].x, ships[data.id].y)

    // 设置透明度
    ships[data.id].alpha = 0.5

    // 如果是自己，显示死亡信息和倒计时
    if (data.id === selfId) {
      // 创建死亡提示容器
      const deathContainer = new PIXI.Container()
      deathContainer.x = app.screen.width / 2
      deathContainer.y = app.screen.height / 2
      app.stage.addChild(deathContainer)

      // 创建背景
      const background = new PIXI.Graphics()
      background.beginFill(0x000000, 0.7)
      background.drawRoundedRect(-150, -60, 300, 120, 10)
      background.endFill()
      deathContainer.addChild(background)

      // 创建死亡文本
      const deathText = new PIXI.Text('你已阵亡', {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xff0000,
        align: 'center',
        fontWeight: 'bold'
      })
      deathText.anchor.set(0.5, 0.5)
      deathText.y = -25
      deathContainer.addChild(deathText)

      // 创建倒计时文本
      const countdownText = new PIXI.Text('3', {
        fontFamily: 'Arial',
        fontSize: 36,
        fill: 0xffffff,
        align: 'center',
        fontWeight: 'bold'
      })
      countdownText.anchor.set(0.5, 0.5)
      countdownText.y = 20
      deathContainer.addChild(countdownText)

      // 开始倒计时
      let countdown = 3
      const countdownInterval = setInterval(() => {
        countdown--
        if (countdown <= 0) {
          clearInterval(countdownInterval)
          countdownText.text = '重生中...'
        } else {
          countdownText.text = countdown.toString()
        }
      }, 1000)

      // 3秒后移除文本
      setTimeout(() => {
        app.stage.removeChild(deathContainer)
      }, 3000)

      // 屏幕震动效果
      shakeScreen(10)
    }
  }
}

// 创建爆炸效果
function createExplosion(x, y) {
  // 创建爆炸图形
  const explosion = new PIXI.Graphics()
  explosion.x = x
  explosion.y = y

  // 添加到世界
  worldContainer.addChild(explosion)

  // 爆炸动画
  let radius = 5
  let alpha = 1

  function animateExplosion() {
    explosion.clear()
    explosion.beginFill(0xff7700, alpha)
    explosion.drawCircle(0, 0, radius)
    explosion.endFill()

    radius += 3
    alpha -= 0.05

    if (alpha <= 0) {
      worldContainer.removeChild(explosion)
      return
    }

    requestAnimationFrame(animateExplosion)
  }

  animateExplosion()
}

// 玩家重生
function onPlayerRespawned(data) {
  if (ships[data.id]) {
    ships[data.id].x = data.x
    ships[data.id].y = data.y
    ships[data.id].alpha = 1
    ships[data.id].playerData.health = data.health
    updateHealthBar(ships[data.id])

    // 如果是自己，更新血量显示
    if (data.id === selfId) {
      healthValue.textContent = data.health
    }
  }
}

// 碰撞事件
function onCollision(data) {
  // 如果是自己，添加屏幕震动
  if (data.id1 === selfId || data.id2 === selfId) {
    // 震动强度基于船只速度，而不是伤害
    shakeScreen(5)

    // 如果是其他玩家碰撞了自己，应用反弹力
    if (data.id1 !== selfId && ships[data.id1]) {
      // 创建碰撞动画，而不是直接应用反弹力
      createCollisionAnimation(ships[data.id1], data.bounceX, data.bounceY)
    }

    // 如果自己碰撞了其他玩家，确保对方也有动画
    if (data.id2 !== selfId && ships[data.id2]) {
      // 创建碰撞动画，应用反弹力
      createCollisionAnimation(ships[data.id2], data.bounceX, data.bounceY)
    }
  } else {
    // 如果是其他玩家之间的碰撞，也应用动画效果
    if (ships[data.id1]) {
      createCollisionAnimation(ships[data.id1], data.bounceX, data.bounceY)
    }
    if (ships[data.id2]) {
      createCollisionAnimation(ships[data.id2], -data.bounceX, -data.bounceY)
    }
  }
}

// 屏幕震动效果
function shakeScreen(intensity) {
  const originalX = worldContainer.x
  const originalY = worldContainer.y

  let shakeCount = 0
  const maxShakes = 5

  function shake() {
    if (shakeCount >= maxShakes) {
      worldContainer.x = originalX
      worldContainer.y = originalY
      return
    }

    worldContainer.x = originalX + (Math.random() - 0.5) * intensity * 2
    worldContainer.y = originalY + (Math.random() - 0.5) * intensity * 2

    shakeCount++
    requestAnimationFrame(shake)
  }

  shake()
}

// 窗口大小调整
function onResize() {
  app.renderer.resize(window.innerWidth, window.innerHeight)

  if (selfShip) {
    centerCamera()
  }
}

// 居中摄像机
function centerCamera() {
  worldContainer.x = app.screen.width / 2 - selfShip.x
  worldContainer.y = app.screen.height / 2 - selfShip.y
}

// 更新玩家数量
function updatePlayerCount() {
  const count = Object.keys(ships).length
  playerCount.textContent = count
}

// 初始化小地图
function initMiniMap() {
  // 创建小地图画布
  const miniMapCanvas = document.createElement('canvas')
  miniMapCanvas.width = 150
  miniMapCanvas.height = 100
  miniMap.appendChild(miniMapCanvas)

  // 获取绘图上下文
  const ctx = miniMapCanvas.getContext('2d')

  // 绘制小地图背景
  ctx.fillStyle = '#0a64a0'
  ctx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height)

  // 绘制边界
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, miniMapCanvas.width, miniMapCanvas.height)

  // 保存小地图上下文
  miniMap.ctx = ctx
  miniMap.canvas = miniMapCanvas

  // 计算缩放比例
  miniMap.scaleX = miniMapCanvas.width / worldWidth
  miniMap.scaleY = miniMapCanvas.height / worldHeight
}

// 更新小地图
function updateMiniMap() {
  if (!miniMap.ctx || !selfShip) return

  const ctx = miniMap.ctx
  const canvas = miniMap.canvas

  // 清除小地图
  ctx.fillStyle = '#0a64a0'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 绘制边界
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, canvas.width, canvas.height)

  // 绘制岛屿
  ctx.fillStyle = '#c2b280'
  for (const island of islands) {
    const x = island.x * miniMap.scaleX
    const y = island.y * miniMap.scaleY
    const radius = island.radius * miniMap.scaleX * 0.5

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制其他船只
  ctx.fillStyle = '#83331a'
  for (const id in ships) {
    if (id === selfId) continue

    const ship = ships[id]
    const x = ship.x * miniMap.scaleX
    const y = ship.y * miniMap.scaleY

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制自己的船只
  if (selfShip) {
    const x = selfShip.x * miniMap.scaleX
    const y = selfShip.y * miniMap.scaleY

    ctx.fillStyle = '#1a5a83'
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()

    // 绘制视野范围
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const viewRadius = (app.screen.width / 2) * miniMap.scaleX
    ctx.arc(x, y, viewRadius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// 游戏主循环
function gameLoop(delta) {
  if (!gameStarted || !selfShip) return

  // 处理玩家输入
  handleInput(delta)

  // 更新所有子弹
  updateBullets(delta)

  // 更新碰撞动画
  updateCollisionAnimations(delta)

  // 检测碰撞
  checkCollisions()

  // 更新摄像机
  centerCamera()

  // 确保船只在世界范围内
  keepInWorld()

  // 更新小地图
  updateMiniMap()

  // 绘制瞄准线
  drawAimingLine()
}

// 处理玩家输入
function handleInput(delta) {
  if (!selfShip || selfShip.playerData.health <= 0) return

  let rotation = selfShip.ship.rotation
  let speed = selfShip.playerData.speed

  // 如果在瞄准模式，根据鼠标位置计算旋转
  if (isAimingMode) {
    // 计算从船只到鼠标的角度
    const dx = mousePosition.x - selfShip.x
    const dy = mousePosition.y - selfShip.y
    const targetRotation = Math.atan2(dy, dx)

    // 调试输出
    console.log("瞄准计算 - 目标角度:", targetRotation, "当前角度:", rotation, "差值:", targetRotation - rotation)

    // 计算最短旋转方向
    let rotationDiff = targetRotation - rotation

    // 确保差值在 -PI 到 PI 之间
    while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2
    while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2

    // 使用正常的旋转速度
    const rotationSpeed = SHIP_ROTATION_SPEED

    // 如果差值很小，直接设置为目标角度
    if (Math.abs(rotationDiff) < rotationSpeed * delta) {
      rotation = targetRotation
    } else {
      // 否则按正常速度旋转
      rotation += Math.sign(rotationDiff) * rotationSpeed * delta
    }

    // 强制更新船只朝向
    selfShip.ship.rotation = rotation
  } else {
    // 正常旋转控制
    if (keys['a'] || keys['arrowleft']) {
      rotation -= SHIP_ROTATION_SPEED * delta
    }

    if (keys['d'] || keys['arrowright']) {
      rotation += SHIP_ROTATION_SPEED * delta
    }
  }

  // 速度控制
  if (keys['w'] || keys['arrowup']) {
    speed += SHIP_ACCELERATION * delta
    if (speed > SHIP_MAX_SPEED) {
      speed = SHIP_MAX_SPEED
    }
  } else if (keys['s'] || keys['arrowdown']) {
    speed -= SHIP_ACCELERATION * delta
    if (speed < -SHIP_MAX_SPEED / 2) {
      speed = -SHIP_MAX_SPEED / 2
    }
  } else {
    // 摩擦力减速
    speed *= SHIP_FRICTION
  }

  // 更新位置
  const vx = Math.cos(rotation) * speed
  const vy = Math.sin(rotation) * speed

  selfShip.x += vx
  selfShip.y += vy
  selfShip.ship.rotation = rotation
  selfShip.playerData.speed = speed
  selfShip.playerData.x = selfShip.x
  selfShip.playerData.y = selfShip.y
  selfShip.playerData.rotation = rotation

  // 更新速度显示
  speedValue.textContent = Math.abs(Math.round(speed * 10)) / 10

  // 更新坐标显示
  positionValue.textContent = `(${Math.round(selfShip.x)}, ${Math.round(selfShip.y)})`

  // 发送位置更新
  socket.emit('playerMove', {
    x: selfShip.x,
    y: selfShip.y,
    rotation: rotation,
    speed: speed
  })
}

// 更新所有子弹
function updateBullets(delta) {
  // 调试输出子弹数量
  if (bullets.length > 0) {
    console.log("当前子弹数量:", bullets.length)
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i]

    // 更新飞行时间
    bullet.flightTime += delta / 60

    // 计算飞行进度 (0-1)
    const progress = Math.min(bullet.flightTime / bullet.totalFlightTime, 1)

    // 如果飞行结束
    if (progress >= 1) {
      // 创建落水爆炸效果
      createWaterExplosion(bullet.x, bullet.y)

      // 移除子弹
      worldContainer.removeChild(bullet)
      bullets.splice(i, 1)

      // 调试输出
      console.log("子弹到达目标，创建爆炸效果")
      continue
    }

    // 计算抛物线轨迹
    // 使用二次贝塞尔曲线: P = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    // 其中P₀是起点，P₂是终点，P₁是控制点（抛物线最高点）

    // 计算控制点（在起点和终点之间，但高度更高）
    const controlX = (bullet.startX + bullet.targetX) / 2
    const controlY = (bullet.startY + bullet.targetY) / 2 - bullet.maxHeight

    // 计算当前位置
    const t = progress
    const mt = 1 - t
    bullet.x = mt * mt * bullet.startX + 2 * mt * t * controlX + t * t * bullet.targetX
    bullet.y = mt * mt * bullet.startY + 2 * mt * t * controlY + t * t * bullet.targetY

    // 计算当前大小（先变大再变小）
    // 在飞行中点时达到最大尺寸
    const sizeProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2
    const baseSize = 5
    const maxSizeMultiplier = 2
    const currentSize = baseSize * (1 + sizeProgress * (maxSizeMultiplier - 1))

    // 更新炮弹大小
    bullet.clear()
    bullet.beginFill(0xffff00)
    bullet.drawCircle(0, 0, currentSize)
    bullet.endFill()

    // 添加尾迹效果
    createBulletTrail(bullet.x, bullet.y, currentSize * 0.7)
  }
}

// 创建炮弹尾迹
function createBulletTrail(x, y, size) {
  const trail = new PIXI.Graphics()
  trail.beginFill(0xff8800, 0.7)
  trail.drawCircle(0, 0, size)
  trail.endFill()

  trail.x = x
  trail.y = y
  trail.alpha = 0.7

  worldContainer.addChild(trail)

  // 淡出并移除
  const fadeOut = () => {
    trail.alpha -= 0.1
    trail.scale.x *= 0.9
    trail.scale.y *= 0.9

    if (trail.alpha <= 0.1) {
      worldContainer.removeChild(trail)
      return
    }

    requestAnimationFrame(fadeOut)
  }

  fadeOut()
}

// 检测碰撞
function checkCollisions() {
  // 子弹与船只碰撞
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i]

    // 检查与所有船只的碰撞
    for (const id in ships) {
      const ship = ships[id]

      // 不检查自己发射的子弹与自己的碰撞
      if (bullet.shooterId === id) continue

      // 简单的圆形碰撞检测
      const dx = bullet.x - ship.x
      const dy = bullet.y - ship.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 20) { // 船只半径约为20
        // 发送击中事件
        socket.emit('playerHit', {
          id: id,
          damage: bullet.damage
        })

        // 创建爆炸效果（在船只位置）
        createWaterExplosion(bullet.x, bullet.y)

        // 移除子弹
        worldContainer.removeChild(bullet)
        bullets.splice(i, 1)

        break
      }
    }
  }

  // 船只与船只碰撞
  if (selfShip && selfShip.playerData.health > 0) {
    const now = Date.now();

    for (const id in ships) {
      // 不检查与自己的碰撞
      if (id === selfId) continue

      const otherShip = ships[id]

      // 跳过已经死亡的船只
      if (otherShip.playerData.health <= 0) continue

      // 简单的圆形碰撞检测
      const dx = selfShip.x - otherShip.x
      const dy = selfShip.y - otherShip.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 40) { // 两艘船的半径和
        // 计算碰撞方向
        const angle = Math.atan2(dy, dx)

        // 计算碰撞后的反弹力度（基于速度）
        const selfSpeed = Math.abs(selfShip.playerData.speed)
        const otherSpeed = Math.abs(otherShip.playerData.speed)
        const totalSpeed = selfSpeed + otherSpeed
        const bounceForce = Math.min(totalSpeed * 2, 10) * 5 // 反弹力乘以5

        // 计算碰撞后的反弹
        const bounceX = Math.cos(angle) * bounceForce
        const bounceY = Math.sin(angle) * bounceForce

        // 创建碰撞动画，而不是直接应用反弹力
        createCollisionAnimation(selfShip, bounceX, bounceY)

        // 减少自己的速度
        selfShip.playerData.speed *= 0.5

        // 检查碰撞冷却
        if (!selfShip.collisionCooldowns) {
          selfShip.collisionCooldowns = {};
        }

        // 对每个船只单独设置冷却
        if (!selfShip.collisionCooldowns[id] || now - selfShip.collisionCooldowns[id] > 1000) {
          selfShip.collisionCooldowns[id] = now;

          // 发送碰撞事件，但不造成伤害
          socket.emit('collision', {
            id1: selfId,
            id2: id,
            damage: 0, // 不造成伤害
            bounceX: -bounceX, // 对方的反弹方向相反
            bounceY: -bounceY
          })

          // 屏幕震动效果
          shakeScreen(Math.min(totalSpeed, 7))
        } else {
          // 即使在冷却中，也应用反弹效果
          socket.emit('collision', {
            id1: selfId,
            id2: id,
            damage: 0, // 不造成伤害
            bounceX: -bounceX, // 对方的反弹方向相反
            bounceY: -bounceY
          })
        }
      }
    }
  }

  // 船只与岛屿碰撞
  if (selfShip && selfShip.playerData.health > 0) {
    const now = Date.now();

    for (const island of islands) {
      const dx = selfShip.x - island.x
      const dy = selfShip.y - island.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < island.radius + 20) { // 岛屿半径 + 船只半径
        // 计算碰撞方向
        const angle = Math.atan2(dy, dx)

        // 计算碰撞后的反弹力度（基于速度）
        const speed = Math.abs(selfShip.playerData.speed)
        const bounceForce = Math.min(speed * 2, 8) * 5 // 反弹力乘以5

        // 计算碰撞后的反弹
        const bounceX = Math.cos(angle) * bounceForce
        const bounceY = Math.sin(angle) * bounceForce

        // 创建碰撞动画，而不是直接应用反弹力
        createCollisionAnimation(selfShip, bounceX, bounceY)

        // 减少速度
        selfShip.playerData.speed *= 0.3

        // 屏幕震动效果，但不造成伤害
        if (speed > 2) {
          shakeScreen(Math.min(speed, 5))
        }
      }
    }
  }
}

// 创建小爆炸效果
function createSmallExplosion(x, y) {
  // 创建爆炸图形
  const explosion = new PIXI.Graphics()
  explosion.x = x
  explosion.y = y

  // 添加到世界
  worldContainer.addChild(explosion)

  // 爆炸动画
  let radius = 2
  let alpha = 1

  function animateExplosion() {
    explosion.clear()
    explosion.beginFill(0xffff00, alpha)
    explosion.drawCircle(0, 0, radius)
    explosion.endFill()

    radius += 1
    alpha -= 0.1

    if (alpha <= 0) {
      worldContainer.removeChild(explosion)
      return
    }

    requestAnimationFrame(animateExplosion)
  }

  animateExplosion()
}

// 确保船只在世界范围内
function keepInWorld() {
  if (!selfShip) return

  let needsAdjustment = false
  let adjustedX = selfShip.x
  let adjustedY = selfShip.y

  // 检查世界边界
  if (selfShip.x < 0) {
    adjustedX = 0
    needsAdjustment = true
  }
  if (selfShip.x > worldWidth) {
    adjustedX = worldWidth
    needsAdjustment = true
  }
  if (selfShip.y < 0) {
    adjustedY = 0
    needsAdjustment = true
  }
  if (selfShip.y > worldHeight) {
    adjustedY = worldHeight
    needsAdjustment = true
  }

  // 检查是否在岛屿内部
  for (const island of islands) {
    const dx = selfShip.x - island.x
    const dy = selfShip.y - island.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // 如果在岛屿内部
    if (distance < island.radius + 20) { // 船只半径约为20
      needsAdjustment = true

      // 计算从岛屿中心到船只的方向
      const angle = Math.atan2(dy, dx)

      // 计算岛屿边缘的位置（岛屿半径 + 船只半径 + 5像素的安全距离）
      const safeDistance = island.radius + 25
      adjustedX = island.x + Math.cos(angle) * safeDistance
      adjustedY = island.y + Math.sin(angle) * safeDistance

      break
    }
  }

  // 如果需要调整位置
  if (needsAdjustment) {
    // 使用动画移动到调整后的位置
    createCollisionAnimation(selfShip, adjustedX - selfShip.x, adjustedY - selfShip.y)

    // 减少速度
    selfShip.playerData.speed *= 0.3
  }
}

// 处理玩家信息
function onPlayerInfo(data) {
  console.log(`收到玩家信息: ${data.id}`)
  if (!ships[data.id]) {
    createShip(data.id, data.player)
    updatePlayerCount()
  }
}

// 创建碰撞动画
function createCollisionAnimation(ship, bounceX, bounceY) {
  // 计算目标位置
  const targetX = ship.x + bounceX
  const targetY = ship.y + bounceY

  // 检查目标位置是否在岛屿内部
  let isInsideIsland = false
  let adjustedPosition = { x: targetX, y: targetY }

  // 检查所有岛屿
  for (const island of islands) {
    const dx = targetX - island.x
    const dy = targetY - island.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // 如果目标位置在岛屿内部
    if (distance < island.radius + 20) { // 船只半径约为20
      isInsideIsland = true

      // 计算从岛屿中心到船只的方向
      const angle = Math.atan2(dy, dx)

      // 计算岛屿边缘的位置（岛屿半径 + 船只半径 + 5像素的安全距离）
      const safeDistance = island.radius + 25
      adjustedPosition.x = island.x + Math.cos(angle) * safeDistance
      adjustedPosition.y = island.y + Math.sin(angle) * safeDistance

      break
    }
  }

  // 创建动画对象
  const animation = {
    ship: ship,
    startX: ship.x,
    startY: ship.y,
    targetX: isInsideIsland ? adjustedPosition.x : targetX,
    targetY: isInsideIsland ? adjustedPosition.y : targetY,
    progress: 0,
    duration: 0.1, // 动画持续时间（秒）
    easing: t => {
      // 缓动函数：先快后慢
      return 1 - Math.pow(1 - t, 3)
    }
  }

  // 添加到动画数组
  collisionAnimations.push(animation)
}

// 更新碰撞动画
function updateCollisionAnimations(delta) {
  // 计算每帧的时间增量（秒）
  const timeIncrement = delta / 60

  // 更新所有动画
  for (let i = collisionAnimations.length - 1; i >= 0; i--) {
    const anim = collisionAnimations[i]

    // 更新进度
    anim.progress += timeIncrement / anim.duration

    // 如果动画完成
    if (anim.progress >= 1) {
      // 设置到最终位置
      anim.ship.x = anim.targetX
      anim.ship.y = anim.targetY

      // 更新玩家数据
      if (anim.ship.playerData) {
        anim.ship.playerData.x = anim.targetX
        anim.ship.playerData.y = anim.targetY
      }

      // 从数组中移除
      collisionAnimations.splice(i, 1)
    } else {
      // 计算当前位置
      const t = anim.easing(anim.progress)
      anim.ship.x = anim.startX + (anim.targetX - anim.startX) * t
      anim.ship.y = anim.startY + (anim.targetY - anim.startY) * t

      // 更新玩家数据
      if (anim.ship.playerData) {
        anim.ship.playerData.x = anim.ship.x
        anim.ship.playerData.y = anim.ship.y
      }
    }
  }
}

// 绘制瞄准线
function drawAimingLine() {
  // 移除旧的瞄准线
  if (selfShip.aimingLine) {
    worldContainer.removeChild(selfShip.aimingLine)
  }

  // 如果不在瞄准模式，不绘制瞄准线
  if (!isAimingMode) {
    selfShip.aimingLine = null
    return
  }

  // 创建新的瞄准线
  const aimingLine = new PIXI.Graphics()

  // 绘制从船只到鼠标的线
  aimingLine.lineStyle(1, 0xffffff, 0.5)
  aimingLine.moveTo(0, 0)
  aimingLine.lineTo(mousePosition.x - selfShip.x, mousePosition.y - selfShip.y)

  // 绘制船只朝向线
  aimingLine.lineStyle(2, 0xff0000, 0.7)
  aimingLine.moveTo(0, 0)

  // 计算瞄准线长度和方向
  const lineLength = 200
  const endX = Math.cos(selfShip.ship.rotation) * lineLength
  const endY = Math.sin(selfShip.ship.rotation) * lineLength

  // 绘制直线
  aimingLine.lineTo(endX, endY)

  // 绘制箭头
  const arrowSize = 10
  const arrowAngle = Math.PI / 6 // 30度

  const arrowX1 = endX - arrowSize * Math.cos(selfShip.ship.rotation - arrowAngle)
  const arrowY1 = endY - arrowSize * Math.sin(selfShip.ship.rotation - arrowAngle)

  const arrowX2 = endX - arrowSize * Math.cos(selfShip.ship.rotation + arrowAngle)
  const arrowY2 = endY - arrowSize * Math.sin(selfShip.ship.rotation + arrowAngle)

  aimingLine.moveTo(endX, endY)
  aimingLine.lineTo(arrowX1, arrowY1)

  aimingLine.moveTo(endX, endY)
  aimingLine.lineTo(arrowX2, arrowY2)

  // 设置位置
  aimingLine.x = selfShip.x
  aimingLine.y = selfShip.y

  // 添加到世界
  worldContainer.addChild(aimingLine)

  // 保存引用
  selfShip.aimingLine = aimingLine
}

// 创建落水爆炸效果
function createWaterExplosion(x, y) {
  // 创建爆炸容器
  const explosion = new PIXI.Container()
  explosion.x = x
  explosion.y = y
  worldContainer.addChild(explosion)

  // 创建爆炸波纹
  const ripple = new PIXI.Graphics()
  explosion.addChild(ripple)

  // 创建水花效果
  for (let i = 0; i < 20; i++) {
    const splash = new PIXI.Graphics()
    splash.beginFill(0x88ccff)

    // 随机大小的水滴
    const size = 2 + Math.random() * 4
    splash.drawCircle(0, 0, size)
    splash.endFill()

    // 随机位置和速度
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * EXPLOSION_RADIUS * 0.8

    splash.x = Math.cos(angle) * distance
    splash.y = Math.sin(angle) * distance

    // 随机初始透明度
    splash.alpha = 0.6 + Math.random() * 0.4

    explosion.addChild(splash)

    // 水花动画 - 向外飞溅然后消失
    const splashAnimation = () => {
      splash.x += Math.cos(angle) * 1.5
      splash.y += Math.sin(angle) * 1.5
      splash.alpha -= 0.05

      if (splash.alpha <= 0) {
        explosion.removeChild(splash)
      } else {
        requestAnimationFrame(splashAnimation)
      }
    }

    splashAnimation()
  }

  // 爆炸动画
  let progress = 0
  const animateExplosion = () => {
    // 更新进度
    progress += 1 / (EXPLOSION_DURATION * 60) // 假设60fps

    // 绘制波纹
    ripple.clear()

    // 外圈 - 逐渐扩大并消失
    const outerRadius = EXPLOSION_RADIUS * Math.min(progress * 1.2, 1)
    const outerAlpha = Math.max(0, 1 - progress / 0.8)

    ripple.lineStyle(3, 0x88ccff, outerAlpha)
    ripple.drawCircle(0, 0, outerRadius)

    // 内圈 - 水花区域
    const innerRadius = EXPLOSION_RADIUS * 0.7 * Math.min(progress * 1.5, 1)
    const innerAlpha = Math.max(0, 1 - progress / 0.6)

    ripple.beginFill(0x88ccff, innerAlpha * 0.3)
    ripple.drawCircle(0, 0, innerRadius)
    ripple.endFill()

    // 如果动画结束，移除爆炸效果
    if (progress >= 1) {
      worldContainer.removeChild(explosion)
    } else {
      requestAnimationFrame(animateExplosion)
    }
  }

  // 开始动画
  animateExplosion()

  // 添加声音效果（如果有的话）
  // playSound('splash');
}

// 初始化游戏
initGame()