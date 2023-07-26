export interface IFile {
    name: string; // the name isnt really needed/used since everything handled by memfs, but its nice to have it (for debugging and stuff) 
    size: number;
    chunks: IChunkInfo[]
    created: Date;
    modified: Date;
    // uploaded: boolean;
}

export interface IChunkInfo {
    id: string; // discord (or any other) message id
    size: number;
    url: string;
}


export type IFilesDesc = Record<string, IFile>;