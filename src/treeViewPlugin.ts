// Core ViewPlugin implementation
// Parse syntax, create tree data structure, render with D3
// Handle margin positioning

import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, ViewUpdate, Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";
import { MatchDecoratorAll } from "./matchDecoratorAll";
import { TreeRenderer, RenderConstraints } from "./treeRenderer";
import { NodeSyntaxData, TreeData } from './types';
import { rangeWithinExcludedContext } from './utils';
import { parseNodeSyntax, buildTree, groupNodesByTree, groupNodesByParagraph, sortTreesByPosition } from './treeParser';
import { getTreeConfigFromView } from './treeConfig';
import { getParagraphBoundaries } from './utils';

// RegEx for tree node syntax: {node_id|parent_id|label}
// This must be a global regex for MatchDecoratorAll to work properly
const nodeSyntaxRegex = /{([^{}|]+)\|([^{}|]+)(?:\|([^{}]*))?}/g;

// Constants for CSS classes
const NODE_SYNTAX_CLASS = "tree-node-syntax";
const TREE_CONTAINER_CLASS = "discourse-tree-container";
const DEBUG_TEXT_CLASS = "debug-text";

// Add console logging to help debug
function debug(message: string, ...data: any[]) {
    console.log(`[1Bracket] ${message}`, ...data);
}

/**
 * MatchDecorator for finding node syntax in the document
 * Now using mark decorations to ensure text remains editable
 */
const nodeSyntaxHighlighter = new MatchDecoratorAll({
    regexp: nodeSyntaxRegex,
    decoration: (match, view, pos) => {
        const nodeText = match[0];  // The full match, including brackets
        
        // Get paragraph boundaries for this node
        const paragraphBounds = getParagraphBoundaries(pos, view.state);
        
        // Parse the node syntax with paragraph information
        const nodeSyntaxData = parseNodeSyntax(
            nodeText, 
            pos, 
            pos + nodeText.length,
            paragraphBounds.start,
            paragraphBounds.end
        );
        
        debug("Found node syntax:", nodeText, "at position:", pos, "parsed data:", nodeSyntaxData);
        
        if (!nodeSyntaxData) {
            debug("Failed to parse node syntax:", nodeText);
            return Decoration.mark({
                tagName: "span",
                class: NODE_SYNTAX_CLASS + " error",
            });
        }
        
        // Using mark decoration instead of replace to keep text editable
        return Decoration.mark({
            tagName: "span",
            class: NODE_SYNTAX_CLASS,
            attributes: {
                "data-node-id": nodeSyntaxData.id,
                "data-parent-id": nodeSyntaxData.parentId,
                "data-label": nodeSyntaxData.label || "",
                "data-paragraph-start": String(nodeSyntaxData.paragraphStart || ""),
                "data-paragraph-end": String(nodeSyntaxData.paragraphEnd || ""),
                "title": `Node: ${nodeSyntaxData.id}\nParent: ${nodeSyntaxData.parentId}\nLabel: ${nodeSyntaxData.label || ""}`
            },
            nodeSyntaxData
        });
    }
});

// State effect for refreshing trees
export const refreshAllTrees = StateEffect.define();

/**
 * Main ViewPlugin for the discourse tree visualization
 */
export class TreeViewPlugin {
    container: HTMLElement;
    treeRenderer: TreeRenderer;
    nodeSyntaxRanges: DecorationSet;
    trees: TreeData[];
    decorations: DecorationSet;
    isDebugMode: boolean;

    constructor(view: EditorView) {
        debug("Initializing TreeViewPlugin");
        
        // Check for debug mode via URL parameter or localStorage
        this.isDebugMode = window.location.search.includes('debug=true') || 
                           localStorage.getItem('1bracket-debug') === 'true';
        
        // Create a container to hold the trees
        this.createContainer(view);
        this.treeRenderer = new TreeRenderer(view, this.container);
        this.initializeTrees(view);
    }

    createContainer(view: EditorView) {
        debug("Creating container for trees");
        const container = document.createElement("div");
        container.classList.add(TREE_CONTAINER_CLASS);
        
        // Add debug class if in debug mode
        if (this.isDebugMode) {
            container.classList.add('debug-mode');
        }
        
        view.scrollDOM.prepend(container);
        this.container = container;
        
        // Add a debug text node that's only visible in debug mode
        const debugText = document.createElement("div");
        debugText.textContent = "1Bracket container";
        debugText.classList.add(DEBUG_TEXT_CLASS);
        container.appendChild(debugText);
    }

    initializeTrees(view: EditorView) {
        debug("Initializing trees");
        this.nodeSyntaxRanges = nodeSyntaxHighlighter.createDeco(view);
        this.decorations = Decoration.none;
        this.trees = [];

        // Wait until syntax tree is ready and widgets have been rendered in the DOM
        setTimeout(() => {
            debug("Extracting node data");
            const nodeData = this.extractNodeData(this.nodeSyntaxRanges, view.state);
            debug("Found node data:", nodeData);
            
            if (nodeData.length === 0) {
                debug("No node data found");
                return;
            }
            
            // Get the tree config to check the orientation
            const settings = getTreeConfigFromView(view);
            
            // Always use paragraph-scoped trees for better organization
            const nodeCollections = groupNodesByParagraph(nodeData);
                
            debug("Node collections:", nodeCollections);
            
            // Build tree structures from node collections
            this.trees = [];
            for (const collection of nodeCollections) {
                const treesForCollection = buildTree(collection);
                debug("Built trees for collection:", treesForCollection);
                this.trees.push(...treesForCollection);
            }
            
            // Sort trees by position in the document
            this.trees = sortTreesByPosition(this.trees);
            debug("Sorted trees:", this.trees);

            // Render all trees
            this.renderTrees(view);
        }, 500); // Increased timeout to ensure DOM is ready
    }

    update(update: ViewUpdate) {
        debug("Update called");
        let shouldRefreshAllTrees = false;
        for (const transaction of update.transactions) {
            for (const effect of transaction.effects) {
                if (effect.is(refreshAllTrees)) {
                    shouldRefreshAllTrees = true;
                    break;
                }
            }
        }
        
        if (shouldRefreshAllTrees) {
            debug("Refreshing all trees");
            this.treeRenderer.removeAllTrees();
            this.initializeTrees(update.view);
            return;
        }

        // Update tree nodes and rendering
        this.nodeSyntaxRanges = nodeSyntaxHighlighter.updateDeco(update, this.nodeSyntaxRanges);
        this.decorations = this.nodeSyntaxRanges;
        
        // Skip further processing if there are no document changes
        if (!update.docChanged) {
            debug("No document changes, skipping update");
            return;
        }
        
        debug("Document changed, updating trees");
        const nodeData = this.extractNodeData(this.nodeSyntaxRanges, update.state);
        debug("Updated node data:", nodeData);
        
        if (nodeData.length === 0) {
            // If no nodes found, clear everything
            this.trees = [];
            this.treeRenderer.removeAllTrees();
            debug("No nodes found, cleared trees");
            return;
        }
        
        // Get the tree config to check the orientation
        const settings = getTreeConfigFromView(update.view);
        
        // Always use paragraph-scoped trees for better organization
        const nodeCollections = groupNodesByParagraph(nodeData);
            
        debug("Updated node collections:", nodeCollections);
        
        // Build tree structures from node collections
        this.trees = [];
        for (const collection of nodeCollections) {
            const treesForCollection = buildTree(collection);
            debug("Built updated trees:", treesForCollection);
            this.trees.push(...treesForCollection);
        }
        
        // Sort trees by position in the document
        this.trees = sortTreesByPosition(this.trees);

        // Wait until widgets have been rendered in the DOM
        setTimeout(() => {
            this.renderTrees(update.view);
        }, 100);
    }

    destroy() {
        debug("Destroying TreeViewPlugin");
        this.treeRenderer.removeAllTrees();
        this.container.remove();
    }

    /**
     * Extract node data from decorations
     */
    extractNodeData(nodeSyntaxRanges: DecorationSet, state: EditorState): NodeSyntaxData[] {
        const rangeCursor = nodeSyntaxRanges.iter();
        const nodeData: NodeSyntaxData[] = [];

        while (rangeCursor.value != null) {
            const from = rangeCursor.from;
            const to = rangeCursor.to;

            // Skip nodes that are within excluded contexts (code blocks, etc.)
            if (rangeWithinExcludedContext(from, to, state)) {
                rangeCursor.next();
                continue;
            }

            const data = rangeCursor.value.spec.nodeSyntaxData;
            if (!data) {
                rangeCursor.next();
                continue;
            }

            nodeData.push(data);
            rangeCursor.next();
        }

        return nodeData;
    }

    /**
     * Render all trees in the document
     */
    renderTrees(view: EditorView) {
        debug("Rendering trees, count:", this.trees.length);
        // Clear existing trees
        this.treeRenderer.removeAllTrees();
        
        if (this.trees.length === 0) {
            debug("No trees to render");
            return;
        }
        
        // Get settings
        const settings = getTreeConfigFromView(view);
        const isVertical = settings.treeOrientation === "vertical";
        
        // Separate standalone trees and connected trees
        const connectedTrees = this.trees.filter(tree => !tree.isStandaloneTree);
        const standaloneTrees = this.trees.filter(tree => tree.isStandaloneTree);
        
        debug(`Separated trees: ${connectedTrees.length} connected, ${standaloneTrees.length} standalone`);
        
        // First render all connected trees
        for (const treeData of connectedTrees) {
            debug("Rendering connected tree:", treeData);
            // Define constraints for the tree rendering
            const constraints: RenderConstraints = {
                width: settings.marginWidth,
                height: this.calculateTreeHeight(treeData, view),
                marginTop: 10,
                marginRight: 10,
                marginBottom: 10,
                marginLeft: 30
            };
            
            // Render the tree
            const svg = this.treeRenderer.renderTree(treeData, constraints);
            
            if (svg) {
                debug("Connected tree rendered, positioning SVG");
                
                // Always use paragraph boundaries for positioning if available
                if (treeData.paragraphStart !== undefined) {
                    // Position at the paragraph boundary
                    this.treeRenderer.positionTreeSVG(svg, treeData.paragraphStart);
                } else {
                    // Fallback to root node position
                    this.treeRenderer.positionTreeSVG(svg, treeData.position);
                }
            } else {
                debug("Failed to render connected tree");
            }
        }
        
        // Then render all standalone trees with special treatment
        for (const treeData of standaloneTrees) {
            debug("Rendering standalone tree:", treeData);
            
            // For standalone trees, we use different constraints to position them on the right
            const constraints: RenderConstraints = {
                width: settings.marginWidth,
                height: this.calculateTreeHeight(treeData, view),
                marginTop: 10,
                marginRight: 10,
                marginBottom: 10,
                marginLeft: 30,
                // Add special flag for standalone trees
                isStandaloneTree: true
            };
            
            // Render the standalone tree
            const svg = this.treeRenderer.renderTree(treeData, constraints);
            
            if (svg) {
                debug("Standalone tree rendered, positioning SVG");
                svg.classList.add('standalone-tree'); // Add special class for CSS styling
                
                // Always use paragraph boundaries for positioning if available
                if (treeData.paragraphStart !== undefined) {
                    // Position at the paragraph boundary
                    this.treeRenderer.positionTreeSVG(svg, treeData.paragraphStart);
                } else {
                    // Fallback to root node position
                    this.treeRenderer.positionTreeSVG(svg, treeData.position);
                }
            } else {
                debug("Failed to render standalone tree");
            }
        }
    }
    
    /**
     * Calculate an appropriate height for the tree visualization
     */
    private calculateTreeHeight(treeData: TreeData, view: EditorView): number {
        // A simple heuristic: estimate based on number of nodes
        // For a more accurate calculation, we'd need to analyze the tree structure
        
        // Count nodes in the tree
        let nodeCount = 0;
        const countNodes = (node: any) => {
            nodeCount++;
            if (node.children) {
                node.children.forEach(countNodes);
            }
        };
        
        countNodes(treeData.root);
        
        // Base height with minimum
        const baseHeight = Math.max(100, nodeCount * 40);
        
        // Calculate distance between first and last node in document
        let firstPos = treeData.position;
        let lastPos = treeData.position;
        
        const findPositions = (node: any) => {
            const pos = node.position;
            if (pos !== undefined) {
                firstPos = Math.min(firstPos, pos);
                lastPos = Math.max(lastPos, pos);
            }
            if (node.children) {
                node.children.forEach(findPositions);
            }
        };
        
        findPositions(treeData.root);
        
        // Get coordinate information
        const firstCoords = view.coordsAtPos(firstPos);
        const lastCoords = view.coordsAtPos(lastPos);
        
        if (firstCoords && lastCoords) {
            // Use distance between nodes in document as a guide
            const docDistance = lastCoords.top - firstCoords.top;
            return Math.max(baseHeight, docDistance + 40);
        }
        
        return baseHeight;
    }
}

/**
 * Create the ViewPlugin instance
 */
export const treeViewPlugin = ViewPlugin.fromClass(
    TreeViewPlugin,
    {
        decorations: v => v.decorations,
        eventHandlers: {
            // Event handlers could be added here for interactivity
            mousedown: (e, view) => {
                const target = e.target as HTMLElement;
                // Check if we're clicking on a tree node circle
                if (target.tagName.toLowerCase() === 'circle' && target.closest('.tree-node')) {
                    debug("Tree node clicked", target);
                    // Could add interaction here
                    e.preventDefault();
                    return true;
                }
                return false;
            }
        }
    }
);