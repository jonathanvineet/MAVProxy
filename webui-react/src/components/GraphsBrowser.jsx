import React, { useEffect, useState } from 'react'
import api from '../api'
import { Line } from 'react-chartjs-2'

export default function GraphsBrowser({ token }) {
  const [graphs, setGraphs] = useState([])
  const [selectedGraph, setSelectedGraph] = useState(null)
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [decimate, setDecimate] = useState(1)

  useEffect(() => {
    api.listGraphs()
      .then(res => setGraphs(res.data.graphs || []))
      .catch(err => console.error('Failed to load graphs:', err))
  }, [])

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

    const datasets = Object.entries(graphData.series).map(([expr, data], idx) => {
      const colors = [
        'rgba(75,192,192,1)',
        'rgba(255,99,132,1)',
        'rgba(54,162,235,1)',
        'rgba(255,206,86,1)',
        'rgba(153,102,255,1)',
        'rgba(255,159,64,1)'
      ]
      return {
        label: expr,
        data: data.map(p => ({ x: p.t, y: p.v })),
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length].replace('1)', '0.2)'),
        tension: 0.1,
        pointRadius: 0
      }
    })

    const chartData = {
      datasets
    }

    const options = {
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (s)' } },
        y: { title: { display: true, text: 'Value' } }
      },
      plugins: {
        legend: { position: 'top' }
      }
    }

    return <Line data={chartData} options={options} />
  }

  return (
    <div className="graphs-browser">
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 250, borderRight: '1px solid #ccc', paddingRight: 16 }}>
          <h4>Predefined Graphs</h4>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <label>
              Decimate:
              <select value={decimate} onChange={e => setDecimate(Number(e.target.value))} style={{ marginLeft: 8 }}>
                <option value="1">1 (all points)</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {graphs.map((g, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedGraph(g.name)}
                style={{
                  padding: 8,
                  cursor: 'pointer',
                  backgroundColor: selectedGraph === g.name ? '#e0e0e0' : 'transparent',
                  borderRadius: 4,
                  marginBottom: 4
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: 14 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{g.expressions.length} expression(s)</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {!token && <div>Upload a log file to view graphs</div>}
          {token && !selectedGraph && <div>Select a graph from the list</div>}
          {loading && <div>Loading graph data...</div>}
          {!loading && graphData && (
            <div>
              <h3>{graphData.name}</h3>
              {renderChart()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
