const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/map-data", (req, res) => {
  try {
    const fences = db
      .prepare(
        `
      SELECT f.*,
        (SELECT COUNT(*) FROM bikes b WHERE b.fence_id = f.id AND b.status = 'in_fence') as currentCount
      FROM fences f
      ORDER BY f.id ASC
    `,
      )
      .all()
      .map((f) => ({
        id: f.id,
        name: f.name,
        district: f.district,
        capacity: f.capacity,
        currentCount: f.currentCount || 0,
        saturation:
          f.capacity > 0
            ? Number(((f.currentCount || 0) / f.capacity).toFixed(4))
            : 0,
        points: JSON.parse(f.points),
        centerX: f.center_x,
        centerY: f.center_y,
      }));

    const bikes = db
      .prepare(
        `
      SELECT id, bike_no, status, x, y, fence_id
      FROM bikes
      ORDER BY id ASC
    `,
      )
      .all();

    const illegalCount = db
      .prepare("SELECT COUNT(*) as cnt FROM bikes WHERE status = 'illegal'")
      .get().cnt;

    const faultCount = db
      .prepare("SELECT COUNT(*) as cnt FROM bikes WHERE status = 'fault'")
      .get().cnt;

    res.json({
      success: true,
      data: {
        fences,
        bikes,
        illegalCount: illegalCount || 0,
        faultCount: faultCount || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
