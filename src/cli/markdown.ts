/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import chalk from "chalk";

const ACCENT = chalk.hex("#7C3AED");
const CODE_BG = chalk.bgHex("#1e1e2e").hex("#cdd6f4");

export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];


  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        output.push("");
        for (const cl of codeBuffer) {
          output.push(`  ${CODE_BG(` ${cl} `)}`);
        }
        output.push("");
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    output.push(formatLine(line));
  }

  return output.join("\n");
}

function formatLine(line: string): string {
  if (line.startsWith("### ")) {
    return chalk.bold(ACCENT(line.slice(4)));
  }
  if (line.startsWith("## ")) {
    return "\n" + chalk.bold.underline(ACCENT(line.slice(3)));
  }
  if (line.startsWith("# ")) {
    return "\n" + chalk.bold.underline(ACCENT(line.slice(2)));
  }

  if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
    return chalk.dim("─".repeat(60));
  }

  if (/^\s*[-*]\s/.test(line)) {
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const content = line.replace(/^\s*[-*]\s+/, "");
    return `${indent}  ${ACCENT("•")} ${formatInline(content)}`;
  }

  if (/^\s*\d+\.\s/.test(line)) {
    const match = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      return `${match[1]}  ${ACCENT(match[2] + ".")} ${formatInline(match[3])}`;
    }
  }

  return formatInline(line);
}

function formatInline(text: string): string {
  text = text.replace(/\*\*(.+?)\*\*/g, (_, p1) => chalk.bold(p1));

  text = text.replace(/\*(.+?)\*/g, (_, p1) => chalk.italic(p1));

  text = text.replace(/`([^`]+)`/g, (_, p1) => chalk.cyan(p1));

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    `${chalk.underline(label)} ${chalk.dim(`(${url})`)}`
  );

  return text;
}
