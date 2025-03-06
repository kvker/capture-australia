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
let shootCooldown = 1000 // 射击冷却时间（毫秒）

// DOM元素
const loginScreen = document.getElementById('loginScreen')
const playerId = document.getElementById('playerId')
const startButton = document.getElementById('startButton')
const gameInfo = document.getElementById('gameInfo')
const healthValue = document.getElementById('healthValue')
const speedValue = document.getElementById('speedValue')
const playerCount = document.getElementById('playerCount')

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
  // 键盘事件
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true
  })

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
  })

  // 鼠标点击事件
  app.view.addEventListener('click', onMouseClick)

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

  // 开始游戏按钮
  startButton.addEventListener('click', startGame)
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

  // 加入游戏
  socket.emit('join', id)

  gameStarted = true
}

// 游戏状态初始化
function onGameState(data) {
  // 保存世界尺寸
  worldWidth = data.worldWidth
  worldHeight = data.worldHeight

  // 保存自己的ID
  selfId = data.selfId

  // 创建海洋背景
  createOcean()

  // 创建岛屿
  createIslands(data.islands)

  // 创建所有玩家
  for (const id in data.players) {
    createShip(id, data.players[id])
  }

  // 更新玩家数量
  updatePlayerCount()
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

  // 设置位置和旋转
  ship.x = playerData.x
  ship.y = playerData.y
  ship.rotation = playerData.rotation

  // 添加玩家ID文本
  const playerText = new PIXI.Text(playerData.id, {
    fontFamily: 'Arial',
    fontSize: 12,
    fill: 0xffffff,
    align: 'center'
  })
  playerText.anchor.set(0.5)
  playerText.y = -30
  ship.addChild(playerText)

  // 添加血条
  const healthBar = new PIXI.Graphics()
  healthBar.beginFill(0x00ff00)
  healthBar.drawRect(-20, -20, 40, 5)
  healthBar.endFill()
  ship.addChild(healthBar)
  ship.healthBar = healthBar

  // 保存玩家数据
  ship.playerData = playerData

  // 添加到世界
  worldContainer.addChild(ship)

  // 保存到船只列表
  ships[id] = ship

  // 如果是自己的船，设置摄像机跟随
  if (id === selfId) {
    selfShip = ship
    centerCamera()
  }

  return ship
}

// 玩家加入
function onPlayerJoined(data) {
  createShip(data.id, data.player)
  updatePlayerCount()
}

// 玩家离开
function onPlayerLeft(data) {
  if (ships[data.id]) {
    worldContainer.removeChild(ships[data.id])
    delete ships[data.id]
    updatePlayerCount()
  }
}

// 玩家移动
function onPlayerMoved(data) {
  if (ships[data.id]) {
    ships[data.id].x = data.x
    ships[data.id].y = data.y
    ships[data.id].rotation = data.rotation
    ships[data.id].playerData.speed = data.speed
  }
}

// 玩家射击
function onPlayerShot(data) {
  createBullet(data.x, data.y, data.targetX, data.targetY, data.id)

  // 如果是自己射击，添加后坐力
  if (data.id === selfId && selfShip) {
    // 计算后坐力方向（与射击方向相反）
    const angle = Math.atan2(data.targetY - data.y, data.targetX - data.x)
    const recoilX = -Math.cos(angle) * RECOIL_FORCE
    const recoilY = -Math.sin(angle) * RECOIL_FORCE

    // 应用后坐力
    selfShip.playerData.x += recoilX
    selfShip.playerData.y += recoilY
    selfShip.x += recoilX
    selfShip.y += recoilY

    // 屏幕震动效果
    shakeScreen(3)
  }
}

// 创建炮弹
function createBullet(x, y, targetX, targetY, shooterId) {
  // 计算方向
  const angle = Math.atan2(targetY - y, targetX - x)

  // 创建炮弹图形
  const bullet = new PIXI.Graphics()
  bullet.beginFill(0xffff00)
  bullet.drawCircle(0, 0, 5)
  bullet.endFill()

  // 设置位置
  bullet.x = x
  bullet.y = y

  // 设置速度
  bullet.vx = Math.cos(angle) * BULLET_SPEED
  bullet.vy = Math.sin(angle) * BULLET_SPEED

  // 设置属性
  bullet.shooterId = shooterId
  bullet.damage = BULLET_DAMAGE
  bullet.lifeTime = 100 // 子弹生命周期

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

    // 如果是自己，显示死亡信息
    if (data.id === selfId) {
      const deathText = new PIXI.Text('你已阵亡，3秒后重生...', {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xff0000,
        align: 'center'
      })
      deathText.anchor.set(0.5)
      deathText.x = app.screen.width / 2
      deathText.y = app.screen.height / 2
      app.stage.addChild(deathText)

      // 3秒后移除文本
      setTimeout(() => {
        app.stage.removeChild(deathText)
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
    shakeScreen(7)
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

// 鼠标点击事件
function onMouseClick(e) {
  if (!gameStarted || !selfShip || selfShip.playerData.health <= 0) return

  const now = Date.now()

  // 检查射击冷却
  if (now - lastShootTime < shootCooldown) return

  lastShootTime = now

  // 获取鼠标位置
  const mousePosition = app.renderer.plugins.interaction.mouse.global

  // 转换为世界坐标
  const worldPos = {
    x: mousePosition.x + worldContainer.x - app.screen.width / 2,
    y: mousePosition.y + worldContainer.y - app.screen.height / 2
  }

  // 发送射击事件
  socket.emit('playerShoot', {
    x: selfShip.x,
    y: selfShip.y,
    targetX: worldPos.x,
    targetY: worldPos.y
  })
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

// 游戏主循环
function gameLoop(delta) {
  if (!gameStarted || !selfShip) return

  // 处理玩家输入
  handleInput(delta)

  // 更新所有子弹
  updateBullets(delta)

  // 检测碰撞
  checkCollisions()

  // 更新摄像机
  centerCamera()

  // 确保船只在世界范围内
  keepInWorld()
}

// 处理玩家输入
function handleInput(delta) {
  if (selfShip.playerData.health <= 0) return

  let rotation = selfShip.rotation
  let speed = selfShip.playerData.speed

  // 旋转控制
  if (keys['a'] || keys['arrowleft']) {
    rotation -= SHIP_ROTATION_SPEED * delta
  }

  if (keys['d'] || keys['arrowright']) {
    rotation += SHIP_ROTATION_SPEED * delta
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
  selfShip.rotation = rotation
  selfShip.playerData.speed = speed
  selfShip.playerData.x = selfShip.x
  selfShip.playerData.y = selfShip.y
  selfShip.playerData.rotation = rotation

  // 更新速度显示
  speedValue.textContent = Math.abs(Math.round(speed * 10)) / 10

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
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i]

    // 更新位置
    bullet.x += bullet.vx
    bullet.y += bullet.vy

    // 减少生命周期
    bullet.lifeTime--

    // 检查是否超出世界或生命周期结束
    if (
      bullet.x < 0 ||
      bullet.x > worldWidth ||
      bullet.y < 0 ||
      bullet.y > worldHeight ||
      bullet.lifeTime <= 0
    ) {
      worldContainer.removeChild(bullet)
      bullets.splice(i, 1)
    }
  }
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

        // 移除子弹
        worldContainer.removeChild(bullet)
        bullets.splice(i, 1)

        // 创建小爆炸效果
        createSmallExplosion(bullet.x, bullet.y)

        break
      }
    }
  }

  // 船只与船只碰撞
  if (selfShip && selfShip.playerData.health > 0) {
    for (const id in ships) {
      // 不检查与自己的碰撞
      if (id === selfId) continue

      const otherShip = ships[id]

      // 简单的圆形碰撞检测
      const dx = selfShip.x - otherShip.x
      const dy = selfShip.y - otherShip.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 40) { // 两艘船的半径和
        // 计算碰撞方向
        const angle = Math.atan2(dy, dx)

        // 计算碰撞后的反弹
        const bounceX = Math.cos(angle) * COLLISION_DAMAGE / 5
        const bounceY = Math.sin(angle) * COLLISION_DAMAGE / 5

        // 应用反弹力
        selfShip.x += bounceX
        selfShip.y += bounceY

        // 发送碰撞事件
        socket.emit('collision', {
          id1: selfId,
          id2: id,
          damage: COLLISION_DAMAGE
        })

        // 发送伤害事件
        socket.emit('playerHit', {
          id: selfId,
          damage: COLLISION_DAMAGE / 2
        })

        socket.emit('playerHit', {
          id: id,
          damage: COLLISION_DAMAGE / 2
        })
      }
    }
  }

  // 船只与岛屿碰撞
  if (selfShip && selfShip.playerData.health > 0) {
    for (const island of islands) {
      const dx = selfShip.x - island.x
      const dy = selfShip.y - island.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < island.radius + 20) { // 岛屿半径 + 船只半径
        // 计算碰撞方向
        const angle = Math.atan2(dy, dx)

        // 计算碰撞后的反弹
        const bounceX = Math.cos(angle) * 5
        const bounceY = Math.sin(angle) * 5

        // 应用反弹力
        selfShip.x += bounceX
        selfShip.y += bounceY

        // 减少速度
        selfShip.playerData.speed *= 0.5
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

  if (selfShip.x < 0) selfShip.x = 0
  if (selfShip.x > worldWidth) selfShip.x = worldWidth
  if (selfShip.y < 0) selfShip.y = 0
  if (selfShip.y > worldHeight) selfShip.y = worldHeight
}

// 初始化游戏
initGame()