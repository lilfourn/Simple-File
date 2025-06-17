Product Requirements Document: AI File & Checklist Organizer

1. Introduction
   1.1. Problem Statement
   In today's digital world, individuals and professionals are inundated with files—invoices, contracts, receipts, research papers, design assets, and personal documents. These files are often stored in disorganized folders like "Downloads" or scattered across desktops, with inconsistent and uninformative names. Locating a specific document becomes a frustrating and time-consuming task, hindering productivity and causing unnecessary stress. Manually organizing these files is a tedious, repetitive, and often-neglected chore. Existing solutions lack the intelligence to understand the content of the files, forcing users to rely on manual sorting and naming.

1.2. Product Vision
Our vision is to create a "set and forget" smart assistant for digital files. This application will transform digital clutter into a perfectly organized, searchable, and logical system with minimal user effort. By leveraging modern AI to understand, categorize, and rename documents, we will empower users to reclaim control over their digital lives, saving them time and boosting their productivity. This tool will be the definitive solution for anyone who values order and efficiency in their digital workspace.

2. Target Audience & Personas
   This application is designed for any computer user who regularly handles a variety of digital documents and struggles with organization.

Persona 1: "Sarah," the Freelance Consultant

Role: Manages multiple clients, handling contracts, invoices, project briefs, and reports.

Pain Points: Spends hours each month sorting client documents for accounting and project management. Often saves files with hasty names and struggles to find them later. Needs a quick way to package all documents related to a single project for delivery.

Goals: Automate the renaming and filing of all business documents. Quickly assemble project deliverables based on a checklist.

Persona 2: "David," the PhD Student

Role: Conducts academic research, downloading hundreds of PDF research papers, articles, and datasets.

Pain Points: His research folder is a mess of files named with database IDs or generic titles. It's difficult to find a specific paper without opening multiple files.

Goals: Automatically rename papers with a consistent format (e.g., YYYY - Author - Title.pdf). Keep his research library clean and searchable.

Persona 3: "Mark," the Home User

Role: Manages household documents like utility bills, insurance policies, tax documents, and scanned receipts.

Pain Points: Scans important documents but they end up in a single "Scans" folder with names like scan_001.jpg. Worries about finding a specific warranty or tax document when needed.

Goals: Create a structured, digital filing cabinet for all household-related documents so they are safe and easy to find.

3. Product Goals & Success Metrics
   Goal

Success Metrics

Improve User Productivity

- Time to Organize: Reduce the average time a user spends organizing a folder of 100 files by >80% compared to manual methods.
- Activation Rate: >40% of new users successfully organize their first folder within 3 days of installation.

Deliver High-Quality AI Suggestions

- Approval Rate: >70% of AI-suggested filenames are approved by the user without edits.
- User Satisfaction (NPS): Achieve a Net Promoter Score of 40+ for the AI features.

Ensure a Secure & Trustworthy Experience

- Adoption: Steady growth in Daily Active Users (DAU) and Monthly Active Users (MAU).
- Retention: 30-day user retention rate of >25%.
- Security Incidents: Zero critical security incidents related to file system access or data privacy.

4. Feature Requirements
   Feature 1: The AI File Organizer
   This is the core feature for automatically renaming and structuring files in a designated folder.

FR-1: Folder Selection & File Discovery
FR-1.1: The user must be able to select a single local folder using the native OS dialog. The application must not allow selection of system-critical root directories (e.g., C:\, /).

FR-1.2: Upon selection, the full path of the folder shall be clearly displayed in the UI.

FR-1.3: The app will initiate a non-blocking, recursive scan of the selected folder. A prominent progress bar and text (Scanning X/Y files...) shall provide real-time feedback.

FR-1.4: The scan must handle and gracefully report on potential permission errors (e.g., locked folders).

FR-1.5: Identified files will populate the main validation UI as they are discovered. The app must handle thousands of files without crashing or freezing.

FR-2: Intelligent File Processing
FR-2.1 (OCR): The application will identify files needing OCR based on their extension (.pdf, .jpg, .jpeg, .png, .tiff).

FR-2.2: OCR processing must happen entirely on the user's machine to ensure privacy. It will run as a background task.

FR-2.3: The system must handle PDFs that have a mix of text and image layers, performing OCR only where necessary.

FR-2.4 (Content Analysis): For each file, its text content (either native or from OCR) will be sent to an LLM via a secure API call.

FR-2.5 (AI Naming): The LLM will be prompted to extract key information and return a structured JSON object containing: suggestedName, documentType, and confidenceScore.

FR-2.6 (Naming Convention): For V1, the filename format will be hardcoded as: YYYY-MM-DD - {Document Type} - {Key Details}.ext. The date will be extracted from the document content or fall back to the file's creation date.

FR-2.7 (Error Handling): API failures or OCR errors for a specific file must not halt the entire batch. The file should be marked with an "Error" status in the UI with a descriptive tooltip.

FR-3: Human-in-the-Loop Validation UI
FR-3.1: The primary interface will be a virtualized list or table (to handle large numbers of files efficiently) with the following columns:

Checkbox: For multi-selection.

Status: An icon indicating state: Pending (yellow), Approved (green), Edited (blue), Rejected (gray), Error (red).

Original Name: The original filename. Hovering reveals the full path.

Suggested Name: An editable text input field, pre-filled with the AI suggestion.

Row Actions: Buttons to Approve or Reject the suggestion for that specific row.

FR-3.2 (Bulk Actions): A header bar above the table will contain:

A master checkbox to select/deselect all visible files.

Buttons for "Approve Selected" and "Reject Selected".

FR-3.3 (Interactivity):

Typing in the "Suggested Name" field immediately changes the file's status to "Edited".

The main call-to-action button, "Apply X Changes," should be prominently displayed and dynamically update its count based on the number of approved/edited files.

FR-4: Execution & Confirmation
FR-4.1: Clicking "Apply X Changes" will open a final confirmation modal dialog, summarizing the actions: You are about to rename X files. This action cannot be undone. Proceed?

FR-4.2: Upon confirmation, the application will execute the renaming operations. A progress bar will track the process.

FR-4.3: The application must handle file system errors during renaming (e.g., file is in use, permissions denied) and report them clearly.

FR-4.4: After completion, a summary report will be displayed, showing successes and failures. The table view should then update to reflect the new state of the folder.

Feature 2: The AI Checklist Organizer
This feature automates the collection and organization of documents based on a user-defined list.

FR-5: Checklist Ingestion & Source Folder
FR-5.1: The user interface will present two main inputs:

A large text area for the user to paste or type their checklist (one item per line).

A "Select Source Folder" button, which uses the native OS dialog to choose where to search for documents.

FR-5.2: The application will parse the checklist, treating each line as a distinct required document type.

FR-6: Semantic Matching Engine
FR-6.1: After the user provides a checklist and a source folder, the application will begin the matching process.

FR-6.2 (Vectorization): The process will run entirely on the user's machine for privacy.

The app will first process all documents in the source folder (including OCR) to get their text content.

It will then generate a vector embedding for each document's content and for each line item in the checklist.

FR-6.3 (Similarity Search): The app will perform a cosine similarity search between each checklist item's vector and all document vectors.

FR-6.4: Documents that exceed a predefined similarity threshold (e.g., 0.75) will be considered a match for a given checklist item. A single document can potentially match multiple items if relevant.

FR-7: Review and Organization UI
FR-7.1: The UI will present the results in a clear, two-panel layout.

Left Panel: Displays the user's original checklist. Each item will have a status icon (e.g., Match Found, No Match Found).

Right Panel: Displays the matched documents, grouped by the checklist item they correspond to. Each matched file will show its name and a similarity score.

FR-7.2: Users can manually de-select any file they believe is a false positive.

FR-8: Folder Creation & Output
FR-8.1: A button labeled "Create Organized Folder" will become active once the matching process is complete.

FR-8.2: Clicking this button will prompt the user to choose a destination and name for the new parent folder (e.g., Client Loan Package).

FR-8.3: Upon confirmation, the application will:

Create the new parent folder.

Inside it, create one subfolder for each item on the original checklist.

COPY (not move) the matched files into their corresponding subfolders. This is a critical safety measure to prevent accidental data loss.

FR-8.4: A success message will be shown upon completion, with a button to "Open Folder" which reveals the newly created structure in the native file explorer.

5. Non-Functional Requirements
   NFR-1 (Performance):

Application Startup: Cold start to interactive UI in < 3 seconds.

File Scanning: Must process at least 200 files/second on an average modern SSD.

UI Responsiveness: The UI must remain fluid and responsive at all times, even while processing thousands of files in the background.

NFR-2 (Security):

File System Access: All file system capabilities (read, write, dialog) must be explicitly declared in the Tauri allowlist. The application should request the narrowest permissions possible.

API Keys: The OpenAI API key must be stored securely and never exposed on the client-side. It will be managed exclusively by the Rust backend.

Sandboxing: The frontend webview context must be strictly isolated from the backend Rust process.

NFR-3 (Privacy):

Local-First Processing: All file contents, scanning, OCR, and semantic vector searching will be performed 100% on the user's local machine. No file content or filenames are ever transmitted to our own servers.

Third-Party Data: The only data sent to a third party (OpenAI) is the text content of a document for the sole purpose of generating a filename suggestion. This will be clearly stated in the Privacy Policy.

NFR-4 (Usability & Design):

Onboarding: A simple, welcoming onboarding flow will guide new users through their first file organization task.

Consistency: The UI will adhere to the clean, modern aesthetic defined by the existing Next.js/shadcn/Tailwind stack.

Accessibility: The application should strive for WCAG 2.1 AA compliance, ensuring it is usable by people with disabilities (e.g., proper color contrast, keyboard navigation, screen reader support).

6. Future Scope (Out of Scope for V1)
   Cloud Drive Integration (Google Drive, Dropbox, OneDrive).

User-configurable naming conventions and rules.

Saving and reusing checklist templates.

A dashboard providing analytics on file organization habits.

Advanced file previews within the application.

"Smart Folders" that automatically watch and organize files as they are added.
