import React, { useEffect, useState, useRef } from 'react'
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

export default function GraphView({analysis, token, selected, predefinedGraph}){
  const [seriesData, setSeriesData] = useState({})
  const [loading, setLoading] = useState(false)
  const [flightModes, setFlightModes] = useState([])
  const [showFlightModes, setShowFlightModes] = useState(true)
  const [decimate, setDecimate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
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
  
  const data = { 
    labels, 
    datasets
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
          font: { size: 12 }
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          font: { size: 11 },
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
          font: { size: 12 }
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          font: { size: 11 }
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
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

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>
            {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
          </h4>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button 
              onClick={handleResetZoom}
              style={{ 
                fontSize: 11, 
                padding: '4px 8px',
                cursor: 'pointer',
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: 3
              }}
            >
              Reset Zoom
            </button>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input 
                type="checkbox" 
                checked={showFlightModes} 
                onChange={e => setShowFlightModes(e.target.checked)}
              />
              Show Flight Modes
            </label>
          </div>
        </div>
        {renderChart(false)}
        <div style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' }}>
          Scroll to zoom • Shift+drag to pan • Click legend to hide/show lines
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, color: 'white' }}>
            <h3 style={{ margin: 0 }}>
              {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
            </h3>
            <button 
              onClick={() => setFullscreen(false)}
              style={{ 
                fontSize: 16, 
                padding: '8px 16px',
                cursor: 'pointer',
                background: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: 4
              }}
            >
              ✕ Close
            </button>
          </div>
          {renderChart(true)}
        </div>
      )}
    </>
  )
}
