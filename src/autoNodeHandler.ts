import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { Extension, Annotation } from "@codemirror/state";
import { generateNextNodeId, getAllExistingNodeIds, isInTreeParagraphButNotInSyntax } from './utils';

// Annotation to mark auto-generated nodes to prevent recursive processing
const autoNodeCreatedAnnotation = Annotation.define<boolean>();

/**
 * Cache for existing node IDs to avoid full document scans
 */
class NodeIdCache {
    private cache = new Set<string>();
    private lastDocLength = 0;
    private lastScanTime = 0;
    
    getExistingIds(view: EditorView): Set<string> {
        const currentDocLength = view.state.doc.length;
        const now = Date.now();
        
        // Only re-scan if document changed significantly or it's been a while
        if (currentDocLength !== this.lastDocLength || now - this.lastScanTime > 1000) {
            console.log(`[1Bracket] Refreshing node ID cache (doc length: ${currentDocLength})`);
            this.cache = getAllExistingNodeIds(view);
            this.lastDocLength = currentDocLength;
            this.lastScanTime = now;
        }
        
        return this.cache;
    }
    
    addId(id: string) {
        this.cache.add(id);
    }
}

/**
 * Create a ViewPlugin that detects newlines and adds node syntax
 */
function createAutoNodeViewPlugin(): Extension {
    return ViewPlugin.fromClass(class {
        private nodeIdCache = new NodeIdCache();
        
        constructor(view: EditorView) {
            console.log(`[1Bracket] AutoNode ViewPlugin initialized`);
            // Initialize cache
            this.nodeIdCache.getExistingIds(view);
        }
        
        update(update: ViewUpdate) {
            console.log(`[1Bracket] AutoNode update called, docChanged: ${update.docChanged}`);
            
            if (!update.docChanged) {
                return;
            }
            
            // Skip if this update was caused by our auto-node creation to prevent recursion
            if (update.transactions.some(tr => tr.annotation(autoNodeCreatedAnnotation))) {
                console.log(`[1Bracket] AutoNode skipping - update caused by auto-creation`);
                return;
            }
            
            console.log(`[1Bracket] AutoNode processing doc changes`);
            
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
            
            // Generate new node using cached IDs
            const lastNode = context.lastNodeInParagraph;
            const existingIds = this.nodeIdCache.getExistingIds(update.view);
            const newNodeId = generateNextNodeId(lastNode.id, existingIds);
            const newNodeSyntax = `{${newNodeId}|${context.parentId}|} `;
            
            console.log(`[1Bracket] AutoNode generated: ${newNodeSyntax}`);
            
            // Add the new ID to cache immediately
            this.nodeIdCache.addId(newNodeId);
            
            // Queue insertion for next event loop (much faster than setTimeout but still async)
            console.log(`[1Bracket] AutoNode queueing insertion at position: ${newlinePos}`);
            queueMicrotask(() => {
                console.log(`[1Bracket] AutoNode executing queued insertion`);
                update.view.dispatch({
                    changes: {
                        from: newlinePos,
                        insert: newNodeSyntax
                    },
                    selection: {
                        anchor: newlinePos + newNodeSyntax.length
                    },
                    // Annotate to prevent recursive processing
                    annotations: [autoNodeCreatedAnnotation.of(true)]
                });
            });
        }
    });
}

export const autoNodeViewPlugin = createAutoNodeViewPlugin();