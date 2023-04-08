import { Readable, PassThrough } from "stream";
import client from "../helper/AxiosInstance.js";
import { IAttachShortInfo } from "../file/ServerFile.js";
import { AxiosResponse } from "axios";

/**
 * Class that combines list of urls into a single Readable stream. 
 */
export default class HttpStreamPool {
	private urls: IAttachShortInfo[];
	private totalSize: number;
	private gotSize = 0;
	private currentUrlIndex = 0;
	private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"

	constructor(info: IAttachShortInfo[], totalSize: number) {
		this.urls = info;
		this.totalSize = totalSize;
	}

	/**
	 * Combines list of urls into a single Readable stream, where data readen sequentially.
	 * Warning! After returning stream, since it promise-based function, it will start downloading data from urls in the background.
	 * Not tested much and may !crash or leak your memory! 
	 * @returns Readable stream that emits data from all urls sequentially. 
	 */
	public async getDownloadStream(): Promise<Readable> {
		const stream = new PassThrough();
		const self = this;


		let next = async () => {
			if (self.currentUrlIndex >= self.urls.length) {
				stream.once("unpipe", () => {
					console.log("Downloading finished.");
					setTimeout(() => {
						stream.emit("end");
					}, 5000);
				});
				return;
			}

			let url = self.urls[self.currentUrlIndex];
			let res: AxiosResponse;
			try {
				console.log("getting: " + url.url);
				res = await client.get(url.url, {
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
				console.log("got: " + self.gotSize + " of " + self.totalSize);
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