import { IFile } from "./file/IFile";
import { Readable, Writable } from "stream";


export interface IUploadResult {
    success: boolean;
    message: string;
    file: IFile | null;
}

export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
}

export interface IDeleteResult extends IUploadResult {};

export default interface IFIleManager {
    getDownloadableReadStream(file: IFile, callback: (stream: Readable) => void): void;
    getUploadWritableStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable>;
    
    // deleteFile(file: IFile, headerOnly: boolean): Promise<IDeleteResult>;
    // renameFile(file: IFile, newName: string): Promise<IUploadResult>;
}