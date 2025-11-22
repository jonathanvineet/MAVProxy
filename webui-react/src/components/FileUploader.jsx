import React, {useState} from 'react'

export default function FileUploader({onUpload, loading}){
  const [file, setFile] = useState(null)
  const [options, setOptions] = useState({})

  function handleSubmit(e){
    e.preventDefault()
    if(!file) return alert('Choose a file')
    onUpload(file, options)
  }

  return (
    <form className="upload" onSubmit={handleSubmit}>
      <label>Log file (.bin)</label>
      <input type="file" accept="*" onChange={e=>setFile(e.target.files[0])} />
      <div style={{display:'flex', gap:8}}>
        <button className="btn" type="submit" disabled={loading}>{loading? 'Analyzing...':'Analyze'}</button>
      </div>
    </form>
  )
}
