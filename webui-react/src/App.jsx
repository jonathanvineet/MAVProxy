import React, {useState, useEffect} from 'react'
import FileUploader from './components/FileUploader'
import ProfileManager from './components/ProfileManager'
import OptionsPanel from './components/OptionsPanel'
import GraphView from './components/GraphView'
import SavedGraphsPanel from './components/SavedGraphsPanel'
import ComparisonView from './components/ComparisonView'
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
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])

  // Fetch all profiles on mount for ComparisonView
  useEffect(() => {
    api.getProfiles()
      .then(res => {
        const profiles = Array.isArray(res.data) ? res.data : (res.data.profiles || [])
        setAllProfiles(profiles)
      })
      .catch(err => console.error('Failed to load profiles:', err))
  }, [])

  async function handleUpload(file, options, onProgress){
    setLoading(true)
    setError(null)
    
    // Optionally require profile selection - uncomment if you want to enforce it
    // if(!selectedProfile){
    //   setError('Please select or create a drone profile first')
    //   setLoading(false)
    //   return
    // }
    
    try{
      let res
      // Pass profileId to uploadFile
      res = await api.uploadFile(file, options, onProgress, selectedProfile?.id || null)
      // server returns { token, analysis }
      setToken(res.data.token)
      setAnalysis(res.data.analysis)
      // select first available message/field
      const firstMsg = Object.keys(res.data.analysis.messages || {})[0]
      const firstField = res.data.analysis.messages[firstMsg]?.fields?.[0]
      setSelected({msg:firstMsg, field:firstField})
      
      // Show warning for production deployment about file persistence
      if(import.meta.env.PROD){
        setTimeout(() => {
          alert('⚠️ IMPORTANT: File uploaded successfully!\n\nOn cloud deployment, graphs may not load after this session ends.\n\nTO SAVE YOUR DATA:\n1. Select messages/fields to create graphs\n2. Click "Save Graph" button for each graph\n3. View saved graphs anytime from "Saved Graphs" section\n\nFor unlimited file access, run locally with "npm run dev"')
        }, 500)
      }
    }catch(e){
      const msg = (e?.response?.data?.error || e.message)
      console.error('Analyze error', msg, e)
      setError(msg)
      alert('Error analyzing file: '+msg)
    }finally{ setLoading(false) }
  }

  return (
    <div className="app" style={{ background: '#ffffff', minHeight: '100vh', color: '#1a1a1a' }}>
      <div className="header" style={{ color: '#1a1a1a' }}>
        <h2 style={{ color: '#1a1a1a' }}>MAVExplorer WebUI</h2>
        <div style={{ color: '#666' }}>Complete MAVLink log analysis and visualization tool</div>
      </div>

      <div className="upload-section" style={{marginBottom: 16, background: '#f8f9fa', border: '1px solid #ddd', color: '#1a1a1a'}}>
        <ProfileManager onProfileSelect={setSelectedProfile} selectedProfile={selectedProfile} />
        {error && <div style={{color:'#ff6b6b', marginBottom:8}}>{error}</div>}
        <FileUploader onUpload={handleUpload} loading={loading} disabled={false} />
        
        {/* Important notice for Vercel deployment */}
        {import.meta.env.PROD && (
          <div style={{
            background: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: 4,
            padding: 12,
            margin: '12px 0',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#1a1a1a'
          }}>
            <strong style={{color: '#1976d2'}}>ℹ️ Cloud Deployment Note:</strong> After uploading and analyzing a file, 
            <strong> use the "Save Graph" button</strong> to persist your graphs to the database. 
            Due to serverless limitations, the raw file data is only available during your upload session. 
            Saved graphs can be viewed anytime from the "Saved Graphs" section below.
          </div>
        )}
      </div>

      <TabPanel tabs={['Graphs', 'Parameters', 'Statistics', 'Message Dump']}>
        <div className="graphs-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Options on top */}
          <div style={{ padding: '12px', background: '#f8f9fa', borderBottom: '1px solid #ddd' }}>
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
          <div style={{ flex: 1, padding: '16px', overflow: 'auto', background: '#ffffff' }}>
            <GraphView 
              analysis={analysis} 
              token={token} 
              selected={selected} 
              predefinedGraph={predefinedGraph}
              selectedProfile={selectedProfile}
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

      {/* Saved Graphs Panel - Always visible and separate from GraphView */}
      <div style={{ padding: '16px', background: '#ffffff' }}>
        <SavedGraphsPanel selectedProfile={selectedProfile} />
      </div>

      {/* Comparison View - Side-by-side graph comparison */}
      <div style={{ padding: '16px', background: '#ffffff' }}>
        <ComparisonView allProfiles={allProfiles} />
      </div>
    </div>
  )
}
