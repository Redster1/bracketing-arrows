import { EditorView } from "@codemirror/view";
import LeaderLine from "leaderline";
import { ArrowIdentifierCollection, ArrowIdentifierData, ArrowIdentifierPosData, getStartEndArrowPlugs, fixMarginArrowTrackNo, makeArrowArc, posToOffscreenPosition, OffscreenPosition, ArrowRecord, getElementOffset, arrowRecordsEqual, colorToEffectiveColor, ConnectionPoint } from './utils';
import * as constants from "./consts";
import { getArrowConfigFromView } from "./arrowsConfig";


export class ArrowsManager {
    private view: EditorView;
    private container: HTMLElement;
    private arrows: Map<HTMLElement, ArrowRecord[]>; // Index arrows by endEl
    // Use ArrowRecord[] instead of ArrowRecord, because *multiple* long margin arrows may be drawn
    // between the first and last `.cm-line`s
    private arrowCountMap: Map<string, number>; // Track arrow counts between element pairs
    private junctionPoints: Map<string, HTMLElement>; // Track junction points for hierarchy connections

    constructor(view: EditorView, container: HTMLElement) {
        this.view = view;
        this.container = container;
        this.arrows = new Map();
        this.arrowCountMap = new Map();
        this.junctionPoints = new Map();
    }

    // Helper function to create caption labels safely
    private createCaptionLabel(text: string, color: string, lineOffset: number = 0) {
        // @ts-ignore - captionLabel exists at runtime in the modified LeaderLine library
        if (typeof LeaderLine.captionLabel === 'function') {
            // @ts-ignore
            return LeaderLine.captionLabel(text, {
                color: color,
                lineOffset: lineOffset  // Distance from the line
            });
        }
        // Fallback: return undefined if captionLabel is not available
        return undefined;
    }

    // Get and increment arrow index for a pair of elements
    private getArrowIndex(startEl: HTMLElement, endEl: HTMLElement): number {
        // Create a unique key for this element pair
        const key = `${startEl.id || startEl.className}-${endEl.id || endEl.className}`;
        const currentIndex = this.arrowCountMap.get(key) || 0;
        this.arrowCountMap.set(key, currentIndex + 1);
        return currentIndex;
    }

    drawArrows(arrowIdentifierCollections: ArrowIdentifierCollection[]) {
        const view = this.view;
        const oldArrows = this.arrows;
        const newArrows = new Map();
        
        // Reset arrow count map for each redraw
        this.arrowCountMap.clear();
        this.junctionPoints.clear();

        // Sort collections by hierarchy level to ensure parent arrows are drawn first
        const sortedCollections = [...arrowIdentifierCollections].sort((a, b) => {
            const aLevel = a.hierarchy?.level || 0;
            const bLevel = b.hierarchy?.level || 0;
            return aLevel - bLevel;
        });

        // First pass: Draw all regular arrows
        for (const arrowIdentifierCollection of sortedCollections) {
            const start = arrowIdentifierCollection.start;
            if (!start) continue;
            const startOffscreen = posToOffscreenPosition(view, start.from);

            const startEl = this.arrowIdentifierPosDataToDomElement(start);
            if (!(startEl instanceof HTMLElement)) continue;

            for (const end of arrowIdentifierCollection.ends) {
                const endEl = this.arrowIdentifierPosDataToDomElement(end);
                if (!(endEl instanceof HTMLElement)) continue;
                const endOffscreen = posToOffscreenPosition(view, end.to);

                // If both identifiers are offscreen in the same direction, don't draw an arrow
                if (startOffscreen != 0 && startOffscreen == endOffscreen) continue;

                const arrowAlreadyExistsIndex = this.lineAlreadyExists(startEl, endEl, start.arrowData, end.arrowData, startOffscreen, endOffscreen);

                if (arrowAlreadyExistsIndex != -1) {
                    // Remove the arrowRecord from oldArrows and transfer it to newArrows
                    const removed = this.removeRecordFromMap(oldArrows, endEl, arrowAlreadyExistsIndex);
                    if (removed) {
                        // Update the hierarchy info
                        removed.hierarchy = arrowIdentifierCollection.hierarchy;
                        this.addRecordToMap(newArrows, endEl, removed);
                    }
                }
                else {
                    // Draw an arrow between startEl and endEl
                    try {
                        const line = this.drawArrow(startEl, endEl, start.arrowData, end.arrowData, startOffscreen, endOffscreen);
                        if (!line) continue;

                        const record = this.getArrowRecord(line, startEl, endEl, start.arrowData, end.arrowData, startOffscreen, endOffscreen);
                        
                        // Add hierarchy information to the record
                        record.hierarchy = arrowIdentifierCollection.hierarchy;
                        
                        this.addRecordToMap(newArrows, endEl, record);
                        
                        // Store junction points for hierarchy connections
                        if (arrowIdentifierCollection.hierarchy?.isJunction) {
                            this.junctionPoints.set(arrowIdentifierCollection.identifier, startEl);
                        }
                    }
                    catch (e) {
                        // console.log("Error drawing the arrow.");
                        continue;
                    }
                }
            }
        }

        // Second pass: Draw connections between hierarchical arrows
        for (const arrowIdentifierCollection of sortedCollections) {
            if (!arrowIdentifierCollection.hierarchy?.parentId) continue;
            
            const parentId = arrowIdentifierCollection.hierarchy.parentId;
            const parentEl = this.junctionPoints.get(parentId);
            
            if (!parentEl || !arrowIdentifierCollection.start) continue;
            
            const childEl = this.arrowIdentifierPosDataToDomElement(arrowIdentifierCollection.start);
            if (!(childEl instanceof HTMLElement)) continue;
            
            // Draw connection line based on the connection point
            this.drawHierarchyConnection(
                parentEl, 
                childEl, 
                arrowIdentifierCollection.hierarchy.connectionPoint || ConnectionPoint.MIDDLE,
                arrowIdentifierCollection.start.arrowData.color
            );
        }

        // Remove old arrows
        this.removeAllArrows(oldArrows);
        this.arrows = newArrows;
    }
    
    // Draw a connection between a parent and child arrow in the hierarchy
    private drawHierarchyConnection(
        parentEl: HTMLElement, 
        childEl: HTMLElement,
        connectionPoint: ConnectionPoint,
        color?: string
    ) {
        const effectiveColor = colorToEffectiveColor(color, getArrowConfigFromView(this.view));
        
        // Calculate the appropriate connection points based on the specified connection point
        const parentAnchor = this.getConnectionAnchor(parentEl, connectionPoint);
        const childAnchor = LeaderLine.PointAnchor(childEl, {x: -constants.MARGIN_ARROW_X_OFFSET - 5, y: childEl.offsetTop + (childEl.offsetHeight / 2)});
        
        // @ts-ignore
        const line = new LeaderLine({
            parent: this.container,
            start: parentAnchor,
            end: childAnchor,
            color: effectiveColor,
            size: constants.ARROW_SIZE * 0.75, // Slightly thinner than regular arrows
            startPlug: 'behind',
            endPlug: 'behind',
            path: 'straight'
        });
        
        // No need to track these connections in the arrows map since they're
        // automatically redrawn when the parent arrows are redrawn
        
        return line;
    }
    
    // Get the appropriate anchor point based on the connection point type
    private getConnectionAnchor(el: HTMLElement, connectionPoint: ConnectionPoint) {
        const x = -constants.MARGIN_ARROW_X_OFFSET - 20; // Offset from the margin
        let y;
        
        switch (connectionPoint) {
            case ConnectionPoint.TOP:
                y = el.offsetTop;
                break;
            case ConnectionPoint.BOTTOM:
                y = el.offsetTop + el.offsetHeight;
                break;
            case ConnectionPoint.MIDDLE:
            default:
                y = el.offsetTop + (el.offsetHeight / 2);
                break;
        }
        
        return LeaderLine.PointAnchor(el, {x, y});
    }

    addRecordToMap(map: Map<HTMLElement, ArrowRecord[]>, endEl:HTMLElement, record: ArrowRecord) {
        if (map.has(endEl)) {
            map.get(endEl)?.push(record);
        }
        else {
            map.set(endEl, [record]);
        }
    }

    removeRecordFromMap(map: Map<HTMLElement, ArrowRecord[]>, endEl:HTMLElement, recordIndex: number) {
        if (!map.has(endEl)) return;

        const arrowRecords = map.get(endEl);
        if (!arrowRecords) return;

        const removed = arrowRecords.splice(recordIndex, 1);
        if (arrowRecords.length === 0) {
            map.delete(endEl);
        }

        return removed[0];
    }

    // Checks whether there exists an arrow that has already been drawn between startEl & endEl
    // with the specified arrow parameters
    // If yes, returns its index in the arrow map
    lineAlreadyExists(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition):number {
        const existingArrows = this.arrows.get(endEl);
        if (!existingArrows) return -1;

        let i = 0;
        for (const existingArrow of existingArrows) {
            // give `line` an arbitrary value so newArrow is a valid ArrowRecord
            const newArrow = this.getArrowRecord(existingArrow.line, startEl, endEl, startArrowData, endArrowData, startOffscreen, endOffscreen);

            if (arrowRecordsEqual(existingArrow, newArrow)) {
                return i;
            }

            i++;
        }

        return -1;
    }

    drawArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        let line;
        if (startArrowData.type == constants.DIAGONAL) {
            line = this.drawDiagonalArrow(startEl, endEl, startArrowData, endArrowData);
        }
        else {
            line = this.drawMarginArrow(startEl, endEl, startArrowData, endArrowData, startOffscreen, endOffscreen);
        }
        if (line) {
            line.element.style.opacity = startArrowData.opacity.toString();
        }
        return line;
    }

    private determineLabelPlacement(startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData) {
        const startHasLabel = !!startArrowData.labelText;
        const endHasLabel = !!endArrowData.labelText;
        
        if (startHasLabel && endHasLabel) {
            return {
                startLabel: startArrowData.labelText,
                endLabel: endArrowData.labelText
            };
        } else if (startHasLabel) {
            return {
                middleLabel: startArrowData.labelText
            };
        } else if (endHasLabel) {
            return {
                middleLabel: endArrowData.labelText
            };
        }
        
        return {}; // No labels
    }

    drawDiagonalArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData) {
        if (startEl == endEl) return;

        const color = colorToEffectiveColor(startArrowData.color, getArrowConfigFromView(this.view));
        const plugs = getStartEndArrowPlugs(constants.DIAGONAL_ARROW, startArrowData.arrowArrowhead, endArrowData.arrowArrowhead);
        const labels = this.determineLabelPlacement(startArrowData, endArrowData);

        // Get arrow index for this element pair to calculate offset
        const arrowIndex = this.getArrowIndex(startEl, endEl);
        
        // For diagonal arrows, use arrow index to prevent overlap
        // Alternate between above and below, with increasing distance
        const isAbove = arrowIndex % 2 === 0;
        const offsetDistance = Math.floor(arrowIndex / 2) * 20 + 10;
        const lineOffset = isAbove ? -offsetDistance : offsetDistance;

        // Create label objects if needed
        const labelOptions: any = {};
        if (labels.startLabel) {
            const label = this.createCaptionLabel(labels.startLabel, color, lineOffset);
            if (label) labelOptions.startLabel = label;
        }
        if (labels.middleLabel) {
            const label = this.createCaptionLabel(labels.middleLabel, color, lineOffset);
            if (label) labelOptions.middleLabel = label;
        }
        if (labels.endLabel) {
            const label = this.createCaptionLabel(labels.endLabel, color, lineOffset);
            if (label) labelOptions.endLabel = label;
        }

        // @ts-ignore
        const line = new LeaderLine({
            parent: this.container,
            start: startEl,
            end: endEl,
            color: color,
            size: constants.ARROW_SIZE,
            ...plugs,
            ...labelOptions,
            path: getArrowConfigFromView(this.view).diagonalArrowStyle
        });

        return line;
    }

    drawMarginArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        const res = this.getMarginArrowStartEndAnchors(startEl, endEl, startOffscreen, endOffscreen);
        if (!res) return;
        const {startAnchor, endAnchor} = res;

        const color = colorToEffectiveColor(startArrowData.color, getArrowConfigFromView(this.view));
        const plugs = getStartEndArrowPlugs(constants.MARGIN_ARROW, startArrowData.arrowArrowhead, endArrowData.arrowArrowhead);
        
        // Store original track number for label positioning
        const originalTrack = startArrowData.track ? startArrowData.track : 0;
        let track = originalTrack;
        track = fixMarginArrowTrackNo(track);
        
        const labels = this.determineLabelPlacement(startArrowData, endArrowData);

        // Get arrow index to prevent label overlap
        const arrowIndex = this.getArrowIndex(startEl, endEl);
        
        // Calculate line offset based on track number AND arrow index
        // For margin arrows, use negative offset to move labels to the left
        const baseOffset = -10;
        const trackSpacing = -20;
        const indexSpacing = -15; // Additional spacing for each arrow to prevent overlap
        const lineOffset = baseOffset + (originalTrack * trackSpacing) + (arrowIndex * indexSpacing);

        // Create label objects if needed
        const labelOptions: any = {};
        if (labels.startLabel) {
            const label = this.createCaptionLabel(labels.startLabel, color, lineOffset);
            if (label) labelOptions.startLabel = label;
        }
        if (labels.middleLabel) {
            const label = this.createCaptionLabel(labels.middleLabel, color, lineOffset);
            if (label) labelOptions.middleLabel = label;
        }
        if (labels.endLabel) {
            const label = this.createCaptionLabel(labels.endLabel, color, lineOffset);
            if (label) labelOptions.endLabel = label;
        }

        // @ts-ignore
        const line = new LeaderLine({
            parent: this.container,
            start: startAnchor,
            end: endAnchor,
            color: color,
            size: constants.ARROW_SIZE,
            ...plugs,
            ...labelOptions,
            path: "grid",
            startSocket: "left",
            endSocket: "left",
            startSocketGravity: [-3*track, 0]
        });

        // Give the arrow rounded corners
        // Not supported by the leader-line library, so do this manually
        const radius = 22.5 + 3/2*track;
        makeArrowArc(line, radius);

        return line;
    }

    getArrowRecord(line:LeaderLine, startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        const arrowRecord = {
            line: line,
            startEl: startEl,
            endEl: endEl,
            startArrowData: startArrowData,
            endArrowData: endArrowData,
            startOffscreen: startOffscreen,
            endOffscreen: endOffscreen,
            startElPos: getElementOffset(startEl),
            endElPos: getElementOffset(endEl),
        };

        return arrowRecord;
    }

    arrowIdentifierPosDataToDomElement(arrow: ArrowIdentifierPosData) {
        // Returns the `span.arrow-identifier-prettified-circle` element that corresponds to
        // the specified document position

        const view = this.view;
        try {
            const pos = arrow.from + 1;
            const {node, offset} = view.domAtPos(pos);

            let el;
            if (node.nodeType === Node.TEXT_NODE) {
                // When the decoration is a MarkDecoration (when the cursor is on an arrow identifier), node is a text node
                el = node.parentElement;
            }
            else {
                // Otherwise, node is an Element
                el = node.childNodes[offset-1] as HTMLElement;
            }

            if (!el) return;

            if (el.hasClass(constants.ARROW_IDENTIFIER_PRETTIFIED_CIRCLE_CLASS)) {
                return el;
            }
            else {
                const offscreen = posToOffscreenPosition(view, arrow.from);
                const lines = view.contentDOM.children;
                const firstLine = lines[1];
                const lastLine = lines[lines.length-2];

                if (offscreen === -1) return firstLine;
                else if (offscreen === 1) return lastLine;
                else return el;
            }
        }
        catch (e) {
            console.log(e);
            return;
        }
    }

    getMarginArrowStartEndAnchors(start: HTMLElement, end: HTMLElement, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        // Draw the arrow at the same y-position as the arrow identifier
        // If a start/end identifier is off-screen, then start and end point to the first/last .cm-lines in the editor

        const s = start.closest(".cm-line");
        if (!(s instanceof HTMLElement)) return;
        let sy;
        if (startOffscreen != 0) {
            // Stop long margin arrows from flickering when scrolling up/down a page
            // By drawing long margin arrows past the very top/bottom of the screen by setting y appropriately
            sy = startOffscreen * 1000;
        }
        else {
            sy = start.offsetTop + (start.offsetHeight / 2);
        }

        const e = end.closest(".cm-line");
        if (!(e instanceof HTMLElement)) return;
        let ey;
        if (endOffscreen != 0) {
            ey = endOffscreen * 1000;
        }
        else {
            ey = end.offsetTop + (end.offsetHeight / 2);
        }

        return {
            startAnchor: LeaderLine.PointAnchor(s, {x: -constants.MARGIN_ARROW_X_OFFSET, y: sy}), 
            endAnchor: LeaderLine.PointAnchor(e, {x: -constants.MARGIN_ARROW_X_OFFSET, y: ey})
        };
    }

    removeAllArrows(arrows?: Map<HTMLElement, ArrowRecord[]>) {
        if (!arrows) arrows = this.arrows;

        this.arrows.forEach((arrowRecords, endEl) => {
            arrowRecords.forEach((arrowRecord) => {
                arrowRecord.line.remove();
            });
            this.arrows.delete(endEl);
        });
    }
}