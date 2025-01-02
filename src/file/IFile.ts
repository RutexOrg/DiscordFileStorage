import { randomBytes } from '@noble/ciphers/webcrypto';

export interface IFile {
    name: string; // name is used only for raw provider, not for webdav. Webdav uses paths.  
    size: number;
    chunks: IChunkInfo[]
    created: Date;
    modified: Date;
    iv: Uint8Array
    // uploaded: boolean;
    encrypted: boolean;
}

export interface IChunkInfo {
    id: string; // discord (or any other provider) message id
    size: number;
    // url: string;
}


export type IFilesDesc = Record<string, IFile>;


/**
     * Returns file struct, no remote operations are done.
     */
export function createVFile(name: string, size: number = 0, encrypted: boolean): IFile {
    return {
        name,
        size,
        chunks: [],
        created: new Date(),
        modified: new Date(),
        encrypted,
        iv: encrypted ? randomBytes(16) : new Uint8Array(0)
    };
}