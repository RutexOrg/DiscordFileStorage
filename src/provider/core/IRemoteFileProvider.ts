import { IFileDesc } from "../../file/IFile";
import { Readable, Writable } from "stream";


export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
    onAbort?: (error: Error | null) => void;
}


export default interface IFIleManager {
    getDownloadReadStream(file: IFileDesc, callback: (stream: Readable) => void): void;
    getUploadWriteStream(file: IFileDesc, callbacks: IWriteStreamCallbacks): Promise<Writable>;
}