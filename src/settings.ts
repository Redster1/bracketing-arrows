import { App, PluginSettingTab, Setting, debounce } from 'obsidian';
import DiscourseTreePlugin from './main';

export interface DiscourseTreeSettings {
    defaultNodeColor: string;
    treeOrientation: string;
    marginWidth: number;
    nodeSize: number;
    nodeFontSize: number;
    lineWidth: number;
    userDefinedColors: string;
}

export const DEFAULT_SETTINGS: DiscourseTreeSettings = {
    defaultNodeColor: "var(--text-normal)",
    treeOrientation: "horizontal",
    marginWidth: 300,
    nodeSize: 5,
    nodeFontSize: 12,
    lineWidth: 1.5,
    userDefinedColors: ""
}

export class DiscourseTreeSettingTab extends PluginSettingTab {
    plugin: DiscourseTreePlugin;

    constructor(app: App, plugin: DiscourseTreePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Default node color')
            .setDesc('The default color for tree nodes, in any valid CSS notation. Use `var(--text-normal)` to default to black/white in light/dark mode.')
            .addText(text => text
                .setPlaceholder('var(--text-normal)')
                .setValue(this.plugin.settings.defaultNodeColor)
                .onChange(async (value) => {
                    this.plugin.settings.defaultNodeColor = value;

                    debounce(() => {
                        this.plugin.reconfigureTreeConfig();
                        this.plugin.reloadTreeViewPlugin();
                    }, 1000);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Tree orientation')
            .setDesc('The orientation of the tree visualization.')
            .addDropdown(dropdown => dropdown
                .addOptions({horizontal: "Horizontal", vertical: "Vertical"})
                .setValue(this.plugin.settings.treeOrientation)
                .onChange(async (value) => {
                    this.plugin.settings.treeOrientation = value;
                    this.plugin.reconfigureTreeConfig();
                    this.plugin.reloadTreeViewPlugin();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Margin width')
            .setDesc('Width of the margin area for tree visualization (in pixels).')
            .addSlider(slider => slider
                .setLimits(100, 500, 50)
                .setValue(this.plugin.settings.marginWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.marginWidth = value;
                    this.plugin.reconfigureTreeConfig();
                    this.plugin.reloadTreeViewPlugin();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Node size')
            .setDesc('Size of the tree nodes (in pixels).')
            .addSlider(slider => slider
                .setLimits(2, 10, 1)
                .setValue(this.plugin.settings.nodeSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nodeSize = value;
                    this.plugin.reconfigureTreeConfig();
                    this.plugin.reloadTreeViewPlugin();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Node font size')
            .setDesc('Font size for node labels (in pixels).')
            .addSlider(slider => slider
                .setLimits(8, 16, 1)
                .setValue(this.plugin.settings.nodeFontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nodeFontSize = value;
                    this.plugin.reconfigureTreeConfig();
                    this.plugin.reloadTreeViewPlugin();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Line width')
            .setDesc('Width of the connecting lines between nodes (in pixels).')
            .addSlider(slider => slider
                .setLimits(0.5, 3, 0.5)
                .setValue(this.plugin.settings.lineWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.lineWidth = value;
                    this.plugin.reconfigureTreeConfig();
                    this.plugin.reloadTreeViewPlugin();
                    await this.plugin.saveSettings();
                }));

        const customColorsSetting = new Setting(containerEl)
            .setName('User-defined colors')
            .setDesc('A list of custom user-defined colors. Trees whose color is set to a value in this list will have their color overridden by the specified value. Use the format custom-color-name: color, with each color separated by a new line. e.g. my-custom-color: #26edab')
            .addTextArea(text => text
                .setValue(this.plugin.settings.userDefinedColors)
                .setPlaceholder("my-custom-color: #26edab\nblue: rgb(0, 98, 255)\ngreen: limegreen")
                .onChange(async (value) => {
                    this.plugin.settings.userDefinedColors = value;

                    debounce(() => {
                        this.plugin.reconfigureTreeConfig();
                        this.plugin.reloadTreeViewPlugin();
                    }, 1000);

                    await this.plugin.saveSettings();
                }));

        customColorsSetting.controlEl.addClass("discourse-tree-custom-colors-input");
    }
}