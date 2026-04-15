import React, { useEffect, useState, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import api from '../api'
import TimeNormalizer from '../utils/TimeNormalizer'

export default function SavedGraphsPanel({ selectedProfile }) {
  const [savedGraphs, setSavedGraphs] = useState([])
  const [loadingSavedGraphs, setLoadingSavedGraphs] = useState(false)
  const [expandedGraphIds, setExpandedGraphIds] = useState(new Set())
  const [expandedGraphsData, setExpandedGraphsData] = useState({}) // Map of graphId -> { data, flightModes, loading, xInterval, yInterval, showFlightModes }
  const savedPanelRef = useRef(null)
  const chartRefs = useRef({}) // Store chart refs by graphId

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

  // Reload saved graphs function
  const reloadSavedGraphs = () => {
    if (!selectedProfile) return

    console.group('[SavedGraphs] Reload')
    console.log('Profile ID:', selectedProfile.id)
    setLoadingSavedGraphs(true)
    api.getSavedGraphs(selectedProfile.id)
      .then(res => {
        console.log('API /saved_graphs response:', res.data)
        const graphs = res.data.graphs || []
        console.log('Saved graphs count:', graphs.length)
        if (graphs.length > 0) {
          console.table(graphs.map(g => ({ id: g.id, name: g.name, type: g.graph_type })))
        }
        setSavedGraphs(graphs)
        console.log('[SavedGraphs] State updated')
      })
      .catch(err => {
        console.error('Error loading saved graphs:', err)
        alert('Failed to load saved graphs: ' + (err.response?.data?.error || err.message))
        setSavedGraphs([])
      })
      .finally(() => {
        setLoadingSavedGraphs(false)
        console.groupEnd()
      })
  }

  // Load saved graphs for selected profile
  useEffect(() => {
    if (!selectedProfile) {
      console.log('[Profile] Clearing saved graphs (no profile)')
      setSavedGraphs([])
      return
    }

    console.log('[Profile] Selected profile changed:', selectedProfile.id)
    reloadSavedGraphs()
  }, [selectedProfile])

  // Handle delete saved graph
  const handleDeleteSavedGraph = async (graphId) => {
    if (!window.confirm('Delete this saved graph?')) return

    try {
      await api.deleteSavedGraph(graphId)
      setSavedGraphs(savedGraphs.filter(g => g.id !== graphId))
    } catch (error) {
      console.error('Error deleting graph:', error)
      alert('Failed to delete graph: ' + (error.response?.data?.error || error.message))
    }
  }

  // Handle expand saved graph - support multiple
  const handleExpandSavedGraph = async (graph) => {
    const isExpanded = expandedGraphIds.has(graph.id)

    if (isExpanded) {
      // Close it
      const newSet = new Set(expandedGraphIds)
      newSet.delete(graph.id)
      setExpandedGraphIds(newSet)
      const newData = { ...expandedGraphsData }
      delete newData[graph.id]
      setExpandedGraphsData(newData)
      // Clean up ref
      delete chartRefs.current[graph.id]
      return
    }

    // Open it
    const newSet = new Set(expandedGraphIds)
    newSet.add(graph.id)
    setExpandedGraphIds(newSet)

    // Initialize ref for this graph
    if (!chartRefs.current[graph.id]) {
      chartRefs.current[graph.id] = React.createRef()
    }

    // Mark as loading
    const newData = { ...expandedGraphsData }
    newData[graph.id] = {
      data: null,
      flightModes: [],
      loading: true,
      xInterval: null,
      yInterval: null,
      showFlightModes: true
    }
    setExpandedGraphsData(newData)

    try {
      // Use stored data first
      if (graph.series_data && Object.keys(graph.series_data).length > 0) {
        console.log('Using stored series data from saved graph')
        newData[graph.id].data = graph.series_data
        if (graph.flight_modes && graph.flight_modes.length > 0) {
          newData[graph.id].flightModes = graph.flight_modes
        }
      } else {
        console.log('No stored data in graph')
        newData[graph.id].data = {}
      }
      newData[graph.id].loading = false
      setExpandedGraphsData(newData)
    } catch (error) {
      console.error('Error loading expanded graph:', error)
      alert('Failed to load graph: ' + (error.response?.data?.error || error.message))
      newData[graph.id].loading = false
      setExpandedGraphsData(newData)
    }
  }

  // Render saved graph
  const renderExpandedSavedGraph = (graph, data, flightModes, xInterval = null, yInterval = null, chartRef = null) => {
    if (!data) return null

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

    // Collect all raw timestamps
    const allTimestamps = new Set()
    Object.values(data).forEach(series => {
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
    const absoluteTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)
    
    // Use TimeNormalizer for ALL timestamp handling
    const normalizer = new TimeNormalizer(absoluteTimestamps, 'SavedGraphsPanel')
    
    // Get relative time labels (0-based from start)
    const labels = normalizer.toRelativeArray(absoluteTimestamps)
    
    console.log('\n========== SAVEDGRAPHSPANEL DEBUG ==========')
    console.log('=== 1. RAW DATA SAMPLE ===')
    Object.keys(data).slice(0, 3).forEach(field => {
      const series = data[field]
      if (Array.isArray(series)) {
        console.log(`Dataset: ${field}`, series.slice(0, 5))
      }
    })
    console.log('=== 2. NORMALIZATION INPUT ===')
    console.log('absoluteTimestamps (first 10):', absoluteTimestamps.slice(0, 10))
    console.log('=== 3. TIME SCALE DETECTION ===')
    console.log('Detected unit:', normalizer.unit)
    console.log('Scale factor:', normalizer.scale)
    console.log('=== 4. NORMALIZED VALUES ===')
    console.log('normalizedTimestamps (first 10):', absoluteTimestamps.map(t => normalizer.toAbsolute(t)).slice(0, 10))
    console.log('=== 5. RELATIVE TIME ===')
    console.log('minTimeAbsolute:', normalizer.absMin)
    console.log('labels (first 10):', labels.slice(0, 10))
    const range = normalizer.getRelativeRange()
    console.log('labels range:', range.min, 'to', range.max)

    const datasets = []
    let colorIdx = 0
    Object.keys(data).forEach((field) => {
      const series = data[field]
      if (Array.isArray(series)) {
        const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length]
        colorIdx += 1
        const dataMap = {}
        series.forEach(p => {
          const norm = normalizePoint(p)
          if (norm) {
            // Use normalizer to convert raw timestamp to relative time
            const relativeTime = normalizer.toRelative(norm.t)
            dataMap[relativeTime] = norm.v
          }
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
            if (norm) {
              // Use normalizer to convert raw timestamp to relative time
              const relativeTime = normalizer.toRelative(norm.t)
              dataMap[relativeTime] = norm.v
            }
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
    const maxTime = labels[labels.length - 1]
    
    // Debug: Log all dataMap keys and values
    console.log('=== 6. DATAMAP KEYS ===')
    datasets.forEach((ds, idx) => {
      if (ds.data && ds.data.length > 0) {
        const validValues = ds.data.filter(v => v !== null).length
        console.log(`Dataset ${idx} (${ds.label}): ${validValues} valid values out of ${ds.data.length}`)
      }
    })
    let xMin, xMax, yMin, yMax
    if (xInterval && maxTime) {
      const center = maxTime / 2
      xMin = Math.max(0, center - xInterval / 2)
      xMax = Math.min(maxTime, center + xInterval / 2)
    }
    if (yInterval) { yMin = -yInterval; yMax = yInterval }
    console.log('[SavedGraphs] X-axis range (relative time):', { xMin, xMax, minTime: 0, maxTime, displayMin: xMin ? xMin.toFixed(2) : 'auto', displayMax: xMax ? xMax.toFixed(2) : 'auto' })

    const annotations = {}
    if (flightModes && flightModes.length > 0) {
      console.log('=== 7. FLIGHT MODES ===')
      flightModes.forEach((fm, idx) => {
        const color = FLIGHT_MODE_COLORS[fm.mode] || 'rgba(200, 200, 200, 0.3)'
        // Use normalizer for flight modes too (CRITICAL: both data and flight modes use same scale)
        const fmStart = normalizer.toRelative(fm.start)
        const fmEnd = normalizer.toRelative(fm.end)
        console.log(`FM ${idx} (${fm.mode}):`, {
          rawStart: fm.start,
          rawEnd: fm.end,
          normalizedStart: normalizer.toAbsolute(fm.start),
          normalizedEnd: normalizer.toAbsolute(fm.end),
          relativeStart: fmStart,
          relativeEnd: fmEnd
        })
        console.log(`[SavedGraphs] Flight mode ${idx} (${fm.mode}): relative range ${fmStart.toFixed(2)}s - ${fmEnd.toFixed(2)}s`)
        annotations[`mode-${idx}`] = {
          type: 'box',
          xMin: fmStart,
          xMax: fmEnd,
          yMin: 'min',
          yMax: 'max',
          backgroundColor: color,
          borderWidth: 0,
          drawTime: 'beforeDatasetsDraw'
        }
      })
    }
    // Final sanity check
    console.log('=== 8. FINAL CHART INPUT ===')
    console.log('labels range:', Math.min(...labels), 'to', Math.max(...labels))
    console.log('datasets count:', datasets.length)
    console.log('flight modes count:', Object.keys(annotations).length)

    const allXValues = [
      ...labels,
      ...Object.keys(annotations).flatMap(key => {
        const ann = annotations[key]
        return [ann.xMin, ann.xMax].filter(v => typeof v === 'number')
      })
    ]

    console.log('=== 9. SANITY CHECK ===')
    console.log('MIN X (all values):', Math.min(...allXValues))
    console.log('MAX X (all values):', Math.max(...allXValues))

    if (Math.max(...allXValues) > 100000) {
      console.error('🚨 INVALID TIME DETECTED (>100,000s) - Mixed units detected!')
    }
    if (Math.min(...allXValues) < -1000) {
      console.error('🚨 NEGATIVE TIME DETECTED - Timeline issue!')
    }
    console.log('✅ Time pipeline validated\n\n')
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { 
          display: true,
          labels: { color: '#1a1a1a' }, 
          position: 'top' 
        },
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
              const displayTime = labels[index]
              return `Time: ${Number(displayTime).toFixed(2)}s`
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#1a1a1a',
            maxTicksLimit: 12,
            callback: function (value) {
              // Values are already in RELATIVE time (0-based from start)
              return Number(value).toFixed(2) + 's'
            }
          },
          grid: { color: 'rgba(0,0,0,0.1)' },
          min: xMin,
          max: xMax
        },
        y: {
          ticks: { color: '#1a1a1a' },
          grid: { color: 'rgba(0,0,0,0.1)' },
          min: yMin,
          max: yMax
        }
      },
      interaction: { mode: 'index', intersect: false }
    }

    return <Line data={chartData} options={chartOptions} ref={chartRef} />
  }

  const handleExportGraphAsPNG = (graph) => {
    const chartRef = chartRefs.current[graph.id]
    if (!chartRef) {
      alert('Chart reference not found. Please wait a moment and try again.')
      return
    }

    // Try different paths to access the canvas
    let canvas = null
    if (chartRef.canvas) {
      canvas = chartRef.canvas
    } else if (chartRef.current && chartRef.current.canvas) {
      canvas = chartRef.current.canvas
    } else if (chartRef.current && chartRef.current._canvas) {
      canvas = chartRef.current._canvas
    } else if (chartRef._canvas) {
      canvas = chartRef._canvas
    }

    if (!canvas) {
      console.error('Could not find canvas. Available properties:', Object.keys(chartRef))
      alert('Chart is not ready. Please wait a moment and try again.')
      return
    }

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    link.download = `${graph.name}_${timestamp}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!selectedProfile) {
    return null
  }

  return (
    <div ref={savedPanelRef} style={{
      background: '#f8f9fa',
      border: '1px solid #ddd',
      borderRadius: 6,
      padding: 16,
      color: '#1a1a1a',
      marginTop: 20
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, color: '#1a1a1a' }}>📊 Saved Graphs for "{selectedProfile.name}"</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loadingSavedGraphs && <span style={{ fontSize: 11, color: '#888' }}>Loading…</span>}
          <button
            onClick={reloadSavedGraphs}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              background: '#f0f0f0',
              color: '#1a1a1a',
              border: '1px solid #ccc',
              borderRadius: 3
            }}
            title="Reload saved graphs"
          >
            ↻ Reload
          </button>
        </div>
      </div>

      {savedGraphs.length === 0 ? (
        <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
          {loadingSavedGraphs ? 'Loading saved graphs...' : 'No saved graphs yet. Upload a file and save graphs to see them here.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {savedGraphs.map(graph => (
            <div key={graph.id}>
              <div
                onClick={() => handleExpandSavedGraph(graph)}
                style={{
                  background: expandedGraphIds.has(graph.id) ? '#e3f2fd' : '#ffffff',
                  border: expandedGraphIds.has(graph.id) ? '1px solid #0a7ea4' : '1px solid #ddd',
                  borderRadius: 4,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 12, color: '#0a7ea4' }}>
                    {expandedGraphIds.has(graph.id) ? '▼' : '▶'} {graph.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    {graph.description}
                  </div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {graph.graph_type && <span>Type: {graph.graph_type}</span>}
                    {graph.message_type && <span>Message: {graph.message_type}</span>}
                    {graph.field_name && <span>Field: {graph.field_name}</span>}
                    {graph.created_at && (
                      <span>
                        Created: {new Date(graph.created_at).toLocaleDateString()} {new Date(graph.created_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSavedGraph(graph.id)
                  }}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: '#8b4545',
                    color: '#fff',
                    border: '1px solid #a55555',
                    borderRadius: 3,
                    whiteSpace: 'nowrap'
                  }}
                >
                  🗑️ Delete
                </button>
              </div>

              {expandedGraphIds.has(graph.id) && expandedGraphsData[graph.id] && (
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #0a7ea4',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: 12,
                  marginTop: -1
                }}>
                  {expandedGraphsData[graph.id].loading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
                      Loading graph data…
                    </div>
                  ) : expandedGraphsData[graph.id].data ? (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#1a1a1a' }}>X-Axis:</label>
                          <select
                            value={expandedGraphsData[graph.id].xInterval || ''}
                            onChange={(e) => {
                              const newData = { ...expandedGraphsData }
                              newData[graph.id].xInterval = e.target.value ? Number(e.target.value) : null
                              setExpandedGraphsData(newData)
                            }}
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              background: '#ffffff',
                              color: '#1a1a1a',
                              border: '1px solid #ccc',
                              borderRadius: 3,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">All Data</option>
                            <option value="10">10 seconds</option>
                            <option value="30">30 seconds</option>
                            <option value="60">1 minute</option>
                            <option value="300">5 minutes</option>
                            <option value="600">10 minutes</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#1a1a1a' }}>Y-Axis:</label>
                          <select
                            value={expandedGraphsData[graph.id].yInterval || ''}
                            onChange={(e) => {
                              const newData = { ...expandedGraphsData }
                              newData[graph.id].yInterval = e.target.value ? Number(e.target.value) : null
                              setExpandedGraphsData(newData)
                            }}
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              background: '#ffffff',
                              color: '#1a1a1a',
                              border: '1px solid #ccc',
                              borderRadius: 3,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">Auto Scale</option>
                            <option value="10">±10</option>
                            <option value="50">±50</option>
                            <option value="100">±100</option>
                            <option value="500">±500</option>
                          </select>
                        </div>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#1a1a1a' }}>
                          <input
                            type="checkbox"
                            checked={expandedGraphsData[graph.id].showFlightModes}
                            onChange={e => {
                              const newData = { ...expandedGraphsData }
                              newData[graph.id].showFlightModes = e.target.checked
                              setExpandedGraphsData(newData)
                            }}
                          />
                          Flight Modes
                        </label>
                      </div>
                      <div style={{ height: 400, position: 'relative', marginBottom: 12 }}>
                        {renderExpandedSavedGraph(graph, expandedGraphsData[graph.id].data, expandedGraphsData[graph.id].showFlightModes ? expandedGraphsData[graph.id].flightModes : [], expandedGraphsData[graph.id].xInterval, expandedGraphsData[graph.id].yInterval, chartRefs.current[graph.id])}
                      </div>
                      <button
                        onClick={() => handleExportGraphAsPNG(graph)}
                        style={{
                          fontSize: 11,
                          padding: '4px 12px',
                          cursor: 'pointer',
                          background: '#0a7ea4',
                          color: '#fff',
                          border: '1px solid #0d99c6',
                          borderRadius: 3,
                          fontWeight: 'bold'
                        }}
                      >
                        💾 Save as PNG
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
                      No data available
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
