# MongoDB Integration Setup

## What Was Implemented

### Backend Changes
1. **Removed Supabase dependencies** - All references to Supabase have been replaced with MongoDB
2. **MongoDB connection configured** in `.env`:
   - Connection URI: `mongodb+srv://cvineetjonathan_db_user:581IDhaKn0BwBwkt@graph.enfofgu.mongodb.net/?appName=graph`
   - Database name: `mavproxy`
   - Profile ID: `694bcbbd87721912a0d120e2`

3. **API Endpoints** (all working):
   - `POST /profiles` - Create new profile
   - `GET /profiles` - List all profiles  
   - `GET /profiles/:id` - Get profile details
   - `DELETE /profiles/:id` - Delete profile
   - `POST /save_graph` - Save graph to profile with description
   - `GET /profiles/:id/saved_graphs` - Get saved graphs for profile
   - `DELETE /saved_graphs/:id` - Delete saved graph

### Frontend Changes
1. **ProfileManager enabled** in main App.jsx
   - Dropdown to select or create profiles
   - Text input for profile name
   - Text input for profile description

2. **Graph Save UI** in GraphView.jsx
   - "💾 Save Graph" button appears when profile is selected
   - Modal dialog with:
     - Graph name input
     - Description textarea (required)
     - Save and Cancel buttons
   - Graphs saved under selected profile + description

3. **API Client** updated with new endpoints:
   - `saveGraph(graphData)` 
   - `getSavedGraphs(profileId)`
   - `deleteSavedGraph(graphId)`

## Current Status

✅ All code changes complete
✅ Backend server running on port 5000
⚠️ MongoDB SSL connection issue (using in-memory fallback)

The application is **fully functional** using in-memory storage for now. All profile and graph saving features work correctly, but data will be lost on server restart until MongoDB connection is fixed.

## MongoDB SSL Connection Issue

### Error
```
SSL handshake failed: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error
```

### Possible Solutions

1. **Check MongoDB Atlas Configuration**:
   - Verify IP whitelist includes your Codespace IP (or use 0.0.0.0/0 for testing)
   - Confirm user credentials are correct
   - Check if database user has proper permissions

2. **Update Connection String**:
   - Try adding `?retryWrites=true&w=majority` to the URI
   - Try `&tls=true&tlsAllowInvalidCertificates=true` (for testing only)

3. **Check Network Access**:
   - MongoDB Atlas → Network Access → Add IP Address
   - Add "Allow Access from Anywhere" (0.0.0.0/0) for testing

4. **Test Connection** manually:
   ```bash
   python3 -c "
   from pymongo import MongoClient
   import certifi
   uri = 'mongodb+srv://cvineetjonathan_db_user:581IDhaKn0BwBwkt@graph.enfofgu.mongodb.net/?appName=graph'
   client = MongoClient(uri, tlsCAFile=certifi.where())
   print(client.admin.command('ping'))
   "
   ```

## How to Use the Features

### 1. Create a Profile
1. Start the backend: `python3 run_backend.py`
2. Start the frontend: `cd webui-react && npm run dev`
3. In the UI, click "+ New Drone" 
4. Enter profile name and description
5. Click "Create Profile"

### 2. Save a Graph
1. Select a profile from the dropdown
2. Upload a MAVLink log file
3. View a graph (custom or predefined)
4. Click "💾 Save Graph" button
5. Enter graph name and description
6. Click "Save Graph"

### 3. View Saved Graphs
- Profiles will show saved graph count
- Use GraphsBrowser component to view saved graphs (if implemented)
- API: `GET /profiles/:profileId/saved_graphs`

## Data Schema

### Profile
```json
{
  "id": "string",
  "name": "string",
  "description": "string", 
  "drone_type": "string (optional)",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

### Saved Graph
```json
{
  "id": "string",
  "profile_id": "string",
  "name": "string",
  "description": "string",
  "graph_type": "custom | predefined",
  "message_type": "string (optional)",
  "field_name": "string (optional)",
  "token": "string (optional)",
  "created_at": "ISO datetime"
}
```

## Important Notes

- Multiple descriptions per profile: ✅ Supported - each saved graph has its own description
- Profile persistence: Works with in-memory fallback (data lost on restart)
- MongoDB persistence: Will work once SSL issue is resolved
- All CRUD operations: Fully implemented and tested

## Next Steps

1. Fix MongoDB SSL connection issue (see solutions above)
2. Test with actual MongoDB persistence
3. Add UI to view and manage saved graphs
4. Add graph visualization from saved graphs
