# Running this project

This version uses native ES modules (`import`/`export`, `<script type="module">`).
Browsers block module imports when a page is opened directly from disk
(`file://...`) due to CORS, so `index.html` must be served over `http://`
instead of double-clicked.

## Option 1: Python (no install needed if you have Python)

```bash
cd client-management-module
python3 -m http.server 5500
```

Then open http://localhost:5500/index.html

## Option 2: Node's `serve` package

```bash
cd client-management-module
npx serve -l 5500
```

Then open http://localhost:5500/index.html

## Option 3: VS Code Live Server extension

Install the "Live Server" extension, then right-click `index.html` and
choose "Open with Live Server".

## Stopping the server

Press `Ctrl+C` in the terminal running the server.
