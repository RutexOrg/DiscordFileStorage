import { Readable, PassThrough } from "stream";
import axios from "axios";

/**
* Class that combines list of urls into a single Readable stream. 
* Combines list of urls into a single Readable stream, where data readen sequentially.
* Warning! After returning stream, since it promise-based function, it will start downloading data from urls in the background on add url call until .markFinished() is called. 
*/
export default class HttpStreamPool {
	private urls: string[] = [];
	private currentUrlIndex = 0;
	private readable: Readable;
	private isFinished = false;
	private anyJobRunning = false;

	constructor() {
		this.readable = new PassThrough();
	}

	public getReadable(): Readable {
		return this.readable!;
	}

	public async addUrl(url: string) {
		if (this.isFinished) {
			throw new Error("Stream is already finished, trying to add " + url + " to it.");
		}

		this.urls.push(url);
		if(!this.anyJobRunning){
			setImmediate(() => {
				this.streamNextUrl();
			});
		}
	}


	private async streamNextUrl() {
		this.anyJobRunning = true;

		const response = await axios.get(this.urls[this.currentUrlIndex++], { responseType: "stream" });
		response.data.pipe(this.readable, { end: false });

		response.data.on("end", () => {
			if (this.currentUrlIndex < this.urls.length) {
				this.streamNextUrl();
			}else{
				this.anyJobRunning = false;
			}
		});
		response.data.on("error", () => {
			this.anyJobRunning = false;
			console.log("Error while downloading file");
			this.markFinished();
			this.readable.destroy(new Error("Error while downloading file"));
		});
	}

	public markFinished() {
		this.isFinished = true;
		this.anyJobRunning = false;

	}


}