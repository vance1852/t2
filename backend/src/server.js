const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("./db");
const { runSeed } = require("./seed");
const { createAuthRouter, authMiddleware } = require("./auth");

const PORT = process.env.PORT || 3000;
const app = express();

// 中间件配置
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 请求日志中间件
app.use((req, res, next) => {
  const startTime = Date.now();
  const method = req.method;
  const url = req.url;
  console.log(`[${new Date().toLocaleString("zh-CN")}] ${method} ${url}`);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    console.log(`  → ${status} ${duration}ms`);
  });

  next();
});

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "服务运行正常",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 挂载认证路由
app.use("/api/auth", createAuthRouter());

// 自动加载 routes 目录下的路由文件
const routesDir = path.join(__dirname, "routes");
if (fs.existsSync(routesDir)) {
  const routeFiles = fs
    .readdirSync(routesDir)
    .filter((file) => file.endsWith(".js") && file !== "index.js");

  routeFiles.forEach((file) => {
    try {
      const routeName = file.replace(".js", "");
      const router = require(path.join(routesDir, file));

      if (typeof router === "function") {
        // 根据路由文件名决定是否需要认证
        if (routeName === "public") {
          app.use(`/api/${routeName}`, router);
          console.log(`已挂载公开路由: /api/${routeName}`);
        } else {
          app.use(`/api/${routeName}`, authMiddleware, router);
          console.log(`已挂载路由: /api/${routeName} (需认证)`);
        }
      }
    } catch (err) {
      console.warn(`加载路由文件 ${file} 失败:`, err.message);
    }
  });
}

// 404 处理
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error("服务器错误:", err);
  res.status(500).json({
    success: false,
    message: "服务器内部错误",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 启动服务器并自动填充种子数据
async function startServer() {
  try {
    console.log("========================================");
    console.log("  共享单车电子围栏调度管理后台");
    console.log("========================================\n");

    // 自动执行种子数据填充（仅在无数据时）
    console.log("检查数据库状态...");
    runSeed();
    console.log();

    app.listen(PORT, () => {
      console.log(`🚀 服务已启动`);
      console.log(`📍 本地地址:   http://localhost:${PORT}`);
      console.log(`🔗 健康检查:   http://localhost:${PORT}/api/health`);
      console.log(
        `🔐 登录接口:   POST http://localhost:${PORT}/api/auth/login`,
      );
      console.log(`👤 默认账号:   admin / admin123`);
      console.log();
      console.log(`⚙️  环境: ${process.env.NODE_ENV || "development"}`);
      console.log(`🕐 启动时间: ${new Date().toLocaleString("zh-CN")}`);
      console.log();
    });
  } catch (err) {
    console.error("启动服务失败:", err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
