import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

class CryptoKeysError extends Error {
	constructor(message, cause) {
		super(message);
		this.name = "CryptoKeysError";
		this.cause = cause;
	}
}

class CryptoKeys {
	static #instance = null;

	constructor() {
		if (CryptoKeys.#instance) {
			// Return the existing instance if it already exists
			return CryptoKeys.#instance;
		}
		// Initialize the instance if it doesn't exist
		CryptoKeys.#instance = this;
	}

	async #generateKeypair() {
		try {
			const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
				"sign",
				"verify",
			]);

			// Export the keys and store them
			const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
			const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

			await Settings.set("crypto.publicKey", publicKey);
			await Settings.set("crypto.privateKey", privateKey);

			return keyPair;
		} catch (error) {
			throw new CryptoKeysError("Failed to generate key pair", error);
		}
	}

	async getPrivateKey() {
		try {
			const storedPrivateKey = Settings.get("crypto.privateKey", false);
			if (!storedPrivateKey) {
				await this.#generateKeypair();
				return this.getPrivateKey();
			}

			const cryptoKey = await crypto.subtle.importKey(
				"jwk",
				storedPrivateKey,
				{ name: "ECDSA", namedCurve: "P-256" },
				true,
				["sign"]
			);
			return cryptoKey;
		} catch (error) {
			if (error instanceof CryptoKeysError) {
				throw error;
			}
			throw new CryptoKeysError("Failed to get private key", error);
		}
	}

	async getPublicKey() {
		try {
			const storedPublicKey = Settings.get("crypto.publicKey", false);
			if (!storedPublicKey) {
				await this.#generateKeypair();
				return this.getPublicKey();
			}

			// Import the key first
			const cryptoKey = await crypto.subtle.importKey(
				"jwk",
				storedPublicKey,
				{ name: "ECDSA", namedCurve: "P-256" },
				true,
				["verify"]
			);

			return cryptoKey;
		} catch (error) {
			if (error instanceof CryptoKeysError) {
				throw error;
			}
			throw new CryptoKeysError("Failed to get public key", error);
		}
	}

	async getExportedPublicKey() {
		const publicKey = await this.getPublicKey();
		// Export the key in a format suitable for transmission
		const exportedKey = await crypto.subtle.exportKey("jwk", publicKey);

		return exportedKey;
	}

	async importPublicKeyFromJWK(jwkKey) {
		try {
			return await crypto.subtle.importKey("jwk", jwkKey, { name: "ECDSA", namedCurve: "P-256" }, true, [
				"verify",
			]);
		} catch (error) {
			throw new CryptoKeysError("Failed to import public key from JWK", error);
		}
	}
}

export default CryptoKeys;
