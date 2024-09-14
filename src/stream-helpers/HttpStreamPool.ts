import { AxiosResponse } from "axios";
import { Readable, PassThrough } from "stream";
import client from "../helper/AxiosInstance.js";
import { IChunkInfo } from "../file/IFile.js";

/**
 * Class that combines list of urls into a single Readable stream. 
 */
export default class HttpStreamPool {
	private chunks: IChunkInfo[];
	private totalSize: number;
	private gotSize = 0;
	private currentUrlIndex = 0;
	private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
	private downloadingFileName: string;
	
	constructor(info: IChunkInfo[], totalSize: number, filename: string) {
		this.chunks = info;
		this.totalSize = totalSize;
		this.downloadingFileName = filename;
	}

	/**
	 * Combines list of urls into a single Readable stream, where data readen sequentially.
	 * Warning! After returning stream, since it promise-based function, it will start downloading data from urls in the background.
	 * Not tested much and may !crash or leak your memory! 
	 * @returns Readable stream that emits data from all urls sequentially. 
	 */
	public async getDownloadStream(resolver: (id: string) => Promise<string>): Promise<Readable> {
		if(this.chunks.length == 0) {
			console.warn("[HttpStreamPool] No urls to download, returning empty stream");
			return Readable.from([]);
		}

		const stream = new PassThrough();
		const self = this;

		let next = async () => {
			if (self.currentUrlIndex >= self.chunks.length) {
				stream.once("unpipe", () => {
					console.log("[HttpStreamPool] Downloading finished: " + self.downloadingFileName);
					stream.end(null);
				});
				return;
			}

			if(stream.closed || stream.destroyed) {
				console.log("[HttpStreamPool] stream closed; aborting");
				return;
			}

			let fileChunk = self.chunks[self.currentUrlIndex];
			let res: AxiosResponse;
			try {
				console.log("[HttpStreamPool] getting: become new url of a file: " + fileChunk.id);
				const url = await resolver(fileChunk.id);
				console.log("[HttpStreamPool] Got: " + url);
				res = await client.get(url, {
					responseType: "stream",
					headers: {
						"User-Agent": self.userAgent,
					},
					timeout: 10000,
				});
			} catch (err) {
				console.error(err);
				stream.emit("error", err);
				return;
			}

			res.data.on("data", (chunk: Buffer) => {
				self.gotSize += chunk.length;
				stream.emit("progress", self.gotSize, self.totalSize);
			});

			res.data.on("end", () => {
				self.currentUrlIndex++;
				next();
			});

			res.data.on("error", (err: Error) => {
				console.error(err);
				stream.emit("error", err);
			});

			res.data.pipe(stream, { end: false });
		}



		next();

		return stream;
	}

}