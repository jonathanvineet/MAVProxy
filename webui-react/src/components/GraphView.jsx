import React, { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
Chart.register(...registerables, annotationPlugin)
import api from '../api'

// Flight mode colors matching desktop MAVExplorer
const FLIGHT_MODE_COLORS = [
  'rgba(255, 0, 0, 0.15)',
  'rgba(0, 255, 0, 0.15)',
  'rgba(0, 0, 255, 0.15)',
  'rgba(0, 255, 255, 0.15)',
  'rgba(255, 0, 255, 0.15)',
  'rgba(255, 255, 0, 0.15)',
  'rgba(255, 128, 0, 0.15)',
  'rgba(255, 0, 128, 0.15)',
  'rgba(128, 255, 0, 0.15)',
  'rgba(0, 255, 128, 0.15)',
  'rgba(128, 0, 255, 0.15)',
  'rgba(0, 128, 255, 0.15)',
]

export default function GraphView({analysis, token, selected, predefinedGraph}){
  const [seriesData, setSeriesData] = useState({})
  const [loading, setLoading] = useState(false)
  const [flightModes, setFlightModes] = useState([])
  const [showFlightModes, setShowFlightModes] = useState(true)
  const [decimate, setDecimate] = useState(1)

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
    
    return {
      label: `${selected.msg}.${field}`,
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
  
  // Build flight mode annotations
  const annotations = {}
  if (showFlightModes && flightModes.length > 0) {
    const modeColorMap = {}
    let colorIdx = 0
    
    flightModes.forEach((fm, idx) => {
      if (!modeColorMap[fm.mode]) {
        modeColorMap[fm.mode] = FLIGHT_MODE_COLORS[colorIdx % FLIGHT_MODE_COLORS.length]
        colorIdx++
      }
      
      annotations[`mode-${idx}`] = {
        type: 'box',
        xMin: fm.start,
        xMax: fm.end,
        backgroundColor: modeColorMap[fm.mode],
        borderWidth: 0
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
          callback: function(value) {
            const time = labels[value]
            if (time !== undefined) {
              const date = new Date(time * 1000)
              return date.toLocaleTimeString()
            }
            return value
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
          boxWidth: 15,
          boxHeight: 2,
          padding: 8,
          font: { size: 11 },
          usePointStyle: false
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>
          {predefinedGraph ? predefinedGraph.name : `${selected.msg} · ${selected.field === 'All' ? 'All Fields' : selected.field}`}
        </h4>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input 
            type="checkbox" 
            checked={showFlightModes} 
            onChange={e => setShowFlightModes(e.target.checked)}
          />
          Show Flight Modes
        </label>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div style={{ flex: 1, minHeight: 400 }}>
          <Line data={data} options={options} />
        </div>
      )}
    </div>
  )
}
