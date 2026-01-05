import React, { useState, useEffect } from 'react'
import api from '../api'
import './ProfileManager.css'

export default function ProfileManager({ selectedProfile, onProfileSelect }) {
  const [profiles, setProfiles] = useState([])
  const [showNewProfile, setShowNewProfile] = useState(false)
  const [newProfileData, setNewProfileData] = useState({
    name: '',
    description: '',
    drone_type: '',
    photo: null,
    photoPreview: null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load profiles on component mount
  useEffect(() => {
    loadProfiles()
  }, [])

  const loadProfiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getProfiles()
      setProfiles(response.data || [])
    } catch (err) {
      setError('Failed to load profiles: ' + err.message)
      console.error('Error loading profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be smaller than 5MB')
        return
      }
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (event) => {
        setNewProfileData({
          ...newProfileData,
          photo: file,
          photoPreview: event.target?.result
        })
      }
      reader.readAsDataURL(file)
      setError(null)
    }
  }

  const handleCreateProfile = async (e) => {
    e.preventDefault()
    if (!newProfileData.name.trim()) {
      setError('Drone name is required')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('name', newProfileData.name)
      formData.append('description', newProfileData.description)
      formData.append('drone_type', newProfileData.drone_type)
      
      if (newProfileData.photo) {
        formData.append('photo', newProfileData.photo)
      }
      
      const response = await api.createProfile(formData)
      
      const newProfile = response.data
      setProfiles([newProfile, ...profiles])
      onProfileSelect(newProfile)
      
      setNewProfileData({ name: '', description: '', drone_type: '', photo: null, photoPreview: null })
      setShowNewProfile(false)
    } catch (err) {
      setError('Failed to create profile: ' + err.message)
      console.error('Error creating profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProfile = (profile) => {
    console.log('[ProfileManager] Selected:', profile)
    onProfileSelect(profile)
  }

  const handleDeleteProfile = async (profileId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this drone profile? This will not affect stored analyses.')) {
      return
    }

    setLoading(true)
    try {
      await api.deleteProfile(profileId)
      setProfiles(profiles.filter(p => p.id !== profileId))
      if (selectedProfile?.id === profileId) {
        onProfileSelect(null)
      }
    } catch (err) {
      setError('Failed to delete profile: ' + err.message)
      console.error('Error deleting profile:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-manager">
      <div className="profile-header">
        <h3>🚁 Drone Profiles</h3>
        <button 
          className="btn-new"
          onClick={() => setShowNewProfile(!showNewProfile)}
          disabled={loading}
        >
          {showNewProfile ? '✕ Cancel' : '+ New Drone'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {showNewProfile && (
        <form className="new-profile-form" onSubmit={handleCreateProfile}>
          <div className="form-row">
            <input
              type="text"
              placeholder="Drone Name (e.g., Drone 1)"
              value={newProfileData.name}
              onChange={(e) => setNewProfileData({...newProfileData, name: e.target.value})}
              disabled={loading}
              required
            />
            <input
              type="text"
              placeholder="Drone Type (e.g., Quadcopter)"
              value={newProfileData.drone_type}
              onChange={(e) => setNewProfileData({...newProfileData, drone_type: e.target.value})}
              disabled={loading}
            />
          </div>
          <textarea
            placeholder="Description (optional)"
            value={newProfileData.description}
            onChange={(e) => setNewProfileData({...newProfileData, description: e.target.value})}
            disabled={loading}
            rows="2"
          />
          <div className="photo-upload-section">
            <label className="photo-upload-label">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={loading}
                className="photo-input"
              />
              <span className="photo-upload-btn">📷 Upload Drone Photo (Optional)</span>
            </label>
            {newProfileData.photoPreview && (
              <div className="photo-preview-container">
                <img src={newProfileData.photoPreview} alt="Preview" className="photo-preview" />
                <button
                  type="button"
                  className="btn-remove-photo"
                  onClick={() => setNewProfileData({...newProfileData, photo: null, photoPreview: null})}
                  disabled={loading}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <button type="submit" className="btn-create" disabled={loading}>
            {loading ? 'Creating...' : 'Create Drone Profile'}
          </button>
        </form>
      )}

      <div className="profiles-list">
        {loading && !showNewProfile && <div className="loading">Loading profiles...</div>}
        
        {profiles.length === 0 && !loading && (
          <div className="no-profiles">No drone profiles yet. Create one to get started!</div>
        )}
        
        {profiles.map(profile => (
          <div
            key={profile.id}
            className={`profile-item ${selectedProfile?.id === profile.id ? 'selected' : ''}`}
            onClick={() => handleSelectProfile(profile)}
          >
            <div className="profile-info">
              <div className="profile-name">{profile.name}</div>
              {profile.drone_type && <div className="profile-type">{profile.drone_type}</div>}
              {profile.description && <div className="profile-desc">{profile.description}</div>}
            </div>
            <div className="profile-actions">
              {profile.photo_url && (
                <div className="profile-photo-container">
                  <img
                    src={profile.photo_url}
                    alt={profile.name}
                    className="profile-photo"
                  />
                </div>
              )}
              <button
                className="btn-delete"
                onClick={(e) => handleDeleteProfile(profile.id, e)}
                disabled={loading}
                title="Delete this drone profile"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedProfile && (
        <div className="selected-info">
          <strong>Selected: {selectedProfile.name}</strong>
        </div>
      )}
    </div>
  )
}
