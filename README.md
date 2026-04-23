# Job Search Copilot

An AI-powered job search assistant that runs entirely in your browser. Track applications, analyze job descriptions, manage interview stories, and prep for interviews — all with Claude as your coach.

**Zero backend. Zero data leaving your machine.** Your resume, jobs, and chat history all live in localStorage. You bring your own [Anthropic API key](https://console.anthropic.com).

## Features

### 📊 Job Tracker
- Spreadsheet-style tracker with inline editing, drag-to-reorder columns, and show/hide
- **Custom columns** with AI instructions — e.g. "Fertility Benefits: does this company offer IVF coverage?"
- **Fit scoring** against your stated preferences (target roles, locations, salary, work style)
- **Funding stage lookup** via web research (Crunchbase, PitchBook, DuckDuckGo)
- Filter, sort, hide rows, and export to CSV/XLSX

### 📖 STAR Stories
- Build a library of interview stories in Situation/Task/Action/Result format
- **AI scoring** from a hiring manager's perspective with strengths, improvements, and a suggested rewrite
- Paste a transcript and the AI extracts multiple stories automatically
- Drag to reorder, tag, and link to specific roles

### ❓ Q&A Bank
- Save questions from practice and real interviews
- Paste your answer → AI grades it 1-10 with structured feedback
- Get a polished version you can adopt with one click
- Build a growing library of questions organized by category

### 💬 AI Chat Coach
- Multi-threaded conversations with full context (your resume, jobs, stories, preferences)
- **The coach can actually edit your tracker** — say "update all jobs with fertility benefits" and watch it research and fill in the data
- Tools: update job fields, refresh fit scores, edit STAR stories, research custom columns, look up stored JDs
- Drawer accessible from anywhere, or full-page view

### ⚙️ Settings
- Your resume (paste or upload PDF/DOCX)
- LinkedIn URL, target roles, preferred locations, salary minimum, work styles, company sizes, industries
- Anthropic API key

## Tech Stack

- **React + Vite** (client-side only)
- **Anthropic Claude Sonnet 4** via direct browser calls
- **localStorage** for persistence
- **mammoth** + **pdfjs-dist** for resume/JD file parsing
- **xlsx** for spreadsheet exports
- **lucide-react** for icons

## Getting Started

```bash
git clone https://github.com/<your-username>/job-search-copilot.git
cd job-search-copilot
npm install
npm run dev
```

Then:
1. Open [http://localhost:5173](http://localhost:5173)
2. Go to **Settings** and add your [Anthropic API key](https://console.anthropic.com/settings/keys)
3. Paste your resume and set your job preferences
4. Click "Add Job" on the Tracker and paste a JD — Claude analyzes it in the background
5. Build your STAR stories and Q&A bank over time

## Cost

Anthropic API usage only — typically **a few cents per job analyzed**. $5 in API credits lasts a long time for personal use.

## Privacy

Everything lives in your browser's localStorage. Nothing is sent anywhere except directly to Anthropic's API with your own key. No analytics, no tracking, no third-party services.

## Contributing

This started as a portfolio project but if you find it useful, PRs welcome. Ideas I haven't built yet:
- Dark mode
- JSON export/import for data backup
- Gmail integration for auto-detecting application confirmations
- Calendar integration for interview scheduling

## License

MIT — use it, fork it, make it yours.

## Built by

[Elina Hu](https://linkedin.com/in/elinahu) — PM working on AI products.
