import React from 'react'

function humanizeKey(key){
  if(!key) return ''
  // replace common separators, lower-case, then capitalize words
  const s = String(key).replace(/[_\-]/g, ' ').toLowerCase()
  return s.split(' ').map(w => w.length ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ')
}

export default function OptionsPanel({analysis, token, selected, onSelect}){
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

  return (
    <div>
      <div style={{marginBottom:8}}><strong>Message</strong></div>
      <select value={selected.msg || ''} onChange={changeMsg} style={{width:'100%'}}>
        {msgs.map(m=> {
          const label = MSG_FULL[m] || humanizeKey(m)
          return <option key={m} value={m}>{m + (label ? ` — ${label}` : '')}</option>
        })}
      </select>

      <div style={{marginTop:10}}><strong>Field</strong></div>
      <select value={selected.field || ''} onChange={changeField} style={{width:'100%'}}>
        {(analysis.messages[selected.msg]?.fields || []).map(f=> {
          const label = FIELD_FULL[f] || humanizeKey(f)
          return <option key={f} value={f}>{f + (label ? ` — ${label}` : '')}</option>
        })}
      </select>

      <div style={{marginTop:10}}>
        <a className="btn" href={`/api/download?token=${encodeURIComponent(token||'')}&msg=${encodeURIComponent(selected.msg||'')}`}>Download CSV</a>
      </div>
    </div>
  )
}
