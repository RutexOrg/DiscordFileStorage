import FolderTree from "./src/file/filesystem/FolderTree";
import Folder from "./src/file/filesystem/Folder";
import ServerFile from "./src/file/ServerFile";

async function main(){
    let fs = new FolderTree().getRoot();
    let a = new Folder("a");
    let b = new Folder("b", a);

    let b1 = new ServerFile("b.txt", 0, b, new Date());
    
    fs.addFolder(a);
    let f = fs.createHierarchy("/c");

    fs.moveFolder(a, f);
    
    fs.printHierarchyWithFiles(true);
}
main();