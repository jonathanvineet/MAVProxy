"""
Vercel serverless handler for MAVExplorer Flask backend.
Routes all API requests to the Flask app.
"""
import os
import sys
import tempfile
from pathlib import Path

# Add parent directory to path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import uuid
import logging
import json
import io
import csv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import the analysis API
try:
    from server import mavexplorer_api
except ModuleNotFoundError:
    import mavexplorer_api

try:
    from pymavlink import mavutil
except Exception as e:
    logger.warning(f"pymavlink not available: {e}")
    mavutil = None

# Create Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

# Enable CORS
try:
    from flask_cors import CORS
    CORS(app, resources={r"/*": {"origins": "*"}})
except:
    pass

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE'
    return response

# In-memory storage for uploads (note: Vercel instances are ephemeral)
UPLOADS = {}

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Analyze uploaded MAVLink log file."""
    if 'file' not in request.files:
        return jsonify({'error': 'no file uploaded'}), 400
    
    f = request.files['file']
    fname = secure_filename(f.filename)
    tmpdir = tempfile.mkdtemp(prefix='mavexplorer_')
    path = os.path.join(tmpdir, fname)
    f.save(path)
    
    if mavutil is None:
        return jsonify({'error': 'pymavlink not installed on server'}), 500
    
    try:
        out = mavexplorer_api.analyze_file_basic(path)
    except Exception as e:
        logger.error(f"Failed to analyze file: {e}", exc_info=True)
        return jsonify({'error': 'failed to parse log: ' + str(e)}), 500
    
    token = str(uuid.uuid4())
    UPLOADS[token] = {'tmpdir': tmpdir, 'path': path, 'analysis': out}
    return jsonify({'token': token, 'analysis': out})

@app.route('/api/download', methods=['GET'])
def download():
    """Generate and download CSV for a specific message type."""
    token = request.args.get('token')
    msg = request.args.get('msg')
    
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    if not msg:
        return jsonify({'error': 'msg param required'}), 400
    
    path = UPLOADS[token]['path']
    analysis = UPLOADS[token]['analysis']
    
    if msg not in analysis['messages']:
        return jsonify({'error': f'message type {msg} not found'}), 404
    
    info = analysis['messages'][msg]
    if not info['fields']:
        return jsonify({'error': 'no numeric fields in message'}), 400
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['_time'] + info['fields'])
    
    try:
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match(type=msg)
            if m is None:
                break
            t = getattr(m, 'time_usec', None) or getattr(m, 'time', None) or getattr(m, '_timestamp', None)
            if t is not None and t > 1e12:
                t = t / 1e6
            row = [t] + [m.to_dict().get(f, '') for f in info['fields']]
            writer.writerow(row)
    except Exception as e:
        logger.error(f"CSV generation failed: {e}", exc_info=True)
        return jsonify({'error': 'CSV generation failed: ' + str(e)}), 500
    
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'{msg}.csv'
    )

@app.route('/api/timeseries', methods=['GET'])
def timeseries():
    """Return timeseries for a given message type and field."""
    token = request.args.get('token')
    msg = request.args.get('msg')
    field = request.args.get('field')
    decimate = int(request.args.get('decimate') or 1)
    
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    if not msg or not field:
        return jsonify({'error': 'msg and field required'}), 400
    
    path = UPLOADS[token]['path']
    
    try:
        series = []
        mlog = mavutil.mavlink_connection(path)
        idx = 0
        while True:
            m = mlog.recv_match()
            if m is None:
                break
            if m.get_type() != msg:
                continue
            t = getattr(m, 'time_usec', None) or getattr(m, 'time', None) or getattr(m, '_timestamp', None)
            if t is not None and t > 1e12:
                t = t / 1e6
            v = m.to_dict().get(field)
            if v is None:
                continue
            if idx % decimate == 0:
                series.append({'t': t, 'v': v})
            idx += 1
    except Exception as e:
        logger.error(f"Failed to extract timeseries: {e}", exc_info=True)
        return jsonify({'error': 'failed to extract timeseries: ' + str(e)}), 500
    
    return jsonify({'msg': msg, 'field': field, 'series': series})

@app.route('/api/graphs', methods=['GET'])
def graphs():
    """Return list of predefined graphs."""
    try:
        defs = mavexplorer_api.load_graph_definitions()
        out = []
        for g in defs:
            out.append({'name': g.name, 'expressions': g.expressions, 'filename': g.filename})
        return jsonify({'graphs': out})
    except Exception as e:
        logger.error(f"Failed to load graphs: {e}", exc_info=True)
        return jsonify({'error': 'failed to load graphs: ' + str(e)}), 500

@app.route('/api/graph', methods=['GET'])
def graph_eval():
    """Evaluate a predefined graph against an uploaded file."""
    token = request.args.get('token')
    name = request.args.get('name')
    decimate = int(request.args.get('decimate') or 1)
    
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    if not name:
        return jsonify({'error': 'name param required'}), 400
    
    try:
        defs = mavexplorer_api.load_graph_definitions()
        match = None
        for g in defs:
            if g.name == name:
                match = g
                break
        if match is None:
            return jsonify({'error': 'graph not found'}), 404
        
        path = UPLOADS[token]['path']
        res = mavexplorer_api.evaluate_graph_on_file(match, path, decimate=decimate)
        return jsonify(res)
    except Exception as e:
        logger.error(f"Failed to evaluate graph: {e}", exc_info=True)
        return jsonify({'error': 'failed to evaluate graph: ' + str(e)}), 500

@app.route('/api/ping', methods=['GET'])
def ping():
    """Ping endpoint for health checks."""
    return jsonify({'ok': True})

@app.route('/api/messages', methods=['GET'])
def list_messages():
    """List all message types in the log."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    
    analysis = UPLOADS[token]['analysis']
    return jsonify({'messages': analysis['messages']})

@app.route('/api/dump', methods=['GET'])
def dump_messages():
    """Dump raw messages of a specific type."""
    token = request.args.get('token')
    msg_type = request.args.get('type')
    limit = int(request.args.get('limit', 100))
    
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    if not msg_type:
        return jsonify({'error': 'type param required'}), 400
    
    path = UPLOADS[token]['path']
    try:
        messages = []
        mlog = mavutil.mavlink_connection(path)
        count = 0
        
        while count < limit:
            m = mlog.recv_match(type=msg_type)
            if m is None:
                break
            t = getattr(m, '_timestamp', None)
            messages.append({'timestamp': t, 'data': m.to_dict()})
            count += 1
        
        return jsonify({'type': msg_type, 'messages': messages, 'count': len(messages)})
    except Exception as e:
        logger.error(f"Failed to dump messages: {e}", exc_info=True)
        return jsonify({'error': 'failed to dump messages: ' + str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics about the log file."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    
    path = UPLOADS[token]['path']
    analysis = UPLOADS[token]['analysis']
    
    try:
        mlog = mavutil.mavlink_connection(path)
        first_timestamp = None
        last_timestamp = None
        total_messages = 0
        
        while True:
            m = mlog.recv_match()
            if m is None:
                break
            total_messages += 1
            t = getattr(m, '_timestamp', None)
            if t is not None:
                if first_timestamp is None:
                    first_timestamp = t
                last_timestamp = t
        
        duration = (last_timestamp - first_timestamp) if (first_timestamp and last_timestamp) else 0
        
        return jsonify({
            'total_messages': total_messages,
            'message_types': len(analysis['messages']),
            'first_timestamp': first_timestamp,
            'last_timestamp': last_timestamp,
            'duration_seconds': duration,
            'messages_per_type': {k: v['count'] for k, v in analysis['messages'].items()}
        })
    except Exception as e:
        logger.error(f"Failed to get stats: {e}", exc_info=True)
        return jsonify({'error': 'failed to get stats: ' + str(e)}), 500

@app.route('/api/params', methods=['GET'])
def get_params():
    """Get all parameters from the log file."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    
    path = UPLOADS[token]['path']
    try:
        params = {}
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match(type='PARM')
            if m is None:
                break
            params[m.Name] = m.Value
        
        return jsonify({'params': params, 'count': len(params)})
    except Exception as e:
        logger.error(f"Failed to extract params: {e}", exc_info=True)
        return jsonify({'error': 'failed to extract params: ' + str(e)}), 500

# Export for Vercel
import asyncio
from asgiref.sync import async_to_sync

async def handler(request):
    """ASGI handler for Vercel."""
    return app(request.environ, request.start_response)
