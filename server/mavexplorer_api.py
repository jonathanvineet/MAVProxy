import os
import sys
import tempfile
import pkg_resources
from lxml import objectify
from pymavlink import mavutil

# Ensure the repository root is on sys.path so `MAVProxy` package imports work
# when running `python server/analyze_server.py` directly from the repo root.
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

try:
    import MAVProxy.tools.MAVExplorer as me
    from MAVProxy.modules.lib.graphdefinition import GraphDefinition
except ModuleNotFoundError:
    # If running in an environment where package layout differs, try local import
    try:
        import MAVProxy.MAVProxy.tools.MAVExplorer as me
        from MAVProxy.MAVProxy.modules.lib.graphdefinition import GraphDefinition
    except Exception:
        # re-raise the original error for visibility
        raise

import uuid


def load_graph_definitions():
    """Load predefined graphs from MAVProxy/tools/graphs and return list of GraphDefinition"""
    defs = []
    try:
        dlist = pkg_resources.resource_listdir("MAVProxy", "tools/graphs")
        for f in dlist:
            raw = pkg_resources.resource_stream("MAVProxy", "tools/graphs/%s" % f).read()
            try:
                xml = raw.decode('utf-8')
            except Exception:
                xml = raw
            graphs = me.load_graph_xml(xml, f, load_all=True)
            if graphs:
                defs.extend(graphs)
    except Exception:
        # fallback: not a package install (e.g. running from source)
        import pkgutil
        for f in ["ekf3Graphs.xml", "ekfGraphs.xml", "mavgraphs.xml", "mavgraphs2.xml"]:
            try:
                raw = pkgutil.get_data('MAVProxy', 'tools//graphs//' + f)
                if raw is None:
                    continue
                try:
                    xml = raw.decode('utf-8')
                except Exception:
                    xml = raw
                graphs = me.load_graph_xml(xml, f, load_all=True)
                if graphs:
                    defs.extend(graphs)
            except Exception:
                continue
    return defs


def analyze_file_basic(path):
    """Scan a log file and return a summary of messages and numeric fields."""
    msgs = {}
    try:
        mlog = mavutil.mavlink_connection(path)
        while True:
            m = mlog.recv_match()
            if m is None:
                break
            name = m.get_type()
            d = {}
            t = getattr(m, 'time_usec', None) or getattr(m, 'time', None) or getattr(m, '_timestamp', None)
            if t is not None and t > 1e12:
                t = t/1e6
            d['_time'] = t
            for k,v in m.to_dict().items():
                if isinstance(v, (int, float)):
                    d[k] = v
            msgs.setdefault(name, []).append(d)
    except Exception as e:
        raise

    out = {'messages': {}}
    for name, rows in msgs.items():
        fields = set()
        for r in rows:
            fields.update([k for k in r.keys() if k != '_time'])
        fields = sorted(list(fields))
        out['messages'][name] = {'count': len(rows), 'fields': fields}

    return out


def evaluate_graph_on_file(graph_def, path, decimate=1):
    """Evaluate a GraphDefinition over the log file and return series for each expression.
    decimate: keep only every Nth point to limit size"""
    series = {expr: [] for expr in graph_def.expressions}
    messages = {}
    try:
        mlog = mavutil.mavlink_connection(path)
        idx = 0
        while True:
            m = mlog.recv_match()
            if m is None:
                break
            name = m.get_type()
            # update last-seen messages mapping
            mavutil.add_message(messages, name, m)
            # timestamp
            t = getattr(m, '_timestamp', None) or getattr(m, 'time_usec', None) or getattr(m, 'time', None)
            if t is not None and t > 1e12:
                t = t/1e6
            # evaluate expressions
            for expr in graph_def.expressions:
                try:
                    val = mavutil.evaluate_expression(expr, messages, nocondition=True)
                except Exception:
                    val = None
                if val is None:
                    continue
                if idx % decimate == 0:
                    series[expr].append({'t': t, 'v': val})
            idx += 1
    except Exception as e:
        raise
    return {'name': graph_def.name, 'series': series}


def create_upload(path):
    """Create an upload entry (token) referencing an analysis directory."""
    token = str(uuid.uuid4())
    tmpdir = os.path.dirname(path)
    return token, tmpdir
