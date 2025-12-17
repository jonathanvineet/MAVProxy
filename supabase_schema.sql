-- Supabase Database Schema
-- Copy and paste this entire block into Supabase SQL Editor
-- Go to: SQL Editor → New Query → Paste this → Run

-- ============================================
-- CREATE TABLES
-- ============================================

-- Create profiles table for drone configurations
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  drone_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create analysis_results table for storing upload history and analysis data
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_size BIGINT,
  compressed_size BIGINT,
  analysis_data JSONB,
  graphs JSONB,
  timeseries_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES TABLE POLICIES
-- ============================================

-- Policy: Anyone can read all profiles
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (true);

-- Policy: Anyone can insert new profiles
CREATE POLICY "profiles_public_insert" ON profiles
  FOR INSERT WITH CHECK (true);

-- Policy: Anyone can update any profile
CREATE POLICY "profiles_public_update" ON profiles
  FOR UPDATE USING (true);

-- Policy: Anyone can delete any profile
CREATE POLICY "profiles_public_delete" ON profiles
  FOR DELETE USING (true);

-- ============================================
-- ANALYSIS_RESULTS TABLE POLICIES
-- ============================================

-- Policy: Anyone can read all analysis results
CREATE POLICY "analysis_results_public_read" ON analysis_results
  FOR SELECT USING (true);

-- Policy: Anyone can insert new analysis results
CREATE POLICY "analysis_results_public_insert" ON analysis_results
  FOR INSERT WITH CHECK (true);

-- Policy: Anyone can delete any analysis result
CREATE POLICY "analysis_results_public_delete" ON analysis_results
  FOR DELETE USING (true);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Index: Find all analyses for a specific profile quickly
CREATE INDEX idx_analysis_results_profile_id ON analysis_results(profile_id);

-- Index: Find recently created analyses quickly
CREATE INDEX idx_analysis_results_created_at ON analysis_results(created_at);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_analysis_results_profile_id ON analysis_results(profile_id);
CREATE INDEX idx_timeseries_analysis_id ON timeseries_data(analysis_id);
CREATE INDEX idx_graphs_analysis_id ON graphs(analysis_id);
