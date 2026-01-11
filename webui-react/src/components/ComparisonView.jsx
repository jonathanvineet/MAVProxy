import React, { useState, useEffect, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import api from '../api'
import GraphAIChat from './GraphAIChat'
import html2canvas from 'html2canvas'

export default function ComparisonView({ allProfiles }) {
  const [comparisonPanels, setComparisonPanels] = useState([
    { id: 1, profile: null, savedGraphs: [], selectedGraph: null, graphData: null, loading: false, showAIChat: false }
  ])
  const chartRefs = useRef({}) // Stores { [panelId]: Chart.js instance }
  const containerRefs = useRef({}) // Stores { [panelId]: DOM element for graph container }

  const FLIGHT_MODE_COLORS = {
    'UNKNOWN': 'rgba(255, 192, 203, 0.5)',
    'MANUAL': 'rgba(144, 238, 144, 0.5)',
    'RTL': 'rgba(173, 216, 230, 0.5)',
    'AUTO': 'rgba(176, 224, 230, 0.5)',
    'GUIDED': 'rgba(221, 160, 221, 0.5)',
    'LOITER': 'rgba(255, 255, 224, 0.5)',
    'STABILIZE': 'rgba(255, 228, 196, 0.5)',
    'ACRO': 'rgba(255, 218, 185, 0.5)',
    'LAND': 'rgba(255, 160, 122, 0.5)',
    'CIRCLE': 'rgba(175, 238, 238, 0.5)',
    'FBWA': 'rgba(216, 191, 216, 0.5)',
    'CRUISE': 'rgba(255, 250, 205, 0.5)',
  }

  // Add a new comparison panel
  const addPanel = () => {
    const newId = Math.max(...comparisonPanels.map(p => p.id)) + 1
    setComparisonPanels([...comparisonPanels, {
      id: newId,
      profile: null,
      savedGraphs: [],
      selectedGraph: null,
      graphData: null,
      loading: false,
      showAIChat: false
    }])
  }

  // Remove a panel
  const removePanel = (panelId) => {
    if (comparisonPanels.length <= 1) {
      alert('Cannot remove the last panel')
      return
    }
    setComparisonPanels(comparisonPanels.filter(p => p.id !== panelId))
  }

  // Handle profile selection for a panel
  const handleProfileSelect = async (panelId, profileId) => {
    const profile = allProfiles.find(p => p.id === profileId)
    if (!profile) return

    const updatedPanels = comparisonPanels.map(panel => {
      if (panel.id === panelId) {
        return { ...panel, profile, savedGraphs: [], selectedGraph: null, graphData: null, loading: true }
      }
      return panel
    })
    setComparisonPanels(updatedPanels)

    try {
      const res = await api.getSavedGraphs(profileId)
      const graphs = res.data.graphs || []

      setComparisonPanels(prev => prev.map(panel => {
        if (panel.id === panelId) {
          return { ...panel, savedGraphs: graphs, loading: false }
        }
        return panel
      }))
    } catch (error) {
      console.error('Error loading saved graphs:', error)
      alert('Failed to load saved graphs: ' + (error.response?.data?.error || error.message))
      setComparisonPanels(prev => prev.map(panel => {
        if (panel.id === panelId) {
          return { ...panel, loading: false }
        }
        return panel
      }))
    }
  }

  // Handle graph selection for a panel
  const handleGraphSelect = (panelId, graphId) => {
    const panel = comparisonPanels.find(p => p.id === panelId)
    if (!panel) return

    const graph = panel.savedGraphs.find(g => g.id === graphId)
    if (!graph) return

    setComparisonPanels(prev => prev.map(p => {
      if (p.id === panelId) {
        return {
          ...p,
          selectedGraph: graph,
          graphData: graph.series_data || {}
        }
      }
      return p
    }))
  }

  // Export graph as PNG
  const handleExportGraphAsPNG = (panelId) => {
    try {
      const chartRef = chartRefs.current[panelId]
      if (!chartRef) {
        alert('Chart is not ready. Please wait for the graph to load.')
        return
      }

      let canvas = null
      if (chartRef.canvas) {
        canvas = chartRef.canvas
      } else if (chartRef.ctx && chartRef.ctx.canvas) {
        canvas = chartRef.ctx.canvas
      } else {
        alert('Unable to access chart canvas. Please try again.')
        return
      }

      const image = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const panel = comparisonPanels.find(p => p.id === panelId)
      const filename = panel?.selectedGraph?.name
        ? `${panel.selectedGraph.name}_${timestamp}.png`
        : `graph_${timestamp}.png`

      link.href = image
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      console.log('Graph exported as PNG:', filename)
    } catch (error) {
      console.error('Error exporting PNG:', error)
      alert('Failed to export graph: ' + error.message)
    }
  }

  // Toggle AI chat for a panel
  const toggleAIChat = (panelId) => {
    setComparisonPanels(prev => prev.map(p => {
      if (p.id === panelId) {
        return { ...p, showAIChat: !p.showAIChat }
      }
      return p
    }))
  }

  // Render a single graph
  const renderGraph = (panel) => {
    if (!panel.graphData || Object.keys(panel.graphData).length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          Select a profile and graph to display
        </div>
      )
    }

    const SERIES_COLORS = [
      'rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)', 'rgb(255, 128, 0)',
      'rgb(128, 128, 0)', 'rgb(0, 0, 0)', 'rgb(128, 128, 128)', 'rgb(255, 255, 0)'
    ]

    const normalizePoint = (p) => {
      if (!p) return null
      if (Array.isArray(p) && p.length >= 2) {
        const t = Number(p[0])
        const v = Number(p[1])
        return Number.isNaN(t) || Number.isNaN(v) ? null : { t, v }
      }
      const hasTV = p.t !== undefined && p.v !== undefined
      const hasXY = p.x !== undefined && p.y !== undefined
      if (!hasTV && !hasXY) return null
      const t = Number(hasTV ? p.t : p.x)
      const v = Number(hasTV ? p.v : p.y)
      return Number.isNaN(t) || Number.isNaN(v) ? null : { t, v }
    }

    const allTimestamps = new Set()
    Object.values(panel.graphData).forEach(series => {
      if (Array.isArray(series)) {
        series.forEach(p => {
          const norm = normalizePoint(p)
          if (norm) allTimestamps.add(norm.t)
        })
        return
      }
      if (series && typeof series === 'object') {
        Object.values(series).forEach(arr => {
          if (!Array.isArray(arr)) return
          arr.forEach(p => {
            const norm = normalizePoint(p)
            if (norm) allTimestamps.add(norm.t)
          })
        })
      }
    })
    const labels = Array.from(allTimestamps).sort((a, b) => a - b)

    const datasets = []
    let colorIdx = 0
    Object.keys(panel.graphData).forEach((field) => {
      const series = panel.graphData[field]
      if (Array.isArray(series)) {
        const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length]
        colorIdx += 1
        const dataMap = {}
        series.forEach(p => {
          const norm = normalizePoint(p)
          if (norm) dataMap[norm.t] = norm.v
        })
        const values = labels.map(t => dataMap[t] !== undefined ? dataMap[t] : null)
        datasets.push({
          label: field,
          data: values,
          borderColor: color,
          backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
          borderWidth: 2,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: true
        })
        return
      }
      if (series && typeof series === 'object') {
        Object.keys(series).forEach(sub => {
          const arr = series[sub]
          if (!Array.isArray(arr)) return
          const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length]
          colorIdx += 1
          const dataMap = {}
          arr.forEach(p => {
            const norm = normalizePoint(p)
            if (norm) dataMap[norm.t] = norm.v
          })
          const values = labels.map(t => dataMap[t] !== undefined ? dataMap[t] : null)
          datasets.push({
            label: `${field}.${sub}`,
            data: values,
            borderColor: color,
            backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
            spanGaps: true
          })
        })
      }
    })

    const chartData = { labels, datasets }

    // Build flight mode annotations if available
    const annotations = {}
    if (panel.selectedGraph?.flight_modes) {
      panel.selectedGraph.flight_modes.forEach((fm, idx) => {
        const color = FLIGHT_MODE_COLORS[fm.mode] || 'rgba(200, 200, 200, 0.3)'
        annotations[`mode-${idx}`] = {
          type: 'box',
          xMin: fm.start,
          xMax: fm.end,
          yMin: 'min',
          yMax: 'max',
          backgroundColor: color,
          borderWidth: 0,
          drawTime: 'beforeDatasetsDraw'
        }
      })
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: '#1a1a1a', font: { size: 10 } }, position: 'top' },
        annotation: { annotations },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1a1a1a',
          bodyColor: '#1a1a1a',
          borderColor: '#ddd',
          borderWidth: 1,
          callbacks: {
            filter: function (tooltipItem) {
              return tooltipItem.parsed && tooltipItem.parsed.y !== null && tooltipItem.parsed.y !== undefined
            },
            title: function (context) {
              const index = context[0].dataIndex
              const time = labels[index]
              return `Time: ${Number(time).toFixed(2)}s`
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#1a1a1a',
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: function (value) {
              return Number(value).toFixed(2) + 's'
            }
          },
          grid: { color: 'rgba(0,0,0,0.1)' }
        },
        y: {
          ticks: { color: '#1a1a1a', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.1)' }
        }
      },
      interaction: { mode: 'index', intersect: false }
    }

    return <Line 
      ref={(ref) => { chartRefs.current[panel.id] = ref }} 
      data={chartData} 
      options={chartOptions} 
    />
  }

  return (
    <div style={{
      background: '#f8f9fa',
      border: '1px solid #ddd',
      borderRadius: 6,
      padding: 16,
      marginTop: 20
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: 0, color: '#1a1a1a' }}>📊 Graph Comparison</h4>
        <button
          onClick={addPanel}
          style={{
            fontSize: 11,
            padding: '6px 12px',
            cursor: 'pointer',
            background: '#0a7ea4',
            color: '#fff',
            border: '1px solid #0d99c6',
            borderRadius: 3,
            fontWeight: 'bold'
          }}
        >
          ➕ Add Panel
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(comparisonPanels.length, 2)}, 1fr)`,
        gap: 16,
        marginBottom: 16,
        gridAutoRows: '1fr',
        width: '100%'
      }}>
        {comparisonPanels.map((panel, idx) => (
          <div
            key={panel.id}
            style={{
              background: '#ffffff',
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: 12,
              height: 750,
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              boxSizing: 'border-box',
              minWidth: 0
            }}
          >
            {/* Header with dropdowns and remove button */}
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 style={{ margin: 0, color: '#0a7ea4', fontSize: 13 }}>Panel {idx + 1}</h5>
                {comparisonPanels.length > 1 && (
                  <button
                    onClick={() => removePanel(panel.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      cursor: 'pointer',
                      background: '#8b4545',
                      color: '#fff',
                      border: '1px solid #a55555',
                      borderRadius: 3
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Profile dropdown */}
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                  Profile:
                </label>
                <select
                  value={panel.profile?.id || ''}
                  onChange={(e) => handleProfileSelect(panel.id, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 11,
                    background: '#ffffff',
                    color: '#1a1a1a',
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select a profile...</option>
                  {allProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Saved Graph dropdown */}
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                  Saved Graph:
                </label>
                <select
                  value={panel.selectedGraph?.id || ''}
                  onChange={(e) => handleGraphSelect(panel.id, e.target.value)}
                  disabled={!panel.profile || panel.savedGraphs.length === 0}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 11,
                    background: '#ffffff',
                    color: '#1a1a1a',
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    cursor: panel.profile && panel.savedGraphs.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: panel.profile && panel.savedGraphs.length > 0 ? 1 : 0.5
                  }}
                >
                  <option value="">
                    {panel.loading ? 'Loading graphs...' :
                      !panel.profile ? 'Select a profile first' :
                        panel.savedGraphs.length === 0 ? 'No saved graphs' :
                          'Select a graph...'}
                  </option>
                  {panel.savedGraphs.map(graph => (
                    <option key={graph.id} value={graph.id}>
                      {graph.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Graph info */}
              {panel.selectedGraph && (
                <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                  <div>{panel.selectedGraph.description}</div>
                  <div style={{ marginTop: 2 }}>
                    Type: {panel.selectedGraph.graph_type} |
                    {panel.selectedGraph.message_type && ` Message: ${panel.selectedGraph.message_type}`}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {panel.selectedGraph && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => handleExportGraphAsPNG(panel.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#4CAF50',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  💾 Save PNG
                </button>
                <button
                  onClick={() => toggleAIChat(panel.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: panel.showAIChat ? '#ff6b6b' : '#0a7ea4',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {panel.showAIChat ? '✕ Close Mavvy' : '🤖 Ask Mavvy'}
                </button>
              </div>
            )}

            {/* Graph display area */}
            <div 
              ref={(ref) => { containerRefs.current[panel.id] = ref }}
              style={{ flex: 1, background: '#ffffff', borderRadius: 4, padding: 8, minHeight: 0, border: '1px solid #e0e0e0' }}
            >
              {renderGraph(panel)}
            </div>

            {/* AI Chat */}
            {panel.showAIChat && panel.selectedGraph && (
              <GraphAIChat
                seriesData={panel.graphData || {}}
                flightModes={panel.selectedGraph.flight_modes || []}
                graphName={panel.selectedGraph.name}
                analysis={null}
                isVisible={panel.showAIChat}
                onClose={() => toggleAIChat(panel.id)}
                chartRef={{ current: containerRefs.current[panel.id] }}
              />
            )}
          </div>
        ))}
      </div>

      {comparisonPanels.length > 2 && (
        <div style={{ fontSize: 11, color: '#666', textAlign: 'center', fontStyle: 'italic' }}>
          💡 Showing {comparisonPanels.length} panels. Scroll to view more or remove panels to reduce clutter.
        </div>
      )}
    </div>
  )
}
