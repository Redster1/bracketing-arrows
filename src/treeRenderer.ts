// D3.js rendering logic
// SVG generation
// Tree layout algorithms
// Margin constraints

import { hierarchy, tree, HierarchyNode, HierarchyLink } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { TreeNode, TreeData } from './types';
import { getTreeConfigFromView } from './treeConfig';
import { EditorView } from '@codemirror/view';

export interface RenderConstraints {
    width: number;
    height: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
}

export class TreeRenderer {
    private view: EditorView;
    private container: HTMLElement;
    
    constructor(view: EditorView, container: HTMLElement) {
        this.view = view;
        this.container = container;
    }
    
    /**
     * Render a tree using D3.js within the specified constraints
     */
    renderTree(treeData: TreeData, constraints: RenderConstraints): SVGElement | null {
        if (!treeData || !treeData.root) {
            console.log("[1Bracket] No valid tree data to render");
            return null;
        }
        
        const settings = getTreeConfigFromView(this.view);
        
        // Create SVG container
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("discourse-tree-svg");
        svg.setAttribute("width", constraints.width.toString());
        svg.setAttribute("height", constraints.height.toString());
        
        // Define margins
        const margin = {
            top: constraints.marginTop || 20,
            right: constraints.marginRight || 20,
            bottom: constraints.marginBottom || 20,
            left: constraints.marginLeft || 70  // More space on the left for labels
        };
        
        // Calculate inner dimensions
        const innerWidth = constraints.width - margin.left - margin.right;
        const innerHeight = constraints.height - margin.top - margin.bottom;
        
        // Create the root group and translate it to respect margins
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
        svg.appendChild(g);
        
        try {
            // Create a D3 hierarchy from the tree data
            const root = hierarchy(treeData.root) as HierarchyNode<TreeNode>;
            
            // Create a tree layout - using flipped coordinates for left-to-right orientation
            const treeLayout = tree<TreeNode>()
                .size([innerHeight, innerWidth]);  // Note: swapped for horizontal layout
            
            // Apply the layout to the hierarchy
            const nodes = treeLayout(root);
            
            // Create links - using tournament bracket style
            this.renderBracketLinks(g, nodes, settings);
            
            // Create nodes
            this.renderNodes(g, nodes, settings);
        } catch (error) {
            console.error("[1Bracket] Error rendering tree:", error);
            // Create a simple error message in the SVG
            const errorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            errorText.setAttribute("x", "10");
            errorText.setAttribute("y", "20");
            errorText.setAttribute("fill", "red");
            errorText.textContent = "Error rendering tree";
            g.appendChild(errorText);
        }
        
        // Add the SVG to the container
        return svg;
    }
    
    /**
     * Render the connections between nodes using tournament bracket style
     */
    private renderBracketLinks(g: SVGGElement, rootNode: HierarchyNode<TreeNode>, settings: any) {
        rootNode.links().forEach(link => {
            const source = link.source;
            const target = link.target;
            
            // Calculate the midpoint between source and target for the grid-style link
            const midX = (source.y + target.y) / 2;
            
            // Create the path using straight lines with right angles (bracket style)
            const pathData = `
                M ${source.y} ${source.x}
                L ${midX} ${source.x}
                L ${midX} ${target.x}
                L ${target.y} ${target.x}
            `;
            
            // Create the path element
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            path.classList.add("tree-link");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", settings.defaultNodeColor);
            path.setAttribute("stroke-width", settings.lineWidth.toString());
            
            g.appendChild(path);
        });
    }
    
    /**
     * Render the tree nodes and their labels
     */
    private renderNodes(g: SVGGElement, rootNode: HierarchyNode<TreeNode>, settings: any) {
        // For each node in the hierarchy
        rootNode.descendants().forEach(node => {
            const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            nodeGroup.setAttribute("transform", `translate(${node.y},${node.x})`);
            nodeGroup.classList.add("tree-node");
            nodeGroup.setAttribute("data-node-id", node.data.id);
            
            // Create the node circle
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("r", settings.nodeSize.toString());
            circle.setAttribute("fill", settings.defaultNodeColor);
            nodeGroup.appendChild(circle);
            
            // Create the node label
            if (node.data.label) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("dy", "0.31em");
                
                // Position labels to the right of nodes for left-to-right tree
                text.setAttribute("x", "8");
                text.setAttribute("text-anchor", "start");
                
                text.setAttribute("font-size", `${settings.nodeFontSize}px`);
                text.setAttribute("fill", settings.defaultNodeColor);
                text.textContent = node.data.label;
                nodeGroup.appendChild(text);
            }
            
            g.appendChild(nodeGroup);
        });
    }
    
    /**
     * Position an SVG tree at the correct document position
     */
    positionTreeSVG(svg: SVGElement, treePosition: number) {
        const pos = this.view.coordsAtPos(treePosition);
        if (!pos) {
            console.log("[1Bracket] Unable to get coordinates for position:", treePosition);
            return;
        }
        
        // Position the SVG at the correct document position
        svg.style.position = "absolute";
        svg.style.top = `${pos.top}px`;
        svg.style.left = "0";
        
        // Add the SVG to the container
        this.container.appendChild(svg);
        
        console.log(`[1Bracket] Positioned tree at top: ${pos.top}px, left: 0`);
    }
    
    /**
     * Remove all tree SVGs from the container
     */
    removeAllTrees() {
        const trees = this.container.querySelectorAll(".discourse-tree-svg");
        trees.forEach(tree => tree.remove());
    }
}