import { Readable, PassThrough } from "stream";
import client from "../helper/AxiosInstance.js";

/**
 * Class that combines list of urls into a single Readable stream. 
 */
export default class HttpStreamPool {
	private urls: string[];

	private currentUrlIndex = 0;

	constructor(urls: string[]) {
		this.urls = urls;
	}

	/**
	 * Combines list of urls into a single Readable stream, where data readen sequentially.
	 * Warning! After returning stream, since it promise-based function, it will start downloading data from urls in the background.
	 * Not tested much and may !crash or leak your memory! 
	 * @returns Readable stream that emits data from all urls sequentially. 
	 */
	public async getDownloadStream(): Promise<Readable> {
		console.log("Starting download of " + this.urls.length + " files")
		this.currentUrlIndex = 0;
		const passThrough = new PassThrough();

		const streamFile = async (url: string) => {
			const response = await client.get(url, { responseType: "stream" });
			response.data.once("error", (err: Error) => {
				console.log("Error downloading " + url)
				console.log(err);
			});

			response.data.once("end", () => {
				console.log("Downloaded " + url)
			});

			response.data.pipe(passThrough, { end: false });
			
			await new Promise((resolve, reject) => {
				response.data.on("end", () => {
					console.log("Downloaded " + url)
					this.currentUrlIndex++;
					if (this.currentUrlIndex < this.urls.length) {
						streamFile(this.urls[this.currentUrlIndex]);
					} else {
						passThrough.end();
						console.log("All files downloaded");
					}
					resolve(true);
				});
				response.data.on("error", reject);
				response.data.on("error", ()=>{console.log("Error downloading " + url)});
			});

			console.log("done downloading");
		}

		streamFile(this.urls[this.currentUrlIndex]);

		return passThrough;
	}


}