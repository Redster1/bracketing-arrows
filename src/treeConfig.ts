// Similar structure to arrowsConfig.ts but for trees
import { Facet, Compartment } from "@codemirror/state";
import { DiscourseTreeSettings } from "./settings";

export const treeConfig = Facet.define<DiscourseTreeSettings, DiscourseTreeSettings>({
    combine: (input) => input[0] || DEFAULT_SETTINGS
});

export const treeConfigCompartment = new Compartment();

export function getTreeConfigFromView(view: any) {
    return view.state.facet(treeConfig);
}

// Will be imported from settings.ts once we update it
export const DEFAULT_SETTINGS = {
    defaultNodeColor: "var(--text-normal)",
    treeOrientation: "horizontal",
    marginWidth: 300,
    nodeSize: 5,
    nodeFontSize: 12,
    lineWidth: 1.5,
    userDefinedColors: ""
};