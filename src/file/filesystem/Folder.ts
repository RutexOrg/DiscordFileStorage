import ServerFile from "../ServerFile";
import colors from "colors/safe";

export interface ElementType {
    isFile?: boolean;
    isFolder?: boolean;
    isUnknown?: boolean;
    entry?: Folder | ServerFile; // undefined on isUnknown
}

export default class Folder {

    private name: string;
    private files: ServerFile[] = [];
    private folders: Folder[] = [];
    private parent: Folder | null = null;
    private isRoot;
    private static root: Folder;

    constructor(name: string, parent: Folder | null = null, isRoot: boolean = false) {
        if(!isRoot){
            if(name.includes("/") || name.includes("\\")) {
                throw new Error("Folder name cannot contain / or \\");
            }
            if(name == "" || name == "." || name == "..") {
                throw new Error("Folder name cannot be empty, . or ..");
            }
        }

        if(parent) {
            parent.addFolder(this);
        }

        if(isRoot) {
            Folder.root = this;
        }

        this.isRoot = isRoot;

        this.name = name;
        this.parent = parent;
    }

    public getName(): string {
        return this.name;
    }

    public getFiles(): ServerFile[] {
        return this.files;
    }


    public setFiles(files: ServerFile[]): void {
        this.files = files;
    }
    


    public getFolders(): Folder[] {
        return this.folders;
    }

    public getAllEntries(): string[] {
        let entries: string[] = [];
        this.folders.forEach(folder => entries.push(folder.getName()));
        this.files.forEach(file => entries.push(file.getFileName()));
        return entries;
    }

    public isRootFolder(): boolean {
        return this.isRoot;
    }

    public getParent(): Folder | null {
        return this.parent;
    }

    public setParent(parent: Folder | null): void {
        this.parent = parent;
    }

    public isSameNameExists(name: string): boolean {
        return this.folders.some(folder => folder.getName() == name) || this.files.some(file => file.getFileName() == name);
    }

    public getElementTypeByPath(path: string): ElementType {
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


    public addFile(file: ServerFile): void {
        if(!this.isSameNameExists(file.getFileName())) {
            this.files.push(file);
        }else {
            throw new Error("File with name "+file.getFileName()+" already exists");
        }
    }

    public addFolder(folder: Folder): Folder {
        if(!this.isSameNameExists(folder.getName())) {
            this.folders.push(folder);
        }else {
            throw new Error("Folder with name "+folder.getName()+" already exists");
        }
        if(folder.getParent() != this) {
            folder.setParent(this);
        }
        return folder;
    }

    public findFileByName(name: string, folder: Folder): ServerFile | undefined{
        let files = folder.getFiles();
        for(let i = 0; i < files.length; i++){
            if(files[i].getFileName() == name){
                return files[i];
            }
        }
        return undefined;
    }

    public findFolderByName(name: string, folder: Folder): Folder | undefined{
        let folders = folder.getFolders();
        for(let i = 0; i < folders.length; i++){
            if(folders[i].getName() == name){
                return folders[i];
            }
        }
        return undefined;
    }

    private removeFileFromFolder(file: ServerFile, folder: Folder): void {
        folder.files = folder.files.filter(f => f.getFileName() != file.getFileName());
    }

    public removeFileFromThisFolder(file: ServerFile): void {
        this.removeFileFromFolder(file, this);
    }
    
    public removeFile(file: ServerFile): void {
        console.log("Removing file "+file.getFileName()+" from folder "+this.getName() + " with path "+file.getAbsolutePath());
        file = Folder.root.getFileByPath(file.getAbsolutePath())!;
        if(!file){
            throw new Error("File not found");
        }
        file.getFolder().removeFileFromFolder(file, file.getFolder());

    }

    private removeFolderFromHierarchy(folder: Folder, from: Folder): void {
        folder.setParent(null);
        from.folders = from.folders.filter(f => f.name != folder.name);
    }
            
    public removeFolder(folder: Folder): void {
        if(folder.isRoot){
            throw new Error("Cannot remove root folder");
        }
        this.removeFolderFromHierarchy(folder, folder.parent!);
    }

    public removeFolderHierarchy(folder: Folder): void {
        if(folder) {
            this.removeFolder(folder);
        }else{
            throw new Error("Folder not found");
        }
    }

    public createHierarchy(path: string): Folder {
        if(!path.startsWith("/")){
            throw new Error("Path should start with /");
        }
        let paths = path.split("/");
        paths.shift();

        if(paths.length == 0) {
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

    // same as createHierarchy but creates last element as file
    public createFileHierarchy(path: string, filename: string): void {
        const folder = this.prepareFileHierarchy(path);
        if(folder.getFiles().find(file => file.getFileName() == filename)) {
            throw new Error("File with name "+filename+" already exists");
        }
        new ServerFile(filename, 0, folder);

        // this.createHierarchy(path);
        // let folder = this.getFolderByPath(path);
        // let parent = folder!.getParent()!;
        // this.removeFolder(folder!);
        // new ServerFile(filename, 0, parent);
    }

    // creates folder hierarchy and returns last folder.
    // example: /folder1/folder2/folder3/file.txt -> returns folder3
    public prepareFileHierarchy(path: string): Folder {
        let paths = path.split("/");
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


    public printHierarchyWithFiles(initial: boolean = false): void {
        if(initial) {
            console.log("Printing hierarchy :" + this.getAbsolutePath())
            console.log("-------------------");
        }
        console.log(colors.blue("[D] ") +this.getAbsolutePath());
        this.files.forEach(file => {
            console.log(colors.green("[F] ") +this.getAbsolutePath() + "/" + file.getFileName());
        });
        this.folders.forEach(folder => {
            folder.printHierarchyWithFiles();
        });
        if(initial){
            console.log("-------------------");
        }
    }
    
    

    public getFilesPaths(map: Map<string, ServerFile> = new Map()): Map<string, ServerFile> {
        this.files.forEach(file => {
            map.set(this.getAbsolutePath() + "/" + file.getFileName(), file);
        });
        this.folders.forEach(folder => {
            folder.getFilesPaths(map);
        });
        return map;
    }

    // accepts path in format /folder1/folder2/folder3
    // returns folder or undefined if not found
    public getFolderByPath(path: string): Folder | undefined {
        if(!path.startsWith("/")){
            throw new Error("Path should start with /");
        }
        
        let paths = path.split("/");
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

    public getFileByPath(path: string): ServerFile | undefined {
        if(!path.startsWith("/")){
            throw new Error("Path should start with /");
        }

        let paths = path.split("/");
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


    // returns path in format /folder1/folder2/folder3
    public getAbsolutePath(): string {
        let path = "";
        let currentFolder = this.parent;
        while (currentFolder != null) {
            path = currentFolder.getName() + "/" + path;
            currentFolder = currentFolder.getParent();
        }
        
        return (path.charAt(0) == "/" ? path : "/" + path) + this.name;
    }

    // returns array of folders in format ["folder1", "folder2", "folder3"]
    public getAbsolutePathArray(): string[] {
        let path: string[] = [];
        let currentFolder = this.parent;
        while (currentFolder != null) {
            path.push(currentFolder.getName());
            currentFolder = currentFolder.getParent();
        }
        return path.reverse();
    }

    public moveFolder(folder: Folder, toFolder: Folder): void {
        if(folder.isRoot){
            throw new Error("Cannot move root folder");
        }

        let prevFolderParent = folder.getParent();
        if(prevFolderParent){
            prevFolderParent.removeFolder(folder);
        }

        folder.parent = toFolder;
        toFolder.addFolder(folder);
    }

    public moveFile(file: ServerFile, oldFolder: Folder, newPath: string): void {
        let newFolder = this.getFolderByPath(newPath);
        if(!newFolder){
            newFolder = this.prepareFileHierarchy(newPath);
        }

        console.log(oldFolder.name);

        oldFolder.files = oldFolder.files.filter(f => f != file);
        newFolder.addFile(file);
        file.setFolder(newFolder);

        console.log("afterMove")
        console.log(oldFolder.getFiles())
    }

    

}