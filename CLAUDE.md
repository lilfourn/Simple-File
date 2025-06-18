# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simply File is an AI-powered file and checklist organizer application built with Next.js 15, TypeScript, and Tailwind CSS. The app focuses on local-first processing for privacy, allowing users to automatically organize, rename, and categorize their digital files.

## Commands

```bash
# Development
npm run dev        # Start development server on http://localhost:3000

# Production
npm run build      # Build for production
npm run start      # Start production server

# Code Quality
npm run lint       # Run ESLint
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15.3.3 with App Router
- **UI Components**: shadcn/ui (New York style) - pre-installed in `/components/ui/`
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Theme**: Light/Dark mode via next-themes (default: light)
- **Font**: Montserrat from Google Fonts

### Key Directories
- `/app` - Next.js App Router pages and layouts
- `/components/ui` - shadcn/ui components (50+ pre-installed)
- `/public/simple-file-brandkit` - Brand assets (logo, favicon)

### Theme Configuration
- Light mode: Background `#F0F0EB` (oklch(0.956 0.006 67.98)), Foreground `#262625` (oklch(0.239 0.001 265))
- Dark mode: Colors are reversed
- Theme provider wraps the app in `layout.tsx`

### Core Features to Implement
1. **AI File Organizer**: Automatic file renaming with OCR support and human validation
2. **AI Checklist Organizer**: Document-to-checklist matching using semantic search

### Important Context
- All file processing must happen locally for privacy
- The app should handle thousands of files efficiently
- Target WCAG 2.1 AA accessibility compliance
- Use existing shadcn/ui components before creating custom ones

### Authentication Setup
- **Supabase Auth**: Integrated with Next.js SSR using `@supabase/ssr`
- **Protected Routes**: Dashboard requires authentication via `getUser()` check
- **Auth Flow**: Sign in/up → Dashboard, with email/password authentication
- **Middleware**: Handles session refresh and protects `/dashboard` routes
- **Server Actions**: Used for secure authentication operations
- **Supabase Project**: Project name is "Simple File"
- **Supabase MCP**: Installed for dashboard management and configuration

### Development Notes
- Cursor pointers are globally applied to all interactive elements
- The header component includes placeholder routes: /releases, /tutorials, /contact, /pricing
- Path alias `@/*` is configured for imports from the root directory
- Environment variables required: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Development Guidelines
- ALWAYS remove unused imports or files

### Code Best Practices
- ALWAYS right best practice typescript, react, tailwindcss code that is also secure

### Interaction Guidelines
- Never start the server for us, if you want to restart the server just let me know and I will do it manually

### Planning Guidelines
- When in planning mode, always scan the codebase, list files, and check the current state of the codebase before creating a plan

### Memory Guidance
- ALWAYS use the internet to get recent information on implementing certain functionality if you are unsure how.

### Interaction Principles
- NEVER agree/reinforce ideas or thoughts if they are believed to be wrong
- If something seems incorrect, query the reason and present the best alternative options