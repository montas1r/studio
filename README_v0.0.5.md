
# SynapseSpark - Mind Mapping Application - Version 0.0.5

## Overview

SynapseSpark (v0.0.5) is a web application designed to help users create, organize, and visualize ideas through interactive mind maps. It features a fixed-size viewport with a larger, navigable logical canvas for node placement and editing.

## Key Features

### 1. Mindmap Library & Data Management
- **Create New Mind Maps:** Users can create new mind maps, providing a name and an optional category.
- **Mindmap Listing:** The homepage displays a list of all saved mind maps.
- **Open & Edit:** Existing mind maps can be opened for editing.
- **Delete Mind Maps:** Mind maps can be deleted from the library with an in-app confirmation dialog.
- **Local Storage:** All mind map data is saved in the browser's local storage.
- **JSON Export:** Mind map data can be exported as a JSON file.

### 2. Interactive Editing Canvas
- **Fixed Viewport:** A `1200px` wide by `800px` high viewport defines the visible editing area. This viewport has an `overflow: hidden` property.
- **Logical Canvas:**
    - A larger `2000px` by `2000px` logical canvas area is contained within the viewport.
    - This logical canvas has a `bg-card` background (from the theme) and a distinct light cyan dotted line border to visually define the working area.
    - Nodes are placed and interact within this logical canvas.
- **Draggable Nodes:** Users can click and drag nodes to position them. Nodes are clamped within the boundaries of the 2000x2000px logical canvas.

### 3. Canvas Navigation Tools (Located in Top Control Bar)
- **Hand Tool:** Allows users to click and drag the background of the canvas to pan the view within the logical canvas area.
- **Zoom Tools:**
    - "Zoom In" and "Zoom Out" buttons adjust the scale of the canvas content.
    - Zoom levels are limited (e.g., between 0.25x and 2.0x).
    - Zooming attempts to keep the center of the viewport stable.
- **Recenter View Tool:** Fits all existing nodes within the viewport and centers them. If no nodes exist, it centers the logical canvas.
- **Mouse Wheel Zoom:** Users can zoom in and out using the mouse wheel.
- **Basic Pinch-to-Zoom:** Foundational support for two-finger pinch gestures on touch devices to zoom.

### 4. Node Management
- **Add Nodes:**
    - Create new root nodes. The first root node of a new mind map is positioned "Half-Top-Centralized" on the logical canvas.
    - Add child nodes to existing nodes.
- **Edit Nodes:** A dialog allows modification of a node's:
    - Title
    - Description
    - Emoji
- **Delete Nodes:** Nodes (and all their children) can be deleted with an in-app confirmation.
- **AI-Powered Summarization:** Within the node editing dialog, users can use an AI tool to summarize lengthy node descriptions into concise key points.

### 5. Node & Wire Styling
- **Node Styling:**
    - Nodes are styled based on the application's default theme:
        - Root nodes use the `primary` theme color for background and border.
        - Child nodes use the `accent` theme color for background and border.
    - **No custom palette selection** for individual node background or border colors in this version.
    - The description box within each node has a lighter, translucent background derived from the node's default theme color (e.g., `bg-primary/10` or `bg-accent/10`).
    - Node titles use `text-lg` and descriptions use `text-sm` for font size.
- **Wire Styling:**
    - Curved SVG lines visually connect parent nodes to their child nodes.
    - Wire colors are based on the parent node's theme color (primary for wires from root parents, accent for wires from child parents).
    - Wire drawing uses the `getApproxNodeHeight` function and the nodes' logical `x,y` coordinates (not `getBoundingClientRect()`).

### 6. Undo/Redo System
- A functional undo (`Ctrl+Z` / `Cmd+Z`) and redo (`Ctrl+Shift+Z` / `Cmd+Shift+Z` or `Ctrl+Y`) system is implemented for:
    - Node creation
    - Node deletion
    - Node text/emoji edits (via dialog save)
    - Node position changes (drag and drop)
- UI buttons for Undo and Redo are available in the top control bar.

### 7. User Interface
- **Dark Theme:** The application uses a clean, dark theme by default.
- **Refined Top Control Bar:** The editor features a well-organized top control bar for mind map name display, navigation ("Back to Library"), export, adding root nodes, and canvas interaction tools.

## Technical Notes
- Built with Next.js and React.
- Styling primarily via Tailwind CSS and ShadCN UI components.
- `globals.css` is clean and free of parsing errors.
- State management for mind maps primarily handled by `useMindmaps` hook and React context/state.
- AI features leverage Genkit.
