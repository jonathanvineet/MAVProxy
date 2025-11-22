import React, { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
import api from '../api'

export default function GraphView({analysis, token, selected}){
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load(){
      if(!token || !selected?.msg || !selected?.field) return setSeries([])
      setLoading(true)
      try{
        const res = await api.getTimeseries(token, selected.msg, selected.field)
        if(!cancelled){
          setSeries(res.data.series || [])
        }
      }catch(e){
        console.error(e)
        setSeries([])
      }finally{ if(!cancelled) setLoading(false) }
    }
    load()
    return ()=>{ cancelled = true }
  }, [token, selected])

  if(!analysis) return <div>No data to show</div>
  if(!selected?.msg) return <div>Select a message</div>
  if(!selected?.field) return <div>Select a field</div>

  const labels = series.map(p => p.t)
  const values = series.map(p => p.v)
  const data = { labels, datasets: [{ label: `${selected.msg}.${selected.field}`, data: values, borderColor: 'rgba(75,192,192,1)', tension:0.1 }] }

  return (
    <div>
      <h4>{selected.msg} · {selected.field}</h4>
      {loading ? <div>Loading...</div> : <Line data={data} />}
    </div>
  )
}
