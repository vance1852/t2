<template>
  <router-view />
  <ConfirmDialog ref="confirmDialogRef" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { setConfirmRef } from '@/utils/confirm.js'

const confirmDialogRef = ref(null)

onMounted(() => {
  setConfirmRef(confirmDialogRef.value)
})
</script>

<style scoped>
</style>
