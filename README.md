# Canvas Page POC (Vue)

Proof-of-concept Vue 3 app for Creato's canvas page. It covers login, post upload, drafts, and a canvas editor for scene version 2.

## Stack

Vue 3 (`<script setup>`, TypeScript), Vite, Tailwind CSS v4, shadcn-vue / reka-ui, socket.io-client, Vitest + happy-dom.

## Features

- **Auth** (`src/features/auth`): OTP login. The token is stored for API calls, and a 401 logs the user out.
- **Create** (`src/features/post-upload`): uploads media to S3 and tracks processing over a socket until a draft is ready.
- **Drafts** (`src/features/drafts`): lists drafts from the API. A draft can be converted to a scene and opened in the editor.
- **Editor** (`src/features/canvas-editor`): canvas editor for scene version 2. It has layers, a properties panel, a background panel, an elements library, and scene JSON import/export.
- **Uploader** (`src/features/uploader`): generic media uploader with hashing in a web worker.

## Setup

```sh
pnpm install
pnpm dev
```

## Configuration

Set these in a `.env.local` file. Defaults are shown.

| Variable              | Default                        |
| --------------------- | ------------------------------ |
| `VITE_CREATO_API_URL` | `http://localhost:3000/api/v1` |
| `VITE_CREATO_WS_URL`  | `http://localhost:3001`        |

## Scripts

| Command        | Action                              |
| -------------- | ----------------------------------- |
| `pnpm dev`     | Start the Vite dev server           |
| `pnpm build`   | Type-check with `vue-tsc` and build |
| `pnpm test`    | Run Vitest tests                    |
| `pnpm preview` | Preview the production build        |
