import axios from 'axios'

// Use environment variable for API URL in production, localhost in development
const getAPIBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  // Fallback for development
  if (typeof window !== 'undefined' && !window.location.origin.includes('localhost')) {
    return window.location.origin + '/api'
  }
  return '/api'
}

const client = axios.create({ baseURL: getAPIBaseURL() })

export default {
  uploadFile: (file, options={}, onUploadProgress=null) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('options', JSON.stringify(options))
    const cfg = {}
    // DO NOT set Content-Type manually: let the browser set the multipart boundary
    if (onUploadProgress) cfg.onUploadProgress = onUploadProgress
    console.log('api.uploadFile: sending', file.name, file.size)
    return client.post('/analyze', fd, cfg).catch(err => {
      console.error('uploadFile error', err)
      throw err
    })
  },
  uploadFileDirect: (file, options={}, onUploadProgress=null) => {
    // Use the configured API base URL
    const url = getAPIBaseURL() + '/analyze'
    const fd = new FormData()
    fd.append('file', file)
    fd.append('options', JSON.stringify(options))
    const cfg = { withCredentials: false }
    if (onUploadProgress) cfg.onUploadProgress = onUploadProgress
    console.log('api.uploadFileDirect: sending to', url, file.name, file.size)
    return axios.post(url, fd, cfg).catch(err => {
      console.error('uploadFileDirect error', err)
      throw err
    })
  },
  downloadCSV: (token, msg) => {
    return client.get(`/download`, { params:{ token, msg }, responseType:'blob' })
  },
  getTimeseries: (token, msg, field, decimate=1) => {
    return client.get('/timeseries', { params: { token, msg, field, decimate } })
  },
  evalGraph: (token, name, decimate=1) => {
    return client.get('/graph', { params: { token, name, decimate } })
  },
  listGraphs: () => {
    return client.get('/graphs')
  },
  getParams: (token) => {
    return client.get('/params', { params: { token } })
  },
  getParamChanges: (token) => {
    return client.get('/param_changes', { params: { token } })
  },
  getStats: (token) => {
    return client.get('/stats', { params: { token } })
  },
  getFlightModes: (token) => {
    return client.get('/flight_modes', { params: { token } })
  },
  listMessages: (token) => {
    return client.get('/messages', { params: { token } })
  },
  dumpMessages: (token, type, limit=100) => {
    return client.get('/dump', { params: { token, type, limit } })
  }
}
