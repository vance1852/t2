<template>
  <div class="map-dispatch-page">
    <div class="map-area">
      <BikeMap
        :moves="currentDispatchMoves"
        :selectedFenceId="highlightFenceId"
        :editingMode="editingMode"
        :fences="fences"
        :bikes="bikes"
        @fenceClick="handleFenceClick"
        @drawingComplete="handleDrawFinish"
        @selectionChange="handleSelectionChange"
      />
    </div>

    <div class="control-panel">
      <div class="panel-header">
        <h2 class="panel-title">调度控制台</h2>
        <div class="control-toggles">
          <label class="toggle-item">
            <input type="checkbox" v-model="showFences" />
            <span>围栏</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" v-model="showBikes" />
            <span>单车</span>
          </label>
          <label class="toggle-item" :class="{ active: editingMode }">
            <input type="checkbox" v-model="editingMode" />
            <span>画围栏</span>
          </label>
        </div>
      </div>

      <div class="tabs">
        <div
          class="tab-item"
          :class="{ active: activeTab === 'monitor' }"
          @click="activeTab = 'monitor'"
        >
          实时监控
        </div>
        <div
          class="tab-item"
          :class="{ active: activeTab === 'tasks' }"
          @click="activeTab = 'tasks'"
        >
          调运任务
          <span v-if="activeTaskCount > 0" class="tab-badge">{{ activeTaskCount }}</span>
        </div>
      </div>

      <div class="tab-content">
        <div v-if="activeTab === 'monitor'" class="monitor-tab">
          <div class="stats-grid">
            <div class="stat-card stat-fences">
              <div class="stat-icon">📍</div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.fenceCount }}</div>
                <div class="stat-label">围栏总数</div>
              </div>
            </div>
            <div class="stat-card stat-bikes">
              <div class="stat-icon">🚲</div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.totalBikes }}</div>
                <div class="stat-label">总车数</div>
              </div>
            </div>
            <div class="stat-card stat-illegal">
              <div class="stat-icon">⚠️</div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.illegalCount }}</div>
                <div class="stat-label">违停数</div>
              </div>
            </div>
            <div class="stat-card stat-fault">
              <div class="stat-icon">🔧</div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.faultCount }}</div>
                <div class="stat-label">故障数</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title">围栏饱和度排行</h3>
              <span class="refresh-time">更新: {{ lastRefreshTime }}</span>
            </div>
            <div class="fence-ranking">
              <div
                v-for="(fence, idx) in topSaturatedFences"
                :key="fence.id"
                class="ranking-item"
                :class="{ highlighted: highlightFenceId === fence.id }"
                @click="toggleHighlightFence(fence.id)"
              >
                <div class="rank-num">{{ idx + 1 }}</div>
                <div class="rank-content">
                  <div class="rank-header">
                    <span class="fence-name">{{ fence.name }}</span>
                    <span
                      class="sat-badge"
                      :class="getSaturationClass(fence)"
                    >
                      {{ formatPercent(fence.bikeCount / fence.capacity) }}
                    </span>
                  </div>
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :class="getSaturationClass(fence)"
                      :style="{ width: formatPercent(fence.bikeCount / fence.capacity) }"
                    ></div>
                  </div>
                  <div class="rank-footer">
                    <span>{{ fence.bikeCount }}/{{ fence.capacity }} 辆</span>
                    <span class="district-tag">{{ fence.district }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="action-section">
            <button
              class="generate-btn"
              :class="{ loading: generating }"
              :disabled="generating"
              @click="handleGenerateDispatch"
            >
              <span v-if="generating" class="btn-spinner"></span>
              {{ generating ? '正在生成...' : '📦 生成调运任务' }}
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'tasks'" class="tasks-tab">
          <div v-if="currentTask" class="current-task-card">
            <div class="task-header">
              <h3 class="task-title">当前调度任务</h3>
              <span class="task-status" :class="currentTask.status">
                {{ getStatusText(currentTask.status) }}
              </span>
            </div>
            <div class="task-metrics">
              <div class="metric-item">
                <div class="metric-value positive">
                  {{ currentTask.savingPercent || 0 }}%
                </div>
                <div class="metric-label">距离节省</div>
              </div>
              <div class="metric-item">
                <div class="metric-value">
                  {{ currentTask.optimizedDistance || 0 }}m
                </div>
                <div class="metric-label">优化后总距离</div>
              </div>
              <div class="metric-item">
                <div class="metric-value muted">
                  {{ currentTask.greedyDistance || 0 }}m
                </div>
                <div class="metric-label">贪心距离</div>
              </div>
            </div>

            <div class="section-subtitle">调运路线 ({{ currentTask.moves?.length || 0 }})</div>
            <div class="moves-list">
              <div
                v-for="move in currentTask.moves"
                :key="move.id"
                class="move-item"
                :class="{ completed: move.status === 'completed' }"
              >
                <div class="move-route">
                  <div class="move-from">{{ getFenceName(move.fromFenceId) }}</div>
                  <div class="move-arrow">→</div>
                  <div class="move-to">{{ getFenceName(move.toFenceId) }}</div>
                </div>
                <div class="move-details">
                  <span class="move-count">{{ move.bikeCount }} 辆</span>
                  <span class="move-distance">{{ move.distance }}m</span>
                </div>
                <div class="move-actions">
                  <button
                    v-if="move.status !== 'completed'"
                    class="complete-btn"
                    @click="handleCompleteMove(move.id)"
                  >
                    完成
                  </button>
                  <span v-else class="completed-tag">✓ 已完成</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="no-active-task">
            <div class="empty-icon">📋</div>
            <div class="empty-text">暂无进行中的调运任务</div>
            <button class="generate-btn-sm" @click="activeTab = 'monitor'">
              去生成任务
            </button>
          </div>

          <div class="section">
            <div class="section-header">
              <h3 class="section-title">历史任务</h3>
            </div>
            <div class="history-list">
              <div
                v-for="task in historyTasks"
                :key="task.id"
                class="history-item"
                @click="viewTaskDetail(task)"
              >
                <div class="history-main">
                  <div class="history-id">#{{ task.id }}</div>
                  <div class="history-meta">
                    <span>{{ task.moveCount }} 次调运</span>
                    <span>{{ task.totalBikes }} 辆</span>
                  </div>
                </div>
                <div class="history-right">
                  <span class="history-status" :class="task.status">
                    {{ getStatusText(task.status) }}
                  </span>
                  <span class="history-time">{{ formatTime(task.createdAt) }}</span>
                </div>
              </div>
              <div v-if="historyTasks.length === 0" class="empty-history">
                暂无历史记录
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import BikeMap from '@/components/BikeMap.vue'
import { publicMap, dispatch } from '@/api'

const activeTab = ref('monitor')
const showFences = ref(true)
const showBikes = ref(true)
const showArrows = ref(false)
const editingMode = ref(false)
const highlightFenceId = ref(null)
const generating = ref(false)

const fences = ref([])
const bikes = ref([])
const stats = ref({
  fenceCount: 0,
  totalBikes: 0,
  illegalCount: 0,
  faultCount: 0
})
const lastRefreshTime = ref('--:--:--')
const currentTask = ref(null)
const historyTasks = ref([])

const POLL_INTERVAL = 30000
let pollTimer = null

const topSaturatedFences = computed(() => {
  return [...fences.value]
    .sort((a, b) => {
      const satA = a.capacity ? a.bikeCount / a.capacity : 0
      const satB = b.capacity ? b.bikeCount / b.capacity : 0
      return satB - satA
    })
    .slice(0, 10)
})

const activeTaskCount = computed(() => {
  if (!currentTask.value || !currentTask.value.moves) return 0
  return currentTask.value.moves.filter(m => m.status !== 'completed').length
})

const currentDispatchMoves = computed(() => {
  if (!currentTask.value || !currentTask.value.moves) return []
  return currentTask.value.moves.map(move => {
    const fromFence = fences.value.find(f => f.id === move.fromFenceId)
    const toFence = fences.value.find(f => f.id === move.toFenceId)
    return {
      ...move,
      fromX: fromFence?.centerLon || 0,
      fromY: fromFence?.centerLat || 0,
      toX: toFence?.centerLon || 0,
      toY: toFence?.centerLat || 0
    }
  })
})

async function loadMapData() {
  try {
    const data = await publicMap.mapData()
    fences.value = data.fences || []
    bikes.value = data.bikes || []
    stats.value = {
      fenceCount: data.stats?.fenceCount || 0,
      totalBikes: data.stats?.totalBikes || 0,
      illegalCount: data.stats?.illegalCount || 0,
      faultCount: data.stats?.faultCount || 0
    }
    const now = new Date()
    lastRefreshTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  } catch (err) {
    console.error('加载地图数据失败:', err)
  }
}

async function loadDispatchTasks() {
  try {
    const data = await dispatch.list({ pageSize: 10 })
    const list = data.list || data || []
    const active = list.find(t => t.status === 'pending' || t.status === 'processing')
    if (active) {
      currentTask.value = await dispatch.detail(active.id)
    } else {
      currentTask.value = null
    }
    historyTasks.value = list
      .filter(t => t.status === 'completed' || t.status === 'cancelled')
      .slice(0, 5)
  } catch (err) {
    console.error('加载调运任务失败:', err)
  }
}

function formatPercent(value) {
  if (!value && value !== 0) return '0%'
  return Math.round(value * 100) + '%'
}

function getSaturationClass(fence) {
  const sat = fence.capacity ? fence.bikeCount / fence.capacity : 0
  if (sat < 0.7) return 'low'
  if (sat <= 0.95) return 'medium'
  return 'high'
}

function getFenceName(id) {
  const fence = fences.value.find(f => f.id === id)
  return fence?.name || `围栏#${id}`
}

function getStatusText(status) {
  const map = {
    pending: '待执行',
    processing: '进行中',
    completed: '已完成',
    cancelled: '已取消'
  }
  return map[status] || status
}

function formatTime(timeStr) {
  if (!timeStr) return '--'
  const d = new Date(timeStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function handleFenceClick(fence) {
  highlightFenceId.value = highlightFenceId.value === fence.id ? null : fence.id
}

function handleSelectionChange(id) {
  highlightFenceId.value = id
}

function handleDrawFinish(points) {
  editingMode.value = false
  console.log('新围栏坐标:', points)
}

function toggleHighlightFence(id) {
  highlightFenceId.value = highlightFenceId.value === id ? null : id
}

async function handleGenerateDispatch() {
  generating.value = true
  try {
    const task = await dispatch.generate()
    currentTask.value = task
    showArrows.value = true
    activeTab.value = 'tasks'
  } catch (err) {
    console.error('生成调运任务失败:', err)
  } finally {
    generating.value = false
  }
}

async function handleCompleteMove(moveId) {
  if (!currentTask.value) return
  try {
    await dispatch.completeMove(currentTask.value.id, moveId)
    const updated = await dispatch.detail(currentTask.value.id)
    currentTask.value = updated
    await loadMapData()
  } catch (err) {
    console.error('完成调运失败:', err)
  }
}

function viewTaskDetail(task) {
  console.log('查看任务详情:', task)
}

function startPolling() {
  pollTimer = setInterval(async () => {
    await loadMapData()
    if (currentTask.value && (currentTask.value.status === 'pending' || currentTask.value.status === 'processing')) {
      await loadDispatchTasks()
    }
  }, POLL_INTERVAL)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await loadMapData()
  await loadDispatchTasks()
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.map-dispatch-page {
  display: flex;
  width: 100%;
  height: calc(100vh - 80px);
  gap: 16px;
  padding: 0;
  box-sizing: border-box;
}

.map-area {
  width: 70%;
  height: 100%;
  min-width: 0;
}

.control-panel {
  width: 30%;
  min-width: 340px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.panel-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.control-toggles {
  display: flex;
  gap: 16px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
  user-select: none;
}

.toggle-item input {
  cursor: pointer;
  accent-color: #667eea;
}

.toggle-item.active {
  color: #667eea;
  font-weight: 500;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #f3f4f6;
  padding: 0 20px;
}

.tab-item {
  padding: 12px 20px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}

.tab-item:hover {
  color: #374151;
}

.tab-item.active {
  color: #667eea;
  border-bottom-color: #667eea;
  font-weight: 500;
}

.tab-badge {
  position: absolute;
  top: 8px;
  right: 4px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  padding: 14px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-fences {
  background: linear-gradient(135deg, #ede9fe, #ddd6fe);
}

.stat-bikes {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
}

.stat-illegal {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
}

.stat-fault {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
}

.stat-icon {
  font-size: 28px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.refresh-time {
  font-size: 11px;
  color: #9ca3af;
}

.fence-ranking {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.ranking-item:hover {
  background: #f3f4f6;
}

.ranking-item.highlighted {
  border-color: #667eea;
  background: #eef2ff;
}

.rank-num {
  width: 22px;
  height: 22px;
  background: #667eea;
  color: #fff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.ranking-item:nth-child(2) .rank-num {
  background: #8b5cf6;
}

.ranking-item:nth-child(3) .rank-num {
  background: #a78bfa;
}

.rank-content {
  flex: 1;
  min-width: 0;
}

.rank-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.fence-name {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sat-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.sat-badge.low {
  background: #dcfce7;
  color: #15803d;
}

.sat-badge.medium {
  background: #fef9c3;
  color: #a16207;
}

.sat-badge.high {
  background: #fee2e2;
  color: #b91c1c;
}

.progress-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-fill.low {
  background: linear-gradient(90deg, #4ade80, #22c55e);
}

.progress-fill.medium {
  background: linear-gradient(90deg, #facc15, #eab308);
}

.progress-fill.high {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

.rank-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6b7280;
}

.district-tag {
  background: #e5e7eb;
  padding: 1px 8px;
  border-radius: 8px;
}

.action-section {
  padding: 4px 0;
}

.generate-btn {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.35);
}

.generate-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tasks-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.current-task-card {
  background: linear-gradient(135deg, #f0f9ff, #eef2ff);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #e0e7ff;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.task-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.task-status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 12px;
}

.task-status.pending {
  background: #fef3c7;
  color: #a16207;
}

.task-status.processing {
  background: #dbeafe;
  color: #1d4ed8;
}

.task-status.completed {
  background: #dcfce7;
  color: #15803d;
}

.task-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
}

.metric-item {
  text-align: center;
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.metric-value.positive {
  color: #15803d;
}

.metric-value.muted {
  color: #9ca3af;
  font-size: 14px;
}

.metric-label {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}

.section-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 10px;
}

.moves-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.move-item {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
}

.move-item.completed {
  opacity: 0.6;
  background: #f9fafb;
}

.move-route {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.move-from,
.move-to {
  font-weight: 500;
  color: #1f2937;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.move-arrow {
  color: #667eea;
  font-weight: 700;
}

.move-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.move-count {
  font-weight: 600;
  color: #667eea;
}

.move-actions {
  display: flex;
  justify-content: flex-end;
}

.complete-btn {
  padding: 6px 16px;
  background: #22c55e;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.complete-btn:hover {
  background: #16a34a;
}

.completed-tag {
  font-size: 12px;
  color: #15803d;
  font-weight: 500;
}

.no-active-task {
  background: #f9fafb;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
}

.generate-btn-sm {
  padding: 8px 20px;
  background: #667eea;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.generate-btn-sm:hover {
  background: #5b69e5;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: #f3f4f6;
}

.history-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.history-id {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.history-meta {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #6b7280;
}

.history-right {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-status {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
}

.history-status.completed {
  background: #dcfce7;
  color: #15803d;
}

.history-status.cancelled {
  background: #fee2e2;
  color: #b91c1c;
}

.history-time {
  font-size: 11px;
  color: #9ca3af;
}

.empty-history {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .map-dispatch-page {
    flex-direction: column;
    height: auto;
  }

  .map-area {
    width: 100%;
    height: 500px;
  }

  .control-panel {
    width: 100%;
    min-width: 0;
  }
}
</style>
