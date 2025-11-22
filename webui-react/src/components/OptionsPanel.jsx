import React from 'react'

export default function OptionsPanel({analysis, token, selected, onSelect}){
  if(!analysis) return <div>No analysis yet. Upload a .bin file to start.</div>

  const msgs = Object.keys(analysis.messages || {})

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
        {msgs.map(m=> <option key={m} value={m}>{m}</option>)}
      </select>

      <div style={{marginTop:10}}><strong>Field</strong></div>
      <select value={selected.field || ''} onChange={changeField} style={{width:'100%'}}>
        {(analysis.messages[selected.msg]?.fields || []).map(f=> <option key={f} value={f}>{f}</option>)}
      </select>

      <div style={{marginTop:10}}>
        <a className="btn" href={`/api/download?token=${encodeURIComponent(token||'')}&msg=${encodeURIComponent(selected.msg||'')}`}>Download CSV</a>
      </div>
    </div>
  )
}
