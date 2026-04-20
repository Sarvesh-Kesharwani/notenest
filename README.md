# NoteNest

NoteNest is a visual note-taking app built with Next.js, React, TipTap, and React Flow. It combines a rich text editor with a linked graph view so notes, references, and local media stay connected in one workspace.

## What It Does

- Rich text editing with TipTap
- Graph-based nodes and links beside the editor
- Drag selected text onto a node to create references
- Google sign-in with optional sync to Google Drive app data
- Local video nodes with file upload support
- Screen recording directly into a node
- Local video storage on disk instead of browser `localStorage`
- One-click download for saved local videos

## Stack

- Next.js 15
- React 19
- NextAuth v5 beta
- Zustand
- TipTap
- `@xyflow/react`
- Tailwind CSS

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy environment values into `.env.local`:

```env
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# AUTH_URL=http://localhost:3000
```

3. Start the dev server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Google Drive Sync

Google Drive sync uses the app-data folder scope:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/drive.appdata`

Create a Google OAuth web client and set the callback URL to:

- `http://localhost:3000/api/auth/callback/google`
- your deployed domain equivalent for production

## Local Video Storage

Recorded and uploaded local videos are stored on disk in:

```text
storage/videos
```

The app keeps only the saved filename in note state. Actual video files are intentionally ignored by Git, so back up this folder separately if you want to preserve recordings across machines.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Deployment Workflow

Recommended branch flow for this repo:

- `dev` for active development
- `prod` for production deployments

Vercel production deployments should point at `prod` only.

## Project Notes

- The editor and graph are client-rendered.
- Logging out clears local note state from the browser.
- Local video downloads are available from both the node modal and the backup action in the app header.
