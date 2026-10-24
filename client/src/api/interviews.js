import { api } from './client.js'

export const createInterview = (config) =>
  api('/api/interviews', { method: 'POST', body: config })

export const listInterviews = (page = 1, pageSize = 10) =>
  api(`/api/interviews?page=${page}&pageSize=${pageSize}`)

export const getInterviewStats = () => api('/api/interviews/stats')

// Session flow
export const getInterviewSession = (id) => api(`/api/interviews/${id}/session`)
export const startInterview = (id) => api(`/api/interviews/${id}/start`, { method: 'POST' })
export const submitAnswer = (id, questionId, responseText) =>
  api(`/api/interviews/${id}/answers`, { method: 'POST', body: { questionId, responseText } })
export const completeInterview = (id) => api(`/api/interviews/${id}/complete`, { method: 'POST' })
export const getInterviewResults = (id) => api(`/api/interviews/${id}/results`)
export const evaluateInterview = (id) => api(`/api/interviews/${id}/evaluate`, { method: 'POST' })
