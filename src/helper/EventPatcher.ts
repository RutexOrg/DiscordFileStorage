
/**
 * Debugging helper to log all events emitted by the given emitter without having to manually add a listener for each event.
 * @param emitter The emitter to patch.
 */
export const patchEmitter = (emitter: any, label: string = "default") => {
	let oldEmit = emitter.emit;

	emitter.emit = function () {
		let emitArgs = arguments;
		let eventName = emitArgs[0];

		switch (eventName) {
			default: {
				console.log("["+label+"] event: " + eventName, "\n", Array.from(emitArgs).splice(0, 2));
			}
		}

		oldEmit.apply(emitter, arguments as any);
	} as any;
}
