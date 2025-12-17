import React, {useState} from 'react'

export default function FileUploader({onUpload, loading, disabled=false}){
  const [file, setFile] = useState(null)
  const [options, setOptions] = useState({})
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [bypass, setBypass] = useState(false)

  function handleSubmit(e){
    e.preventDefault()
    setError(null)
    if(!file) {
      setError('Please choose a file before analyzing')
      return
    }
    console.log('Submitting file for analysis:', file.name, file)
      try{
      // pass a progress callback to the parent upload handler
      setProgress(0)
      const ret = onUpload(file, options, (ev)=>{
        if(ev && ev.lengthComputable){
          const pct = Math.round((ev.loaded/ev.total)*100)
          setProgress(pct)
        } else if(ev && ev.loaded && ev.total){
          const pct = Math.round((ev.loaded/ev.total)*100)
          setProgress(pct)
        }
      }, bypass)
      // onUpload may return a promise (it does). Catch errors and display them here too.
      if(ret && typeof ret.then === 'function'){
        ret.catch(err => {
          console.error('upload failed', err)
          setError((err?.response?.data?.error) || err.message || String(err))
        })
      }
    }catch(err){
      console.error('onUpload threw', err)
      setError(String(err))
    }
  }

  return (
    <form className="upload" onSubmit={handleSubmit}>
      <label>Log file (.bin)</label>
      <input type="file" accept=".bin,application/octet-stream,*/*" onChange={e=>{ setFile(e.target.files[0]); setError(null); console.log('Selected file', e.target.files[0]) }} />
      {file && <div style={{fontSize:12, color:'#333'}}>Selected: {file.name} ({Math.round(file.size/1024)} KB)</div>}
      {progress > 0 && progress < 100 && <div style={{marginTop:8}}>Uploading: {progress}%</div>}
      {progress === 100 && <div style={{marginTop:8}}>Processing server-side...</div>}
      {error && <div style={{color:'crimson', marginTop:6}}>{error}</div>}
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <label style={{display:'flex', alignItems:'center', gap:8}}>
          <input type="checkbox" checked={bypass} onChange={e=>setBypass(e.target.checked)} />
          <span style={{fontSize:12}}>Bypass proxy (direct to backend)</span>
        </label>
        <button className="btn" type="submit" disabled={loading || !file || disabled} title={disabled ? "Select a profile first" : ""}>{loading? 'Analyzing...':'Analyze'}</button>
      </div>
    </form>
  )
}
