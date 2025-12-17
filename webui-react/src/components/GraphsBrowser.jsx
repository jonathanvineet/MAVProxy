import React, { useEffect, useState } from 'react'
import api from '../api'
import { Line } from 'react-chartjs-2'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Chart } from 'chart.js'
import GraphMenuDialog from './GraphMenuDialog'

// Register annotation plugin
Chart.register(annotationPlugin)

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

export default function GraphsBrowser({ token }) {
  const [graphs, setGraphs] = useState([])
  const [selectedGraph, setSelectedGraph] = useState(null)
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [decimate, setDecimate] = useState(1)
  const [flightModes, setFlightModes] = useState([])
  const [showFlightModes, setShowFlightModes] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api.listGraphs()
      .then(res => setGraphs(res.data.graphs || []))
      .catch(err => console.error('Failed to load graphs:', err))
  }, [])

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

  const loadGraph = async (graphName) => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api.evalGraph(token, graphName, decimate)
      setGraphData(res.data)
    } catch (err) {
      console.error('Failed to load graph:', err)
      alert('Failed to load graph: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedGraph) {
      loadGraph(selectedGraph)
    }
  }, [selectedGraph, token, decimate])

  const renderChart = () => {
    if (!graphData || !graphData.series) return null

    // Colors matching desktop MAVExplorer
    const colors = [
      { border: 'rgb(255, 0, 0)', bg: 'rgba(255, 0, 0, 0.1)' },      // Red
      { border: 'rgb(0, 255, 0)', bg: 'rgba(0, 255, 0, 0.1)' },      // Green
      { border: 'rgb(0, 0, 255)', bg: 'rgba(0, 0, 255, 0.1)' },      // Blue
      { border: 'rgb(255, 165, 0)', bg: 'rgba(255, 165, 0, 0.1)' },  // Orange
      { border: 'rgb(128, 128, 0)', bg: 'rgba(128, 128, 0, 0.1)' },  // Olive
      { border: 'rgb(0, 0, 0)', bg: 'rgba(0, 0, 0, 0.1)' },          // Black
      { border: 'rgb(128, 128, 128)', bg: 'rgba(128, 128, 128, 0.1)' }, // Grey
      { border: 'rgb(255, 255, 0)', bg: 'rgba(255, 255, 0, 0.1)' },  // Yellow
      { border: 'rgb(165, 42, 42)', bg: 'rgba(165, 42, 42, 0.1)' },  // Brown
      { border: 'rgb(0, 139, 139)', bg: 'rgba(0, 139, 139, 0.1)' },  // Darkcyan
    ]

    const datasets = Object.entries(graphData.series).map(([expr, data], idx) => {
      const color = colors[idx % colors.length]
      return {
        label: expr,
        data: data.map(p => ({ x: p.t, y: p.v })),
        borderColor: color.border,
        backgroundColor: color.bg,
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4
      }
    })

    const chartData = { datasets }

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
            callback: function(value) {
              const date = new Date(value * 1000)
              return date.toLocaleTimeString()
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
        annotation: { annotations },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          callbacks: {
            title: function(context) {
              const time = context[0].parsed.x
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

    return <Line data={chartData} options={options} />
  }

  return (
    <div className="graphs-browser">
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 280, borderRight: '1px solid #ccc', paddingRight: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Graphs</h4>
            <button 
              onClick={() => setMenuOpen(true)}
              style={{
                padding: '6px 12px',
                background: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600
              }}
            >
              Browse All
            </button>
          </div>
          
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <input 
                type="checkbox" 
                checked={showFlightModes} 
                onChange={e => setShowFlightModes(e.target.checked)}
              />
              Flight Modes
            </label>
            
            <label>
              Decimate:
              <select value={decimate} onChange={e => setDecimate(Number(e.target.value))} style={{ marginLeft: 8, width: '100%' }}>
                <option value="1">1 (all)</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
          
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {graphs.slice(0, 20).map((g, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedGraph(g.name)}
                style={{
                  padding: 8,
                  cursor: 'pointer',
                  backgroundColor: selectedGraph === g.name ? '#e3f2fd' : 'transparent',
                  borderRadius: 4,
                  marginBottom: 4,
                  border: selectedGraph === g.name ? '1px solid #1976d2' : 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>{g.name}</div>
                <div style={{ fontSize: 10, color: '#666' }}>{g.expressions.length} expr</div>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!token && <div>Upload a log file first</div>}
          {token && !selectedGraph && <div>Select a graph</div>}
          {loading && <div>Loading...</div>}
          {!loading && graphData && (
            <>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{graphData.name}</h3>
              <div style={{ flex: 1, minHeight: 400 }}>
                {renderChart()}
              </div>
            </>
          )}
        </div>
      </div>
      
      <GraphMenuDialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelectGraph={(graph) => setSelectedGraph(graph.name)}
        graphs={graphs}
      />
    </div>
  )
}
