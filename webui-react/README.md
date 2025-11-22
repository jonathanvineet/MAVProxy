# MAVExplorer WebUI

This is a minimal React frontend that allows uploading a MAVLink `.bin` log file and requesting analysis from a local server. It displays available message types and numeric fields and plots the selected timeseries. It can also download CSV for a selected message.

Quick start (frontend):

```bash
cd webui-react
npm install
npm run dev
```

Server: see `server/README` or run the Flask server in `server/analyze_server.py`.
