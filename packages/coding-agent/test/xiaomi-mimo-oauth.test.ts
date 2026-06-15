import { getOAuthProvider } from "@earendil-works/pi-ai/oauth";
import { describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";

describe("Xiaomi MiMo OAuth integration", () => {
	it("registers Xiaomi MiMo as the xiaomi OAuth provider", () => {
		const provider = getOAuthProvider("xiaomi");

		expect(provider?.name).toBe("Xiaomi MiMo");
		expect(provider?.usesCallbackServer).toBe(true);
	});

	it("uses stored MiMo OAuth credentials for xiaomi API key and base URL", async () => {
		const authStorage = AuthStorage.inMemory({
			xiaomi: {
				type: "oauth",
				access: "sk-mimo-test",
				refresh: "",
				expires: Number.MAX_SAFE_INTEGER,
				uid: "user-1",
				baseUrl: "https://api.test/v1",
			},
		});
		const registry = ModelRegistry.inMemory(authStorage);
		const model = registry.find("xiaomi", "mimo-v2.5-pro");

		expect(model?.baseUrl).toBe("https://api.test/v1");
		expect(model?.headers).toMatchObject({ "X-Mimo-Source": "mimocode-cli" });
		expect(await registry.getApiKeyForProvider("xiaomi")).toBe("sk-mimo-test");
	});
});
