import RemoteFile from "./file/RemoteFile";
import { Readable, Writable } from "stream";


export interface IUploadResult {
    success: boolean;
    message: string;
    file: RemoteFile | null;
}

export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
}

export interface IDeleteResult extends IUploadResult {};

export default interface IFIleManager {
    getDownloadableReadStream(file: RemoteFile, callback: (stream: Readable) => void): void;
    getUploadWritableStream(file: RemoteFile, size: number, callbacks: IWriteStreamCallbacks): Promise<Writable>;
    
    postMetaFile(file: RemoteFile): Promise<IUploadResult>;
    updateMetaFile(file: RemoteFile): Promise<IUploadResult>;

    deleteFile(file: RemoteFile, headerOnly: boolean): Promise<IDeleteResult>;
    renameFile(file: RemoteFile, newName: string): Promise<IUploadResult>;
}