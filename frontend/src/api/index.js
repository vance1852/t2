import request from './request'

export const auth = {
  login(data) {
    return request.post('/auth/login', data)
  },
  logout() {
    return request.post('/auth/logout')
  },
  getMe() {
    return request.get('/auth/me')
  }
}

export const stats = {
  overview() {
    return request.get('/stats/overview')
  },
  trend7Day() {
    return request.get('/stats/trend-7day')
  },
  districtStats() {
    return request.get('/stats/district-stats')
  },
  fenceTurnover() {
    return request.get('/stats/fence-turnover')
  },
  responseHeatmap() {
    return request.get('/stats/response-heatmap')
  }
}

export const workOrders = {
  list(params = {}) {
    return request.get('/work-orders', { params })
  },
  summary() {
    return request.get('/work-orders/stats/summary')
  },
  responseTime() {
    return request.get('/work-orders/stats/response-time')
  },
  stats7Day() {
    return request.get('/work-orders/stats/7day-trend')
  },
  detail(id) {
    return request.get(`/work-orders/${id}`)
  },
  create(data) {
    return request.post('/work-orders', data)
  },
  start(id, assignee) {
    return request.put(`/work-orders/${id}/start`, { assignee })
  },
  complete(id) {
    return request.put(`/work-orders/${id}/complete`)
  },
  cancel(id) {
    return request.put(`/work-orders/${id}/cancel`)
  }
}

export const fences = {
  list(params = {}) {
    return request.get('/fences', { params })
  },
  detail(id) {
    return request.get(`/fences/${id}`)
  },
  bikes(id) {
    return request.get(`/fences/${id}/bikes`)
  },
  create(data) {
    return request.post('/fences', data)
  },
  update(id, data) {
    return request.put(`/fences/${id}`, data)
  },
  remove(id) {
    return request.delete(`/fences/${id}`)
  }
}

export const dispatch = {
  list(params = {}) {
    return request.get('/dispatch', { params })
  },
  detail(id) {
    return request.get(`/dispatch/${id}`)
  },
  statsSummary() {
    return request.get('/dispatch/stats/summary')
  },
  generate() {
    return request.post('/dispatch/generate')
  },
  execute(id) {
    return request.post(`/dispatch/${id}/execute`)
  },
  cancel(id) {
    return request.post(`/dispatch/${id}/cancel`)
  },
  completeMove(id, moveId) {
    return request.post(`/dispatch/${id}/move/${moveId}/complete`)
  }
}

export const bikes = {
  list(params = {}) {
    return request.get('/bikes', { params })
  },
  summary() {
    return request.get('/bikes/summary')
  },
  mapStatus() {
    return request.get('/bikes/status/map')
  },
  detail(id) {
    return request.get(`/bikes/${id}`)
  },
  update(id, data) {
    return request.put(`/bikes/${id}`, data)
  }
}

export const publicMap = {
  mapData() {
    return request.get('/public/map-data')
  }
}

export default {
  auth,
  stats,
  workOrders,
  fences,
  dispatch,
  bikes,
  publicMap
}
