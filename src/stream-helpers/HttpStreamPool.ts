import { Readable, PassThrough } from "stream";
import axios from "axios";

/**
 * Class that combines list of urls into a single Readable stream. 
 */
export default class HttpStreamPool{
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
    this.currentUrlIndex = 0;
    const passThrough = new PassThrough();

    const streamFile = async (url: string) => {
      const response = await axios.get(url, { responseType: "stream" });
      response.data.pipe(passThrough, { end: false });
      await new Promise((resolve, reject) => {
        response.data.on("end", () => {
          this.currentUrlIndex++;
          if (this.currentUrlIndex < this.urls.length) {
            streamFile(this.urls[this.currentUrlIndex]);
          } else {
            passThrough.end();
          }
          resolve(true);
        });
        response.data.on("error", reject);
      });
    }

    streamFile(this.urls[this.currentUrlIndex]);

    return passThrough;
  }


}