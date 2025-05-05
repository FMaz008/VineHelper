import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

import CryptoKeys from "./CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

class DeviceFingerprint {
	static #instance = null;
	#env;

	constructor() {
		if (DeviceFingerprint.#instance) {
			// Return the existing instance if it already exists
			return DeviceFingerprint.#instance;
		}
		// Initialize the instance if it doesn't exist
		DeviceFingerprint.#instance = this;
	}

	async generateFingerprint(env, uuid) {
		try {
			this.#env = env;

			const fingerprintHashBase64 = await this.#generateFingerprintData(uuid);
			const signatureBase64 = await cryptoKeys.signData(fingerprintHashBase64);
			await this.#uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64);
		} catch (error) {
			throw error;
		}
	}

	async #uploadFingerprint(uuid, fingerprintHashBase64, signatureBase64) {
		const content = {
			api_version: 5,
			app_version: this.#env.data.appVersion,
			country: await Settings.get("general.country"),
			action: "upload_fingerprint",
			uuid: uuid,
			publicKey: await cryptoKeys.getExportedPublicKey(),
			fingerprint: fingerprintHashBase64,
			signature: signatureBase64,
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};
		let response = await fetch(this.#env.getAPIUrl(), options);
		if (!response.ok) {
			throw new Error("Network response was not ok ENV:uploadFingerprint");
		}

		const data = await response.json();
		if (!data.fingerprint_id) {
			throw new Error("Fingerprint ID not found ENV:uploadFingerprint");
		}

		Settings.set("general.fingerprint.id", data.fingerprint_id);

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
			audioFingerprint: this.#getAudioFingerprint(),
			fontsFingerprint: this.#getFontsFingerprint(),
		});

		// Convert string to ArrayBuffer
		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(data);

		//Create a strong hash of the data
		const hash = await crypto.subtle.digest("SHA-256", dataBuffer);

		// Convert ArrayBuffer to a string
		const hashString = cryptoKeys.bufferToBase64(hash); //44 characters

		await Settings.set("general.fingerprint.hash", hashString);
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
	 * Generates an audio fingerprint by creating an audio context and analyzing its output
	 * @returns {string} Audio fingerprint hash
	 */
	#getAudioFingerprint() {
		const audioContext = new (window.AudioContext || window.webkitAudioContext)();
		const oscillator = audioContext.createOscillator();
		const analyser = audioContext.createAnalyser();
		const gainNode = audioContext.createGain();

		oscillator.connect(analyser);
		analyser.connect(gainNode);
		gainNode.connect(audioContext.destination);

		oscillator.type = "triangle";
		oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);

		analyser.fftSize = 2048;
		const bufferLength = analyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);

		oscillator.start();
		analyser.getByteFrequencyData(dataArray);
		oscillator.stop();

		// Create a hash of the frequency data
		let hash = 0;
		for (let i = 0; i < dataArray.length; i++) {
			hash = (hash << 5) - hash + dataArray[i];
			hash = hash & hash;
		}

		return hash.toString(16);
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

export { DeviceFingerprint };
