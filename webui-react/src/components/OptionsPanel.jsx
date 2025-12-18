import React, { useState, useEffect } from 'react'
import GraphMenuDialog from './GraphMenuDialog'
import api from '../api'

function humanizeKey(key){
  if(!key) return ''
  // replace common separators, lower-case, then capitalize words
  const s = String(key).replace(/[_\-]/g, ' ').toLowerCase()
  return s.split(' ').map(w => w.length ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ')
}

export default function OptionsPanel({analysis, token, selected, onSelect, onSelectPredefinedGraph}){
  const [showGraphMenu, setShowGraphMenu] = useState(false)
  const [graphs, setGraphs] = useState([])
  
  useEffect(() => {
    api.listGraphs()
      .then(res => setGraphs(res.data.graphs || []))
      .catch(err => console.error('Failed to load graphs:', err))
  }, [])
  
  if(!analysis) return <div>No analysis yet. Upload a .bin file to start.</div>

  const msgs = Object.keys(analysis.messages || {})

  // Short -> full name mappings for common / known abbreviations
  const MSG_FULL = {
    'BAT': 'Battery',
    'GPS': 'GPS',
    'HEARTBEAT': 'Heartbeat',
    'ATTITUDE': 'Attitude',
    'SYS_STATUS': 'System Status',
  }

  const FIELD_FULL = {
    'curr': 'Current',
    'Curr': 'Current',
    'voltage_battery': 'Battery Voltage',
    'voltages': 'Voltages',
    'lat': 'Latitude',
    'lon': 'Longitude',
    'alt': 'Altitude',
  }

  function changeMsg(e){
    const msg = e.target.value
    const field = analysis.messages[msg]?.fields?.[0] || null
    onSelect({msg, field})
  }

  function changeField(e){
    onSelect({...selected, field:e.target.value})
  }

  const fields = analysis.messages[selected.msg]?.fields || []

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px', minWidth: 150 }}>
        <div style={{marginBottom:4, fontSize: 12, fontWeight: 'bold'}}>Message</div>
        <select value={selected.msg || ''} onChange={changeMsg} style={{width:'100%', padding: 6}}>
          {msgs.map(m=> {
            const label = MSG_FULL[m] || humanizeKey(m)
            return <option key={m} value={m}>{m + (label ? ` — ${label}` : '')}</option>
          })}
        </select>
      </div>

      <div style={{ flex: '1 1 200px', minWidth: 150 }}>
        <div style={{marginBottom:4, fontSize: 12, fontWeight: 'bold'}}>Field</div>
        <select value={selected.field || ''} onChange={changeField} style={{width:'100%', padding: 6}}>
          <option value="All">All — All</option>
          {fields.map(f=> {
            const label = FIELD_FULL[f] || humanizeKey(f)
            return <option key={f} value={f}>{f + (label ? ` — ${label}` : '')}</option>
          })}
        </select>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button 
          className="btn" 
          onClick={() => setShowGraphMenu(true)}
          style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
        >
          Browse Predefined Graphs
        </button>
        <a className="btn" href={`/api/download?token=${encodeURIComponent(token||'')}&msg=${encodeURIComponent(selected.msg||'')}`} style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>Download CSV</a>
      </div>
      
      {showGraphMenu && (
        <GraphMenuDialog 
          graphs={graphs}
          onClose={() => setShowGraphMenu(false)}
          onSelectGraph={(graph) => {
            if (onSelectPredefinedGraph) {
              onSelectPredefinedGraph(graph)
            }
            setShowGraphMenu(false)
          }}
        />
      )}
    </div>
  )
}
