# SnapGraph - Mind Mapping Application - Blueprint (Version 0.0.8)

## 1. Overview

SnapGraph (v0.0.8) is an intuitive web application designed for creating, organizing, and visualizing ideas through interactive mind maps. It features a rich editing canvas, AI-powered summarization, rich text node descriptions, and robust data management capabilities, all within a modern, themed user interface.

## 2. Core Features

### 2.1. Mindmap Library & Data Management
- **Create New Mind Maps:** Users can create new mind maps, providing a name and an optional category.
- **Mindmap Listing:** The homepage displays a list of all saved mind maps, sorted by last updated.
- **Open & Edit:** Existing mind maps can be opened for editing.
- **Delete Mind Maps:** Mind maps can be deleted from the library with an in-app confirmation dialog.
- **Local Storage:** All mind map data is saved in the browser's local storage under the key `snapGraphMindmaps`.
- **JSON Export:** Mind map data can be exported as a JSON file.

### 2.2. Interactive Editing Canvas
- **Fixed Viewport:** A `1200px` wide by `800px` high viewport defines the visible editing area with `overflow: hidden`.
- **Logical Canvas:**
    - A larger `2000px` by `2000px` logical canvas area is contained within the viewport.
    - This logical canvas has a `bg-card` background (from the theme) and a distinct light cyan dotted line border.
    - Nodes are placed and interact within this logical canvas.
- **Draggable Nodes:** Users can click and drag nodes to position them. Nodes are clamped within the boundaries of the logical canvas.
- **Node Sizing:** Nodes can be set to 'Mini' (160px width, 60px default height), 'Standard' (240px width, 90px default height), or 'Massive' (360px width, 150px default height) sizes. Actual node height adjusts to content, respecting a global minimum of 80px and maximum of 800px.

### 2.3. Canvas Navigation Tools (Top Control Bar)
- **Hand Tool (Pan):** Allows users to click and drag the canvas background to pan the view.
- **Zoom Tools:** "Zoom In" and "Zoom Out" buttons adjust canvas scale (limited between 0.25x and 2.0x). Zooming attempts to keep the center of the viewport stable.
- **Recenter View Tool:** Fits all existing nodes within the viewport and centers them. If no nodes exist, it centers the logical canvas.
- **Mouse Wheel Zoom:** Users can zoom in and out using the mouse wheel.
- **Basic Pinch-to-Zoom:** Foundational support for two-finger pinch gestures on touch devices to zoom.

### 2.4. Node Management
- **Add Nodes:**
    - Create new root nodes. The first root node of a new mind map is positioned centrally on the logical canvas.
    - Add child nodes to existing nodes.
- **Edit Nodes (Dialog):**
    - Modify Node Title.
    - Modify Node Description using Markdown.
    - Set a Node Emoji.
    - Select Node Size ('Mini', 'Standard', 'Massive').
- **Rich Text Node Descriptions:**
    - Node descriptions are entered as Markdown in the edit dialog.
    - Descriptions are rendered as formatted HTML in the Node Card using the `marked` library and styled with `.prose` classes.
- **Delete Nodes:** Nodes (and all their children) can be deleted with an in-app confirmation.
- **AI-Powered Summarization:** Within the node editing dialog, users can use an AI tool (Genkit-powered) to summarize lengthy node descriptions.

### 2.5. Node & Wire Styling
- **Node Styling:**
    - Nodes are styled based on the application's default theme:
        - Root nodes use the `primary` theme color for background and border.
        - Child nodes use the `accent` theme color for background and border.
    - The description box within each node has a fixed light background (e.g., `bg-slate-100 dark:bg-slate-800`) with dark text for optimal readability, independent of the node's theme color.
    - Node titles use `text-lg` and descriptions use `text-sm` (via `.prose` styles).
- **Wire Styling:**
    - Curved SVG lines visually connect parent nodes to their child nodes.
    - Wire colors are based on the parent node's theme color.

### 2.6. Undo/Redo System
- A functional undo (`Ctrl+Z` / `Cmd+Z`) and redo (`Ctrl+Shift+Z` / `Cmd+Shift+Z` or `Ctrl+Y`) system is implemented for:
    - Node creation
    - Node deletion
    - Node text/emoji/size edits (via dialog save)
    - Node position changes (drag and drop)
- UI buttons for Undo and Redo are available in the top control bar.

### 2.7. User Interface & General
- **Theme:** The application uses a clean, dark theme by default (forced dark via `ThemeProvider` in `layout.tsx`).
- **Application Header:** Displays "SnapGraph" app name and copyright notice "© Montasir - 2025" on the top right.
- **Refined Top Control Bar:** The editor features a well-organized top control bar for mind map name display, navigation, export, adding root nodes, and canvas interaction tools.
- **Google AdSense Integration:** AdSense script is included in the `<head>` of `layout.tsx` for potential ad display.

## 3. Style Guidelines (as per PRD & Implementation)

- **Primary Color:** Indigo (`#4F46E5`, HSL variable `--primary`) used for root nodes, primary actions, etc.
- **Background Color:** Light gray (`#F9FAFB` for light mode concept, current dark theme uses `hsl(var(--background))` which is a deep, dark desaturated blue).
- **Accent Color:** Violet (`#8B5CF6`, HSL variable `--accent`) used for child nodes, secondary interactive elements, etc.
- **Font:** Clean, sans-serif fonts (Geist Sans and Geist Mono via `next/font`).
- **Icons:** Minimalist line icons from `lucide-react`.
- **Cards:** Soft rounded cards (e.g., NodeCards use `rounded-2xl`, general theme `rounded-lg`).
- **Animations:** Subtle transition animations (e.g., ShadCN component defaults, accordion).

## 4. Technical Notes

- **Framework:** Next.js (v15.2.3) utilizing the App Router.
- **Language:** TypeScript.
- **Core UI Libraries:** React (v18.3.1).
- **UI Components:** ShadCN UI components.
- **Styling:** Tailwind CSS with CSS Variables defined in `src/app/globals.css`.
- **State Management:** Primarily handled by the `useMindmaps` custom hook (`src/hooks/useMindmaps.ts`) and React context/state for editor UI.
- **AI Features:** Genkit (`@genkit-ai/next`, `@genkit-ai/googleai`) for AI flows, currently node summarization using Google AI's Gemini model (`googleai/gemini-2.0-flash`).
- **Markdown Rendering:** `marked` library (v12.0.2) for parsing Markdown in node descriptions to HTML.
- **Data Persistence:** Browser's Local Storage is used to save and load mind map data via `src/lib/localStorage.ts` (key: `snapGraphMindmaps`).
- **Routing:** Next.js App Router for page navigation (e.g., `/` for library, `/mindmap/[id]` for editor).
- **Image Placeholders:** Uses `https://placehold.co` with `data-ai-hint` attributes.
- **Error Handling:** Basic error boundaries (`error.js`), toasts for user feedback, and error handling within AI flows.
- **Version:** 0.0.8 (as per `package.json`).
