<template>
  <div class="replay">
    <div class="replay-header">
      <div class="header-left">
        <div class="task-selector">
          <span class="selector-label">调度任务</span>
          <select v-model="selectedTaskId" class="selector-input" @change="loadTaskDetail">
            <option value="">请选择历史任务</option>
            <option v-for="t in taskList" :key="t.id" :value="t.id">
              {{ t.task_no }} - {{ t.status === 'completed' ? '已完成' : t.status === 'processing' ? '执行中' : t.status === 'pending' ? '待处理' : '已取消' }}
            </option>
          </select>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-generate" @click="generateSim">
          <span class="btn-icon">🎲</span>随机生成模拟数据
        </button>
      </div>
    </div>

    <div class="maps-section">
      <div class="map-panel">
        <div class="panel-header before-header">
          <span class="panel-icon">📦</span>
          <span class="panel-title">调度前状态</span>
          <div class="panel-stats">
            <span class="stat-pill">
              总车辆: <strong>{{ totalBefore }}</strong>
            </span>
            <span class="stat-pill">
              围栏: <strong>{{ beforeFences.length }}</strong>
            </span>
          </div>
        </div>
        <div class="panel-body">
          <BikeMap
            v-if="beforeFences.length > 0"
            :fences="beforeFences"
            :showCounts="true"
            :moves="movesBeforeProgress"
            :mapHeight="380"
          />
          <div v-else class="empty-map">
            <div class="empty-icon">🗺️</div>
            <div class="empty-text">请选择调度任务或生成模拟数据</div>
          </div>
        </div>
      </div>

      <div class="vs-divider">
        <div class="vs-badge">VS</div>
        <div class="vs-line"></div>
      </div>

      <div class="map-panel">
        <div class="panel-header after-header">
          <span class="panel-icon">✅</span>
          <span class="panel-title">调度后状态</span>
          <div class="panel-stats">
            <span class="stat-pill">
              总车辆: <strong>{{ totalAfter }}</strong>
            </span>
            <span class="stat-pill">
              平衡: <strong>{{ balanceScore }}%</strong>
            </span>
          </div>
        </div>
        <div class="panel-body">
          <BikeMap
            v-if="afterFences.length > 0"
            :fences="afterFences"
            :showCounts="true"
            :moves="movesAfterProgress"
            :mapHeight="380"
          />
          <div v-else class="empty-map">
            <div class="empty-icon">🗺️</div>
            <div class="empty-text">调度后快照</div>
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-section">
      <div class="stats-row">
        <div class="stat-card-mini">
          <div class="stat-mini-label">总调度距离</div>
          <div class="stat-mini-value">{{ displayDistance }} <span class="unit">km</span></div>
        </div>
        <div class="stat-card-mini highlight">
          <div class="stat-mini-label">对比基线节省</div>
          <div class="stat-mini-value saved">
            <span class="saved-arrow">↓</span>{{ savedPercentDisplay }}%
          </div>
          <div class="stat-mini-sub">
            贪心基线: {{ greedyDistanceDisplay }} km
          </div>
        </div>
        <div class="stat-card-mini">
          <div class="stat-mini-label">调运次数</div>
          <div class="stat-mini-value">{{ totalMoves }} <span class="unit">次</span></div>
        </div>
        <div class="stat-card-mini">
          <div class="stat-mini-label">调运车辆</div>
          <div class="stat-mini-value">{{ totalBikesMoved }} <span class="unit">辆</span></div>
        </div>
      </div>

      <div class="player-section">
        <div class="play-controls">
          <button
            class="play-btn"
            :class="{ playing: isPlaying }"
            @click="togglePlay"
            :disabled="totalMoves === 0"
          >
            <span v-if="isPlaying">⏸</span>
            <span v-else>▶</span>
          </button>
          <button
            class="ctrl-btn"
            @click="resetProgress"
            :disabled="totalMoves === 0"
            title="重置"
          >
            ⏮
          </button>
          <div class="speed-ctrl">
            <span class="speed-label">速度</span>
            <div class="speed-btns">
              <button
                v-for="s in [0.5, 1, 2, 4]"
                :key="s"
                class="speed-btn"
                :class="{ active: playSpeed === s }"
                @click="playSpeed = s"
              >
                {{ s }}x
              </button>
            </div>
          </div>
        </div>

        <div class="progress-area">
          <div class="progress-meta">
            <span class="progress-label">进度</span>
            <span class="progress-value">{{ Math.round(progress * 100) }}%</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: (progress * 100) + '%' }"
              >
                <div class="progress-thumb"></div>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="Math.round(progress * 100)"
              @input="handleProgressDrag"
              class="progress-input"
              :disabled="totalMoves === 0"
            />
          </div>
        </div>
      </div>

      <div class="moves-table" v-if="allMoves.length > 0">
        <div class="table-title">
          <span>调运明细</span>
          <span class="table-count">共 {{ allMoves.length }} 条</span>
        </div>
        <div class="table-scroll">
          <table class="moves-table-inner">
            <thead>
              <tr>
                <th style="width:60px">序号</th>
                <th>源围栏</th>
                <th>目标围栏</th>
                <th style="width:100px">车数</th>
                <th style="width:120px">距离</th>
                <th style="width:100px">进度</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(m, idx) in allMoves"
                :key="idx"
                :class="{ active: isMoveActive(idx) }"
              >
                <td>{{ idx + 1 }}</td>
                <td>
                  <span class="from-tag">{{ m.fromName || '违停区' }}</span>
                </td>
                <td>
                  <span class="to-tag">{{ m.toName || '-' }}</span>
                </td>
                <td class="num-cell">{{ m.bikeCount }} 辆</td>
                <td class="num-cell">{{ (m.distance / 1000).toFixed(2) }} km</td>
                <td>
                  <div class="move-progress">
                    <div class="move-progress-bar">
                      <div
                        class="move-progress-fill"
                        :style="{ width: (getMoveProgress(idx) * 100) + '%' }"
                      ></div>
                    </div>
                    <span class="move-progress-text">{{ Math.round(getMoveProgress(idx) * 100) }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import BikeMap from '@/components/BikeMap.vue'
import { dispatch } from '@/api'

const taskList = ref([])
const selectedTaskId = ref(null)
const currentTask = ref(null)

const beforeFences = ref([])
const afterFences = ref([])
const allMoves = ref([])

const progress = ref(0)
const isPlaying = ref(false)
const playSpeed = ref(1)
let playTimer = null

const toast = reactive({ show: false, type: 'success', message: '' })

function showToast(message, type = 'success') {
  toast.message = message
  toast.type = type
  toast.show = true
  setTimeout(() => (toast.show = false), 3000)
}

const totalBefore = computed(() => {
  return beforeFences.value.reduce((sum, f) => sum + (f.currentCount || 0), 0)
})

const totalAfter = computed(() => {
  return afterFences.value.reduce((sum, f) => sum + (f.currentCount || 0), 0)
})

const balanceScore = computed(() => {
  if (afterFences.value.length === 0) return 0
  let variance = 0
  let avgSat = 0
  afterFences.value.forEach((f) => {
    const sat = f.capacity > 0 ? (f.currentCount || 0) / f.capacity : 0
    avgSat += sat
  })
  avgSat = avgSat / afterFences.value.length
  afterFences.value.forEach((f) => {
    const sat = f.capacity > 0 ? (f.currentCount || 0) / f.capacity : 0
    variance += Math.pow(sat - avgSat, 2)
  })
  variance = variance / afterFences.value.length
  const score = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 100))
  return score.toFixed(0)
})

const totalMoves = computed(() => allMoves.value.length)
const totalBikesMoved = computed(() =>
  allMoves.value.reduce((sum, m) => sum + (m.bikeCount || 0), 0)
)

const taskDistance = computed(() => currentTask.value?.total_distance || 0)
const greedyDistance = computed(() => currentTask.value?.greedy_distance || 0)
const distanceSaved = computed(() => currentTask.value?.distance_saved || 0)

const displayDistance = computed(() => {
  const target = taskDistance.value * progress.value + taskDistance.value * (1 - progress.value) * 0.3
  return (target / 1000).toFixed(2)
})

const greedyDistanceDisplay = computed(() => (greedyDistance.value / 1000).toFixed(2))
const savedPercentDisplay = computed(() => {
  if (greedyDistance.value <= 0) return 0
  return ((distanceSaved.value / greedyDistance.value) * 100).toFixed(1)
})

const movesBeforeProgress = computed(() => {
  return allMoves.value.map((m, idx) => ({
    fromX: m.fromX || m.fromFenceCenter?.x || 10,
    fromY: m.fromY || m.fromFenceCenter?.y || 10,
    toX: m.toX || m.toFenceCenter?.x || 50,
    toY: m.toY || m.toFenceCenter?.y || 50,
    bikeCount: m.bikeCount || 1,
    progress: Math.max(0, Math.min(1, getMoveProgress(idx)))
  }))
})

const movesAfterProgress = computed(() => {
  return allMoves.value.map((m, idx) => ({
    fromX: m.fromX || m.fromFenceCenter?.x || 10,
    fromY: m.fromY || m.fromFenceCenter?.y || 10,
    toX: m.toX || m.toFenceCenter?.x || 50,
    toY: m.toY || m.toFenceCenter?.y || 50,
    bikeCount: m.bikeCount || 1,
    progress: Math.max(0, Math.min(1, getMoveProgress(idx)))
  }))
})

function getMoveProgress(idx) {
  if (totalMoves.value === 0) return 0
  const p = progress.value * totalMoves.value
  const moveStart = idx
  const moveEnd = idx + 0.8
  if (p <= moveStart) return 0
  if (p >= moveEnd) return 1
  return (p - moveStart) / 0.8
}

function isMoveActive(idx) {
  const p = progress.value * totalMoves.value
  return p >= idx && p < idx + 1
}

async function loadTaskList() {
  try {
    const res = await dispatch.list({ pageSize: 50 })
    taskList.value = res.data || []
  } catch (err) {
    console.error('加载任务列表失败:', err)
  }
}

async function loadTaskDetail() {
  if (!selectedTaskId.value) {
    currentTask.value = null
    beforeFences.value = []
    afterFences.value = []
    allMoves.value = []
    progress.value = 0
    return
  }
  try {
    const res = await dispatch.detail(selectedTaskId.value)
    const data = res.data || {}
    currentTask.value = data

    const snapBefore = data.snapshotBefore || { fences: [] }
    const snapAfter = data.snapshotAfter || snapBefore

    beforeFences.value = buildFencesFromSnapshot(snapBefore, 0)
    afterFences.value = buildFencesFromSnapshot(snapAfter, 1)

    allMoves.value = (data.moves || []).map((m) => {
      const fromFence = snapBefore.fences?.find((f) => f.id === m.from_fence_id)
      const toFence = (snapAfter.fences || snapBefore.fences || []).find((f) => f.id === m.to_fence_id)
      return {
        ...m,
        fromName: fromFence?.name || (m.from_fence_id == null ? '违停区' : `围栏#${m.from_fence_id}`),
        toName: toFence?.name || `围栏#${m.to_fence_id}`,
        bikeCount: m.bike_count,
        fromFenceCenter: fromFence
          ? { x: fromFence.centerX, y: fromFence.centerY }
          : { x: Math.random() * 30, y: Math.random() * 30 },
        toFenceCenter: toFence
          ? { x: toFence.centerX, y: toFence.centerY }
          : { x: 50 + Math.random() * 40, y: 50 + Math.random() * 40 }
      }
    })
    progress.value = 0
  } catch (err) {
    console.error('加载任务详情失败:', err)
    showToast('加载任务详情失败', 'error')
  }
}

function buildFencesFromSnapshot(snapshot, phase) {
  const rawFences = snapshot.fences || []
  const fenceMap = {}
  rawFences.forEach((f) => {
    const cx = f.centerX || f.center_x || 10 + Math.random() * 80
    const cy = f.centerY || f.center_y || 10 + Math.random() * 80
    const count = phase === 1 ? (f.currentCount || 0) : (f.currentCount || 0)
    const capacity = f.capacity || 50
    fenceMap[f.id] = {
      id: f.id,
      name: f.name || `围栏${f.id}`,
      district: f.district || '默认区',
      capacity,
      centerX: cx,
      centerY: cy,
      currentCount: count,
      saturation: capacity > 0 ? count / capacity : 0,
      points: generatePolygon(cx, cy)
    }
  })
  return Object.values(fenceMap)
}

function generatePolygon(cx, cy) {
  const r = 4 + Math.random() * 3
  const sides = 4 + Math.floor(Math.random() * 2)
  const pts = []
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.4
    const rr = r * (0.8 + Math.random() * 0.4)
    pts.push({
      x: cx + Math.cos(angle) * rr,
      y: cy + Math.sin(angle) * rr
    })
  }
  return pts
}

function generateMockTask() {
  const districts = ['朝阳区', '海淀区', '东城区', '西城区']
  const fenceCount = 8 + Math.floor(Math.random() * 5)
  const mockFences = []
  const mockMoves = []
  let totalDist = 0
  let greedyDist = 0

  for (let i = 0; i < fenceCount; i++) {
    const cx = 12 + (i % 4) * 20 + Math.random() * 6
    const cy = 12 + Math.floor(i / 4) * 30 + Math.random() * 10
    const capacity = 30 + Math.floor(Math.random() * 50)
    const currentCount = phase => {
      if (phase === 0) {
        return i % 3 === 0
          ? Math.floor(capacity * (0.05 + Math.random() * 0.15))
          : i % 3 === 1
            ? Math.floor(capacity * (0.85 + Math.random() * 0.12))
            : Math.floor(capacity * (0.3 + Math.random() * 0.3))
      }
      return Math.floor(capacity * (0.45 + Math.random() * 0.2))
    }
    mockFences.push({
      id: i + 1,
      name: ['中关村', '望京', '国贸', '西单', '三里屯', '亚运村', '五道口', '上地', '亦庄', '通州'][i] || `围栏${i + 1}`,
      district: districts[i % districts.length],
      capacity,
      centerX: cx,
      centerY: cy,
      currentCount0: currentCount(0),
      currentCount1: currentCount(1)
    })
  }

  const moveCount = 3 + Math.floor(Math.random() * 4)
  const used = new Set()
  for (let i = 0; i < moveCount; i++) {
    let fromIdx, toIdx
    let attempts = 0
    do {
      fromIdx = Math.floor(Math.random() * mockFences.length)
      toIdx = Math.floor(Math.random() * mockFences.length)
      attempts++
    } while (
      (fromIdx === toIdx || used.has(`${fromIdx}-${toIdx}`)) &&
      attempts < 30
    )
    used.add(`${fromIdx}-${toIdx}`)
    const from = mockFences[fromIdx]
    const to = mockFences[toIdx]
    const bikeCount = 2 + Math.floor(Math.random() * 8)
    const dx = to.centerX - from.centerX
    const dy = to.centerY - from.centerY
    const dist = Math.sqrt(dx * dx + dy * dy) * 800 + Math.random() * 400
    totalDist += dist
    greedyDist += dist * (1.3 + Math.random() * 0.4)

    mockMoves.push({
      id: i + 1,
      from_fence_id: from.id,
      to_fence_id: to.id,
      bike_count: bikeCount,
      distance: Math.round(dist),
      status: 'completed',
      fromName: from.name,
      toName: to.name,
      bikeCount: bikeCount,
      fromFenceCenter: { x: from.centerX, y: from.centerY },
      toFenceCenter: { x: to.centerX, y: to.centerY }
    })

    const moved = Math.min(bikeCount, from.currentCount0)
    from.currentCount0 -= moved
    to.currentCount0 = Math.min(to.capacity, to.currentCount0 + moved)
  }

  return { mockFences, mockMoves, totalDist, greedyDist }
}

async function generateSim() {
  try {
    isPlaying.value = false
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = null
    }
    const gen = generateMockTask()

    beforeFences.value = gen.mockFences.map((f) => ({
      id: f.id,
      name: f.name,
      district: f.district,
      capacity: f.capacity,
      centerX: f.centerX,
      centerY: f.centerY,
      currentCount: f.currentCount0,
      saturation: f.capacity > 0 ? f.currentCount0 / f.capacity : 0,
      points: generatePolygon(f.centerX, f.centerY)
    }))

    afterFences.value = gen.mockFences.map((f) => ({
      id: f.id,
      name: f.name,
      district: f.district,
      capacity: f.capacity,
      centerX: f.centerX,
      centerY: f.centerY,
      currentCount: Math.round(f.currentCount0 * 0.8 + f.capacity * 0.45 * 0.2),
      saturation: 0.45,
      points: generatePolygon(f.centerX, f.centerY)
    }))

    allMoves.value = gen.mockMoves
    currentTask.value = {
      task_no: `SIM${Date.now()}`,
      total_distance: gen.totalDist,
      greedy_distance: gen.greedyDist,
      distance_saved: gen.greedyDist - gen.totalDist
    }
    progress.value = 0
    showToast('模拟数据生成成功')
  } catch (err) {
    console.error('生成模拟数据失败:', err)
    showToast('生成模拟数据失败', 'error')
  }
}

function togglePlay() {
  if (totalMoves.value === 0) return
  if (isPlaying.value) {
    stopPlay()
  } else {
    startPlay()
  }
}

function startPlay() {
  isPlaying.value = true
  if (progress.value >= 1) progress.value = 0
  if (playTimer) clearInterval(playTimer)
  playTimer = setInterval(() => {
    progress.value += 0.02 * playSpeed.value
    if (progress.value >= 1) {
      progress.value = 1
      stopPlay()
    }
  }, 80)
}

function stopPlay() {
  isPlaying.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

function resetProgress() {
  stopPlay()
  progress.value = 0
}

function handleProgressDrag(e) {
  progress.value = Number(e.target.value) / 100
}

watch(() => progress.value, () => {
  if (beforeFences.value.length === 0 || totalMoves.value === 0) return
  const p = progress.value
  beforeFences.value.forEach((f) => {
    const target = afterFences.value.find((af) => af.id === f.id)
    if (target) {
      f.currentCount = Math.round(f.currentCount * (1 - p * 0.5) + target.currentCount * (p * 0.5))
      f.saturation = f.capacity > 0 ? f.currentCount / f.capacity : 0
    }
  })
  afterFences.value.forEach((f) => {
    const src = beforeFences.value.find((bf) => bf.id === f.id)
    if (src) {
      const base = afterFences.value.find((af) => af.id === f.id)
      f.saturation = base.capacity > 0 ? base.currentCount / base.capacity : 0
    }
  })
})

onMounted(() => {
  loadTaskList()
})

onBeforeUnmount(() => {
  stopPlay()
})
</script>

<style scoped>
.replay {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.replay-header {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.task-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selector-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.selector-input {
  min-width: 320px;
  padding: 9px 32px 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5L10 12l4.5-4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.selector-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.btn {
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-generate {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  color: #fff;
  box-shadow: 0 1px 3px rgba(139, 92, 246, 0.3);
}

.btn-generate:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.btn-icon {
  font-size: 16px;
}

.maps-section {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: stretch;
}

.map-panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}

.before-header {
  background: linear-gradient(90deg, #fef2f2, #fff);
  border-bottom-color: #fecaca;
}

.after-header {
  background: linear-gradient(90deg, #f0fdf4, #fff);
  border-bottom-color: #bbf7d0;
}

.panel-icon {
  font-size: 18px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  flex: 1;
}

.panel-stats {
  display: flex;
  gap: 8px;
}

.stat-pill {
  padding: 4px 10px;
  background: #fff;
  border-radius: 12px;
  font-size: 12px;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.stat-pill strong {
  color: #1f2937;
  font-weight: 600;
}

.panel-body {
  flex: 1;
  padding: 14px;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.vs-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 4px;
}

.vs-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
  flex-shrink: 0;
  z-index: 1;
}

.vs-line {
  flex: 1;
  width: 2px;
  background: linear-gradient(180deg, #fecaca, #bbf7d0);
  border-radius: 2px;
}

.empty-map {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  min-height: 380px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-text {
  color: #9ca3af;
  font-size: 14px;
}

.timeline-section {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card-mini {
  background: #f9fafb;
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
}

.stat-card-mini.highlight {
  background: linear-gradient(135deg, #ecfdf5, #f0fdfa);
  border-color: #a7f3d0;
}

.stat-mini-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.stat-mini-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

.stat-mini-value .unit {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  margin-left: 2px;
}

.stat-mini-value.saved {
  color: #059669;
}

.saved-arrow {
  color: #10b981;
  font-size: 18px;
  margin-right: 2px;
}

.stat-mini-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
}

.player-section {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 24px;
  align-items: center;
  padding: 16px 20px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}

.play-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.play-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  transition: all 0.2s;
}

.play-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.play-btn:disabled {
  background: #d1d5db;
  cursor: not-allowed;
  box-shadow: none;
}

.play-btn.playing {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.ctrl-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
  transition: all 0.2s;
}

.ctrl-btn:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #93c5fd;
}

.ctrl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.speed-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid #e5e7eb;
}

.speed-label {
  font-size: 12px;
  color: #6b7280;
}

.speed-btns {
  display: flex;
  gap: 4px;
}

.speed-btn {
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;
  font-weight: 500;
}

.speed-btn:hover {
  background: #f3f4f6;
}

.speed-btn.active {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.progress-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.progress-label {
  color: #6b7280;
  font-weight: 500;
}

.progress-value {
  color: #2563eb;
  font-weight: 600;
}

.progress-bar-wrap {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
}

.progress-bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 4px;
  position: relative;
  transition: width 0.08s linear;
}

.progress-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: #fff;
  border: 3px solid #3b82f6;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.progress-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
  height: 32px;
}

.moves-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.table-count {
  font-size: 12px;
  color: #6b7280;
  font-weight: 400;
}

.table-scroll {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.moves-table-inner {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.moves-table-inner th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 1;
}

.moves-table-inner td {
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
}

.moves-table-inner tbody tr {
  transition: background 0.15s;
}

.moves-table-inner tbody tr:hover {
  background: #f9fafb;
}

.moves-table-inner tbody tr.active {
  background: #eff6ff;
}

.num-cell {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.from-tag {
  display: inline-block;
  padding: 3px 10px;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
}

.to-tag {
  display: inline-block;
  padding: 3px 10px;
  background: #dcfce7;
  color: #166534;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
}

.move-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.move-progress-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.move-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f97316, #fb923c);
  border-radius: 3px;
}

.move-progress-text {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  width: 34px;
  text-align: right;
}

.toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.toast.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.toast.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .maps-section {
    grid-template-columns: 1fr;
  }
  .vs-divider {
    flex-direction: row;
    padding: 4px 0;
  }
  .vs-line {
    width: 100%;
    height: 2px;
    flex: 1;
  }
  .player-section {
    grid-template-columns: 1fr;
  }
}
</style>
