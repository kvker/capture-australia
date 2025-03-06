const express = require('express')
const path = require('path')

// 创建Express应用
const app = express()

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')))

// 启动服务器
const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 8080
app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`)
})