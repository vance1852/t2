const express = require("express");
const db = require("../db");

const router = express.Router();

function getPolygonBBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getPolygonCenter(points) {
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  points.forEach((p) => {
    sumX += p.x;
    sumY += p.y;
  });
  return {
    x: sumX / n,
    y: sumY / n,
  };
}

function getPolygonRadius(points, center) {
  const n = points.length;
  let sumDist = 0;
  points.forEach((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    sumDist += Math.sqrt(dx * dx + dy * dy);
  });
  return sumDist / n;
}

function checkBBoxOverlap(bbox1, bbox2) {
  return !(
    bbox1.maxX < bbox2.minX ||
    bbox2.maxX < bbox1.minX ||
    bbox1.maxY < bbox2.minY ||
    bbox2.maxY < bbox1.minY
  );
}

function checkFenceOverlap(newPoints, existingFences, excludeId = null) {
  const newCenter = getPolygonCenter(newPoints);
  const newRadius = getPolygonRadius(newPoints, newCenter);
  const newBBox = getPolygonBBox(newPoints);

  for (const fence of existingFences) {
    if (excludeId && fence.id === excludeId) continue;

    const fencePoints =
      typeof fence.points === "string"
        ? JSON.parse(fence.points)
        : fence.points;
    const fenceCenter = { x: fence.center_x, y: fence.center_y };
    const fenceRadius = getPolygonRadius(fencePoints, fenceCenter);
    const fenceBBox = getPolygonBBox(fencePoints);

    const bboxOverlap = checkBBoxOverlap(newBBox, fenceBBox);
    if (!bboxOverlap) continue;

    const dx = newCenter.x - fenceCenter.x;
    const dy = newCenter.y - fenceCenter.y;
    const centerDist = Math.sqrt(dx * dx + dy * dy);
    const avgRadius = (newRadius + fenceRadius) / 2;

    if (centerDist < avgRadius * 1.5) {
      return true;
    }
  }
  return false;
}

function getFenceCurrentCount(fenceId) {
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM bikes WHERE fence_id = ? AND status = 'in_fence'",
    )
    .get(fenceId);
  return row ? row.cnt : 0;
}

function formatFence(fence) {
  const points =
    typeof fence.points === "string" ? JSON.parse(fence.points) : fence.points;
  const currentCount = getFenceCurrentCount(fence.id);
  return {
    id: fence.id,
    name: fence.name,
    district: fence.district,
    capacity: fence.capacity,
    points: points,
    centerX: fence.center_x,
    centerY: fence.center_y,
    currentCount: currentCount,
    saturation:
      fence.capacity > 0
        ? Number((currentCount / fence.capacity).toFixed(4))
        : 0,
    created_at: fence.created_at,
    updated_at: fence.updated_at,
  };
}

router.get("/", (req, res) => {
  try {
    const { district, name } = req.query;
    let sql = "SELECT * FROM fences WHERE 1=1";
    const params = [];

    if (district) {
      sql += " AND district = ?";
      params.push(district);
    }
    if (name) {
      sql += " AND name LIKE ?";
      params.push(`%${name}%`);
    }
    sql += " ORDER BY id ASC";

    const fences = db.prepare(sql).all(...params);
    const result = fences.map(formatFence);

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
    const fence = db
      .prepare("SELECT * FROM fences WHERE id = ?")
      .get(req.params.id);
    if (!fence) {
      return res.status(404).json({ success: false, message: "围栏不存在" });
    }

    res.json({
      success: true,
      data: formatFence(fence),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/bikes", (req, res) => {
  try {
    const fence = db
      .prepare("SELECT id FROM fences WHERE id = ?")
      .get(req.params.id);
    if (!fence) {
      return res.status(404).json({ success: false, message: "围栏不存在" });
    }

    const bikes = db
      .prepare("SELECT * FROM bikes WHERE fence_id = ? ORDER BY id ASC")
      .all(req.params.id);

    res.json({
      success: true,
      data: bikes,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const { name, district, capacity, points } = req.body;

    if (
      !name ||
      !district ||
      !capacity ||
      !Array.isArray(points) ||
      points.length < 3
    ) {
      return res.status(400).json({
        success: false,
        message: "参数不完整：name, district, capacity, points(至少3个点) 必填",
      });
    }

    const center = getPolygonCenter(points);
    const existingFences = db.prepare("SELECT * FROM fences").all();

    if (checkFenceOverlap(points, existingFences)) {
      return res.status(400).json({
        success: false,
        message: "围栏位置与已有围栏重叠",
      });
    }

    const result = db
      .prepare(
        `INSERT INTO fences (name, district, capacity, points, center_x, center_y, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(
        name,
        district,
        capacity,
        JSON.stringify(points),
        center.x,
        center.y,
      );

    const fence = db
      .prepare("SELECT * FROM fences WHERE id = ?")
      .get(result.lastInsertRowid);

    res.json({
      success: true,
      data: formatFence(fence),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const { name, capacity, points } = req.body;
    const fenceId = req.params.id;

    const existing = db
      .prepare("SELECT * FROM fences WHERE id = ?")
      .get(fenceId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "围栏不存在" });
    }

    const newName = name !== undefined ? name : existing.name;
    const newCapacity = capacity !== undefined ? capacity : existing.capacity;
    const newPoints =
      points !== undefined ? points : JSON.parse(existing.points);

    if (newPoints && (!Array.isArray(newPoints) || newPoints.length < 3)) {
      return res.status(400).json({
        success: false,
        message: "points 至少需要3个点",
      });
    }

    const center = getPolygonCenter(newPoints);
    const allFences = db.prepare("SELECT * FROM fences").all();

    if (checkFenceOverlap(newPoints, allFences, Number(fenceId))) {
      return res.status(400).json({
        success: false,
        message: "围栏位置与已有围栏重叠",
      });
    }

    db.prepare(
      `UPDATE fences SET name = ?, capacity = ?, points = ?, center_x = ?, center_y = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      newName,
      newCapacity,
      JSON.stringify(newPoints),
      center.x,
      center.y,
      fenceId,
    );

    const updated = db
      .prepare("SELECT * FROM fences WHERE id = ?")
      .get(fenceId);

    res.json({
      success: true,
      data: formatFence(updated),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const fenceId = req.params.id;
    const existing = db
      .prepare("SELECT id FROM fences WHERE id = ?")
      .get(fenceId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "围栏不存在" });
    }

    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE bikes SET fence_id = NULL, status = 'idle', last_updated = CURRENT_TIMESTAMP WHERE fence_id = ?",
      ).run(fenceId);
      db.prepare("DELETE FROM fences WHERE id = ?").run(fenceId);
    });

    tx();

    res.json({
      success: true,
      message: "围栏删除成功",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
