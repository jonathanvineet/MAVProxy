import os
import sys
import tempfile
from pymavlink import mavutil
import uuid

# Simplified version for Vercel deployment
# MAVProxy modules are not available in serverless environment

def load_graph_definitions():
    """Load predefined graphs - simplified for Vercel deployment."""
    # Return empty list since MAVProxy graph definitions aren't available in serverless
    return []


def analyze_file_basic(path):
    """Scan a log file and return a summary of messages and numeric fields."""
    # Stream the file and only keep counts and a set of numeric fields per message
    msgs = {}
    try:
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match()
            if m is None:
                break
            name = m.get_type()
            info = msgs.get(name)
            if info is None:
                info = {'count': 0, 'fields': set()}
                msgs[name] = info
            info['count'] += 1
            for k, v in m.to_dict().items():
                if k == '_time':
                    continue
                if isinstance(v, (int, float)):
                    info['fields'].add(k)
    except Exception:
        # propagate for caller to handle and report
        raise

    out = {'messages': {}}
    for name, info in msgs.items():
        fields = sorted(list(info['fields']))
        out['messages'][name] = {'count': info['count'], 'fields': fields}

    return out


def evaluate_graph_on_file(graph_def, path, decimate=1):
    """Evaluate a GraphDefinition over the log file - simplified for Vercel."""
    # Simplified implementation without MAVProxy dependencies
    return {'name': graph_def.name if hasattr(graph_def, 'name') else 'unknown', 'series': {}}


def create_upload(path):
    """Create an upload entry (token) referencing an analysis directory."""
    token = str(uuid.uuid4())
    tmpdir = os.path.dirname(path)
    return token, tmpdir
