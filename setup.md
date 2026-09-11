# Setup Guide — Visual Luau Compiler

## Prerequisites

- **Node.js** (v18 or higher) — [Download here](https://nodejs.org/)
- **Visual Studio Code** — [Download here](https://code.visualstudio.com/)

---

## Quick Start

### 1. Clone or open the project

Open the project folder in VS Code:

```
File → Open Folder → select the "visual luau compiler" folder
```

### 2. Open the Terminal

In VS Code, open the integrated terminal:

```
Ctrl + ` (backtick)
```

Or go to **Terminal → New Terminal** from the menu bar.

### 3. Install dependencies

```bash
npm.cmd install
```
or
```bash
npm install
```

This will download all required packages (React, Three.js, Wasmoon, Monaco Editor, etc.).

### 4. Start the dev server

```bash
npm run dev
```
or
```bash
npm.cmd run dev
```

You should see output like:

```
VITE v6.x.x  ready in XXXms

➜  Local:   http://localhost:3000/
```

### 5. Open in browser

Open **http://localhost:3000** in your browser. You should see the full Roblox Studio-style interface!

---

## Available Commands

| Command           | What it does                                      |
|-------------------|---------------------------------------------------|
| `npm install`     | Install all dependencies                          |
| `npm run dev`     | Start the development server (hot reload)         |
| `npm run build`   | Build for production (outputs to `dist/`)         |
| `npm run preview` | Preview the production build locally              |
| `npm run lint`    | Type-check the project (no output = no errors)    |

---

## Recommended VS Code Extensions

- **ESLint** — JavaScript/TypeScript linting
- **Tailwind CSS IntelliSense** — autocomplete for Tailwind classes
- **Lua** — syntax highlighting for `.lua` files (optional)

---

## Project Structure

```
visual luau compiler/
├── src/
│   ├── App.tsx          # Main application (UI, 3D viewport, Explorer, tabs)
│   ├── luaRunner.ts     # Lua runtime engine (Wasmoon + coroutine scheduler)
│   ├── main.tsx         # React entry point
│   └── index.css        # Tailwind CSS styles
├── index.html           # HTML entry point
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
├── devlog.md            # Development log
└── setup.md             # This file
```

---

## Tech Stack

| Technology             | Purpose                              |
|------------------------|--------------------------------------|
| React 19               | UI framework                         |
| Vite 6                 | Build tool & dev server              |
| TypeScript             | Type safety                          |
| Tailwind CSS 4         | Styling                              |
| Three.js               | 3D rendering                         |
| @react-three/fiber     | React wrapper for Three.js           |
| @react-three/drei      | Three.js helpers (controls, gizmos)  |
| Monaco Editor          | Code editor (VS Code engine)         |
| Wasmoon                | Lua VM running in WebAssembly        |
| Lucide React           | UI icons                             |

---

## Notes

- This is a **100% frontend** application — no backend server required.
- Lua scripts run entirely in the browser via WebAssembly.
- Roblox Image IDs (`144075659`, `rbxassetid://...`, catalog URLs, decals, and textures) resolve directly in the frontend without requiring any backend server or worker.
- The built `dist/` folder can be deployed to any static hosting (GitHub Pages, Netlify, Vercel, etc.).
