// src/leaderline.d.ts

declare module 'leaderline' {
    export type LeaderLinePath = 'straight' | 'arc' | 'fluid' | 'magnet' | 'grid';
    
    export interface CaptionLabelOptions {
        color?: string;
        offset?: [number, number];
        lineOffset?: number;
        fontFamily?: string;
        fontStyle?: string;
        fontVariant?: string;
        fontWeight?: string;
        fontStretch?: string;
        fontSize?: string;
        fontSizeAdjust?: string;
        kerning?: string;
        letterSpacing?: string;
        wordSpacing?: string;
        textDecoration?: string;
    }

    export interface LeaderLineOptions {
        parent?: HTMLElement;
        start: HTMLElement | PointAnchor;
        end: HTMLElement | PointAnchor;
        color?: string;
        size?: number;
        startPlug?: string;
        startPlugSize?: number;
        endPlug?: string;
        endPlugSize?: number;
        startLabel?: CaptionLabel;
        middleLabel?: CaptionLabel;
        endLabel?: CaptionLabel;
        path?: LeaderLinePath;
        startSocket?: 'top' | 'right' | 'bottom' | 'left' | 'auto';
        endSocket?: 'top' | 'right' | 'bottom' | 'left' | 'auto';
        startSocketGravity?: number | [number, number];
        endSocketGravity?: number | [number, number];
    }

    export interface PointAnchorOptions {
        x: number;
        y: number;
    }

    export class CaptionLabel {
        constructor(text: string, options?: CaptionLabelOptions);
    }

    export class PointAnchor {
        constructor(element: HTMLElement, options: PointAnchorOptions);
    }

    export default class LeaderLine {
        constructor(options: LeaderLineOptions);
        
        static captionLabel(text: string, options?: CaptionLabelOptions): CaptionLabel;
        static PointAnchor(element: HTMLElement, options: PointAnchorOptions): PointAnchor;
        
        element: HTMLElement;
        _id: number;
        
        remove(): void;
        position(): void;
        setOptions(options: Partial<LeaderLineOptions>): void;
        show(showEffectName?: string, animOptions?: any): void;
        hide(showEffectName?: string, animOptions?: any): void;
    }
}
