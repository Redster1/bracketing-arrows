export const ARROW_IDENTIFIER_CLASS = "arrow-identifier";
export const ARROW_START_IDENTIFIER_CLASS = "arrow-start-identifier";
export const ARROW_END_IDENTIFIER_CLASS = "arrow-end-identifier";
export const ARROW_IDENTIFIER_PRETTIFIED_CIRCLE_CLASS = "arrow-identifier-prettified-circle";
export const ARROW_CONTAINER_CLASS = "arrow-container";

export const ARROW_SIZE = 3;
export const DIAGONAL = "diagonal";
export const MARGIN = "margin";
export const BRACKET = "bracket"; // NEW: Special type for bracket/tree structures
export const arrowTypes = [DIAGONAL, MARGIN, BRACKET]; // Added BRACKET type
export const ARROW = "arrow";
export const NOARROW = "no-arrow";
export const arrowPlugTypes = [ARROW, NOARROW];
export const DISC = "disc";
export const MARGIN_ARROW_X_OFFSET = 20;

// Connection point identifiers for bracket structures
export const CONNECTION_POINT_PATTERN = /arrows:(\d+)/; // Pattern to extract connection point number
export const ARROWS_PREFIX = "arrows:";

// Leader-Line library
export const MARGIN_ARROW = "arrow1";
export const DIAGONAL_ARROW = "arrow2";