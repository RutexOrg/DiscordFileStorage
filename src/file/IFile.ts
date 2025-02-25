import { randomFillSync } from 'node:crypto';



// JSON <-> IFile conversion can be found in src\file\VolumeEx.ts
export interface IFile {
    name: string; // name is used only for raw provider, not for webdav. Webdav uses paths, so it possible inconsistency between name and real vfs path.  
    size: number;
    chunks: IChunkInfo[]
    created: Date;
    modified: Date;
    iv: Buffer
    encrypted: boolean;
}

export interface IChunkInfo {
    id: string; // discord (or any other provider) message id
    size: number;
    // url: string;
}


export type IFilesDesc = Record<string, IFile>;


/**
 * Returns newly created file struct, no remote operations are done.
 */
export function createVFile(name: string, size: number = 0, encrypted: boolean): IFile {
    const iv = Buffer.alloc(16, 0);
    if (encrypted) {
        randomFillSync(iv);
    }

    return {
        name,
        size,
        chunks: [],
        created: new Date(),
        modified: new Date(),
        encrypted,
        iv,
    };
}