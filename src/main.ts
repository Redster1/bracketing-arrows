import { Plugin } from 'obsidian';
import { Extension } from '@codemirror/state';
import { DiscourseTreeSettingTab, DiscourseTreeSettings, DEFAULT_SETTINGS } from "./settings";
import { treeViewPlugin, refreshAllTrees } from "./treeViewPlugin";
import { treeConfig, treeConfigCompartment } from './treeConfig';
import { iterateCM6 } from './utils';
import { autoNodeViewPlugin } from './autoNodeHandler';

export default class DiscourseTreePlugin extends Plugin {
    settings: DiscourseTreeSettings;
    extensions: Extension[];
    userDefinedColorsDict: {[colorName: string]: string};

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new DiscourseTreeSettingTab(this.app, this));

        // Add CSS classes for tree visualization
        document.body.classList.add('discourse-tree-plugin-enabled');

        // Initialize extensions
        this.extensions = [
            treeConfigCompartment.of(treeConfig.of(this.settings)),
            treeViewPlugin.extension,
            autoNodeViewPlugin
        ];
        
        // Register editor extensions
        this.registerEditorExtension(this.extensions);
    }

    onunload() {
        // Remove CSS classes
        document.body.classList.remove('discourse-tree-plugin-enabled');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    reconfigureTreeConfig() {
        iterateCM6(this.app.workspace, (view) => {
            view.dispatch({
                effects: treeConfigCompartment.reconfigure(treeConfig.of(this.settings))
            });
        });
    }

    reloadTreeViewPlugin() {
        iterateCM6(this.app.workspace, (view) => {
            view.dispatch({
                effects: refreshAllTrees.of(null)
            });
        });
    }
}