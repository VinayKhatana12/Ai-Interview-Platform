import { api } from './client.js'

export const createInterview = (config) =>
  api('/api/interviews', { method: 'POST', body: config })

export const listInterviews = (page = 1, pageSize = 10) =>
  api(`/api/interviews?page=${page}&pageSize=${pageSize}`)

export const getInterviewStats = () => api('/api/interviews/stats')
