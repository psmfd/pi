import { describe, expect, it } from "vitest";
import { parseGitUrl } from "../src/utils/git.ts";

describe("Git URL Parsing", () => {
	describe("protocol URLs (accepted without git: prefix)", () => {
		it("should parse HTTPS URL", () => {
			const result = parseGitUrl("https://github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
			});
		});

		it("should parse ssh:// URL", () => {
			const result = parseGitUrl("ssh://git@github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "ssh://git@github.com/user/repo",
			});
		});

		it("should parse protocol URL with ref", () => {
			const result = parseGitUrl("https://github.com/user/repo@v1.0.0");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1.0.0",
				repo: "https://github.com/user/repo",
			});
		});
	});

	describe("shorthand URLs (accepted only with git: prefix)", () => {
		it("should parse git@host:path with git: prefix", () => {
			const result = parseGitUrl("git:git@github.com:user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "git@github.com:user/repo",
			});
		});

		it("should parse host/path shorthand with git: prefix", () => {
			const result = parseGitUrl("git:github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
			});
		});

		it("should parse shorthand with ref and git: prefix", () => {
			const result = parseGitUrl("git:git@github.com:user/repo@v1.0.0");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1.0.0",
				repo: "git@github.com:user/repo",
			});
		});
	});

	it("should reject unsafe git install path inputs", () => {
		for (const source of [
			"git:git@evil.example:../../victim/repo",
			"https://evil.example/..%2F..%2Fvictim/repo",
			"https://evil.example/..%2F..%2Fvictim/repo%",
			"git:git@evil.example:/absolute/repo",
			"git:git@evil.example:user\\repo/name",
			"git:git@evil.example:user/repo\0name",
		]) {
			expect(parseGitUrl(source)).toBeNull();
		}
	});

	describe("unsupported without git: prefix", () => {
		it("should reject git@host:path without git: prefix", () => {
			expect(parseGitUrl("git@github.com:user/repo")).toBeNull();
		});

		it("should reject host/path shorthand without git: prefix", () => {
			expect(parseGitUrl("github.com/user/repo")).toBeNull();
		});

		it("should reject user/repo shorthand", () => {
			expect(parseGitUrl("user/repo")).toBeNull();
		});
	});

	describe("ref flag-injection (CodeQL js/second-order-command-line-injection)", () => {
		// A git ref is forwarded to `git fetch`/`git checkout` at the install
		// sites. A ref beginning with "-" would be parsed by git as an option
		// (e.g. "--upload-pack=...", "-oProxyCommand=..."), turning ref input
		// into argument injection. parseGitUrl must reject such refs outright.
		it("should reject a ref that git would parse as an option", () => {
			for (const source of [
				"https://github.com/user/repo@--upload-pack=evil",
				"git:github.com/user/repo@--upload-pack=evil",
				"git:git@github.com:user/repo@-oProxyCommand=evil",
				"https://github.com/user/repo@-evilref",
				"https://github.com/user/repo@%2D%2Dupload-pack=evil",
			]) {
				expect(parseGitUrl(source)).toBeNull();
			}
		});

		it("should still accept ordinary refs", () => {
			expect(parseGitUrl("https://github.com/user/repo@v1.0.0")).toMatchObject({ ref: "v1.0.0" });
			expect(parseGitUrl("https://github.com/user/repo@main")).toMatchObject({ ref: "main" });
			expect(parseGitUrl("https://github.com/user/repo@feature/x")).toMatchObject({ ref: "feature/x" });
		});
	});

	describe("transport and argument hardening (CodeQL js/shell-command-constructed-from-input)", () => {
		// The git: prefix relaxes the protocol allowlist; git transport helpers
		// and file:// local clones must still be rejected so a source string
		// cannot run commands (ext::/fd::) or read local paths (file://).
		it("should reject git transport helpers and file:// transports", () => {
			for (const source of [
				"git:file:///etc/passwd",
				"git:ext::sh -c 'id'",
				"git:fd::0/user/repo",
				"git:transport::address",
				"git:ext::git-upload-pack",
			]) {
				expect(parseGitUrl(source)).toBeNull();
			}
		});

		// A host or path beginning with "-" would be parsed by git as an option
		// at the clone sink; whitespace in a host can split into extra ssh args.
		it("should reject option-shaped or whitespace host/path components", () => {
			for (const source of [
				"git:git@-evil.example:user/repo",
				"git:git@evil.example:-evil/repo",
				"git:git@evil example:user/repo",
			]) {
				expect(parseGitUrl(source)).toBeNull();
			}
		});

		it("should still accept ordinary protocol and shorthand URLs", () => {
			expect(parseGitUrl("https://github.com/user/repo")).toMatchObject({ repo: "https://github.com/user/repo" });
			expect(parseGitUrl("git:git@github.com:user/repo")).toMatchObject({ repo: "git@github.com:user/repo" });
			// An IPv6 authority contains "::" but must NOT be caught by the
			// leading "<transport>::" remote-helper reject.
			expect(parseGitUrl("https://[2001:db8::1]/user/repo")).toMatchObject({
				repo: "https://[2001:db8::1]/user/repo",
			});
		});
	});
});
