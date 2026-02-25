#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Mermaid Validator",
  version: "0.8.0",
});

type MermaidFormat = "svg" | "png";

interface MermaidResult {
  valid: boolean;
  imageData: string;
  mimeType: string;
  error?: string;
}

const RENDER_TIMEOUT_MS = 30_000;

async function runMermaidCli(
  diagram: string,
  format: MermaidFormat,
): Promise<MermaidResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "mermaid-"));
  const inputFile = join(tmpDir, `input.mmd`);
  const outputFile = join(tmpDir, `output.${format}`);

  try {
    // Write diagram to a temp file so mermaid-cli can read it directly
    await writeFile(inputFile, diagram);

    const args = [
      "@mermaid-js/mermaid-cli",
      "-i",
      inputFile,
      "-o",
      outputFile,
      "-e",
      format,
    ];

    // Add transparent background for PNG format
    if (format === "png") {
      args.push("-b", "transparent");
    }

    const mmdc = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"] });

    let errorOutput = "";
    mmdc.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    // Wait for the process to complete with a timeout
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          mmdc.kill();
          reject(new Error("mermaid-cli process timed out"));
        }, RENDER_TIMEOUT_MS);

        mmdc.on("close", (code: number) => {
          clearTimeout(timeout);
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
          clearTimeout(timeout);
          reject(
            new Error(
              `${err.message}${errorOutput ? "\n\nError details:\n" + errorOutput : ""}`,
            ),
          );
        });
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { valid: false, imageData: "", mimeType: "", error: errorMessage };
    }

    // Read the output file
    const outputData = await readFile(outputFile);
    const mimeType = format === "svg" ? "image/svg+xml" : "image/png";
    const imageData = outputData.toString("base64");

    return { valid: true, imageData, mimeType };
  } finally {
    // Clean up temp directory
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function formatError(errorMessage: string) {
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

  if (errorDetails.length > 0) {
    errorContent.push({
      type: "text",
      text: "Detailed error output:\n" + errorDetails.join("\n"),
    });
  }

  return { content: errorContent };
}

// Validate a mermaid diagram (no image returned)
server.tool(
  "validateMermaid",
  "Validates a Mermaid diagram and returns whether it is valid or not",
  {
    diagram: z.string(),
  },
  async ({ diagram }) => {
    try {
      const result = await runMermaidCli(diagram, "svg");

      if (result.valid) {
        return {
          content: [
            {
              type: "text",
              text: "Mermaid diagram is valid",
            },
          ],
        };
      }

      return formatError(result.error!);
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

// Render a mermaid diagram and return the image
server.tool(
  "renderMermaid",
  "Validates a Mermaid diagram and returns the rendered image (PNG or SVG) if valid",
  {
    diagram: z.string(),
    format: z.enum(["svg", "png"]).optional().default("png"),
  },
  async ({ diagram, format = "png" }) => {
    try {
      const result = await runMermaidCli(diagram, format);

      if (result.valid) {
        return {
          content: [
            {
              type: "text",
              text: "Mermaid diagram is valid",
            },
            {
              type: "image",
              data: result.imageData,
              mimeType: result.mimeType,
            },
          ],
        };
      }

      return formatError(result.error!);
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
