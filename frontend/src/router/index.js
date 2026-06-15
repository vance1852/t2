import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/utils/auth'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '运营看板' }
      },
      {
        path: 'map',
        name: 'Map',
        component: () => import('@/views/MapDispatch.vue'),
        meta: { title: '地图调度' }
      },
      {
        path: 'fences',
        name: 'Fences',
        component: () => import('@/views/FenceManage.vue'),
        meta: { title: '围栏管理' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/WorkOrders.vue'),
        meta: { title: '工单系统' }
      },
      {
        path: 'replay',
        name: 'Replay',
        component: () => import('@/views/Replay.vue'),
        meta: { title: '调度回放' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = getToken()
  if (to.meta.requiresAuth !== false && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
