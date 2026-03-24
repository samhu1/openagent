import * as t from "@babel/types";

export default function babelPluginDataAi() {
  return {
    name: "babel-plugin-data-ai",
    visitor: {
      JSXOpeningElement(path, state) {
        // Only run in development or review mode
        if (process.env.NODE_ENV === "production" && !process.env.VITE_REVIEW_MODE) {
          return;
        }

        const filename = state.file.opts.filename;
        // Ignore node_modules
        if (!filename || filename.includes("node_modules")) {
          return;
        }

        const componentName = path.node.name.name;
        // Only inject into capital-letter components (React Custom Components)
        // or primitive DOM elements? For visual review, injecting on primitive elements
        // inside a component is often needed to click on a specific <div>.
        // Let's inject file path and line number on all intrinsic elements as well.

        const line = path.node.loc?.start.line;

        const relativePath = filename.replace(process.cwd(), "");

        // Helper to safely add attribute if it doesn't exist
        const addAttribute = (name, value) => {
          const exists = path.node.attributes.some(
            (attr) => t.isJSXAttribute(attr) && attr.name.name === name
          );
          if (!exists) {
            path.node.attributes.push(
              t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value))
            );
          }
        };

        // Inject data-ai-file
        addAttribute("data-ai-file", relativePath);

        // Inject data-ai-line
        if (line) {
          addAttribute("data-ai-line", line.toString());
        }

        // Inject data-ai-name if it's a known custom component (starts with an uppercase letter)
        if (componentName && /^[A-Z]/.test(componentName)) {
          addAttribute("data-ai-name", componentName);
        }
      },
    },
  };
}
