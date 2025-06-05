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
export function parseNodeSyntax(nodeText: string, from: number, to: number): NodeSyntaxData | null {
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
        to
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
    
    // First pass - create TreeNode objects for each node and organize by ID
    for (const node of nodeCollection.nodes) {
        const treeNode: TreeNode = {
            id: node.id,
            parentId: node.parentId === "root" ? undefined : node.parentId,
            label: node.label,
            children: [],
            position: node.from
        };
        
        nodesById.set(node.id, treeNode);
    }
    
    console.log(`[1Bracket] Created nodes by ID:`, Array.from(nodesById.entries()));
    
    // Second pass - build the tree structure by connecting parents and children
    for (const node of nodeCollection.nodes) {
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
                if (!parentNode.children) {
                    parentNode.children = [];
                }
                // Add this node as a child of its parent
                parentNode.children.push(treeNode);
                console.log(`[1Bracket] Added child node ${treeNode.id} to parent ${parentNode.id}`);
            } else {
                // Parent node not found - treat as a root
                rootNodes.push(treeNode);
                console.log(`[1Bracket] Parent node ${node.parentId} not found for ${treeNode.id}, treating as root`);
            }
        }
    }
    
    console.log(`[1Bracket] Found ${rootNodes.length} root nodes`);
    
    // Create a TreeData object for each root node
    for (const root of rootNodes) {
        // Only create a tree if it has at least one node
        if (root) {
            const treeData = {
                root,
                position: root.position || 0
            };
            trees.push(treeData);
            console.log(`[1Bracket] Created tree with root node:`, root);
        }
    }
    
    console.log(`[1Bracket] Returning ${trees.length} trees`);
    return trees;
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
            const collection = { nodes: treeNodes };
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
    return sorted;
}