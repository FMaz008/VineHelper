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

	constructor(inputData = null) {
		this.#stream = new ReadableStream({
			start: (ctrl) => {
				this.#streamController = ctrl;
			},
		});

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
		const transformer = new TransformStream({
			transform(data, controller) {
				data = transformFunc(data);
				controller.enqueue(data);
			},
		});
		return transformer;
	}

	/** True = keep in the stream */
	filter(filterFunc) {
		const transformer = new TransformStream({
			transform(data, controller) {
				let filter = filterFunc(data);
				if (filter) {
					controller.enqueue(data);
				}
			},
		});
		return transformer;
	}

	input(data) {
		if (data == undefined) {
			throw new Error("No data provided to the input method of the stream.");
		}
		this.#streamController.enqueue(data);
	}

	pipe(transformFunc) {
		if (!(transformFunc instanceof TransformStream)) {
			throw new Error(
				"Pipe's parameter 1 needs to be of type TransformStream, which you can obtain by creating one with the function transformSteam(someFunction)"
			);
		}
		try {
			this.#stream = this.#stream.pipeThrough(transformFunc);
		} catch (err) {
			console.error("Can't reuse the same transformer twice.", err);
		}
		return this;
	}
	output(endFunc) {
		const reader = this.#stream.getReader();
		reader.read().then(function processText({ done, value }) {
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
		});
	}
}

export { Streamy };
