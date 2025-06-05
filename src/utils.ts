// Keep only the necessary utility functions for the discourse tree plugin

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Workspace, MarkdownView } from "obsidian";
import { ArrowsPluginSettings } from "./arrowsConfig";

export function rangeWithinExcludedContext(from: number, to: number, state: EditorState) {
    const tree = syntaxTree(state);
    const tokenFrom = tree.resolveInner(from, 1).name;
    const tokenTo = tree.resolveInner(to, -1).name;

    return ["math", "codeblock", "inline-code"].some((val) => (tokenFrom.contains(val) || tokenTo.contains(val)));
}

function getUserDefinedColorsDict(arrowSettings: ArrowsPluginSettings) {
    const dict: {[colorName: string]: string} = {};

    const lines = arrowSettings.userDefinedColors.split("\n");
    lines.forEach((val: string) => {
        const line = val.replaceAll(" ", "").split(":");

        if (line[1])
            dict[line[0]] = line[1];
    });

    return dict;
}

export function colorToEffectiveColor(colorName: string | undefined, arrowSettings: ArrowsPluginSettings): string {
    let defaultColor = arrowSettings.defaultArrowColor;
    if (!defaultColor) defaultColor = "var(--text-normal)";

    if (!colorName) return defaultColor;

    // Process dict for user-defined colors
    const userDefinedColors = getUserDefinedColorsDict(arrowSettings);
    if (colorName in userDefinedColors) {
        return userDefinedColors[colorName];
    }

    return colorName;
}

export function iterateCM6(workspace: Workspace, callback: (editor: EditorView) => unknown) {
    workspace.iterateAllLeaves(leaf => {
        leaf?.view instanceof MarkdownView &&
        (leaf.view.editor as any)?.cm instanceof EditorView &&
        callback((leaf.view.editor as any).cm);
    });
}