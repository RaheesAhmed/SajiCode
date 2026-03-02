/**
 * Copyright (c) 2025 OpenAgent Team
 * Licensed under the MIT License
 *
 *  File System Tools for OpenAgent
 * These tools create/modify ACTUAL files on disk (not just virtual files)
 * Uses different names to avoid conflicts with Deep Agents built-in tools
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

/**
 * Create  file tool - Actually writes files to disk
 */
export const createFileTool = tool(
  async (input: { file_path: string; content: string }) => {
    const { file_path, content } = input;
    
    try {
      // Ensure directory exists
      const dir = path.dirname(file_path);
      await fs.mkdir(dir, { recursive: true });
      
      // Write actual file to disk
      await fs.writeFile(file_path, content, 'utf8');
      
      return `✅ Successfully created  file: ${file_path}`;
    } catch (error) {
      return `❌ Failed to create file '${file_path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "create__file",
    description: "Create a  file on the filesystem (not virtual)",
    schema: z.object({
      file_path: z.string().describe("Path where to create the file"),
      content: z.string().describe("Content to write to the file"),
    }),
  }
);

/**
 * Read  file tool - Reads actual files from disk
 */
export const readFileTool = tool(
  async (input: { file_path: string; start_line?: number; end_line?: number }) => {
    const { file_path, start_line, end_line } = input;
    
    try {
      const content = await fs.readFile(file_path, 'utf8');
      
      if (start_line !== undefined || end_line !== undefined) {
        const lines = content.split('\n');
        const startIdx = (start_line || 1) - 1;
        const endIdx = end_line ? end_line - 1 : lines.length - 1;
        
        const selectedLines = lines.slice(startIdx, endIdx + 1);
        const numberedLines = selectedLines.map((line, idx) => {
          const lineNum = startIdx + idx + 1;
          return `${lineNum.toString().padStart(4)}: ${line}`;
        });
        
        return numberedLines.join('\n');
      }
      
      return content;
    } catch (error) {
      return `❌ Failed to read file '${file_path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "read__file",
    description: "Read a  file from the filesystem (not virtual)",
    schema: z.object({
      file_path: z.string().describe("Path to the file to read"),
      start_line: z.number().optional().describe("Start line number (1-based)"),
      end_line: z.number().optional().describe("End line number (1-based)"),
    }),
  }
);

/**
 * Update  file tool - Modifies actual files on disk
 */
export const updateFileTool = tool(
  async (input: {
    file_path: string;
    old_text: string;
    new_text: string;
    replace_all?: boolean;
  }) => {
    const { file_path, old_text, new_text, replace_all = false } = input;
    
    try {
      const content = await fs.readFile(file_path, 'utf8');
      
      if (!content.includes(old_text)) {
        return `❌ Text not found in file '${file_path}': ${old_text}`;
      }
      
      let newContent: string;
      if (replace_all) {
        const regex = new RegExp(old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        newContent = content.replace(regex, new_text);
      } else {
        newContent = content.replace(old_text, new_text);
      }
      
      await fs.writeFile(file_path, newContent, 'utf8');
      
      return `✅ Successfully updated  file: ${file_path}`;
    } catch (error) {
      return `❌ Failed to update file '${file_path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "update__file",
    description: "Update a  file on the filesystem by replacing text",
    schema: z.object({
      file_path: z.string().describe("Path to the file to update"),
      old_text: z.string().describe("Text to find and replace"),
      new_text: z.string().describe("Text to replace with"),
      replace_all: z.boolean().optional().default(false).describe("Replace all occurrences"),
    }),
  }
);

/**
 * Helper function for directory scanning
 */
async function scanDirectory(dir: string, items: string[], recursive: boolean, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      items.push(`📁 ${relativePath}/`);
      if (recursive) {
        await scanDirectory(fullPath, items, recursive, relativePath);
      }
    } else {
      items.push(`📄 ${relativePath}`);
    }
  }
}

/**
 * List  directory tool
 */
export const listDirectoryTool = tool(
  async (input: { directory_path: string; recursive?: boolean }) => {
    const { directory_path, recursive = false } = input;
    
    try {
      const items: string[] = [];
      await scanDirectory(directory_path, items, recursive);
      return items.join('\n');
    } catch (error) {
      return `❌ Failed to list directory '${directory_path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "list__directory",
    description: "List contents of a  directory on the filesystem",
    schema: z.object({
      directory_path: z.string().describe("Path to the directory to list"),
      recursive: z.boolean().optional().default(false).describe("List recursively"),
    }),
  }
);

/**
 * Create  directory tool
 */
export const createDirectoryTool = tool(
  async (input: { directory_path: string }) => {
    const { directory_path } = input;
    
    try {
      await fs.mkdir(directory_path, { recursive: true });
      return `✅ Successfully created directory: ${directory_path}`;
    } catch (error) {
      return `❌ Failed to create directory '${directory_path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "create__directory",
    description: "Create a  directory on the filesystem",
    schema: z.object({
      directory_path: z.string().describe("Path of the directory to create"),
    }),
  }
);

// Export all  file tools
export const allFileTools = [
  createFileTool,
  readFileTool, 
  updateFileTool,
  listDirectoryTool,
  createDirectoryTool,
];

export default allFileTools;
