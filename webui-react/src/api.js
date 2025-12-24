import axios from 'axios'

// Decide API base URL. In dev, always use Vite proxy at /api to avoid CORS.
const getAPIBaseURL = () => {
  if (import.meta.env.DEV) {
    return '/api'
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  return '/api'
}

const client = axios.create({ baseURL: getAPIBaseURL() })

// Maximum chunk size for upload (3.5MB to stay well under 4MB limit with overhead)
const CHUNK_SIZE = 3.5 * 1024 * 1024

/**
 * Compress a file using gzip compression
 * @param {File} file - The file to compress
 * @returns {Promise<{blob: Blob, originalSize: number, compressedSize: number}>}
 */
async function compressFile(file) {
  console.log('Compressing file:', file.name, 'Original size:', file.size)
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  
  // Create a compression stream
  const stream = new Response(arrayBuffer).body
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
  
  // Read the compressed data
  const compressedResponse = new Response(compressedStream)
  const compressedBlob = await compressedResponse.blob()
  
  console.log('Compressed:', file.size, '->', compressedBlob.size, 
    `(${((compressedBlob.size / file.size) * 100).toFixed(1)}%)`)
  
  return {
    blob: compressedBlob,
    originalSize: file.size,
    compressedSize: compressedBlob.size
  }
}

/**
 * Upload a file in chunks
 * @param {Blob} blob - The blob to upload (compressed or uncompressed)
 * @param {string} filename - Original filename
 * @param {number} originalSize - Original uncompressed size
 * @param {string} profileId - Profile ID for storing analysis
 * @param {Function} onUploadProgress - Progress callback
 * @returns {Promise<{token: string, analysis: object}>}
 */
async function uploadInChunks(blob, filename, originalSize, profileId = null, onUploadProgress = null) {
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE)
  const uploadId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  
  console.log(`Uploading ${filename} in ${totalChunks} chunks (${(blob.size / 1024 / 1024).toFixed(1)}MB total)`)
  
  let uploadedBytes = 0
  let finalResponse = null
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, blob.size)
    const chunk = blob.slice(start, end)
    
    const fd = new FormData()
    fd.append('file', chunk, `${filename}.chunk${chunkIndex}`)
    fd.append('chunk_index', chunkIndex.toString())
    fd.append('total_chunks', totalChunks.toString())
    fd.append('upload_id', uploadId)
    fd.append('original_filename', filename)
    fd.append('original_size', originalSize.toString())
    fd.append('total_size', blob.size.toString())
    if (profileId) {
      fd.append('profile_id', profileId)
    }
    
    console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks} (${(chunk.size / 1024).toFixed(1)}KB)`)
    
    try {
      const response = await client.post('/upload_chunk', fd)
      
      uploadedBytes += chunk.size
      
      if (onUploadProgress) {
        onUploadProgress({
          loaded: uploadedBytes,
          total: blob.size,
          chunk: chunkIndex + 1,
          totalChunks: totalChunks
        })
      }
      
      // Check if this is the final response (has token and analysis)
      if (response.data && response.data.token) {
        finalResponse = response.data
        console.log('Analysis complete! Token:', response.data.token)
      }
      
    } catch (error) {
      console.error(`Failed to upload chunk ${chunkIndex}:`, error)
      throw new Error(`Upload failed at chunk ${chunkIndex + 1}/${totalChunks}: ${error.message}`)
    }
  }
  
  if (!finalResponse) {
    throw new Error('Upload completed but no analysis response received')
  }
  
  return finalResponse
}

export default {
  uploadFile: async (file, options={}, onUploadProgress=null, profileId=null) => {
    try {
      // Compress the file first
      const { blob: compressedBlob, originalSize, compressedSize } = await compressFile(file)
      
      console.log(`File compression complete: ${(originalSize / 1024 / 1024).toFixed(1)}MB -> ${(compressedSize / 1024 / 1024).toFixed(1)}MB`)
      
      // Upload in chunks (handles any size)
      const result = await uploadInChunks(compressedBlob, file.name, originalSize, profileId, onUploadProgress)
      
      // Wrap result in axios-compatible format
      return { data: result }
      
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    }
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
  },
  
  // Profile Management
  getProfiles: () => {
    return client.get('/profiles')
  },
  getProfile: (profileId) => {
    return client.get(`/profiles/${profileId}`)
  },
  createProfile: (profileData) => {
    return client.post('/profiles', profileData)
  },
  updateProfile: (profileId, profileData) => {
    return client.put(`/profiles/${profileId}`, profileData)
  },
  deleteProfile: (profileId) => {
    return client.delete(`/profiles/${profileId}`)
  },
  
  // Analysis Results
  getAnalysisResults: (profileId) => {
    return client.get(`/profiles/${profileId}/analysis`)
  },
  getAnalysisResult: (resultId) => {
    return client.get(`/analysis/${resultId}`)
  },
  deleteAnalysisResult: (resultId) => {
    return client.delete(`/analysis/${resultId}`)
  },
  
  // Saved Graphs
  saveGraph: (graphData) => {
    return client.post('/save_graph', graphData)
  },
  getSavedGraphs: (profileId) => {
    return client.get(`/profiles/${profileId}/saved_graphs`)
  },
  deleteSavedGraph: (graphId) => {
    return client.delete(`/saved_graphs/${graphId}`)
  }
}

