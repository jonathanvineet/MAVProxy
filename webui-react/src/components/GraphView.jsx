import React, { useEffect, useState, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
Chart.register(...registerables, annotationPlugin, zoomPlugin)
import api from '../api'
import GraphAIChat from './GraphAIChat'

// Flight mode colors matching desktop MAVExplorer - solid colors for regions
const FLIGHT_MODE_COLORS = {
  'UNKNOWN': 'rgba(255, 192, 203, 0.5)',      // Light pink
  'MANUAL': 'rgba(144, 238, 144, 0.5)',       // Light green
  'RTL': 'rgba(173, 216, 230, 0.5)',          // Light blue  
  'AUTO': 'rgba(176, 224, 230, 0.5)',         // Powder blue
  'GUIDED': 'rgba(221, 160, 221, 0.5)',       // Plum
  'LOITER': 'rgba(255, 255, 224, 0.5)',       // Light yellow
  'STABILIZE': 'rgba(255, 228, 196, 0.5)',    // Bisque
  'ACRO': 'rgba(255, 218, 185, 0.5)',         // Peach
  'LAND': 'rgba(255, 160, 122, 0.5)',         // Light salmon
  'CIRCLE': 'rgba(175, 238, 238, 0.5)',       // Pale turquoise
  'FBWA': 'rgba(216, 191, 216, 0.5)',         // Thistle
  'CRUISE': 'rgba(255, 250, 205, 0.5)',       // Lemon chiffon
}

// X-axis interval options (in seconds)
const X_INTERVALS = [
  { label: 'All Data', value: null },
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
]

// Y-axis interval options
const Y_INTERVALS = [
  { label: 'Auto Scale', value: null },
  { label: '±10', value: 10 },
  { label: '±50', value: 50 },
  { label: '±100', value: 100 },
  { label: '±500', value: 500 },
  { label: '±1000', value: 1000 },
]

export default function GraphView({analysis, token, selected, predefinedGraph, selectedProfile}){
  const [seriesData, setSeriesData] = useState({})
  const [loading, setLoading] = useState(false)
  const [flightModes, setFlightModes] = useState([])
  const [showFlightModes, setShowFlightModes] = useState(true)
  const [showFlightModeLegend, setShowFlightModeLegend] = useState(true)
  const [decimate, setDecimate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [xInterval, setXInterval] = useState(null)
  const [yInterval, setYInterval] = useState(null)
  const chartRef = useRef(null)
  const chartContainerRef = useRef(null)
  
  // Save graph state
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [graphDescription, setGraphDescription] = useState('')
  const [graphName, setGraphName] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  
  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false)

  // Load predefined graph
  useEffect(() => {
    let cancelled = false
    async function loadPredefined() {
      if (!token || !predefinedGraph) return
      setLoading(true)
      try {
        console.group('[PredefinedGraph] Load')
        console.log('Token present:', !!token)
        console.log('Graph name:', predefinedGraph.name)
        console.log('Decimate:', decimate)
        const res = await api.evalGraph(token, predefinedGraph.name, decimate)
        if (!cancelled) {
          const data = {}
          if (res.data.series) {
            Object.entries(res.data.series).forEach(([expr, points]) => {
              data[expr] = points
            })
          }
          console.log('Series keys:', Object.keys(data))
          const totalPoints = Object.values(data).reduce((n, arr) => n + (arr?.length || 0), 0)
          console.log('Total points:', totalPoints)
          setSeriesData(data)
        }
      } catch(e) {
        console.error('Error loading predefined graph:', e)
        alert('Failed to load predefined graph: ' + (e.response?.data?.error || e.message))
        if (!cancelled) setSeriesData({})
      } finally {
        console.groupEnd()
        if (!cancelled) setLoading(false)
      }
    }
    
    if (predefinedGraph) {
      loadPredefined()
    }
    return () => { cancelled = true }
  }, [token, predefinedGraph, decimate])

  // Load custom graph (message.field)
  useEffect(() => {
    let cancelled = false
    async function load(){
      if(predefinedGraph) return // Don't load if predefined graph is selected
      if(!token || !selected?.msg || !selected?.field) return setSeriesData({})
      setLoading(true)
      try{
        // If "All" is selected, fetch all fields
        if(selected.field === 'All'){
          const fields = analysis?.messages[selected.msg]?.fields || []
          const allData = {}
          
          // Fetch all fields in parallel
          await Promise.all(
            fields.map(async field => {
              try {
                const res = await api.getTimeseries(token, selected.msg, field)
                allData[field] = res.data.series || []
              } catch(e) {
                console.error(`Error fetching ${field}:`, e)
                allData[field] = []
              }
            })
          )
          
          if(!cancelled) setSeriesData(allData)
        } else {
          // Single field
          const res = await api.getTimeseries(token, selected.msg, selected.field)
          if(!cancelled){
            setSeriesData({ [selected.field]: res.data.series || [] })
          }
        }
      }catch(e){
        console.error(e)
        setSeriesData({})
      }finally{ if(!cancelled) setLoading(false) }
    }
    load()
    return ()=>{ cancelled = true }
  }, [token, selected, analysis, predefinedGraph])

  useEffect(() => {
    if (token) {
      api.getFlightModes(token)
        .then(res => {
          const modes = res.data.modes || []
          setFlightModes(modes)
        })
        .catch(err => console.error('Failed to load flight modes:', err))
    }
  }, [token])


  const handleExportGraphAsPNG = () => {
    try {
      if (!chartRef.current) {
        alert('Chart is not ready. Please wait for the graph to load.')
        return
      }

      // For react-chartjs-2, the ref points to the Chart.js instance
      // The canvas is accessible via chartRef.current.canvas or through the chart object
      let canvas = null
      
      if (chartRef.current.canvas) {
        canvas = chartRef.current.canvas
      } else if (chartRef.current.ctx && chartRef.current.ctx.canvas) {
        canvas = chartRef.current.ctx.canvas
      } else {
        alert('Unable to access chart canvas. Please try again.')
        return
      }
      
      const image = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      
      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const filename = predefinedGraph 
        ? `${predefinedGraph.name}_${timestamp}.png`
        : `${selected.msg}_${selected.field}_${timestamp}.png`
      
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

  // Save graph handler
  const handleSaveGraph = async () => {
    if (!selectedProfile) {
      alert('Please select a profile first')
      return
    }
    if (!graphName.trim()) {
      alert('Please enter a graph name')
      return
    }
    if (!graphDescription.trim()) {
      alert('Please enter a description')
      return
    }

    setSaveLoading(true)
    try {
      // Capture the current graph state
      const currentFields = Object.keys(seriesData)
      
      // For saving, we need to include the series_data while the file is still in memory
      // This will be sent in chunks if it's too large
      console.log('Collecting series data for save...')
      const graphData = {
        profile_id: selectedProfile.id,
        name: graphName,
        description: graphDescription,
        graph_type: predefinedGraph ? 'predefined' : 'custom',
        message_type: predefinedGraph ? predefinedGraph.name : (selected?.msg || null),
        field_name: predefinedGraph ? predefinedGraph.name : (selected?.field === 'All' ? 'All' : currentFields.join(',')), // Save all visible fields
        token: token,
        // Include the current series_data so it persists in MongoDB
        // This will be serialized and chunked by the API if needed
        series_data: seriesData,
        flight_modes: flightModes  // Store flight mode data
      }

      console.log('Saving graph with data:', graphData)
      console.log('Flight modes count:', graphData.flight_modes?.length || 0)
      console.log('Token:', graphData.token ? 'present' : 'missing')
      console.log('Message type:', graphData.message_type)
      console.log('Field name:', graphData.field_name)
      await api.saveGraph(graphData)
      alert('Graph saved successfully!')
      setShowSaveDialog(false)
      setGraphName('')
      setGraphDescription('')
    } catch (error) {
      console.error('Error saving graph:', error)
      alert('Failed to save graph: ' + (error.response?.data?.error || error.message))
    } finally {
      setSaveLoading(false)
    }
  }

  if(!analysis) return <div>No data to show</div>
  if(!selected?.msg) return <div>Select a message</div>
  if(!selected?.field) return <div>Select a field</div>

  // Define colors for multiple series
  const SERIES_COLORS = [
    'rgb(255, 0, 0)',      // red
    'rgb(0, 255, 0)',      // green
    'rgb(0, 0, 255)',      // blue
    'rgb(255, 128, 0)',    // orange
    'rgb(128, 128, 0)',    // olive
    'rgb(0, 0, 0)',        // black
    'rgb(128, 128, 128)',  // grey
    'rgb(255, 255, 0)',    // yellow
    'rgb(165, 42, 42)',    // brown
    'rgb(0, 139, 139)',    // darkcyan
    'rgb(255, 0, 255)',    // magenta
    'rgb(0, 255, 255)',    // cyan
  ]

  // Collect all unique timestamps across all series
  const allTimestamps = new Set()
  Object.values(seriesData).forEach(series => {
    series.forEach(p => allTimestamps.add(p.t))
  })
  const labels = Array.from(allTimestamps).sort((a, b) => a - b)
  
  // Calculate data range
  const minTime = labels[0]
  const maxTime = labels[labels.length - 1]
  
  // Build datasets for each field
  const datasets = Object.keys(seriesData).map((field, idx) => {
    const series = seriesData[field]
    const color = SERIES_COLORS[idx % SERIES_COLORS.length]
    
    // Create a map of timestamp to value
    const dataMap = {}
    series.forEach(p => {
      const t = p.t ?? p.x
      const v = p.v ?? p.y
      if (t !== undefined && v !== undefined) {
        dataMap[Number(t)] = Number(v)
      }
    })
    
    // Map labels to values (null if not present)
    const values = labels.map(t => dataMap[t] !== undefined ? dataMap[t] : null)
     
    // For predefined graphs, use the field name directly (e.g., "ATT.Roll")
    // For custom graphs, use message.field format
    const label = predefinedGraph ? field : `${selected.msg}.${field}`
     
    console.log(`[Render] Dataset ${label}:`, { points: values.filter(v => v !== null).length, total: values.length })
    
    return {
      label: label,
      data: values,
      borderColor: color,
      backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
      borderWidth: 2,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true
    }
  })
  
  // Build flight mode annotations as background regions
  const annotations = {}
  if (showFlightModes && flightModes.length > 0) {
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
  
  const data = { 
    labels, 
    datasets
  }

  // Calculate zoom limits based on intervals
  let xMin = undefined
  let xMax = undefined
  if (xInterval && minTime && maxTime) {
    const center = (minTime + maxTime) / 2
    xMin = Math.max(minTime, center - xInterval / 2)
    xMax = Math.min(maxTime, center + xInterval / 2)
  }

  let yMin = undefined
  let yMax = undefined
  if (yInterval) {
    yMin = -yInterval
    yMax = yInterval
  }

  // Create options function for chart styling
  const getChartOptions = (isFullscreen = false) => {
    const textColor = '#fff'
    const gridColor = 'rgba(255, 255, 255, 0.15)'
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      scales: {
        x: {
          type: 'linear',
          title: { 
            display: true, 
            text: 'Time (s)',
            font: { size: 12 },
            color: textColor
          },
          min: xMin,
          max: xMax,
          grid: {
            display: true,
            color: gridColor
          },
          ticks: {
            font: { size: 11 },
            color: textColor,
            maxTicksLimit: 12,
            callback: function(value) {
              const date = new Date(value * 1000)
              return date.toTimeString().split(' ')[0]
            }
          }
        },
        y: {
          title: { 
            display: true, 
            text: 'Value',
            font: { size: 12 },
            color: textColor
          },
          min: yMin,
          max: yMax,
          grid: {
            display: true,
            color: gridColor
          },
          ticks: {
            font: { size: 11 },
            color: textColor
          }
        }
      },
      plugins: {
        legend: { 
          display: true,
          position: 'top',
          align: 'start',
          labels: {
            boxWidth: 40,
            boxHeight: 10,
            padding: 10,
            font: { size: 11 },
            usePointStyle: false,
            color: textColor
          },
          onClick: function(e, legendItem, legend) {
            const index = legendItem.datasetIndex
            const chart = legend.chart
            const meta = chart.getDatasetMeta(index)
            
            // Toggle visibility
            meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null
            chart.update()
          }
        },
        annotation: {
          annotations
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy',
            modifierKey: 'shift'
          },
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1
            },
            pinch: {
              enabled: true
            },
            mode: 'xy'
          },
          limits: {
            x: { min: 'original', max: 'original' },
            y: { min: 'original', max: 'original' }
          }
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex
              const time = labels[index]
              const date = new Date(time * 1000)
              return date.toLocaleTimeString()
            },
            label: function(context) {
              const label = context.dataset.label || ''
              const value = context.parsed.y
              return `${label}: ${value.toFixed(2)}`
            }
          }
        }
      }
    }
  }

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
    // Also reset intervals to show all data
    setXInterval(null)
    setYInterval(null)
  }

  // Flight Mode Legend Component
  const FlightModeLegend = ({ isFullscreen = false }) => {
    if (!showFlightModes || !showFlightModeLegend || flightModes.length === 0) return null
    
    // Get unique flight modes
    const uniqueModes = [...new Set(flightModes.map(fm => fm.mode))]
    
    return (
      <div style={{
        background: '#1a1a1a',
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 12,
        border: '2px solid #4CAF50'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: 12,
          fontSize: 11,
          color: '#fff'
        }}>
          <strong style={{ marginRight: 4, fontSize: 12, color: '#4CAF50' }}>Flight Modes:</strong>
          {uniqueModes.map(mode => {
            const color = FLIGHT_MODE_COLORS[mode] || 'rgba(200, 200, 200, 0.3)'
            // Convert rgba to solid color for legend
            let solidColor = color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/, 'rgb($1, $2, $3)')
            // Replace black color with light gray for visibility
            if (solidColor === 'rgb(0, 0, 0)') {
              solidColor = 'rgb(200, 200, 200)'
            }
            
            return (
              <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20,
                  height: 12,
                  backgroundColor: solidColor,
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: 2
                }} />
                <span style={{ color: '#fff', fontWeight: 500 }}>{mode}</span>
              </div>
            )
          })}
          <button
            onClick={() => setShowFlightModeLegend(false)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              fontSize: 16,
              padding: 0,
              lineHeight: 1
            }}
            title="Hide legend"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Render expanded saved graph

  const renderChart = (isFullscreen = false) => (
    <div 
      ref={chartContainerRef}
      style={{ 
        flex: 1, 
        minHeight: isFullscreen ? '90vh' : 500,
        cursor: isFullscreen ? 'default' : 'pointer',
        position: 'relative',
        background: isFullscreen ? 'rgba(0,0,0,0.95)' : '#000',
        borderRadius: '4px'
      }}
      onClick={() => !isFullscreen && setFullscreen(true)}
    >
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>
      ) : (
        <>
          <Line ref={chartRef} data={data} options={getChartOptions(isFullscreen)} />
          {!isFullscreen && (
            <div style={{ 
              position: 'absolute', 
              bottom: 8, 
              right: 8, 
              background: 'rgba(0,0,0,0.7)', 
              padding: '4px 8px', 
              borderRadius: 4,
              fontSize: 11,
              color: '#888',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              Click to expand fullscreen
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', padding: '12px', borderRadius: '4px' }}>
        {/* Graph Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, paddingTop: 6, color: '#fff' }}>
            {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
          </h4>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* X-Axis Interval Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>X-Axis:</label>
              <select
                value={xInterval || ''}
                onChange={(e) => setXInterval(e.target.value ? Number(e.target.value) : null)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: '#2a2a2a',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: 3
                }}
              >
                {X_INTERVALS.map(option => (
                  <option key={option.label} value={option.value || ''}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Y-Axis Interval Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Y-Axis:</label>
              <select
                value={yInterval || ''}
                onChange={(e) => setYInterval(e.target.value ? Number(e.target.value) : null)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: '#2a2a2a',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: 3
                }}
              >
                {Y_INTERVALS.map(option => (
                  <option key={option.label} value={option.value || ''}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleResetZoom}
              style={{ 
                fontSize: 11, 
                padding: '4px 8px',
                cursor: 'pointer',
                background: '#444',
                color: '#fff',
                border: '1px solid #666',
                borderRadius: 3
              }}
            >
              Reset View
            </button>
            
            {/* AI Chat Button */}
            <button 
              onClick={() => setShowAIChat(!showAIChat)}
              style={{ 
                fontSize: 11, 
                padding: '4px 8px',
                cursor: 'pointer',
                background: showAIChat ? '#4CAF50' : '#0a7ea4',
                color: '#fff',
                border: showAIChat ? '1px solid #66BB6A' : '1px solid #0d99c6',
                borderRadius: 3,
                fontWeight: 'bold'
              }}
              title="Ask AI about this graph"
            >
              🤖 {showAIChat ? 'Close AI' : 'Ask AI'}
            </button>
            
            {/* Save Graph Button */}
            {selectedProfile && (
              <>
                <button 
                  onClick={() => setShowSaveDialog(true)}
                  style={{ 
                    fontSize: 11, 
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: '#0a7ea4',
                    color: '#fff',
                    border: '1px solid #0d99c6',
                    borderRadius: 3,
                    fontWeight: 'bold'
                  }}
                >
                  💾 Save Graph
                </button>
                
                <button 
                  onClick={handleExportGraphAsPNG}
                  style={{ 
                    fontSize: 11, 
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: '#0a7ea4',
                    color: '#fff',
                    border: '1px solid #0d99c6',
                    borderRadius: 3,
                    fontWeight: 'bold'
                  }}
                >
                  🖼️ Export PNG
                </button>
              </>
            )}
            
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#fff' }}>
              <input 
                type="checkbox" 
                checked={showFlightModes} 
                onChange={e => {
                  setShowFlightModes(e.target.checked)
                  if (e.target.checked) setShowFlightModeLegend(true)
                }}
              />
              Flight Modes
            </label>
          </div>
        </div>
        
        {/* Flight Mode Legend */}
        <FlightModeLegend isFullscreen={false} />
        
        {renderChart(false)}
        <div style={{ fontSize: 11, color: '#999', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
          💡 Scroll to zoom • Shift+drag to pan • Click legend to hide/show lines • Hover for details
        </div>

        {showSaveDialog && (
          <div style={{
            marginTop: 12,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 6,
            padding: 12,
            color: '#fff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h5 style={{ margin: 0 }}>Save Graph</h5>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  fontSize: 12,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: 4
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#ddd' }}>Graph Name</label>
                <input
                  value={graphName}
                  onChange={(e) => setGraphName(e.target.value)}
                  placeholder={predefinedGraph ? predefinedGraph.name : `${selected?.msg}.${selected?.field}`}
                  style={{
                    background: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 4,
                    padding: '6px 8px'
                  }}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#ddd' }}>Description</label>
                <textarea
                  value={graphDescription}
                  onChange={(e) => setGraphDescription(e.target.value)}
                  rows={3}
                  placeholder="Add a description for this graph"
                  style={{
                    background: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 4,
                    padding: '6px 8px',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  disabled={saveLoading}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 4
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGraph}
                  disabled={saveLoading || !selectedProfile}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: '#0a7ea4',
                    color: '#fff',
                    border: '1px solid #0d99c6',
                    borderRadius: 4,
                    fontWeight: 'bold'
                  }}
                >
                  {saveLoading ? 'Saving…' : 'Save Graph'}
                </button>
              </div>
            </div>
          </div>
        )}



      {/* Fullscreen overlay */}
      {fullscreen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: 20
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullscreen(false)
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, color: 'white', gap: 12 }}>
            <h3 style={{ margin: 0, paddingTop: 6 }}>
              {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
            </h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* X-Axis Interval Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: '600', color: 'white' }}>X-Axis:</label>
                <select
                  value={xInterval || ''}
                  onChange={(e) => setXInterval(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 3
                  }}
                >
                  {X_INTERVALS.map(option => (
                    <option key={option.label} value={option.value || ''}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Y-Axis Interval Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: '600', color: 'white' }}>Y-Axis:</label>
                <select
                  value={yInterval || ''}
                  onChange={(e) => setYInterval(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: 3
                  }}
                >
                  {Y_INTERVALS.map(option => (
                    <option key={option.label} value={option.value || ''}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleResetZoom}
                style={{ 
                  fontSize: 11, 
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: '#444',
                  color: 'white',
                  border: '1px solid #666',
                  borderRadius: 3
                }}
              >
                Reset View
              </button>
              
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'white' }}>
                <input 
                  type="checkbox" 
                  checked={showFlightModes} 
                  onChange={e => {
                    setShowFlightModes(e.target.checked)
                    if (e.target.checked) setShowFlightModeLegend(true)
                  }}
                />
                Flight Modes
              </label>
              
              <button 
                onClick={() => setFullscreen(false)}
                style={{ 
                  fontSize: 14, 
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: '#333',
                  color: 'white',
                  border: '1px solid #555',
                  borderRadius: 4,
                  marginLeft: 8
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>
          
          {/* Flight Mode Legend in Fullscreen */}
          <FlightModeLegend isFullscreen={true} />
          
          {renderChart(true)}
          <div style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
            💡 Scroll to zoom • Shift+drag to pan • Click legend to hide/show lines • Hover for details
          </div>
        </div>
      )}
      </div>

      {/* Save Graph Dialog */}
      {showSaveDialog && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSaveDialog(false)
          }}
        >
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 8,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            color: '#fff'
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>💾 Save Graph to Profile</h3>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>
                Profile: <strong style={{ color: '#0a7ea4' }}>{selectedProfile?.name}</strong>
              </div>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold' }}>
                Graph Name *
              </label>
              <input 
                type="text"
                value={graphName}
                onChange={(e) => setGraphName(e.target.value)}
                placeholder="e.g., Altitude vs Time"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 13
                }}
              />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold' }}>
                Description *
              </label>
              <textarea 
                value={graphDescription}
                onChange={(e) => setGraphDescription(e.target.value)}
                placeholder="Describe this graph... (e.g., Shows altitude changes during mission, note the drop at 3:45)"
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 13,
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowSaveDialog(false)}
                disabled={saveLoading}
                style={{
                  padding: '8px 16px',
                  background: '#333',
                  border: '1px solid #555',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: saveLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveGraph}
                disabled={saveLoading || !graphName.trim() || !graphDescription.trim()}
                style={{
                  padding: '8px 16px',
                  background: saveLoading || !graphName.trim() || !graphDescription.trim() ? '#555' : '#0a7ea4',
                  border: '1px solid #0d99c6',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: saveLoading || !graphName.trim() || !graphDescription.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 'bold'
                }}
              >
                {saveLoading ? 'Saving...' : '💾 Save Graph'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* AI Chat Panel */}
      <GraphAIChat 
        seriesData={seriesData}
        flightModes={flightModes}
        graphName={predefinedGraph ? predefinedGraph.name : `${selected.msg}.${selected.field}`}
        analysis={analysis}
        isVisible={showAIChat}
        onClose={() => setShowAIChat(false)}
        chartRef={chartContainerRef}
      />
    </>
  )
}
