<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-icon">🚲</span>
        <span class="logo-text">单车调度</span>
      </div>
      <nav class="menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
          active-class="active"
        >
          <span class="menu-icon">{{ item.icon }}</span>
          <span class="menu-text">{{ item.text }}</span>
        </router-link>
      </nav>
    </aside>
    <div class="main">
      <header class="header">
        <div class="breadcrumb">{{ currentTitle }}</div>
        <div class="user-area">
          <div class="user-info">
            <span class="avatar">{{ avatarText }}</span>
            <span class="username">{{ username }}</span>
          </div>
          <button class="logout-btn" @click="handleLogout">退出</button>
        </div>
      </header>
      <div class="content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const menuItems = [
  { path: '/dashboard', icon: '📊', text: '运营看板' },
  { path: '/map', icon: '🗺️', text: '地图调度' },
  { path: '/fences', icon: '🔲', text: '围栏管理' },
  { path: '/orders', icon: '📋', text: '工单系统' },
  { path: '/replay', icon: '▶️', text: '调度回放' }
]

const currentTitle = computed(() => route.meta?.title || '首页')

const username = computed(() => {
  return userStore.userInfo?.username || userStore.userInfo?.name || '管理员'
})

const avatarText = computed(() => {
  const name = username.value
  return name ? name.charAt(0).toUpperCase() : 'U'
})

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.logo-icon {
  font-size: 24px;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
}

.menu {
  flex: 1;
  padding: 16px 0;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  color: #9ca3af;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.menu-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-left-color: #3b82f6;
}

.menu-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.menu-text {
  font-size: 14px;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f3f4f6;
}

.header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.breadcrumb {
  font-size: 16px;
  font-weight: 500;
  color: #1f2937;
}

.user-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
}

.username {
  font-size: 14px;
  color: #374151;
}

.logout-btn {
  padding: 6px 16px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #dc2626;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.page {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  min-height: 100%;
}

.page h2 {
  margin: 0 0 12px 0;
  font-size: 20px;
  color: #1f2937;
}

.page p {
  margin: 0;
  color: #6b7280;
  line-height: 1.6;
}
</style>
