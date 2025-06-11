# Auto Node Creation Test

## Test 1: Basic progression from simple node

{1|root|First node} This is the first node.

## Test 2: Node with complex ID  

{MyNode|root|Complex ID} This is a complex node ID.

## Test 3: Multiple nodes in same paragraph

{parent|root|Parent} This is the parent node. {child1|parent|Child 1} First child. 

## Test 4: Test progression through alphabet

{test|root|Test} Base test node.

{testa|root|Test A} Should become testb when pressing Enter.

{testz|root|Test Z} Should become testaa when pressing Enter.

## Test 5: Empty paragraph (should not trigger)

Normal text without any tree nodes.

## Test 6: Mixed content

{node1|root|Node 1} Some text here. More text and then {node2|root|Node 2} second node.