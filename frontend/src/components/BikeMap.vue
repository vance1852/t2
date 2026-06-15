<template>
  <div class="bike-map" ref="mapContainer" @click="handleMapClick">
    <svg
      class="map-svg"
      :viewBox="`0 0 ${mapWidth} ${mapHeight}`"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="grid" :width="gridSize" :height="gridSize" patternUnits="userSpaceOnUse">
          <path
            :d="`M ${gridSize} 0 L 0 0 0 ${gridSize}`"
            fill="none"
            stroke="#e5e7eb"
            stroke-width="0.5"
          />
        </pattern>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      <g v-for="fence in displayFences" :key="`fence-${fence.id}`">
        <polygon
          :points="getPolygonPoints(fence)"
          :fill="getFenceFillColor(fence)"
          :stroke="selectedFenceId === fence.id ? '#3b82f6' : '#6b7280'"
          :stroke-width="selectedFenceId === fence.id ? 3 : 1.5"
          class="fence-polygon"
          :class="{ clickable: !editingMode }"
          @click.stop="handleFenceClick(fence)"
        />
        <text
          :x="fence.centerX * scaleX"
          :y="fence.centerY * scaleY"
          text-anchor="middle"
          dominant-baseline="middle"
          class="fence-label"
          font-size="12"
          fill="#374151"
          font-weight="500"
        >
          {{ showCounts ? `${fence.name}(${getCurrentCount(fence)}/${fence.capacity})` : fence.name }}
        </text>
        <circle
          v-if="showCounts"
          :cx="fence.centerX * scaleX"
          :cy="(fence.centerY * scaleY) + 18"
          :r="16"
          :fill="getSaturationColor(getFenceSaturation(fence))"
          opacity="0.9"
        />
        <text
          v-if="showCounts"
          :x="fence.centerX * scaleX"
          :y="(fence.centerY * scaleY) + 22"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="11"
          fill="#fff"
          font-weight="600"
        >
          {{ Math.round(getFenceSaturation(fence) * 100) }}%
        </text>
      </g>

      <polygon
        v-if="drawingPoints.length > 0"
        :points="getDrawingPolygonPoints()"
        fill="rgba(59, 130, 246, 0.2)"
        stroke="#3b82f6"
        stroke-width="2"
        stroke-dasharray="5,5"
      />
      <g v-for="(pt, idx) in drawingPoints" :key="`pt-${idx}`">
        <circle
          :cx="pt.x * scaleX"
          :cy="pt.y * scaleY"
          r="5"
          fill="#3b82f6"
          stroke="#fff"
          stroke-width="2"
        />
        <line
          v-if="idx > 0"
          :x1="drawingPoints[idx - 1].x * scaleX"
          :y1="drawingPoints[idx - 1].y * scaleY"
          :x2="pt.x * scaleX"
          :y2="pt.y * scaleY"
          stroke="#3b82f6"
          stroke-width="2"
        />
      </g>

      <g v-for="bike in displayBikes" :key="`bike-${bike.id}`">
        <circle
          :cx="bike.x * scaleX"
          :cy="bike.y * scaleY"
          r="bike.status === 'illegal' ? 8 : 5"
          :fill="getBikeColor(bike.status)"
          stroke="#fff"
          stroke-width="1.5"
          class="bike-dot"
        />
        <text
          v-if="bike.status === 'illegal'"
          :x="bike.x * scaleX"
          :y="bike.y * scaleY"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="9"
          fill="#fff"
        >!</text>
      </g>

      <g v-if="highlightPoint">
        <circle
          :cx="highlightPoint.x * scaleX"
          :cy="highlightPoint.y * scaleY"
          r="14"
          fill="none"
          stroke="#ef4444"
          stroke-width="3"
          class="pulse-ring"
        />
        <circle
          :cx="highlightPoint.x * scaleX"
          :cy="highlightPoint.y * scaleY"
          r="7"
          fill="#ef4444"
          stroke="#fff"
          stroke-width="2"
        />
      </g>

      <g v-for="(move, idx) in displayMoves" :key="`move-${idx}`">
        <line
          :x1="move.fromX * scaleX"
          :y1="move.fromY * scaleY"
          :x2="move.toX * scaleX"
          :y2="move.toY * scaleY"
          stroke="#f97316"
          :stroke-width="2 + Math.log10(move.bikeCount + 1) * 2"
          :stroke-opacity="move.progress != null ? 0.3 + move.progress * 0.7 : 1"
          marker-end="url(#arrowhead)"
          class="move-arrow"
        />
        <text
          :x="((move.fromX + move.toX) / 2) * scaleX"
          :y="((move.fromY + move.toY) / 2) * scaleY - 8"
          text-anchor="middle"
          font-size="11"
          fill="#f97316"
          font-weight="600"
        >
          {{ move.bikeCount }}辆
        </text>
      </g>
    </svg>

    <div v-if="editingMode" class="editing-tips">
      <span class="tip-text">点击地图添加顶点，至少添加 3 个点</span>
      <span class="tip-count">已添加: {{ drawingPoints.length }} 个点</span>
      <div class="editing-actions">
        <button class="btn btn-undo" @click.stop="undoLastPoint" :disabled="drawingPoints.length === 0">
          撤销
        </button>
        <button class="btn btn-clear" @click.stop="clearDrawing" :disabled="drawingPoints.length === 0">
          清空
        </button>
        <button
          class="btn btn-finish"
          @click.stop="finishDrawing"
          :disabled="drawingPoints.length < 3"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  fences: {
    type: Array,
    default: () => []
  },
  bikes: {
    type: Array,
    default: () => []
  },
  editingMode: {
    type: Boolean,
    default: false
  },
  showCounts: {
    type: Boolean,
    default: true
  },
  highlightPoint: {
    type: Object,
    default: null
  },
  moves: {
    type: Array,
    default: () => []
  },
  selectedFenceId: {
    type: Number,
    default: null
  },
  mapWidth: {
    type: Number,
    default: 1000
  },
  mapHeight: {
    type: Number,
    default: 600
  }
})

const emit = defineEmits(['fenceClick', 'drawingComplete', 'selectionChange'])

const mapContainer = ref(null)
const gridSize = 50
const scaleX = computed(() => props.mapWidth / 100)
const scaleY = computed(() => props.mapHeight / 100)
const drawingPoints = ref([])

const displayFences = computed(() => props.fences || [])
const displayBikes = computed(() => props.bikes || [])
const displayMoves = computed(() => props.moves || [])

watch(
  () => props.editingMode,
  (val) => {
    if (!val) {
      drawingPoints.value = []
    }
  }
)

function getCurrentCount(fence) {
  if (fence.currentCount != null) return fence.currentCount
  return 0
}

function getFenceSaturation(fence) {
  if (fence.saturation != null) return fence.saturation
  const count = getCurrentCount(fence)
  return fence.capacity > 0 ? count / fence.capacity : 0
}

function getPolygonPoints(fence) {
  const points = fence.points || []
  return points
    .map((p) => `${p.x * scaleX.value},${p.y * scaleY.value}`)
    .join(' ')
}

function getDrawingPolygonPoints() {
  return drawingPoints.value
    .map((p) => `${p.x * scaleX.value},${p.y * scaleY.value}`)
    .join(' ')
}

function getFenceFillColor(fence) {
  const sat = getFenceSaturation(fence)
  if (sat >= 0.9) return 'rgba(239, 68, 68, 0.25)'
  if (sat >= 0.7) return 'rgba(245, 158, 11, 0.25)'
  if (sat >= 0.4) return 'rgba(34, 197, 94, 0.2)'
  return 'rgba(59, 130, 246, 0.15)'
}

function getSaturationColor(sat) {
  if (sat >= 0.9) return '#ef4444'
  if (sat >= 0.7) return '#f59e0b'
  if (sat >= 0.4) return '#22c55e'
  return '#3b82f6'
}

function getBikeColor(status) {
  switch (status) {
    case 'illegal':
      return '#ef4444'
    case 'fault':
      return '#8b5cf6'
    case 'in_fence':
      return '#22c55e'
    default:
      return '#6b7280'
  }
}

function handleMapClick(e) {
  if (!props.editingMode) return
  const svg = e.currentTarget.querySelector('.map-svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  const x = ((e.clientX - rect.left) / rect.width) * viewBox.width / scaleX.value
  const y = ((e.clientY - rect.top) / rect.height) * viewBox.height / scaleY.value
  drawingPoints.value.push({
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100
  })
}

function handleFenceClick(fence) {
  if (props.editingMode) return
  emit('fenceClick', fence)
  emit('selectionChange', fence.id)
}

function undoLastPoint() {
  if (drawingPoints.value.length > 0) {
    drawingPoints.value.pop()
  }
}

function clearDrawing() {
  drawingPoints.value = []
}

function finishDrawing() {
  if (drawingPoints.value.length >= 3) {
    emit('drawingComplete', [...drawingPoints.value])
  }
}

function resetDrawing() {
  drawingPoints.value = []
}

defineExpose({ resetDrawing })
</script>

<style scoped>
.bike-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.map-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.fence-polygon {
  transition: all 0.2s ease;
}

.fence-polygon.clickable:hover {
  filter: brightness(1.1);
  cursor: pointer;
}

.fence-label {
  pointer-events: none;
  user-select: none;
}

.bike-dot {
  transition: transform 0.2s ease;
}

.bike-dot:hover {
  transform: scale(1.2);
}

.pulse-ring {
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    r: 14;
    opacity: 1;
  }
  100% {
    r: 28;
    opacity: 0;
  }
}

.move-arrow {
  transition: all 0.3s ease;
}

.editing-tips {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  background: rgba(30, 64, 175, 0.95);
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  flex-wrap: wrap;
}

.tip-text {
  flex: 1;
}

.tip-count {
  padding: 2px 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-weight: 500;
}

.editing-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-undo {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn-undo:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.btn-clear {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
}

.btn-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 1);
}

.btn-finish {
  background: #22c55e;
  color: #fff;
}

.btn-finish:hover:not(:disabled) {
  background: #16a34a;
}
</style>
