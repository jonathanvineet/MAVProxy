import React, { useState, useRef, useEffect } from 'react'
import api from '../api'
import html2canvas from 'html2canvas'

export default function GraphAIChat({ seriesData, flightModes, graphName, analysis, isVisible, onClose, chartRef }) {
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

  // Parse markdown bold syntax (**text**) to actual bold formatting
  const formatMessage = (text) => {
    const parts = []
    let lastIndex = 0
    const regex = /\*\*(.+?)\*\*/g
    let match

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), bold: false })
      }
      // Add the bold text
      parts.push({ text: match[1], bold: true })
      lastIndex = regex.lastIndex
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), bold: false })
    }

    return parts.length > 0 ? parts : [{ text, bold: false }]
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

  const initializeAgent = async () => {
    setIsInitialized(true)
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

  const autoAnalyzeGraph = async () => {
    if (loading) return

    // Rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    const MIN_REQUEST_INTERVAL = 3000

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const remainingTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000)
      setRateLimitError(true)
      const errorMessage = {
        role: 'assistant',
        content: `⏱️ **Please wait**: ${remainingTime}s before analyzing another graph`
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    setRateLimitError(false)
    setLastRequestTime(now)

    // Add user message showing which graph is being analyzed
    const userMessage = { 
      role: 'user', 
      content: `📊 Analyze: ${graphName || 'Custom Graph'}` 
    }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)

    try {
      // Capture the graph as an image
      if (!chartRef?.current) {
        throw new Error('Graph not available for capture')
      }

      console.log('📸 Capturing graph as image...')
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2,
        logging: false
      })
      
      const imageBase64 = canvas.toDataURL('image/png').split(',')[1]
      console.log('✅ Graph captured, image size:', Math.round(imageBase64.length / 1024), 'KB')

      const systemPrompt = `You are analyzing a UAV/drone flight telemetry graph. Output ONLY this format:

**What the graph shows**
- [observation 1]
- [observation 2]

**✅ What this means**
- [diagnosis 1]
- [diagnosis 2]

**🔧 Suggestions**
🔹 [action 1]
🔹 [action 2]

Keep under 100 words. NO extra explanations.`

      // Gemini API format per official docs: flat array of text and inlineData objects
      const conversationMessages = [
        { text: systemPrompt + `\n\nAnalyze this telemetry graph: ${graphName || 'Custom Graph'}` },
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64
          }
        }
      ]

      const response = await api.sendAIMessage(conversationMessages)

      const assistantMessage = {
        role: 'assistant',
        content: response.data.choices[0].message.content
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('AI API Error:', error)
      let errorContent = `❌ **Error**: ${error.response?.data?.error || error.message || 'Failed to analyze graph'}`
      
      if (error.response?.status === 429) {
        errorContent = `⏱️ **Rate Limited**: Gemini API limit reached. Please wait a moment and try again.`
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
      const systemPrompt = `UAV flight telemetry. Output ONLY this format:\n\n**What the graph shows**\n- [fact 1]\n- [fact 2]\n\n**✅ What this means**\n- [issue 1]\n- [issue 2]\n\n**🔧 Suggestions**\n🔹 [fix 1]\n🔹 [fix 2]\n\nSTOP after 100 words. NO paragraphs.`

      // Send 100 evenly distributed data points across the dataset
      const dataPoints = Object.entries(context.stats)
        .slice(0, 3)
        .map(([field, stat]) => {
          const points = seriesData[field] || []
          console.log(`🔍 Field: ${field}, Total points: ${points.length}`)
          
          // Get up to 100 evenly distributed samples across entire dataset
          const sampleCount = Math.min(100, points.length)
          const step = Math.max(1, Math.floor(points.length / sampleCount))
          const samples = []
          for (let i = 0; i < points.length && samples.length < sampleCount; i += step) {
            samples.push(points[i].v.toFixed(1))
          }
          
          console.log(`📊 ${field} first 20 samples:`, samples.slice(0, 20))
          console.log(`📊 ${field} total samples sent: ${samples.length}`)
          
          return `${field}: range ${stat.min} to ${stat.max}, avg ${stat.avg}, ${stat.count} total points. Values: ${samples.join(',')}`
        })
        .join(' | ')
      
      console.log('📤 Data string length:', dataPoints.length, 'characters')

      // Prepare conversation history - filter out system messages for Gemini
      const conversationMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4),
        { role: 'user', content: `${input}\nUAV Telemetry Graph: ${context.graphName}\nData: ${dataPoints}` }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/bgdrorne.png" alt="Mavvy" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            <h5 style={{ margin: 0, color: '#fff', fontSize: 14 }}>AI Chat</h5>
          </div>
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
      background: '#ffffff',
      border: '2px solid #4CAF50',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
          <img src="/bgdrorne.png" alt="Mavvy" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <strong style={{ fontSize: 14, color: '#fff' }}>Mavvy</strong>
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
        gap: 12,
        background: '#f5f5f5'
      }}>
        {messages.map((msg, idx) => {
          const formattedParts = formatMessage(msg.content)
          return (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 8,
                background: msg.role === 'user' ? '#e3f2fd' : '#eeeeee',
                color: '#1a1a1a',
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {formattedParts.map((part, i) => 
                part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>
              )}
            </div>
          )
        })}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: 8,
            background: '#eeeeee',
            color: '#666',
            fontSize: 13
          }}>
            <span className="typing-indicator">●●●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 12,
        borderTop: '1px solid #e0e0e0',
        background: '#ffffff'
      }}>
        <button
          onClick={autoAnalyzeGraph}
          disabled={loading || rateLimitError}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#444' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: loading ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.4)'
          }}
        >
          {loading ? '⏳ Analyzing...' : '🔍 Ask Mavvy to Analyze Graph'}
        </button>
        <div style={{
          fontSize: 10,
          color: '#555',
          marginTop: 8,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4
        }}>
          <span>Click to get instant insights about {graphName || 'this graph'}</span>
        </div>
        
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Or ask a specific question..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: 6,
              color: '#1a1a1a',
              fontSize: 12,
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
              fontSize: 14,
              transition: 'background 0.2s'
            }}
          >
            ⬆
          </button>
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
