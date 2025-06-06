import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, ViewUpdate, Decoration, DecorationSet, ViewPlugin, WidgetType } from "@codemirror/view";
import { MatchDecoratorAll } from "./matchDecoratorAll";
import { ArrowsManager } from "./arrowsManager";
import { ArrowIdentifierData, ArrowIdentifierPosData, ArrowIdentifierCollection, arrowSourceToArrowIdentifierData, arrowIdentifierCollectionIsResolved, rangeWithinExcludedContext, colorToEffectiveColor, buildArrowHierarchy } from './utils';
import * as constants from "./consts";
import { getArrowConfigFromView } from "./arrowsConfig";

const arrowSourceRegex = /{([^{}]+)}/g;

const arrowIdentifierHighlighter = new MatchDecoratorAll({
    regexp: arrowSourceRegex,
    decoration: (match) => {
        const arrowSource = match[1];
        const arrowData = arrowSourceToArrowIdentifierData(arrowSource);

        const startOrEnd = "";
        const className = constants.ARROW_IDENTIFIER_CLASS + " " + startOrEnd;

        return Decoration.mark({
            tagName: "span",
            class: className,
            arrowIdentifierData: arrowData
        });
    }
});

export const refreshAllArrows = StateEffect.define();

export class ArrowsViewPlugin {
    container: HTMLElement;
    arrowsManager: ArrowsManager;
    arrowIdentifierRanges: DecorationSet;
    arrowIdentifierCollections: ArrowIdentifierCollection[];
    decorations: DecorationSet;

    constructor(view: EditorView) {
        // Create a container to hold the arrows in
        this.createContainer(view);
        this.arrowsManager = new ArrowsManager(view, this.container);
        this.initialiseArrows(view);
    }

    createContainer(view: EditorView) {
        const container = document.createElement("div");
        container.addClass(constants.ARROW_CONTAINER_CLASS);
        view.scrollDOM.prepend(container);
        this.container = container;
    }

    initialiseArrows(view: EditorView) {
        this.arrowIdentifierRanges = arrowIdentifierHighlighter.createDeco(view);
        this.decorations = Decoration.none;

        // Wait until syntaxTree is ready and widgets have been rendered in the DOM to draw arrows
        queueMicrotask(() => {
            const posData = this.arrowIdentifierRangesToArrowIdentifierPosData(this.arrowIdentifierRanges, view.state);
            const collections = this.collectArrowIdentifierPosData(posData);
            
            // Build hierarchy information based on arrow positions
            this.arrowIdentifierCollections = buildArrowHierarchy(collections);
            
            const decos = this.arrowIdentifierCollectionsToDecos(this.arrowIdentifierCollections, view);
            this.decorations = decos;

            this.arrowsManager.drawArrows(this.arrowIdentifierCollections);
        });
    }

    update(update: ViewUpdate) {
        let shouldRefreshAllArrows = false;
        for (const transaction of update.transactions) {
            for (const effect of transaction.effects) {
                if (effect.is(refreshAllArrows)) {
                    shouldRefreshAllArrows = true;
                    break;
                }
            }
        }
        if (shouldRefreshAllArrows) {
            this.arrowsManager.removeAllArrows();
            this.initialiseArrows(update.view);
            return;
        }

        // Update arrows
        this.arrowIdentifierRanges = arrowIdentifierHighlighter.updateDeco(update, this.arrowIdentifierRanges);
        const posData = this.arrowIdentifierRangesToArrowIdentifierPosData(this.arrowIdentifierRanges, update.state);
        const collections = this.collectArrowIdentifierPosData(posData);
        
        // Build hierarchy information based on arrow positions
        this.arrowIdentifierCollections = buildArrowHierarchy(collections);
        
        const decos = this.arrowIdentifierCollectionsToDecos(this.arrowIdentifierCollections, update.view);
        this.decorations = decos;

        // Wait until widgets have been rendered in the DOM to draw arrows
        queueMicrotask(() => {
            this.arrowsManager.drawArrows(this.arrowIdentifierCollections);
        });
    }

    destroy() {
        this.arrowsManager.removeAllArrows();
        this.container.remove();
    }

    arrowIdentifierRangesToArrowIdentifierPosData(arrowIdentifierRanges: DecorationSet, state: EditorState): ArrowIdentifierPosData[] {
        const rangeCursor = arrowIdentifierRanges.iter();
        const arrowIdentifierPosData: ArrowIdentifierPosData[] = [];

        while (rangeCursor.value != null) {
            const from = rangeCursor.from;
            const to = rangeCursor.to;

            if (rangeWithinExcludedContext(from, to, state)) {
                rangeCursor.next();
                continue;
            }

            const arrowData = rangeCursor.value.spec.arrowIdentifierData;
            if (!arrowData) {
                rangeCursor.next();
                continue;
            }

            arrowIdentifierPosData.push({from: from, to: to, arrowData: arrowData});
            rangeCursor.next();
        }

        return arrowIdentifierPosData;
    }

    collectArrowIdentifierPosData(arrowIdentifierPosData: ArrowIdentifierPosData[]): ArrowIdentifierCollection[] {
        const result: {[identifier: string]: ArrowIdentifierCollection} = {};

        for (const arrowIdentifierPos of arrowIdentifierPosData) {
            const arrowData = arrowIdentifierPos.arrowData;
            const identifier = arrowData.identifier;
            const isStart = arrowData.isStart;

            // Group by identifier
            if (!(identifier in result)) {
                result[identifier] = {identifier: identifier, ends: []};
            }

            if (isStart) {
                result[identifier].start = arrowIdentifierPos;
            }
            else {
                result[identifier].ends.push(arrowIdentifierPos);
            }
        }

        return Object.values(result);
    }

    arrowIdentifierCollectionsToDecos(arrowIdentifierCollections: ArrowIdentifierCollection[], view: EditorView): DecorationSet {
        const decos = [];

        for (const arrowIdentifierCollection of arrowIdentifierCollections) {
            const isResolved = arrowIdentifierCollectionIsResolved(arrowIdentifierCollection);
            const allArrowIdentifiers = [arrowIdentifierCollection.start, ...arrowIdentifierCollection.ends];
            let color = "";

            if (isResolved) {
                const start = arrowIdentifierCollection.start;
                if (!start) continue;

                const startColor = start.arrowData.color;
                if (startColor) color = startColor;
            }

            color = colorToEffectiveColor(color, getArrowConfigFromView(view));

            for (const [index, arrowIdentifier] of allArrowIdentifiers.entries()) {
                if (!arrowIdentifier) continue;

                // "Unravel" the prettified circle when the cursor lies on the arrow identifier
                const sel = view.state.selection.main;
                const shouldUnravel = (sel.from >= arrowIdentifier.from) && (sel.to <= arrowIdentifier.to);

                let deco;
                if (isResolved && !shouldUnravel) {
                    const nextArrowIdentifier = allArrowIdentifiers[(index+1) % allArrowIdentifiers.length];
                    const scrollTo = nextArrowIdentifier?.from;

                    deco = Decoration.replace({
                        widget: new PrettifiedCircle(color, arrowIdentifier.arrowData, arrowIdentifierCollection.hierarchy?.level || 0),
                        inclusive: false,
                        block: false,
                        arrowIdentifierPosData: arrowIdentifier,
                        scrollTo: scrollTo
                    }).range(arrowIdentifier.from, arrowIdentifier.to);
                }
                else {
                    deco = Decoration.mark({
                        tagName: "span",
                        class: constants.ARROW_IDENTIFIER_CLASS,
                        arrowIdentifierPosData: arrowIdentifier
                    }).range(arrowIdentifier.from, arrowIdentifier.to);
                }

                decos.push(deco);
            }
        }

        return Decoration.set(decos, true);
    }
}


export const arrowsViewPlugin = ViewPlugin.fromClass(
    ArrowsViewPlugin,
    {
        decorations: v => v.decorations,
        eventHandlers: {
            // When a prettified arrow identifier is clicked, scroll the editor to the next arrow identifier
            mousedown: function (this, event, view) {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (!target.hasClass(constants.ARROW_IDENTIFIER_PRETTIFIED_CIRCLE_CLASS)) return;

                // Go through all decorations, searching for the decoration corresponding to
                // this element
                const decos:DecorationSet = this.decorations;
                const rangeCursor = decos.iter();
                const pos = view.posAtDOM(target);

                while (rangeCursor.value != null) {
                    if (rangeCursor.from === pos) break;
                    rangeCursor.next();
                }

                const deco = rangeCursor.value;
                if (deco == null) return;

                // Fetch the scrollTo attribute from the decoration and scroll to that position
                const scrollTo = deco.spec.scrollTo;
                view.dispatch({
                    effects: EditorView.scrollIntoView(scrollTo, {y: "center"})
                });

                event.preventDefault();
            }
        }
    }
);


class PrettifiedCircle extends WidgetType {
    private readonly color: string;
    private readonly arrowIdentifierData: ArrowIdentifierData;
    private readonly hierarchyLevel: number;

    constructor(color: string, arrowIdentifierData: ArrowIdentifierData, hierarchyLevel: number = 0) {
        super();

        this.color = color;
        this.arrowIdentifierData = arrowIdentifierData;
        this.hierarchyLevel = hierarchyLevel;
    }

    eq(other: PrettifiedCircle) {
        return (other.color === this.color && other.hierarchyLevel === this.hierarchyLevel);
    }

    toDOM() {
        const span = document.createElement("span");
        span.style.color = this.color;
        span.className = constants.ARROW_IDENTIFIER_PRETTIFIED_CIRCLE_CLASS;
        
        // Add hierarchy level as a data attribute for potential styling
        span.setAttribute('data-hierarchy-level', this.hierarchyLevel.toString());

        // Use different symbol or style based on hierarchy level
        if (this.hierarchyLevel > 0) {
            span.classList.add('hierarchy-level-' + this.hierarchyLevel);
            // Could use different symbols for different levels if desired
            // span.textContent = this.hierarchyLevel === 1 ? "◆" : "■"; 
        }
        
        span.textContent = "●"; // Default circle
        return span;
    }

    ignoreEvent() {
        return false;
    }
}