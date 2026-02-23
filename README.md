# Tabi Desktop

Desktop client for Tabi — time tracking with screenshot monitoring for macOS, Windows, and Linux.

Forked from [solidtime-desktop](https://github.com/solidtime-io/solidtime-desktop).

## Features

- Time tracking with start/stop timer
- **Automatic screenshot capture** with configurable intervals
- **Screenshot upload** to the Tabi server
- Idle detection and activity monitoring
- System tray integration
- Offline support with local SQLite storage

## Development

```bash
npm install
npm run dev              # Electron dev mode
```

### Build

```bash
npm run build:mac        # macOS
npm run build:win        # Windows
npm run build:linux      # Linux
```

### Code Quality

```bash
npm run typecheck        # TypeScript checking
npm run lint             # ESLint
npm run format           # Prettier
```

## License

This project is open-source and available under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE.md).

## Acknowledgments

Built on top of [solidtime-desktop](https://github.com/solidtime-io/solidtime-desktop) by the solidtime team.
