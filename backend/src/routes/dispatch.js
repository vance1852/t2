const express = require("express");
const db = require("../db");
const { runRebalance, generateOrderNo } = require("../scheduler");

const router = express.Router();

function takeSnapshot() {
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
      centerX: f.center_x,
      centerY: f.center_y,
      currentCount: f.currentCount,
    }));

  const illegalBikes = db
    .prepare(
      `
    SELECT id, x, y, bike_no
    FROM bikes
    WHERE status = 'illegal'
    ORDER BY id ASC
  `,
    )
    .all();

  return { fences, illegalBikes, timestamp: Date.now() };
}

router.get("/", (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    let sql = "SELECT * FROM dispatch_tasks WHERE 1=1";
    const params = [];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    const totalSql = sql.replace("SELECT *", "SELECT COUNT(*) as cnt");
    const total = db.prepare(totalSql).get(...params).cnt;

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const tasks = db
      .prepare(sql)
      .all(...params)
      .map((t) => ({
        ...t,
        snapshotBefore: t.snapshot_before
          ? JSON.parse(t.snapshot_before)
          : null,
        snapshotAfter: t.snapshot_after ? JSON.parse(t.snapshot_after) : null,
      }));

    res.json({
      success: true,
      data: tasks,
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

router.get("/:id", (req, res) => {
  try {
    const task = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "调度任务不存在" });
    }

    const moves = db
      .prepare(
        `
      SELECT dm.*,
        f1.name as from_fence_name,
        f2.name as to_fence_name
      FROM dispatch_moves dm
      LEFT JOIN fences f1 ON dm.from_fence_id = f1.id
      LEFT JOIN fences f2 ON dm.to_fence_id = f2.id
      WHERE dm.task_id = ?
      ORDER BY dm.id ASC
    `,
      )
      .all(req.params.id);

    res.json({
      success: true,
      data: {
        ...task,
        snapshotBefore: task.snapshot_before
          ? JSON.parse(task.snapshot_before)
          : null,
        snapshotAfter: task.snapshot_after
          ? JSON.parse(task.snapshot_after)
          : null,
        moves,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/stats/summary", (req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT
        COUNT(*) as totalTasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTasks,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingTasks,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processingTasks,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledTasks,
        COALESCE(SUM(total_distance), 0) as totalDistance,
        COALESCE(SUM(greedy_distance), 0) as totalGreedyDistance,
        COALESCE(SUM(distance_saved), 0) as totalDistanceSaved
      FROM dispatch_tasks
    `,
      )
      .get();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/generate", (req, res) => {
  try {
    const snapshotBefore = takeSnapshot();
    const { fences, illegalBikes } = snapshotBefore;

    if (fences.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "暂无围栏数据，无法生成调度任务" });
    }

    const algoInputFences = fences.map((f) => ({
      id: f.id,
      centerX: f.centerX,
      centerY: f.centerY,
      capacity: f.capacity,
      currentCount: f.currentCount,
    }));

    const algoInputIllegal = illegalBikes.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
    }));

    const result = runRebalance(algoInputFences, algoInputIllegal);

    if (result.moves.length === 0) {
      return res.json({
        success: true,
        message: "当前车辆分布平衡，无需调度",
        data: {
          moves: [],
          totalDistance: 0,
          greedyDistance: result.greedyDistance,
          distanceSaved: 0,
        },
      });
    }

    const taskNo = generateOrderNo("DSP");

    const tx = db.transaction(() => {
      const taskResult = db
        .prepare(
          `
        INSERT INTO dispatch_tasks
          (task_no, status, total_distance, greedy_distance, distance_saved, snapshot_before)
        VALUES (?, 'pending', ?, ?, ?, ?)
      `,
        )
        .run(
          taskNo,
          result.totalDistance,
          result.greedyDistance,
          result.distanceSaved,
          JSON.stringify(snapshotBefore),
        );

      const taskId = taskResult.lastInsertRowid;

      const insertMove = db.prepare(`
        INSERT INTO dispatch_moves
          (task_id, from_fence_id, to_fence_id, bike_count, distance, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);

      const savedMoves = [];
      for (const move of result.moves) {
        const bikeCount = move.bikeIds ? move.bikeIds.length : 0;
        const r = insertMove.run(
          taskId,
          move.fromFenceId,
          move.toFenceId,
          bikeCount,
          move.distance,
        );
        savedMoves.push({
          id: r.lastInsertRowid,
          fromFenceId: move.fromFenceId,
          toFenceId: move.toFenceId,
          bikeIds: move.bikeIds,
          bikeCount,
          distance: move.distance,
          status: "pending",
        });
      }

      const task = db
        .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
        .get(taskId);

      return { task, savedMoves };
    });

    const { task, savedMoves } = tx();

    res.json({
      success: true,
      message: "调度任务生成成功",
      data: {
        ...task,
        snapshotBefore,
        moves: savedMoves,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:id/execute", (req, res) => {
  try {
    const task = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "调度任务不存在" });
    }
    if (task.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "只有待处理任务可以开始执行" });
    }

    db.prepare(
      `
      UPDATE dispatch_tasks SET status = 'processing' WHERE id = ?
    `,
    ).run(req.params.id);

    const updated = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);

    res.json({
      success: true,
      message: "任务已开始执行",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:id/cancel", (req, res) => {
  try {
    const task = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "调度任务不存在" });
    }
    if (task.status === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "已完成任务不能取消" });
    }
    if (task.status === "cancelled") {
      return res.status(400).json({ success: false, message: "任务已被取消" });
    }

    const tx = db.transaction(() => {
      db.prepare(
        `
        UPDATE dispatch_tasks SET status = 'cancelled' WHERE id = ?
      `,
      ).run(req.params.id);

      db.prepare(
        `
        UPDATE dispatch_moves SET status = 'cancelled'
        WHERE task_id = ? AND status = 'pending'
      `,
      ).run(req.params.id);
    });

    tx();

    const updated = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);

    res.json({
      success: true,
      message: "任务已取消",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:id/move/:moveId/complete", (req, res) => {
  try {
    const task = db
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(req.params.id);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "调度任务不存在" });
    }
    if (task.status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "任务已取消，无法执行" });
    }
    if (task.status === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "任务已完成，无需重复执行" });
    }
    if (task.status !== "processing" && task.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "当前任务状态不允许执行调运" });
    }

    const move = db
      .prepare("SELECT * FROM dispatch_moves WHERE id = ? AND task_id = ?")
      .get(req.params.moveId, req.params.id);
    if (!move) {
      return res
        .status(404)
        .json({ success: false, message: "调运记录不存在" });
    }
    if (move.status === "completed") {
      return res.status(400).json({ success: false, message: "该调运已完成" });
    }
    if (move.status === "cancelled") {
      return res.status(400).json({ success: false, message: "该调运已取消" });
    }

    const bikeCount = move.bike_count;
    let movedBikes = [];
    let validationError = null;

    if (move.from_fence_id == null) {
      const illegalBikes = db
        .prepare(
          `
        SELECT * FROM bikes WHERE status = 'illegal' ORDER BY id ASC LIMIT ?
      `,
        )
        .all(bikeCount);

      if (illegalBikes.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "当前没有违停车辆可调度" });
      }

      if (illegalBikes.length < bikeCount) {
        console.warn(
          `违停车辆不足: 需要${bikeCount}, 实际只有${illegalBikes.length}`,
        );
      }

      const toFence = db
        .prepare("SELECT * FROM fences WHERE id = ?")
        .get(move.to_fence_id);

      if (!toFence) {
        return res
          .status(400)
          .json({ success: false, message: "目标围栏不存在" });
      }

      const tx = db.transaction(() => {
        const updateBike = db.prepare(`
          UPDATE bikes SET
            fence_id = ?,
            x = ?,
            y = ?,
            status = 'in_fence',
            last_updated = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        for (const bike of illegalBikes) {
          updateBike.run(
            toFence.id,
            toFence.center_x,
            toFence.center_y,
            bike.id,
          );
          movedBikes.push(bike.id);
        }

        db.prepare(
          `
          UPDATE dispatch_moves
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(move.id);

        if (task.status === "pending") {
          db.prepare(
            `
            UPDATE dispatch_tasks SET status = 'processing' WHERE id = ?
          `,
          ).run(task.id);
        }
      });

      tx();
    } else {
      const sourceBikes = db
        .prepare(
          `
        SELECT * FROM bikes
        WHERE fence_id = ? AND status = 'in_fence'
        ORDER BY id ASC LIMIT ?
      `,
        )
        .all(move.from_fence_id, bikeCount);

      if (sourceBikes.length < bikeCount) {
        return res.status(400).json({
          success: false,
          message: `源围栏车辆不足: 需要${bikeCount}辆, 实际只有${sourceBikes.length}辆`,
        });
      }

      const toFence = db
        .prepare("SELECT * FROM fences WHERE id = ?")
        .get(move.to_fence_id);

      if (!toFence) {
        return res
          .status(400)
          .json({ success: false, message: "目标围栏不存在" });
      }

      const currentInToFence = db
        .prepare(
          `
        SELECT COUNT(*) as cnt FROM bikes WHERE fence_id = ? AND status = 'in_fence'
      `,
        )
        .get(move.to_fence_id).cnt;

      if (currentInToFence + sourceBikes.length > toFence.capacity) {
        return res.status(400).json({
          success: false,
          message: `目标围栏容量不足: 最多再容纳${toFence.capacity - currentInToFence}辆`,
        });
      }

      const tx = db.transaction(() => {
        const updateBike = db.prepare(`
          UPDATE bikes SET
            fence_id = ?,
            x = ?,
            y = ?,
            status = 'in_fence',
            last_updated = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        for (const bike of sourceBikes) {
          updateBike.run(
            toFence.id,
            toFence.center_x,
            toFence.center_y,
            bike.id,
          );
          movedBikes.push(bike.id);
        }

        db.prepare(
          `
          UPDATE dispatch_moves
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(move.id);

        if (task.status === "pending") {
          db.prepare(
            `
            UPDATE dispatch_tasks SET status = 'processing' WHERE id = ?
          `,
          ).run(task.id);
        }
      });

      tx();
    }

    const remainingMoves = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM dispatch_moves
      WHERE task_id = ? AND status != 'completed'
    `,
      )
      .get(task.id).cnt;

    let finalTask;
    if (remainingMoves === 0) {
      const snapshotAfter = takeSnapshot();
      db.prepare(
        `
        UPDATE dispatch_tasks
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            snapshot_after = ?
        WHERE id = ?
      `,
      ).run(JSON.stringify(snapshotAfter), task.id);

      finalTask = db
        .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
        .get(task.id);
      finalTask.snapshotAfter = snapshotAfter;
    } else {
      finalTask = db
        .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
        .get(task.id);
    }

    if (
      finalTask.snapshot_before &&
      typeof finalTask.snapshot_before === "string"
    ) {
      finalTask.snapshotBefore = JSON.parse(finalTask.snapshot_before);
    }
    if (finalTask.snapshot_before) {
      delete finalTask.snapshot_before;
    }
    if (
      finalTask.snapshot_after &&
      typeof finalTask.snapshot_after === "string"
    ) {
      finalTask.snapshotAfter = JSON.parse(finalTask.snapshot_after);
    }
    if (finalTask.snapshot_after) {
      delete finalTask.snapshot_after;
    }

    res.json({
      success: true,
      message: "调运执行完成",
      data: {
        move: {
          ...move,
          status: "completed",
          movedBikeIds: movedBikes,
        },
        task: finalTask,
        remainingMoves,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
