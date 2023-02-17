import Folder, { ElementType } from "./Folder";
import ServerFile from "../ServerFile";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";

export type DiscordFileSystemEvents = {
    fileAdded: (file: ServerFile) => void;
    fileDeleted: (file: ServerFile) => void;
    folderAdded: (folder: Folder) => void;
    folderDeleted: (folder: Folder) => void;
}

export default class DiscordFileSystem extends (EventEmitter as new () => TypedEmitter<DiscordFileSystemEvents>) {
    
    private root: Folder;
    private cache: Map<string, ServerFile> = new Map();

    constructor() {
        super();
        this.root = new Folder("",null, true);
    }

    public buildCache(): void {
        this.cache.clear();
        this.root.getFilesPaths(this.cache);
    }

    public getRoot(): Folder {
        return this.root;
    }


    private addFileToCache(folder: Folder, file: ServerFile): void {
        this.cache.set(folder.getAbsolutePath() + "/" + file.getFileName(), file);
    }
    
    public getCachedFiles(): Map<string, ServerFile> {
        return this.cache;
    }

    public addFolder(f: Folder, path: string): void {
        let folder = this.root.getFolderByPath(path);
        if (!folder) {
            throw new Error("Folder "+path+" not found");
        }
        folder.addFolder(f);
        this.emit("folderAdded", f);
    }

    public addFile(f: ServerFile, path: string): void {
        let folder = this.root.getFolderByPath(path);
        if (!folder) {
            throw new Error("Folder "+path+" not found");
        }

        folder.addFile(f);
        this.addFileToCache(folder, f);
        this.emit("fileAdded", f);
    };

    public addFileAuto(f: ServerFile){
        this.addFile(f, f.getFolder().getAbsolutePath());
    }

    
    
    public getFileByPath(path: string): ServerFile | undefined {
        return this.cache.get(path);
    }

    public getFolderByPath(path: string): Folder | undefined {
        return this.root.getFolderByPath(path);
    }
   
    public getElementTypeByPath(path: string): ElementType {
        if (this.getFolderByPath(path)) {
            return {
                isFolder: true
            }
        }
        if (this.getFileByPath(path)) {
            return {
                isFile: true
            }
        }
        return {
            isUnknown: true
        }
    }
        
    deleteFile(file: ServerFile) {
        let folder = this.root.getFolderByPath(file.getFolder().getAbsolutePath());
        if (!folder) {
            throw new Error("Folder "+file.getFolder().getAbsolutePath()+" not found");
        }

        folder.removeFile(file);
        this.cache.delete(folder.getAbsolutePath() + "/" + file.getFileName());
        this.emit("fileDeleted", file);
    }

    printHierarchy(start: string = "/") {

    }

}