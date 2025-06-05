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
}

export interface TreeData {
  root: TreeNode;
  position: number; // Document position of the tree root
}

export interface NodeSyntaxData {
  id: string;
  parentId: string;
  label: string;
  from: number;
  to: number;
}

// Collection of nodes before they're organized into a tree structure
export interface NodeCollection {
  nodes: NodeSyntaxData[];
}