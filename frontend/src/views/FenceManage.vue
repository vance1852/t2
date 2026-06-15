<template>
  <div class="fence-manage">
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索围栏名称或行政区..."
            @input="loadFences"
          />
        </div>
        <div class="filter-select">
          <span class="filter-label">区筛选</span>
          <select v-model="selectedDistrict" @change="loadFences">
            <option value="">全部行政区</option>
            <option v-for="d in districtList" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" @click="openAddModal">
        <span class="btn-icon">+</span>新增围栏
      </button>
    </div>

    <div class="map-section">
      <div class="section-header">
        <span class="section-title">地图视图</span>
        <span class="section-sub" v-if="editingMode">
          <span class="badge badge-warning">编辑模式</span>
          请在地图上点击绘制围栏顶点
        </span>
      </div>
      <div class="map-wrapper">
        <BikeMap
          ref="bikeMapRef"
          :fences="fences"
          :editingMode="editingMode"
          :selectedFenceId="selectedFenceId"
          @fenceClick="handleFenceClick"
          @drawingComplete="handleDrawingComplete"
          @selectionChange="handleSelectionChange"
        />
      </div>
    </div>

    <div class="table-section">
      <div class="section-header">
        <span class="section-title">围栏列表</span>
        <span class="section-sub">共 {{ fences.length }} 个围栏</span>
      </div>
      <div class="table-wrapper">
        <table class="fence-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>行政区</th>
              <th>容量</th>
              <th>当前车数</th>
              <th>饱和度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="fence in fences"
              :key="fence.id"
              :class="{ active: selectedFenceId === fence.id }"
              @click="handleRowClick(fence)"
            >
              <td class="col-id">#{{ fence.id }}</td>
              <td class="col-name">
                <span class="fence-name">{{ fence.name }}</span>
              </td>
              <td class="col-district">
                <span class="district-tag">{{ fence.district }}</span>
              </td>
              <td class="col-num">{{ fence.capacity }}</td>
              <td class="col-num">{{ fence.currentCount }}</td>
              <td class="col-saturation">
                <div class="saturation-bar">
                  <div
                    class="saturation-fill"
                    :style="{ width: (fence.saturation * 100).toFixed(1) + '%' }"
                    :class="getSaturationClass(fence.saturation)"
                  ></div>
                </div>
                <span class="saturation-text" :class="getSaturationClass(fence.saturation)">
                  {{ (fence.saturation * 100).toFixed(1) }}%
                </span>
              </td>
              <td class="col-actions">
                <button class="action-btn action-edit" @click.stop="openEditModal(fence)">
                  编辑
                </button>
                <button class="action-btn action-delete" @click.stop="confirmDelete(fence)">
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="fences.length === 0">
              <td colspan="7" class="empty-cell">暂无围栏数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showModal" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ isEdit ? '编辑围栏' : '新增围栏' }}</span>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">
              <span class="required">*</span>围栏名称
            </label>
            <input
              v-model="formData.name"
              type="text"
              class="form-input"
              placeholder="请输入围栏名称"
            />
          </div>
          <div class="form-row">
            <label class="form-label">
              <span class="required">*</span>行政区
            </label>
            <select v-model="formData.district" class="form-input">
              <option value="">请选择行政区</option>
              <option v-for="d in districtList" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">
              <span class="required">*</span>容量
            </label>
            <input
              v-model.number="formData.capacity"
              type="number"
              min="1"
              class="form-input"
              placeholder="请输入围栏最大容量"
            />
          </div>
          <div class="form-row">
            <label class="form-label">
              <span class="required">*</span>围栏范围
            </label>
            <div class="drawing-control">
              <div class="drawing-status">
                <span v-if="formData.points && formData.points.length >= 3" class="status-ok">
                  ✓ 已绘制 {{ formData.points.length }} 个顶点
                </span>
                <span v-else class="status-warn">
                  未绘制（至少需要 3 个顶点）
                </span>
              </div>
              <button
                class="btn btn-map"
                :class="{ active: editingMode }"
                @click="toggleMapEdit"
              >
                {{ editingMode ? '完成绘制' : '在地图上画围栏' }}
              </button>
            </div>
            <div v-if="formData.points && formData.points.length > 0" class="points-preview">
              <span class="points-label">顶点坐标：</span>
              <span class="points-text">
                {{ formData.points.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ') }}
              </span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveFence">保存</button>
        </div>
      </div>
    </div>

    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import BikeMap from '@/components/BikeMap.vue'
import { fences as fencesApi } from '@/api'
import { useConfirm } from '@/utils/confirm.js'

const bikeMapRef = ref(null)
const fences = ref([])
const districtList = ref(['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区'])
const searchText = ref('')
const selectedDistrict = ref('')
const selectedFenceId = ref(null)
const editingMode = ref(false)

const showModal = ref(false)
const isEdit = ref(false)
const editId = ref(null)

const formData = reactive({
  name: '',
  district: '',
  capacity: 50,
  points: []
})

const toast = reactive({
  show: false,
  type: 'success',
  message: ''
})

function showToast(message, type = 'success') {
  toast.message = message
  toast.type = type
  toast.show = true
  setTimeout(() => {
    toast.show = false
  }, 3000)
}

async function loadFences() {
  try {
    const params = {}
    if (searchText.value) params.name = searchText.value
    if (selectedDistrict.value) params.district = selectedDistrict.value
    const res = await fencesApi.list(params)
    fences.value = res.data || []
  } catch (err) {
    console.error('加载围栏失败:', err)
    showToast('加载围栏数据失败', 'error')
  }
}

function handleFenceClick(fence) {
  selectedFenceId.value = fence.id
}

function handleSelectionChange(id) {
  selectedFenceId.value = id
}

function handleRowClick(fence) {
  selectedFenceId.value = fence.id
}

function handleDrawingComplete(points) {
  formData.points = points
  editingMode.value = false
  showModal.value = true
  showToast('围栏范围绘制完成', 'success')
}

function toggleMapEdit() {
  if (editingMode.value) {
    if (bikeMapRef.value) {
      bikeMapRef.value.finishDrawing()
    }
  } else {
    if (!formData.name.trim()) {
      showToast('请先填写围栏名称', 'error')
      return
    }
    if (!formData.district) {
      showToast('请先选择行政区', 'error')
      return
    }
    if (!formData.capacity) {
      showToast('请先填写容量', 'error')
      return
    }
    editingMode.value = true
    showModal.value = false
    showToast('请在地图上点击绘制围栏顶点，双击完成', 'info')
  }
}

function resetForm() {
  formData.name = ''
  formData.district = ''
  formData.capacity = 50
  formData.points = []
  editingMode.value = false
  if (bikeMapRef.value) {
    bikeMapRef.value.resetDrawing()
  }
}

function openAddModal() {
  isEdit.value = false
  editId.value = null
  resetForm()
  showModal.value = true
}

function openEditModal(fence) {
  isEdit.value = true
  editId.value = fence.id
  formData.name = fence.name
  formData.district = fence.district
  formData.capacity = fence.capacity
  formData.points = fence.points ? JSON.parse(JSON.stringify(fence.points)) : []
  editingMode.value = false
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  resetForm()
}

async function saveFence() {
  if (!formData.name.trim()) {
    showToast('请输入围栏名称', 'error')
    return
  }
  if (!formData.district) {
    showToast('请选择行政区', 'error')
    return
  }
  if (!formData.capacity || formData.capacity <= 0) {
    showToast('请输入有效的容量', 'error')
    return
  }
  if (!formData.points || formData.points.length < 3) {
    showToast('请先在地图上绘制围栏（至少3个顶点）', 'error')
    return
  }

  try {
    const data = {
      name: formData.name.trim(),
      district: formData.district,
      capacity: formData.capacity,
      points: formData.points
    }
    if (isEdit.value) {
      await fencesApi.update(editId.value, data)
      showToast('围栏更新成功')
    } else {
      await fencesApi.create(data)
      showToast('围栏创建成功')
    }
    await loadFences()
    closeModal()
  } catch (err) {
    const msg = err.response?.data?.message || err.message || '保存失败'
    showToast(msg, 'error')
  }
}

async function confirmDelete(fence) {
  const confirmed = await useConfirm({
    title: '确认删除围栏',
    message: `确定要删除围栏"${fence.name}"吗？\n围栏内的车辆将被移出。`,
    type: 'warning',
    confirmText: '确认删除',
    cancelText: '取消'
  })
  if (!confirmed) return
  try {
    await fencesApi.remove(fence.id)
    showToast('围栏删除成功')
    if (selectedFenceId.value === fence.id) {
      selectedFenceId.value = null
    }
    await loadFences()
  } catch (err) {
    const msg = err.response?.data?.message || err.message || '删除失败'
    showToast(msg, 'error')
  }
}

function getSaturationClass(sat) {
  if (sat >= 0.9) return 'danger'
  if (sat >= 0.7) return 'warning'
  if (sat >= 0.4) return 'normal'
  return 'ok'
}

onMounted(() => {
  loadFences()
})
</script>

<style scoped>
.fence-manage {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.toolbar {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  color: #9ca3af;
}

.search-box input {
  width: 280px;
  padding: 9px 12px 9px 36px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.search-box input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-select {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  color: #6b7280;
}

.filter-select select {
  padding: 8px 30px 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5L10 12l4.5-4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.filter-select select:focus {
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
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  box-shadow: 0 1px 3px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.35);
}

.btn-default {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-default:hover {
  background: #e5e7eb;
}

.btn-map {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

.btn-map:hover {
  background: #dbeafe;
}

.btn-map.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.btn-icon {
  font-size: 16px;
  font-weight: 600;
}

.map-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.section-sub {
  font-size: 13px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.map-wrapper {
  width: 100%;
  height: 420px;
}

.table-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.table-wrapper {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.fence-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.fence-table th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
  white-space: nowrap;
}

.fence-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
}

.fence-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

.fence-table tbody tr:hover {
  background: #f9fafb;
}

.fence-table tbody tr.active {
  background: #eff6ff;
}

.col-id {
  font-family: monospace;
  color: #6b7280;
  font-size: 13px;
}

.col-name {
  font-weight: 500;
}

.fence-name {
  color: #1f2937;
}

.district-tag {
  display: inline-block;
  padding: 3px 10px;
  background: #f3f4f6;
  border-radius: 12px;
  font-size: 12px;
  color: #4b5563;
}

.col-num {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.col-saturation {
  min-width: 180px;
}

.saturation-bar {
  display: inline-block;
  width: 100px;
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
  vertical-align: middle;
  margin-right: 10px;
}

.saturation-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.saturation-fill.ok { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.saturation-fill.normal { background: linear-gradient(90deg, #22c55e, #4ade80); }
.saturation-fill.warning { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.saturation-fill.danger { background: linear-gradient(90deg, #ef4444, #f87171); }

.saturation-text {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

.saturation-text.ok { color: #3b82f6; }
.saturation-text.normal { color: #22c55e; }
.saturation-text.warning { color: #f59e0b; }
.saturation-text.danger { color: #ef4444; }

.col-actions {
  white-space: nowrap;
}

.action-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  margin-right: 6px;
  transition: all 0.2s;
}

.action-edit {
  background: #eff6ff;
  color: #2563eb;
}

.action-edit:hover {
  background: #dbeafe;
}

.action-delete {
  background: #fef2f2;
  color: #dc2626;
}

.action-delete:hover {
  background: #fee2e2;
}

.empty-cell {
  text-align: center;
  color: #9ca3af;
  padding: 40px !important;
  font-size: 14px;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal {
  background: #fff;
  border-radius: 14px;
  width: 560px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: modalIn 0.2s ease;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-row {
  margin-bottom: 18px;
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
  margin-right: 2px;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.drawing-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.drawing-status {
  font-size: 13px;
}

.status-ok {
  color: #22c55e;
  font-weight: 500;
}

.status-warn {
  color: #f59e0b;
}

.points-preview {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #4b5563;
  line-height: 1.6;
}

.points-label {
  color: #6b7280;
  font-weight: 500;
}

.points-text {
  font-family: monospace;
  word-break: break-all;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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
  animation: toastIn 0.25s ease;
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

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
