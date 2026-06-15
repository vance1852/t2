const express = require("express");
const db = require("../db");

const router = express.Router();

const VALID_STATUSES = ["idle", "in_fence", "illegal", "fault", "low_battery"];

router.get("/", (req, res) => {
  try {
    const { status, fence_id, keyword, page = 1, pageSize = 50 } = req.query;
    let sql = "SELECT * FROM bikes WHERE 1=1";
    const params = [];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (fence_id) {
      sql += " AND fence_id = ?";
      params.push(fence_id);
    }
    if (keyword) {
      sql += " AND bike_no LIKE ?";
      params.push(`%${keyword}%`);
    }

    const totalSql = sql.replace("SELECT *", "SELECT COUNT(*) as cnt");
    const total = db.prepare(totalSql).get(...params).cnt;

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const bikes = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: bikes,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/summary", (req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'in_fence' THEN 1 ELSE 0 END) as inFence,
        SUM(CASE WHEN status = 'illegal' THEN 1 ELSE 0 END) as illegal,
        SUM(CASE WHEN status = 'fault' THEN 1 ELSE 0 END) as fault,
        SUM(CASE WHEN status = 'low_battery' THEN 1 ELSE 0 END) as lowBattery,
        SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
        SUM(battery) as totalBattery,
        SUM(CASE WHEN battery < 20 THEN 1 ELSE 0 END) as needCharge
      FROM bikes
    `,
      )
      .get();

    const avgBattery =
      stats.total > 0
        ? Number((stats.totalBattery / stats.total).toFixed(2))
        : 0;

    res.json({
      success: true,
      data: {
        total: stats.total,
        inFence: stats.inFence || 0,
        illegal: stats.illegal || 0,
        fault: stats.fault || 0,
        lowBattery: stats.lowBattery || 0,
        idle: stats.idle || 0,
        totalBattery: stats.totalBattery || 0,
        avgBattery: Number(avgBattery),
        needCharge: stats.needCharge || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/status/map", (req, res) => {
  try {
    const bikes = db
      .prepare(
        `
      SELECT id, bike_no, status, x, y, fence_id
      FROM bikes
      ORDER BY id ASC
    `,
      )
      .all();

    res.json({
      success: true,
      data: bikes,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const bike = db
      .prepare("SELECT * FROM bikes WHERE id = ?")
      .get(req.params.id);
    if (!bike) {
      return res.status(404).json({ success: false, message: "单车不存在" });
    }

    res.json({
      success: true,
      data: bike,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const { status, x, y, battery, fence_id } = req.body;
    const bikeId = req.params.id;

    const existing = db.prepare("SELECT * FROM bikes WHERE id = ?").get(bikeId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "单车不存在" });
    }

    const newStatus = status !== undefined ? status : existing.status;
    const newX = x !== undefined ? x : existing.x;
    const newY = y !== undefined ? y : existing.y;
    const newBattery = battery !== undefined ? battery : existing.battery;
    const newFenceId = fence_id !== undefined ? fence_id : existing.fence_id;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `无效的状态值，允许值: ${VALID_STATUSES.join(", ")}`,
      });
    }

    if (battery !== undefined && (battery < 0 || battery > 100)) {
      return res.status(400).json({
        success: false,
        message: "电量必须在 0-100 之间",
      });
    }

    db.prepare(
      `UPDATE bikes SET status = ?, x = ?, y = ?, battery = ?, fence_id = ?, last_updated = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(newStatus, newX, newY, newBattery, newFenceId, bikeId);

    const updated = db.prepare("SELECT * FROM bikes WHERE id = ?").get(bikeId);

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
