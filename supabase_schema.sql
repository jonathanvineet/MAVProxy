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

-- Create saved_graphs table for storing user-saved graphs with descriptions
CREATE TABLE IF NOT EXISTS saved_graphs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  graph_type VARCHAR(50),
  message_type VARCHAR(100),
  field_name VARCHAR(100),
  token VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_graphs ENABLE ROW LEVEL SECURITY;

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
-- SAVED_GRAPHS TABLE POLICIES
-- ============================================

-- Policy: Anyone can read all saved graphs
CREATE POLICY "saved_graphs_public_read" ON saved_graphs
  FOR SELECT USING (true);

-- Policy: Anyone can insert new saved graphs
CREATE POLICY "saved_graphs_public_insert" ON saved_graphs
  FOR INSERT WITH CHECK (true);

-- Policy: Anyone can delete any saved graph
CREATE POLICY "saved_graphs_public_delete" ON saved_graphs
  FOR DELETE USING (true);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Index: Find all analyses for a specific profile quickly
CREATE INDEX idx_analysis_results_profile_id ON analysis_results(profile_id);

-- Index: Find recently created analyses quickly
CREATE INDEX idx_analysis_results_created_at ON analysis_results(created_at);

-- Index: Find all saved graphs for a specific profile
CREATE INDEX idx_saved_graphs_profile_id ON saved_graphs(profile_id);

-- Index: Find recently saved graphs
CREATE INDEX idx_saved_graphs_created_at ON saved_graphs(created_at);
