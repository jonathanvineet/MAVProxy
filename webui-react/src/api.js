import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

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
    // Directly POST to backend (bypass Vite proxy) for debugging.
    const url = 'http://127.0.0.1:3030/api/analyze'
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
  }
}
