"""
Vercel serverless handler for MAVExplorer Flask backend.
Routes all API requests to the Flask app.
"""
import os
import sys
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory and current directory to path so imports work
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, current_dir)
sys.path.insert(0, parent_dir)

from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import uuid
import logging
import json
import io
import csv
import gzip
import shutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import the analysis API
import mavexplorer_api

# Import Supabase manager
from supabase_client import supabase_manager

try:
    from pymavlink import mavutil
except Exception as e:
    logger.warning(f"pymavlink not available: {e}")
    mavutil = None

# Create Flask app
app = Flask(__name__)

# Vercel has a 4.5MB payload limit for serverless functions
# Set max content length to 4MB to stay safe
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024  # 4MB

# Enable CORS with explicit configuration
try:
    from flask_cors import CORS
    # Allow all origins for now (can be restricted later)
    CORS(app, 
         resources={r"/*": {
             "origins": "*",
             "methods": ["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"],
             "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
             "supports_credentials": True,
             "max_age": 3600
         }},
         send_wildcard=True,
         automatic_options=True
    )
except ImportError:
    logger.warning("flask_cors not available, CORS may not work properly")

# Explicit CORS handling for all requests
@app.before_request
def handle_preflight():
    """Handle CORS preflight requests"""
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE,PATCH'
        response.headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization')
        response.headers['Access-Control-Max-Age'] = '3600'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.status_code = 200
        return response

@app.after_request
def add_cors_headers(response):
    """Add CORS headers to all responses"""
    origin = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE,PATCH'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With'
    response.headers['Access-Control-Max-Age'] = '3600'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Vary'] = 'Origin'
    
    # Prevent caching of error responses
    if response.status_code >= 400:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.errorhandler(413)
def payload_too_large(e):
    """Handle file too large errors."""
    return jsonify({
        'error': 'Compressed file too large. Maximum compressed size is 4MB. Try enabling higher compression or use a smaller file, or run MAVProxy locally for very large files.'
    }), 413

# In-memory storage for uploads (note: Vercel instances are ephemeral)
UPLOADS = {}
# Storage for chunked uploads
CHUNK_UPLOADS = {}

@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})

# ===== Profile Endpoints =====

@app.route('/profiles', methods=['GET', 'OPTIONS'])
@app.route('/api/profiles', methods=['GET', 'OPTIONS'])
def get_profiles():
    """Get all profiles for a user"""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400
    
    profiles = supabase_manager.get_user_profiles(user_id)
    return jsonify({'profiles': profiles})

@app.route('/profiles', methods=['POST', 'OPTIONS'])
@app.route('/api/profiles', methods=['POST', 'OPTIONS'])
def create_profile():
    """Create a new profile"""
    data = request.get_json()
    user_id = data.get('user_id')
    name = data.get('name')
    description = data.get('description', '')
    
    if not user_id or not name:
        return jsonify({'error': 'user_id and name required'}), 400
    
    profile = supabase_manager.create_profile(user_id, name, description)
    if profile:
        return jsonify({'profile': profile})
    else:
        return jsonify({'error': 'failed to create profile'}), 500

@app.route('/profiles/<profile_id>', methods=['GET', 'OPTIONS'])
@app.route('/api/profiles/<profile_id>', methods=['GET', 'OPTIONS'])
def get_profile_detail(profile_id):
    """Get a specific profile"""
    profile = supabase_manager.get_profile(profile_id)
    if profile:
        return jsonify({'profile': profile})
    else:
        return jsonify({'error': 'profile not found'}), 404

@app.route('/profiles/<profile_id>', methods=['DELETE', 'OPTIONS'])
@app.route('/api/profiles/<profile_id>', methods=['DELETE', 'OPTIONS'])
def delete_profile_endpoint(profile_id):
    """Delete a profile"""
    success = supabase_manager.delete_profile(profile_id)
    if success:
        return jsonify({'status': 'deleted'})
    else:
        return jsonify({'error': 'failed to delete profile'}), 500

@app.route('/profiles/<profile_id>/analyses', methods=['GET', 'OPTIONS'])
@app.route('/api/profiles/<profile_id>/analyses', methods=['GET', 'OPTIONS'])
def get_profile_analyses(profile_id):
    """Get all analyses for a profile"""
    analyses = supabase_manager.get_analysis_results(profile_id)
    return jsonify({'analyses': analyses})


@app.route('/upload_chunk', methods=['POST', 'OPTIONS'])
@app.route('/api/upload_chunk', methods=['POST', 'OPTIONS'])
def upload_chunk():
    """Handle chunked file uploads."""
    if 'file' not in request.files:
        return jsonify({'error': 'no file uploaded'}), 400
    
    chunk_file = request.files['file']
    chunk_index = int(request.form.get('chunk_index', 0))
    total_chunks = int(request.form.get('total_chunks', 1))
    upload_id = request.form.get('upload_id')
    original_filename = request.form.get('original_filename')
    original_size = int(request.form.get('original_size', 0))
    total_size = int(request.form.get('total_size', 0))
    
    if not upload_id:
        return jsonify({'error': 'upload_id required'}), 400
    
    logger.info(f"Receiving chunk {chunk_index + 1}/{total_chunks} for upload {upload_id}")
    
    # Create temp directory for this upload
    if upload_id not in CHUNK_UPLOADS:
        tmpdir = tempfile.mkdtemp(prefix='mavexplorer_chunks_')
        CHUNK_UPLOADS[upload_id] = {
            'tmpdir': tmpdir,
            'chunks_received': [],
            'total_chunks': total_chunks,
            'original_filename': original_filename,
            'original_size': original_size,
            'total_size': total_size
        }
    
    upload_info = CHUNK_UPLOADS[upload_id]
    tmpdir = upload_info['tmpdir']
    
    # Save chunk
    chunk_path = os.path.join(tmpdir, f'chunk_{chunk_index:04d}')
    chunk_file.save(chunk_path)
    upload_info['chunks_received'].append(chunk_index)
    
    logger.info(f"Saved chunk {chunk_index}, received {len(upload_info['chunks_received'])}/{total_chunks}")
    
    # If all chunks received, reassemble and process
    if len(upload_info['chunks_received']) == total_chunks:
        logger.info(f"All chunks received for {upload_id}, reassembling...")
        
        # Reassemble compressed file
        compressed_path = os.path.join(tmpdir, original_filename + '.gz')
        try:
            with open(compressed_path, 'wb') as outfile:
                for i in range(total_chunks):
                    chunk_path = os.path.join(tmpdir, f'chunk_{i:04d}')
                    with open(chunk_path, 'rb') as infile:
                        outfile.write(infile.read())
                    # Delete chunk after reading
                    os.remove(chunk_path)
            
            logger.info(f"Reassembled compressed file: {os.path.getsize(compressed_path)} bytes")
            
            # Decompress
            decompressed_path = os.path.join(tmpdir, original_filename)
            logger.info(f"Decompressing to {decompressed_path}")
            
            with gzip.open(compressed_path, 'rb') as f_in:
                with open(decompressed_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            # Remove compressed file
            os.remove(compressed_path)
            
            logger.info(f"Decompressed successfully. Size: {os.path.getsize(decompressed_path)} bytes")
            
            # Analyze the file
            if mavutil is None:
                return jsonify({'error': 'pymavlink not installed on server'}), 500
            
            try:
                out = mavexplorer_api.analyze_file_basic(decompressed_path)
            except Exception as e:
                logger.error(f"Failed to analyze file: {e}", exc_info=True)
                return jsonify({'error': 'failed to parse log: ' + str(e)}), 500
            
            # Store results in memory and Supabase
            token = str(uuid.uuid4())
            UPLOADS[token] = {'tmpdir': tmpdir, 'path': decompressed_path, 'analysis': out}
            
            # Save to Supabase if profile_id is provided
            profile_id = request.form.get('profile_id')
            analysis_db_id = None
            
            if profile_id and supabase_manager.enabled:
                try:
                    analysis_result = supabase_manager.save_analysis_result(
                        profile_id=profile_id,
                        filename=original_filename,
                        file_size=os.path.getsize(compressed_path) if os.path.exists(compressed_path) else total_size,
                        original_size=original_size,
                        analysis_data=out
                    )
                    if analysis_result:
                        analysis_db_id = analysis_result.get('id')
                        logger.info(f"Analysis saved to Supabase: {analysis_db_id}")
                except Exception as e:
                    logger.error(f"Failed to save to Supabase: {e}")
            
            # Clean up chunk upload tracking
            del CHUNK_UPLOADS[upload_id]
            
            response_data = {
                'token': token, 
                'analysis': out,
                'profile_id': profile_id,
                'analysis_db_id': analysis_db_id
            }
            
            return jsonify(response_data)
            
        except Exception as e:
            logger.error(f"Failed to process chunks: {e}", exc_info=True)
            return jsonify({'error': f'failed to process chunks: {str(e)}'}), 500
    
    # Not all chunks received yet
    return jsonify({
        'status': 'chunk_received',
        'chunk_index': chunk_index,
        'received': len(upload_info['chunks_received']),
        'total': total_chunks
    })


@app.route('/analyze', methods=['POST', 'OPTIONS'])
@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Analyze uploaded MAVLink log file."""
    if 'file' not in request.files:
        return jsonify({'error': 'no file uploaded'}), 400
    
    f = request.files['file']
    is_compressed = request.form.get('compressed') == 'true'
    original_filename = request.form.get('original_filename', f.filename)
    original_size = request.form.get('original_size', '0')
    
    logger.info(f"Received file: {f.filename}, compressed: {is_compressed}, original: {original_filename}")
    
    fname = secure_filename(original_filename)
    tmpdir = tempfile.mkdtemp(prefix='mavexplorer_')
    
    # If file is compressed, decompress it first
    if is_compressed and f.filename.endswith('.gz'):
        compressed_path = os.path.join(tmpdir, secure_filename(f.filename))
        f.save(compressed_path)
        
        # Decompress
        path = os.path.join(tmpdir, fname)
        logger.info(f"Decompressing {compressed_path} to {path}")
        
        try:
            with gzip.open(compressed_path, 'rb') as f_in:
                with open(path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            # Remove compressed file to save space
            os.remove(compressed_path)
            logger.info(f"Decompressed successfully. Size: {os.path.getsize(path)} bytes")
        except Exception as e:
            logger.error(f"Decompression failed: {e}", exc_info=True)
            return jsonify({'error': f'failed to decompress file: {str(e)}'}), 500
    else:
        # Save uncompressed file directly
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

@app.route('/download', methods=['GET', 'OPTIONS'])
@app.route('/api/download', methods=['GET', 'OPTIONS'])
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

@app.route('/timeseries', methods=['GET', 'OPTIONS'])
@app.route('/api/timeseries', methods=['GET', 'OPTIONS'])
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

@app.route('/graphs', methods=['GET', 'OPTIONS'])
@app.route('/api/graphs', methods=['GET', 'OPTIONS'])
def graphs():
    """Return list of predefined graphs."""
    try:
        defs = mavexplorer_api.load_graph_definitions()
        out = []
        for g in defs:
            out.append({
                'name': g.name,
                'description': g.description if hasattr(g, 'description') else '',
                'expressions': g.expressions,
                'filename': g.filename if hasattr(g, 'filename') else ''
            })
        return jsonify({'graphs': out})
    except Exception as e:
        logger.error(f"Failed to load graphs: {e}", exc_info=True)
        return jsonify({'error': 'failed to load graphs: ' + str(e)}), 500

@app.route('/graph', methods=['GET', 'OPTIONS'])
@app.route('/api/graph', methods=['GET', 'OPTIONS'])
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

@app.route('/ping', methods=['GET'])
@app.route('/api/ping', methods=['GET'])
def ping():
    """Ping endpoint for health checks."""
    return jsonify({'ok': True})

@app.route('/messages', methods=['GET'])
@app.route('/api/messages', methods=['GET'])
def list_messages():
    """List all message types in the log."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    
    analysis = UPLOADS[token]['analysis']
    return jsonify({'messages': analysis['messages']})

@app.route('/dump', methods=['GET'])
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

@app.route('/stats', methods=['GET'])
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

@app.route('/params', methods=['GET'])
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

@app.route('/flight_modes', methods=['GET'])
@app.route('/api/flight_modes', methods=['GET'])
def get_flight_modes():
    """Extract flight mode changes from the log."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error': 'valid token required'}), 400
    
    path = UPLOADS[token]['path']
    try:
        mlog = mavutil.mavlink_connection(path)
        
        # Get the flight mode list using mavutil's built-in method
        flightmodes = mlog.flightmode_list()
        
        # Convert to our format: [(mode_name, start_time, end_time), ...]
        modes = []
        for (mode_name, t1, t2) in flightmodes:
            modes.append({
                'mode': mode_name,
                'start': t1,
                'end': t2,
                'duration': t2 - t1
            })
        
        return jsonify({'modes': modes})
    except Exception as e:
        logger.error(f"Failed to extract flight modes: {e}", exc_info=True)
        return jsonify({'error': 'failed to extract flight modes: ' + str(e)}), 500

# Export the Flask app for Vercel
# Vercel's Python runtime expects a variable named 'app'
# The app is already configured with CORS and request handlers above

# For Vercel serverless compatibility
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
