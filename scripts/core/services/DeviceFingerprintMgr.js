import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
import { DeviceMgr } from "/scripts/core/services/DeviceMgr.js";
class DeviceFingerprintMgr {
	static #instance = null;

	constructor(env, settings) {
		if (DeviceFingerprintMgr.#instance) {
			// Return the existing instance if it already exists
			return DeviceFingerprintMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		DeviceFingerprintMgr.#instance = this;

		this._settings = settings;
		this._env = env;
		this._cryptoKeys = new CryptoKeys();
	}

	async generateFingerprint(uuid, deviceName) {
		const fingerprintHashBase64 = await this.#generateFingerprintData(uuid);
		const signatureBase64 = await this._cryptoKeys.signData(fingerprintHashBase64);
		await this.#uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64, deviceName);
	}

	async clearFingerprint() {
		await this._settings.set("general.fingerprint", null);
	}

	async getFingerprintHash() {
		let hash = await this._settings.get("general.fingerprint.hash");
		if (!hash) {
			hash = await this.#generateFingerprintData(await this._settings.get("general.uuid"));
			await this._settings.set("general.fingerprint.hash", hash);
		}
		return hash;
	}

	async getFingerprintId() {
		return await this._settings.get("general.fingerprint.id");
	}

	async getFingerprintArray() {
		return {
			hash: await this.getFingerprintHash(),
			id: await this.getFingerprintId(),
		};
	}

	async updateUUID(uuid) {
		//Get the current device name
		const deviceMgr = new DeviceMgr(this._settings);
		const deviceName = await deviceMgr.getDeviceName();

		//Generate a signature for the fingerprint
		const fingerprintHashBase64 = await this.getFingerprintHash();
		const signatureBase64 = await this._cryptoKeys.signData(fingerprintHashBase64);

		//Upload the fingerprint, which will validate the UUID and create an entry for the device for that user_id and fingerprint.
		const result = await this.#uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64, deviceName);
		if (result) {
			//Update the UUID in the settings
			await this._settings.set("general.uuid", uuid);
		}
		return true;
	}

	async updateDeviceName(uuid, deviceName) {
		if (!deviceName) {
			throw new Error("Device name is required");
		}
		if (deviceName.length < 15) {
			throw new Error("Device name must be at least 15 characters long");
		}
		if (deviceName.length > 100) {
			throw new Error("Device name must be less than 100 characters long");
		}

		const fingerprintHashBase64 = await this.getFingerprintHash();
		const signatureBase64 = await this._cryptoKeys.signData(fingerprintHashBase64);
		const result = await this.#uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64, deviceName);
		if (result) {
			//Update the device name in the settings
			const deviceMgr = new DeviceMgr(this._settings);
			await deviceMgr.setDeviceName(deviceName);
		}
		return result;
	}

	async #uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64, deviceName) {
		const content = {
			api_version: 5,
			app_version: this._env.data.appVersion,
			country: await this._settings.get("general.country"),
			action: "upload_fingerprint",
			uuid: uuid,
			fingerprint: fingerprintHashBase64,
			device_name: deviceName,
		};
		const s = await this._cryptoKeys.signData(content);
		content.s = s;
		content.pk = await this._cryptoKeys.getExportedPublicKey();
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};
		let response = await fetch(this._env.getAPIUrl(), options);
		if (!response.ok) {
			//It's likely that the crypto keys are invalid, delete them so they can be regenerated on the next load.
			await this._cryptoKeys.deleteKeys();
			throw new Error("Network response was not ok ENV:uploadFingerprint");
		}

		const data = await response.json();
		if (!data.fingerprint_id) {
			throw new Error("Fingerprint ID not found ENV:uploadFingerprint");
		}

		await this._settings.set("general.fingerprint.id", data.fingerprint_id);

		return true;
	}

	async deleteDevice(deviceId) {
		const content = {
			api_version: 5,
			app_version: this._env.data.appVersion,
			uuid: await this._settings.get("general.uuid"),
			country: await this._settings.get("general.country"),
			action: "delete_device",
			id: deviceId,
		};
		const s = await this._cryptoKeys.signData(content);
		content.s = s;
		content.pk = await this._cryptoKeys.getExportedPublicKey();
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};
		let response = await fetch(this._env.getAPIUrl(), options);
		if (!response.ok) {
			throw new Error("Network response was not ok ENV:deleteDevice");
		}
		return true;
	}
	async #generateFingerprintData(uuid) {
		const data = JSON.stringify({
			//uuid, // the generated UUID
			hwConcurrency: navigator.hardwareConcurrency,
			deviceMemory: navigator.deviceMemory,
			screenWidth: window.screen.width,
			screenHeight: window.screen.height,
			colorDepth: window.screen.colorDepth,
			pixelRatio: window.devicePixelRatio,
			language: navigator.language,
			languages: navigator.languages,
			maxTouchPoints: navigator.maxTouchPoints,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			locale: Intl.DateTimeFormat().resolvedOptions().locale,
			performanceMemory: performance.memory,
			canvasFingerprint: this.#getCanvasFingerprint(),
			webglFingerprint: this.#getWebGLFingerprint(),
			//audioFingerprint: this.#getAudioFingerprint(),
			fontsFingerprint: this.#getFontsFingerprint(),
		});

		// Convert string to ArrayBuffer
		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(data);

		//Create a strong hash of the data
		const hash = await crypto.subtle.digest("SHA-256", dataBuffer);

		// Convert ArrayBuffer to a string
		const hashString = this._cryptoKeys.bufferToBase64(hash); //44 characters

		await this._settings.set("general.fingerprint.hash", hashString);
		return hashString;
	}

	/**
	 * Generates a canvas fingerprint by drawing text and shapes
	 * @returns {string} Base64 encoded canvas data
	 */
	#getCanvasFingerprint() {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");

		// Draw text
		ctx.textBaseline = "top";
		ctx.font = "14px 'Arial'";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText("Hello, world!", 2, 15);
		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.fillText("Hello, world!", 4, 17);

		// Draw shapes
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText("Hello, world!", 2, 15);
		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.fillText("Hello, world!", 4, 17);

		return canvas.toDataURL();
	}

	/**
	 * Generates a WebGL fingerprint by creating a WebGL context and getting its parameters
	 * @returns {Object} WebGL fingerprint data
	 */
	#getWebGLFingerprint() {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

		if (!gl) {
			return null;
		}

		const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
		const fingerprint = {
			vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
			renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
			version: gl.getParameter(gl.VERSION),
			shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
			extensions: gl.getSupportedExtensions(),
		};

		return fingerprint;
	}

	/**
	 * Generates a fonts fingerprint by checking available fonts
	 * @returns {Array} List of available fonts
	 */
	#getFontsFingerprint() {
		const fonts = [
			"Arial",
			"Arial Black",
			"Arial Narrow",
			"Calibri",
			"Cambria",
			"Cambria Math",
			"Comic Sans MS",
			"Courier",
			"Courier New",
			"Georgia",
			"Helvetica",
			"Impact",
			"Lucida Console",
			"Lucida Sans Unicode",
			"Microsoft Sans Serif",
			"Palatino Linotype",
			"Tahoma",
			"Times",
			"Times New Roman",
			"Trebuchet MS",
			"Verdana",
		];

		const availableFonts = [];
		const span = document.createElement("span");
		span.style.fontSize = "72px";
		span.innerHTML = "mmmmmmmmmmlli";
		document.body.appendChild(span);

		for (const font of fonts) {
			span.style.fontFamily = font;
			const width = span.offsetWidth;
			const height = span.offsetHeight;
			if (width !== 0 || height !== 0) {
				availableFonts.push(font);
			}
		}

		document.body.removeChild(span);
		return availableFonts;
	}
}

export { DeviceFingerprintMgr };
