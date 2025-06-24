# React Chat Widget

This is a simple React app with a floating chat widget. Clicking the widget opens a chat window and establishes a WebSocket connection to ws://localhost:8000/ws/chat/.

- The connection status is logged in the browser console.
- Chat messages are streamed as they arrive.

## Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the development server:
   ```sh
   npm run dev
   ```
3. Open your browser at the provided local address (usually http://localhost:5173).

## Features
- Widget icon at the bottom right
- Chat window with message streaming
- WebSocket connection to backend

## Customization
You can adjust the WebSocket URL or styles in `src/App.jsx` and `src/App.css` as needed.
