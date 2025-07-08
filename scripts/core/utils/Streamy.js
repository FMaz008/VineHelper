/**
 * Facilitation class to use use vanillaJS ReadableSteam.
 * Usage:
 * <code>
 * const myStream = new Streamy();
 * myStream.input({"data": 123});
 * const step1 = myStream.transformer(function(data){
 * 		//Do something with the data
 * 		return data;
 * });
 * myStream.pipe(step1).pipe(step1).output(dispatchItemFunction);
 * </code>
 */
class Streamy {
	#streamController;
	#stream;
	#fallbackMode = false;
	#fallbackData = [];
	#fallbackTransformers = [];
	#fallbackOutputFunction = null; // Store the output function for immediate processing

	constructor(inputData = null) {
		// Check if we're in Firefox and if Stream APIs are properly available
		const isFirefox = navigator.userAgent.includes("Firefox");
		const hasStreamAPIs = typeof ReadableStream !== "undefined" && typeof TransformStream !== "undefined";

		if (!hasStreamAPIs) {
			console.warn("[Streamy] Stream APIs not available, using fallback mode");
			this.#fallbackMode = true;
		} else {
			try {
				// Test Stream API access first
				const testController = {
					close: () => {},
					enqueue: () => {},
				};

				this.#stream = new ReadableStream({
					start: (ctrl) => {
						this.#streamController = ctrl;
					},
				});
			} catch (error) {
				console.warn("[Streamy] ReadableStream creation failed, using fallback mode:", error);
				this.#fallbackMode = true;
			}
		}

		if (inputData != null) {
			this.input(inputData);
		}
	}

	/** Transform the stream
	 *  Usage:
	 * <code>
	 * const step1 = mySteam.transformer(function(data){
	 * 		//Do something with the data
	 * 		return data;
	 * });
	 * </code>
	 */
	transformer(transformFunc) {
		if (this.#fallbackMode) {
			// Return a mock transformer for fallback mode
			return {
				_transformFunc: transformFunc,
				_isFallbackTransformer: true,
			};
		}

		try {
			const transformer = new TransformStream({
				transform(data, controller) {
					data = transformFunc(data);
					controller.enqueue(data);
				},
			});
			return transformer;
		} catch (error) {
			console.warn("[Streamy] TransformStream creation failed, switching to fallback:", error);
			this.#fallbackMode = true;
			return {
				_transformFunc: transformFunc,
				_isFallbackTransformer: true,
			};
		}
	}

	/** True = keep in the stream */
	filter(filterFunc) {
		if (this.#fallbackMode) {
			// Return a mock filter for fallback mode
			return {
				_filterFunc: filterFunc,
				_isFallbackFilter: true,
			};
		}

		try {
			const transformer = new TransformStream({
				transform(data, controller) {
					let filter = filterFunc(data);
					if (filter) {
						controller.enqueue(data);
					}
				},
			});
			return transformer;
		} catch (error) {
			console.warn("[Streamy] Filter TransformStream creation failed, switching to fallback:", error);
			this.#fallbackMode = true;
			return {
				_filterFunc: filterFunc,
				_isFallbackFilter: true,
			};
		}
	}

	input(data) {
		if (data == undefined) {
			throw new Error("No data provided to the input method of the stream.");
		}

		if (this.#fallbackMode) {
			// In fallback mode, process data immediately if output function is available
			if (this.#fallbackOutputFunction) {
				this.#processFallbackData(data);
			} else {
				// Store data for later processing if output function not set yet
				this.#fallbackData.push(data);
			}
		} else {
			try {
				this.#streamController.enqueue(data);
			} catch (error) {
				console.warn("[Streamy] Stream enqueue failed, switching to fallback:", error);
				this.#fallbackMode = true;
				if (this.#fallbackOutputFunction) {
					this.#processFallbackData(data);
				} else {
					this.#fallbackData.push(data);
				}
			}
		}
	}

	#processFallbackData(data) {
		let processedData = data;

		// Apply transformers/filters in order
		for (const transformer of this.#fallbackTransformers) {
			if (transformer._isFallbackFilter) {
				// Apply filter
				if (!transformer._filterFunc(processedData)) {
					return; // Skip this data item
				}
			} else if (transformer._isFallbackTransformer) {
				// Apply transformer
				processedData = transformer._transformFunc(processedData);
			}
		}

		// Call the output function with processed data
		this.#fallbackOutputFunction(processedData);
	}

	pipe(transformFunc) {
		if (this.#fallbackMode) {
			this.#fallbackTransformers.push(transformFunc);
			return this;
		}

		if (
			!(transformFunc instanceof TransformStream) &&
			!transformFunc._isFallbackTransformer &&
			!transformFunc._isFallbackFilter
		) {
			throw new Error(
				"Pipe's parameter 1 needs to be of type TransformStream, which you can obtain by creating one with the function transformSteam(someFunction)"
			);
		}

		// Handle fallback transformers
		if (transformFunc._isFallbackTransformer || transformFunc._isFallbackFilter) {
			this.#fallbackMode = true;
			this.#fallbackTransformers.push(transformFunc);
			return this;
		}

		try {
			this.#stream = this.#stream.pipeThrough(transformFunc);
		} catch (err) {
			console.warn("[Streamy] Pipe operation failed, switching to fallback:", err);
			this.#fallbackMode = true;
			this.#fallbackTransformers.push(transformFunc);
		}
		return this;
	}

	output(endFunc) {
		if (this.#fallbackMode) {
			// Store the output function for immediate processing of future data
			this.#fallbackOutputFunction = endFunc;

			// Process any data that was stored before output function was set
			this.#fallbackData.forEach((data) => {
				this.#processFallbackData(data);
			});

			// Clear processed data to prevent reprocessing
			this.#fallbackData = [];
			return;
		}

		try {
			const reader = this.#stream.getReader();
			reader
				.read()
				.then(function processText({ done, value }) {
					if (done) {
						console.log("Stream complete");
						return;
					}
					if (value == undefined) {
						console.warn("Output has no data. Did you forget a return data; in one of the transformer?");
					} else {
						endFunc(value);
					}

					return reader.read().then(processText);
				})
				.catch((error) => {
					console.error("[Streamy] Stream reading failed:", error);
				});
		} catch (error) {
			console.error("[Streamy] Failed to get stream reader:", error);
		}
	}
}

export { Streamy };
