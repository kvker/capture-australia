# 澳大利亚沿海海战游戏

这是一个基于 PixiJS 和 Socket.IO 的在线多人海战游戏。玩家可以驾驶海船在澳大利亚沿海水域进行对战。

## 功能特点

- 实时多人在线对战
- 船只移动和旋转控制
- 炮弹发射和碰撞检测
- 玩家血量和死亡机制
- 随机生成的岛屿环境
- 炮弹与船只碰撞的后坐力效果

## 如何运行

1. 安装依赖：
   ```
   npm install
   ```

2. 启动服务器：
   ```
   npm start
   ```

3. 在浏览器中访问：
   ```
   http://localhost:8080
   ```

## 游戏控制

- **W/↑键**：加速前进
- **S/↓键**：减速/后退
- **A/←键**：向左转向
- **D/→键**：向右转向
- **鼠标点击**：发射炮弹（点击位置决定炮弹落点）

## 游戏界面

- 左上角显示：血量、航速、在线玩家数
- 每个玩家都有唯一的ID和船只
- 被击中会减少血量，血量为0时游戏结束
- 死亡后3秒自动重生

## 技术栈

- 前端：PixiJS、Socket.IO Client
- 后端：Express、Socket.IO
- 通信：WebSocket

## 项目结构

```
├── public/                 # 前端静态文件
│   ├── index.html          # 游戏主页面
│   ├── js/                 # JavaScript文件
│   │   ├── pixi.min.js     # PixiJS库
│   │   └── game.js         # 游戏主逻辑
│   └── assets/             # 游戏资源
│       ├── images/         # 图片资源
│       └── sounds/         # 音效资源
├── server.js               # 服务器入口文件
├── package.json            # 项目依赖
└── README.md               # 项目说明
```

## 游戏功能说明

### 基础功能
- 玩家登录：输入ID进入游戏
- 船只移动：使用WASD或方向键控制
- 船只攻击：鼠标点击发射炮弹
- 生命值系统：被击中减少血量
- 碰撞系统：船只之间碰撞会相互弹开
- 死亡和重生系统：死亡后3秒自动重生

### 碰撞系统
游戏中的碰撞系统包括：
- 船只与船只碰撞：相互弹开并各自损失生命值
- 船只与岛屿碰撞：船只弹开并减速
- 炮弹与船只碰撞：造成伤害并产生爆炸效果

### 炮弹系统
- 鼠标点击发射炮弹
- 炮弹击中敌人造成伤害
- 炮弹有冷却时间，不能连续快速发射
- 发射炮弹会产生后坐力，影响船只位置
- 炮弹命中时产生爆炸效果和屏幕震动

### 岛屿系统
- 服务器随机生成多个岛屿
- 岛屿有不同类型（沙滩、森林、岩石）
- 岛屿会阻挡船只移动
- 岛屿可以作为战术掩体

## 开发计划
- [ ] 添加更多船只类型
- [ ] 添加道具系统（修理、加速、武器升级）
- [ ] 添加团队模式
- [ ] 优化碰撞检测算法
- [ ] 添加更多音效和视觉效果
- [ ] 添加排行榜系统

## 游戏截图
(游戏截图将在开发完成后添加)

## 贡献指南
欢迎提交问题和功能请求！如果您想贡献代码，请先创建一个issue讨论您想要更改的内容。

## 许可证
MIT