# ADMITLY AI

**ADMITLY AI** is a full-stack HSC and Bangladesh University Admission Preparation Platform (BUET, DU Ka, DU Kha, Medical, GST, Engineering, and Paper-wise Model Tests) powered by React, TypeScript, Express, SQLite (`node:sqlite`), KaTeX, and Google Gemini (`gemini-3.1-flash-lite`).

## Features

- **Student Exam Hub & Review System**: Full-paper vertical MCQ exam interface, negative marking, timer, confirmation summary, server-verified grading, and question-by-question Bangla/English review with KaTeX math rendering.
- **AI Mentor & Study Tools**: AI Mentor chat, targeted 4-day study plan, practice MCQ generator, attempt diagnostics, and supplemental question explanations.
- **Admin Panel & AI Question Builder**: Bulk paste or upload PDF/DOCX/TXT questions + separate Answer Key matching, staging review queue, approval workflow, subject/paper classification, and direct Exam creation/assignment.
- **Role-Based Auth & SQLite Persistence**: Separate Student & Admin authentication backed by Node's built-in `node:sqlite`.

## Requirements

- **Node.js `>= 22.5.0`** (required for built-in `node:sqlite`)
- **npm**
- A **Google Gemini API key** (`GEMINI_API_KEY`) for AI features

## Local Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file from `.env.example`:

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your `GEMINI_API_KEY` (and optional `SESSION_SECRET`, `ADMIN_ACCESS_CODE`, `PORT`).

3. Start the development server:

   ```bash
   npm run dev
   ```

   The app runs on `http://localhost:3000`.

## Production Build & Hosting

Because ADMITLY AI includes an Express backend (`server.ts`), SQLite database (`data/admitly.sqlite`), file uploads, and server-side Gemini API calls, deploy it on a **Node.js 22+ platform** (e.g., Render, Railway, Fly.io, Google Cloud Run, or a VPS) rather than static-only GitHub Pages:

```bash
npm run build
NODE_ENV=production npm start
```

### GitHub Pages Note

`.nojekyll` files are included at `/`, `/public/`, and `/docs/` so GitHub Pages does not fail trying to run Jekyll on this Node/Vite repository. Automated type-checking (`npm run lint`) and build verification (`npm run build`) run via `.github/workflows/ci.yml`.
