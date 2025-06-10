// Parse {node_id|parent_id|label} syntax
// Build tree from flat list
// Handle orphaned nodes

import { NodeSyntaxData, TreeNode, TreeData, NodeCollection } from "./types";

// RegExp for parsing the tree node syntax: {node_id|parent_id|label}
// node_id: required - unique identifier for this node
// parent_id: required - identifier of parent node (use "root" for top-level nodes)
// label: optional - text label for the node
export const nodeRegex = /{([^{}|]+)\|([^{}|]+)(?:\|([^{}]*))?}/;

/**
 * Parse the node syntax from text to create a NodeSyntaxData object
 */
export function parseNodeSyntax(nodeText: string, from: number, to: number, paragraphStart?: number, paragraphEnd?: number): NodeSyntaxData | null {
    // We're debugging, so log the nodeText
    console.log(`[1Bracket] Parsing node syntax: "${nodeText}"`);
    
    // Reset the regex to ensure we start from the beginning
    nodeRegex.lastIndex = 0;
    
    const match = nodeRegex.exec(nodeText);
    console.log(`[1Bracket] Match result:`, match);
    
    if (!match) {
        console.log(`[1Bracket] No match found for: "${nodeText}"`);
        return null;
    }

    const [_, id, parentId, label] = match;
    
    const result = {
        id: id.trim(),
        parentId: parentId.trim(),
        label: label ? label.trim() : "",
        from,
        to,
        paragraphStart,
        paragraphEnd
    };
    
    console.log(`[1Bracket] Parsed node:`, result);
    return result;
}

/**
 * Build a tree structure from a flat list of nodes
 */
export function buildTree(nodeCollection: NodeCollection): TreeData[] {
    console.log(`[1Bracket] Building tree from node collection:`, nodeCollection);
    
    const nodesById = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];
    const trees: TreeData[] = [];
    const nodeHasChildren = new Set<string>();
    const nodeHasParent = new Set<string>();
    
    // Sort nodes by their document position to ensure consistent ordering
    const sortedNodes = [...nodeCollection.nodes].sort((a, b) => a.from - b.from);
    
    // First pass - create TreeNode objects for each node and organize by ID
    for (const node of sortedNodes) {
        const treeNode: TreeNode = {
            id: node.id,
            parentId: node.parentId === "root" ? undefined : node.parentId,
            label: node.label,
            children: [],
            position: node.from,
            // Mark if this is a standalone node (no parent, no children)
            isStandalone: true
        };
        
        nodesById.set(node.id, treeNode);
    }
    
    console.log(`[1Bracket] Created nodes by ID:`, Array.from(nodesById.entries()));
    
    // Second pass - build the tree structure by connecting parents and children
    // Track processed relationships to prevent circular references
    const processedRelationships = new Set<string>();
    
    for (const node of sortedNodes) {
        const treeNode = nodesById.get(node.id);
        if (!treeNode) continue;
        
        // If this is a root node (no parent or parent is "root")
        if (node.parentId === "root" || !node.parentId) {
            rootNodes.push(treeNode);
            console.log(`[1Bracket] Added root node:`, treeNode);
        } else {
            // Find the parent node
            const parentNode = nodesById.get(node.parentId);
            if (parentNode) {
                // Check for circular reference
                const relationshipKey = `${node.id}->${node.parentId}`;
                const reverseRelationshipKey = `${node.parentId}->${node.id}`;
                
                if (processedRelationships.has(reverseRelationshipKey)) {
                    console.warn(`[1Bracket] Circular reference detected between ${node.id} and ${node.parentId}, treating ${node.id} as root`);
                    rootNodes.push(treeNode);
                    continue;
                }
                
                // Prevent a node from being its own parent
                if (node.id === node.parentId) {
                    console.warn(`[1Bracket] Node ${node.id} cannot be its own parent, treating as root`);
                    rootNodes.push(treeNode);
                    continue;
                }
                
                processedRelationships.add(relationshipKey);
                
                if (!parentNode.children) {
                    parentNode.children = [];
                }
                // Add this node as a child of its parent
                parentNode.children.push(treeNode);
                
                // Mark that this node has a parent and the parent has children
                nodeHasParent.add(treeNode.id);
                nodeHasChildren.add(parentNode.id);
                
                // Update the standalone status
                treeNode.isStandalone = false;
                parentNode.isStandalone = false;
                
                console.log(`[1Bracket] Added child node ${treeNode.id} to parent ${parentNode.id}`);
            } else {
                // Parent node not found - treat as a root
                rootNodes.push(treeNode);
                console.log(`[1Bracket] Parent node ${node.parentId} not found for ${treeNode.id}, treating as root`);
            }
        }
    }
    
    // Identify true standalone nodes that have no connections
    for (const [id, node] of nodesById.entries()) {
        // A true standalone node has no parent and no children
        node.isStandalone = !nodeHasParent.has(id) && !nodeHasChildren.has(id);
        
        if (node.isStandalone) {
            console.log(`[1Bracket] Identified standalone node: ${id}`);
            
            // For standalone nodes, we set their children to an empty array
            // to ensure they're treated consistently
            node.children = [];
        }
    }
    
    console.log(`[1Bracket] Found ${rootNodes.length} root nodes`);
    
    // Sort the root nodes to handle standalone nodes last
    // This ensures that standalone nodes will be processed separately
    rootNodes.sort((a, b) => {
        // If one is standalone and the other isn't, the standalone comes last
        if (a.isStandalone && !b.isStandalone) return 1;
        if (!a.isStandalone && b.isStandalone) return -1;
        // Otherwise, sort by position
        return (a.position || 0) - (b.position || 0);
    });
    
    // Create separate TreeData objects for standalone nodes
    // and normal connected trees
    for (const root of rootNodes) {
        // Only create a tree if it has at least one node
        if (root) {
            const treeData = {
                root,
                position: root.position || 0,
                paragraphStart: nodeCollection.paragraphStart,
                paragraphEnd: nodeCollection.paragraphEnd,
                // Mark the entire tree as standalone if its root is standalone
                isStandaloneTree: root.isStandalone || false
            };
            trees.push(treeData);
            
            if (root.isStandalone) {
                console.log(`[1Bracket] Created standalone tree with root node:`, root);
            } else {
                console.log(`[1Bracket] Created connected tree with root node:`, root);
            }
        }
    }
    
    console.log(`[1Bracket] Returning ${trees.length} trees`);
    return trees;
}

/**
 * Group nodes by paragraph
 * This identifies separate trees based on paragraph boundaries
 */
export function groupNodesByParagraph(nodes: NodeSyntaxData[]): NodeCollection[] {
    console.log(`[1Bracket] Grouping ${nodes.length} nodes by paragraph`);
    
    const collections: NodeCollection[] = [];
    const paragraphGroups = new Map<string, NodeSyntaxData[]>();
    const nodesWithoutParagraphs: NodeSyntaxData[] = [];
    
    // Group nodes by their paragraph boundaries
    for (const node of nodes) {
        if (!node.paragraphStart || !node.paragraphEnd) {
            console.log(`[1Bracket] Node missing paragraph boundaries, adding to fallback group:`, node);
            nodesWithoutParagraphs.push(node);
            continue;
        }
        
        const paragraphKey = `${node.paragraphStart}-${node.paragraphEnd}`;
        if (!paragraphGroups.has(paragraphKey)) {
            paragraphGroups.set(paragraphKey, []);
        }
        
        paragraphGroups.get(paragraphKey)?.push(node);
    }
    
    // Create a collection for each paragraph
    for (const [key, paragraphNodes] of paragraphGroups.entries()) {
        if (paragraphNodes.length > 0) {
            // All nodes in this group have the same paragraph boundaries
            const paragraphStart = paragraphNodes[0].paragraphStart;
            const paragraphEnd = paragraphNodes[0].paragraphEnd;
            
            const collection = { 
                nodes: paragraphNodes,
                paragraphStart,
                paragraphEnd
            };
            
            collections.push(collection);
            console.log(`[1Bracket] Created paragraph node collection with ${paragraphNodes.length} nodes:`, collection);
        }
    }
    
    // If we have nodes without paragraph boundaries, create a fallback collection
    if (nodesWithoutParagraphs.length > 0) {
        console.log(`[1Bracket] Creating fallback collection for ${nodesWithoutParagraphs.length} nodes without paragraph boundaries`);
        
        // Use the document position range of these nodes as fallback boundaries
        const positions = nodesWithoutParagraphs.map(n => n.from);
        const minPos = Math.min(...positions);
        const maxPos = Math.max(...nodesWithoutParagraphs.map(n => n.to));
        
        const fallbackCollection = {
            nodes: nodesWithoutParagraphs,
            paragraphStart: minPos,
            paragraphEnd: maxPos
        };
        
        collections.push(fallbackCollection);
        console.log(`[1Bracket] Created fallback collection:`, fallbackCollection);
    }
    
    console.log(`[1Bracket] Created ${collections.length} total collections`);
    return collections;
}

/**
 * Group nodes by their tree structure
 * This identifies separate trees in the document
 */
export function groupNodesByTree(nodes: NodeSyntaxData[]): NodeCollection[] {
    console.log(`[1Bracket] Grouping ${nodes.length} nodes by tree`);
    
    const collections: NodeCollection[] = [];
    const visitedIds = new Set<string>();
    
    // For each node, follow its parent chain to find the root,
    // then collect all nodes that belong to that tree
    for (const node of nodes) {
        if (visitedIds.has(node.id)) {
            continue;
        }
        
        const treeNodes: NodeSyntaxData[] = [];
        const treeIds = new Set<string>();
        const nodesToProcess = [node];
        
        // Process all connected nodes
        while (nodesToProcess.length > 0) {
            const currentNode = nodesToProcess.pop();
            if (!currentNode || treeIds.has(currentNode.id)) {
                continue;
            }
            
            treeNodes.push(currentNode);
            treeIds.add(currentNode.id);
            visitedIds.add(currentNode.id);
            
            // Add all related nodes (children and potential parents)
            for (const otherNode of nodes) {
                if (treeIds.has(otherNode.id)) {
                    continue;
                }
                
                // Check if this is a child of the current node
                if (otherNode.parentId === currentNode.id) {
                    nodesToProcess.push(otherNode);
                }
                
                // Check if this is a parent of the current node
                if (currentNode.parentId === otherNode.id) {
                    nodesToProcess.push(otherNode);
                }
            }
        }
        
        if (treeNodes.length > 0) {
            // Preserve paragraph information if available
            const paragraphStart = node.paragraphStart;
            const paragraphEnd = node.paragraphEnd;
            
            const collection = { 
                nodes: treeNodes,
                paragraphStart,
                paragraphEnd
            };
            
            collections.push(collection);
            console.log(`[1Bracket] Created node collection with ${treeNodes.length} nodes:`, collection);
        }
    }
    
    console.log(`[1Bracket] Created ${collections.length} node collections`);
    return collections;
}

/**
 * Sort trees by document position
 */
export function sortTreesByPosition(trees: TreeData[]): TreeData[] {
    const sorted = [...trees].sort((a, b) => a.position - b.position);
    console.log(`[1Bracket] Sorted ${trees.length} trees by position`);
    
    // Also sort children in each tree by position
    for (const tree of sorted) {
        sortTreeNodeChildren(tree.root);
    }
    
    return sorted;
}

/**
 * Sorts all children in a tree node by their document position
 */
function sortTreeNodeChildren(node: TreeNode, visited: Set<string> = new Set()) {
    if (!node.children || node.children.length === 0) {
        return;
    }
    
    // Prevent infinite loops with circular references
    if (visited.has(node.id)) {
        console.warn(`[1Bracket] Circular reference detected for node: ${node.id}`);
        return;
    }
    
    visited.add(node.id);
    
    // Sort children by position
    node.children.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // Sort children of children recursively
    for (const child of node.children) {
        sortTreeNodeChildren(child, visited);
    }
    
    visited.delete(node.id);
}