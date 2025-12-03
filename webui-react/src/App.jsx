import React, {useState, useEffect} from 'react'
import FileUploader from './components/FileUploader'
import OptionsPanel from './components/OptionsPanel'
import GraphView from './components/GraphView'
import TabPanel from './components/TabPanel'
import ParametersView from './components/ParametersView'
import StatsView from './components/StatsView'
import GraphsBrowser from './components/GraphsBrowser'
import MessageDump from './components/MessageDump'
import api from './api'

export default function App(){
  const [analysis, setAnalysis] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState({msg:null, field:null})
  const [error, setError] = useState(null)

  async function handleUpload(file, options, onProgress){
    setLoading(true)
    setError(null)
    try{
      let res
      // support bypass param passed through from FileUploader (onUpload signature: file, options, onProgress, bypass)
      // onProgress may be the 3rd arg, but FileUploader passes a 4th 'bypass' boolean as the last param.
      if(arguments.length >= 4 && arguments[3]){
        // direct upload to backend
        res = await api.uploadFileDirect(file, options, onProgress)
      } else {
        res = await api.uploadFile(file, options, onProgress)
      }
      // server returns { token, analysis }
      setToken(res.data.token)
      setAnalysis(res.data.analysis)
      // select first available message/field
      const firstMsg = Object.keys(res.data.analysis.messages || {})[0]
      const firstField = res.data.analysis.messages[firstMsg]?.fields?.[0]
      setSelected({msg:firstMsg, field:firstField})
    }catch(e){
      const msg = (e?.response?.data?.error || e.message)
      console.error('Analyze error', msg, e)
      setError(msg)
      alert('Error analyzing file: '+msg)
    }finally{ setLoading(false) }
  }

  return (
    <div className="app">
      <div className="header">
        <h2>MAVExplorer WebUI</h2>
        <div>Complete MAVLink log analysis and visualization tool</div>
      </div>

      <div className="upload-section" style={{marginBottom: 16}}>
        {error && <div style={{color:'crimson', marginBottom:8}}>{error}</div>}
        <FileUploader onUpload={handleUpload} loading={loading} />
      </div>

      <TabPanel tabs={['Simple Graph', 'Predefined Graphs', 'Parameters', 'Statistics', 'Message Dump']}>
        <div className="simple-graph-tab">
          <div className="grid">
            <div className="panel">
              <OptionsPanel analysis={analysis} token={token} selected={selected} onSelect={setSelected} />
            </div>
            <div className="panel">
              <div className="graphArea">
                <GraphView analysis={analysis} token={token} selected={selected} />
              </div>
            </div>
          </div>
        </div>

        <div className="graphs-tab">
          <GraphsBrowser token={token} />
        </div>

        <div className="params-tab">
          <ParametersView token={token} />
        </div>

        <div className="stats-tab">
          <StatsView token={token} />
        </div>

        <div className="dump-tab">
          <MessageDump token={token} analysis={analysis} />
        </div>
      </TabPanel>
    </div>
  )
}
