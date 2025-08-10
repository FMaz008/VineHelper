import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
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
	#keysReady = null; // Promise that resolves when keys are ready

	constructor() {
		if (CryptoKeys.#instance) {
			// Return the existing instance if it already exists
			return CryptoKeys.#instance;
		}
		// Initialize the instance if it doesn't exist
		CryptoKeys.#instance = this;

		// Initialize keys in constructor to avoid race conditions
		this.#keysReady = this.#initializeKeys();
	}

	async #initializeKeys() {
		try {
			await Settings.waitForLoad(); // Ensure settings are loaded before accessing them

			const storedPrivateKey = Settings.get("crypto.privateKey", false);
			const storedPublicKey = Settings.get("crypto.publicKey", false);

			// If either key is missing, regenerate both to ensure they're a matching pair
			if (!storedPrivateKey || !storedPublicKey) {
				await this.#generateKeypair();
			} else {
				// Validate that stored keys can be imported successfully
				try {
					const privateKey = await crypto.subtle.importKey(
						"jwk",
						storedPrivateKey,
						{ name: "ECDSA", namedCurve: "P-256" },
						true,
						["sign"]
					);
					const publicKey = await crypto.subtle.importKey(
						"jwk",
						storedPublicKey,
						{ name: "ECDSA", namedCurve: "P-256" },
						true,
						["verify"]
					);

					// Test if the keys are actually a matching pair
					const testData = new TextEncoder().encode("key_pair_test");
					const testSignature = await crypto.subtle.sign(
						{ name: "ECDSA", hash: { name: "SHA-256" } },
						privateKey,
						testData
					);
					const testVerification = await crypto.subtle.verify(
						{ name: "ECDSA", hash: { name: "SHA-256" } },
						publicKey,
						testSignature,
						testData
					);

					if (!testVerification) {
						await this.#generateKeypair();
					}
				} catch (error) {
					console.warn("Stored keys are corrupted, regenerating:", error);
					await this.#generateKeypair();
				}
			}
		} catch (error) {
			console.error("Failed to initialize keys:", error);
			throw new CryptoKeysError("Failed to initialize keys", error);
		}
	}

	async #generateKeypair() {
		try {
			const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
				"sign",
				"verify",
			]);

			// Export the keys and store them atomically
			const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
			const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

			await Settings.set("crypto.privateKey", privateKey);
			await Settings.set("crypto.publicKey", publicKey);

			return keyPair;
		} catch (error) {
			console.error("Failed to generate key pair:", error);
			throw new CryptoKeysError("Failed to generate key pair", error);
		}
	}

	async getPrivateKey() {
		try {
			// Wait for keys to be ready
			await this.#keysReady;

			const storedPrivateKey = Settings.get("crypto.privateKey", false);
			if (!storedPrivateKey) {
				throw new CryptoKeysError("Private key not available after initialization");
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
			// Wait for keys to be ready
			await this.#keysReady;

			const storedPublicKey = Settings.get("crypto.publicKey", false);
			if (!storedPublicKey) {
				throw new CryptoKeysError("Public key not available after initialization");
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

	/**
	 * Verifies data signature using a public key JWK
	 * @param {object} publicKeyJWK - Public key in JWK format (from getExportedPublicKey)
	 * @param {string|object} data - The data that was signed
	 * @param {string} signatureBase64 - The signature in base64 format
	 * @returns {boolean} True if signature is valid, false otherwise
	 */
	async verifyData(publicKeyJWK, data, signatureBase64) {
		try {
			// Convert the JWK to a CryptoKey
			const publicKey = await this.importPublicKeyFromJWK(publicKeyJWK);

			// Convert data to the same format as signing
			const dataString = typeof data === "string" ? data : JSON.stringify(data);

			const encoder = new TextEncoder();
			const dataBuffer = encoder.encode(dataString);

			// Convert signature from base64 to ArrayBuffer
			const signatureBuffer = this.base64ToBuffer(signatureBase64);

			// Verify the signature
			const isValid = await crypto.subtle.verify(
				{ name: "ECDSA", hash: { name: "SHA-256" } },
				publicKey,
				signatureBuffer,
				dataBuffer
			);

			return isValid;
		} catch (error) {
			console.error("verifyData error:", error);
			throw new CryptoKeysError("Failed to verify data signature", error);
		}
	}

	/**
	 * Signs the data using the private key
	 * @param {string|object} data - The data to sign (will be JSON stringified if object)
	 * @returns {string} The signed data in base64 format
	 */
	async signData(data) {
		try {
			// Convert object to JSON string if necessary
			const dataString = typeof data === "string" ? data : JSON.stringify(data);

			// Convert string to ArrayBuffer
			const encoder = new TextEncoder();
			const dataBuffer = encoder.encode(dataString);

			const privateKey = await this.getPrivateKey();
			const signature = await crypto.subtle.sign(
				{ name: "ECDSA", hash: { name: "SHA-256" } },
				privateKey,
				dataBuffer
			);

			// Convert ArrayBuffer to base64 string
			const signatureBase64 = this.bufferToBase64(signature);

			return signatureBase64;
		} catch (error) {
			throw new CryptoKeysError("Failed to sign data: ", error);
		}
	}

	/**
	 * Converts an ArrayBuffer to a base64 string
	 * @param {ArrayBuffer} buffer - The buffer to convert
	 * @returns {string} The base64 encoded string
	 */
	bufferToBase64(buffer) {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * Converts a base64 string back to an ArrayBuffer
	 * @param {string} base64 - The base64 string to convert
	 * @returns {ArrayBuffer} The decoded buffer
	 */
	base64ToBuffer(base64) {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async deleteKeys() {
		await Settings.set("crypto.publicKey", null);
		await Settings.set("crypto.privateKey", null);
		// Re-initialize keys after deletion
		this.#keysReady = this.#initializeKeys();
		await this.#keysReady;
	}
}

export { CryptoKeys };
