import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createTasksFromConstitution } from "./github-task-creator.js";

// Get current directory (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read constitution.md from project root
const constitutionPath = path.join(__dirname, "..", "specs/constitution.md");

try {
  if (!fs.existsSync(constitutionPath)) {
    console.error(`❌ constitution.md not found at ${constitutionPath}`);
    console.log(`\n📋 Make sure constitution.md exists in your project root.`);
    process.exit(1);
  }

  const constitution = fs.readFileSync(constitutionPath, "utf-8");

  // Validate required env variables
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
    console.log(
      `\n📝 Create .env file with:\nGITHUB_TOKEN=your_token\nGITHUB_OWNER=your_username\nGITHUB_REPO=TallyThreads\n`,
    );
    process.exit(1);
  }

  console.log("🚀 Starting constitution.md parsing...\n");
  console.log(
    `📂 Repository: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}\n`,
  );

  // Create tasks from constitution
  await createTasksFromConstitution(constitution);

  console.log("\n🎉 All done! Check your GitHub Projects board.");
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
