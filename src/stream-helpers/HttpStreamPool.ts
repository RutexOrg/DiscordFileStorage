import { AxiosResponse, AxiosError } from "axios";
import { Readable, PassThrough } from "stream";
import client from "../helper/AxiosInstance.js";
import { IChunkInfo, IFile } from "../file/IFile.js";
import structuredClone from "@ungap/structured-clone";

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
                console.log("[HttpStreamPool] Downloading cancelled: " + this.downloadingFileName);
                this.cleanupStream(stream);
                return;
            }

            if (this.currentUrlIndex >= this.chunks.length) {
                console.log("[HttpStreamPool] Downloading finished: " + this.downloadingFileName);
                this.cleanupStream(stream);
                return;
            }

            if (stream.closed || stream.destroyed) {
                console.log("[HttpStreamPool] Stream closed; aborting");
                this.cleanupStream(stream);
                return;
            }

            try {
                console.log("[HttpStreamPool] Getting next chunk url for file:", this.downloadingFileName);
                const url = await resolver(this.chunks[this.currentUrlIndex].id);
                console.log("[HttpStreamPool] Got url:", url);

                if (this.isCancelled) {
                    console.log("[HttpStreamPool] Download cancelled before starting chunk");
                    this.cleanupStream(stream);
                    return;
                }

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