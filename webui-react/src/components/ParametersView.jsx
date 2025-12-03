import React, { useEffect, useState } from 'react'
import api from '../api'

export default function ParametersView({ token }) {
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    api.getParams(token)
      .then(res => setParams(res.data.params || {}))
      .catch(err => console.error('Failed to load params:', err))
      .finally(() => setLoading(false))
  }, [token])

  if (!token) return <div>Upload a log file to view parameters</div>
  if (loading) return <div>Loading parameters...</div>

  const filtered = Object.entries(params).filter(([name]) =>
    name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="params-view">
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search parameters..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: '100%', padding: 8 }}
        />
      </div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Showing {filtered.length} of {Object.keys(params).length} parameters
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>Parameter</th>
            <th style={{ textAlign: 'right', padding: 8 }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(([name, value]) => (
            <tr key={name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8, fontFamily: 'monospace' }}>{name}</td>
              <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>
                {typeof value === 'number' ? value.toFixed(6) : value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
