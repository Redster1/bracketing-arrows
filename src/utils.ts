import LeaderLine from "leaderline";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Workspace, MarkdownView } from "obsidian";
import { ARROW, MARGIN, NOARROW, DISC, arrowTypes, arrowPlugTypes } from "./consts";
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
    labelText?: string  // NEW: extracted label text
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
    
    const colonIndex = arrowSource.indexOf(':');
    if (colonIndex !== -1) {
        // Split on the first colon only
        const beforeColon = arrowSource.substring(0, colonIndex);
        const afterColon = arrowSource.substring(colonIndex + 1);
        
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
    
    const options = identifierPart.split("|");

    const result:ArrowIdentifierData = {
        identifier: "",
        arrowSource: arrowSource,
        isStart: options.length != 1,
        type: MARGIN,
        opacity: 1,
        track: 0,
        labelText: labelText  // Add the label text
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
    
    // Sort collections by vertical position (top to bottom)
    collections.sort((a, b) => {
        const aPos = a.start?.from || 0;
        const bPos = b.start?.from || 0;
        return aPos - bPos;
    });
    
    // Detect parent-child relationships based on proximity and alignment
    for (let i = 0; i < collections.length; i++) {
        const current = collections[i];
        
        // Look for potential parent arrows that are above the current one
        for (let j = 0; j < i; j++) {
            const potential = collections[j];
            
            // Skip if already has a parent or if the potential parent already has this as a child
            if (current.hierarchy?.parentId || potential.hierarchy?.childIds.includes(current.identifier)) {
                continue;
            }
            
            // Check if the arrows are aligned for a hierarchy
            if (areArrowsAligned(current, potential)) {
                // Establish parent-child relationship
                current.hierarchy!.parentId = potential.identifier;
                current.hierarchy!.level = potential.hierarchy!.level + 1;
                
                // Determine connection point (top, middle, bottom)
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
    
    return collections;
}

// Helper function to determine if two arrows should be aligned in a hierarchy
function areArrowsAligned(child: ArrowIdentifierCollection, parent: ArrowIdentifierCollection): boolean {
    // This is a simplified version - in a real implementation, you'd need more
    // sophisticated spatial analysis
    
    // For this example, we'll consider arrows aligned if:
    // 1. They have the same track value or
    // 2. Their tracks are within a certain proximity
    
    if (!child.start || !parent.start) return false;
    
    const childTrack = child.start.arrowData.track || 0;
    const parentTrack = parent.start.arrowData.track || 0;
    
    // Consider aligned if track difference is small
    const trackDifference = Math.abs(childTrack - parentTrack);
    return trackDifference <= 5; // arbitrary threshold
}

// Helper function to determine where a child arrow connects to its parent
function determineConnectionPoint(child: ArrowIdentifierCollection, parent: ArrowIdentifierCollection): ConnectionPoint {
    if (!child.start || !parent.start) return ConnectionPoint.MIDDLE;
    
    // Get vertical positions of the parent's end points
    const parentEnds = parent.ends;
    if (parentEnds.length === 0) return ConnectionPoint.MIDDLE;
    
    // Sort parent ends by position
    const sortedEnds = [...parentEnds].sort((a, b) => a.from - b.from);
    
    // If parent has only one end, connect to the middle
    if (sortedEnds.length === 1) return ConnectionPoint.MIDDLE;
    
    // Determine relative position of child to parent's ends
    const childPos = child.start.from;
    const firstEndPos = sortedEnds[0].from;
    const lastEndPos = sortedEnds[sortedEnds.length - 1].from;
    
    // Calculate positions for top third, middle third, bottom third
    const totalRange = lastEndPos - firstEndPos;
    const firstThird = firstEndPos + totalRange * 0.33;
    const secondThird = firstEndPos + totalRange * 0.66;
    
    // Determine connection point based on position
    if (childPos < firstThird) {
        return ConnectionPoint.TOP;
    } else if (childPos < secondThird) {
        return ConnectionPoint.MIDDLE;
    } else {
        return ConnectionPoint.BOTTOM;
    }
}