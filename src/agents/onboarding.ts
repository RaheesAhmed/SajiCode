import { select, input } from "@inquirer/prompts";
import chalk from "chalk";
import type { OnboardingResult, ExperienceLevel, StackPreferences } from "../types/index.js";

export async function runOnboarding(userPrompt?: string, headless: boolean = false): Promise<OnboardingResult> {
  if (!headless) {
    console.log(chalk.hex("#FF8C00").bold("\n🤖 SajiCode — AI Engineering Team"));
    console.log(chalk.hex("#FF8C00")("━".repeat(42)));
    console.log(chalk.gray("\n📋 Onboarding Agent\n"));
  }

  if (headless) {
    const desc = userPrompt ?? "Execute automated task";
    return {
      experienceLevel: "expert",
      projectDescription: desc,
      projectType: inferProjectType(desc),
      features: extractFeatures(desc),
      stackPreferences: {},
    };
  }

  const experienceLevel = await select<ExperienceLevel>({
    message: "What is your experience level?",
    choices: [
      { name: "🟢 Beginner — I'm new to coding", value: "beginner" },
      { name: "🟡 Intermediate — I know the basics", value: "intermediate" },
      { name: "🔴 Expert — I know exactly what I want", value: "expert" },
    ],
  });

  const projectDescription = userPrompt ?? await input({
    message: experienceLevel === "beginner"
      ? "What do you want to build? (describe in plain language)"
      : "Describe your project:",
  });

  let stackPreferences: StackPreferences = {};

  if (experienceLevel === "expert") {
    const framework = await input({
      message: "Framework preference? (e.g., next, express, vite — or press enter for auto):",
    });

    const database = await input({
      message: "Database? (e.g., postgres, sqlite, mongo — or press enter for auto):",
    });

    if (framework.trim()) stackPreferences.framework = framework.trim();
    if (database.trim()) stackPreferences.database = database.trim();
  }

  const features = extractFeatures(projectDescription);

  console.log(chalk.green("\n✅ Got it. Assembling your team...\n"));

  return {
    experienceLevel,
    projectDescription,
    projectType: inferProjectType(projectDescription),
    features,
    stackPreferences,
  };
}

function extractFeatures(description: string): string[] {
  const features: string[] = [];
  const desc = description.toLowerCase();

  if (desc.includes("auth") || desc.includes("login") || desc.includes("sign up")) {
    features.push("authentication");
  }
  if (desc.includes("payment") || desc.includes("stripe") || desc.includes("billing")) {
    features.push("payments");
  }
  if (desc.includes("database") || desc.includes("data") || desc.includes("store")) {
    features.push("database");
  }
  if (desc.includes("api") || desc.includes("rest") || desc.includes("graphql")) {
    features.push("api");
  }
  if (desc.includes("real-time") || desc.includes("websocket") || desc.includes("chat")) {
    features.push("real-time");
  }
  if (desc.includes("deploy") || desc.includes("host") || desc.includes("cloud")) {
    features.push("deployment");
  }
  if (desc.includes("test") || desc.includes("tdd")) {
    features.push("testing");
  }

  return features;
}

function inferProjectType(description: string): string {
  const desc = description.toLowerCase();

  if (desc.includes("ecommerce") || desc.includes("store") || desc.includes("shop")) {
    return "ecommerce";
  }
  if (desc.includes("dashboard") || desc.includes("admin")) {
    return "dashboard";
  }
  if (desc.includes("api") || desc.includes("backend") || desc.includes("server")) {
    return "api";
  }
  if (desc.includes("blog") || desc.includes("cms") || desc.includes("content")) {
    return "blog";
  }
  if (desc.includes("saas") || desc.includes("subscription")) {
    return "saas";
  }
  return "web-app";
}
