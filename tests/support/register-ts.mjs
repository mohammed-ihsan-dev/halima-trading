// Lets node:test import the app's TypeScript modules: Node 22.18+ strips types natively,
// this hook only resolves the "@/..." path alias and extensionless imports.
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
