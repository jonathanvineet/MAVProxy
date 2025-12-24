#!/usr/bin/env python3
"""
Migrate file-based data to MongoDB
This script takes the JSON files from file-based storage and uploads them to MongoDB
"""

import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    from pymongo import MongoClient
    from bson import ObjectId
    import certifi
except ImportError:
    print("Error: pymongo not installed. Install with: pip install pymongo certifi")
    sys.exit(1)

def migrate_to_mongodb():
    """Migrate data from JSON files to MongoDB"""
    
    # Connect to MongoDB
    mongo_uri = os.getenv('MONGO_URI')
    db_name = os.getenv('MONGO_DB_NAME', 'mavproxy')
    
    if not mongo_uri:
        print("Error: MONGO_URI not set in .env")
        sys.exit(1)
    
    print(f"Connecting to MongoDB at {mongo_uri}...")
    
    try:
        client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        client.admin.command('ping')
        db = client[db_name]
        print(f"✅ Connected to MongoDB database '{db_name}'")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        sys.exit(1)
    
    # Paths to JSON files
    data_dir = Path(tempfile.gettempdir()) / 'mavproxy_data'
    profiles_file = data_dir / 'profiles.json'
    graphs_file = data_dir / 'saved_graphs.json'
    analysis_file = data_dir / 'analysis_results.json'
    
    # Migrate profiles
    if profiles_file.exists():
        print(f"\nMigrating profiles from {profiles_file}...")
        with open(profiles_file, 'r') as f:
            profiles_data = json.load(f)
        
        profiles = db['profiles']
        profiles.delete_many({})  # Clear existing
        
        for profile_id, profile in profiles_data.items():
            doc = dict(profile)
            doc['_id'] = ObjectId(profile_id) if len(profile_id) == 24 else profile_id
            try:
                profiles.insert_one(doc)
                print(f"  ✓ Migrated profile: {profile['name']}")
            except Exception as e:
                print(f"  ✗ Error migrating profile {profile_id}: {e}")
        
        print(f"✅ Migrated {len(profiles_data)} profiles")
    
    # Migrate saved graphs
    if graphs_file.exists():
        print(f"\nMigrating saved graphs from {graphs_file}...")
        with open(graphs_file, 'r') as f:
            graphs_data = json.load(f)
        
        graphs = db['saved_graphs']
        graphs.delete_many({})  # Clear existing
        
        for graph_id, graph in graphs_data.items():
            doc = dict(graph)
            doc['_id'] = ObjectId(graph_id) if len(graph_id) == 24 else graph_id
            try:
                graphs.insert_one(doc)
                print(f"  ✓ Migrated graph: {graph['name']}")
            except Exception as e:
                print(f"  ✗ Error migrating graph {graph_id}: {e}")
        
        print(f"✅ Migrated {len(graphs_data)} saved graphs")
    
    # Migrate analysis results
    if analysis_file.exists():
        print(f"\nMigrating analysis results from {analysis_file}...")
        with open(analysis_file, 'r') as f:
            analysis_data = json.load(f)
        
        analysis = db['analysis_results']
        analysis.delete_many({})  # Clear existing
        
        for analysis_id, result in analysis_data.items():
            doc = dict(result)
            doc['_id'] = ObjectId(analysis_id) if len(analysis_id) == 24 else analysis_id
            try:
                analysis.insert_one(doc)
                print(f"  ✓ Migrated analysis: {result['filename']}")
            except Exception as e:
                print(f"  ✗ Error migrating analysis {analysis_id}: {e}")
        
        print(f"✅ Migrated {len(analysis_data)} analysis results")
    
    print("\n🎉 Migration complete!")
    print(f"Data is now in MongoDB cluster: {db.name}")
    print("\nCollections created:")
    print(f"  - profiles")
    print(f"  - saved_graphs")
    print(f"  - analysis_results")

if __name__ == '__main__':
    import tempfile
    migrate_to_mongodb()
