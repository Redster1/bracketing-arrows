# Testing Standalone Node Alignment

## Basic Tree Structure

{node1|root|Root Node} This is the root node.

{node2|node1|Child 1} This is a child of the root node.

{node3|node1|Child 2} This is another child of the root node.

{node4|node2|Leaf 1} This is a leaf node (child of Child 1).

{node5|node3|Leaf 2} This is another leaf node (child of Child 2).

## Standalone Nodes (Should Align with Leaf Nodes)

{standalone1|root|Standalone 1} This is a standalone node with no children.

{standalone2|root|Standalone 2} This is another standalone node with no children.

## Mixed Case

{mixed1|root|Mixed Root} This is a root node.

{mixed2|mixed1|Child} This is a child node.

{standalone3|root|Standalone 3} This is a standalone node that should align with the leaf node.