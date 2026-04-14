import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message
} from "discord.js";

function loadLocalEnv() {
  const envPaths = [join(process.cwd(), ".env.local"), join(process.cwd(), ".env")];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const content = readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnv();

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const prefix = process.env.OPENCLAW_DISCORD_PREFIX?.trim() || "!claw";
const agent = process.env.OPENCLAW_DISCORD_AGENT?.trim() || "main";
const cwd =
  process.env.OPENCLAW_DISCORD_CWD?.trim() ||
  "C:\\Users\\krist\\OneDrive\\Documents\\New project\\repo";
const openclawCmd =
  process.env.OPENCLAW_CMD?.trim() ||
  `${process.env.APPDATA}\\npm\\openclaw.cmd`;

const allowedChannels = new Set(
  (process.env.OPENCLAW_DISCORD_ALLOWED_CHANNELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const allowedUsers = new Set(
  (process.env.OPENCLAW_DISCORD_ALLOWED_USERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

let activeRun: {
  requestedBy: string;
  process: ReturnType<typeof spawn>;
} | null = null;

function assertEnv() {
  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN.");
  }
}

function isAllowed(message: Message) {
  if (message.author.bot) {
    return false;
  }

  if (allowedChannels.size && !allowedChannels.has(message.channelId)) {
    return false;
  }

  if (allowedUsers.size && !allowedUsers.has(message.author.id)) {
    return false;
  }

  return true;
}

function splitForDiscord(text: string, max = 1800) {
  const clean = text.trim();
  if (!clean) {
    return ["No output."];
  }

  const chunks: string[] = [];
  for (let index = 0; index < clean.length; index += max) {
    chunks.push(clean.slice(index, index + max));
  }
  return chunks;
}

async function sendLongReply(message: Message, header: string, body: string) {
  const chunks = splitForDiscord(body);
  await message.reply(`${header}\n\`\`\`\n${chunks[0]}\n\`\`\``);
  for (const chunk of chunks.slice(1)) {
    await message.reply(`\`\`\`\n${chunk}\n\`\`\``);
  }
}

function runOpenClaw(message: Message, prompt: string) {
  const child = spawn(
    openclawCmd,
    ["agent", "--local", "--agent", agent, "-m", prompt, "--json"],
    {
      cwd,
      windowsHide: true
    }
  );

  activeRun = {
    requestedBy: message.author.tag,
    process: child
  };

  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      activeRun = null;
      resolve({
        ok: code === 0,
        stdout,
        stderr
      });
    });
  });
}

async function handleRun(message: Message, prompt: string) {
  if (!prompt.trim()) {
    await message.reply(`Use \`${prefix} run <mission>\`.`);
    return;
  }

  if (activeRun) {
    await message.reply(`OpenClaw is already running a job for ${activeRun.requestedBy}.`);
    return;
  }

  await message.reply(`Running OpenClaw on SharkEdge. This can take a minute.`);
  const result = await runOpenClaw(message, prompt);
  const output = result.stdout || result.stderr || "No output.";
  await sendLongReply(
    message,
    result.ok ? "OpenClaw finished." : "OpenClaw returned an error.",
    output
  );
}

async function handleExec(message: Message, command: "status" | "skills" | "health") {
  const args =
    command === "status"
      ? ["status"]
      : command === "skills"
        ? ["skills", "list"]
        : ["gateway", "health"];

  const child = spawn(openclawCmd, args, {
    cwd,
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise<void>((resolve) => child.on("close", () => resolve()));
  await sendLongReply(message, `OpenClaw ${command}:`, stdout || stderr || "No output.");
}

async function handleStop(message: Message) {
  if (!activeRun) {
    await message.reply("No OpenClaw run is active.");
    return;
  }

  activeRun.process.kill();
  activeRun = null;
  await message.reply("Stopped the active OpenClaw run.");
}

async function handleHelp(message: Message) {
  await message.reply(
    [
      "OpenClaw Discord controls:",
      `- \`${prefix} help\``,
      `- \`${prefix} status\``,
      `- \`${prefix} health\``,
      `- \`${prefix} skills\``,
      `- \`${prefix} run <mission>\``,
      `- \`${prefix} stop\``
    ].join("\n")
  );
}

async function onMessage(message: Message) {
  if (!isAllowed(message)) {
    return;
  }

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith(prefix.toLowerCase())) {
    return;
  }

  const commandLine = content.slice(prefix.length).trim();
  const [command = "help", ...rest] = commandLine.split(/\s+/);
  const lowerCommand = command.toLowerCase();

  if (lowerCommand === "help") {
    await handleHelp(message);
    return;
  }

  if (lowerCommand === "status" || lowerCommand === "skills" || lowerCommand === "health") {
    await handleExec(message, lowerCommand);
    return;
  }

  if (lowerCommand === "run") {
    await handleRun(message, commandLine.slice(command.length).trim());
    return;
  }

  if (lowerCommand === "stop") {
    await handleStop(message);
    return;
  }

  await message.reply(`Unknown command. Use \`${prefix} help\`.`);
}

async function main() {
  assertEnv();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  client.once("ready", () => {
    console.log(`OpenClaw Discord bridge ready as ${client.user?.tag ?? "unknown"}.`);
  });

  client.on("messageCreate", async (message) => {
    try {
      await onMessage(message);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown Discord bridge error.";
      await message.reply(`Bridge error: ${text}`);
    }
  });

  await client.login(token);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
