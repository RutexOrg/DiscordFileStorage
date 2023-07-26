import { IFile } from "../../file/IFile";
import { Readable, Writable } from "stream";


export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
    onAbort?: (error: Error | null) => void;
}


export default interface IFIleManager {
    getDownloadReadStream(file: IFile, callback: (stream: Readable) => void): void;
    getUploadWriteStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable>;
}