/**
 * Set a new password for one admin account.
 *
 *   node --env-file=.env.local scripts/set-admin-password.mjs <admin-email>            # dry run: checks the account only
 *   node --env-file=.env.local scripts/set-admin-password.mjs <admin-email> --confirm  # prompts for the new password and saves it
 *
 * - The password is typed at a hidden prompt (twice); it is never an argument, never printed
 *   and never logged, so it does not end up in shell history.
 * - Hashing matches lib/repositories/users.ts (PBKDF2-SHA512, random salt), so login keeps working.
 * - Only the named user document is updated (passwordHash, salt, updatedAt). Nothing else changes.
 * - Existing signed sessions stay valid until they expire; rotate ADMIN_SESSION_SECRET to end them all.
 */
import { MongoClient } from "mongodb";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const MIN_LENGTH = 12;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { hash: pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex"), salt };
}

export function passwordProblems(password) {
  const problems = [];
  if (password.length < MIN_LENGTH) problems.push(`at least ${MIN_LENGTH} characters`);
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) problems.push("upper- and lower-case letters");
  if (!/\d/.test(password)) problems.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("a symbol");
  return problems;
}

/** Reads one line without echoing it when attached to a terminal (piped input is read as-is). */
function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      let buf = "";
      const onData = (chunk) => {
        buf += chunk;
        const i = buf.indexOf("\n");
        if (i >= 0) {
          stdin.off("data", onData);
          stdin.pause();
          stdin.unshift(Buffer.from(buf.slice(i + 1)));
          process.stdout.write("\n");
          resolve(buf.slice(0, i).replace(/\r$/, ""));
        }
      };
      stdin.setEncoding("utf8");
      stdin.on("data", onData);
      stdin.resume();
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onKey = (key) => {
      if (key === "\u0003") process.exit(130); // Ctrl+C
      if (key === "\r" || key === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onKey);
        process.stdout.write("\n");
        resolve(value);
      } else if (key === "\u007f") value = value.slice(0, -1);
      else value += key;
    };
    stdin.on("data", onKey);
  });
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const confirm = process.argv.includes("--confirm");
  if (!email || email.startsWith("--")) throw new Error("usage: scripts/set-admin-password.mjs <admin-email> [--confirm]");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (use --env-file=.env.local).");
  const dbName = process.env.MONGODB_DB || "halima";

  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    const users = client.db(dbName).collection("users");
    const user = await users.findOne({ email }, { projection: { role: 1, status: 1 } });
    if (!user) throw new Error(`No user with that email in ${dbName}.users.`);
    if (user.role !== "admin" && user.role !== "super_admin") throw new Error("That account is not an admin.");
    console.log(`Target: ${dbName}.users, ${user.role}, status ${user.status}.`);
    if (!confirm) {
      console.log("Dry run only — re-run with --confirm to set a new password.");
      return;
    }
    const first = await readHidden("New password: ");
    const problems = passwordProblems(first);
    if (problems.length) throw new Error(`Password needs ${problems.join(", ")}. Nothing was changed.`);
    const second = await readHidden("Repeat new password: ");
    if (first !== second) throw new Error("Passwords do not match. Nothing was changed.");
    const { hash, salt } = hashPassword(first);
    const result = await users.updateOne({ _id: user._id }, { $set: { passwordHash: hash, salt, updatedAt: new Date() } });
    if (result.modifiedCount !== 1) throw new Error("The account was not updated.");
    console.log("Password updated. Log in again with the new password.");
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
