// Core ViewPlugin implementation
// Parse syntax, create tree data structure, render with D3
// Handle margin positioning

import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, ViewUpdate, Decoration, DecorationSet, ViewPlugin, WidgetType } from "@codemirror/view";
import { MatchDecoratorAll } from "./matchDecoratorAll";
import { TreeRenderer, RenderConstraints } from "./treeRenderer";
import { NodeSyntaxData, TreeData } from './types';
import { rangeWithinExcludedContext } from './utils';
import { parseNodeSyntax, buildTree, groupNodesByTree, sortTreesByPosition } from './treeParser';
import { getTreeConfigFromView } from './treeConfig';

// RegEx for tree node syntax: {node_id|parent_id|label}
// This must be a global regex for MatchDecoratorAll to work properly
const nodeSyntaxRegex = /{([^{}|]+)\|([^{}|]+)(?:\|([^{}]*))?}/g;

// Constants for CSS classes
const NODE_SYNTAX_CLASS = "discourse-tree-node-syntax";
const TREE_CONTAINER_CLASS = "discourse-tree-container";

// Add console logging to help debug
function debug(message: string, ...data: any[]) {
    console.log(`[1Bracket] ${message}`, ...data);
}

/**
 * MatchDecorator for finding node syntax in the document
 */
const nodeSyntaxHighlighter = new MatchDecoratorAll({
    regexp: nodeSyntaxRegex,
    decoration: (match, view, pos) => {
        const nodeText = match[0];  // The full match, including brackets
        const nodeSyntaxData = parseNodeSyntax(nodeText, pos, pos + nodeText.length);
        
        debug("Found node syntax:", nodeText, "at position:", pos, "parsed data:", nodeSyntaxData);
        
        if (!nodeSyntaxData) {
            debug("Failed to parse node syntax:", nodeText);
            return Decoration.mark({
                tagName: "span",
                class: NODE_SYNTAX_CLASS + " error",
            });
        }
        
        return Decoration.mark({
            tagName: "span",
            class: NODE_SYNTAX_CLASS,
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

    constructor(view: EditorView) {
        debug("Initializing TreeViewPlugin");
        // Create a container to hold the trees
        this.createContainer(view);
        this.treeRenderer = new TreeRenderer(view, this.container);
        this.initializeTrees(view);
    }

    createContainer(view: EditorView) {
        debug("Creating container for trees");
        const container = document.createElement("div");
        container.classList.add(TREE_CONTAINER_CLASS);
        view.scrollDOM.prepend(container);
        this.container = container;
        
        // Add debugging info to make sure container is created
        container.style.border = "1px solid red";
        container.style.zIndex = "9999";
        
        // Add a debug text node
        const debugText = document.createElement("div");
        debugText.textContent = "1Bracket container";
        debugText.style.position = "absolute";
        debugText.style.right = "0";
        debugText.style.top = "0";
        debugText.style.background = "rgba(255,0,0,0.2)";
        debugText.style.padding = "5px";
        debugText.style.color = "white";
        debugText.style.fontSize = "10px";
        debugText.style.pointerEvents = "none";
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
            
            const nodeCollections = groupNodesByTree(nodeData);
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
            
            // Create decorations for node syntax
            const decos = this.createNodeDecorations(nodeData, view);
            this.decorations = decos;

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
            this.decorations = Decoration.none;
            this.treeRenderer.removeAllTrees();
            debug("No nodes found, cleared trees");
            return;
        }
        
        const nodeCollections = groupNodesByTree(nodeData);
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
        
        // Create decorations for node syntax
        const decos = this.createNodeDecorations(nodeData, update.view);
        this.decorations = decos;

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
     * Create decorations for node syntax
     */
    createNodeDecorations(nodeData: NodeSyntaxData[], view: EditorView): DecorationSet {
        const decos: any[] = [];

        for (const node of nodeData) {
            // Create a prettified node widget or a simple marker decoration
            const deco = Decoration.replace({
                widget: new PrettifiedNode(node, getTreeConfigFromView(view)),
                inclusive: false,
                block: false,
                nodeSyntaxData: node
            }).range(node.from, node.to);

            decos.push(deco);
        }

        return Decoration.set(decos, true);
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
        
        // Render each tree
        for (const treeData of this.trees) {
            debug("Rendering tree:", treeData);
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
                debug("Tree rendered, positioning SVG");
                // Position the SVG at the correct document position
                this.treeRenderer.positionTreeSVG(svg, treeData.position);
            } else {
                debug("Failed to render tree");
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
 * Widget for rendering a prettified node in the document
 */
class PrettifiedNode extends WidgetType {
    private readonly nodeData: NodeSyntaxData;
    private readonly settings: any;

    constructor(nodeData: NodeSyntaxData, settings: any) {
        super();
        this.nodeData = nodeData;
        this.settings = settings;
    }

    eq(other: PrettifiedNode) {
        return (
            other.nodeData.id === this.nodeData.id &&
            other.nodeData.parentId === this.nodeData.parentId &&
            other.nodeData.label === this.nodeData.label
        );
    }

    toDOM() {
        const span = document.createElement("span");
        span.style.color = this.settings.defaultNodeColor;
        span.className = "tree-node-syntax";
        span.setAttribute('data-node-id', this.nodeData.id);
        span.setAttribute('data-parent-id', this.nodeData.parentId);
        
        // Use a symbol to represent the node
        span.textContent = "⬥"; // Diamond symbol
        
        // Add tooltip with node information
        span.title = `Node: ${this.nodeData.id}\nParent: ${this.nodeData.parentId}\nLabel: ${this.nodeData.label}`;
        
        return span;
    }

    ignoreEvent() {
        return false;
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
        }
    }
);