import React, { useEffect, useState, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
Chart.register(...registerables, annotationPlugin, zoomPlugin)
import api from '../api'

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
  
  // Save graph state
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [graphDescription, setGraphDescription] = useState('')
  const [graphName, setGraphName] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  
  // Saved graphs state
  const [savedGraphs, setSavedGraphs] = useState([])
  const [loadingSavedGraphs, setLoadingSavedGraphs] = useState(false)
  const [expandedGraphId, setExpandedGraphId] = useState(null)
  const [expandedGraphData, setExpandedGraphData] = useState(null)
  const [expandedGraphFlightModes, setExpandedGraphFlightModes] = useState([])
  const [expandedGraphLoading, setExpandedGraphLoading] = useState(false)
  const [expandedGraphDecimate, setExpandedGraphDecimate] = useState(1)
  const [expandedGraphXInterval, setExpandedGraphXInterval] = useState(null)
  const [expandedGraphYInterval, setExpandedGraphYInterval] = useState(null)
  const [expandedGraphShowFlightModes, setExpandedGraphShowFlightModes] = useState(true)

  // Reload saved graphs function
  const reloadSavedGraphs = () => {
    if (!selectedProfile) return
    
    setLoadingSavedGraphs(true)
    api.getSavedGraphs(selectedProfile.id)
      .then(res => {
        setSavedGraphs(res.data.graphs || [])
      })
      .catch(err => {
        console.error('Error loading saved graphs:', err)
      })
      .finally(() => setLoadingSavedGraphs(false))
  }

  // Load saved graphs for selected profile
  useEffect(() => {
    if (!selectedProfile) {
      setSavedGraphs([])
      return
    }
    
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

  // Handle expand saved graph
  const handleExpandSavedGraph = async (graph) => {
    if (expandedGraphId === graph.id) {
      setExpandedGraphId(null)
      return
    }

    setExpandedGraphId(graph.id)
    setExpandedGraphLoading(true)
    setExpandedGraphData(null)
    setExpandedGraphFlightModes([])
    setExpandedGraphDecimate(1)
    setExpandedGraphXInterval(null)
    setExpandedGraphYInterval(null)
    setExpandedGraphShowFlightModes(true)

    try {
      // Try to use stored data first (series_data and flight_modes)
      if (graph.series_data && Object.keys(graph.series_data).length > 0) {
        console.log('Using stored series data from saved graph')
        console.log('Graph flight_modes:', graph.flight_modes)
        setExpandedGraphData(graph.series_data)
        if (graph.flight_modes && graph.flight_modes.length > 0) {
          console.log('Setting expanded flight modes:', graph.flight_modes)
          setExpandedGraphFlightModes(graph.flight_modes)
        } else {
          console.log('No flight modes found in stored graph data')
        }
      } else if (graph.token && graph.message_type && graph.field_name) {
        // Fallback: fetch data if not stored
        console.log('Fetching series data for saved graph')
        const fields = graph.field_name === 'All' 
          ? (await api.listMessages(graph.token)).data.messages?.[graph.message_type] || []
          : graph.field_name.split(',')
        
        const allData = {}
        await Promise.all(
          fields.map(async field => {
            try {
              const res = await api.getTimeseries(graph.token, graph.message_type, field)
              allData[field] = res.data.series || []
            } catch(e) {
              console.error(`Error fetching ${field}:`, e)
            }
          })
        )
        setExpandedGraphData(allData)
        
        // Fetch flight modes
        const modesRes = await api.getFlightModes(graph.token)
        setExpandedGraphFlightModes(modesRes.data.modes || [])
      }
    } catch (error) {
      console.error('Error loading expanded graph:', error)
      alert('Failed to load graph: ' + (error.response?.data?.error || error.message))
    } finally {
      setExpandedGraphLoading(false)
    }
  }

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
      const graphData = {
        profile_id: selectedProfile.id,
        name: graphName,
        description: graphDescription,
        graph_type: predefinedGraph ? 'predefined' : 'custom',
        message_type: predefinedGraph ? predefinedGraph.name : (selected?.msg || null),
        field_name: predefinedGraph ? predefinedGraph.name : (selected?.field === 'All' ? 'All' : currentFields.join(',')), // Save all visible fields
        token: token,
        // Store additional metadata for reconstruction
        series_data: seriesData,  // Store actual data points
        flight_modes: flightModes  // Store flight mode data
      }

      console.log('Saving graph with data:', graphData)
      await api.saveGraph(graphData)
      alert('Graph saved successfully!')
      setShowSaveDialog(false)
      setGraphName('')
      setGraphDescription('')
      // Auto-reload saved graphs
      reloadSavedGraphs()
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
  const renderExpandedSavedGraph = (graph, data, flightModes, xInt, yInt) => {
    if (!data) return null

    console.log('renderExpandedSavedGraph called with:')
    console.log('  - data keys:', Object.keys(data))
    console.log('  - flightModes:', flightModes)
    console.log('  - flightModes length:', flightModes?.length)

    const SERIES_COLORS = [
      'rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)', 'rgb(255, 128, 0)',
      'rgb(128, 128, 0)', 'rgb(0, 0, 0)', 'rgb(128, 128, 128)', 'rgb(255, 255, 0)'
    ]
    
    // Use the same complete flight mode colors as the main graph
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

    const allTimestamps = new Set()
    Object.values(data).forEach(series => {
      if (Array.isArray(series)) series.forEach(p => { if (p && p.t) allTimestamps.add(p.t) })
    })
    const labels = Array.from(allTimestamps).sort((a, b) => a - b)

    const datasets = Object.keys(data).map((field, idx) => {
      const series = data[field]
      if (!Array.isArray(series)) return null
      const color = SERIES_COLORS[idx % SERIES_COLORS.length]
      const dataMap = {}
      series.forEach(p => { if (p && p.t !== undefined && p.v !== undefined) dataMap[p.t] = p.v })
      const values = labels.map(t => dataMap[t] !== undefined ? dataMap[t] : null)
      
      return {
        label: field,
        data: values,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true
      }
    }).filter(d => d !== null)

    const chartData = { labels, datasets }
    const minTime = labels[0]
    const maxTime = labels[labels.length - 1]
    let xMin, xMax, yMin, yMax
    if (xInt && minTime && maxTime) {
      const center = (minTime + maxTime) / 2
      xMin = Math.max(minTime, center - xInt / 2)
      xMax = Math.min(maxTime, center + xInt / 2)
    }
    if (yInt) { yMin = -yInt; yMax = yInt }

    // Build flight mode annotations
    const annotations = {}
    if (flightModes && flightModes.length > 0) {
      console.log('Building annotations for', flightModes.length, 'flight modes')
      flightModes.forEach((fm, idx) => {
        const color = FLIGHT_MODE_COLORS[fm.mode] || 'rgba(200, 200, 200, 0.3)'
        console.log(`  Mode ${idx}: ${fm.mode} from ${fm.start} to ${fm.end}, color: ${color}`)
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
      console.log('Final annotations object:', annotations)
    } else {
      console.log('No flight modes to annotate')
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
              // Only show tooltip for valid data points
              return tooltipItem.parsed && tooltipItem.parsed.y !== null && tooltipItem.parsed.y !== undefined
            }
          }
        }
      },
      scales: {
        x: { 
          type: 'linear',
          ticks: { color: '#888' }, 
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

  const renderChart = (isFullscreen = false) => (
    <div 
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
            
            {/* Save Graph Button */}
            {selectedProfile && (
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
      </div>

      {/* Saved Graphs Panel */}
      {selectedProfile && (
        <div style={{
          marginTop: 20,
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 6,
          padding: 16,
          color: '#fff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, color: '#fff' }}>📊 Saved Graphs for "{selectedProfile.name}"</h4>
            {loadingSavedGraphs && <span style={{ fontSize: 11, color: '#888' }}>Loading…</span>}
          </div>
          
          {savedGraphs.length === 0 ? (
            <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
              No saved graphs yet. Save a graph above to add one.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {savedGraphs.map(graph => (
                <div key={graph.id}>
                  <div 
                    onClick={() => handleExpandSavedGraph(graph)}
                    style={{
                      background: expandedGraphId === graph.id ? '#1a3a3a' : '#2a2a2a',
                      border: expandedGraphId === graph.id ? '1px solid #0a7ea4' : '1px solid #444',
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
                        {expandedGraphId === graph.id ? '▼' : '▶'} {graph.name}
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

                  {/* Expanded graph view */}
                  {expandedGraphId === graph.id && (
                    <div style={{
                      background: '#1a1a1a',
                      border: '1px solid #0a7ea4',
                      borderTop: 'none',
                      borderRadius: '0 0 4px 4px',
                      padding: 12,
                      marginTop: -1
                    }}>
                      {expandedGraphLoading ? (
                        <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
                          Loading graph data…
                        </div>
                      ) : expandedGraphData ? (
                        <div>
                          {/* Graph controls */}
                          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <label style={{ fontSize: 12, color: '#fff' }}>X-Axis:</label>
                              <select
                                value={expandedGraphXInterval || ''}
                                onChange={(e) => setExpandedGraphXInterval(e.target.value ? Number(e.target.value) : null)}
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
                                value={expandedGraphYInterval || ''}
                                onChange={(e) => setExpandedGraphYInterval(e.target.value ? Number(e.target.value) : null)}
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
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#fff', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={expandedGraphShowFlightModes}
                                onChange={(e) => setExpandedGraphShowFlightModes(e.target.checked)}
                              />
                              Show Flight Modes
                            </label>
                          </div>

                          {/* Expanded chart - reuse chart logic */}
                          <div style={{ background: '#000', padding: 12, borderRadius: 4, height: 300, position: 'relative' }}>
                            {renderExpandedSavedGraph(graph, expandedGraphData, expandedGraphShowFlightModes ? expandedGraphFlightModes : [], expandedGraphXInterval, expandedGraphYInterval)}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
                          Failed to load graph data
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
    </>
  )
}
