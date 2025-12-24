"""
MongoDB client for MAVProxy backend
Provides persistence for profiles, analyses, and saved graphs.
Falls back to file-based JSON storage if MongoDB is not configured or unavailable.
"""

import os
import uuid
import json
import tempfile
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path

try:
    from pymongo import MongoClient
    from bson import ObjectId
    import certifi
except ImportError:
    MongoClient = None
    ObjectId = None
    certifi = None


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _coerce_object_id(value: str):
    if ObjectId is None:
        return value
    try:
        return ObjectId(value)
    except Exception:
        return value


class MongoManager:
    def __init__(self):
        """Initialize Mongo client. Uses file-based fallback if not configured."""
        self.enabled = True  # We expose operations even if Mongo is missing (fallback memory)
        self.connected = False
        self.client = None
        self.db = None

        # Setup file-based persistence
        self.data_dir = Path(tempfile.gettempdir()) / 'mavproxy_data'
        self.data_dir.mkdir(exist_ok=True)
        self.profiles_file = self.data_dir / 'profiles.json'
        self.graphs_file = self.data_dir / 'saved_graphs.json'
        self.analysis_file = self.data_dir / 'analysis_results.json'

        self._mem_profiles: Dict[str, Dict[str, Any]] = {}
        self._mem_saved_graphs: Dict[str, Dict[str, Any]] = {}
        self._mem_analysis_results: Dict[str, Dict[str, Any]] = {}

        # Load from files if they exist
        self._load_from_files()

        uri = os.getenv('MONGO_URI')
        db_name = os.getenv('MONGO_DB_NAME', 'mavproxy')

        if uri and MongoClient:
            try:
                # Try with TLS first (production)
                # Use longer timeout for serverless cold starts
                tls_opts = {
                    'serverSelectionTimeoutMS': 15000,  # Increased from 5000
                    'connectTimeoutMS': 15000,
                    'tls': True,
                    'retryWrites': True,
                    'w': 'majority'
                }
                if certifi:
                    tls_opts['tlsCAFile'] = certifi.where()

                self.client = MongoClient(uri, **tls_opts)
                self.client.admin.command('ping')
                self.db = self.client[db_name]
                self.connected = True
                print(f"✅ MongoDB connected to '{db_name}' with TLS")
            except Exception as tls_err:
                # Try without TLS for development environments (Codespaces)
                try:
                    print(f"⚠️ TLS connection failed: {str(tls_err)}, trying without TLS for development...")
                    dev_opts = {
                        'serverSelectionTimeoutMS': 15000,
                        'connectTimeoutMS': 15000,
                        'tls': False,
                        'retryWrites': False,
                    }
                    # Extract host from URI if possible
                    self.client = MongoClient(uri, **dev_opts)
                    self.client.admin.command('ping')
                    self.db = self.client[db_name]
                    self.connected = True
                    print(f"✅ MongoDB connected to '{db_name}' without TLS (development mode)")
                except Exception as dev_err:
                    print(f"⚠️ All MongoDB connection attempts failed, using file-based storage at {self.data_dir}")
                    print(f"   TLS error: {tls_err}")
                    print(f"   Dev error: {dev_err}")
                    print(f"   Make sure MongoDB Atlas Network Access allows Vercel IPs (0.0.0.0/0)")
        else:
            print(f"ℹ️ MongoDB not configured; using file-based storage at {self.data_dir}")

    def _load_from_files(self):
        """Load data from local JSON files"""
        try:
            if self.profiles_file.exists():
                with open(self.profiles_file, 'r') as f:
                    self._mem_profiles = json.load(f)
                    print(f"✓ Loaded {len(self._mem_profiles)} profiles from {self.profiles_file}")
        except Exception as e:
            print(f"⚠️ Error loading profiles: {e}")

        try:
            if self.graphs_file.exists():
                with open(self.graphs_file, 'r') as f:
                    self._mem_saved_graphs = json.load(f)
                    print(f"✓ Loaded {len(self._mem_saved_graphs)} saved graphs from {self.graphs_file}")
        except Exception as e:
            print(f"⚠️ Error loading saved graphs: {e}")

        try:
            if self.analysis_file.exists():
                with open(self.analysis_file, 'r') as f:
                    self._mem_analysis_results = json.load(f)
                    print(f"✓ Loaded {len(self._mem_analysis_results)} analysis results from {self.analysis_file}")
        except Exception as e:
            print(f"⚠️ Error loading analysis results: {e}")

    def _save_to_files(self):
        """Save data to local JSON files"""
        try:
            with open(self.profiles_file, 'w') as f:
                json.dump(self._mem_profiles, f, indent=2)
        except Exception as e:
            print(f"⚠️ Error saving profiles: {e}")

        try:
            with open(self.graphs_file, 'w') as f:
                json.dump(self._mem_saved_graphs, f, indent=2)
        except Exception as e:
            print(f"⚠️ Error saving graphs: {e}")

        try:
            with open(self.analysis_file, 'w') as f:
                json.dump(self._mem_analysis_results, f, indent=2)
        except Exception as e:
            print(f"⚠️ Error saving analysis results: {e}")

    # -------- profiles --------
    def create_profile(self, user_id: Optional[str], name: str, description: str = "", drone_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not name:
            return None

        if not self.connected:
            pid = str(uuid.uuid4())
            record = {
                'id': pid,
                'name': name,
                'description': description or "",
                'drone_type': drone_type,
                'created_at': _now_iso(),
                'updated_at': _now_iso(),
            }
            self._mem_profiles[pid] = record
            self._save_to_files()  # Persist to disk
            return record

        doc = {
            'name': name,
            'description': description or "",
            'drone_type': drone_type,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        }
        if user_id:
            doc['user_id'] = user_id

        res = self.db['profiles'].insert_one(doc)
        doc['id'] = str(res.inserted_id)
        return self._serialize(doc)

    def get_user_profiles(self, user_id: str) -> List[Dict[str, Any]]:
        if not self.connected:
            return list(self._mem_profiles.values())

        cursor = self.db['profiles'].find({'user_id': user_id}) if user_id else self.db['profiles'].find()
        return [self._serialize(doc) for doc in cursor]

    def get_all_profiles(self) -> List[Dict[str, Any]]:
        if not self.connected:
            return list(self._mem_profiles.values())
        cursor = self.db['profiles'].find()
        return [self._serialize(doc) for doc in cursor]

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        if not self.connected:
            return self._mem_profiles.get(profile_id)
        doc = self.db['profiles'].find_one({'_id': _coerce_object_id(profile_id)})
        return self._serialize(doc) if doc else None

    def delete_profile(self, profile_id: str) -> bool:
        if not self.connected:
            if profile_id in self._mem_profiles:
                del self._mem_profiles[profile_id]
                self._mem_saved_graphs = {gid: g for gid, g in self._mem_saved_graphs.items() if g.get('profile_id') != profile_id}
                self._mem_analysis_results = {aid: a for aid, a in self._mem_analysis_results.items() if a.get('profile_id') != profile_id}
                self._save_to_files()  # Persist to disk
                return True
            return False
        res = self.db['profiles'].delete_one({'_id': _coerce_object_id(profile_id)})
        # cascade delete saved graphs and analyses
        self.db['saved_graphs'].delete_many({'profile_id': profile_id})
        self.db['analysis_results'].delete_many({'profile_id': profile_id})
        return res.deleted_count > 0

    # -------- analyses --------
    def save_analysis_result(self, profile_id: str, filename: str, file_size: int, original_size: int, analysis_data: Dict[str, Any], token: Optional[str] = None, file_content: Optional[bytes] = None) -> Optional[Dict[str, Any]]:
        """
        Save analysis result and optionally the file content for Vercel serverless.
        file_content: The decompressed .bin file bytes (for Vercel to enable cross-request access)
        """
        if not self.connected:
            aid = str(uuid.uuid4())
            record = {
                'id': aid,
                'profile_id': profile_id,
                'filename': filename,
                'file_size': file_size,
                'original_size': original_size,
                'analysis_data': analysis_data,
                'token': token,
                'created_at': _now_iso(),
            }
            # Don't store file_content in memory (too large)
            self._mem_analysis_results[aid] = record
            self._save_to_files()  # Persist to disk
            return record

        doc = {
            'profile_id': profile_id,
            'filename': filename,
            'file_size': file_size,
            'original_size': original_size,
            'analysis_data': analysis_data,
            'token': token,
            'created_at': datetime.utcnow(),
        }
        
        # Store file content as Binary for Vercel serverless support
        if file_content:
            from bson.binary import Binary
            doc['file_content'] = Binary(file_content)
        
        res = self.db['analysis_results'].insert_one(doc)
        doc['id'] = str(res.inserted_id)
        # Don't include file_content in response (too large)
        if 'file_content' in doc:
            del doc['file_content']
        return self._serialize(doc)
            'original_size': original_size,
            'analysis_data': analysis_data,
            'token': token,
            'created_at': datetime.utcnow(),
        }
        res = self.db['analysis_results'].insert_one(doc)
        doc['id'] = str(res.inserted_id)
        return self._serialize(doc)

    def get_analysis_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Get analysis result by token"""
        if not self.connected:
            for analysis in self._mem_analysis_results.values():
                if analysis.get('token') == token:
                    return analysis
            return None
        
        doc = self.db['analysis_results'].find_one({'token': token})
        return self._serialize(doc) if doc else None

    def get_analysis_results(self, profile_id: str) -> List[Dict[str, Any]]:
        if not self.connected:
            return [a for a in self._mem_analysis_results.values() if a.get('profile_id') == profile_id]
        cursor = self.db['analysis_results'].find({'profile_id': profile_id}).sort('created_at', -1)
        return [self._serialize(doc) for doc in cursor]

    # -------- saved graphs --------
    def save_graph_to_profile(self, profile_id: str, name: str, description: str, graph_type: str = 'custom', message_type: Optional[str] = None, field_name: Optional[str] = None, token: Optional[str] = None, series_data: Optional[Dict] = None, flight_modes: Optional[List] = None) -> Optional[Dict[str, Any]]:
        if not name:
            return None

        if not self.connected:
            gid = str(uuid.uuid4())
            record = {
                'id': gid,
                'profile_id': profile_id,
                'name': name,
                'description': description,
                'graph_type': graph_type,
                'message_type': message_type,
                'field_name': field_name,
                'token': token,
                'series_data': series_data,
                'flight_modes': flight_modes,
                'created_at': _now_iso(),
            }
            self._mem_saved_graphs[gid] = record
            self._save_to_files()  # Persist to disk
            return record

        doc = {
            'profile_id': profile_id,
            'name': name,
            'description': description,
            'graph_type': graph_type,
            'message_type': message_type,
            'field_name': field_name,
            'token': token,
            'series_data': series_data,
            'flight_modes': flight_modes,
            'created_at': datetime.utcnow(),
        }
        res = self.db['saved_graphs'].insert_one(doc)
        doc['id'] = str(res.inserted_id)
        return self._serialize(doc)

    def get_profile_saved_graphs(self, profile_id: str) -> List[Dict[str, Any]]:
        if not self.connected:
            return [g for g in self._mem_saved_graphs.values() if g.get('profile_id') == profile_id]
        cursor = self.db['saved_graphs'].find({'profile_id': profile_id}).sort('created_at', -1)
        return [self._serialize(doc) for doc in cursor]

    def delete_saved_graph(self, graph_id: str) -> bool:
        if not self.connected:
            if graph_id in self._mem_saved_graphs:
                del self._mem_saved_graphs[graph_id]
                self._save_to_files()  # Persist to disk
                return True
            return False
        res = self.db['saved_graphs'].delete_one({'_id': _coerce_object_id(graph_id)})
        return res.deleted_count > 0

    def get_graphs(self, analysis_id: str) -> List[Dict[str, Any]]:
        if not self.connected:
            return [g for g in self._mem_saved_graphs.values() if g.get('analysis_id') == analysis_id]
        cursor = self.db['graphs'].find({'analysis_id': analysis_id})
        return [self._serialize(doc) for doc in cursor]

    # -------- helpers --------
    def _serialize(self, doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not doc:
            return None
        result = dict(doc)
        if '_id' in result:
            result['id'] = str(result.pop('_id'))
        # Normalize datetime to iso strings for JSON responses
        for key, val in list(result.items()):
            if isinstance(val, datetime):
                result[key] = val.isoformat()
        return result


mongo_manager = MongoManager()
