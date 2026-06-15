<template>
  <div v-if="visible" class="confirm-mask" @click.self="handleCancel">
    <div class="confirm-dialog">
      <div class="confirm-icon" :class="type">
        <span v-if="type === 'warning'">⚠️</span>
        <span v-else-if="type === 'success'">✅</span>
        <span v-else-if="type === 'error'">❌</span>
        <span v-else>ℹ️</span>
      </div>
      <div class="confirm-content">
        <div class="confirm-title">{{ title }}</div>
        <div v-if="message" class="confirm-message">{{ message }}</div>
      </div>
      <div class="confirm-actions">
        <button class="confirm-btn cancel" @click="handleCancel">{{ cancelText }}</button>
        <button class="confirm-btn confirm" :class="type" @click="handleConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
const title = ref('确认操作')
const message = ref('')
const type = ref('warning')
const confirmText = ref('确认')
const cancelText = ref('取消')
let resolveFn = null

function open(options) {
  title.value = options.title || '确认操作'
  message.value = options.message || ''
  type.value = options.type || 'warning'
  confirmText.value = options.confirmText || '确认'
  cancelText.value = options.cancelText || '取消'
  visible.value = true
  return new Promise((resolve) => {
    resolveFn = resolve
  })
}

function handleConfirm() {
  visible.value = false
  if (resolveFn) resolveFn(true)
}

function handleCancel() {
  visible.value = false
  if (resolveFn) resolveFn(false)
}

defineExpose({ open })
</script>

<style>
.confirm-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px 20px;
  min-width: 320px;
  max-width: 90vw;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.confirm-icon {
  text-align: center;
  font-size: 48px;
  margin-bottom: 16px;
}

.confirm-content {
  text-align: center;
  margin-bottom: 24px;
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.confirm-btn {
  padding: 8px 28px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.confirm-btn.cancel {
  background: #f9fafb;
  border-color: #d1d5db;
  color: #374151;
}

.confirm-btn.cancel:hover {
  background: #f3f4f6;
}

.confirm-btn.confirm {
  background: #3b82f6;
  color: #fff;
}

.confirm-btn.confirm:hover {
  background: #2563eb;
}

.confirm-btn.confirm.warning {
  background: #f59e0b;
}

.confirm-btn.confirm.warning:hover {
  background: #d97706;
}

.confirm-btn.confirm.error {
  background: #ef4444;
}

.confirm-btn.confirm.error:hover {
  background: #dc2626;
}

.confirm-btn.confirm.success {
  background: #22c55e;
}

.confirm-btn.confirm.success:hover {
  background: #16a34a;
}
</style>
