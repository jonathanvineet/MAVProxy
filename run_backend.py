#!/usr/bin/env python3
"""
Development server runner for MAVProxy backend
Run from repository root: python run_backend.py
"""

import sys
import os
import socket

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run the Flask app
from api.index import app

def find_available_port(start_port=5000, max_port=5010):
    """Find an available port"""
    for port in range(start_port, max_port):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(('localhost', port))
            sock.close()
            return port
        except OSError:
            continue
    return None

if __name__ == '__main__':
    port = find_available_port()
    if not port:
        print("❌ Could not find available port between 5000-5010")
        sys.exit(1)
    
    print("=" * 60)
    print("MAVProxy Backend Development Server")
    print("=" * 60)
    print()
    print(f"Backend running at: http://localhost:{port}")
    print(f"API endpoint:       http://localhost:{port}/upload_chunk")
    print()
    print("Make sure frontend is running at: http://localhost:5173")
    print()
    print("Update .env.development if using different port:")
    print(f"VITE_API_URL=http://localhost:{port}")
    print()
    print("Press Ctrl+C to stop")
    print()
    
    app.run(host='0.0.0.0', port=port, debug=True)
