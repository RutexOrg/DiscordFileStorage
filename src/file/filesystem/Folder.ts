import FileBase from "../FileBase.js";
import colors from "colors/safe.js";
import { INamingHelper } from "./INamingHelper.js";
import RamFile from "../RamFile.js";

export interface ElementType {
    isFile?: boolean;
    isFolder?: boolean;
    isUnknown?: boolean;
    entry?: Folder | FileBase; // undefined on isUnknown
}

/**
 * Very dirty implementation of a folder class.
 * Very early, unefficient and messy implementation, will be cleaned up later.
 */
export default class Folder {

    private name: string;
    private files: FileBase[] = [];
    private folders: Folder[] = [];
    private parent: Folder | null = null;
    private isRoot: boolean;
    private static root: Folder;

    constructor(name: string, parent: Folder | null = null) {
        name = name.trim();

        if (name.includes("/") || name.includes("\\")) {
            throw new Error("Folder name cannot contain / or \\");
        }
        if (name == "." || name == "..") {
            throw new Error("Folder name cannot be . or ..");
        }
        if (name == "" && parent !== null) {
            throw new Error("Root folder cannot have a parent");
        }

        const isRoot = name == "";

        if (parent) {
            parent.addFolder(this);
        }

        if (isRoot) {
            Folder.root = this;
        }

        this.isRoot = isRoot;

        this.name = name;
        this.parent = parent;
    }

    public static createRoot(): Folder {
        return new Folder("");
    }

    public getName(): string {
        return this.name;
    }

    getEntryName(): string {
        return this.name;
    }

    public setName(name: string): void {
        this.name = name;
    }

    public getFiles(): FileBase[] {
        return this.files;
    }


    public setFiles(files: FileBase[], updateParents: boolean): void {
        for (let i = 0; i < files.length; i++) {
            files[i].getFolder()!.removeFile(files[i]);
            files[i].setFolder(this, updateParents);
        }
        this.files = files;
    }

    public getFolders(): Folder[] {
        return this.folders;
    }

    public setFolders(folders: Folder[], updateParents: boolean): void {
        for (let i = 0; i < folders.length; i++) {
            folders[i].setParentFolder(this, updateParents);
        }
        this.folders = folders;
    }



    public getAllEntries(): ElementType[] {
        const entries: ElementType[] = [];

        this.folders.forEach(folder => entries.push({
            isFolder: true,
            entry: folder
        }));

        this.files.forEach(file => entries.push({
            isFile: true,
            entry: file
        }));
        return entries;
    }

    public getallEntriesRecursiveThis(): ElementType[] {
        return this.getAllEntriesRecursive(this);
    }

    public getAllEntriesRecursive(folder: Folder = Folder.root): ElementType[] {
        let entries: ElementType[] = [];
        folder.getFolders().forEach(folder => {
            entries.push({
                isFolder: true,
                entry: folder
            });
            entries = entries.concat(this.getAllEntriesRecursive(folder));
        });
        folder.getFiles().forEach(file => {
            entries.push({
                isFile: true,
                entry: file
            });
        });
        return entries;
    }

    public isRootFolder(): boolean {
        return this.isRoot;
    }

    public getParent(): Folder | null {
        return this.parent;
    }

    public setParentFolder(folder: Folder | null, updateParents: boolean = false): void {
        this.parent = folder;
    }

    public isSameNameExists(name: string): boolean {
        return this.folders.some(folder => folder.getName() == name) || this.files.some(file => file.getFileName() == name);
    }

    public cleanup(): void {
        this.files = [];
        this.folders = [];
    }

    public getEntryByPath(path: string): ElementType {
        if (this.getFolderByPath(path)) {
            return {
                isFolder: true,
                entry: this.getFolderByPath(path)
            }
        }
        if (this.getFileByPath(path)) {
            return {
                isFile: true,
                entry: this.getFileByPath(path)
            }
        }
        return {
            isUnknown: true
        }
    }


    public addFile(file: FileBase): void {
        if (!this.isSameNameExists(file.getFileName())) {
            file.setFolder(this, false);
            this.files.push(file);
        } else {
            throw new Error("File with name " + file.getFileName() + " already exists");
        }
    }

    public addFolder(folder: Folder): Folder {
        if (!this.isSameNameExists(folder.getName())) {
            this.folders.push(folder);
        } else {
            throw new Error("Folder with name " + folder.getName() + " already exists");
        }
        if (folder.getParent() != this) {
            folder.setParentFolder(this, false);
        }
        return folder;
    }


    public findFileByName(name: string, folder: Folder): FileBase | undefined {
        const files = folder.getFiles();
        for (let i = 0; i < files.length; i++) {
            if (files[i].getFileName() == name) {
                return files[i];
            }
        }
        return undefined;
    }

    public findFolderByName(name: string, folder: Folder): Folder | undefined {
        const folders = folder.getFolders();
        for (let i = 0; i < folders.length; i++) {
            if (folders[i].getName() == name) {
                return folders[i];
            }
        }
        return undefined;
    }

    private removeFileFromFolder(file: FileBase, folder: Folder): void {
        const ff = folder.files.find(f => f.getFileName() == file.getFileName())!;
        ff.setNullFolder();
        folder.files = folder.files.filter(f => f.getFileName() != file.getFileName());
    }

    public removeFileFromThisFolder(file: FileBase): void {
        this.removeFileFromFolder(file, this);
    }

    public removeFile(file: FileBase): void {
        if (file.getFolder() == null) {
            throw new Error("File is not in any folder, its already removed");
        }
        console.log("remove ", file instanceof FileBase ? "FileBase" : "ramFile")
        console.log(".Folder, removeFile(file), File path: Removing file " + file.getFileName() + " from folder " + this.getName() + " with path " + file.getAbsolutePath());
        console.log(".Folder, removeFile(file), File path: " + file.getAbsolutePath());
        file = Folder.root.getFileByPath(file.getAbsolutePath())!;
        // console.dir(file);
        if (!file) {
            throw new Error("File not found");
        }
        file.getFolder()!.removeFileFromFolder(file, file.getFolder()!);

    }

    private removeFolderFromHierarchy(folder: Folder, from: Folder): void {
        folder.setParentFolder(null, false);
        from.folders = from.folders.filter(f => f.name != folder.name);
    }

    public removeFolder(folder: Folder): void {
        if (folder.isRoot) {
            throw new Error("Cannot remove root folder");
        }
        this.removeFolderFromHierarchy(folder, folder.parent!);
    }
    public removeFolderHierarchy(folder: Folder): void {
        if (folder) {
            this.removeFolder(folder);
        } else {
            throw new Error("Folder not found");
        }
    }

    public removeThisFolder(): void {
        let parent = this.getParent()!;
        parent.folders = parent.folders.filter(f => f.name != this.name);
    }

    public createFolder(name: string): Folder {
        if (!this.isSameNameExists(name)) {
            const folder = new Folder(name, this);
            this.folders.push(folder);
            return folder;
        } else {
            throw new Error("Folder with name " + name + " already exists");
        }
    }

    public preparePath(path: string): string[] {
        const paths = path.split("/");
        paths.shift();

        if (paths.length == 0) {
            throw new Error("Path cannot be empty");
        }
        return paths;
    }
        

    public createFolderHierarchy(path: string): Folder {
        if (!path.startsWith("/")) {
            throw new Error("Path should start with /");
        }
        const paths = path.split("/");
        paths.shift();



        let currentFolder: Folder = this;
        for (let i = 0; i < paths.length; i++) {
            if (paths[i] == "") {
                continue;
            }
            let folder = currentFolder.getFolders().find(folder => folder.getName() == paths[i]);
            if (!folder) {
                folder = new Folder(paths[i], currentFolder);
            }
            currentFolder = folder;
        }

        return currentFolder;
    }

    // same as createHierarchy but creates last element as ramfile.
    public createRAMFileHierarchy(path: string, filename: string, creationDate: Date): RamFile {
        const folder = this.prepareFileHierarchy(path);
        if (folder.getFiles().find(file => file.getFileName() == filename)) {
            throw new Error("File with name " + filename + " already exists");
        }
        // console.log(".createRAMFileHierarchy, File path: " + path + "/" + filename);
        return new RamFile(filename, 0, folder, undefined, creationDate);
    }

    // creates folder hierarchy and returns last folder.
    // example: /folder1/folder2/folder3/file.txt -> returns folder3
    public prepareFileHierarchy(path: string): Folder {
        const paths = path.split("/");
        paths.shift();
        if (paths.length == 0) {
            throw new Error("Path cannot be empty");
        }

        let currentFolder: Folder = this;
        for (let i = 0; i < paths.length - 1; i++) {
            if (paths[i] == "") {
                continue;
            }
            let folder = currentFolder.getFolders().find(folder => folder.getName() == paths[i]);
            if (!folder) {
                folder = new Folder(paths[i], currentFolder);
            }
            currentFolder = folder;
        }
        return currentFolder;
    }

    // same as createHierarchy but creates last element as folder
    public prepareFolderHierarchy(path: string): Folder {
        const paths = path.split("/");
        paths.shift();
        if (paths.length == 0) {
            throw new Error("Path cannot be empty");
        }

        let currentFolder: Folder = this;
        for (let i = 0; i < paths.length; i++) {
            if (paths[i] == "") {
                continue;
            }
            let folder = currentFolder.getFolders().find(folder => folder.getName() == paths[i]);
            if (!folder) {
                folder = new Folder(paths[i], currentFolder);
            }
            currentFolder = folder;
        }
        return currentFolder;
    }

    public printHierarchyWithFiles(initial: boolean = false, debugText: string = ""): void {
        if (initial) {
            console.log("Printing hierarchy: " + this.getAbsolutePath(), debugText)
            console.log("-------------------");
        }
        console.log(colors.blue("[D] ") + this.getAbsolutePath());
        this.files.forEach(file => {
            console.log(colors.green("[F] ") + this.getAbsolutePath() + file.getFileName());
        });
        this.folders.forEach(folder => {
            folder.printHierarchyWithFiles();
        });
        if (initial) {
            console.log("-------------------");
        }
    }

    public getFilesPaths(map: Map<string, FileBase> = new Map()): Map<string, FileBase> {
        this.files.forEach(file => {
            map.set(this.getAbsolutePath() + file.getFileName(), file);
        });
        this.folders.forEach(folder => {
            folder.getFilesPaths(map);
        });
        return map;
    }

    // accepts path in format /folder1/folder2/folder3
    // returns folder or undefined if not found
    public getFolderByPath(path: string): Folder | undefined {
        if (!path.startsWith("/")) {
            throw new Error("Path should start with /");
        }

        const paths = path.split("/");
        paths.shift();
        if (paths.length == 0) {
            return undefined;
        }
        let currentFolder: Folder | undefined = this;
        for (let i = 0; i < paths.length; i++) {
            if (paths[i] == "") {
                continue;
            }
            currentFolder = currentFolder.getFolders().find(folder => folder.getName() == paths[i]);
            if (!currentFolder) {
                break;
            }
        }
        return currentFolder;
    }

    public getFileByPath(path: string): FileBase | undefined {
        if (!path.startsWith("/")) {
            throw new Error("Path should start with /");
        }

        const paths = path.split("/");
        paths.shift();
        if (paths.length == 0) {
            return undefined;
        }
        let currentFolder: Folder | undefined = this;
        for (let i = 0; i < paths.length - 1; i++) {
            if (paths[i] == "") {
                continue;
            }
            currentFolder = currentFolder.getFolders().find(folder => folder.getName() == paths[i]);
            if (!currentFolder) {
                break;
            }
        }
        if (!currentFolder) {
            return undefined;
        }
        return currentFolder.getFiles().find(file => file.getFileName() == paths[paths.length - 1]);
    }



    /**
     * Returns absolute path of folder. If folder is root, returns "/". If folder is not root, returns path in format /folder1/folder2/folder3, with ending slash. 
     * @returns current path, for example: "/folder1/folder2/folder3/ "or "/" 
     */
    public getAbsolutePath(): string {
        let path = "";
        let currentFolder = this.parent;
        while (currentFolder != null) {
            path = currentFolder.getName() + "/" + path;
            currentFolder = currentFolder.getParent();
        }

        if (path == "") {
            return "/";
        }

        return (path.charAt(0) == "/" ? path : "/" + path) + this.name + "/";
    }


    public moveFile(file: FileBase, oldFolder: Folder, newPath: string): void {
        let newFolder = this.getFolderByPath(newPath);
        if (!newFolder) {
            newFolder = this.prepareFileHierarchy(newPath);
        }


        oldFolder.files = oldFolder.files.filter(f => f != file);
        newFolder.addFile(file);
        file.setFolder(newFolder);

    }

    public getTotalSize(): number {
        let size = 0;
        this.files.forEach(file => {
            size += file.getSize();
        });
        this.folders.forEach(folder => {
            size += folder.getTotalSize();
        });
        return size;
    }


}


export class VirtualFS {
    private root: Folder;

    constructor() {
        this.root = Folder.createRoot();
    }

    public getRoot(): Folder {
        return this.root;
    }

}