import React, { useEffect, useState, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import api from '../api'

export default function SavedGraphsPanel({ selectedProfile }) {
  const [savedGraphs, setSavedGraphs] = useState([])
  const [loadingSavedGraphs, setLoadingSavedGraphs] = useState(false)
  const [expandedGraphIds, setExpandedGraphIds] = useState(new Set())
  const [expandedGraphsData, setExpandedGraphsData] = useState({}) // Map of graphId -> { data, flightModes, loading, xInterval, yInterval, showFlightModes }
  const savedPanelRef = useRef(null)

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
      return
    }

    // Open it
    const newSet = new Set(expandedGraphIds)
    newSet.add(graph.id)
    setExpandedGraphIds(newSet)
    
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
  const renderExpandedSavedGraph = (graph, data, flightModes, xInterval = null, yInterval = null) => {
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
    const labels = Array.from(allTimestamps).sort((a, b) => a - b)

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
    const minTime = labels[0]
    const maxTime = labels[labels.length - 1]
    let xMin, xMax, yMin, yMax
    if (xInterval && minTime && maxTime) {
      const center = (minTime + maxTime) / 2
      xMin = Math.max(minTime, center - xInterval / 2)
      xMax = Math.min(maxTime, center + xInterval / 2)
    }
    if (yInterval) { yMin = -yInterval; yMax = yInterval }

    const annotations = {}
    if (flightModes && flightModes.length > 0) {
      flightModes.forEach((fm, idx) => {
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
        legend: { labels: { color: '#fff' }, position: 'top' },
        annotation: { annotations },
        tooltip: {
          callbacks: {
            filter: function(tooltipItem) {
              return tooltipItem.parsed && tooltipItem.parsed.y !== null && tooltipItem.parsed.y !== undefined
            }
          }
        }
      },
      scales: {
        x: { 
          type: 'linear',
          ticks: { 
            color: '#888',
            maxTicksLimit: 12,
            callback: function(value) {
              const date = new Date(value * 1000)
              return date.toTimeString().split(' ')[0]
            }
          }, 
          grid: { color: 'rgba(255,255,255,0.1)' }, 
          min: xMin, 
          max: xMax 
        },
        y: { 
          ticks: { color: '#888' }, 
          grid: { color: 'rgba(255,255,255,0.1)' }, 
          min: yMin, 
          max: yMax 
        }
      },
      interaction: { mode: 'index', intersect: false }
    }

    return <Line data={chartData} options={chartOptions} />
  }

  if (!selectedProfile) {
    return null
  }

  return (
    <div ref={savedPanelRef} style={{
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: 6,
      padding: 16,
      color: '#fff',
      marginTop: 20
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, color: '#fff' }}>📊 Saved Graphs for "{selectedProfile.name}"</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loadingSavedGraphs && <span style={{ fontSize: 11, color: '#888' }}>Loading…</span>}
          <button
            onClick={reloadSavedGraphs}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              background: '#444',
              color: '#fff',
              border: '1px solid #666',
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
                  background: expandedGraphIds.has(graph.id) ? '#1a3a3a' : '#2a2a2a',
                  border: expandedGraphIds.has(graph.id) ? '1px solid #0a7ea4' : '1px solid #444',
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
                  <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>
                    {graph.description}
                  </div>
                  <div style={{ fontSize: 10, color: '#666', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
                  background: '#1a1a1a',
                  border: '1px solid #0a7ea4',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: 12,
                  marginTop: -1
                }}>
                  {expandedGraphsData[graph.id].loading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
                      Loading graph data…
                    </div>
                  ) : expandedGraphsData[graph.id].data ? (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#fff' }}>X-Axis:</label>
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
                              background: '#2a2a2a',
                              color: '#fff',
                              border: '1px solid #555',
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
                          <label style={{ fontSize: 12, color: '#fff' }}>Y-Axis:</label>
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
                              background: '#2a2a2a',
                              color: '#fff',
                              border: '1px solid #555',
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
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#fff' }}>
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
                      <div style={{ height: 400, position: 'relative' }}>
                        {renderExpandedSavedGraph(graph, expandedGraphsData[graph.id].data, expandedGraphsData[graph.id].showFlightModes ? expandedGraphsData[graph.id].flightModes : [], expandedGraphsData[graph.id].xInterval, expandedGraphsData[graph.id].yInterval)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
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
