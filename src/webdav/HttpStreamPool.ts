import fse, { ReadStream } from 'fs-extra';
import { AxiosInstance } from "axios";
import { EventEmitter } from "events";
import { Readable, PassThrough } from "stream";
import axios from "axios";

/**
 * Class that takes a list of urls and streams them sequentially to a single stream
 */
export default class HttpStreamPool extends EventEmitter {
    private instance: AxiosInstance;
    private urls: string[];

    private currentStreamIndex = 0;

    constructor(instance: AxiosInstance, urls: string[]) {
        super();
        this.instance = instance;
        this.urls = urls;
    }

    
    public async getDownloadStream(urls: string[]): Promise<Readable> {
        const passThrough = new PassThrough();
        let currentUrlIndex = 0;
      
        async function streamFile(url: string) {
          const response = await axios.get(url, { responseType: "stream" });
          response.data.pipe(passThrough, { end: false });
          await new Promise((resolve, reject) => {
            response.data.on("end", () => {
              currentUrlIndex++;
              if (currentUrlIndex < urls.length) {
                streamFile(urls[currentUrlIndex]);
              } else {
                passThrough.end();
              }
              resolve(true);
            });
            response.data.on("error", reject);
          });
        }
      
        streamFile(urls[currentUrlIndex]);
      
        return passThrough;
      }
    

}