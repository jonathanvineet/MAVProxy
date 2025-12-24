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

def get_port():
    """Get port from env or default to 5000.

    Avoid auto-incrementing ports when the Flask reloader restarts,
    which can cause the frontend to target a different port.
    """
    env_port = os.getenv("BACKEND_PORT") or os.getenv("PORT")
    try:
        return int(env_port) if env_port else 5000
    except ValueError:
        return 5000

if __name__ == '__main__':
    port = get_port()
    
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
    
    # Use a fixed port so the frontend .env matches reliably
    # Bind on 0.0.0.0 for devcontainer/docker access; VS Code will forward the port.
    app.run(host='0.0.0.0', port=port, debug=True)
