import {
	createCipheriv,
	createHash,
	createPrivateKey,
	createPublicKey,
	diffieHellman,
	generateKeyPairSync,
	randomBytes,
} from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Model } from "../src/types.ts";
import {
	buildXiaomiMimoAuthorizeUrl,
	loginXiaomiMimo,
	xiaomiMimoOAuthProvider,
} from "../src/utils/oauth/xiaomi-mimo.ts";

function encrypt(recipientPkBase64: string, payload: string): string {
	const recipientPublicKey = createPublicKey({
		key: Buffer.from(recipientPkBase64, "base64url"),
		format: "der",
		type: "spki",
	});

	const ephemeral = generateKeyPairSync("x25519", {
		publicKeyEncoding: { type: "spki", format: "der" },
		privateKeyEncoding: { type: "pkcs8", format: "der" },
	});
	const ephemeralPub = ephemeral.publicKey.subarray(ephemeral.publicKey.length - 32);

	const ephemeralPrivateKey = createPrivateKey({ key: ephemeral.privateKey, format: "der", type: "pkcs8" });
	const sharedSecret = diffieHellman({ privateKey: ephemeralPrivateKey, publicKey: recipientPublicKey });
	const derivedKey = createHash("sha256").update(sharedSecret).digest();

	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", derivedKey, nonce);
	const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	return Buffer.concat([ephemeralPub, nonce, ciphertext, tag]).toString("base64url");
}

describe("Xiaomi MiMo OAuth", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("builds the MiMo authorize URL with public key and key name", () => {
		const url = new URL(
			buildXiaomiMimoAuthorizeUrl({
				publicKey: "public-key",
				redirectUri: "https://platform.xiaomimimo.com/authorize/code/callback",
				keyName: "mimo-code-cli-key-test",
			}),
		);

		expect(url.origin).toBe("https://platform.xiaomimimo.com");
		expect(url.pathname).toBe("/authorize");
		expect(url.searchParams.get("pk")).toBe("public-key");
		expect(url.searchParams.get("redirect_uri")).toBe("https://platform.xiaomimimo.com/authorize/code/callback");
		expect(url.searchParams.get("kn")).toBe("mimocode");
		expect(url.searchParams.get("key_name")).toBe("mimo-code-cli-key-test");
	});

	it("decrypts a manually pasted MiMo code into OAuth credentials", async () => {
		let authUrl = "";
		let instructions = "";

		const credentials = await loginXiaomiMimo({
			keyName: "mimo-code-cli-key-test",
			onAuth: (info) => {
				authUrl = info.url;
				instructions = info.instructions ?? "";
			},
			onPrompt: async () => "",
			onManualCodeInput: async () => {
				const pk = new URL(authUrl).searchParams.get("pk");
				if (!pk) throw new Error("Missing pk");
				return encrypt(pk, JSON.stringify({ sk: "sk-test-key", uid: "user-1", url: "https://api.test/v1" }));
			},
		});

		const shown = new URL(authUrl);
		expect(shown.searchParams.get("redirect_uri")).toMatch(/^http:\/\/localhost:\d+\/$/);
		expect(instructions).toContain("https://platform.xiaomimimo.com/authorize?");
		expect(instructions).toContain(
			"redirect_uri=https%3A%2F%2Fplatform.xiaomimimo.com%2Fauthorize%2Fcode%2Fcallback",
		);
		expect(credentials).toMatchObject({
			access: "sk-test-key",
			refresh: "",
			uid: "user-1",
			baseUrl: "https://api.test/v1",
		});
		expect(credentials.expires).toBeGreaterThan(Date.now());
	});

	it("decrypts the localhost callback payload and redirects to platform success", async () => {
		let authUrl = "";
		const credentialsPromise = loginXiaomiMimo({
			keyName: "mimo-code-cli-key-test",
			onAuth: (info) => {
				authUrl = info.url;
			},
			onPrompt: async () => "",
		});

		while (!authUrl) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const url = new URL(authUrl);
		const pk = url.searchParams.get("pk");
		const redirectUri = url.searchParams.get("redirect_uri");
		if (!pk || !redirectUri) throw new Error("Missing callback test parameters");
		const code = encrypt(pk, JSON.stringify({ sk: "sk-callback", uid: "user-callback" }));
		const response = await fetch(`${redirectUri}?u=${code}`, { redirect: "manual" });

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://platform.xiaomimimo.com/authorize/callback?status=success",
		);
		await expect(credentialsPromise).resolves.toMatchObject({
			access: "sk-callback",
			uid: "user-callback",
		});
	});

	it("rejects MiMo payloads without an API key", async () => {
		let authUrl = "";

		await expect(
			loginXiaomiMimo({
				keyName: "mimo-code-cli-key-test",
				onAuth: (info) => {
					authUrl = info.url;
				},
				onPrompt: async () => "",
				onManualCodeInput: async () => {
					const pk = new URL(authUrl).searchParams.get("pk");
					if (!pk) throw new Error("Missing pk");
					return encrypt(pk, JSON.stringify({ uid: "user-no-sk" }));
				},
			}),
		).rejects.toThrow("MiMo authorization payload missing sk");
	});

	it("uses MiMo OAuth credentials as the xiaomi API key and model base URL", () => {
		expect(xiaomiMimoOAuthProvider.id).toBe("xiaomi");
		expect(xiaomiMimoOAuthProvider.getApiKey({ access: "sk-test", refresh: "", expires: 9999999999999 })).toBe(
			"sk-test",
		);

		const model = {
			id: "mimo-v2.5-pro",
			name: "MiMo V2.5 Pro",
			api: "openai-completions",
			provider: "xiaomi",
			baseUrl: "https://api.xiaomimimo.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 64000,
		} as Model<"openai-completions">;

		const [modified] = xiaomiMimoOAuthProvider.modifyModels?.([model], {
			access: "sk-test",
			refresh: "",
			expires: 9999999999999,
			baseUrl: "https://api.test/v1",
		}) ?? [model];

		expect(modified.baseUrl).toBe("https://api.test/v1");
		expect(modified.headers).toMatchObject({ "X-Mimo-Source": "mimocode-cli" });
	});
});
