import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getToken, setToken, removeToken } from '@/utils/auth'
import request from '@/api/request'

const USER_INFO_KEY = 'bike_fence_user_info'

export const useUserStore = defineStore('user', () => {
  const token = ref(getToken() || '')
  const userInfo = ref(JSON.parse(localStorage.getItem(USER_INFO_KEY) || 'null'))

  async function login(username, password) {
    const res = await request.post('/login', { username, password })
    if (res.token) {
      token.value = res.token
      setToken(res.token)
    }
    if (res.user) {
      userInfo.value = res.user
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(res.user))
    }
    return res
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    removeToken()
    localStorage.removeItem(USER_INFO_KEY)
  }

  return {
    token,
    userInfo,
    login,
    logout
  }
})
