class HookMgr {
	static #instance = null;
	#mapHook;

	constructor() {
		if (HookMgr.#instance) {
			// Return the existing instance if it already exists
			return HookMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		HookMgr.#instance = this;

		this.#mapHook = new Map();
	}
	hookBind(hookname, func) {
		let arrBinding = this.#mapHook.get(hookname);
		if (arrBinding == undefined) arrBinding = [];
		arrBinding.push(func);
		this.#mapHook.set(hookname, arrBinding);
	}
	hookExecute(hookname, variables) {
		let arrBinding = this.#mapHook.get(hookname);
		if (arrBinding == undefined) return false;
		arrBinding.forEach(function (func) {
			//console.log("Calling function for hook " + hookname);
			func(variables); // Call each function for the hook
		});
	}
}

export { HookMgr };
