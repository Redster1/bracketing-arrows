// TypeScript interfaces for tree nodes, settings, etc.

export interface TreeNode {
  id: string;
  parentId?: string;
  label?: string;
  children?: TreeNode[];
  // Position data added by D3
  x?: number;
  y?: number;
  // Document position for the node
  position?: number;
  // Whether this is a standalone node (no parent, no children)
  isStandalone?: boolean;
}

export interface TreeData {
  root: TreeNode;
  position: number; // Document position of the tree root
  paragraphStart?: number; // Start position of the containing paragraph
  paragraphEnd?: number;   // End position of the containing paragraph
}

export interface NodeSyntaxData {
  id: string;
  parentId: string;
  label: string;
  from: number;
  to: number;
  paragraphStart?: number; // Start position of the containing paragraph
  paragraphEnd?: number;   // End position of the containing paragraph
}

// Collection of nodes before they're organized into a tree structure
export interface NodeCollection {
  nodes: NodeSyntaxData[];
  paragraphStart?: number; // Start position of the paragraph containing these nodes
  paragraphEnd?: number;   // End position of the paragraph containing these nodes
}