"""
Supabase client for MAVProxy backend
Handles database operations for profiles and analysis results
"""

import os
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    from supabase import create_client, Client
except ImportError:
    # Graceful fallback if supabase not installed
    Client = None

class SupabaseManager:
    """Manager for Supabase operations"""
    
    def __init__(self):
        """Initialize Supabase client"""
        self.enabled = False
        self.client = None
        
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        
        if url and key and Client:
            try:
                self.client = create_client(url, key)
                self.enabled = True
                print("✅ Supabase client initialized")
            except Exception as e:
                print(f"⚠️ Supabase initialization failed: {e}")
    
    def create_profile(self, user_id: str, profile_name: str, description: str = "") -> Optional[Dict]:
        """Create a new profile"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('profiles').insert({
                'user_id': user_id,
                'name': profile_name,
                'description': description
            }).execute()
            
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error creating profile: {e}")
            return None
    
    def get_user_profiles(self, user_id: str) -> List[Dict]:
        """Get all profiles for a user"""
        if not self.enabled:
            return []
        
        try:
            response = self.client.table('profiles')\
                .select('*')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching profiles: {e}")
            return []
    
    def get_profile(self, profile_id: str) -> Optional[Dict]:
        """Get a specific profile"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('profiles')\
                .select('*')\
                .eq('id', profile_id)\
                .single()\
                .execute()
            
            return response.data if response.data else None
        except Exception as e:
            print(f"Error fetching profile: {e}")
            return None
    
    def delete_profile(self, profile_id: str) -> bool:
        """Delete a profile"""
        if not self.enabled:
            return False
        
        try:
            self.client.table('profiles')\
                .delete()\
                .eq('id', profile_id)\
                .execute()
            
            return True
        except Exception as e:
            print(f"Error deleting profile: {e}")
            return False
    
    def save_analysis_result(self, 
                           profile_id: str,
                           filename: str,
                           file_size: int,
                           original_size: int,
                           analysis_data: Dict) -> Optional[Dict]:
        """Save analysis results to database"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('analysis_results').insert({
                'profile_id': profile_id,
                'filename': filename,
                'file_size': file_size,
                'original_size': original_size,
                'analysis_data': analysis_data,
                'message_counts': analysis_data.get('messages', {})
            }).execute()
            
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving analysis result: {e}")
            return None
    
    def get_analysis_results(self, profile_id: str) -> List[Dict]:
        """Get all analysis results for a profile"""
        if not self.enabled:
            return []
        
        try:
            response = self.client.table('analysis_results')\
                .select('*')\
                .eq('profile_id', profile_id)\
                .order('created_at', desc=True)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching analysis results: {e}")
            return []
    
    def save_timeseries(self,
                       analysis_id: str,
                       message_type: str,
                       field_name: str,
                       series_data: List[Dict]) -> Optional[Dict]:
        """Save timeseries data"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('timeseries_data').insert({
                'analysis_id': analysis_id,
                'message_type': message_type,
                'field_name': field_name,
                'data': series_data
            }).execute()
            
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving timeseries: {e}")
            return None
    
    def get_timeseries(self,
                      analysis_id: str,
                      message_type: str,
                      field_name: str) -> Optional[List[Dict]]:
        """Get timeseries data"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('timeseries_data')\
                .select('data')\
                .eq('analysis_id', analysis_id)\
                .eq('message_type', message_type)\
                .eq('field_name', field_name)\
                .single()\
                .execute()
            
            return response.data.get('data') if response.data else None
        except Exception as e:
            print(f"Error fetching timeseries: {e}")
            return None
    
    def save_graph(self,
                  analysis_id: str,
                  graph_name: str,
                  graph_type: str,
                  expression: str,
                  series_data: Dict) -> Optional[Dict]:
        """Save graph data"""
        if not self.enabled:
            return None
        
        try:
            response = self.client.table('graphs').insert({
                'analysis_id': analysis_id,
                'graph_name': graph_name,
                'graph_type': graph_type,
                'expression': expression,
                'series_data': series_data
            }).execute()
            
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving graph: {e}")
            return None
    
    def get_graphs(self, analysis_id: str) -> List[Dict]:
        """Get all graphs for an analysis"""
        if not self.enabled:
            return []
        
        try:
            response = self.client.table('graphs')\
                .select('*')\
                .eq('analysis_id', analysis_id)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching graphs: {e}")
            return []

# Global instance
supabase_manager = SupabaseManager()
