import React, { useState } from 'react'
import api from '../api'

export default function MessageDump({ token, analysis }) {
  const [selectedType, setSelectedType] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(100)

  const loadMessages = async () => {
    if (!token || !selectedType) return
    setLoading(true)
    try {
      const res = await api.dumpMessages(token, selectedType, limit)
      setMessages(res.data.messages || [])
    } catch (err) {
      console.error('Failed to dump messages:', err)
      alert('Failed to dump messages: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const messageTypes = analysis?.messages ? Object.keys(analysis.messages) : []

  return (
    <div className="message-dump">
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <label>Message Type: </label>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            style={{ padding: 6 }}
          >
            <option value="">Select a message type...</option>
            {messageTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Limit: </label>
          <input
            type="number"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            min="1"
            max="1000"
            style={{ width: 80, padding: 6 }}
          />
        </div>
        <button onClick={loadMessages} disabled={!selectedType || loading} className="btn">
          {loading ? 'Loading...' : 'Dump Messages'}
        </button>
      </div>

      {messages.length > 0 && (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Showing {messages.length} messages of type {selectedType}
          </div>
          <div style={{ maxHeight: 500, overflow: 'auto', border: '1px solid #ccc', borderRadius: 4 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ borderBottom: '1px solid #eee', padding: 8, fontSize: 12, fontFamily: 'monospace' }}>
                <div style={{ color: '#666', marginBottom: 4 }}>
                  [{msg.timestamp?.toFixed(3)}s]
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(msg.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {!token && <div>Upload a log file to dump messages</div>}
      {token && messages.length === 0 && !loading && selectedType && (
        <div>No messages found (or click "Dump Messages")</div>
      )}
    </div>
  )
}
