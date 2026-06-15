import type {
	createDecipheriv as NodeCreateDecipheriv,
	createHash as NodeCreateHash,
	createPrivateKey as NodeCreatePrivateKey,
	createPublicKey as NodeCreatePublicKey,
	diffieHellman as NodeDiffieHellman,
	generateKeyPairSync as NodeGenerateKeyPairSync,
	randomBytes as NodeRandomBytes,
} from "node:crypto";
import type {
	mkdirSync as NodeMkdirSync,
	readFileSync as NodeReadFileSync,
	writeFileSync as NodeWriteFileSync,
} from "node:fs";
import type { createServer as NodeCreateServer, Server } from "node:http";
import type { homedir as NodeHomedir } from "node:os";
import type { dirname as NodeDirname, join as NodeJoin } from "node:path";
import type { Api, Model } from "../../types.ts";
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthPrompt, OAuthProviderInterface } from "./types.ts";

const DEFAULT_PLATFORM_URL = "https://platform.xiaomimimo.com";
const X25519_SPKI_PREFIX_HEX = "302a300506032b656e032100";
const MIMO_CODE_EXPIRES = Number.MAX_SAFE_INTEGER;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

type NodeApis = {
	createDecipheriv: typeof NodeCreateDecipheriv;
	createHash: typeof NodeCreateHash;
	createPrivateKey: typeof NodeCreatePrivateKey;
	createPublicKey: typeof NodeCreatePublicKey;
	diffieHellman: typeof NodeDiffieHellman;
	generateKeyPairSync: typeof NodeGenerateKeyPairSync;
	randomBytes: typeof NodeRandomBytes;
	mkdirSync: typeof NodeMkdirSync;
	readFileSync: typeof NodeReadFileSync;
	writeFileSync: typeof NodeWriteFileSync;
	createServer: typeof NodeCreateServer;
	homedir: typeof NodeHomedir;
	dirname: typeof NodeDirname;
	join: typeof NodeJoin;
};

let nodeApis: NodeApis | null = null;
let nodeApisPromise: Promise<NodeApis> | null = null;

type XiaomiMimoPayload = {
	sk?: string;
	uid: string;
	url?: string;
};

export type XiaomiMimoCredentials = OAuthCredentials & {
	uid: string;
	baseUrl?: string;
};

type KeyPair = {
	publicKey: string;
	privateKeyDer: Buffer;
};

type CallbackServerInfo = {
	server: Server;
	redirectUri: string;
	cancelWait: () => void;
	waitForPayload: () => Promise<XiaomiMimoPayload | null>;
};

export type XiaomiMimoLoginOptions = {
	onAuth: (info: { url: string; instructions?: string }) => void;
	onPrompt: (prompt: OAuthPrompt) => Promise<string>;
	onProgress?: (message: string) => void;
	onManualCodeInput?: () => Promise<string>;
	keyName?: string;
	platformUrl?: string;
	callbackHost?: string;
	signal?: AbortSignal;
};

async function getNodeApis(): Promise<NodeApis> {
	if (nodeApis) return nodeApis;
	if (!nodeApisPromise) {
		if (typeof process === "undefined" || (!process.versions?.node && !process.versions?.bun)) {
			throw new Error("Xiaomi MiMo OAuth is only available in Node.js environments");
		}
		nodeApisPromise = Promise.all([
			import("node:crypto"),
			import("node:fs"),
			import("node:http"),
			import("node:os"),
			import("node:path"),
		]).then(([cryptoModule, fsModule, httpModule, osModule, pathModule]) => ({
			createDecipheriv: cryptoModule.createDecipheriv,
			createHash: cryptoModule.createHash,
			createPrivateKey: cryptoModule.createPrivateKey,
			createPublicKey: cryptoModule.createPublicKey,
			diffieHellman: cryptoModule.diffieHellman,
			generateKeyPairSync: cryptoModule.generateKeyPairSync,
			randomBytes: cryptoModule.randomBytes,
			mkdirSync: fsModule.mkdirSync,
			readFileSync: fsModule.readFileSync,
			writeFileSync: fsModule.writeFileSync,
			createServer: httpModule.createServer,
			homedir: osModule.homedir,
			dirname: pathModule.dirname,
			join: pathModule.join,
		}));
	}
	nodeApis = await nodeApisPromise;
	return nodeApis;
}

export function buildXiaomiMimoAuthorizeUrl(options: {
	publicKey: string;
	redirectUri: string;
	keyName: string;
	platformUrl?: string;
}): string {
	const platformUrl = options.platformUrl ?? DEFAULT_PLATFORM_URL;
	const params = new URLSearchParams({
		pk: options.publicKey,
		redirect_uri: options.redirectUri,
		kn: "mimocode",
		key_name: options.keyName,
	});
	return `${platformUrl}/authorize?${params.toString()}`;
}

function getCallbackHost(callbackHost: string | undefined): string {
	return callbackHost ?? process.env.PI_OAUTH_CALLBACK_HOST ?? "127.0.0.1";
}

function getPlatformUrl(platformUrl: string | undefined): string {
	return platformUrl ?? process.env.MIMO_PLATFORM_URL ?? DEFAULT_PLATFORM_URL;
}

function getKeyName(apis: NodeApis): string {
	const keyNamePath = apis.join(apis.homedir(), ".pi", "agent", "mimo-key-name");
	try {
		const existing = apis.readFileSync(keyNamePath, "utf-8").trim();
		if (existing) return existing;
	} catch {}

	const keyName = `mimo-code-cli-key-${apis.randomBytes(4).toString("hex")}`;
	apis.mkdirSync(apis.dirname(keyNamePath), { recursive: true, mode: 0o700 });
	apis.writeFileSync(keyNamePath, keyName, { encoding: "utf-8", mode: 0o600 });
	return keyName;
}

function generateXiaomiMimoKeyPair(apis: NodeApis): KeyPair {
	const keyPair = apis.generateKeyPairSync("x25519", {
		publicKeyEncoding: { type: "spki", format: "der" },
		privateKeyEncoding: { type: "pkcs8", format: "der" },
	});

	return {
		publicKey: Buffer.from(keyPair.publicKey).toString("base64url"),
		privateKeyDer: keyPair.privateKey,
	};
}

function isXiaomiMimoPayload(value: unknown): value is XiaomiMimoPayload {
	if (!value || typeof value !== "object") return false;
	const payload = value as { sk?: unknown; uid?: unknown; url?: unknown };
	return (
		(payload.sk === undefined || typeof payload.sk === "string") &&
		typeof payload.uid === "string" &&
		(payload.url === undefined || typeof payload.url === "string")
	);
}

function parseEncryptedInput(input: string): string {
	const value = input.trim();
	if (!value) return "";

	try {
		const url = new URL(value);
		return url.searchParams.get("u") ?? value;
	} catch {
		// not a URL
	}

	if (value.includes("u=")) {
		const params = new URLSearchParams(value);
		return params.get("u") ?? value;
	}

	return value;
}

function decryptXiaomiMimoPayload(apis: NodeApis, privateKeyDer: Buffer, encryptedBase64: string): XiaomiMimoPayload {
	const encrypted = Buffer.from(parseEncryptedInput(encryptedBase64), "base64url");
	if (encrypted.length <= 60) {
		throw new Error("Invalid MiMo authorization code");
	}

	const ephemeralPub = encrypted.subarray(0, 32);
	const nonce = encrypted.subarray(32, 44);
	const ciphertextAndTag = encrypted.subarray(44);
	const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
	const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

	const privateKey = apis.createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
	const ephemeralPublicKey = apis.createPublicKey({
		key: Buffer.concat([Buffer.from(X25519_SPKI_PREFIX_HEX, "hex"), ephemeralPub]),
		format: "der",
		type: "spki",
	});

	const sharedSecret = apis.diffieHellman({ privateKey, publicKey: ephemeralPublicKey });
	const derivedKey = apis.createHash("sha256").update(sharedSecret).digest();
	const decipher = apis.createDecipheriv("aes-256-gcm", derivedKey, nonce);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	const parsed = JSON.parse(decrypted.toString("utf-8")) as unknown;

	if (!isXiaomiMimoPayload(parsed)) {
		throw new Error("Invalid MiMo authorization payload");
	}
	return parsed;
}

function startCallbackServer(
	apis: NodeApis,
	privateKeyDer: Buffer,
	platformUrl: string,
	callbackHost: string,
): Promise<CallbackServerInfo> {
	return new Promise((resolve, reject) => {
		let settleWait: ((value: XiaomiMimoPayload | null) => void) | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const waitForPayloadPromise = new Promise<XiaomiMimoPayload | null>((resolveWait) => {
			let settled = false;
			settleWait = (value) => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				resolveWait(value);
			};
		});

		const server = apis.createServer((req, res) => {
			try {
				const url = new URL(req.url || "/", "http://localhost");
				const encrypted = url.searchParams.get("u");

				if (!encrypted) {
					res.writeHead(302, {
						Location: `${platformUrl}/authorize/callback?status=error&message=missing_data`,
					});
					res.end();
					settleWait?.(null);
					return;
				}

				const payload = decryptXiaomiMimoPayload(apis, privateKeyDer, encrypted);
				res.writeHead(302, { Location: `${platformUrl}/authorize/callback?status=success` });
				res.end();
				settleWait?.(payload);
			} catch {
				res.writeHead(302, {
					Location: `${platformUrl}/authorize/callback?status=error&message=decrypt_failed`,
				});
				res.end();
				settleWait?.(null);
			}
		});

		server.on("error", reject);
		server.listen(0, callbackHost, () => {
			const address = server.address() as { port?: number } | null;
			const port = address?.port;
			if (!port) {
				reject(new Error("Failed to start MiMo OAuth callback server"));
				return;
			}

			timeout = setTimeout(() => {
				settleWait?.(null);
			}, CALLBACK_TIMEOUT_MS);

			resolve({
				server,
				redirectUri: `http://localhost:${port}/`,
				cancelWait: () => {
					settleWait?.(null);
				},
				waitForPayload: () => waitForPayloadPromise,
			});
		});
	});
}

function credentialsFromPayload(payload: XiaomiMimoPayload): XiaomiMimoCredentials {
	if (!payload.sk) {
		throw new Error("MiMo authorization payload missing sk");
	}
	return {
		access: payload.sk,
		refresh: "",
		expires: MIMO_CODE_EXPIRES,
		uid: payload.uid,
		...(payload.url ? { baseUrl: payload.url } : {}),
	};
}

export async function loginXiaomiMimo(options: XiaomiMimoLoginOptions): Promise<XiaomiMimoCredentials> {
	const apis = await getNodeApis();
	const platformUrl = getPlatformUrl(options.platformUrl);
	const keyName = options.keyName ?? getKeyName(apis);
	const { publicKey, privateKeyDer } = generateXiaomiMimoKeyPair(apis);
	const server = await startCallbackServer(apis, privateKeyDer, platformUrl, getCallbackHost(options.callbackHost));
	const authUrl = buildXiaomiMimoAuthorizeUrl({
		publicKey,
		redirectUri: server.redirectUri,
		keyName,
		platformUrl,
	});
	const manualUrl = buildXiaomiMimoAuthorizeUrl({
		publicKey,
		redirectUri: `${platformUrl}/authorize/code/callback`,
		keyName,
		platformUrl,
	});
	const cancelLogin = () => {
		server.cancelWait();
	};

	try {
		if (options.signal?.aborted) {
			throw new Error("Login cancelled");
		}
		options.signal?.addEventListener("abort", cancelLogin, { once: true });
		options.onAuth({
			url: authUrl,
			instructions: `在浏览器中完成授权，或手动访问并粘贴 Code 完成登录：\n${manualUrl}`,
		});
		options.onProgress?.("Waiting for Xiaomi MiMo browser authorization...");

		let payload: XiaomiMimoPayload | undefined;
		if (options.onManualCodeInput) {
			let manualInput: string | undefined;
			let manualError: Error | undefined;
			const manualPromise = options
				.onManualCodeInput()
				.then((input) => {
					manualInput = input;
					server.cancelWait();
				})
				.catch((error: unknown) => {
					manualError = error instanceof Error ? error : new Error(String(error));
					server.cancelWait();
				});

			const result = await server.waitForPayload();
			if (manualError) throw manualError;
			if (result) {
				payload = result;
			} else if (manualInput) {
				payload = decryptXiaomiMimoPayload(apis, privateKeyDer, manualInput);
			}

			if (!payload) {
				await manualPromise;
				if (manualError) throw manualError;
				if (manualInput) {
					payload = decryptXiaomiMimoPayload(apis, privateKeyDer, manualInput);
				}
			}
		} else {
			const result = await server.waitForPayload();
			if (result) {
				payload = result;
			}
		}

		if (!payload) {
			if (options.signal?.aborted) {
				throw new Error("Login cancelled");
			}
			const input = await options.onPrompt({
				message: "Paste the Xiaomi MiMo authorization code:",
				placeholder: manualUrl,
			});
			payload = decryptXiaomiMimoPayload(apis, privateKeyDer, input);
		}

		return credentialsFromPayload(payload);
	} finally {
		options.signal?.removeEventListener("abort", cancelLogin);
		server.server.close();
	}
}

function getCredentialBaseUrl(credentials: OAuthCredentials): string | undefined {
	const baseUrl = credentials.baseUrl;
	return typeof baseUrl === "string" && baseUrl.length > 0 ? baseUrl : undefined;
}

export const xiaomiMimoOAuthProvider: OAuthProviderInterface = {
	id: "xiaomi",
	name: "Xiaomi MiMo",
	usesCallbackServer: true,

	async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
		return loginXiaomiMimo({
			onAuth: callbacks.onAuth,
			onPrompt: callbacks.onPrompt,
			onProgress: callbacks.onProgress,
			onManualCodeInput: callbacks.onManualCodeInput,
			signal: callbacks.signal,
		});
	},

	async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
		return credentials;
	},

	getApiKey(credentials: OAuthCredentials): string {
		return credentials.access;
	},

	modifyModels(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[] {
		const baseUrl = getCredentialBaseUrl(credentials);
		return models.map((model) => {
			if (model.provider !== "xiaomi") return model;
			return {
				...model,
				...(baseUrl ? { baseUrl } : {}),
				headers: {
					...model.headers,
					"X-Mimo-Source": "mimocode-cli",
				},
			};
		});
	},
};
