import React, {useState, useEffect} from 'react'
import FileUploader from './components/FileUploader'
import ProfileManager from './components/ProfileManager'
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
  const [predefinedGraph, setPredefinedGraph] = useState(null)
  const [error, setError] = useState(null)
  // const [selectedProfile, setSelectedProfile] = useState(null)

  async function handleUpload(file, options, onProgress){
    setLoading(true)
    setError(null)
    
    // Profile integration commented out for now
    // if(!selectedProfile){
    //   setError('Please select or create a drone profile first')
    //   setLoading(false)
    //   return
    // }
    
    try{
      let res
      // Pass profileId to uploadFile (null for now)
      res = await api.uploadFile(file, options, onProgress, null)
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
        {/* Profile integration temporarily disabled */}
        {/* <ProfileManager onProfileSelect={setSelectedProfile} selectedProfile={selectedProfile} /> */}
        {error && <div style={{color:'crimson', marginBottom:8}}>{error}</div>}
        <FileUploader onUpload={handleUpload} loading={loading} disabled={false} />
      </div>

      <TabPanel tabs={['Graphs', 'Parameters', 'Statistics', 'Message Dump']}>
        <div className="graphs-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Options on top */}
          <div style={{ padding: '12px', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
            <OptionsPanel 
              analysis={analysis} 
              token={token} 
              selected={selected} 
              onSelect={(sel) => {
                setSelected(sel)
                setPredefinedGraph(null) // Clear predefined when custom selected
              }} 
              onSelectPredefinedGraph={(graph) => {
                setPredefinedGraph(graph)
                // Don't clear selected, keep it for switching back
              }}
            />
          </div>
          
          {/* Graph takes remaining space */}
          <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
            <GraphView 
              analysis={analysis} 
              token={token} 
              selected={selected} 
              predefinedGraph={predefinedGraph}
            />
          </div>
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
