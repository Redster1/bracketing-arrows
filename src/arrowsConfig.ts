import { Facet, StateEffect, Extension, Compartment } from "@codemirror/state";
import { DiscourseTreeSettings } from "./settings";

// Keep this for backward compatibility
export interface ArrowsPluginSettings {
    defaultArrowColor: string;
    diagonalArrowStyle: string;
    userDefinedColors: string;
}

export const DEFAULT_ARROWS_SETTINGS: ArrowsPluginSettings = {
    defaultArrowColor: "var(--text-normal)",
    diagonalArrowStyle: "fluid",
    userDefinedColors: ""
};

export const arrowsConfig = Facet.define<ArrowsPluginSettings, ArrowsPluginSettings>({
    combine: (values) => values[0] || DEFAULT_ARROWS_SETTINGS
});

export const arrowsConfigCompartment = new Compartment();

export function getArrowsConfigExtension(settings: ArrowsPluginSettings): Extension {
    return arrowsConfigCompartment.of(arrowsConfig.of(settings));
}

export const reconfigureArrowsConfig = StateEffect.define<ArrowsPluginSettings>();

export function getArrowConfigFromView(view: any) {
    return view.state.facet(arrowsConfig);
}