import { Readable } from 'stream';
// took from https://stackoverflow.com/questions/63440916/how-can-i-asynchronously-handle-stream-events-in-node-js-while-preserving-order
/**
 * A simple event queue that allows you to queue up events on a stream. 
 */
export default class EventQueue {
    stream: Readable;
    errorHandler: Function;
    chain: Promise<any>;
    err: Error | null;

    constructor(emitter: Readable, errorHandler: Function) {
        this.stream = emitter;
        this.errorHandler = errorHandler;
        this.chain = Promise.resolve();
        this.err = null;
        this.stream.on('error', this.processError.bind(this));
    }
    processError(err: Error) {
        // only ever call the errorHandler once
        if (this.err) return;
        this.err = err;
        this.errorHandler(err);
    }
    on(event: string, handler: Function) {
        this.stream.on(event, (...args) => {
            // wait for previous events to be done before running this one
            // and put the new end of the chain in this.chain
            this.chain = this.chain.then(() => {
                // skip any queued handlers once we've received an error
                if (this.err) return;
                // now that the chain has gotten to us, call our event  handler
                return handler(...args);
            }).catch(err => {
                this.processError(err);
                throw err;
            });
        });
        return this;
    }

    destroy() {
        this.stream.emit("end");
        this.stream.destroy();
    }

}
    