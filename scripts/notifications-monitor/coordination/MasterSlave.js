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

	constructor(monitor) {
		if (MasterSlave.#instance) {
			return MasterSlave.#instance;
		}
		MasterSlave.#instance = this;
		this.#monitorId = crypto.randomUUID();
		this._monitor = monitor;
		this.#createEventListeners();
		this.#checkIfMasterTab();
		this.#keepAlive();
	}

	#createEventListeners() {
		//Listen for messages from other tabs
		this._monitor._channel.addEventListener("message", (event) => {
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
					this._monitor._channel.postMessage({ type: "masterMonitorPong" });
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
						this._monitor._channel.postMessage({ type: "masterMonitorPong" });

						//Update the status of the master monitor
						this._monitor._serverComMgr.updateServicesStatus();
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
						this._monitor._channel.postMessage({
							type: "ImTheMaster",
							sender: this.#monitorId,
							destination: event.data.sender,
						});
					}

					//Inform the sender that we exist.
					this._monitor._channel.postMessage({
						type: "ImAlive",
						sender: this.#monitorId,
						destination: event.data.sender,
					});
				}
			}
		});

		this._monitor._hookMgr.hookBind("beforeunload", () => {
			this._monitor._channel.postMessage({
				type: "IQuit",
				sender: this.#monitorId,
				destination: "*",
			});

			if (this.#isMasterMonitor()) {
				this.#promoteNewMasterTab();
			}
		});
	}

	#keepAlive() {
		// Clear any existing interval
		if (this.#keepAliveInterval) {
			clearInterval(this.#keepAliveInterval);
		}

		//Send a message that we are still alive every second
		this.#keepAliveInterval = setInterval(() => {
			this._monitor._channel.postMessage({ type: "ImAlive", destination: "*", sender: this.#monitorId });

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
		this._monitor._channel.postMessage({ type: "areYouTheMaster", destination: "*", sender: this.#monitorId });
	}

	#promoteNewMasterTab() {
		if (this.#isMasterMonitor()) {
			//Pick a monitor from the monitorSet:
			const monitorId = this.#monitorSet.values().next().value;

			if (monitorId !== this.#monitorId) {
				this.#masterMonitorId = monitorId;

				//Designate a new master monitor
				this._monitor._channel.postMessage({
					type: "ImTheMaster",
					sender: monitorId,
					destination: "*",
				});

				this._monitor.setSlaveMonitor();
			}

			//Else, remain the master monitor.
		}
	}

	#promoteMyself() {
		this.#masterMonitorId = this.#monitorId;
		this.#masterMonitorLastActivity = Date.now();

		this._monitor._channel.postMessage({
			type: "ImTheMaster",
			sender: this.#monitorId,
			destination: "*",
		});

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

		// Clear static instance reference
		MasterSlave.#instance = null;
	}
}

export { MasterSlave };
