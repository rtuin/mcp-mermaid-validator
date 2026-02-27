# MCP Server: Mermaid Validator

A Model Context Protocol server that validates and renders [Mermaid](https://mermaid.js.org/) diagrams. This server enables LLMs to validate and render Mermaid diagrams.

## Usage

### Quick Start

You can configure your MCP client to use the Mermaid Validator by adding it to your mcp servers file:

```json
{
  "mcpServers": {
    "mermaid-validator": {
      "command": "npx",
      "args": [
        "-y",
        "@rtuin/mcp-mermaid-validator@latest"
      ]
    }
  }
}
```

## Architecture

### High-Level Architecture

This project is structured as a simple TypeScript Node.js application that:

1. **Main Application**: A Node.js service that validates Mermaid diagrams and returns rendered PNG output
2. **MCP Integration**: Uses the Model Context Protocol SDK to expose functionality to MCP-compatible clients
3. **Mermaid CLI Integration**: Leverages the Mermaid CLI tool to perform diagram validation and rendering

### Code Structure

```
mcp-mermaid-validator/
├── dist/                   # Compiled JavaScript output
│   └── main.js             # Compiled main application
├── src/                    # TypeScript source code
│   └── main.ts             # Main application entry point
├── node_modules/           # Dependencies
├── package.json            # Project dependencies and scripts
├── package-lock.json       # Dependency lock file
├── tsconfig.json           # TypeScript configuration
├── eslint.config.js        # ESLint configuration
├── .prettierrc             # Prettier configuration
└── README.md               # Project documentation
```

## Component Functionality

### MCP Server (Main Component)

The core functionality is implemented in `src/main.ts`. This component:

1. Creates an MCP server instance
2. Registers a `validateMermaid` tool that accepts Mermaid diagram syntax
3. Uses the Mermaid CLI to validate and render diagrams
4. Returns validation results and rendered PNG (if valid)
5. Handles error cases with appropriate error messages

### Data Flow

1. **Input**: Mermaid diagram syntax as a string
2. **Processing**:
   - The diagram is passed to the Mermaid CLI via stdin
   - The CLI validates the syntax and renders a PNG if valid
   - Output and errors are captured from stdout/stderr
3. **Output**:
   - Success: Text confirmation + rendered PNG as base64-encoded image
   - Failure: Error message with details about the validation failure

## Dependencies

### External Libraries

- **@modelcontextprotocol/sdk**: SDK for implementing Model Context Protocol
- **@mermaid-js/mermaid-cli**: CLI tool for validating and rendering Mermaid diagrams
- **zod**: Schema validation library for TypeScript

### Development Dependencies

- **typescript**: TypeScript compiler
- **eslint**: Linting utility
- **prettier**: Code formatting

## API Specification

### validateMermaid Tool

**Purpose**: Validates a Mermaid diagram and returns the rendered PNG if valid

**Parameters**:
- `diagram` (string): The Mermaid diagram syntax to validate

**Return Value**:
- Success:
  ```typescript
  {
    content: [
      { 
        type: "text", 
        text: "Mermaid diagram is valid" 
      },
      {
        type: "image", 
        data: string, // Base64-encoded PNG
        mimeType: "image/png"
      }
    ]
  }
  ```
- Failure:
  ```typescript
  {
    content: [
      { 
        type: "text", 
        text: "Mermaid diagram is invalid" 
      },
      {
        type: "text",
        text: string // Error message
      },
      {
        type: "text",
        text: string // Detailed error output (if available)
      }
    ]
  }
  ```

## Technical Decisions

1. **MCP Integration**: The project uses the Model Context Protocol to standardize the interface for AI tools, allowing seamless integration with compatible clients.

2. **PNG Output Format**: The implementation uses PNG as the default output format to ensure better compatibility with most MCP clients, particularly Cursor, which doesn't support SVG.

3. **Child Process Approach**: The implementation uses Node.js child processes to interact with the Mermaid CLI, which provides:
   - Isolation between the main application and the rendering process
   - Ability to capture detailed error information
   - Proper handling of the rendering pipeline

4. **Error Handling Strategy**: The implementation uses a nested try-catch structure to:
   - Distinguish between validation errors (invalid diagram syntax) and system errors
   - Provide detailed error information to help users fix their diagrams
   - Ensure the service remains stable even when processing invalid input

5. **Simple Project Structure**: The project uses a straightforward TypeScript project structure for:
   - Easy maintenance and understanding
   - Direct dependency management
   - Simplified build process

## Build and Execution

The application can be built and run using npm scripts:

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Run locally (for development)
npx @modelcontextprotocol/inspector node dist/main.js

# Format code
npm run format

# Lint code
npm run lint

# Watch for changes (development)
npm run watch
```

The application runs as an MCP server that communicates via standard input/output, making it suitable for integration with MCP-compatible clients.

## Release

To release a new version, the following steps in order:

- `npm run build`
- `npm run bump`
- `npm run changelog`
- `npm publish --access public`


## Troubleshooting

- WSL/Windows stdin: Earlier versions invoked Mermaid CLI with `/dev/stdin`, which can fail on WSL with `ENXIO`. This server now uses `-` for stdin/stdout (`-i -` / `-o -`) to be portable across Linux/macOS/WSL/Windows.
- Inspector working dir: When launching via the MCP Inspector, ensure the server path resolves (e.g. `npx @modelcontextprotocol/inspector npx -y @rtuin/mcp-mermaid-validator@latest` or use an absolute path to `dist/main.js`).
