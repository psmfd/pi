import { lstatSync, realpathSync } from "node:fs";
import { createEventBus } from "./event-bus.ts";
import { createExtensionRuntime, loadExtensions } from "./extensions/loader.ts";
import type { LoadExtensionsResult } from "./extensions/types.ts";
import type { ResourceExtensionPaths, ResourceLoader, ResourceLoaderReloadOptions } from "./resource-loader.ts";
import type { ManagedStartupPolicy } from "./startup-policy.ts";

/** Explicit resources only; there is deliberately no package manager or discovery fallback. */
export class ManagedResourceLoader implements ResourceLoader {
	private readonly policy: ManagedStartupPolicy;
	private readonly eventBus = createEventBus();
	private extensions: LoadExtensionsResult = { extensions: [], errors: [], runtime: createExtensionRuntime() };

	constructor(policy: ManagedStartupPolicy) {
		this.policy = Object.freeze({ ...policy, extensionPaths: Object.freeze([...policy.extensionPaths]) });
	}

	getExtensions(): LoadExtensionsResult {
		return this.extensions;
	}
	getSkills() {
		return { skills: [], diagnostics: [] };
	}
	getPrompts() {
		return { prompts: [], diagnostics: [] };
	}
	getThemes() {
		return { themes: [], diagnostics: [] };
	}
	getAgentsFiles() {
		return { agentsFiles: [] };
	}
	getSystemPrompt(): string {
		return this.policy.systemPrompt;
	}
	getSystemPromptSource(): undefined {
		return undefined;
	}
	getAppendSystemPrompt(): string[] {
		return [];
	}
	getAppendSystemPromptSources(): Array<{ path: string }> {
		return [];
	}

	extendResources(paths: ResourceExtensionPaths): void {
		if (paths.skillPaths?.length || paths.promptPaths?.length || paths.themePaths?.length) {
			throw new Error("managed-v1 does not allow discovered resource expansion");
		}
	}

	async reload(options?: ResourceLoaderReloadOptions): Promise<void> {
		if (options?.resolveProjectTrust) throw new Error("managed-v1 does not resolve project trust");
		const paths = this.policy.extensionPaths.map((path) => {
			if (!lstatSync(path).isFile()) throw new Error("managed-v1 extension must be a regular file");
			return realpathSync(path);
		});
		if (new Set(paths).size !== paths.length) throw new Error("Duplicate managed extension identity");
		const extensions = await loadExtensions(paths, this.policy.cwd, this.eventBus);
		if (extensions.errors.length > 0) throw new Error("managed-v1 could not load an explicit extension");
		this.extensions = extensions;
	}
}
