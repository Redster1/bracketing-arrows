import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { generateNextNodeId, getAllExistingNodeIds, isInTreeParagraphButNotInSyntax } from './utils';

/**
 * Create a ViewPlugin that detects newlines and adds node syntax
 */
function createAutoNodeViewPlugin(): Extension {
    return ViewPlugin.fromClass(class {
        lastDocLength: number = 0;
        
        constructor(view: EditorView) {
            this.lastDocLength = view.state.doc.length;
        }
        
        update(update: ViewUpdate) {
            console.log(`[1Bracket] AutoNode update called, docChanged: ${update.docChanged}`);
            
            if (!update.docChanged) {
                return;
            }
            
            console.log(`[1Bracket] AutoNode processing doc changes`);
            
            // Check if document got longer (likely indicating text was added)
            const newDocLength = update.state.doc.length;
            const lengthDiff = newDocLength - this.lastDocLength;
            this.lastDocLength = newDocLength;
            
            console.log(`[1Bracket] Doc length change: ${lengthDiff}`);
            
            // Look for newline insertions
            let foundNewline = false;
            let newlinePos = -1;
            let beforeNewlinePos = -1;
            
            update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                const insertedText = inserted.toString();
                console.log(`[1Bracket] AutoNode change: ${fromA}-${toA} -> ${fromB}-${toB}, inserted: "${insertedText}"`);
                
                if (insertedText.includes('\n')) {
                    foundNewline = true;
                    beforeNewlinePos = fromA; // Position where Enter was pressed
                    newlinePos = toB; // Position after the insertion
                    console.log(`[1Bracket] AutoNode found newline: before=${beforeNewlinePos}, after=${newlinePos}`);
                }
            });
            
            if (!foundNewline) {
                console.log(`[1Bracket] AutoNode no newline found`);
                return;
            }
            
            // Check context at the original cursor position
            console.log(`[1Bracket] AutoNode checking context at: ${beforeNewlinePos}`);
            const context = isInTreeParagraphButNotInSyntax(update.view, beforeNewlinePos);
            console.log(`[1Bracket] AutoNode context:`, context);
            
            if (!context.inTreeParagraph || !context.lastNodeInParagraph || !context.parentId) {
                console.log(`[1Bracket] AutoNode not in valid tree context`);
                return;
            }
            
            console.log(`[1Bracket] AutoNode valid context, generating node`);
            
            // Generate new node
            const lastNode = context.lastNodeInParagraph;
            const existingIds = getAllExistingNodeIds(update.view);
            const newNodeId = generateNextNodeId(lastNode.id, existingIds);
            const newNodeSyntax = `{${newNodeId}|${context.parentId}|} `;
            
            console.log(`[1Bracket] AutoNode generated: ${newNodeSyntax}`);
            
            // Insert after a short delay to ensure the newline transaction is complete
            setTimeout(() => {
                console.log(`[1Bracket] AutoNode inserting at position: ${newlinePos}`);
                update.view.dispatch({
                    changes: {
                        from: newlinePos,
                        insert: newNodeSyntax
                    },
                    selection: {
                        anchor: newlinePos + newNodeSyntax.length
                    }
                });
            }, 0);
        }
    });
}

export const autoNodeViewPlugin = createAutoNodeViewPlugin();