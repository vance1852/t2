<template>
  <div class="dashboard">
    <div class="card-row">
      <div class="stat-card stat-card-blue">
        <div class="stat-icon">🚲</div>
        <div class="stat-content">
          <div class="stat-label">总单车数</div>
          <div class="stat-value">{{ overview.totalBikes || 0 }}</div>
          <div class="stat-sub">
            <span class="trend" :class="mockChainTrend >= 0 ? 'up' : 'down'">
              {{ mockChainTrend >= 0 ? '↑' : '↓' }} {{ Math.abs(mockChainTrend).toFixed(1) }}%
            </span>
            <span class="sub-label">环比</span>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card-green">
        <div class="stat-icon">🔲</div>
        <div class="stat-content">
          <div class="stat-label">活跃围栏数</div>
          <div class="stat-value">{{ overview.totalFences || 0 }}</div>
          <div class="stat-sub">
            <span class="sub-label">平均饱和度</span>
            <span class="highlight-value">{{ (avgSaturationPct).toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card-purple">
        <div class="stat-icon">📋</div>
        <div class="stat-content">
          <div class="stat-label">今日工单量</div>
          <div class="stat-value">{{ overview.todayOrders || 0 }}</div>
          <div class="stat-sub">
            <span class="sub-label">完成率</span>
            <span class="highlight-value">{{ completionRatePct.toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card-orange">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
          <div class="stat-label">待处理调度</div>
          <div class="stat-value">{{ overview.pendingDispatch || 0 }}</div>
          <div class="stat-sub">
            <span class="sub-label">累计节省距离</span>
            <span class="highlight-value">{{ totalDistanceSaved }} km</span>
          </div>
        </div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">近7天违停与故障趋势</span>
          <div class="chart-legend">
            <span class="legend-item"><i class="legend-dot" style="background:#ef4444"></i>违停</span>
            <span class="legend-item"><i class="legend-dot" style="background:#8b5cf6"></i>故障</span>
          </div>
        </div>
        <div ref="trendChartRef" class="chart-body"></div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">分区违停率对比</span>
        </div>
        <div ref="districtChartRef" class="chart-body"></div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">工单状态分布 & 响应时长</span>
        </div>
        <div class="charts-row">
          <div ref="orderPieRef" class="chart-body-half"></div>
          <div ref="responseRoseRef" class="chart-body-half"></div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">围栏周转率排行 TOP10</span>
        </div>
        <div ref="turnoverChartRef" class="chart-body"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { stats, workOrders, dispatch } from '@/api'

const overview = ref({})
const trendData = ref({ dates: [], illegal: [], fault: [] })
const districtData = ref([])
const turnoverData = ref([])
const orderSummary = ref({})
const dispatchSummary = ref({})

const mockChainTrend = ref(5.2)
const totalDistanceSaved = ref(0)

const trendChartRef = ref(null)
const districtChartRef = ref(null)
const orderPieRef = ref(null)
const responseRoseRef = ref(null)
const turnoverChartRef = ref(null)

let trendChart = null
let districtChart = null
let orderPieChart = null
let responseRoseChart = null
let turnoverChart = null

const avgSaturationPct = computed(() => (overview.value.avgSaturation || 0) * 100)
const completionRatePct = computed(() => {
  const total = overview.value.todayOrders || 0
  const completed = overview.value.todayCompleted || 0
  return total > 0 ? (completed / total) * 100 : 0
})

async function loadData() {
  try {
    const [overviewRes, trendRes, districtRes, turnoverRes, orderRes, dispatchRes] = await Promise.all([
      stats.overview(),
      stats.trend7Day(),
      stats.districtStats(),
      stats.fenceTurnover(),
      workOrders.summary(),
      dispatch.statsSummary()
    ])

    overview.value = overviewRes.data || {}
    trendData.value = trendRes.data || { dates: [], illegal: [], fault: [] }
    districtData.value = districtRes.data || []
    turnoverData.value = turnoverRes.data || []
    orderSummary.value = orderRes.data || {}
    dispatchSummary.value = dispatchRes.data || {}
    totalDistanceSaved.value = ((dispatchSummary.value.totalDistanceSaved || 0) / 1000).toFixed(1)

    await nextTick()
    initCharts()
  } catch (err) {
    console.error('加载看板数据失败:', err)
  }
}

function initCharts() {
  initTrendChart()
  initDistrictChart()
  initOrderPie()
  initResponseRose()
  initTurnoverChart()
}

function initTrendChart() {
  if (!trendChartRef.value) return
  if (trendChart) trendChart.dispose()
  trendChart = echarts.init(trendChartRef.value)
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: trendData.value.dates || [],
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      axisLabel: { color: '#6b7280', fontSize: 11 }
    },
    series: [
      {
        name: '违停',
        type: 'line',
        data: trendData.value.illegal || [],
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#ef4444', width: 3 },
        itemStyle: { color: '#ef4444', borderWidth: 2, borderColor: '#fff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239,68,68,0.25)' },
            { offset: 1, color: 'rgba(239,68,68,0)' }
          ])
        }
      },
      {
        name: '故障',
        type: 'line',
        data: trendData.value.fault || [],
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#8b5cf6', width: 3 },
        itemStyle: { color: '#8b5cf6', borderWidth: 2, borderColor: '#fff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(139,92,246,0.25)' },
            { offset: 1, color: 'rgba(139,92,246,0)' }
          ])
        }
      }
    ]
  })
}

function initDistrictChart() {
  if (!districtChartRef.value) return
  if (districtChart) districtChart.dispose()
  districtChart = echarts.init(districtChartRef.value)
  const districts = districtData.value.map((d) => d.district)
  const rates = districtData.value.map((d) => (d.illegalRate * 100).toFixed(1))
  districtChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `${params[0].name}<br/>违停率: ${params[0].value}%`
    },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: districts,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 11, rotate: 30 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}%', color: '#6b7280', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    series: [
      {
        type: 'bar',
        data: rates,
        barWidth: '40%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: (params) => {
            const v = Number(params.value)
            if (v >= 10) return '#ef4444'
            if (v >= 5) return '#f59e0b'
            return '#22c55e'
          }
        },
        label: {
          show: true,
          position: 'top',
          formatter: '{c}%',
          fontSize: 11,
          color: '#374151'
        }
      }
    ]
  })
}

function initOrderPie() {
  if (!orderPieRef.value) return
  if (orderPieChart) orderPieChart.dispose()
  orderPieChart = echarts.init(orderPieRef.value)
  const s = orderSummary.value.status || { pending: 0, processing: 0, completed: 0, cancelled: 0 }
  orderPieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { fontSize: 11, color: '#6b7280' }
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: s.pending || 0, name: '待处理', itemStyle: { color: '#f59e0b' } },
          { value: s.processing || 0, name: '处理中', itemStyle: { color: '#3b82f6' } },
          { value: s.completed || 0, name: '已完成', itemStyle: { color: '#22c55e' } },
          { value: s.cancelled || 0, name: '已取消', itemStyle: { color: '#9ca3af' } }
        ]
      }
    ]
  })
}

function initResponseRose() {
  if (!responseRoseRef.value) return
  if (responseRoseChart) responseRoseChart.dispose()
  responseRoseChart = echarts.init(responseRoseRef.value)
  const hours = Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, '0')}:00`)
  const values = Array.from({ length: 12 }, () => Math.round(5 + Math.random() * 25))
  responseRoseChart.setOption({
    title: {
      text: '平均响应时长(分钟)',
      left: 'center',
      top: 5,
      textStyle: { fontSize: 11, color: '#6b7280', fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => `${params.name}<br/>响应时长: ${params.value}分钟`
    },
    series: [
      {
        type: 'pie',
        radius: [20, 90],
        center: ['50%', '55%'],
        roseType: 'area',
        itemStyle: {
          borderRadius: 6,
          color: (params) => {
            const colors = ['#3b82f6', '#60a5fa', '#93c5fd', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#fb923c', '#f97316']
            return colors[params.dataIndex % colors.length]
          }
        },
        label: { show: true, fontSize: 10, color: '#6b7280' },
        labelLine: { length: 6, length2: 4 },
        data: hours.map((h, i) => ({ name: h, value: values[i] }))
      }
    ]
  })
}

function initTurnoverChart() {
  if (!turnoverChartRef.value) return
  if (turnoverChart) turnoverChart.dispose()
  turnoverChart = echarts.init(turnoverChartRef.value)
  const top = [...turnoverData.value]
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 10)
    .reverse()
  turnoverChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0]
        return `${p.name}<br/>周转率: ${(p.value * 100).toFixed(1)}%`
      }
    },
    grid: { left: 120, right: 40, top: 10, bottom: 30 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%', color: '#6b7280', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    yAxis: {
      type: 'category',
      data: top.map((t) => t.name),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#374151', fontSize: 11 }
    },
    series: [
      {
        type: 'bar',
        data: top.map((t) => t.turnover),
        barWidth: '55%',
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: (params) => {
            const v = Number(params.value)
            if (v >= 0.8) return '#22c55e'
            if (v >= 0.5) return '#3b82f6'
            if (v >= 0.3) return '#0ea5e9'
            return '#60a5fa'
          }
        },
        label: {
          show: true,
          position: 'right',
          formatter: (p) => (p.value * 100).toFixed(1) + '%',
          fontSize: 11,
          color: '#374151'
        }
      }
    ]
  })
}

function handleResize() {
  trendChart?.resize()
  districtChart?.resize()
  orderPieChart?.resize()
  responseRoseChart?.resize()
  turnoverChart?.resize()
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  districtChart?.dispose()
  orderPieChart?.dispose()
  responseRoseChart?.dispose()
  turnoverChart?.dispose()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
}

.card-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
}

.stat-card-blue::before { background: linear-gradient(180deg, #3b82f6, #60a5fa); }
.stat-card-green::before { background: linear-gradient(180deg, #22c55e, #4ade80); }
.stat-card-purple::before { background: linear-gradient(180deg, #8b5cf6, #a78bfa); }
.stat-card-orange::before { background: linear-gradient(180deg, #f97316, #fb923c); }

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}

.stat-card-blue .stat-icon { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
.stat-card-green .stat-icon { background: linear-gradient(135deg, #dcfce7, #bbf7d0); }
.stat-card-purple .stat-icon { background: linear-gradient(135deg, #ede9fe, #ddd6fe); }
.stat-card-orange .stat-icon { background: linear-gradient(135deg, #ffedd5, #fed7aa); }

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
  margin-bottom: 6px;
}

.stat-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.sub-label {
  color: #9ca3af;
}

.trend.up {
  color: #22c55e;
  font-weight: 600;
}

.trend.down {
  color: #ef4444;
  font-weight: 600;
}

.highlight-value {
  color: #3b82f6;
  font-weight: 600;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.chart-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.chart-legend {
  display: flex;
  gap: 14px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.chart-body {
  flex: 1;
  width: 100%;
  height: 300px;
  min-height: 300px;
}

.charts-row {
  display: flex;
  flex: 1;
  gap: 8px;
}

.chart-body-half {
  flex: 1;
  height: 280px;
  min-height: 280px;
}

@media (max-width: 1200px) {
  .card-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
