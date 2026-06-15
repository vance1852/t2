const express = require("express");
const db = require("../db");

const router = express.Router();

const VALID_TYPES = ["illegal_parking", "fault_report"];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];
const VALID_STATUSES = ["pending", "processing", "completed", "cancelled"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateOrderNo() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `WO${timestamp}${random}`;
}

function getLast7Days() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      dateObj: d,
    });
  }
  return days;
}

function getMinutesDiff(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  return (end - start) / (1000 * 60);
}

router.get("/", (req, res) => {
  try {
    const {
      status,
      type,
      priority,
      assignee,
      page = 1,
      pageSize = 20,
    } = req.query;
    let sql =
      "SELECT wo.*, b.bike_no, f.name as fence_name FROM work_orders wo";
    sql += " LEFT JOIN bikes b ON wo.bike_id = b.id";
    sql += " LEFT JOIN fences f ON wo.fence_id = f.id";
    sql += " WHERE 1=1";
    const params = [];

    if (type) {
      sql += " AND wo.type = ?";
      params.push(type);
    }
    if (status) {
      sql += " AND wo.status = ?";
      params.push(status);
    }
    if (priority) {
      sql += " AND wo.priority = ?";
      params.push(priority);
    }
    if (assignee) {
      sql += " AND wo.assignee = ?";
      params.push(assignee);
    }

    const totalSql = sql.replace(
      "SELECT wo.*, b.bike_no, f.name as fence_name",
      "SELECT COUNT(*) as cnt",
    );
    const total = db.prepare(totalSql).get(...params).cnt;

    sql += " ORDER BY wo.id DESC LIMIT ? OFFSET ?";
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const orders = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: orders,
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

router.get("/stats/summary", (req, res) => {
  try {
    const statusStats = db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN type = 'illegal_parking' THEN 1 ELSE 0 END) as illegalParking,
        SUM(CASE WHEN type = 'fault_report' THEN 1 ELSE 0 END) as faultReport
      FROM work_orders
    `,
      )
      .get();

    const responseTimes = db
      .prepare(
        `
      SELECT created_at, started_at
      FROM work_orders
      WHERE status IN ('processing', 'completed')
        AND created_at IS NOT NULL
        AND started_at IS NOT NULL
    `,
      )
      .all();

    let avgResponseTime = 0;
    if (responseTimes.length > 0) {
      const totalMinutes = responseTimes.reduce((sum, r) => {
        return sum + getMinutesDiff(r.created_at, r.started_at);
      }, 0);
      avgResponseTime = Number(
        (totalMinutes / responseTimes.length).toFixed(2),
      );
    }

    const days = getLast7Days();
    const trend = days.map(({ date }) => {
      const dayStats = db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN type = 'illegal_parking' THEN 1 ELSE 0 END) as illegal,
          SUM(CASE WHEN type = 'fault_report' THEN 1 ELSE 0 END) as fault,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM work_orders
        WHERE DATE(created_at) = ?
      `,
        )
        .get(date);
      return {
        date,
        total: dayStats.total || 0,
        illegal: dayStats.illegal || 0,
        fault: dayStats.fault || 0,
        completed: dayStats.completed || 0,
      };
    });

    res.json({
      success: true,
      data: {
        total: statusStats.total || 0,
        status: {
          pending: statusStats.pending || 0,
          processing: statusStats.processing || 0,
          completed: statusStats.completed || 0,
          cancelled: statusStats.cancelled || 0,
        },
        statusCounts: {
          pending: statusStats.pending || 0,
          processing: statusStats.processing || 0,
          completed: statusStats.completed || 0,
          cancelled: statusStats.cancelled || 0,
        },
        types: {
          illegalParking: statusStats.illegalParking || 0,
          faultReport: statusStats.faultReport || 0,
        },
        typeCounts: {
          illegalParking: statusStats.illegalParking || 0,
          faultReport: statusStats.faultReport || 0,
        },
        avgResponseTime,
        trend,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/stats/response-time", (req, res) => {
  try {
    const days = getLast7Days();
    const result = days.map(({ date }) => {
      const dayRows = db
        .prepare(
          `
        SELECT created_at, started_at
        FROM work_orders
        WHERE DATE(created_at) = ?
          AND created_at IS NOT NULL
          AND started_at IS NOT NULL
          AND status IN ('processing', 'completed')
      `,
        )
        .all(date);

      let avgMinutes = 0;
      if (dayRows.length > 0) {
        const totalMinutes = dayRows.reduce((sum, r) => {
          return sum + getMinutesDiff(r.created_at, r.started_at);
        }, 0);
        avgMinutes = Number((totalMinutes / dayRows.length).toFixed(2));
      }

      return {
        date,
        avgResponseMinutes: avgMinutes,
        count: dayRows.length,
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/stats/7day-trend", (req, res) => {
  try {
    const days = getLast7Days();
    const result = days.map(({ date }) => {
      const dayStats = db
        .prepare(
          `
        SELECT
          SUM(CASE WHEN type = 'illegal_parking' THEN 1 ELSE 0 END) as illegal,
          SUM(CASE WHEN type = 'fault_report' THEN 1 ELSE 0 END) as fault
        FROM work_orders
        WHERE DATE(created_at) = ?
      `,
        )
        .get(date);

      return {
        date,
        illegalParking: dayStats.illegal || 0,
        faultReport: dayStats.fault || 0,
        total: (dayStats.illegal || 0) + (dayStats.fault || 0),
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const order = db
      .prepare(
        `
      SELECT wo.*, b.bike_no, f.name as fence_name
      FROM work_orders wo
      LEFT JOIN bikes b ON wo.bike_id = b.id
      LEFT JOIN fences f ON wo.fence_id = f.id
      WHERE wo.id = ?
    `,
      )
      .get(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "工单不存在" });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const {
      type,
      title,
      description,
      priority = "normal",
      bike_id,
      fence_id,
      report_x,
      report_y,
    } = req.body;

    if (!type || !title) {
      return res.status(400).json({
        success: false,
        message: "参数不完整：type, title 必填",
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `无效的工单类型，允许值: ${VALID_TYPES.join(", ")}`,
      });
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: `无效的优先级，允许值: ${VALID_PRIORITIES.join(", ")}`,
      });
    }

    const orderNo = generateOrderNo();
    const createdAt = formatDate(new Date());

    const result = db
      .prepare(
        `INSERT INTO work_orders
         (order_no, type, title, description, status, priority, bike_id, fence_id, report_x, report_y, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orderNo,
        type,
        title,
        description || null,
        priority,
        bike_id || null,
        fence_id || null,
        report_x || null,
        report_y || null,
        createdAt,
      );

    const order = db
      .prepare(
        `
      SELECT wo.*, b.bike_no, f.name as fence_name
      FROM work_orders wo
      LEFT JOIN bikes b ON wo.bike_id = b.id
      LEFT JOIN fences f ON wo.fence_id = f.id
      WHERE wo.id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.json({
      success: true,
      data: order,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/start", (req, res) => {
  try {
    const { assignee } = req.body;
    const orderId = req.params.id;

    const order = db
      .prepare("SELECT * FROM work_orders WHERE id = ?")
      .get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "工单不存在" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `工单状态为 ${order.status}，无法接单（仅 pending 状态可接单）`,
      });
    }

    if (!assignee) {
      return res.status(400).json({
        success: false,
        message: "参数不完整：assignee 必填",
      });
    }

    const startedAt = formatDate(new Date());

    db.prepare(
      `UPDATE work_orders SET status = 'processing', assignee = ?, started_at = ? WHERE id = ?`,
    ).run(assignee, startedAt, orderId);

    const updated = db
      .prepare(
        `
      SELECT wo.*, b.bike_no, f.name as fence_name
      FROM work_orders wo
      LEFT JOIN bikes b ON wo.bike_id = b.id
      LEFT JOIN fences f ON wo.fence_id = f.id
      WHERE wo.id = ?
    `,
      )
      .get(orderId);

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/complete", (req, res) => {
  try {
    const orderId = req.params.id;

    const order = db
      .prepare("SELECT * FROM work_orders WHERE id = ?")
      .get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "工单不存在" });
    }

    if (order.status !== "processing") {
      return res.status(400).json({
        success: false,
        message: `工单状态为 ${order.status}，无法完成（仅 processing 状态可完成）`,
      });
    }

    const completedAt = formatDate(new Date());

    db.prepare(
      `UPDATE work_orders SET status = 'completed', completed_at = ? WHERE id = ?`,
    ).run(completedAt, orderId);

    const updated = db
      .prepare(
        `
      SELECT wo.*, b.bike_no, f.name as fence_name
      FROM work_orders wo
      LEFT JOIN bikes b ON wo.bike_id = b.id
      LEFT JOIN fences f ON wo.fence_id = f.id
      WHERE wo.id = ?
    `,
      )
      .get(orderId);

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/cancel", (req, res) => {
  try {
    const orderId = req.params.id;

    const order = db
      .prepare("SELECT * FROM work_orders WHERE id = ?")
      .get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "工单不存在" });
    }

    if (order.status === "completed" || order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `工单状态为 ${order.status}，无法取消`,
      });
    }

    db.prepare(`UPDATE work_orders SET status = 'cancelled' WHERE id = ?`).run(
      orderId,
    );

    const updated = db
      .prepare(
        `
      SELECT wo.*, b.bike_no, f.name as fence_name
      FROM work_orders wo
      LEFT JOIN bikes b ON wo.bike_id = b.id
      LEFT JOIN fences f ON wo.fence_id = f.id
      WHERE wo.id = ?
    `,
      )
      .get(orderId);

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
