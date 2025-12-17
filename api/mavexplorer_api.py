import os
import sys
import tempfile
from pymavlink import mavutil
import uuid
import re

# Simple GraphDefinition class for Vercel (no MAVProxy dependency)
class GraphDefinition:
    def __init__(self, name, expression, description='', expressions=None, filename=''):
        self.name = name
        self.expression = expression
        self.description = description
        self.expressions = expressions or [expression]
        self.filename = filename

def load_graph_definitions():
    """Load predefined graphs - returns empty list in serverless environment"""
    # In Vercel serverless environment, we don't have access to MAVProxy graph files
    # Return empty list - users can still use custom graphs
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


def evaluate_expression(expression, mlog, decimate=1):
    """Evaluate a single expression against the log file."""
    series = []
    mlog.rewind()
    idx = 0
    
    # Parse the expression to find message types
    # Simple extraction of message.field patterns
    msg_pattern = r'(\w+)\.(\w+)'
    matches = re.findall(msg_pattern, expression)
    
    if not matches:
        return series
    
    # For now, handle simple message.field expressions
    # More complex expressions with functions would need proper evaluation
    msg_type = matches[0][0]
    field = matches[0][1]
    
    while True:
        m = mlog.recv_match(type=msg_type)
        if m is None:
            break
        
        try:
            t = getattr(m, '_timestamp', None)
            if t is None:
                continue
            
            # Get the field value
            v = getattr(m, field, None)
            if v is None:
                v = m.to_dict().get(field)
            
            if v is not None and idx % decimate == 0:
                series.append({'t': t, 'v': float(v)})
            idx += 1
        except:
            continue
    
    return series


def evaluate_graph_on_file(graph_def, path, decimate=1):
    """Evaluate a GraphDefinition over the log file."""
    result = {
        'name': graph_def.name,
        'description': graph_def.description if hasattr(graph_def, 'description') else '',
        'series': {}
    }
    
    try:
        mlog = mavutil.mavlink_connection(path)
        
        # Evaluate each expression in the graph
        for expr in graph_def.expressions:
            # Split expression into individual fields
            fields = expr.strip().split()
            
            for field_expr in fields:
                # Skip empty strings
                if not field_expr:
                    continue
                
                # Evaluate this field
                series = evaluate_expression(field_expr, mlog, decimate)
                if series:
                    result['series'][field_expr] = series
        
        return result
    except Exception as e:
        print(f"Error evaluating graph: {e}")
        return result


def create_upload(path):
    """Create an upload entry (token) referencing an analysis directory."""
    token = str(uuid.uuid4())
    tmpdir = os.path.dirname(path)
    return token, tmpdir
