/*global chrome*/
/**
 * Seemlessly keep track of which monitor is Master and which are slaves.
 * Will pass along the Master role if it is lost.
 *
 * pre-requisites:
 * - a "beforeunload" hook to executed when the master role should be passed along.
 * - this._monitor.setMasterMonitor()
 * - this._monitor.setSlaveMonitor()
 *
 * This class is self sufficient and does not return anything public.
 * This class canot communicate with the extension context (ie.: MonitorV2).
 */

class MasterSlave {
	static #instance = null;
	_monitor = null;
	#monitorId = null;
	#masterMonitorId = null;
	#masterMonitorLastActivity = null;
	#keepAliveInterval = null;
	#monitorSet = new Set();
	#messageHandler = null;
	#beforeUnloadHandler = null;

	constructor(monitor) {
		if (MasterSlave.#instance) {
			return MasterSlave.#instance;
		}

		// Add BroadcastChannel availability check
		if (typeof BroadcastChannel === "undefined") {
			console.error("[MasterSlave] BroadcastChannel API not available. Multi-tab coordination disabled.");
			this._monitor = monitor;
			this.#monitorId = crypto.randomUUID();
			// Set as master by default when BroadcastChannel unavailable
			this._monitor.setMasterMonitor();
			MasterSlave.#instance = this;
			return;
		}

		// Add try-catch for channel creation
		try {
			// Verify channel exists on monitor
			if (!monitor || !monitor._channel) {
				console.warn("[MasterSlave] Monitor channel not initialized. Setting as master in single-tab mode.");
				this._monitor = monitor;
				this.#monitorId = crypto.randomUUID();
				// Set as master by default when channel unavailable
				if (monitor && monitor.setMasterMonitor) {
					monitor.setMasterMonitor();
				}
				MasterSlave.#instance = this;
				return;
			}

			MasterSlave.#instance = this;
			this.#monitorId = crypto.randomUUID();
			this._monitor = monitor;
			this.#createEventListeners();
			this.#checkIfMasterTab();
			this.#keepAlive();
		} catch (error) {
			console.error("[MasterSlave] Initialization failed:", error);
			// Fallback to single-tab mode
			this._monitor = monitor;
			this.#monitorId = crypto.randomUUID();
			if (monitor && monitor.setMasterMonitor) {
				monitor.setMasterMonitor();
			}
			MasterSlave.#instance = this;
		}
	}

	#createEventListeners() {
		try {
			// Store reference to handler for cleanup
			this.#messageHandler = (event) => {
				if (
					event.data.type !== "ImAlive" &&
					event.data.type !== "masterMonitorPing" &&
					event.data.type !== "masterMonitorPong"
				) {
					console.log("MasterSlave: Received message:", event.data);
				}

				// Handle broadcast messages (no destination required)
				if (event.data.type === "masterMonitorPing") {
					if (this._monitor._isMasterMonitor) {
						try {
							this._monitor._channel.postMessage({ type: "masterMonitorPong" });
						} catch (error) {
							console.warn("[MasterSlave] Failed to send pong:", error);
						}
					}
					return;
				}

				// Handle directed messages (require destination)
				if (event.data.destination === this.#monitorId || event.data.destination === "*") {
					//A tab has claimed to be the master
					if (event.data.type === "ImTheMaster") {
						this.#masterMonitorId = event.data.sender;
						this.#masterMonitorLastActivity = Date.now();
						if (this.#isMasterMonitor()) {
							this._monitor.setMasterMonitor();
							//Send a pong for the slave monitors to be marked as such
							try {
								this._monitor._channel.postMessage({ type: "masterMonitorPong" });
							} catch (error) {
								console.warn("[MasterSlave] Failed to send master pong:", error);
							}

							//Update the status of the master monitor
							if (this._monitor._serverComMgr && this._monitor._serverComMgr.updateServicesStatus) {
								this._monitor._serverComMgr.updateServicesStatus();
							}
						} else {
							this._monitor.setSlaveMonitor();
						}
					}

					//A tab is alive
					if (event.data.type === "ImAlive") {
						if (!this.#monitorSet.has(event.data.sender)) {
							this.#monitorSet.add(event.data.sender);
						}

						if (this.#masterMonitorId === event.data.sender) {
							this.#masterMonitorLastActivity = Date.now();
						}
					}

					//A tab is quitting
					if (event.data.type === "IQuit") {
						this.#monitorSet.delete(event.data.sender);
					}

					//A tab is asking if we are the master. This occurs whena new monitor is loaded.
					if (event.data.type === "areYouTheMaster") {
						//Add the sender to the monitorSet
						this.#monitorSet.add(event.data.sender);

						if (this.#isMasterMonitor()) {
							try {
								this._monitor._channel.postMessage({
									type: "ImTheMaster",
									sender: this.#monitorId,
									destination: event.data.sender,
								});
							} catch (error) {
								console.warn("[MasterSlave] Failed to send ImTheMaster:", error);
							}
						}

						//Inform the sender that we exist.
						try {
							this._monitor._channel.postMessage({
								type: "ImAlive",
								sender: this.#monitorId,
								destination: event.data.sender,
							});
						} catch (error) {
							console.warn("[MasterSlave] Failed to send ImAlive:", error);
						}
					}
				}
			};

			//Listen for messages from other tabs
			this._monitor._channel.addEventListener("message", this.#messageHandler);

			// Store reference to beforeunload handler
			this.#beforeUnloadHandler = () => {
				try {
					this._monitor._channel.postMessage({
						type: "IQuit",
						sender: this.#monitorId,
						destination: "*",
					});
				} catch (error) {
					console.warn("[MasterSlave] Failed to send quit message:", error);
				}

				if (this.#isMasterMonitor()) {
					this.#promoteNewMasterTab();
				}
			};

			this._monitor._hookMgr.hookBind("beforeunload", this.#beforeUnloadHandler);
		} catch (error) {
			console.error("[MasterSlave] Failed to setup event listeners:", error);
			// Ensure we still function as master in error cases
			if (this._monitor && this._monitor.setMasterMonitor) {
				this._monitor.setMasterMonitor();
			}
		}
	}

	#keepAlive() {
		// Clear any existing interval
		if (this.#keepAliveInterval) {
			clearInterval(this.#keepAliveInterval);
		}

		//Send a message that we are still alive every second
		this.#keepAliveInterval = setInterval(() => {
			try {
				if (this._monitor && this._monitor._channel) {
					this._monitor._channel.postMessage({ type: "ImAlive", destination: "*", sender: this.#monitorId });
				}
			} catch (error) {
				console.warn("[MasterSlave] Failed to send keep-alive:", error);
			}

			//Update the master monitor's last activity time as we won't receive our own ImAlive messages.
			if (this.#isMasterMonitor()) {
				this.#masterMonitorLastActivity = Date.now();
			}

			//Fail safe: In the event that there is no more master monitor active, promote a new one.
			if (this.#masterMonitorLastActivity < Date.now() - 2000) {
				this.#monitorSet.delete(this.#masterMonitorId);
				this.#promoteMyself();
			}
		}, 1000);
	}

	#checkIfMasterTab() {
		//By default, set us as the master monitor.
		this.#masterMonitorId = this.#monitorId;
		this.#masterMonitorLastActivity = Date.now();
		this._monitor.setMasterMonitor();

		//Query other tabs to see if there is already a master
		try {
			if (this._monitor && this._monitor._channel) {
				this._monitor._channel.postMessage({
					type: "areYouTheMaster",
					destination: "*",
					sender: this.#monitorId,
				});
			}
		} catch (error) {
			console.warn("[MasterSlave] Failed to query for master:", error);
			// Continue as master if we can't communicate
		}
	}

	#promoteNewMasterTab() {
		if (this.#isMasterMonitor()) {
			//Pick a monitor from the monitorSet:
			const monitorId = this.#monitorSet.values().next().value;

			if (monitorId !== this.#monitorId) {
				this.#masterMonitorId = monitorId;

				//Designate a new master monitor
				try {
					if (this._monitor && this._monitor._channel) {
						this._monitor._channel.postMessage({
							type: "ImTheMaster",
							sender: monitorId,
							destination: "*",
						});
					}
				} catch (error) {
					console.warn("[MasterSlave] Failed to promote new master:", error);
				}

				this._monitor.setSlaveMonitor();
			}

			//Else, remain the master monitor.
		}
	}

	#promoteMyself() {
		this.#masterMonitorId = this.#monitorId;
		this.#masterMonitorLastActivity = Date.now();

		try {
			if (this._monitor && this._monitor._channel) {
				this._monitor._channel.postMessage({
					type: "ImTheMaster",
					sender: this.#monitorId,
					destination: "*",
				});
			}
		} catch (error) {
			console.warn("[MasterSlave] Failed to announce self-promotion:", error);
		}

		this._monitor.setMasterMonitor();
	}

	#isMasterMonitor() {
		return this.#masterMonitorId === this.#monitorId;
	}

	destroy() {
		// Clear the keep-alive interval to prevent memory leak
		if (this.#keepAliveInterval) {
			clearInterval(this.#keepAliveInterval);
			this.#keepAliveInterval = null;
		}

		// Remove event listeners
		if (this.#messageHandler && this._monitor && this._monitor._channel) {
			this._monitor._channel.removeEventListener("message", this.#messageHandler);
			this.#messageHandler = null;
		}

		// Unbind beforeunload if possible
		if (this.#beforeUnloadHandler && this._monitor && this._monitor._hookMgr && this._monitor._hookMgr.unbind) {
			this._monitor._hookMgr.unbind("beforeunload", this.#beforeUnloadHandler);
			this.#beforeUnloadHandler = null;
		}

		// Clear monitor set
		this.#monitorSet.clear();

		// Clear static instance reference
		MasterSlave.#instance = null;
	}

	// Static method to reset singleton for testing
	static resetInstance() {
		if (MasterSlave.#instance) {
			MasterSlave.#instance.destroy();
		}
		MasterSlave.#instance = null;
	}
}

export { MasterSlave };
