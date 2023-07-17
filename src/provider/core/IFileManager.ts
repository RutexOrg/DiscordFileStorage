import { IFile } from "../../file/IFile";
import { Readable, Writable } from "stream";


export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
}


export default interface IFIleManager {
    getDownloadableReadStream(file: IFile, callback: (stream: Readable) => void): void;
    getUploadWritableStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable>;
}