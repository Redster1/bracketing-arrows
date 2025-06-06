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
            
            // Check orientation from settings
            const isVertical = settings.treeOrientation === "vertical";
            
            // Create a tree layout based on orientation
            const treeLayout = tree<TreeNode>();
            
            if (isVertical) {
                // Top-down orientation (vertical)
                treeLayout.size([innerWidth, innerHeight]); 
            } else {
                // Left-to-right orientation (horizontal)
                treeLayout.size([innerHeight, innerWidth]);
            }
            
            // Apply the layout to the hierarchy
            const nodes = treeLayout(root);
            
            // Align leaf nodes to the same X position
            this.alignLeafNodes(nodes, isVertical);
            
            // First create links (lower z-index)
            this.renderBracketLinks(g, nodes, settings, isVertical);
            
            // Then create nodes (higher z-index)
            this.renderNodes(g, nodes, settings, isVertical);
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
    private renderBracketLinks(g: SVGGElement, rootNode: HierarchyNode<TreeNode>, settings: any, isVertical = false) {
        rootNode.links().forEach(link => {
            const source = link.source;
            const target = link.target;
            
            let pathData = "";
            
            if (isVertical) {
                // Top-down orientation - vertical links
                // Calculate the midpoint between source and target for the grid-style link
                const midY = ((source.y || 0) + (target.y || 0)) / 2;
                
                // Create the path using straight lines with right angles (bracket style)
                pathData = `
                    M ${source.x} ${source.y}
                    L ${source.x} ${midY}
                    L ${target.x} ${midY}
                    L ${target.x} ${target.y}
                `;
            } else {
                // Left-to-right orientation - horizontal links
                // Calculate the midpoint between source and target for the grid-style link
                const midX = ((source.y || 0) + (target.y || 0)) / 2;
                
                // Create the path using straight lines with right angles (bracket style)
                pathData = `
                    M ${source.y} ${source.x}
                    L ${midX} ${source.x}
                    L ${midX} ${target.x}
                    L ${target.y} ${target.x}
                `;
            }
            
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
    private renderNodes(g: SVGGElement, rootNode: HierarchyNode<TreeNode>, settings: any, isVertical = false) {
        // For each node in the hierarchy
        rootNode.descendants().forEach(node => {
            const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            
            // Position based on orientation
            if (isVertical) {
                // Top-down orientation
                nodeGroup.setAttribute("transform", `translate(${node.x},${node.y})`);
            } else {
                // Left-to-right orientation
                nodeGroup.setAttribute("transform", `translate(${node.y},${node.x})`);
            }
            
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
                
                if (isVertical) {
                    // Position labels below nodes for top-down tree
                    text.setAttribute("y", "15");
                    text.setAttribute("x", "0");
                    text.setAttribute("text-anchor", "middle");
                } else {
                    // Position labels to the right of nodes for left-to-right tree
                    text.setAttribute("x", "8");
                    text.setAttribute("text-anchor", "start");
                }
                
                // Create a background rectangle for the text (optional)
                if (node.data.label && node.data.label.trim() !== "") {
                    // Add a transparent background rectangle to ensure text is readable
                    text.setAttribute("font-size", `${settings.nodeFontSize}px`);
                    text.setAttribute("fill", settings.defaultNodeColor);
                    text.textContent = node.data.label;
                    
                    // Add a higher z-index to ensure text is above lines
                    nodeGroup.appendChild(text);
                }
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
    
    /**
     * Aligns all leaf nodes to the same position on the X-axis (or Y-axis in vertical mode)
     */
    private alignLeafNodes(root: HierarchyNode<TreeNode>, isVertical: boolean) {
        // Find all leaf nodes (nodes without children)
        const leafNodes: HierarchyNode<TreeNode>[] = [];
        
        // Function to recursively find leaf nodes
        const findLeafNodes = (node: HierarchyNode<TreeNode>) => {
            if (!node.children || node.children.length === 0) {
                leafNodes.push(node);
            } else {
                for (const child of node.children) {
                    findLeafNodes(child);
                }
            }
        };
        
        // Start the recursive search from the root
        findLeafNodes(root);
        
        // If no leaf nodes found, nothing to do
        if (leafNodes.length === 0) return;
        
        if (isVertical) {
            // For vertical orientation, align Y positions
            const maxY = Math.max(...leafNodes.map(node => node.y || 0));
            leafNodes.forEach(node => {
                node.y = maxY;
            });
        } else {
            // For horizontal orientation, align X positions (stored in y in horizontal layout)
            const maxX = Math.max(...leafNodes.map(node => node.y || 0));
            leafNodes.forEach(node => {
                node.y = maxX;
            });
        }
    }
}