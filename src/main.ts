#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Mermaid Validator",
  version: "0.6.0",
});

// Add a mermaid validation tool
server.tool(
  "validateMermaid",
  "Validates a Mermaid diagram and returns the rendered image (PNG or SVG) if valid",
  { 
    diagram: z.string(),
    format: z.enum(["svg", "png"]).optional().default("png")
  },
  async ({ diagram, format = "png" }) => {
    try {
      try {
        // Use child_process.spawn to create a process and pipe the diagram to stdin
        // Read diagram from STDIN and write image to STDOUT.
        // Use "-" instead of "/dev/stdin" for cross-platform compatibility (WSL, Windows, CI).
        const args = [
          "@mermaid-js/mermaid-cli",
          "-i",
          "-", // read from stdin
          "-o",
          "-", // write to stdout
          "-e",
          format,
        ];
        
        // Add transparent background for PNG format
        if (format === "png") {
          args.push("-b", "transparent");
        }
        
        const mmdc = spawn("npx", args, { stdio: ["pipe", "pipe", "pipe"] });

        // Write the diagram to stdin and close it
        mmdc.stdin.write(diagram);
        mmdc.stdin.end();

        // Capture stdout (image content) and stderr (error messages)
        const outputChunks: Buffer[] = [];
        let svgContent = "";
        let errorOutput = "";

        mmdc.stdout.on("data", (data: Buffer) => {
          if (format === "svg") {
            svgContent += data.toString();
          } else {
            outputChunks.push(data);
          }
        });

        mmdc.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        // Wait for the process to complete
        await new Promise<void>((resolve, reject) => {
          mmdc.on("close", (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(
                new Error(
                  `mermaid-cli process exited with code ${code}${errorOutput ? "\n\nError details:\n" + errorOutput : ""}`,
                ),
              );
            }
          });

          mmdc.on("error", (err: Error) => {
            reject(
              new Error(
                `${err.message}${errorOutput ? "\n\nError details:\n" + errorOutput : ""}`,
              ),
            );
          });
        });

        // If we get here, the diagram is valid
        if (format === "svg") {
          return {
            content: [
              {
                type: "text",
                text: "Mermaid diagram is valid",
              },
              {
                type: "image",
                data: Buffer.from(svgContent).toString("base64"),
                mimeType: "image/svg+xml",
              },
            ],
          };
        } else {
          const pngBuffer = Buffer.concat(outputChunks);
          return {
            content: [
              {
                type: "text",
                text: "Mermaid diagram is valid",
              },
              {
                type: "image",
                data: pngBuffer.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        }
      } catch (validationError: unknown) {
        // The diagram is invalid
        const errorMessage =
          validationError instanceof Error
            ? validationError.message
            : String(validationError);

        // Split the error message to separate the main error from stderr details
        const [mainError, ...errorDetails] = errorMessage.split(
          "\n\nError details:\n",
        );

        const errorContent: Array<{ type: "text"; text: string }> = [
          {
            type: "text",
            text: "Mermaid diagram is invalid",
          },
          {
            type: "text",
            text: mainError,
          },
        ];

        // Add stderr output if available
        if (errorDetails.length > 0) {
          errorContent.push({
            type: "text",
            text: "Detailed error output:\n" + errorDetails.join("\n"),
          });
        }

        return {
          content: errorContent,
        };
      }
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `Error processing Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

const app = async () => {
  await server.connect(transport);
};

app();
