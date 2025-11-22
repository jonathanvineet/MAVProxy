from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os, tempfile, json, uuid

try:
    from server import mavexplorer_api
except ModuleNotFoundError:
    # When running this script directly (python server/analyze_server.py),
    # sys.path[0] is the server/ folder, so the package `server` isn't
    # importable. Fall back to importing the local module directly.
    import mavexplorer_api
    mavexplorer_api = mavexplorer_api

app = Flask(__name__)

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
        return jsonify({'error':'failed to parse log: '+str(e)}), 500

    # Save CSVs into temp for download endpoint
    # create CSVs in tmpdir/csv for convenience (we'll align fields per timestamp)
    csv_dir = os.path.join(tmpdir, 'csv')
    os.makedirs(csv_dir, exist_ok=True)
    import csv
    for name, info in out['messages'].items():
        if not info['fields']:
            continue
        csv_path = os.path.join(csv_dir, f"{name}.csv")
        # do a quick second pass to fill CSV per message type
        # we stream the file and build a time->fields map
        times = {}
        try:
            mlog = mavutil.mavlink_connection(path)
            for m in iter(lambda: mlog.recv_match(), None):
                if m is None:
                    break
                if m.get_type() != name:
                    continue
                t = getattr(m, 'time_usec', None) or getattr(m, 'time', None) or getattr(m, '_timestamp', None)
                if t is not None and t > 1e12:
                    t = t/1e6
                rowvals = {}
                for k,v in m.to_dict().items():
                    if k in info['fields']:
                        rowvals[k] = v
                if t is None:
                    continue
                times.setdefault(t, {})
                times[t].update(rowvals)
        except Exception:
            # if streaming fails, skip CSV for this message
            continue
        with open(csv_path, 'w', newline='') as fh:
            writer = csv.writer(fh)
            writer.writerow(['_time'] + info['fields'])
            for t in sorted(times.keys()):
                row = [t] + [times[t].get(f, '') for f in info['fields']]
                writer.writerow(row)

    # register upload token so subsequent requests can reference this analysis
    token = str(uuid.uuid4())
    UPLOADS[token] = { 'tmpdir': tmpdir, 'path': path, 'analysis': out }
    return jsonify({'token': token, 'analysis': out})


@app.route('/api/download')
def download():
    # expects ?token=TOKEN&msg=MSG
    token = request.args.get('token')
    msg = request.args.get('msg')
    if not token or token not in UPLOADS:
        return jsonify({'error':'valid token required'}), 400
    if not msg:
        return jsonify({'error':'msg param required'}), 400
    csv_path = os.path.join(UPLOADS[token]['tmpdir'], 'csv', f"{msg}.csv")
    if not os.path.exists(csv_path):
        return jsonify({'error':'CSV not found; re-run analysis'}), 404
    return send_file(csv_path, as_attachment=True)


@app.route('/api/graphs')
def graphs():
    """Return list of predefined graphs (name and expressions)."""
    defs = mavexplorer_api.load_graph_definitions()
    out = []
    for g in defs:
        out.append({'name': g.name, 'expressions': g.expressions, 'filename': g.filename})
    return jsonify({'graphs': out})


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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3030, debug=True)
