import { EditorView } from "@codemirror/view";
import LeaderLine from "leaderline";
import { ArrowIdentifierCollection, ArrowIdentifierData, ArrowIdentifierPosData, getStartEndArrowPlugs, fixMarginArrowTrackNo, makeArrowArc, posToOffscreenPosition, OffscreenPosition, ArrowRecord, getElementOffset, arrowRecordsEqual, colorToEffectiveColor, ConnectionPoint, HierarchyInfo } from './utils';
import { BRACKET } from './consts';
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
                        // Check if this is the "main" bracket that others should connect to
                        const isBracketArrow = start.arrowData.identifier === "bracket" || 
                                              start.arrowData.type === BRACKET;
                        
                        // Set junction flag if this is a bracket arrow that others will connect to
                        if (isBracketArrow && !arrowIdentifierCollection.hierarchy) {
                            arrowIdentifierCollection.hierarchy = {
                                level: 0,
                                childIds: [],
                                isJunction: true
                            };
                        }
                        
                        // Pass hierarchy information to the draw function
                        const line = this.drawArrow(
                            startEl, 
                            endEl, 
                            start.arrowData, 
                            end.arrowData, 
                            startOffscreen, 
                            endOffscreen, 
                            arrowIdentifierCollection.hierarchy
                        );
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

        // We no longer need to draw separate connection lines
        // Since the margin arrows now have modified paths based on hierarchy
        // The bracket shapes are created directly in the drawMarginArrow method

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
        
        // Adjust child anchor to connect closer to the start of the child arrow
        // and slightly offset from the margin to create a better visual
        const childAnchor = LeaderLine.PointAnchor(childEl, {
            x: -constants.MARGIN_ARROW_X_OFFSET - 10, 
            y: childEl.offsetTop + (childEl.offsetHeight / 2)
        });
        
        // Get parent line position to determine path style
        const parentLineHeight = parentEl.offsetHeight;
        const childLinePos = childEl.offsetTop + (childEl.offsetHeight / 2);
        const parentMiddlePos = parentEl.offsetTop + (parentEl.offsetHeight / 2);
        
        // Determine if we should use a curved or straight path
        // For arrows that connect to points far from the middle, a curve looks better
        const pathStyle = Math.abs(childLinePos - parentMiddlePos) > (parentLineHeight / 3) ? 
            'arc' : 'straight';
        
        // @ts-ignore
        const line = new LeaderLine({
            parent: this.container,
            start: parentAnchor,
            end: childAnchor,
            color: effectiveColor,
            size: constants.ARROW_SIZE * 0.75, // Slightly thinner than regular arrows
            startPlug: 'behind',
            endPlug: 'behind',
            path: pathStyle,
            startSocketGravity: 50, // Add some gravity to create better curves
            endSocketGravity: 50,   // when using the arc path
        });
        
        // If we have a straight path, make it look better by adding a small
        // path animation/adjustment using custom SVG path
        if (pathStyle === 'straight' && 
            connectionPoint !== ConnectionPoint.MIDDLE) {
            try {
                // @ts-ignore - _id exists at runtime
                const arrowId = line._id;
                const pathElement = document.getElementById(`leader-line-${arrowId}-line-path`);
                if (pathElement) {
                    // Create a slight curve to make it more visually appealing
                    const curveOffset = connectionPoint === ConnectionPoint.TOP ? -5 : 5;
                    const d = pathElement.getAttribute('d');
                    if (d && d.startsWith('M') && d.includes('L')) {
                        const parts = d.split('L');
                        const start = parts[0].substring(1).split(',').map(Number);
                        const end = parts[1].split(',').map(Number);
                        
                        // Create a curve that bends slightly outward
                        const midX = (start[0] + end[0]) / 2 + 10;
                        const midY = (start[1] + end[1]) / 2 + curveOffset;
                        const newPath = `M${start[0]},${start[1]} Q${midX},${midY} ${end[0]},${end[1]}`;
                        
                        pathElement.setAttribute('d', newPath);
                    }
                }
            } catch (e) {
                // Fallback to default path if custom path manipulation fails
            }
        }
        
        return line;
    }
    
    // Get the appropriate anchor point based on the connection point type
    private getConnectionAnchor(el: HTMLElement, connectionPoint: ConnectionPoint) {
        // Position the x-coordinate further left of the margin for cleaner visuals
        const x = -constants.MARGIN_ARROW_X_OFFSET - 25; 
        let y;
        
        // Improved positioning based on the connection point
        // with better offsets to match the expected visual layout
        switch (connectionPoint) {
            case ConnectionPoint.TOP:
                // Connect near the top, but with a small offset to look natural
                y = el.offsetTop + (el.offsetHeight * 0.15);
                break;
            case ConnectionPoint.BOTTOM:
                // Connect near the bottom, but with a small offset to look natural
                y = el.offsetTop + (el.offsetHeight * 0.85);
                break;
            case ConnectionPoint.MIDDLE:
            default:
                // Center connection
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

    drawArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition, hierarchy?: HierarchyInfo) {
        let line;
        
        // Choose the appropriate drawing method based on the arrow type
        if (startArrowData.type === constants.DIAGONAL) {
            line = this.drawDiagonalArrow(startEl, endEl, startArrowData, endArrowData);
        }
        else if (startArrowData.type === constants.BRACKET) {
            // New bracket type arrows (tree structure)
            line = this.drawBracketArrow(startEl, endEl, startArrowData, endArrowData, startOffscreen, endOffscreen);
        }
        else {
            // Standard margin arrows
            line = this.drawMarginArrow(startEl, endEl, startArrowData, endArrowData, startOffscreen, endOffscreen, hierarchy);
        }
        
        if (line) {
            line.element.style.opacity = startArrowData.opacity.toString();
            
            // Add CSS class based on hierarchy level for styling
            if (hierarchy && hierarchy.level > 0) {
                line.element.classList.add(`hierarchy-level-${hierarchy.level}`);
            }
            
            // Mark junction elements
            if (hierarchy && hierarchy.isJunction) {
                line.element.classList.add('hierarchy-junction');
            }
            
            // Add connection point number as a data attribute if specified
            if (startArrowData.connectionPoint) {
                line.element.setAttribute('data-connection-point', startArrowData.connectionPoint.toString());
            }
        }
        
        return line;
    }
    
    // New method to draw bracket-style arrows with connection points
    drawBracketArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        const res = this.getMarginArrowStartEndAnchors(startEl, endEl, startOffscreen, endOffscreen);
        if (!res) return;
        const {startAnchor, endAnchor} = res;

        const color = colorToEffectiveColor(startArrowData.color, getArrowConfigFromView(this.view));
        const plugs = getStartEndArrowPlugs(constants.MARGIN_ARROW, startArrowData.arrowArrowhead, endArrowData.arrowArrowhead);
        
        // Use track for horizontal position if specified
        const track = fixMarginArrowTrackNo(startArrowData.track || 0);
        
        // Determine labels
        const labels = this.determineLabelPlacement(startArrowData, endArrowData);
        const labelOptions: any = {};
        if (labels.startLabel) {
            const label = this.createCaptionLabel(labels.startLabel, color);
            if (label) labelOptions.startLabel = label;
        }
        if (labels.middleLabel) {
            const label = this.createCaptionLabel(labels.middleLabel, color);
            if (label) labelOptions.middleLabel = label;
        }
        if (labels.endLabel) {
            const label = this.createCaptionLabel(labels.endLabel, color);
            if (label) labelOptions.endLabel = label;
        }
        
        // Custom path option for bracket arrows
        const path = "grid";
        
        // Create connection points for tree structure
        const connectionPoint = startArrowData.connectionPoint || 0;
        let startSocketGravity: [number, number] = [-3*track, 0];
        
        // @ts-ignore
        const line = new LeaderLine({
            parent: this.container,
            start: startAnchor,
            end: endAnchor,
            color: color,
            size: constants.ARROW_SIZE,
            ...plugs,
            ...labelOptions,
            path: path,
            startSocket: "left",
            endSocket: "left",
            startSocketGravity: startSocketGravity
        });
        
        // Store connection point information on the line element
        if (connectionPoint) {
            // @ts-ignore - _id exists at runtime
            const arrowId = line._id;
            const lineElement = document.getElementById(`leader-line-${arrowId}`);
            if (lineElement) {
                lineElement.setAttribute('data-connection-point', connectionPoint.toString());
                lineElement.classList.add('bracket-arrow');
            }
        }
        
        // Create bracket shape with rounded corners
        const radius = 22.5 + track * 1.5;
        makeArrowArc(line, radius);
        
        // Further customize the SVG path for bracket arrows
        this.customizeBracketArrowPath(line, connectionPoint);
        
        return line;
    }
    
    // Customize the bracket arrow path based on connection point
    private customizeBracketArrowPath(line: LeaderLine, connectionPoint: number) {
        try {
            // @ts-ignore - _id exists at runtime
            const arrowId = line._id;
            const pathElement = document.getElementById(`leader-line-${arrowId}-line-path`);
            
            if (!pathElement) return;
            
            // Get the original path
            const originalPath = pathElement.getAttribute('d');
            if (!originalPath) return;
            
            // Extract the path segments
            const segments = originalPath.split(/([MLQ])/).filter(Boolean);
            
            // If no connection point is specified, just use the default path
            if (!connectionPoint || connectionPoint === 0) return;
            
            // Create a numbered connection point on the vertical line
            let newPath = '';
            let i = 0;
            let verticalSegmentFound = false;
            
            while (i < segments.length) {
                const segmentType = segments[i];
                
                if (segmentType === 'L' && !verticalSegmentFound) {
                    // Check if this is the vertical segment (first L segment usually)
                    const coords = segments[i+1].trim().split(/[, ]/).map(parseFloat);
                    
                    if (coords.length === 2 && i > 2) {
                        const prevSegment = segments[i-1].trim().split(/[, ]/).map(parseFloat);
                        
                        if (prevSegment.length === 2 && Math.abs(prevSegment[0] - coords[0]) < 1) {
                            // This is a vertical segment
                            verticalSegmentFound = true;
                            
                            // Calculate the position for the connection point
                            const totalHeight = Math.abs(coords[1] - prevSegment[1]);
                            const numPoints = 4; // We support up to 4 connection points
                            const pointInterval = totalHeight / (numPoints + 1);
                            
                            // Ensure connection point is within valid range
                            const safePoint = Math.max(1, Math.min(numPoints, connectionPoint));
                            
                            // Calculate the Y position for this connection point
                            let y;
                            if (prevSegment[1] < coords[1]) {
                                // Top to bottom
                                y = prevSegment[1] + (safePoint * pointInterval);
                            } else {
                                // Bottom to top
                                y = prevSegment[1] - (safePoint * pointInterval);
                            }
                            
                            // Add a small perpendicular line at the connection point
                            const markerSize = 8; // Size of connection marker
                            const markerX = prevSegment[0] - markerSize;
                            
                            // Add the connection point to the path
                            newPath += `${segmentType} ${prevSegment[0]},${y} `;
                            // Add horizontal marker line
                            newPath += `L ${markerX},${y} `;
                            // Continue to the end point
                            newPath += `L ${prevSegment[0]},${y} L ${coords[0]},${coords[1]} `;
                            
                            i += 2;
                            continue;
                        }
                    }
                }
                
                // Add the segment as is
                newPath += segmentType;
                if (i + 1 < segments.length && !segments[i+1].match(/[MLQ]/)) {
                    newPath += segments[i+1];
                    i += 2;
                } else {
                    i++;
                }
            }
            
            // Apply the new path if we modified it
            if (verticalSegmentFound) {
                pathElement.setAttribute('d', newPath);
            }
        } catch (e) {
            console.error('Error customizing bracket arrow path:', e);
        }
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

    drawMarginArrow(startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition, hierarchy?: HierarchyInfo) {
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

        // Check if this is a parent arrow in a hierarchy
        const isJunction = hierarchy?.isJunction === true;
        
        // Choose the path style based on whether this is a junction
        const pathStyle = isJunction ? "grid" : "grid";
        
        // Determine socket gravity (affects how the line bends)
        let socketGravity: [number, number] = [-3*track, 0];
        
        // For junction arrows, use stronger gravity to create better bracket shape
        if (isJunction) {
            socketGravity = [-5*track, 0];
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
            path: pathStyle,
            startSocket: "left",
            endSocket: "left",
            startSocketGravity: socketGravity
        });

        // Add data attribute to the line element for hierarchy relationships
        if (hierarchy) {
            // @ts-ignore - _id exists at runtime
            const arrowId = line._id;
            const lineElement = document.getElementById(`leader-line-${arrowId}`);
            if (lineElement) {
                lineElement.setAttribute('data-hierarchy-level', hierarchy.level.toString());
                if (hierarchy.isJunction) {
                    lineElement.setAttribute('data-is-junction', 'true');
                }
                if (hierarchy.childIds.length > 0) {
                    lineElement.setAttribute('data-has-children', 'true');
                    lineElement.setAttribute('data-child-ids', hierarchy.childIds.join(','));
                }
                if (hierarchy.parentId) {
                    lineElement.setAttribute('data-parent-id', hierarchy.parentId);
                }
            }
        }

        // Give the arrow rounded corners
        // Not supported by the leader-line library, so do this manually
        let radius = 22.5 + 3/2*track;
        
        // For junction arrows, use a larger radius to create a better bracket shape
        if (isJunction) {
            radius = 30 + 3/2*track;
        }
        
        makeArrowArc(line, radius);
        
        // If this is a junction arrow with child connections, modify the path to create bracket structure
        if (isJunction && hierarchy?.childIds.length) {
            this.enhanceBracketShape(line, hierarchy);
        }

        return line;
    }
    
    // Create a bracket-like shape for junction arrows
    private enhanceBracketShape(line: LeaderLine, hierarchy: HierarchyInfo) {
        try {
            // @ts-ignore - _id exists at runtime
            const arrowId = line._id;
            const pathElement = document.getElementById(`leader-line-${arrowId}-line-path`);
            
            if (!pathElement) return;
            
            // Get the original path
            const originalPath = pathElement.getAttribute('d');
            if (!originalPath) return;
            
            // Find child connections if needed for precise positioning
            const childConnections = hierarchy.childIds.map((childId: string) => {
                const childCollection = Array.from(this.arrows.values())
                    .flat()
                    .find(arrow => 
                        arrow.startArrowData.identifier === childId || 
                        arrow.endArrowData.identifier === childId
                    );
                return childCollection;
            }).filter(Boolean);
            
            // If we have at least one child, modify the path
            if (childConnections.length > 0) {
                // We need to identify horizontal segments in the path and extend them
                // This is a complex operation that depends on the path structure
                // For now, we'll use a simplified approach that works with the grid path type
                
                // Extract path segments
                const segments = originalPath.split(/([MLQ])/).filter(Boolean);
                
                // Create a new path with extended horizontal segments
                let newPath = '';
                let i = 0;
                
                while (i < segments.length) {
                    const segmentType = segments[i];
                    
                    if (segmentType === 'L') {
                        // This is a line segment
                        const coords = segments[i+1].trim().split(/[, ]/).map(parseFloat);
                        
                        // Check if this is a horizontal segment (y values are the same)
                        if (coords.length === 2 && i > 2) {
                            const prevSegment = segments[i-1].trim().split(/[, ]/).map(parseFloat);
                            
                            if (prevSegment.length === 2 && Math.abs(prevSegment[1] - coords[1]) < 1) {
                                // This is a horizontal segment, extend it
                                const extension = 10; // Extend by 10px
                                if (prevSegment[0] < coords[0]) {
                                    // Left to right, extend right
                                    coords[0] += extension;
                                } else {
                                    // Right to left, extend left
                                    coords[0] -= extension;
                                }
                                
                                // Add the modified segment
                                newPath += `${segmentType} ${coords[0]},${coords[1]} `;
                                i += 2;
                                continue;
                            }
                        }
                    }
                    
                    // Add the segment as is
                    newPath += segmentType;
                    if (i + 1 < segments.length && !segments[i+1].match(/[MLQ]/)) {
                        newPath += segments[i+1];
                        i += 2;
                    } else {
                        i++;
                    }
                }
                
                // Apply the new path
                pathElement.setAttribute('d', newPath);
            }
        } catch (e) {
            console.error('Error enhancing bracket shape:', e);
        }
    }

    getArrowRecord(line:LeaderLine, startEl: HTMLElement, endEl: HTMLElement, startArrowData: ArrowIdentifierData, endArrowData: ArrowIdentifierData, startOffscreen: OffscreenPosition, endOffscreen: OffscreenPosition) {
        const arrowRecord: ArrowRecord = {
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