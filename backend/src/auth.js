const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const express = require("express");
const db = require("./db");

const JWT_SECRET = "bikefence_secret_2024";
const JWT_EXPIRES_IN = "24h";

// JWT 认证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "未提供认证令牌",
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "认证令牌已过期",
      });
    }
    return res.status(401).json({
      success: false,
      message: "认证令牌无效",
    });
  }
}

// 可选认证中间件（不强制要求 token，但有则解析）
function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // 忽略错误，继续执行
    }
  }
  next();
}

// 创建认证路由
function createAuthRouter() {
  const router = express.Router();

  // 登录接口
  router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "用户名和密码不能为空",
      });
    }

    // 查询用户
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // 验证密码
    const isValid = bcrypt.compareSync(password, user.password);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // 生成 JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    // 返回用户信息（不含密码）
    const userInfo = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.created_at,
    };

    res.json({
      success: true,
      message: "登录成功",
      data: {
        token,
        user: userInfo,
        expiresIn: "24h",
      },
    });
  });

  // 获取当前用户信息
  router.get("/me", authMiddleware, (req, res) => {
    const user = db
      .prepare("SELECT id, username, role, created_at FROM users WHERE id = ?")
      .get(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "用户不存在",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  });

  // 登出（客户端清除 token 即可，服务端无需处理）
  router.post("/logout", authMiddleware, (req, res) => {
    res.json({
      success: true,
      message: "登出成功",
    });
  });

  return router;
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  createAuthRouter,
  JWT_SECRET,
};
