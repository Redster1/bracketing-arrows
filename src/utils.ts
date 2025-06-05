import LeaderLine from "leaderline";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Workspace, MarkdownView } from "obsidian";
import { ARROW, MARGIN, NOARROW, DISC, DIAGONAL, BRACKET, arrowTypes, arrowPlugTypes, CONNECTION_POINT_PATTERN, ARROWS_PREFIX } from "./consts";
import { ArrowsPluginSettings } from "./settings";

// Hierarchy connection points - where a child arrow can connect to its parent
export enum ConnectionPoint {
    TOP = "top",
    MIDDLE = "middle",
    BOTTOM = "bottom"
}

export interface HierarchyInfo {
    level: number;           // Depth in the hierarchy (0 = root)
    parentId?: string;       // Identifier of parent arrow
    childIds: string[];      // Identifiers of child arrows
    connectionPoint?: ConnectionPoint; // Where this arrow connects to its parent
    isJunction: boolean;     // Whether this arrow is a junction point
}

export interface ArrowIdentifierData {
    identifier: string,
    arrowSource: string,
    isStart: boolean,
    opacity: number,
    color?: string,
    type?: string,
    track?: number,
    arrowArrowhead?: string,
    labelText?: string,  // Extracted label text
    connectionPoint?: number  // NEW: Connection point number (1-4) for bracket structures
}

export interface ArrowIdentifierPosData {
    from: number,
    to: number,
    arrowData: ArrowIdentifierData
}

export interface ArrowIdentifierCollection {
    identifier: string,
    start?: ArrowIdentifierPosData,
    ends: ArrowIdentifierPosData[],
    hierarchy?: HierarchyInfo  // Hierarchy information for this arrow
}

export interface ArrowRecord {
    line: LeaderLine;
    endEl: HTMLElement;
    startEl: HTMLElement;
    startArrowData: ArrowIdentifierData;
    endArrowData: ArrowIdentifierData;
    startOffscreen: OffscreenPosition;
    endOffscreen: OffscreenPosition;
    startElPos: OffsetPosition;
    endElPos: OffsetPosition;
    hierarchy?: HierarchyInfo;  // Hierarchy information for this arrow
}

export interface OffsetPosition {
    offsetLeft: number,
    offsetTop: number
}

export function rangeWithinExcludedContext(from: number, to: number, state: EditorState) {
    const tree = syntaxTree(state);
    const tokenFrom = tree.resolveInner(from, 1).name;
    const tokenTo = tree.resolveInner(to, -1).name;

    return ["math", "codeblock", "inline-code"].some((val) => (tokenFrom.contains(val) || tokenTo.contains(val)));
}

export function arrowSourceToArrowIdentifierData(arrowSource: string):ArrowIdentifierData {
    // First, check if there's a label (colon syntax)
    let identifierPart = arrowSource;
    let labelText: string | undefined;
    let connectionPoint: number | undefined;
    
    const colonIndex = identifierPart.indexOf(':');
    if (colonIndex !== -1) {
        // Split on the first colon only
        const beforeColon = identifierPart.substring(0, colonIndex);
        const afterColon = identifierPart.substring(colonIndex + 1);
        
        // Check if the colon is part of the identifier or if it's for the label
        // by seeing if there's a pipe after the colon
        const pipeIndex = afterColon.indexOf('|');
        
        if (pipeIndex !== -1) {
            // Format: identifier:label|options
            identifierPart = beforeColon + '|' + afterColon.substring(pipeIndex + 1);
            labelText = afterColon.substring(0, pipeIndex);
        } else {
            // Format: identifier:label (no options) or identifier|option:something
            const pipeInBefore = beforeColon.indexOf('|');
            if (pipeInBefore === -1) {
                // It's identifier:label format
                identifierPart = beforeColon;
                labelText = afterColon;
            }
            // else it's part of an option, not a label
        }
    }
    
    // Split into identifier and options
    const options = identifierPart.split("|");
    
    // Check for bracket connection point syntax like "arrows:2"
    for (let i = 0; i < options.length; i++) {
        if (i > 0 && options[i] && options[i].startsWith(ARROWS_PREFIX)) {
            const pointStr = options[i].substring(ARROWS_PREFIX.length);
            const pointNum = parseInt(pointStr, 10);
            if (!isNaN(pointNum) && pointNum >= 1 && pointNum <= 4) {
                connectionPoint = pointNum;
                // Remove this option from the array
                options.splice(i, 1);
                i--; // Adjust index after removal
            }
        }
    }

    const result:ArrowIdentifierData = {
        identifier: "",
        arrowSource: arrowSource,
        isStart: options.length != 1,
        type: MARGIN,
        opacity: 1,
        track: 0,
        labelText: labelText,
        connectionPoint: connectionPoint
    };

    result.arrowArrowhead = result.isStart ? NOARROW : ARROW;

    // Allow removing the arrowhead from an end identifier
    // By inserting "no-arrow" to the end of the syntax, e.g. {test|no-arrow}
    if (result.isStart && options.length === 2 && arrowPlugTypes.contains(options[1])) {
        result.isStart = false;
    }

    const identifier = options.shift();
    result.identifier = identifier ? identifier : "";

    if (result.isStart) {
        for (const option of options) {
            const optionAsFloat = parseFloat(option);

            if (arrowTypes.contains(option)) {
                result.type = option;
            }
            else if (arrowPlugTypes.contains(option)) {
                result.arrowArrowhead = option;
            }
            else if (!isNaN(optionAsFloat) && (optionAsFloat % 1 === 0)) {
                result.track = optionAsFloat;
            }
            else if (!isNaN(optionAsFloat) && (optionAsFloat > 0) && (optionAsFloat < 1)) {
                result.opacity = optionAsFloat;
            }
            else {
                // Don't allow re-writing the color
                // Ensures arrows keep the same color while the user is typing/adding
                // more properties to the syntax
                if (!result.color) {
                    result.color = option;
                }
            }
        }
    }

    // Handle special identifiers
    // 1. If the identifier is "bracket", set the type to BRACKET
    if (result.identifier === "bracket") {
        result.type = BRACKET;
    }
    
    // 2. If this is an arrow that uses a connection point, mark it for bracket connection
    if (connectionPoint !== undefined) {
        result.connectionPoint = connectionPoint;
    }
    
    // 3. If this is the main bracket that others connect to, ensure it's a bracket type
    if (result.identifier === "main" && !connectionPoint) {
        result.type = BRACKET;
    }

    return result;
}

export function arrowIdentifierCollectionIsResolved(arrowIdentifierCollection: ArrowIdentifierCollection):boolean {
    if (!arrowIdentifierCollection.start) return false;

    return arrowIdentifierCollection.ends.length > 0;
}

function getUserDefinedColorsDict(arrowSettings: ArrowsPluginSettings) {
    const dict: {[colorName: string]: string} = {};

    const lines = arrowSettings.userDefinedColors.split("\n");
    lines.forEach(val => {
        const line = val.replaceAll(" ", "").split(":");

        if (line[1])
            dict[line[0]] = line[1];
    });

    return dict;
}

export function colorToEffectiveColor(colorName: string | undefined, arrowSettings: ArrowsPluginSettings):string {
    let defaultColor = arrowSettings.defaultArrowColor;
    if (!defaultColor) defaultColor = "var(--text-normal)";

    if (!colorName) return defaultColor;

    // TODO: no need to process dict on every keypress
    const userDefinedColors = getUserDefinedColorsDict(arrowSettings);
    if (colorName in userDefinedColors) {
        return userDefinedColors[colorName];
    }

    return colorName;
}

export function getStartEndArrowPlugs(arrowheadName: string, arrowStartPlug?: string, arrowEndPlug?: string) {
    // Returns the start and end arrow plug names and sizes for use with LeaderLine options

    // arrowheadName is either "arrow1" or "arrow2":
    // "arrow2" for diagonal arrows
    // "arrow1" for margin arrows (adds an extra horizontal offset to the arrowhead)

    const startPlug = (arrowStartPlug === ARROW) ? arrowheadName : DISC;
    const startPlugSize = (arrowStartPlug === ARROW) ? 0.65 : 0.4;

    const endPlug = (arrowEndPlug === ARROW) ? arrowheadName : DISC;
    const endPlugSize = (arrowEndPlug === ARROW) ? 0.65 : 0.4;

    return {
        startPlug: startPlug,
        startPlugSize: startPlugSize,
        endPlug: endPlug,
        endPlugSize: endPlugSize
    };
}

export function fixMarginArrowTrackNo(track: number) {
    // Handle leader-line's startSocketGravity behaving strangely
    if (track === 10) {
        return 11;
    }
    else if (track >= 11) {
        return track + 10;
    }
    else {
        return track;
    }
}

// https://github.com/anseki/leader-line/issues/28
export function makeArrowArc(line: LeaderLine, radius: number) {

    function addArc(pathData: string, radius: number) {
        const reL = /^L ?([\d.\-+]+) ([\d.\-+]+) ?/;
        let newPathData, curXY, curDir, newXY, newDir,
        sweepFlag, arcXY, arcStartXY;

        function getDir(xy1: {x: number, y: number}, xy2: {x: number, y: number}) {
            if (xy1.x === xy2.x) {
                return xy1.y < xy2.y ? 'd' : 'u';
            } else if (xy1.y === xy2.y) {
                return xy1.x < xy2.x ? 'r' : 'l';
            }
            throw new Error('Invalid data');
        }

        function captureXY(s: any, x :number, y:number) {
            newXY = {x: +x, y: +y};
            return '';
        }

        function offsetXY(xy: {x: number, y: number}, dir: string, offsetLen: number, toBack: boolean) {
            return {
                x: xy.x + (dir === 'l' ? -offsetLen : dir === 'r' ? offsetLen : 0) * (toBack ? -1 : 1),
                y: xy.y + (dir === 'u' ? -offsetLen : dir === 'd' ? offsetLen : 0) * (toBack ? -1 : 1)
            };
        }

        pathData = pathData.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
            .replace(/^M ?([\d.\-+]+) ([\d.\-+]+) ?/, function(s, x, y) {
                curXY = {x: +x, y: +y};
                return '';
            });
        if (!curXY) { throw new Error('Invalid data'); }
        // @ts-ignore
        newPathData = 'M' + curXY.x + ' ' + curXY.y;

        while (pathData) {
            newXY = null;
            pathData = pathData.replace(reL, captureXY);
            if (!newXY) { throw new Error('Invalid data'); }

            newDir = getDir(curXY, newXY);
            if (curDir) {
                arcStartXY = offsetXY(curXY, curDir, radius, true);
                arcXY = offsetXY(curXY, newDir, radius, false);
                sweepFlag =
                curDir === 'l' && newDir === 'u' ? '1' :
                curDir === 'l' && newDir === 'd' ? '0' :
                curDir === 'r' && newDir === 'u' ? '0' :
                curDir === 'r' && newDir === 'd' ? '1' :
                curDir === 'u' && newDir === 'l' ? '0' :
                curDir === 'u' && newDir === 'r' ? '1' :
                curDir === 'd' && newDir === 'l' ? '1' :
                curDir === 'd' && newDir === 'r' ? '0' :
                null;
                if (!sweepFlag) { throw new Error('Invalid data'); }
                newPathData += 'L' + arcStartXY.x + ' ' + arcStartXY.y +
                'A ' + radius + ' ' + radius + ' 0 0 ' + sweepFlag + ' ' + arcXY.x + ' ' + arcXY.y;
            }

            curXY = newXY;
            curDir = newDir;
        }
        // @ts-ignore
        newPathData += 'L' + curXY.x + ' ' + curXY.y;
        return newPathData;
    }

    try {
        // @ts-ignore
        const arrowId:number = line._id;

        const elmsPath = document.getElementById("leader-line-" + arrowId + "-line-path");
        if (!elmsPath) return;

        const pathData = elmsPath.getAttribute('d');
        if (!pathData) return;

        elmsPath.setAttribute('d', addArc(pathData, radius));
    }
    catch {
        // Invalid path data.
    }
}

// -1: offscreen before the user's view
// 0: onscreen
// 1: offscreen after the user's view
export type OffscreenPosition = -1|0|1;

export function posToOffscreenPosition(view: EditorView, pos: number):OffscreenPosition {
    const viewport = view.viewport;

    if (pos < viewport.from) {
        return -1;
    }
    else if (pos > viewport.to) {
        return 1;
    }
    else {
        return 0;
    }
}

export function getElementOffset(el: HTMLElement):OffsetPosition {
    let offsetLeft = 0;
    let offsetTop  = 0;
    let element = el;

    while (element) {
        if (element.hasClass("cm-content")) {
            break;
        }

        offsetLeft += element.offsetLeft;
        offsetTop  += element.offsetTop;

        // @ts-expect-error
        element = element.offsetParent;
    }

    return {offsetLeft, offsetTop};
}

function offsetPositionsEqual(a: OffsetPosition, b: OffsetPosition) {
    return (a.offsetLeft === b.offsetLeft && a.offsetTop === b.offsetTop);
}

function arrowIdentifierDataEqual(a: ArrowIdentifierData, b: ArrowIdentifierData) {
    return (a.identifier === b.identifier
        && a.color === b.color
        && a.opacity === b.opacity
        && a.track === b.track
        && a.type === b.type
        && a.arrowArrowhead === b.arrowArrowhead
        && a.labelText === b.labelText);  // Include label text in equality check
}

export function arrowRecordsEqual(a: ArrowRecord, b: ArrowRecord) {
    // Check if hierarchy info matches
    const hierarchyEqual = 
        (!a.hierarchy && !b.hierarchy) || 
        (a.hierarchy && b.hierarchy && 
            a.hierarchy.level === b.hierarchy.level &&
            a.hierarchy.parentId === b.hierarchy.parentId &&
            a.hierarchy.isJunction === b.hierarchy.isJunction &&
            a.hierarchy.connectionPoint === b.hierarchy.connectionPoint &&
            arraysEqual(a.hierarchy.childIds, b.hierarchy.childIds));
    
    return (a.startEl === b.startEl
        && a.endEl === b.endEl
        && arrowIdentifierDataEqual(a.startArrowData, b.startArrowData)
        && arrowIdentifierDataEqual(a.endArrowData, b.endArrowData)
        && a.startOffscreen == b.startOffscreen
        && a.endOffscreen == b.endOffscreen
        && offsetPositionsEqual(a.startElPos, b.startElPos)
        && offsetPositionsEqual(a.endElPos, b.endElPos)
        && hierarchyEqual);
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function iterateCM6(workspace: Workspace, callback: (editor: EditorView) => unknown) {
    workspace.iterateAllLeaves(leaf => {
        leaf?.view instanceof MarkdownView &&
        (leaf.view.editor as any)?.cm instanceof EditorView &&
        callback((leaf.view.editor as any).cm);
    });
}

// Function to detect and build arrow hierarchies based on spatial relationships
export function buildArrowHierarchy(arrowIdentifierCollections: ArrowIdentifierCollection[]): ArrowIdentifierCollection[] {
    // Clone the collections to avoid modifying the original
    const collections = JSON.parse(JSON.stringify(arrowIdentifierCollections)) as ArrowIdentifierCollection[];
    
    // Initialize hierarchy info for all collections
    collections.forEach(collection => {
        collection.hierarchy = {
            level: 0,
            childIds: [],
            isJunction: false
        };
    });
    
    // First, identify potential bracket groups
    // A bracket group is a set of arrows that might form a hierarchy
    const bracketGroups: ArrowIdentifierCollection[][] = [];
    
    // Group arrows that have similar track values - these are likely part of the same hierarchy
    const trackedGroups = new Map<number, ArrowIdentifierCollection[]>();
    
    // Group by track (margin position)
    for (const collection of collections) {
        if (!collection.start) continue;
        
        const track = collection.start.arrowData.track || 0;
        // Allow for slight variation in track position
        const trackKey = Math.floor(track / 5) * 5;
        
        if (!trackedGroups.has(trackKey)) {
            trackedGroups.set(trackKey, []);
        }
        trackedGroups.get(trackKey)?.push(collection);
    }
    
    // Convert map to array of groups
    for (const group of trackedGroups.values()) {
        if (group.length > 1) {
            // Sort by vertical position
            group.sort((a, b) => {
                const aPos = a.start?.from || 0;
                const bPos = b.start?.from || 0;
                return aPos - bPos;
            });
            bracketGroups.push(group);
        }
    }
    
    // Process each bracket group to establish hierarchies
    for (const group of bracketGroups) {
        // If only 1 arrow, nothing to do
        if (group.length <= 1) continue;
        
        // Try to establish a root arrow for this group
        // This is typically the topmost arrow
        const root = group[0];
        root.hierarchy!.level = 0;
        root.hierarchy!.isJunction = group.length > 1;
        
        // Connect other arrows in the group to the root
        for (let i = 1; i < group.length; i++) {
            const current = group[i];
            
            // Connect to root
            current.hierarchy!.parentId = root.identifier;
            current.hierarchy!.level = 1;
            
            // Determine where to connect
            current.hierarchy!.connectionPoint = determineConnectionPoint(current, root);
            
            // Add as child of root
            root.hierarchy!.childIds.push(current.identifier);
        }
    }
    
    // Second pass: look for arrows that might be aligned but aren't in the same bracket group
    // This helps catch hierarchies that span different margin positions
    for (let i = 0; i < collections.length; i++) {
        const current = collections[i];
        
        // Skip if already has a parent
        if (current.hierarchy?.parentId) continue;
        
        // Look for potential parent arrows
        for (let j = 0; j < collections.length; j++) {
            if (i === j) continue;
            
            const potential = collections[j];
            
            // Skip if potential already has this as a child
            if (potential.hierarchy?.childIds.includes(current.identifier)) {
                continue;
            }
            
            // Skip if potential is not a junction and already has children
            if (!potential.hierarchy?.isJunction && (potential.hierarchy?.childIds?.length || 0) > 0) {
                continue;
            }
            
            // Check if the arrows are aligned for a hierarchy
            if (areArrowsAligned(current, potential)) {
                // Establish parent-child relationship
                current.hierarchy!.parentId = potential.identifier;
                current.hierarchy!.level = potential.hierarchy!.level + 1;
                
                // Determine connection point
                current.hierarchy!.connectionPoint = determineConnectionPoint(current, potential);
                
                // Add current arrow as child of the parent
                potential.hierarchy!.childIds.push(current.identifier);
                
                // If parent now has multiple children, mark it as a junction
                if (potential.hierarchy!.childIds.length > 1) {
                    potential.hierarchy!.isJunction = true;
                }
                
                break; // Found a parent, stop looking
            }
        }
    }
    
    // Final validation - ensure no cycles in the hierarchy
    // (This should never happen with our algorithm, but just to be safe)
    validateHierarchy(collections);
    
    return collections;
}

// Helper function to validate and fix any issues in the hierarchy
function validateHierarchy(collections: ArrowIdentifierCollection[]) {
    // Check for cycles in the hierarchy and fix them
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    function detectCycle(id: string): boolean {
        if (!visited.has(id)) {
            visited.add(id);
            recursionStack.add(id);
            
            const collection = collections.find(c => c.identifier === id);
            if (collection?.hierarchy?.parentId) {
                if (!visited.has(collection.hierarchy.parentId)) {
                    if (detectCycle(collection.hierarchy.parentId)) {
                        return true;
                    }
                } else if (recursionStack.has(collection.hierarchy.parentId)) {
                    // Cycle detected, break the cycle
                    collection.hierarchy.parentId = undefined;
                    collection.hierarchy.level = 0;
                    
                    // Remove from parent's children
                    const parent = collections.find(c => c.identifier === collection.hierarchy!.parentId);
                    if (parent?.hierarchy?.childIds) {
                        const index = parent.hierarchy.childIds.indexOf(id);
                        if (index !== -1) {
                            parent.hierarchy.childIds.splice(index, 1);
                        }
                    }
                    
                    return true;
                }
            }
            
            recursionStack.delete(id);
        }
        
        return false;
    }
    
    // Check each collection
    for (const collection of collections) {
        if (!visited.has(collection.identifier)) {
            detectCycle(collection.identifier);
        }
    }
}

// Helper function to determine if two arrows should be aligned in a hierarchy
function areArrowsAligned(child: ArrowIdentifierCollection, parent: ArrowIdentifierCollection): boolean {
    // For arrows to be aligned in a hierarchy, we check multiple conditions:
    
    if (!child.start || !parent.start) return false;
    
    // 1. Check track proximity - arrows in the same hierarchy should be at similar margin positions
    const childTrack = child.start.arrowData.track || 0;
    const parentTrack = parent.start.arrowData.track || 0;
    const trackDifference = Math.abs(childTrack - parentTrack);
    
    // 2. Check vertical proximity - child should be within a reasonable distance from parent
    const childPos = child.start.from;
    const parentPos = parent.start.from;
    const verticalDistance = Math.abs(childPos - parentPos);
    
    // If the tracks are exactly the same, more lenient on vertical distance
    if (trackDifference === 0) {
        return verticalDistance < 1000; // arbitrary but generous threshold
    }
    
    // If tracks are close but not exact, be more strict on vertical distance
    if (trackDifference <= 3) {
        return verticalDistance < 500;
    }
    
    // Otherwise, not considered aligned
    return false;
}

// Helper function to determine where a child arrow connects to its parent
function determineConnectionPoint(child: ArrowIdentifierCollection, parent: ArrowIdentifierCollection): ConnectionPoint {
    if (!child.start || !parent.start) return ConnectionPoint.MIDDLE;
    
    // Get parent's ends and child's position
    const parentEnds = parent.ends;
    if (parentEnds.length === 0) return ConnectionPoint.MIDDLE;
    
    // Sort parent ends by vertical position
    const sortedEnds = [...parentEnds].sort((a, b) => a.from - b.from);
    
    // Get child's position
    const childPos = child.start.from;
    
    // If we have only two endpoints (most common case)
    if (sortedEnds.length === 2) {
        const topEnd = sortedEnds[0];
        const bottomEnd = sortedEnds[1];
        
        // Calculate the position thresholds - we want a bit more sophisticated approach
        // than just dividing into thirds
        const totalDistance = bottomEnd.from - topEnd.from;
        const oneThird = topEnd.from + totalDistance / 3;
        const twoThirds = bottomEnd.from - totalDistance / 3;
        
        // Determine where the child should connect
        if (childPos <= oneThird) {
            return ConnectionPoint.TOP;
        } else if (childPos >= twoThirds) {
            return ConnectionPoint.BOTTOM;
        } else {
            return ConnectionPoint.MIDDLE;
        }
    } 
    // For more than two endpoints, use a more general approach
    else if (sortedEnds.length > 2) {
        // Get top and bottom endpoints
        const topEnd = sortedEnds[0];
        const bottomEnd = sortedEnds[sortedEnds.length - 1];
        
        // Find the nearest endpoint to the child
        let nearestEndIdx = 0;
        let minDistance = Number.MAX_SAFE_INTEGER;
        
        for (let i = 0; i < sortedEnds.length; i++) {
            const distance = Math.abs(sortedEnds[i].from - childPos);
            if (distance < minDistance) {
                minDistance = distance;
                nearestEndIdx = i;
            }
        }
        
        // Determine position based on nearest endpoint
        if (nearestEndIdx === 0) {
            return ConnectionPoint.TOP;
        } else if (nearestEndIdx === sortedEnds.length - 1) {
            return ConnectionPoint.BOTTOM;
        } else {
            return ConnectionPoint.MIDDLE;
        }
    }
    
    // Default fallback
    return ConnectionPoint.MIDDLE;
}