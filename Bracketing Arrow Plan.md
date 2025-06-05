---
created: 2025_06_05_1529
modified: 2025_06_05_1538
---
## Project Overview: Discourse Analysis Tree Plugin for Obsidian

### Goal

Create an Obsidian plugin that renders hierarchical discourse analysis trees in the document margin, allowing users to visualize logical relationships and argument structures alongside their text. The trees are defined using a simple text syntax within the document itself, making them portable and human-readable.

### Core Requirements

- **Text-defined trees**: Users write `{node_id|parent_id|label}` syntax directly in their documents
- **Margin rendering**: Trees appear in the right margin, not interfering with document text
- **Hierarchical visualization**: Support for nested parent-child relationships (mostly binary, some 3+ children)
- **Performance**: Handle 30-200 nodes efficiently with static rendering (re-render on text changes)
- **No GUI editing**: Trees are purely defined through text syntax, maintaining plaintext compatibility

### Technical Strategy

We're building on top of the existing [obsidian-arrows plugin](https://github.com/artisticat1/obsidian-arrows) architecture because it already solves several key challenges:

1. **CodeMirror 6 Integration**: The arrows plugin has a working ViewPlugin implementation that detects text syntax and renders visualizations
2. **Margin Positioning**: It successfully places visual elements in the document margin without disrupting text flow
3. **Text Syntax Parsing**: The pattern of `{identifier|parameters}` is already implemented and tested
4. **Document Change Handling**: Efficient re-rendering when document content changes

However, instead of drawing arrows between points, we're pivoting to render hierarchical trees using **D3.js with d3-hierarchy** because:

- D3's tree layout algorithms are battle-tested and efficient
- It provides precise control over node positioning within constrained spaces
- SVG output integrates well with Obsidian's theming system
- The Reingold-Tilford algorithm handles our use case perfectly

### Phase 1 Success Criteria

A minimal working version that demonstrates the core architecture:

1. **Parse tree syntax**: Successfully extract parent-child relationships from `{node_id|parent_id|label}` syntax
2. **Render basic trees**: Display hierarchical structures as connected nodes in the margin
3. **Handle document changes**: Re-render trees when text is edited
4. **Support multiple trees**: Allow several independent trees in one document
5. **Theme compatibility**: Use Obsidian's CSS variables for basic styling

### Example Use Case

User writes in their document:

```
{10:Parent Label A}{2:Level 2 Label A}{1:Label 1}Line 1
{1:Label 1}Line 2
{2:Level 2 Label B}{3:Label 3}Line 3
{4:Label 4}Line 4
{10:Parent Label B}{5:Label 5}Line 5
{6:Label 6}Line 6
```

This renders a tree in the margin showing:

```

					                             +--[Label 1]---- Line 1
                           |--[Level 2 Label A]--|
		                   |                     +--[Label 2]---- Line 2
                           |
     |--[Parent Label A]---|
        |                  |                    +---[Label 3]--- Line 3
        |                  |--[Level 2 Label B]-|
        |                                       +---[Label 4]--- Line 4
	    |
	    |
	    |
		|	   
		|	                   +---[Label 5]------------------- Line 5
        |---[Parent Label B]---|
	                           +---[Label 6]------------------- Line 6
```

### Technical Approach Summary

We're essentially gutting the arrow-drawing logic from the arrows plugin and replacing it with D3.js tree rendering, while keeping all the excellent CodeMirror 6 integration, syntax parsing patterns, and margin positioning infrastructure. This gives us a huge head start while ensuring compatibility with Obsidian's editor architecture.


## Phase 1: Core Architecture - Detailed Plan

### Files to Keep and Modify

**1. `src/main.ts`** - Keep as plugin entry point

- Remove all LeaderLine-specific code
- Change class name from `ArrowsPlugin` to `DiscourseTreePlugin`
- Update settings to tree-specific options
- Keep the CodeMirror extension registration pattern
- Add D3.js initialization

**2. `src/settings.ts`** - Keep for configuration

- Remove arrow-specific settings (colors, diagonal styles)
- Add tree-specific settings:
    - Default node spacing
    - Tree orientation (horizontal/vertical)
    - Margin width
    - Node size
- Keep the settings tab structure

**3. `src/matchDecoratorAll.ts`** - Keep for syntax detection

- This is actually perfect for our needs!
- Just update the regex pattern to match our syntax
- Change decoration creation to emit tree node data

**4. `styles.css`** - Keep and modify

- Remove arrow-specific styles
- Add tree visualization styles
- Add margin container styles

**5. `src/utils.ts`** - Partially keep

- Keep: `rangeWithinExcludedContext`, `iterateCM6`
- Remove: Arrow-specific utilities
- Add: Tree parsing utilities

### Files to Delete

- `src/arrowsConfig.ts` - Replace with tree config
- `src/arrowsManager.ts` - Replace with tree manager
- `src/arrowsViewPlugin.ts` - Replace with tree view plugin
- `src/leaderline.d.ts` - No longer needed
- `src/consts.ts` - Most constants are arrow-specific

### New Files to Create

**1. `src/treeConfig.ts`**

```typescript
// Similar structure to arrowsConfig.ts but for trees
import { Facet, Compartment } from "@codemirror/state";
import { DiscourseTreeSettings } from "./settings";

export const treeConfig = Facet.define<DiscourseTreeSettings, DiscourseTreeSettings>({
    combine: (input) => input[0] || DEFAULT_SETTINGS
});
```

**2. `src/treeViewPlugin.ts`**

```typescript
// Core ViewPlugin implementation
// Parse syntax, create tree data structure, render with D3
// Handle margin positioning
```

**3. `src/treeParser.ts`**

```typescript
// Parse {node_id|parent_id|label|parameters} syntax
// Build hierarchical data structure
// Handle multiple trees in one document
```

**4. `src/treeRenderer.ts`**

```typescript
// D3.js rendering logic
// SVG generation
// Tree layout algorithms
// Margin constraints
```

**5. `src/types.ts`**

```typescript
// TypeScript interfaces for tree nodes, settings, etc.
```

### Detailed Implementation Steps

#### Step 1: Project Setup (Day 1)

1. Fork/clone the arrows repo as base
2. Update `package.json`:
    
    ```json
    {  "name": "obsidian-discourse-tree",  "dependencies": {    "d3-hierarchy": "^3.1.2",    "d3-selection": "^3.0.0",    "@types/d3-hierarchy": "^3.1.2",    "@types/d3-selection": "^3.0.0"  }}
    ```
    
3. Update manifest.json with new plugin details
4. Clean up unnecessary files

#### Step 2: Core Data Structures (Day 2)

1. Create `src/types.ts`:
    
    ```typescript
    export interface TreeNode {
      id: string;
      parentId?: string;
      label?: string;
      children?: TreeNode[];
      // Position data added by D3
      x?: number;
      y?: number;
    }
    
    export interface TreeData {
      root: TreeNode;
      position: number; // Document position
    }
    ```
    
2. Create `src/treeParser.ts`:
    
    ```typescript
    // Parse {node_id|parent_id|label} syntax
    // Build tree from flat list
    // Handle orphaned nodes
    ```
    

#### Step 3: ViewPlugin Architecture (Day 3-4)

1. Create `src/treeViewPlugin.ts`:
    
    - Extend from existing arrows ViewPlugin pattern
    - Use `matchDecoratorAll` for syntax detection
    - Create margin container on initialization
    - Parse visible ranges for tree syntax
2. Key differences from arrows:
    
    - Instead of drawing lines between elements, create a single SVG per tree
    - Position SVG in margin using absolute positioning
    - Use D3.js for layout calculations

#### Step 4: D3.js Integration (Day 5-6)

1. Create `src/treeRenderer.ts`:
    
    ```typescript
    import { hierarchy, tree } from 'd3-hierarchy';
    import { select } from 'd3-selection';
    
    export class TreeRenderer {
      renderTree(container: HTMLElement, treeData: TreeNode, constraints: {width: number, height: number}) {
        // Create SVG
        // Apply tree layout
        // Draw nodes and connections
      }
    }
    ```
    
2. Implement basic tree layout:
    
    - Horizontal tree (reading left to right)
    - Fixed margin width constraint
    - Simple node representation (circles + text)

#### Step 5: Margin Positioning (Day 7)

1. Update `styles.css`:
    
    ```css
    .discourse-tree-container {
      position: absolute;
      right: -300px;
      width: 280px;
      pointer-events: none;
    }
    
    .discourse-tree-svg {
      background: var(--background-primary);
      border-left: 1px solid var(--background-modifier-border);
    }
    ```
    
2. Implement positioning logic:
    
    - Calculate tree position based on first node in document
    - Handle viewport scrolling
    - Ensure trees don't overlap

### Minimal Working Version Goals

By end of Phase 1, we should have:

1. ✅ Trees rendering in the margin from text syntax
2. ✅ Basic node hierarchy visualization
3. ✅ Document changes trigger re-render
4. ✅ Multiple trees per document support
5. ✅ Theme-compatible styling

### What We're NOT Doing in Phase 1

- ❌ Complex node types or styling
- ❌ Performance optimizations
- ❌ Error handling beyond basics
- ❌ Settings UI (just defaults)
- ❌ Click interactions
- ❌ Fancy animations

This approach leverages the excellent architecture from the arrows plugin while completely replacing the visualization layer with D3.js trees. The ViewPlugin pattern and syntax matching can be largely reused, which should accelerate development.

Would you like me to adjust any part of this plan? I can also create the initial file templates to get you started quickly.