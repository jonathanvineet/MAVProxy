import React, { useState, useRef, useEffect } from 'react'
import api from '../api'

export default function GraphAIChat({ seriesData, flightModes, graphName, analysis, isVisible, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const [rateLimitError, setRateLimitError] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize agent with context on first render
  useEffect(() => {
    if (isVisible && !isInitialized) {
      initializeAgent()
    }
  }, [isVisible, isInitialized])

  // Reset initialization when graph changes
  useEffect(() => {
    setIsInitialized(false)
    setMessages([])
  }, [graphName, seriesData])

  const initializeAgent = async () => {
    setIsInitialized(true)
    
    // Just set a simple ready message - don't call AI yet
    const systemMessage = {
      role: 'assistant',
      content: `🤖 **Agent Ready**\n\nI've analyzed your quadcopter telemetry data:\n• **${Object.keys(seriesData).length}** data series\n• **${flightModes?.length || 0}** flight mode changes\n• Graph: **${graphName || 'Custom Graph'}**\n\nAsk me anything about attitude, battery, altitude, sensors, or flight behavior!`
    }
    
    setMessages([systemMessage])
  }

  const prepareGraphContext = () => {
    // Calculate statistics for each series
    const stats = {}
    Object.entries(seriesData).forEach(([field, points]) => {
      const values = points.map(p => p.v).filter(v => v != null)
      if (values.length > 0) {
        stats[field] = {
          min: Math.min(...values).toFixed(2),
          max: Math.max(...values).toFixed(2),
          avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          count: values.length
        }
      }
    })

    // Flight mode summary
    const modeSummary = {}
    flightModes?.forEach(fm => {
      modeSummary[fm.mode] = (modeSummary[fm.mode] || 0) + 1
    })

    // Available message types from analysis
    const messageTypes = analysis?.messages ? Object.keys(analysis.messages) : []

    return {
      stats,
      modeSummary,
      messageTypes,
      graphName,
      dataFields: Object.keys(seriesData)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    // Rate limiting - prevent requests within 3 seconds of last request
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    const MIN_REQUEST_INTERVAL = 3000 // 3 seconds minimum between requests

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const remainingTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000)
      setRateLimitError(true)
      const errorMessage = {
        role: 'assistant',
        content: `⏱️ **Please wait**: ${remainingTime}s before sending another message (Gemini API rate limit)`
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    setRateLimitError(false)
    setLastRequestTime(now)

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const context = prepareGraphContext()
      
      // Build system prompt with MAVExplorer domain knowledge - only when actually sending a message
      const systemPrompt = `You are an AI assistant specialized in analyzing quadcopter/UAV telemetry data from MAVProxy/MAVLink logs. This is MAVExplorer, a tool for visualizing and analyzing flight data.

**Current Graph Context:**
- Graph: ${context.graphName || 'Custom'}
- Data Fields: ${context.dataFields.join(', ')}
- Available Messages: ${context.messageTypes.slice(0, 10).join(', ')}${context.messageTypes.length > 10 ? '...' : ''}
- Flight Modes: ${Object.entries(context.modeSummary).map(([m, c]) => `${m}(${c})`).join(', ')}

**Field Statistics:**
${Object.entries(context.stats).map(([field, stat]) => 
  `• ${field}: min=${stat.min}, max=${stat.max}, avg=${stat.avg}, points=${stat.count}`
).join('\n')}

**Key MAVLink/Quadcopter Concepts:**
- **ATT (Attitude)**: Roll, Pitch, Yaw angles - aircraft orientation
- **BATT (Battery)**: Volt, Curr, CurrTot - power system monitoring
- **GPS**: Lat, Lng, Alt, Spd - position and velocity
- **CTUN**: Navigation/control tuning - altitude hold, throttle
- **IMU**: Gyroscopes, accelerometers - inertial sensors
- **RCIN/RCOU**: RC input/servo output - control signals
- **Flight Modes**: MANUAL, STABILIZE, LOITER, AUTO, RTL, GUIDED, LAND

**Response Format (REQUIRED - STRICT):**

STOP. Read this first. Your response MUST be EXACTLY this structure. Nothing more. Nothing less.

📊 **What the graph shows**
2 short sentences max. Just the facts you see.

✅ **What this likely means**
2 short sentences max. Just the diagnosis.

🔧 **Quick fixes**
🔹 Bullet 1
🔹 Bullet 2
(2-3 bullets max, each one line)

CRITICAL RULES:
- TOTAL: Maximum 80 words
- Do NOT explain concepts
- Do NOT give long paragraphs
- ONLY use the 3 sections above
- Be brutally short and direct
- One sentence = one line max

If user question is off-topic, respond: "❌ Not in current graph data"

Answer about the telemetry in the format above.`

      // Prepare conversation history - filter out system messages for Gemini
      const conversationMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-6), // Last 6 messages
        userMessage
      ]

      // Call backend endpoint - only when user explicitly sends a message
      const response = await api.sendAIMessage(conversationMessages)

      const assistantMessage = {
        role: 'assistant',
        content: response.data.choices[0].message.content
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('AI API Error:', error)
      let errorContent = `❌ **Error**: ${error.response?.data?.error || error.message || 'Failed to get response from AI service'}`
      
      if (error.response?.status === 429) {
        errorContent = `⏱️ **Rate Limited**: Gemini API limit reached. Please wait a moment and try again. (Limit: 15 requests per minute on free tier)`
      }
      
      const errorMessage = {
        role: 'assistant',
        content: errorContent
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setIsInitialized(false)
    initializeAgent()
  }

  if (!isVisible) return null

  // Check if Gemini API quota is exceeded (for development only)
  const GEMINI_QUOTA_EXCEEDED = false // Set to true if API quota is exceeded

  if (GEMINI_QUOTA_EXCEEDED) {
    return (
      <div style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 360,
        height: 500,
        background: '#1a1a1a',
        border: '2px solid #ff6b6b',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: 1000
      }}>
        <div style={{
          padding: '10px 14px',
          background: '#ff6b6b',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h5 style={{ margin: 0, color: '#fff', fontSize: 14 }}>🤖 AI Chat</h5>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
        <div style={{
          flex: 1,
          padding: 16,
          overflowY: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <h3>⏳ API Quota Exceeded</h3>
            <p style={{ marginTop: 8, color: '#aaa', fontSize: 13 }}>
              The Gemini API free tier quota has been reached for today.
            </p>
            <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
              ✅ Quota resets in ~24 hours<br/>
              💳 Or use a paid API key for unlimited access
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      width: 360,
      height: 500,
      background: '#1a1a1a',
      border: '2px solid #4CAF50',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      zIndex: 1000
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: '#0a7ea4',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #4CAF50'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <strong style={{ fontSize: 14, color: '#fff' }}>Graph AI Assistant</strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={clearChat}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11
            }}
            title="Clear chat"
          >
            🔄
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
              lineHeight: 1
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 8,
              background: msg.role === 'user' ? '#0a7ea4' : '#2a2a2a',
              color: '#fff',
              fontSize: 13,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: 8,
            background: '#2a2a2a',
            color: '#999',
            fontSize: 13
          }}>
            <span className="typing-indicator">●●●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 10,
        borderTop: '1px solid #333',
        background: '#0a0a0a'
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about the graph data..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              outline: 'none'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim() || rateLimitError}
            style={{
              padding: '8px 14px',
              background: loading || !input.trim() ? '#444' : '#4CAF50',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: 16,
              transition: 'background 0.2s'
            }}
          >
            ⬆
          </button>
        </div>
        <div style={{
          fontSize: 10,
          color: '#666',
          marginTop: 6,
          textAlign: 'center'
        }}>
          Try: "What's the attitude range?" or "Any battery issues?"
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .typing-indicator {
          animation: blink 1.4s infinite;
        }
      `}</style>
    </div>
  )
}
