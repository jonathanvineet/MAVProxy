import React, { useEffect, useState } from 'react'
import api from '../api'

export default function StatsView({ token }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    api.getStats(token)
      .then(res => setStats(res.data))
      .catch(err => console.error('Failed to load stats:', err))
      .finally(() => setLoading(false))
  }, [token])

  if (!token) return <div>Upload a log file to view statistics</div>
  if (loading) return <div>Loading statistics...</div>
  if (!stats) return <div>No statistics available</div>

  const formatTime = (ts) => {
    if (!ts) return 'N/A'
    return new Date(ts * 1000).toLocaleString()
  }

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return `${h}h ${m}m ${s}s`
  }

  return (
    <div className="stats-view">
      <h3>Log Statistics</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8, fontWeight: 'bold' }}>Total Messages</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{stats.total_messages?.toLocaleString()}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8, fontWeight: 'bold' }}>Message Types</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{stats.message_types}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8, fontWeight: 'bold' }}>First Timestamp</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{formatTime(stats.first_timestamp)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8, fontWeight: 'bold' }}>Last Timestamp</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{formatTime(stats.last_timestamp)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8, fontWeight: 'bold' }}>Duration</td>
            <td style={{ padding: 8, textAlign: 'right' }}>{formatDuration(stats.duration_seconds)}</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Messages Per Type</h4>
      <div style={{ maxHeight: 400, overflow: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', position: 'sticky', top: 0, background: 'white' }}>
              <th style={{ textAlign: 'left', padding: 8 }}>Message Type</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.messages_per_type || {})
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <tr key={type} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{type}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{count.toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
