![GitHub Actions](https://github.com/ardupilot/MAVProxy/actions/workflows/windows_build.yml/badge.svg)

# MAVProxy

This is a MAVLink ground station written in python with a modern web interface.

## Features

- **Web UI**: Modern React-based interface for MAVLink log analysis
- **Desktop MAVExplorer**: Full-featured graph visualization matching desktop version
- **Flight Mode Analysis**: Visual flight mode colored regions on graphs
- **Predefined Graphs**: 200+ built-in graph definitions from mavgraphs.xml
- **Custom Graphs**: Plot any message field or all fields simultaneously
- **File Upload**: Chunked upload with compression for large .bin files

## Quick Start

### Local Development

```bash
# Run both frontend and backend
npm run dev
```

Access at: http://localhost:5174

### Production Deployment

Deploy to Vercel in 2 steps:

```bash
./deploy_vercel.sh
```

Or manually - see [QUICK_DEPLOY.md](QUICK_DEPLOY.md) and [DEPLOYMENT.md](DEPLOYMENT.md)

## Documentation

- **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** - Fast deployment guide
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Detailed Vercel deployment instructions

## Original MAVProxy

Please see https://ardupilot.org/mavproxy/index.html for more information

This ground station was developed as part of the CanberraUAV OBC team entry

## License

MAVProxy is released under the GNU General Public License v3 or later

## Maintainers

The best way to discuss MAVProxy with the maintainers is to join the
mavproxy channel on ArduPilot discord at https://ardupilot.org/discord

Lead Developers: Andrew Tridgell and Peter Barker

Windows Maintainer: Stephen Dade

MacOS Maintainer: Rhys Mainwaring
