import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

export default {
  uploadFile: (file, options={}) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('options', JSON.stringify(options))
    return client.post('/analyze', fd, { headers: {'Content-Type':'multipart/form-data'} })
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
