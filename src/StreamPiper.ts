import { ReadStream } from 'fs-extra';
import { Readable, Writable } from 'stream';
import { PassThrough } from 'stream';


export default class StreamPiper {
    private streams: Readable[];
    private writeStream: Writable;
    private currentStreamIndex = 0;

    constructor(writeStream: Writable, streams: Readable[]) {
        this.writeStream = writeStream;
        this.streams = streams;
    }

    private async pipeStream(stream: Readable) {
        return new Promise((resolve, reject) => {
            stream.on('data', chunk => this.writeStream.write(chunk));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
    }

    public async start() {
        while (this.currentStreamIndex < this.streams.length) {
            const currentStream = this.streams[this.currentStreamIndex];
            await this.pipeStream(currentStream);
            this.currentStreamIndex += 1;
        }
        this.writeStream.end();
    }
}