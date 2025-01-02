import Log from "./Log.js";
import structuredClone from "@ungap/structured-clone";
import client from "./helper/AxiosInstance.js";

import { AxiosError } from "axios";
import { IChunkInfo, IFile } from "./file/IFile.js";
import { Readable, PassThrough } from "stream";
// import { patchEmitter } from "./helper/EventPatcher.js";


export default class HttpStreamPool {
    private chunks: IChunkInfo[];
    private totalSize: number;
    private gotSize = 0;
    private currentUrlIndex = 0;
    private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
    private downloadingFileName: string;
    private isCancelled = false;

    constructor(file: IFile, userAgent?: string) {
        file = structuredClone(file);

        this.chunks = file.chunks;
        this.totalSize = file.size;
        this.downloadingFileName = file.name;

        if (userAgent) {
            this.userAgent = userAgent;
        }
    }

    public async getDownloadStream(resolver: (id: string) => Promise<string>): Promise<Readable> {
        if (this.chunks.length == 0) {
            console.warn("[HttpStreamPool] No urls to download, returning empty stream");
            return Readable.from([]);
        }

        const stream = new PassThrough();
        const next = async () => {
            if (this.isCancelled) { // extra check against race conditions, since we are using async functions.
                Log.info("[HttpStreamPool] Downloading cancelled: " + this.downloadingFileName);
                this.cleanupStream(stream);
                return;
            }

            if (this.currentUrlIndex >= this.chunks.length) {
                Log.info("[HttpStreamPool] Downloading finished: " + this.downloadingFileName);
                // patchEmitter(stream, "HttpStreamPool", [/progress/]);
                this.cleanupStream(stream);
                return;
            }

            if (stream.closed || stream.destroyed) {
                Log.info("[HttpStreamPool] Stream closed; aborting");
                this.cleanupStream(stream);
                return;
            }

            try {
                if (this.isCancelled) {
                    Log.info("[HttpStreamPool] Download cancelled before starting chunk");
                    this.cleanupStream(stream);
                    return;
                }

                Log.info("Resolving attachment URL for message: " + this.chunks[this.currentUrlIndex].id);
                const url = await resolver(this.chunks[this.currentUrlIndex].id);

                const res = await client.get<Readable>(url, {
                    responseType: "stream",
                    headers: {
                        "User-Agent": this.userAgent,
                    },
                    timeout: 10000,
                });

                res.data.on("data", (chunk: Buffer) => {
                    this.gotSize += chunk.length;
                    const progress = this.totalSize > 0 ? this.gotSize / this.totalSize : 0;
                    stream.emit("progress", this.gotSize, this.totalSize, progress);
                });

                res.data.on("end", () => {
                    this.currentUrlIndex++;
                    next();
                });

                res.data.on("error", (err: Error) => {
                    this.handleError(err, stream);
                });

                res.data.pipe(stream, { end: false });
            } catch (err) {
                this.handleError(err, stream);
            }
        };

        next();
        return stream;
    }

    private handleError(err: unknown, stream: PassThrough) {
        if (err instanceof AxiosError && err.code === 'ECONNABORTED') {
            console.error("[HttpStreamPool] Request timeout:", err.message);
            stream.emit("error", new Error("Request timeout"));
        } else {
            console.error("[HttpStreamPool] Error:", err);
            stream.emit("error", err instanceof Error ? err : new Error("Unknown error occurred"));
        }
        this.cleanupStream(stream);
    }

    private cleanupStream(stream: PassThrough) {
        stream.end();
        this.cancelDownload();
    }

    public cancelDownload() {
        this.isCancelled = true;
    }
}