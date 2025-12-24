"""
Supabase client for MAVProxy backend
Handles database operations for profiles and analysis results
"""

import os
import json
from datetime import datetime
from typing import Optional, Dict, Any, List
import uuid

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
        # In-memory fallback stores when Supabase is not configured
        self._mem_profiles: Dict[str, Dict] = {}
        self._mem_saved_graphs: Dict[str, Dict] = {}
        self._mem_analysis_results: Dict[str, Dict] = {}
        
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        
        if url and key and Client:
            try:
                self.client = create_client(url, key)
                self.enabled = True
                print("✅ Supabase client initialized")
            except Exception as e:
                print(f"⚠️ Supabase initialization failed: {e}")
    
    def create_profile(self, user_id: Optional[str], profile_name: str, description: str = "", drone_type: Optional[str] = None) -> Optional[Dict]:
        """Create a new profile. Works with or without Supabase.
        If Supabase is disabled, stores in memory.
        """
        if not profile_name:
            return None

        if not self.enabled:
            # In-memory record
            pid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            record = {
                'id': pid,
                'name': profile_name,
                'description': description or "",
                'drone_type': drone_type,
                'created_at': now,
                'updated_at': now
            }
            self._mem_profiles[pid] = record
            return record
        
        try:
            payload = {
                'name': profile_name,
                'description': description or ""
            }
            # Include optional fields only if provided
            if drone_type is not None:
                payload['drone_type'] = drone_type
            # Some schemas include user_id; avoid sending if not needed
            if user_id:
                payload['user_id'] = user_id

            response = self.client.table('profiles').insert(payload).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error creating profile: {e}")
            return None
    
    def get_user_profiles(self, user_id: str) -> List[Dict]:
        """Get all profiles for a user"""
        if not self.enabled:
            # In-memory: filter by user_id is not tracked; return all
            return list(self._mem_profiles.values())
        
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
    
    def get_all_profiles(self) -> List[Dict]:
        """Get all profiles"""
        if not self.enabled:
            # In-memory: return all stored profiles
            return list(self._mem_profiles.values())
        
        try:
            response = self.client.table('profiles')\
                .select('*')\
                .order('created_at', desc=True)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching all profiles: {e}")
            return []
    
    def get_profile(self, profile_id: str) -> Optional[Dict]:
        """Get a specific profile"""
        if not self.enabled:
            return self._mem_profiles.get(profile_id)
        
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
            if profile_id in self._mem_profiles:
                del self._mem_profiles[profile_id]
                # Also remove saved graphs tied to this profile
                self._mem_saved_graphs = {gid: g for gid, g in self._mem_saved_graphs.items() if g.get('profile_id') != profile_id}
                return True
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
            # Minimal in-memory implementation; store basic metadata
            rid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            record = {
                'id': rid,
                'profile_id': profile_id,
                'filename': filename,
                'file_size': file_size,
                'original_size': original_size,
                'analysis_data': analysis_data,
                'created_at': now
            }
            self._mem_analysis_results[rid] = record
            return record
        
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
            return [r for r in self._mem_analysis_results.values() if r.get('profile_id') == profile_id]
        
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
            # In-memory no-op; return a stub
            return {
                'analysis_id': analysis_id,
                'message_type': message_type,
                'field_name': field_name,
                'data': series_data
            }
        
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
            # In-memory not implemented: return None
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
            # In-memory: store graph record, keyed by uuid
            gid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            record = {
                'id': gid,
                'analysis_id': analysis_id,
                'graph_name': graph_name,
                'graph_type': graph_type,
                'expression': expression,
                'series_data': series_data,
                'created_at': now
            }
            self._mem_saved_graphs[gid] = record
            return record
        
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

    def save_graph_to_profile(self,
                             profile_id: str,
                             name: str,
                             description: str,
                             graph_type: str = 'custom',
                             message_type: str = None,
                             field_name: str = None,
                             token: str = None) -> Optional[Dict]:
        """Save a graph with description to a profile"""
        if not self.enabled:
            # In-memory: store graph saved under profile with description
            gid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            record = {
                'id': gid,
                'profile_id': profile_id,
                'name': name,
                'description': description,
                'graph_type': graph_type,
                'message_type': message_type,
                'field_name': field_name,
                'token': token,
                'created_at': now
            }
            self._mem_saved_graphs[gid] = record
            return record
        
        try:
            response = self.client.table('saved_graphs').insert({
                'profile_id': profile_id,
                'name': name,
                'description': description,
                'graph_type': graph_type,
                'message_type': message_type,
                'field_name': field_name,
                'token': token
            }).execute()
            
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error saving graph to profile: {e}")
            return None
    
    def get_profile_saved_graphs(self, profile_id: str) -> List[Dict]:
        """Get all saved graphs for a profile"""
        if not self.enabled:
            return [g for g in self._mem_saved_graphs.values() if g.get('profile_id') == profile_id]
        
        try:
            response = self.client.table('saved_graphs')\
                .select('*')\
                .eq('profile_id', profile_id)\
                .order('created_at', desc=True)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching saved graphs: {e}")
            return []
    
    def delete_saved_graph(self, graph_id: str) -> bool:
        """Delete a saved graph"""
        if not self.enabled:
            if graph_id in self._mem_saved_graphs:
                del self._mem_saved_graphs[graph_id]
                return True
            return False
        
        try:
            self.client.table('saved_graphs')\
                .delete()\
                .eq('id', graph_id)\
                .execute()
            
            return True
        except Exception as e:
            print(f"Error deleting saved graph: {e}")
            return False
    
    def get_graphs(self, analysis_id: str) -> List[Dict]:
        """Get all graphs for an analysis"""
        if not self.enabled:
            # In-memory: return graphs tied to analysis_id
            return [g for g in self._mem_saved_graphs.values() if g.get('analysis_id') == analysis_id]
        
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
