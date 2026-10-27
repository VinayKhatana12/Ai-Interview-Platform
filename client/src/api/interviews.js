import { api } from './client.js'

export const createInterview = (config) =>
  api('/api/interviews', { method: 'POST', body: config })

export const listInterviews = (page = 1, pageSize = 10, filters = {}) => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  // Server validates these (status enum, date coercion); empty values are omitted.
  for (const key of ['status', 'role', 'from', 'to']) {
    if (filters[key]) params.set(key, filters[key])
  }
  return api(`/api/interviews?${params.toString()}`)
}

export const getInterviewStats = () => api('/api/interviews/stats')
export const getInterviewAnalytics = () => api('/api/interviews/analytics')

// Session flow
export const getInterviewSession = (id) => api(`/api/interviews/${id}/session`)
export const startInterview = (id) => api(`/api/interviews/${id}/start`, { method: 'POST' })
export const submitAnswer = (id, questionId, responseText) =>
  api(`/api/interviews/${id}/answers`, { method: 'POST', body: { questionId, responseText } })
export const generateFollowUp = (id, questionId) =>
  api(`/api/interviews/${id}/followup`, { method: 'POST', body: { questionId } })
export const completeInterview = (id) => api(`/api/interviews/${id}/complete`, { method: 'POST' })
export const getInterviewResults = (id) => api(`/api/interviews/${id}/results`)
export const evaluateInterview = (id) => api(`/api/interviews/${id}/evaluate`, { method: 'POST' })
export const generateInterviewFeedback = (id) =>
  api(`/api/interviews/${id}/feedback`, { method: 'POST' })
// Retake: new PENDING attempt from this interview's saved configuration.
export const retakeInterview = (id) => api(`/api/interviews/${id}/retake`, { method: 'POST' })
// Compare two owned completed attempts (the other one via the `with` query).
export const compareInterviews = (id, otherId) =>
  api(`/api/interviews/${id}/compare?with=${encodeURIComponent(otherId)}`)
export const transcribeRecording = (id, blob) => {
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  return api(`/api/interviews/${id}/transcribe`, { method: 'POST', body: form })
}
