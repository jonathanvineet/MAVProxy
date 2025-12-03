# MAVExplorer Web Application

A complete web-based implementation of MAVExplorer for analyzing MAVLink .bin log files.

## Features

This web application provides ALL the major features of the desktop MAVExplorer:

### ✅ Core Features Implemented

1. **File Upload & Analysis**
   - Upload .bin log files (up to 200MB)
   - Automatic message type detection
   - Field extraction for numeric data
   - Progress tracking during upload

2. **Simple Graphing**
   - Select any message type and field
   - Real-time visualization with Chart.js
   - Decimation support for large datasets
   - CSV export for any message type

3. **Predefined Graphs**
   - Browse all predefined graph definitions from MAVProxy
   - Multi-series plots with custom expressions
   - Configurable decimation (1, 5, 10, 50, 100)
   - Color-coded series with legends

4. **Parameters Viewer**
   - View all parameters from the log
   - Search/filter parameters by name
   - High-precision value display

5. **Statistics**
   - Total message count
   - Number of message types
   - Log duration and timestamps
   - Messages per type breakdown

6. **Message Dump**
   - Inspect raw message data
   - Select message type and limit
   - JSON formatted output with timestamps

### 🔧 Technical Implementation

**Backend (Flask API)**
- **Port:** 3030
- **Endpoints:**
  - `POST /api/analyze` - Upload and analyze log files
  - `GET /api/graphs` - List predefined graph definitions
  - `GET /api/graph` - Evaluate predefined graph
  - `GET /api/timeseries` - Get time series data
  - `GET /api/download` - Generate and download CSV
  - `GET /api/params` - Get all parameters
  - `GET /api/param_changes` - Get parameter changes
  - `GET /api/stats` - Get log statistics
  - `GET /api/flight_modes` - Get flight mode changes
  - `GET /api/messages` - List message types
  - `GET /api/dump` - Dump raw messages
  - `GET /api/ping` - Health check

**Frontend (React + Vite)**
- **Port:** 5173
- **Features:**
  - Tabbed interface for different views
  - File upload with progress tracking
  - Interactive charts with Chart.js
  - Responsive design
  - Error handling and loading states

**Optimizations:**
- Streaming CSV generation (no memory exhaustion)
- On-demand CSV creation (not pre-generated)
- Decimation support for large datasets
- Proper error handling and logging
- CORS enabled for development

## Running the Application

### Start Backend Server
```bash
cd /Users/vine/elco/MAVProxy
source .venv/bin/activate
python server/analyze_server.py
```

### Start Frontend Server
```bash
cd /Users/vine/elco/MAVProxy/webui-react
npm run dev
```

### Access the Application
Open http://127.0.0.1:5173 in your browser

## Usage

1. **Upload a Log File**
   - Click "Choose File" and select a .bin log file
   - Click "Analyze" to upload and process
   - Wait for analysis to complete

2. **Explore Your Data**
   - **Simple Graph Tab:** Quick plotting of any message field
   - **Predefined Graphs Tab:** Use MAVProxy's graph definitions
   - **Parameters Tab:** View and search all parameters
   - **Statistics Tab:** See log overview and statistics
   - **Message Dump Tab:** Inspect raw message data

3. **Export Data**
   - Click "Download CSV" in Simple Graph tab to export any message type

## Architecture

```
MAVProxy/
├── server/
│   ├── analyze_server.py      # Flask API server
│   ├── mavexplorer_api.py     # MAVExplorer utilities
│   └── requirements.txt       # Python dependencies
└── webui-react/
    ├── src/
    │   ├── App.jsx            # Main application
    │   ├── api.js             # API client
    │   ├── components/
    │   │   ├── FileUploader.jsx
    │   │   ├── GraphView.jsx
    │   │   ├── GraphsBrowser.jsx
    │   │   ├── ParametersView.jsx
    │   │   ├── StatsView.jsx
    │   │   ├── MessageDump.jsx
    │   │   ├── OptionsPanel.jsx
    │   │   └── TabPanel.jsx
    │   ├── main.jsx
    │   └── styles.css
    └── package.json
```

## Dependencies

**Python:**
- Flask >= 2.0
- Flask-Cors
- pymavlink
- pandas
- lxml

**JavaScript:**
- React 18
- Chart.js + react-chartjs-2
- Axios
- Vite

## Fixed Issues

1. ✅ Installed missing Flask-Cors dependency
2. ✅ Fixed CSV generation to use streaming (prevents memory exhaustion)
3. ✅ Added all major MAVExplorer endpoints
4. ✅ Created comprehensive UI with tabbed interface
5. ✅ Implemented proper error handling and logging
6. ✅ Added decimation support for large datasets

## Future Enhancements

- Map view integration
- FFT analysis
- Flight mode overlay on graphs
- Mission waypoint viewer
- Device ID inspection
- Parameter comparison between flights
- Custom graph expression editor
- Export graphs as images
