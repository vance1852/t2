const bcrypt = require('bcryptjs');

let _db = null;
function getDb() {
  if (!_db) {
    _db = require('./db');
  }
  return _db;
}

// 固定种子的伪随机数生成器，保证数据可复现
function createSeededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const random = createSeededRandom(20240101);

function randomRange(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return random() * (max - min) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(random() * arr.length)];
}

// 正态分布近似 (Box-Muller)
function normalRandom(mean, stdDev) {
  const u1 = random() || 1e-9;
  const u2 = random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

// 行政区配置
const districts = [
  { name: '东城区', centerX: 116.42, centerY: 39.93 },
  { name: '西城区', centerX: 116.37, centerY: 39.92 },
  { name: '海淀区', centerX: 116.31, centerY: 39.96 },
  { name: '朝阳区', centerX: 116.45, centerY: 39.94 }
];

// 生成围栏多边形坐标
function generateFencePolygon(centerX, centerY, radius) {
  const pointCount = randomRange(5, 8);
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2 + randomFloat(-0.2, 0.2);
    const r = radius * randomFloat(0.7, 1.2);
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    points.push({ x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) });
  }
  return points;
}

// 生成围栏内的随机点
function randomPointInFence(centerX, centerY, radius) {
  const angle = random() * Math.PI * 2;
  const r = radius * Math.sqrt(random());
  return {
    x: Number((centerX + r * Math.cos(angle)).toFixed(6)),
    y: Number((centerY + r * Math.sin(angle)).toFixed(6))
  };
}

// 生成围栏附近的随机点（违停）
function randomPointNearFence(centerX, centerY, radius) {
  const angle = random() * Math.PI * 2;
  const r = radius * randomFloat(1.1, 2.0);
  return {
    x: Number((centerX + r * Math.cos(angle)).toFixed(6)),
    y: Number((centerY + r * Math.sin(angle)).toFixed(6))
  };
}

// 格式化日期
function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 生成过去N天的随机日期
function randomPastDate(daysAgo, baseDate) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - Math.floor(random() * daysAgo));
  d.setHours(randomRange(6, 22), randomRange(0, 59), randomRange(0, 59));
  return d;
}

// 检查是否需要填充数据
function needsSeeding() {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  return userCount === 0;
}

function runSeed() {
  if (!needsSeeding()) {
    console.log('数据库已有数据，跳过种子填充。');
    return;
  }

  const db = getDb();
  const tx = db.transaction(() => {
    console.log('开始填充种子数据...');

    // 1. 创建 admin 用户
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, 'admin')
    `).run('admin', hashedPassword);
    console.log('  ✓ 创建 admin 用户');

    // 2. 创建 12 个围栏（4区 x 3个）
    const fences = [];
    let fenceIdx = 1;
    districts.forEach(district => {
      for (let i = 0; i < 3; i++) {
        // 在行政区中心附近随机分布围栏
        const offsetX = randomFloat(-0.04, 0.04);
        const offsetY = randomFloat(-0.04, 0.04);
        const centerX = district.centerX + offsetX;
        const centerY = district.centerY + offsetY;
        const radius = randomFloat(0.004, 0.008);
        const capacity = randomRange(30, 60);
        const points = generateFencePolygon(centerX, centerY, radius);
        const name = `${district.name}-${['A', 'B', 'C'][i]}区-${String(fenceIdx).padStart(2, '0')}`;

        const result = db.prepare(`
          INSERT INTO fences (name, district, capacity, points, center_x, center_y)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, district.name, capacity, JSON.stringify(points), Number(centerX.toFixed(6)), Number(centerY.toFixed(6)));

        fences.push({
          id: result.lastInsertRowid,
          name,
          district: district.name,
          capacity,
          centerX: Number(centerX.toFixed(6)),
          centerY: Number(centerY.toFixed(6)),
          radius
        });
        fenceIdx++;
      }
    });
    console.log(`  ✓ 创建 ${fences.length} 个围栏`);

    // 3. 创建 400 辆单车
    const totalBikes = 400;
    const bikes = [];

    // 状态分布：60%在栏内, 15%违停, 10%故障, 8%低电量, 7%空闲
    const distribution = {
      in_fence: Math.floor(totalBikes * 0.60),
      illegal: Math.floor(totalBikes * 0.15),
      fault: Math.floor(totalBikes * 0.10),
      low_battery: Math.floor(totalBikes * 0.08),
      idle: totalBikes - Math.floor(totalBikes * 0.60) - Math.floor(totalBikes * 0.15) - Math.floor(totalBikes * 0.10) - Math.floor(totalBikes * 0.08)
    };

    const bikeInsert = db.prepare(`
      INSERT INTO bikes (bike_no, status, x, y, fence_id, battery)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let bikeCount = 0;
    const fenceLoads = {};
    fences.forEach(f => fenceLoads[f.id] = 0);

    // in_fence: 在围栏内
    for (let i = 0; i < distribution.in_fence; i++) {
      const fence = fences[Math.floor(random() * fences.length)];
      // 检查容量
      if (fenceLoads[fence.id] >= fence.capacity) continue;
      fenceLoads[fence.id]++;

      const bikeNo = `B${String(bikeCount + 1).padStart(4, '0')}`;
      const pt = randomPointInFence(fence.centerX, fence.centerY, fence.radius);
      const battery = Math.min(100, Math.max(20, Math.round(normalRandom(85, 12))));
      const lastUpdated = formatDate(randomPastDate(1, new Date()));

      const result = bikeInsert.run(bikeNo, 'in_fence', pt.x, pt.y, fence.id, battery);
      bikes.push({ id: result.lastInsertRowid, status: 'in_fence', fenceId: fence.id, x: pt.x, y: pt.y });
      bikeCount++;
    }

    // illegal: 违停，在围栏外附近
    for (let i = 0; i < distribution.illegal; i++) {
      const fence = fences[Math.floor(random() * fences.length)];
      const bikeNo = `B${String(bikeCount + 1).padStart(4, '0')}`;
      const pt = randomPointNearFence(fence.centerX, fence.centerY, fence.radius);
      const battery = Math.min(100, Math.max(15, Math.round(normalRandom(75, 18))));
      const lastUpdated = formatDate(randomPastDate(1, new Date()));

      const result = bikeInsert.run(bikeNo, 'illegal', pt.x, pt.y, null, battery);
      bikes.push({ id: result.lastInsertRowid, status: 'illegal', fenceId: null, x: pt.x, y: pt.y });
      bikeCount++;
    }

    // fault: 故障
    for (let i = 0; i < distribution.fault; i++) {
      const bikeNo = `B${String(bikeCount + 1).padStart(4, '0')}`;
      let pt, fenceId;
      if (random() > 0.5) {
        const fence = fences[Math.floor(random() * fences.length)];
        pt = randomPointInFence(fence.centerX, fence.centerY, fence.radius);
        if (fenceLoads[fence.id] < fence.capacity) {
          fenceLoads[fence.id]++;
          fenceId = fence.id;
        }
      } else {
        const fence = fences[Math.floor(random() * fences.length)];
        pt = randomPointNearFence(fence.centerX, fence.centerY, fence.radius);
      }
      const battery = Math.min(100, Math.max(5, Math.round(normalRandom(50, 25))));

      const result = bikeInsert.run(bikeNo, 'fault', pt.x, pt.y, fenceId || null, battery);
      bikes.push({ id: result.lastInsertRowid, status: 'fault', fenceId: fenceId || null, x: pt.x, y: pt.y });
      bikeCount++;
    }

    // low_battery: 低电量（<20%）
    for (let i = 0; i < distribution.low_battery; i++) {
      const bikeNo = `B${String(bikeCount + 1).padStart(4, '0')}`;
      const fence = fences[Math.floor(random() * fences.length)];
      let fenceId = null;
      let pt;
      if (random() > 0.4 && fenceLoads[fence.id] < fence.capacity) {
        fenceLoads[fence.id]++;
        pt = randomPointInFence(fence.centerX, fence.centerY, fence.radius);
        fenceId = fence.id;
      } else {
        pt = randomPointNearFence(fence.centerX, fence.centerY, fence.radius);
      }
      const battery = randomRange(5, 19);

      const result = bikeInsert.run(bikeNo, 'low_battery', pt.x, pt.y, fenceId, battery);
      bikes.push({ id: result.lastInsertRowid, status: 'low_battery', fenceId, x: pt.x, y: pt.y });
      bikeCount++;
    }

    // idle: 空闲
    for (let i = 0; i < distribution.idle; i++) {
      const bikeNo = `B${String(bikeCount + 1).padStart(4, '0')}`;
      const fence = fences[Math.floor(random() * fences.length)];
      let fenceId = null;
      let pt;
      if (random() > 0.3 && fenceLoads[fence.id] < fence.capacity) {
        fenceLoads[fence.id]++;
        pt = randomPointInFence(fence.centerX, fence.centerY, fence.radius);
        fenceId = fence.id;
      } else {
        pt = randomPointNearFence(fence.centerX, fence.centerY, fence.radius);
      }
      const battery = Math.min(100, Math.max(30, Math.round(normalRandom(70, 20))));

      const result = bikeInsert.run(bikeNo, 'idle', pt.x, pt.y, fenceId, battery);
      bikes.push({ id: result.lastInsertRowid, status: 'idle', fenceId, x: pt.x, y: pt.y });
      bikeCount++;
    }
    console.log(`  ✓ 创建 ${bikeCount} 辆单车`);

    // 4. 创建 80 条历史工单
    const totalOrders = 80;
    const orderTypes = ['illegal_parking', 'fault_report'];
    const orderTitles = {
      illegal_parking: ['违停举报-占道', '违停举报-人行道', '违停举报-绿化带', '违停举报-出入口', '违停举报-盲道'],
      fault_report: ['车辆故障-刹车失灵', '车辆故障-车锁损坏', '车辆故障-链条脱落', '车辆故障-轮胎漏气', '车辆故障-扫码异常']
    };
    const priorities = ['low', 'normal', 'high', 'urgent'];
    const assignees = ['张师傅', '李师傅', '王师傅', '赵师傅', '刘师傅'];

    const orderInsert = db.prepare(`
      INSERT INTO work_orders (order_no, type, title, description, status, priority, bike_id, fence_id, report_x, report_y, assignee, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date();
    for (let i = 0; i < totalOrders; i++) {
      const orderNo = `WO${String(now.getTime() - i * 3600000).slice(-8)}${String(i).padStart(3, '0')}`;
      const type = orderTypes[Math.floor(random() * orderTypes.length)];

      // 状态分布：30% pending, 20% processing, 50% completed
      let status;
      const r = random();
      if (r < 0.3) status = 'pending';
      else if (r < 0.5) status = 'processing';
      else status = 'completed';

      const title = randomChoice(orderTitles[type]);
      const priority = randomChoice(priorities);
      const description = `${title}，请及时处理。`;

      // 选择关联的单车（偏向 illegal 和 fault 状态）
      const candidateBikes = bikes.filter(b =>
        (type === 'illegal_parking' && b.status === 'illegal') ||
        (type === 'fault_report' && b.status === 'fault') ||
        (type === 'illegal_parking' && random() < 0.3) ||
        (type === 'fault_report' && random() < 0.3)
      );
      const bike = candidateBikes.length > 0
        ? candidateBikes[Math.floor(random() * candidateBikes.length)]
        : bikes[Math.floor(random() * bikes.length)];

      const assignee = status !== 'pending' ? randomChoice(assignees) : null;

      // 时间线：created -> started -> completed
      const createdAt = randomPastDate(7, now);
      let startedAt = null;
      let completedAt = null;

      if (status !== 'pending') {
        const startDelay = randomRange(10, 120);
        startedAt = new Date(createdAt.getTime() + startDelay * 60 * 1000);
        if (status === 'completed') {
          const processDuration = randomRange(20, 240);
          completedAt = new Date(startedAt.getTime() + processDuration * 60 * 1000);
        }
      }

      orderInsert.run(
        orderNo,
        type,
        title,
        description,
        status,
        priority,
        bike.id,
        bike.fenceId,
        bike.x,
        bike.y,
        assignee,
        formatDate(createdAt),
        startedAt ? formatDate(startedAt) : null,
        completedAt ? formatDate(completedAt) : null
      );
    }
    console.log(`  ✓ 创建 ${totalOrders} 条工单`);

    // 5. 创建 2 条历史调度任务
    const taskInsert = db.prepare(`
      INSERT INTO dispatch_tasks (task_no, status, total_distance, greedy_distance, distance_saved, created_at, completed_at, snapshot_before, snapshot_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const moveInsert = db.prepare(`
      INSERT INTO dispatch_moves (task_id, from_fence_id, to_fence_id, bike_count, distance, status, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let t = 0; t < 2; t++) {
      const taskNo = `DT${String(now.getTime() - (t + 1) * 86400000).slice(-8)}${String(t).padStart(2, '0')}`;
      const createdAt = randomPastDate(t === 0 ? 3 : 6, now);
      const completedAt = new Date(createdAt.getTime() + randomRange(40, 90) * 60 * 1000);

      // 随机 4-6 个调度移动
      const moveCount = randomRange(4, 6);
      let greedyDistance = 0;
      let totalDistance = 0;
      const moves = [];

      for (let m = 0; m < moveCount; m++) {
        const fromFence = fences[Math.floor(random() * fences.length)];
        let toFence = fences[Math.floor(random() * fences.length)];
        while (toFence.id === fromFence.id) {
          toFence = fences[Math.floor(random() * fences.length)];
        }
        const bikeCount = randomRange(2, 8);
        const dx = Math.abs(fromFence.centerX - toFence.centerX);
        const dy = Math.abs(fromFence.centerY - toFence.centerY);
        const baseDistance = Math.sqrt(dx * dx + dy * dy) * 111000;
        const distance = Number(baseDistance.toFixed(2));

        moves.push({
          fromFenceId: fromFence.id,
          toFenceId: toFence.id,
          bikeCount,
          distance,
          completedAt: new Date(createdAt.getTime() + randomRange(15, 80) * 60 * 1000)
        });

        greedyDistance += distance * bikeCount;
      }

      totalDistance = greedyDistance * (0.65 + random() * 0.15);
      const distanceSaved = greedyDistance - totalDistance;

      const snapshotBefore = JSON.stringify({
        timestamp: formatDate(createdAt),
        fenceLoads: fenceLoads,
        bikeCount: bikeCount
      });
      const snapshotAfter = JSON.stringify({
        timestamp: formatDate(completedAt),
        fenceLoads: fenceLoads,
        bikeCount: bikeCount,
        rebalanced: true
      });

      const taskResult = taskInsert.run(
        taskNo,
        'completed',
        Number(totalDistance.toFixed(2)),
        Number(greedyDistance.toFixed(2)),
        Number(distanceSaved.toFixed(2)),
        formatDate(createdAt),
        formatDate(completedAt),
        snapshotBefore,
        snapshotAfter
      );

      moves.forEach(move => {
        moveInsert.run(
          taskResult.lastInsertRowid,
          move.fromFenceId,
          move.toFenceId,
          move.bikeCount,
          move.distance,
          'completed',
          formatDate(move.completedAt)
        );
      });
    }
    console.log('  ✓ 创建 2 条调度任务记录');

    console.log('种子数据填充完成！');
  });

  tx();
}

// 直接运行时执行 seed
if (require.main === module) {
  runSeed();
}

module.exports = { runSeed, needsSeeding };
