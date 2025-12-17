from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os, tempfile, json, uuid
from flask import make_response
import logging

# enable CORS (allow browser direct uploads during development)
try:
    from flask_cors import CORS
    has_flask_cors = True
except Exception:
    has_flask_cors = False
try:
    from server import mavexplorer_api
except ModuleNotFoundError:
    # When running this script directly (python server/analyze_server.py),
    # sys.path[0] is the server/ folder, so the package `server` isn't
    # importable. Fall back to importing the local module directly.
    import mavexplorer_api
    mavexplorer_api = mavexplorer_api

app = Flask(__name__)

# Prevent extremely large uploads from exhausting server memory (tunable)
# Set to 200MB by default for development; adjust as needed for large logs.
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

# configure basic logging to a file for debugging large-upload crashes
logging.basicConfig(level=logging.INFO, filename='/tmp/analyze_server_runtime.log',
                    format='%(asctime)s %(levelname)s %(message)s')

if has_flask_cors:
    CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def add_cors_headers(response):
    # Ensure minimal CORS headers are present even if Flask-Cors isn't installed
    response.headers.setdefault('Access-Control-Allow-Origin', '*')
    response.headers.setdefault('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.setdefault('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

try:
    from pymavlink import mavutil
except Exception as e:
    mavutil = None

# uploaded analysis state: token -> { tmpdir, path, analysis }
UPLOADS = {}

@app.route('/api/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({'error':'no file uploaded'}), 400
    f = request.files['file']
    fname = secure_filename(f.filename)
    tmpdir = tempfile.mkdtemp(prefix='mavexplorer_')
    path = os.path.join(tmpdir, fname)
    f.save(path)

    if mavutil is None:
        return jsonify({'error':'pymavlink not installed on server'}), 500

    # perform a basic analysis using helper (collect message types and numeric fields)
    try:
        out = mavexplorer_api.analyze_file_basic(path)
    except Exception as e:
        logging.error(f"Failed to analyze file: {e}", exc_info=True)
        return jsonify({'error':'failed to parse log: '+str(e)}), 500

    # register upload token so subsequent requests can reference this analysis
    token = str(uuid.uuid4())
    UPLOADS[token] = { 'tmpdir': tmpdir, 'path': path, 'analysis': out }
    return jsonify({'token': token, 'analysis': out})


@app.route('/api/download')
def download():
    """Generate and download CSV for a specific message type on demand."""
    token = request.args.get('token')
    msg = request.args.get('msg')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    if not msg:
        return jsonify({'error':'msg param required'}), 400
    
    path = UPLOADS[token]['path']
    analysis = UPLOADS[token]['analysis']
    
    if msg not in analysis['messages']:
        return jsonify({'error':f'message type {msg} not found'}), 404
    
    info = analysis['messages'][msg]
    if not info['fields']:
        return jsonify({'error':'no numeric fields in message'}), 400
    
    # Generate CSV on-the-fly using streaming to avoid memory issues
    import csv
    import io
    
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
                t = t/1e6
            row = [t] + [m.to_dict().get(f, '') for f in info['fields']]
            writer.writerow(row)
    except Exception as e:
        logging.error(f"CSV generation failed: {e}", exc_info=True)
        return jsonify({'error':'CSV generation failed: '+str(e)}), 500
    
    # Return as downloadable file
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'{msg}.csv'
    )


@app.route('/api/graphs')
def graphs():
    """Return list of predefined graphs (name and expressions)."""
    defs = mavexplorer_api.load_graph_definitions()
    out = []
    for g in defs:
        out.append({'name': g.name, 'expressions': g.expressions, 'filename': g.filename})
    return jsonify({'graphs': out})


@app.route('/api/ping')
def ping():
    return jsonify({'ok': True})


@app.route('/api/graph')
def graph_eval():
    """Evaluate a predefined graph against an uploaded file.
    params: token, name (graph name), decimate (optional int)
    """
    token = request.args.get('token')
    name = request.args.get('name')
    decimate = int(request.args.get('decimate') or 1)
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    if not name:
        return jsonify({'error':'name param required'}), 400
    defs = mavexplorer_api.load_graph_definitions()
    match = None
    for g in defs:
        if g.name == name:
            match = g
            break
    if match is None:
        return jsonify({'error':'graph not found'}), 404
    path = UPLOADS[token]['path']
    try:
        res = mavexplorer_api.evaluate_graph_on_file(match, path, decimate=decimate)
    except Exception as e:
        return jsonify({'error':'failed to evaluate graph: '+str(e)}), 500
    return jsonify(res)


@app.route('/api/timeseries')
def timeseries():
    """Return timeseries for a given message type and field from an uploaded file.
    params: token, msg, field, decimate
    """
    token = request.args.get('token')
    msg = request.args.get('msg')
    field = request.args.get('field')
    decimate = int(request.args.get('decimate') or 1)
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    if not msg or not field:
        return jsonify({'error':'msg and field required'}), 400
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
                # still update last-seen for completeness
                continue
            t = getattr(m, 'time_usec', None) or getattr(m, 'time', None) or getattr(m, '_timestamp', None)
            if t is not None and t > 1e12:
                t = t/1e6
            v = m.to_dict().get(field)
            if v is None:
                continue
            if idx % decimate == 0:
                series.append({'t': t, 'v': v})
            idx += 1
    except Exception as e:
        return jsonify({'error':'failed to extract timeseries: '+str(e)}), 500
    return jsonify({'msg': msg, 'field': field, 'series': series})


@app.route('/api/params')
def get_params():
    """Get all parameters from the uploaded log file."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    
    path = UPLOADS[token]['path']
    try:
        params = {}
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match(type='PARM')
            if m is None:
                break
            params[m.Name] = m.Value
        mlog.rewind()
        return jsonify({'params': params, 'count': len(params)})
    except Exception as e:
        logging.error(f"Failed to extract params: {e}", exc_info=True)
        return jsonify({'error':'failed to extract params: '+str(e)}), 500


@app.route('/api/param_changes')
def get_param_changes():
    """Get parameter changes throughout the log."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    
    path = UPLOADS[token]['path']
    try:
        changes = []
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match(type='PARM')
            if m is None:
                break
            t = getattr(m, '_timestamp', 0)
            changes.append({
                'timestamp': t,
                'name': m.Name,
                'value': m.Value
            })
        mlog.rewind()
        return jsonify({'changes': changes, 'count': len(changes)})
    except Exception as e:
        logging.error(f"Failed to extract param changes: {e}", exc_info=True)
        return jsonify({'error':'failed to extract param changes: '+str(e)}), 500


@app.route('/api/stats')
def get_stats():
    """Get statistics about the log file."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    
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
        logging.error(f"Failed to get stats: {e}", exc_info=True)
        return jsonify({'error':'failed to get stats: '+str(e)}), 500


@app.route('/api/flight_modes')
def get_flight_modes():
    """Extract flight mode changes from the log."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    
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
        logging.error(f"Failed to extract flight modes: {e}", exc_info=True)
        return jsonify({'error':'failed to extract flight modes: '+str(e)}), 500


@app.route('/api/messages')
def list_messages():
    """List all message types in the log with their counts and fields."""
    token = request.args.get('token')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    
    analysis = UPLOADS[token]['analysis']
    return jsonify({'messages': analysis['messages']})


@app.route('/api/dump')
def dump_messages():
    """Dump raw messages of a specific type with optional limit."""
    token = request.args.get('token')
    msg_type = request.args.get('type')
    limit = int(request.args.get('limit', 100))
    
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    if not msg_type:
        return jsonify({'error':'type param required'}), 400
    
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
            messages.append({
                'timestamp': t,
                'data': m.to_dict()
            })
            count += 1
        
        return jsonify({'type': msg_type, 'messages': messages, 'count': len(messages)})
    except Exception as e:
        logging.error(f"Failed to dump messages: {e}", exc_info=True)
        return jsonify({'error':'failed to dump messages: '+str(e)}), 500


if __name__ == '__main__':
    # Run without the reloader and with threading enabled to avoid child-reloader
    # killing the parent process on heavy loads. This makes crash traces
    # appear in the single process log and prevents confusing `suspended` jobs.
    app.run(host='0.0.0.0', port=3030, debug=False, threaded=True, use_reloader=False)
