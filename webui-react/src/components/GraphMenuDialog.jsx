import React, { useState, useEffect } from 'react'
import './GraphMenuDialog.css'

/**
 * Hierarchical graph menu dialog matching desktop MAVExplorer
 * All graph names and categories from mavgraphs.xml
 */
export default function GraphMenuDialog({ onClose, onSelectGraph, graphs }) {
  const [expanded, setExpanded] = useState({})
  const [selected, setSelected] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Build hierarchical structure from graph names
  const buildHierarchy = () => {
    const hierarchy = {}
    
    if (!graphs || !Array.isArray(graphs)) return hierarchy
    
    graphs.forEach(graph => {
      const parts = graph.name.split('/')
      let current = hierarchy
      
      parts.forEach((part, idx) => {
        if (idx === parts.length - 1) {
          // Leaf node (actual graph)
          if (!current._graphs) current._graphs = []
          current._graphs.push(graph)
        } else {
          // Category node
          if (!current[part]) current[part] = {}
          current = current[part]
        }
      })
    })
    
    return hierarchy
  }

  const hierarchy = buildHierarchy()

  const toggleCategory = (path) => {
    setExpanded(prev => ({
      ...prev,
      [path]: !prev[path]
    }))
  }

  const handleSelect = (graph) => {
    setSelected(graph.name)
    onSelectGraph(graph)
    onClose()
  }

  const renderTree = (node, path = '', level = 0) => {
    const items = []
    
    Object.keys(node).forEach(key => {
      if (key === '_graphs') return
      
      const currentPath = path ? `${path}/${key}` : key
      const isExpanded = expanded[currentPath]
      const hasChildren = Object.keys(node[key]).some(k => k !== '_graphs')
      const hasGraphs = node[key]._graphs && node[key]._graphs.length > 0
      
      items.push(
        <div key={currentPath} className="menu-item">
          <div 
            className={`menu-category level-${level}`}
            onClick={() => toggleCategory(currentPath)}
          >
            {hasChildren || hasGraphs ? (
              <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
            ) : null}
            <span className="category-name">{key}</span>
          </div>
          
          {isExpanded && (
            <div className="submenu">
              {hasGraphs && node[key]._graphs.map(graph => (
                <div
                  key={graph.name}
                  className={`graph-item ${selected === graph.name ? 'selected' : ''}`}
                  onClick={() => handleSelect(graph)}
                >
                  <span className="graph-name">{graph.name.split('/').pop()}</span>
                  {graph.description && (
                    <div className="graph-description">{graph.description}</div>
                  )}
                </div>
              ))}
              {hasChildren && renderTree(node[key], currentPath, level + 1)}
            </div>
          )}
        </div>
      )
    })
    
    return items
  }

  // Filter graphs based on search
  const filteredGraphs = searchTerm
    ? graphs.filter(g => 
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : null

  if (!open) return null

  return (
    <div className="graph-menu-overlay" onClick={onClose}>
      <div className="graph-menu-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Select Graph</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="dialog-search">
          <input
            type="text"
            placeholder="Search graphs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="dialog-content">
          {searchTerm ? (
            <div className="search-results">
              {filteredGraphs.length === 0 ? (
                <div className="no-results">No graphs found</div>
              ) : (
                filteredGraphs.map(graph => (
                  <div
                    key={graph.name}
                    className="graph-item"
                    onClick={() => handleSelect(graph)}
                  >
                    <div className="graph-name">{graph.name}</div>
                    {graph.description && (
                      <div className="graph-description">{graph.description}</div>
                    )}
                    <div className="graph-expressions">
                      {graph.expressions.length} expression(s)
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="graph-tree">
              {renderTree(hierarchy)}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
