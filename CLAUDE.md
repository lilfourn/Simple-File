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
- **Database**: Supabase (PostgreSQL) with RLS policies
- **File Storage**: Supabase Storage with TUS resumable uploads
- **File Upload**: Custom parallel upload manager with retry logic

### Key Directories
- `/app` - Next.js App Router pages and layouts
  - `/api/ai/suggest-names` - Empty AI endpoint (to be implemented)
  - `/auth` - Complete authentication flow (sign-in, sign-up, verify-email)
  - `/dashboard` - Main app with file organizer
- `/components` - React components
  - `/dashboard` - FileExplorer, FileUpload, WorkspaceSelector
  - `/ui` - 50+ pre-installed shadcn/ui components
- `/utils` - Utility functions
  - `/supabase` - Database client, types, and server/client utilities
  - `parallel-upload-manager.ts` - Handles concurrent file uploads
- `/public/simple-file-brandkit` - Brand assets (logo, favicon)

### Database Schema
- **workspaces**: Multi-workspace support per user
- **nodes**: Hierarchical file/folder structure with parent-child relationships
- **storage.objects**: Supabase Storage integration for file data

### Current Implementation Status

#### ✅ Implemented Features:
1. **Authentication System**: Complete Supabase auth with email verification
2. **Workspace Management**: Create and switch between workspaces
3. **File Management**: 
   - Upload files/folders with progress tracking
   - Create/delete folders
   - Move files between folders
   - Delete single/multiple files
   - Download files
   - Context menu operations
4. **Upload System**: 
   - TUS-based chunked uploads for large files
   - Parallel upload manager with concurrency control
   - Retry logic and error handling
   - Toast notifications with progress bars

#### ❌ Not Implemented (Core Features from PRD):

1. **AI File Organizer** (Feature 1 - Main Value Prop):
   - OCR processing for PDFs and images
   - AI-powered file naming suggestions using LLM
   - Batch validation UI for reviewing AI suggestions
   - Bulk rename operations with human-in-the-loop validation
   - Content analysis and metadata extraction
   - The `/app/api/ai/smart-sync/route.ts` now uses X.AI Grok API for file naming

2. **AI Checklist Organizer** (Feature 2):
   - Checklist ingestion interface
   - Semantic matching engine with vector embeddings
   - Document-to-checklist matching
   - Review and organization UI
   - Automated folder creation based on checklist

3. **Local Processing Requirements**:
   - Local OCR implementation (for privacy)
   - Local vector embeddings generation
   - Client-side document analysis

4. **Missing Supporting Features**:
   - File content preview
   - Search functionality
   - Advanced file metadata display
   - Batch operations beyond delete

### Theme Configuration
- Light mode: Background `#F0F0EB` (oklch(0.956 0.006 67.98)), Foreground `#262625` (oklch(0.239 0.001 265))
- Dark mode: Colors are reversed
- Theme provider wraps the app in `layout.tsx`

### Important Context
- All file processing must happen locally for privacy
- The app should handle thousands of files efficiently
- Target WCAG 2.1 AA accessibility compliance
- Use existing shadcn/ui components before creating custom ones
- Currently functions as basic cloud storage, missing all AI features

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
- Environment variables required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `GROK_API_KEY`

### Priority Implementation Tasks (Based on PRD)

#### High Priority - Core AI Features:
1. **AI File Organizer (Feature 1)**:
   - Implement OCR for PDFs/images using Tesseract.js or similar
   - AI naming service now implemented using X.AI Grok API
   - Build batch validation UI with editable suggestions
   - Add bulk rename functionality with undo support
   - SmartSync feature implemented with Grok API integration

2. **Local Processing Setup**:
   - Set up WebAssembly-based OCR for client-side processing
   - Implement local text extraction from PDFs
   - Add progress indicators for long-running operations

#### Medium Priority - Checklist Feature:
3. **AI Checklist Organizer (Feature 2)**:
   - Create checklist input interface
   - Implement vector embeddings (using Transformers.js for local processing)
   - Build semantic search/matching engine
   - Create review UI for matches
   - Add organized folder export functionality

#### Low Priority - Enhancements:
4. **Supporting Features**:
   - File content preview (especially for PDFs/images)
   - Global search across all files
   - Advanced metadata extraction and display
   - Batch operations UI improvements

### Technical Considerations
- **AI Integration**: Using X.AI Grok API via OpenAI SDK for file naming suggestions (GROK_API_KEY required)
  - Model: `grok-3-mini`
  - Base URL: `https://api.x.ai/v1`
  - Compatible with OpenAI SDK
- **OCR Libraries**: Consider Tesseract.js for browser-based OCR
- **Vector Search**: Transformers.js or similar for local embeddings
- **Performance**: Implement Web Workers for heavy processing tasks
- **File Processing**: Add libraries for PDF parsing (pdf-parse, pdfjs-dist)

### Development Guidelines
- ALWAYS remove unused imports or files
- ALWAYS use the toast helper from '@/utils/toast-helper' for all toast notifications
  - Use `showToast.success()`, `showToast.error()`, `showToast.info()`, `showToast.warning()`
  - NEVER use direct `toast()` calls from 'sonner'
  - This ensures consistent styling and prevents text wrapping issues

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

### Context Management Guidelines
- We have a much larger codebase now, one of your goals should be to save context, only gain extra context if it is necessary
- You can list files, or use other bash commands to save context
- Do not compromise on accurate code edits for this and ALWAYS compact the conversation when you think it is best