import os
import sys
import tempfile
from pymavlink import mavutil
from pymavlink.mavextra import *
import uuid
import xml.etree.ElementTree as ET
import re

# Add MAVProxy to path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

# Try to import GraphDefinition from local copy first (for Vercel deployment)
try:
    from graphdefinition import GraphDefinition
except ImportError:
    # Fallback to MAVProxy directory structure
    from MAVProxy.modules.lib.graphdefinition import GraphDefinition

def load_graph_definitions():
    """Load predefined graphs from mavgraphs.xml"""
    # Find the mavgraphs.xml file - check current directory first (for Vercel deployment)
    xml_path = os.path.join(current_dir, 'mavgraphs.xml')
    
    # Fallback to MAVProxy directory structure
    if not os.path.exists(xml_path):
        xml_path = os.path.join(parent_dir, 'MAVProxy', 'tools', 'graphs', 'mavgraphs.xml')
    
    if not os.path.exists(xml_path):
        return []
    
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        graphs = []
        
        for graph_elem in root.findall('graph'):
            name = graph_elem.get('name', 'Unnamed')
            description_elem = graph_elem.find('description')
            description = description_elem.text.strip() if description_elem is not None and description_elem.text else ''
            
            expressions = []
            for expr_elem in graph_elem.findall('expression'):
                if expr_elem.text:
                    expressions.append(expr_elem.text.strip())
            
            if expressions:
                # Create GraphDefinition for each expression set
                graphs.append(GraphDefinition(name, expressions[0], description, expressions, xml_path))
        
        return graphs
    except Exception as e:
        print(f"Error loading graphs: {e}")
        return []


def extract_flight_modes(path):
    """Extract flight mode changes from the log file."""
    try:
        mlog = mavutil.mavlink_connection(path)
        flightmodes = mlog.flightmode_list()
        
        modes = []
        for (mode_name, t1, t2) in flightmodes:
            modes.append({
                'mode': mode_name,
                'start': t1,
                'end': t2,
                'duration': t2 - t1
            })
        return modes
    except Exception as e:
        print(f"Failed to extract flight modes: {e}")
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
    
    # Also extract flight modes during initial analysis
    out['flight_modes'] = extract_flight_modes(path)

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
        # Each expression may contain multiple message.field pairs
        for expr in graph_def.expressions:
            if not expr or not expr.strip():
                continue
            
            # Find all message.field patterns in the expression
            msg_field_pattern = r'(\w+)\.(\w+)'
            matches = re.findall(msg_field_pattern, expr)
            
            for msg_type, field in matches:
                field_expr = f"{msg_type}.{field}"
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
