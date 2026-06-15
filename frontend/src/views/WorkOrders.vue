<template>
  <div class="work-orders">
    <div class="orders-container">
      <div class="orders-left">
        <div class="filter-tabs">
          <div class="tabs-row">
            <div
              v-for="tab in statusTabs"
              :key="tab.key"
              class="tab-item"
              :class="{ active: currentStatus === tab.key }"
              @click="currentStatus = tab.key; loadOrders()"
            >
              {{ tab.label }}
              <span class="tab-count" v-if="tab.count > 0">{{ tab.count }}</span>
            </div>
          </div>
          <div class="filters-row">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                v-model="searchText"
                type="text"
                placeholder="搜索工单号、标题..."
                @keyup.enter="loadOrders"
              />
            </div>
            <select v-model="currentType" class="filter-select" @change="loadOrders">
              <option value="">全部类型</option>
              <option value="illegal_parking">违停</option>
              <option value="fault_report">故障</option>
            </select>
            <select v-model="currentPriority" class="filter-select" @change="loadOrders">
              <option value="">全部优先级</option>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="normal">普通</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>

        <div class="orders-list">
          <div
            v-for="order in orders"
            :key="order.id"
            class="order-card"
            :class="{ active: selectedOrder?.id === order.id, completed: order.status === 'completed', cancelled: order.status === 'cancelled' }"
            @click="selectOrder(order)"
          >
            <div class="card-top">
              <span class="order-no">{{ order.order_no }}</span>
              <div class="card-tags">
                <span class="type-tag" :class="order.type">
                  {{ order.type === 'illegal_parking' ? '违停' : '故障' }}
                </span>
                <span class="priority-tag" :class="order.priority">
                  {{ priorityLabel(order.priority) }}
                </span>
              </div>
            </div>
            <div class="card-title">{{ order.title }}</div>
            <div class="card-meta">
              <span class="meta-item">🕒 {{ formatTime(order.created_at) }}</span>
              <span v-if="order.assignee" class="meta-item assignee">
                👤 {{ order.assignee }}
              </span>
              <span v-else class="meta-item unassigned">未分配</span>
            </div>
            <div class="card-bottom">
              <span class="status-badge" :class="order.status">
                {{ statusLabel(order.status) }}
              </span>
              <div class="card-actions" v-if="order.status === 'pending' || order.status === 'processing'">
                <template v-if="order.status === 'pending'">
                  <div class="assign-wrapper">
                    <button class="action-btn btn-primary" @click.stop="showAssignDropdown = order.id">
                      接单
                    </button>
                    <div v-if="showAssignDropdown === order.id" class="assign-dropdown" @click.stop>
                      <div class="dropdown-header">选择处理人</div>
                      <input
                        v-model="assignInput"
                        type="text"
                        class="dropdown-input"
                        placeholder="输入处理人姓名"
                        @keyup.enter="handleAssign(order)"
                      />
                      <div class="quick-options">
                        <span
                          v-for="p in assigneeList"
                          :key="p"
                          class="quick-item"
                          @click="assignInput = p; handleAssign(order)"
                        >
                          {{ p }}
                        </span>
                      </div>
                      <div class="dropdown-footer">
                        <button class="btn-cancel" @click="showAssignDropdown = null">取消</button>
                        <button class="btn-confirm" @click="handleAssign(order)">确认</button>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else-if="order.status === 'processing'">
                  <button class="action-btn btn-success" @click.stop="handleComplete(order)">
                    完成工单
                  </button>
                </template>
              </div>
              <div v-else-if="order.status === 'completed'" class="duration-info">
                处理时长: {{ computeDuration(order) }}
              </div>
            </div>
          </div>

          <div v-if="orders.length === 0" class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-text">暂无工单数据</div>
          </div>
        </div>
      </div>

      <div class="orders-right">
        <div v-if="selectedOrder" class="order-detail">
          <div class="detail-header">
            <div>
              <div class="detail-title">{{ selectedOrder.title }}</div>
              <div class="detail-sub">
                <span class="order-no">{{ selectedOrder.order_no }}</span>
                <span class="status-badge" :class="selectedOrder.status">
                  {{ statusLabel(selectedOrder.status) }}
                </span>
              </div>
            </div>
            <div class="detail-tags">
              <span class="type-tag big" :class="selectedOrder.type">
                {{ selectedOrder.type === 'illegal_parking' ? '违停' : '故障' }}
              </span>
              <span class="priority-tag big" :class="selectedOrder.priority">
                {{ priorityLabel(selectedOrder.priority) }}
              </span>
            </div>
          </div>

          <div class="detail-info-grid">
            <div class="info-item">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ formatTime(selectedOrder.created_at) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">处理人</span>
              <span class="info-value">{{ selectedOrder.assignee || '未分配' }}</span>
            </div>
            <div class="info-item" v-if="selectedOrder.started_at">
              <span class="info-label">开始时间</span>
              <span class="info-value">{{ formatTime(selectedOrder.started_at) }}</span>
            </div>
            <div class="info-item" v-if="selectedOrder.completed_at">
              <span class="info-label">完成时间</span>
              <span class="info-value">{{ formatTime(selectedOrder.completed_at) }}</span>
            </div>
            <div class="info-item full" v-if="selectedOrder.started_at && selectedOrder.completed_at">
              <span class="info-label">处理时长</span>
              <span class="info-value highlight">{{ computeDuration(selectedOrder) }}</span>
            </div>
          </div>

          <div class="detail-section" v-if="selectedOrder.description">
            <div class="section-title">工单描述</div>
            <div class="section-content desc-content">{{ selectedOrder.description }}</div>
          </div>

          <div class="detail-section">
            <div class="section-title">关联信息</div>
            <div class="related-info">
              <div class="related-row" v-if="selectedOrder.bike_id || selectedOrder.bike_no">
                <span class="related-label">关联单车</span>
                <span class="related-value">
                  {{ selectedOrder.bike_no ? `#${selectedOrder.bike_no}` : `ID: ${selectedOrder.bike_id}` }}
                </span>
              </div>
              <div class="related-row" v-if="selectedOrder.fence_id || selectedOrder.fence_name">
                <span class="related-label">关联围栏</span>
                <span class="related-value">
                  {{ selectedOrder.fence_name || `ID: ${selectedOrder.fence_id}` }}
                </span>
              </div>
            </div>
          </div>

          <div class="detail-section map-section">
            <div class="section-title">位置信息</div>
            <div class="mini-map-wrapper">
              <BikeMap
                v-if="mapFences.length > 0"
                :fences="mapFences"
                :showCounts="false"
                :highlightPoint="highlightPoint"
                :mapHeight="220"
              />
              <div v-else class="mini-map-empty">
                <span v-if="selectedOrder.report_x != null && selectedOrder.report_y != null">
                  坐标: ({{ selectedOrder.report_x?.toFixed(1) }}, {{ selectedOrder.report_y?.toFixed(1) }})
                </span>
                <span v-else>暂无位置信息</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-selection">
          <div class="no-select-icon">📋</div>
          <div class="no-select-text">请选择左侧工单查看详情</div>
        </div>
      </div>
    </div>

    <button class="fab-btn" @click="openCreateModal">
      <span class="fab-icon">+</span>
      <span class="fab-text">创建工单</span>
    </button>

    <div v-if="showCreateModal" class="modal-mask" @click.self="closeCreateModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">创建工单</span>
          <button class="modal-close" @click="closeCreateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label"><span class="required">*</span>工单类型</label>
            <div class="type-options">
              <div
                class="type-option"
                :class="{ active: createForm.type === 'illegal_parking' }"
                @click="createForm.type = 'illegal_parking'"
              >
                <span class="opt-icon">🚫</span>
                <span class="opt-text">违停工单</span>
              </div>
              <div
                class="type-option"
                :class="{ active: createForm.type === 'fault_report' }"
                @click="createForm.type = 'fault_report'"
              >
                <span class="opt-icon">🔧</span>
                <span class="opt-text">报修工单</span>
              </div>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label"><span class="required">*</span>标题</label>
            <input
              v-model="createForm.title"
              type="text"
              class="form-input"
              placeholder="请输入工单标题"
            />
          </div>
          <div class="form-row">
            <label class="form-label">优先级</label>
            <select v-model="createForm.priority" class="form-input">
              <option value="low">低</option>
              <option value="normal">普通</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">描述</label>
            <textarea
              v-model="createForm.description"
              class="form-input textarea"
              rows="3"
              placeholder="请输入工单详细描述（选填）"
            ></textarea>
          </div>
          <div class="form-row two-col">
            <div>
              <label class="form-label">位置 X</label>
              <input v-model.number="createForm.report_x" type="number" class="form-input" placeholder="0-100" />
            </div>
            <div>
              <label class="form-label">位置 Y</label>
              <input v-model.number="createForm.report_y" type="number" class="form-input" placeholder="0-100" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="closeCreateModal">取消</button>
          <button class="btn btn-primary" @click="submitCreate">提交</button>
        </div>
      </div>
    </div>

    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import BikeMap from '@/components/BikeMap.vue'
import { workOrders, fences } from '@/api'
import { useConfirm } from '@/utils/confirm.js'

const orders = ref([])
const selectedOrder = ref(null)
const mapFences = ref([])
const allDistricts = ref([])
const orderSummary = ref({})

const currentStatus = ref('')
const currentType = ref('')
const currentPriority = ref('')
const searchText = ref('')

const showAssignDropdown = ref(null)
const assignInput = ref('')
const assigneeList = ['张三', '李四', '王五', '赵六', '运维团队A', '运维团队B']

const showCreateModal = ref(false)
const createForm = reactive({
  type: 'illegal_parking',
  title: '',
  priority: 'normal',
  description: '',
  report_x: null,
  report_y: null
})

const toast = reactive({ show: false, type: 'success', message: '' })

function showToast(message, type = 'success') {
  toast.message = message
  toast.type = type
  toast.show = true
  setTimeout(() => (toast.show = false), 3000)
}

const statusTabs = computed(() => [
  { key: '', label: '全部', count: orderSummary.value.total || 0 },
  { key: 'pending', label: '待处理', count: orderSummary.value.status?.pending || 0 },
  { key: 'processing', label: '处理中', count: orderSummary.value.status?.processing || 0 },
  { key: 'completed', label: '已完成', count: orderSummary.value.status?.completed || 0 }
])

const highlightPoint = computed(() => {
  if (selectedOrder.value && selectedOrder.value.report_x != null && selectedOrder.value.report_y != null) {
    return { x: selectedOrder.value.report_x, y: selectedOrder.value.report_y }
  }
  return null
})

function statusLabel(s) {
  switch (s) {
    case 'pending': return '待处理'
    case 'processing': return '处理中'
    case 'completed': return '已完成'
    case 'cancelled': return '已取消'
    default: return s
  }
}

function priorityLabel(p) {
  switch (p) {
    case 'urgent': return '紧急'
    case 'high': return '高'
    case 'normal': return '普通'
    case 'low': return '低'
    default: return p
  }
}

function formatTime(t) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 16)
}

function computeDuration(order) {
  if (!order.started_at || !order.completed_at) return '-'
  const diff = (new Date(order.completed_at) - new Date(order.started_at)) / (1000 * 60)
  if (diff < 60) return `${Math.round(diff)} 分钟`
  return `${(diff / 60).toFixed(1)} 小时`
}

async function loadOrders() {
  try {
    const params = { pageSize: 50 }
    if (currentStatus.value) params.status = currentStatus.value
    if (currentType.value) params.type = currentType.value
    if (currentPriority.value) params.priority = currentPriority.value
    const res = await workOrders.list(params)
    orders.value = res.data || []
  } catch (err) {
    console.error('加载工单失败:', err)
  }
}

async function loadSummary() {
  try {
    const res = await workOrders.summary()
    orderSummary.value = res.data || {}
  } catch (err) {
    console.error('加载统计失败:', err)
  }
}

async function loadFences() {
  try {
    const res = await fences.list()
    mapFences.value = res.data || []
  } catch (err) {
    console.error('加载围栏失败:', err)
  }
}

async function selectOrder(order) {
  selectedOrder.value = order
  try {
    const detailRes = await workOrders.detail(order.id)
    if (detailRes.data) {
      selectedOrder.value = detailRes.data
    }
  } catch (err) {
    console.error('加载工单详情失败:', err)
  }
}

async function handleAssign(order) {
  if (!assignInput.value.trim()) {
    showToast('请输入处理人姓名', 'error')
    return
  }
  try {
    const res = await workOrders.start(order.id, assignInput.value.trim())
    showToast(`已分配给 ${assignInput.value}`)
    showAssignDropdown.value = null
    assignInput.value = ''
    if (res.data) {
      const idx = orders.value.findIndex((o) => o.id === order.id)
      if (idx !== -1) orders.value[idx] = res.data
      if (selectedOrder.value?.id === order.id) selectedOrder.value = res.data
    }
    await loadSummary()
  } catch (err) {
    const msg = err.response?.data?.message || '接单失败'
    showToast(msg, 'error')
  }
}

async function handleComplete(order) {
  const confirmed = await useConfirm({
    title: '确认完成工单',
    message: `确定要将工单 ${order.order_no} 标记为已完成吗？`,
    type: 'warning',
    confirmText: '确认完成',
    cancelText: '取消'
  })
  if (!confirmed) return
  try {
    const res = await workOrders.complete(order.id)
    showToast('工单已完成')
    if (res.data) {
      const idx = orders.value.findIndex((o) => o.id === order.id)
      if (idx !== -1) orders.value[idx] = res.data
      if (selectedOrder.value?.id === order.id) selectedOrder.value = res.data
    }
    await loadSummary()
  } catch (err) {
    const msg = err.response?.data?.message || '完成失败'
    showToast(msg, 'error')
  }
}

function openCreateModal() {
  createForm.type = 'illegal_parking'
  createForm.title = ''
  createForm.priority = 'normal'
  createForm.description = ''
  createForm.report_x = null
  createForm.report_y = null
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
}

async function submitCreate() {
  if (!createForm.title.trim()) {
    showToast('请输入工单标题', 'error')
    return
  }
  try {
    const data = {
      type: createForm.type,
      title: createForm.title.trim(),
      priority: createForm.priority,
      description: createForm.description.trim() || null
    }
    if (createForm.report_x != null) data.report_x = createForm.report_x
    if (createForm.report_y != null) data.report_y = createForm.report_y

    await workOrders.create(data)
    showToast('工单创建成功')
    closeCreateModal()
    await loadOrders()
    await loadSummary()
  } catch (err) {
    const msg = err.response?.data?.message || '创建失败'
    showToast(msg, 'error')
  }
}

watch(showAssignDropdown, (val) => {
  if (!val) assignInput.value = ''
})

onMounted(async () => {
  await Promise.all([loadOrders(), loadSummary(), loadFences()])
})
</script>

<style scoped>
.work-orders {
  min-height: 100%;
  position: relative;
}

.orders-container {
  display: grid;
  grid-template-columns: 60% 1fr;
  gap: 16px;
  height: calc(100vh - 60px - 48px);
  min-height: 600px;
}

.orders-left {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-tabs {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.tabs-row {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
}

.tab-item {
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-item:hover {
  background: #f3f4f6;
  color: #374151;
}

.tab-item.active {
  background: #eff6ff;
  color: #2563eb;
}

.tab-count {
  background: #e5e7eb;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #374151;
}

.tab-item.active .tab-count {
  background: #3b82f6;
  color: #fff;
}

.filters-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: #9ca3af;
}

.search-box input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: all 0.2s;
}

.search-box input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-select {
  padding: 7px 28px 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  background: #fff;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5L10 12l4.5-4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.filter-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.orders-list {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.2s;
}

.order-card:hover {
  border-color: #93c5fd;
  background: #fafcff;
  transform: translateX(2px);
}

.order-card.active {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.order-card.completed, .order-card.cancelled {
  opacity: 0.75;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-no {
  font-family: 'Consolas', monospace;
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.card-tags {
  display: flex;
  gap: 6px;
}

.type-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.type-tag.illegal_parking {
  background: #fee2e2;
  color: #dc2626;
}

.type-tag.fault_report {
  background: #ede9fe;
  color: #7c3aed;
}

.type-tag.big {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.priority-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.priority-tag.urgent {
  background: #fecaca;
  color: #b91c1c;
}

.priority-tag.high {
  background: #fed7aa;
  color: #c2410c;
}

.priority-tag.normal {
  background: #bfdbfe;
  color: #1d4ed8;
}

.priority-tag.low {
  background: #d1fae5;
  color: #047857;
}

.priority-tag.big {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
  line-height: 1.4;
}

.card-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 10px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-item.assignee {
  color: #2563eb;
  font-weight: 500;
}

.meta-item.unassigned {
  color: #f59e0b;
}

.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.processing {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge.completed {
  background: #dcfce7;
  color: #166534;
}

.status-badge.cancelled {
  background: #e5e7eb;
  color: #4b5563;
}

.card-actions {
  display: flex;
  gap: 8px;
  position: relative;
}

.assign-wrapper {
  position: relative;
  display: inline-block;
}

.action-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-success {
  background: #22c55e;
  color: #fff;
}

.btn-success:hover {
  background: #16a34a;
}

.assign-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 12px;
  width: 220px;
  z-index: 1000;
}

.dropdown-header {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  font-weight: 500;
}

.dropdown-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 8px;
}

.dropdown-input:focus {
  border-color: #3b82f6;
}

.quick-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.quick-item {
  padding: 3px 10px;
  background: #f3f4f6;
  border-radius: 12px;
  font-size: 11px;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-item:hover {
  background: #dbeafe;
  color: #1d4ed8;
}

.dropdown-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

.btn-cancel {
  padding: 5px 12px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}

.btn-confirm {
  padding: 5px 12px;
  border: none;
  background: #3b82f6;
  color: #fff;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}

.duration-info {
  font-size: 12px;
  color: #22c55e;
  font-weight: 500;
}

.orders-right {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow-y: auto;
}

.order-detail {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
  line-height: 1.4;
}

.detail-sub {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-tags {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.detail-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 18px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item.full {
  grid-column: 1 / -1;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f0fdf4;
  border-radius: 8px;
}

.info-label {
  font-size: 12px;
  color: #6b7280;
}

.info-value {
  font-size: 13px;
  color: #1f2937;
  font-weight: 500;
}

.info-value.highlight {
  color: #16a34a;
  font-size: 14px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  padding-bottom: 4px;
}

.desc-content {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
}

.related-info {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.related-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.related-label {
  color: #6b7280;
}

.related-value {
  color: #1f2937;
  font-weight: 500;
}

.map-section {
  padding: 0;
  gap: 8px;
}

.map-section .section-title {
  padding: 0;
}

.mini-map-wrapper {
  width: 100%;
  height: 240px;
  border-radius: 8px;
  overflow: hidden;
}

.mini-map-empty {
  width: 100%;
  height: 100%;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
}

.empty-state, .no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
}

.no-selection {
  height: 100%;
}

.empty-icon, .no-select-icon {
  font-size: 48px;
  opacity: 0.6;
}

.empty-text, .no-select-text {
  color: #9ca3af;
  font-size: 14px;
}

.fab-btn {
  position: fixed;
  right: 32px;
  bottom: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 22px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border: none;
  border-radius: 50px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  transition: all 0.25s;
  z-index: 500;
}

.fab-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(59, 130, 246, 0.5);
}

.fab-icon {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 14px;
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #1f2937;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  color: #9ca3af;
  cursor: pointer;
  line-height: 1;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-row {
  margin-bottom: 18px;
}

.form-row.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.required {
  color: #ef4444;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input.textarea {
  resize: vertical;
  font-family: inherit;
}

.type-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.type-option {
  padding: 14px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.type-option:hover {
  border-color: #93c5fd;
  background: #fafcff;
}

.type-option.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

.opt-icon {
  font-size: 28px;
}

.opt-text {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-default {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
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
</style>
