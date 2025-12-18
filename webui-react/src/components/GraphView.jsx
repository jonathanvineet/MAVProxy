import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
Chart.register(...registerables, annotationPlugin, zoomPlugin)
import api from '../api'

// Flight mode colors matching desktop MAVExplorer - solid colors for regions
const FLIGHT_MODE_COLORS = {
  'UNKNOWN': 'rgba(255, 192, 203, 0.3)',      // Light pink
  'MANUAL': 'rgba(144, 238, 144, 0.3)',       // Light green
  'RTL': 'rgba(173, 216, 230, 0.3)',          // Light blue  
  'AUTO': 'rgba(176, 224, 230, 0.3)',         // Powder blue
  'GUIDED': 'rgba(221, 160, 221, 0.3)',       // Plum
  'LOITER': 'rgba(255, 255, 224, 0.3)',       // Light yellow
  'STABILIZE': 'rgba(255, 228, 196, 0.3)',    // Bisque
  'ACRO': 'rgba(255, 218, 185, 0.3)',         // Peach
  'LAND': 'rgba(255, 160, 122, 0.3)',         // Light salmon
  'CIRCLE': 'rgba(175, 238, 238, 0.3)',       // Pale turquoise
  'FBWA': 'rgba(216, 191, 216, 0.3)',         // Thistle
  'CRUISE': 'rgba(255, 250, 205, 0.3)',       // Lemon chiffon
}

// X-axis interval options (in seconds)
const X_INTERVALS = [
  { label: 'All Data', value: null },
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '30 minutes', value: 1800 },
]

// Y-axis interval options (auto or specific ranges)
const Y_INTERVALS = [
  { label: 'Auto Range', value: null },
  { label: '±10', value: { min: -10, max: 10 } },
  { label: '±50', value: { min: -50, max: 50 } },
  { label: '±100', value: { min: -100, max: 100 } },
  { label: '±180', value: { min: -180, max: 180 } },
  { label: '0 to 100', value: { min: 0, max: 100 } },
  { label: '0 to 1000', value: { min: 0, max: 1000 } },
  { label: '0 to 5000', value: { min: 0, max: 5000 } },
]

export default function GraphView({analysis, token, selected, predefinedGraph}){
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

  // Load predefined graph
  useEffect(() => {
    let cancelled = false
    async function loadPredefined() {
      if (!token || !predefinedGraph) return
      setLoading(true)
      try {
        const res = await api.evalGraph(token, predefinedGraph.name, decimate)
        if (!cancelled) {
          const data = {}
          if (res.data.series) {
            Object.entries(res.data.series).forEach(([expr, points]) => {
              data[expr] = points
            })
          }
          setSeriesData(data)
        }
      } catch(e) {
        console.error('Error loading predefined graph:', e)
        if (!cancelled) setSeriesData({})
      } finally {
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
  
  // Build datasets for each field
  const datasets = Object.keys(seriesData).map((field, idx) => {
    const series = seriesData[field]
    const color = SERIES_COLORS[idx % SERIES_COLORS.length]
    
    // Create a map of timestamp to value
    const dataMap = {}
    series.forEach(p => {
      dataMap[p.t] = p.v
    })
    
    // Map labels to values (null if not present)
    const values = labels.map(t => dataMap[t] !== undefined ? dataMap[t] : null)
    
    // For predefined graphs, use the field name directly (e.g., "ATT.Roll")
    // For custom graphs, use message.field format
    const label = predefinedGraph ? field : `${selected.msg}.${field}`
    
    return {
      label: label,
      data: values,
      borderColor: color,
      backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
      borderWidth: 2,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true // Connect points even if there are nulls
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
  
  // Calculate filtered data based on x-axis interval
  const filteredData = useMemo(() => {
    if (!xInterval || labels.length === 0) return { labels, datasets }
    
    // Get the last timestamp and calculate the start of the interval
    const maxTime = Math.max(...labels)
    const minTime = maxTime - xInterval
    
    // Filter labels and datasets
    const filteredLabels = labels.filter(t => t >= minTime)
    const startIdx = labels.indexOf(filteredLabels[0])
    
    const filteredDatasets = datasets.map(ds => ({
      ...ds,
      data: ds.data.slice(startIdx)
    }))
    
    return { labels: filteredLabels, datasets: filteredDatasets }
  }, [labels, datasets, xInterval])

  const data = { 
    labels: filteredData.labels, 
    datasets: filteredData.datasets
  }

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300
    },
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
          font: { size: 12, weight: 'bold' },
          color: '#333'
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          font: { size: 11 },
          color: '#333',
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
          font: { size: 12, weight: 'bold' },
          color: '#333'
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          font: { size: 11 },
          color: '#333'
        },
        min: yInterval?.min,
        max: yInterval?.max
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
          color: '#000'
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
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#000',
        bodyColor: '#000',
        borderColor: '#333',
        borderWidth: 2,
        padding: 12,
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        bodySpacing: 6,
        callbacks: {
          title: function(context) {
            const index = context[0].dataIndex
            const time = filteredData.labels[index]
            const date = new Date(time * 1000)
            
            // Find current flight mode at this time
            let currentMode = null
            if (showFlightModes && flightModes.length > 0) {
              for (const fm of flightModes) {
                if (time >= fm.start && time <= fm.end) {
                  currentMode = fm.mode
                  break
                }
              }
            }
            
            const timeStr = date.toLocaleTimeString()
            return currentMode ? `${timeStr} - Mode: ${currentMode}` : timeStr
          },
          label: function(context) {
            const label = context.dataset.label || ''
            const value = context.parsed.y
            return ` ${label}: ${value !== null ? value.toFixed(3) : 'N/A'}`
          },
          labelTextColor: function(context) {
            return context.dataset.borderColor
          }
        }
      }
    }
  }), [annotations, filteredData.labels, showFlightModes, flightModes, yInterval])

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }, [])
  
  // Get unique flight modes that appear in the data
  const uniqueFlightModes = useMemo(() => {
    const modes = new Set()
    flightModes.forEach(fm => modes.add(fm.mode))
    return Array.from(modes).sort()
  }, [flightModes])
  
  // Flight Mode Legend Component
  const FlightModeLegend = () => {
    if (!showFlightModeLegend || uniqueFlightModes.length === 0) return null
    
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 11,
        marginTop: 8,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 16px',
        alignItems: 'center'
      }}>
        <strong style={{ fontSize: 12, marginRight: 4 }}>Flight Modes:</strong>
        {uniqueFlightModes.map(mode => (
          <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20,
              height: 14,
              background: FLIGHT_MODE_COLORS[mode] || 'rgba(200, 200, 200, 0.3)',
              border: '1px solid #999',
              borderRadius: 2
            }} />
            <span style={{ fontWeight: '500' }}>{mode}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderChart = (isFullscreen = false) => (
    <div 
      style={{ 
        flex: 1, 
        minHeight: isFullscreen ? '90vh' : 500,
        cursor: isFullscreen ? 'default' : 'pointer',
        position: 'relative'
      }}
      onClick={() => !isFullscreen && setFullscreen(true)}
    >
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>
      ) : (
        <>
          <Line ref={chartRef} data={data} options={options} />
          {!isFullscreen && (
            <div style={{ 
              position: 'absolute', 
              bottom: 8, 
              right: 8, 
              background: 'rgba(255,255,255,0.9)', 
              padding: '4px 8px', 
              borderRadius: 4,
              fontSize: 11,
              color: '#666'
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
          <h4 style={{ margin: 0, paddingTop: 6 }}>
            {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
          </h4>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* X-Axis Interval Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: '600', color: '#333' }}>X-Axis:</label>
              <select
                value={xInterval || ''}
                onChange={(e) => setXInterval(e.target.value ? Number(e.target.value) : null)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid #ccc',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                {X_INTERVALS.map(opt => (
                  <option key={opt.label} value={opt.value || ''}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {/* Y-Axis Interval Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: '600', color: '#333' }}>Y-Axis:</label>
              <select
                value={yInterval ? JSON.stringify(yInterval) : ''}
                onChange={(e) => setYInterval(e.target.value ? JSON.parse(e.target.value) : null)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid #ccc',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                {Y_INTERVALS.map(opt => (
                  <option key={opt.label} value={opt.value ? JSON.stringify(opt.value) : ''}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            <button 
              onClick={handleResetZoom}
              style={{ 
                fontSize: 11, 
                padding: '4px 8px',
                cursor: 'pointer',
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: 3,
                fontWeight: '500'
              }}
            >
              Reset Zoom
            </button>
            
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input 
                type="checkbox" 
                checked={showFlightModes} 
                onChange={e => setShowFlightModes(e.target.checked)}
              />
              Flight Modes
            </label>
            
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input 
                type="checkbox" 
                checked={showFlightModeLegend} 
                onChange={e => setShowFlightModeLegend(e.target.checked)}
              />
              Legend
            </label>
          </div>
        </div>
        
        {/* Flight Mode Legend */}
        <FlightModeLegend />
        
        {renderChart(false)}
        <div style={{ fontSize: 11, color: '#666', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
          💡 Scroll to zoom • Shift+drag to pan • Click legend to hide/show lines • Hover for details
        </div>
      </div>

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
                    border: '1px solid #555',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: '#333',
                    color: 'white'
                  }}
                >
                  {X_INTERVALS.map(opt => (
                    <option key={opt.label} value={opt.value || ''}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Y-Axis Interval Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: '600', color: 'white' }}>Y-Axis:</label>
                <select
                  value={yInterval ? JSON.stringify(yInterval) : ''}
                  onChange={(e) => setYInterval(e.target.value ? JSON.parse(e.target.value) : null)}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    border: '1px solid #555',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: '#333',
                    color: 'white'
                  }}
                >
                  {Y_INTERVALS.map(opt => (
                    <option key={opt.label} value={opt.value ? JSON.stringify(opt.value) : ''}>{opt.label}</option>
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
                  border: '1px solid #555',
                  borderRadius: 3,
                  fontWeight: '500'
                }}
              >
                Reset Zoom
              </button>
              
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'white' }}>
                <input 
                  type="checkbox" 
                  checked={showFlightModes} 
                  onChange={e => setShowFlightModes(e.target.checked)}
                />
                Flight Modes
              </label>
              
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'white' }}>
                <input 
                  type="checkbox" 
                  checked={showFlightModeLegend} 
                  onChange={e => setShowFlightModeLegend(e.target.checked)}
                />
                Legend
              </label>
              
              <button 
                onClick={() => setFullscreen(false)}
                style={{ 
                  fontSize: 14, 
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: '#c33',
                  color: 'white',
                  border: '1px solid #a22',
                  borderRadius: 4,
                  fontWeight: '600',
                  marginLeft: 8
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>
          
          {/* Flight Mode Legend in fullscreen */}
          {showFlightModeLegend && uniqueFlightModes.length > 0 && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: 11,
              marginBottom: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 16px',
              alignItems: 'center'
            }}>
              <strong style={{ fontSize: 12, marginRight: 4 }}>Flight Modes:</strong>
              {uniqueFlightModes.map(mode => (
                <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 20,
                    height: 14,
                    background: FLIGHT_MODE_COLORS[mode] || 'rgba(200, 200, 200, 0.3)',
                    border: '1px solid #999',
                    borderRadius: 2
                  }} />
                  <span style={{ fontWeight: '500' }}>{mode}</span>
                </div>
              ))}
            </div>
          )}
          
          {renderChart(true)}
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, textAlign: 'center', fontStyle: 'italic' }}>
            💡 Scroll to zoom • Shift+drag to pan • Click legend to hide/show lines • Hover for details
          </div>
        </div>
      )}
    </>
  )
}
