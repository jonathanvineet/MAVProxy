import React, { useState } from 'react'

export default function TabPanel({ tabs, children }) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="tab-panel">
      <div className="tab-header">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`tab ${activeTab === idx ? 'active' : ''}`}
            onClick={() => setActiveTab(idx)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {children[activeTab]}
      </div>
    </div>
  )
}
