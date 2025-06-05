# Discourse Tree Plugin for Obsidian

A plugin for visualizing hierarchical discourse analysis trees in the document margin, allowing users to visualize logical relationships and argument structures alongside their text.

## Features

- Create hierarchical tree visualizations directly from text syntax
- Display trees in the right margin of your notes
- Support for nested parent-child relationships
- Customizable node appearance and tree layout
- Works with Obsidian's light and dark themes

## Syntax

Define tree nodes using the following syntax:

```
{node_id|parent_id|label}
```

Where:
- `node_id`: A unique identifier for this node
- `parent_id`: The identifier of the parent node (use "root" for top-level nodes)
- `label`: (Optional) A text label for the node

## Example

Adding the following to your document:

```
{A|root|Main Argument}This is my main argument.
{B|A|Supporting Evidence 1}Here's my first piece of evidence.
{C|A|Supporting Evidence 2}And here's another.
{D|B|Detail}With an additional detail.
```

Will render a tree in the margin showing the hierarchical relationship between these nodes.

## Settings

You can customize the appearance of your trees in the plugin settings:

- Tree orientation (horizontal/vertical)
- Margin width
- Node size
- Font size
- Line width
- Custom colors

## Installation

1. Download the latest release from the Releases page
2. Extract the zip file into your Obsidian plugins folder
3. Enable the plugin in Obsidian settings

## Development

This plugin is built using:

- D3.js for tree visualization
- CodeMirror 6 for editor integration

## Credits

- Based on the architecture of the [Obsidian Arrows plugin](https://github.com/artisticat1/obsidian-arrows)
- Uses D3.js for tree visualization

## License

MIT