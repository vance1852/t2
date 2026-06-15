import { defineStore } from "pinia";
import { ref } from "vue";
import { getToken, setToken, removeToken } from "@/utils/auth";
import request from "@/api/request";

const USER_INFO_KEY = "bike_fence_user_info";

export const useUserStore = defineStore("user", () => {
  const token = ref(getToken() || "");
  const userInfo = ref(
    JSON.parse(localStorage.getItem(USER_INFO_KEY) || "null"),
  );

  async function login(username, password) {
    const res = await request.post("/auth/login", { username, password });
    if (res.success && res.data) {
      if (res.data.token) {
        token.value = res.data.token;
        setToken(res.data.token);
      }
      if (res.data.user) {
        userInfo.value = res.data.user;
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(res.data.user));
      }
      return res.data;
    }
    throw new Error(res.message || "登录失败");
  }

  function logout() {
    token.value = "";
    userInfo.value = null;
    removeToken();
    localStorage.removeItem(USER_INFO_KEY);
  }

  return {
    token,
    userInfo,
    login,
    logout,
  };
});
